import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";
import {
  isAbsenceActive,
  normalizeTeamAbsence,
  normalizeTeamDelegationRule,
  resolveTeamAvailability,
  type TeamAbsence,
  type TeamAbsenceType,
  type TeamAvailabilityContext,
  type TeamAvailabilitySchemaStatus,
  type TeamDelegationRule,
  type TeamDelegationScope,
} from "@/lib/teamAvailability";

export interface TeamAbsenceInput {
  userId: string;
  absenceType: TeamAbsenceType;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
  substituteUserId?: string | null;
}

export interface TeamDelegationInput {
  ownerUserId: string;
  substituteUserId: string;
  scope: TeamDelegationScope;
  projectId?: string | null;
  docType?: string | null;
  area?: string | null;
  stepType?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  priority?: number;
}

function classifyAvailabilityError(error: unknown) {
  const row =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = String(row.code ?? "").toUpperCase();
  const message = [row.message, row.details, row.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (
    ["42P01", "PGRST205"].includes(code) ||
    (["team_absences", "team_delegation_rules"].some((table) =>
      message.includes(table),
    ) &&
      (message.includes("does not exist") || message.includes("schema cache")))
  ) {
    return "not_installed" as const;
  }
  if (
    ["42501", "PGRST301"].includes(code) ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "restricted" as const;
  }
  return "error" as const;
}

export function useTeamAvailability(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const { profile } = useAuthContext();
  const [absences, setAbsences] = useState<TeamAbsence[]>([]);
  const [delegations, setDelegations] = useState<TeamDelegationRule[]>([]);
  const [status, setStatus] = useState<TeamAvailabilitySchemaStatus>(
    enabled ? "loading" : "empty",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canManage = profile?.role === "admin" || profile?.role === "manager";

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus("empty");
      return;
    }
    if (!profile?.org_id) {
      setStatus("restricted");
      setError("Seu perfil não possui organização válida.");
      return;
    }
    setStatus("loading");
    setError(null);
    const [absenceResult, delegationResult] = await Promise.all([
      supabase
        .from("team_absences")
        .select("*")
        .eq("org_id", profile.org_id)
        .order("starts_at", { ascending: true }),
      supabase
        .from("team_delegation_rules")
        .select("*")
        .eq("org_id", profile.org_id)
        .order("priority", { ascending: true }),
    ]);
    const queryError = absenceResult.error ?? delegationResult.error;
    if (queryError) {
      const nextStatus = classifyAvailabilityError(queryError);
      setAbsences([]);
      setDelegations([]);
      setStatus(nextStatus);
      setError(
        nextStatus === "not_installed"
          ? "Ciclo 22 ainda não instalado. Ausências e substituições estão indisponíveis."
          : getErrorMessage(
              queryError,
              "Não foi possível carregar ausências e substituições.",
            ),
      );
      return;
    }
    const loadedAbsences = (absenceResult.data ?? [])
      .map(normalizeTeamAbsence)
      .filter((item): item is TeamAbsence => Boolean(item));
    const loadedDelegations = (delegationResult.data ?? [])
      .map(normalizeTeamDelegationRule)
      .filter((item): item is TeamDelegationRule => Boolean(item));
    setAbsences(loadedAbsences);
    setDelegations(loadedDelegations);
    setStatus(
      loadedAbsences.length || loadedDelegations.length ? "ready" : "empty",
    );
  }, [enabled, profile?.org_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getAvailability = useCallback(
    (userId: string, context?: TeamAvailabilityContext, at?: Date) =>
      resolveTeamAvailability({
        userId,
        absences,
        delegations,
        context,
        at,
      }),
    [absences, delegations],
  );

  const saveAbsence = useCallback(
    async (input: TeamAbsenceInput) => {
      if (!profile?.id || !profile.org_id) return false;
      if (!canManage && input.userId !== profile.id) {
        setError("Você só pode cadastrar a própria ausência.");
        return false;
      }
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);
      if (
        !input.userId ||
        Number.isNaN(startsAt.getTime()) ||
        Number.isNaN(endsAt.getTime()) ||
        endsAt <= startsAt
      ) {
        setError("Informe pessoa, início e fim válidos para a ausência.");
        return false;
      }
      if (!canManage && startsAt <= new Date()) {
        setError(
          "Sua própria ausência precisa ser cadastrada antes do início. Procure um administrador para registrar uma ausência já iniciada.",
        );
        return false;
      }
      if (input.substituteUserId === input.userId) {
        setError("Titular e substituto precisam ser pessoas diferentes.");
        return false;
      }
      setIsSaving(true);
      setError(null);
      const { error: insertError } = await supabase
        .from("team_absences")
        .insert({
          org_id: profile.org_id,
          user_id: input.userId,
          absence_type: input.absenceType,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: canManage && startsAt <= new Date() ? "active" : "scheduled",
          reason: input.reason?.trim() || null,
          substitute_user_id: input.substituteUserId || null,
          metadata: { source: "team_availability_ui" },
          created_by: profile.id,
        });
      setIsSaving(false);
      if (insertError) {
        setError(
          getErrorMessage(insertError, "Não foi possível salvar a ausência."),
        );
        return false;
      }
      await refresh();
      return true;
    },
    [canManage, profile, refresh],
  );

  const saveDelegation = useCallback(
    async (input: TeamDelegationInput) => {
      if (!profile?.id || !profile.org_id) return false;
      if (!canManage && input.ownerUserId !== profile.id) {
        setError("Você só pode cadastrar a própria regra de substituição.");
        return false;
      }
      if (
        !input.ownerUserId ||
        !input.substituteUserId ||
        input.ownerUserId === input.substituteUserId
      ) {
        setError("Informe titular e substituto diferentes.");
        return false;
      }
      if (
        (input.scope === "project" && !input.projectId) ||
        (input.scope === "document_type" && !input.docType?.trim()) ||
        (input.scope === "area" && !input.area?.trim()) ||
        (input.scope === "step_type" && !input.stepType?.trim())
      ) {
        setError("Informe o contexto correspondente ao escopo da delegação.");
        return false;
      }
      const priority = input.priority ?? 100;
      if (!Number.isInteger(priority) || priority < 0) {
        setError("A prioridade deve ser um inteiro igual ou maior que zero.");
        return false;
      }
      if (
        input.startsAt &&
        input.endsAt &&
        new Date(input.endsAt) <= new Date(input.startsAt)
      ) {
        setError("O fim da delegação precisa ser posterior ao início.");
        return false;
      }
      setIsSaving(true);
      setError(null);
      const { error: insertError } = await supabase
        .from("team_delegation_rules")
        .insert({
          org_id: profile.org_id,
          owner_user_id: input.ownerUserId,
          substitute_user_id: input.substituteUserId,
          scope: input.scope,
          project_id:
            input.scope === "project" ? input.projectId || null : null,
          doc_type:
            input.scope === "document_type"
              ? input.docType?.toUpperCase() || null
              : null,
          area:
            input.scope === "area" ? input.area?.toUpperCase() || null : null,
          step_type:
            input.scope === "step_type"
              ? input.stepType?.toLowerCase() || null
              : null,
          starts_at: input.startsAt
            ? new Date(input.startsAt).toISOString()
            : null,
          ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
          priority,
          active: true,
          metadata: { source: "team_availability_ui" },
          created_by: profile.id,
        });
      setIsSaving(false);
      if (insertError) {
        setError(
          getErrorMessage(
            insertError,
            "Não foi possível salvar a regra de substituição.",
          ),
        );
        return false;
      }
      await refresh();
      return true;
    },
    [canManage, profile, refresh],
  );

  const cancelAbsence = useCallback(
    async (absenceId: string) => {
      if (!profile?.id || !profile.org_id) return false;
      setIsSaving(true);
      const { error: updateError } = await supabase
        .from("team_absences")
        .update({ status: "cancelled" })
        .eq("id", absenceId)
        .eq("org_id", profile.org_id)
        .match(canManage ? {} : { user_id: profile.id });
      setIsSaving(false);
      if (updateError) {
        setError(
          getErrorMessage(updateError, "Não foi possível cancelar a ausência."),
        );
        return false;
      }
      await refresh();
      return true;
    },
    [canManage, profile, refresh],
  );

  const toggleDelegation = useCallback(
    async (delegationId: string, active: boolean) => {
      if (!profile?.id || !profile.org_id) return false;
      setIsSaving(true);
      const { error: updateError } = await supabase
        .from("team_delegation_rules")
        .update({ active })
        .eq("id", delegationId)
        .eq("org_id", profile.org_id)
        .match(canManage ? {} : { owner_user_id: profile.id });
      setIsSaving(false);
      if (updateError) {
        setError(
          getErrorMessage(updateError, "Não foi possível alterar a delegação."),
        );
        return false;
      }
      await refresh();
      return true;
    },
    [canManage, profile, refresh],
  );

  const now = new Date();
  const activeAbsences = useMemo(
    () => absences.filter((absence) => isAbsenceActive(absence, now)),
    [absences],
  );
  const upcomingAbsences = useMemo(
    () =>
      absences.filter(
        (absence) =>
          absence.status === "scheduled" &&
          new Date(absence.starts_at).getTime() > now.getTime(),
      ),
    [absences],
  );
  const activeDelegations = useMemo(
    () =>
      delegations.filter(
        (rule) =>
          rule.active &&
          (!rule.starts_at || new Date(rule.starts_at) <= now) &&
          (!rule.ends_at || new Date(rule.ends_at) > now),
      ),
    [delegations],
  );
  const absencesWithoutSubstitute = useMemo(
    () =>
      activeAbsences.filter(
        (absence) => !getAvailability(absence.user_id).substituteUserId,
      ),
    [activeAbsences, getAvailability],
  );
  const activeSubstitutionCount = useMemo(() => {
    const keys = new Set(
      activeDelegations.map(
        (rule) => `${rule.owner_user_id}:${rule.substitute_user_id}`,
      ),
    );
    activeAbsences.forEach((absence) => {
      const substituteUserId = getAvailability(
        absence.user_id,
      ).substituteUserId;
      if (substituteUserId) {
        keys.add(`${absence.user_id}:${substituteUserId}`);
      }
    });
    return keys.size;
  }, [activeAbsences, activeDelegations, getAvailability]);

  return {
    status,
    error,
    isLoading: status === "loading",
    isSaving,
    canManage,
    canUseAvailability: ["ready", "empty"].includes(status),
    absences,
    delegations,
    activeAbsences,
    upcomingAbsences,
    activeDelegations,
    activeSubstitutionCount,
    absencesWithoutSubstitute,
    getAvailability,
    refresh,
    saveAbsence,
    saveDelegation,
    cancelAbsence,
    toggleDelegation,
  };
}
