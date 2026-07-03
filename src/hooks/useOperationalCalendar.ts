import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import {
  DEFAULT_OPERATIONAL_WORKWEEK,
  businessDaysUntil,
  calculateSuggestedDeadline,
  normalizeDocumentSlaPolicy,
  normalizeOperationalCalendar,
  normalizeOperationalHoliday,
  type DocumentSlaPolicy,
  type OperationalCalendar,
  type OperationalCalendarSchemaStatus,
  type OperationalHoliday,
  type OperationalWorkweek,
  type SlaPolicyContext,
} from "@/lib/operationalCalendar";
import { supabase } from "@/lib/supabase";

export interface OperationalCalendarInput {
  name: string;
  timezone: string;
  workweek: OperationalWorkweek;
  defaultStartTime: string;
  defaultEndTime: string;
}

export interface OperationalHolidayInput {
  calendarId?: string | null;
  holidayDate: string;
  name: string;
  repeatsYearly?: boolean;
}

export interface DocumentSlaPolicyInput {
  id?: string | null;
  name: string;
  docType?: string | null;
  area?: string | null;
  projectId?: string | null;
  stepType?: string | null;
  calendarId?: string | null;
  reviewDueDays?: number | null;
  stepDueDays?: number | null;
  warningBeforeDays?: number;
  severity?: DocumentSlaPolicy["severity"];
  priority?: number;
  active?: boolean;
}

function classifyCalendarError(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = String(record.code ?? "").toUpperCase();
  const message = [record.message, record.details, record.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    code === "42P01" ||
    code === "PGRST205" ||
    ([
      "operational_calendars",
      "operational_holidays",
      "document_sla_policies",
    ].some((table) => message.includes(table)) &&
      (message.includes("does not exist") || message.includes("schema cache")))
  ) {
    return "not_installed" as const;
  }
  if (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "restricted" as const;
  }
  return "error" as const;
}

function statusMessage(status: OperationalCalendarSchemaStatus) {
  if (status === "not_installed") {
    return "Calendário operacional ainda não instalado. Os prazos continuam usando comparação simples de datas.";
  }
  if (status === "restricted") {
    return "O calendário operacional existe, mas a leitura foi bloqueada por organização ou permissão.";
  }
  if (status === "empty") {
    return "Ciclo 21 disponível, mas nenhum calendário foi configurado. O fallback considera segunda a sexta.";
  }
  if (status === "error") {
    return "Não foi possível carregar calendários e políticas de prazo.";
  }
  return null;
}

export function useOperationalCalendar(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const { profile } = useAuthContext();
  const [calendars, setCalendars] = useState<OperationalCalendar[]>([]);
  const [holidays, setHolidays] = useState<OperationalHoliday[]>([]);
  const [policies, setPolicies] = useState<DocumentSlaPolicy[]>([]);
  const [status, setStatus] = useState<OperationalCalendarSchemaStatus>(
    enabled ? "loading" : "empty",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canManage =
    profile?.role === "admin" || profile?.role === "manager";

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
    const calendarResult = await supabase
      .from("operational_calendars")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    if (calendarResult.error) {
      const nextStatus = classifyCalendarError(calendarResult.error);
      setCalendars([]);
      setHolidays([]);
      setPolicies([]);
      setStatus(nextStatus);
      setError(
        `${statusMessage(nextStatus)} ${getErrorMessage(calendarResult.error, "")}`.trim(),
      );
      return;
    }

    const [holidayResult, policyResult] = await Promise.all([
      supabase
        .from("operational_holidays")
        .select("*")
        .eq("org_id", profile.org_id)
        .order("holiday_date", { ascending: true }),
      supabase
        .from("document_sla_policies")
        .select("*")
        .eq("org_id", profile.org_id)
        .order("priority", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    const secondaryError = holidayResult.error ?? policyResult.error;
    if (secondaryError) {
      const nextStatus = classifyCalendarError(secondaryError);
      setCalendars(
        (calendarResult.data ?? [])
          .map(normalizeOperationalCalendar)
          .filter((item): item is OperationalCalendar => Boolean(item)),
      );
      setHolidays([]);
      setPolicies([]);
      setStatus(nextStatus);
      setError(
        `${statusMessage(nextStatus)} ${getErrorMessage(secondaryError, "")}`.trim(),
      );
      return;
    }

    const loadedCalendars = (calendarResult.data ?? [])
      .map(normalizeOperationalCalendar)
      .filter((item): item is OperationalCalendar => Boolean(item));
    setCalendars(loadedCalendars);
    setHolidays(
      (holidayResult.data ?? [])
        .map(normalizeOperationalHoliday)
        .filter((item): item is OperationalHoliday => Boolean(item)),
    );
    setPolicies(
      (policyResult.data ?? [])
        .map(normalizeDocumentSlaPolicy)
        .filter((item): item is DocumentSlaPolicy => Boolean(item)),
    );
    setStatus(loadedCalendars.length > 0 ? "ready" : "empty");
  }, [enabled, profile?.org_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const defaultCalendar = useMemo(
    () =>
      calendars.find((calendar) => calendar.is_default) ??
      calendars[0] ??
      null,
    [calendars],
  );

  const suggestDeadline = useCallback(
    (baseDate: string, context: SlaPolicyContext) =>
      calculateSuggestedDeadline({
        baseDate,
        context,
        calendars,
        holidays,
        policies,
      }),
    [calendars, holidays, policies],
  );

  const getBusinessDaysUntil = useCallback(
    (dueAt: string) =>
      businessDaysUntil(dueAt, defaultCalendar, holidays),
    [defaultCalendar, holidays],
  );

  const ensureManagePermission = useCallback(() => {
    if (!profile?.id || !profile.org_id) {
      setError("Seu perfil ou organização ainda não está disponível.");
      return false;
    }
    if (!canManage) {
      setError(
        "Apenas administradores e gestores podem configurar calendários e SLA.",
      );
      return false;
    }
    if (status === "not_installed") {
      setError(
        "Aplique o ciclo 21 antes de configurar calendários operacionais.",
      );
      return false;
    }
    return true;
  }, [canManage, profile?.id, profile?.org_id, status]);

  const saveDefaultCalendar = useCallback(
    async (input: OperationalCalendarInput) => {
      if (!ensureManagePermission() || !profile) return false;
      if (!input.name.trim()) {
        setError("Informe o nome do calendário.");
        return false;
      }
      if (
        !Object.values(input.workweek).some(Boolean) ||
        input.defaultEndTime <= input.defaultStartTime
      ) {
        setError(
          "Selecione ao menos um dia útil e confira os horários da jornada.",
        );
        return false;
      }

      setIsSaving(true);
      setError(null);
      const payload = {
        org_id: profile.org_id,
        name: input.name.trim(),
        timezone: input.timezone.trim() || "America/Sao_Paulo",
        workweek: input.workweek,
        default_start_time: input.defaultStartTime,
        default_end_time: input.defaultEndTime,
        is_default: true,
      };
      const result = defaultCalendar
        ? await supabase
            .from("operational_calendars")
            .update(payload)
            .eq("id", defaultCalendar.id)
            .eq("org_id", profile.org_id)
        : await supabase
            .from("operational_calendars")
            .insert({ ...payload, created_by: profile.id });
      setIsSaving(false);
      if (result.error) {
        setError(
          getErrorMessage(result.error, "Não foi possível salvar o calendário."),
        );
        return false;
      }
      await refresh();
      return true;
    },
    [defaultCalendar, ensureManagePermission, profile, refresh],
  );

  const addHoliday = useCallback(
    async (input: OperationalHolidayInput) => {
      if (!ensureManagePermission() || !profile) return false;
      if (!input.name.trim() || !input.holidayDate) {
        setError("Informe o nome e a data do feriado.");
        return false;
      }
      setIsSaving(true);
      setError(null);
      const { error: insertError } = await supabase
        .from("operational_holidays")
        .insert({
          org_id: profile.org_id,
          calendar_id: input.calendarId ?? defaultCalendar?.id ?? null,
          holiday_date: input.holidayDate,
          name: input.name.trim(),
          scope: input.calendarId || defaultCalendar ? "calendar" : "organization",
          repeats_yearly: input.repeatsYearly ?? false,
          created_by: profile.id,
        });
      setIsSaving(false);
      if (insertError) {
        setError(
          getErrorMessage(insertError, "Não foi possível cadastrar o feriado."),
        );
        return false;
      }
      await refresh();
      return true;
    },
    [defaultCalendar, ensureManagePermission, profile, refresh],
  );

  const deleteHoliday = useCallback(
    async (holidayId: string) => {
      if (!ensureManagePermission() || !profile) return false;
      setIsSaving(true);
      const { error: deleteError } = await supabase
        .from("operational_holidays")
        .delete()
        .eq("id", holidayId)
        .eq("org_id", profile.org_id);
      setIsSaving(false);
      if (deleteError) {
        setError(
          getErrorMessage(deleteError, "Não foi possível remover o feriado."),
        );
        return false;
      }
      await refresh();
      return true;
    },
    [ensureManagePermission, profile, refresh],
  );

  const savePolicy = useCallback(
    async (input: DocumentSlaPolicyInput) => {
      if (!ensureManagePermission() || !profile) return false;
      const reviewDays = input.reviewDueDays ?? null;
      const stepDays = input.stepDueDays ?? null;
      if (!input.name.trim()) {
        setError("Informe o nome da política.");
        return false;
      }
      if (
        (!reviewDays && !stepDays) ||
        (reviewDays !== null &&
          (!Number.isInteger(reviewDays) || reviewDays <= 0)) ||
        (stepDays !== null &&
          (!Number.isInteger(stepDays) || stepDays <= 0))
      ) {
        setError(
          "Informe ao menos um prazo positivo em dias úteis para revisão ou etapa.",
        );
        return false;
      }

      setIsSaving(true);
      setError(null);
      const payload = {
        org_id: profile.org_id,
        name: input.name.trim(),
        doc_type: input.docType?.trim().toUpperCase() || null,
        area: input.area?.trim().toUpperCase() || null,
        project_id: input.projectId || null,
        step_type: input.stepType?.trim().toLowerCase() || null,
        calendar_id: input.calendarId ?? defaultCalendar?.id ?? null,
        review_due_days: reviewDays,
        step_due_days: stepDays,
        warning_before_days: Math.max(0, input.warningBeforeDays ?? 3),
        severity: input.severity ?? "medium",
        priority: input.priority ?? 100,
        active: input.active ?? true,
      };
      const result = input.id
        ? await supabase
            .from("document_sla_policies")
            .update(payload)
            .eq("id", input.id)
            .eq("org_id", profile.org_id)
        : await supabase
            .from("document_sla_policies")
            .insert({ ...payload, created_by: profile.id });
      setIsSaving(false);
      if (result.error) {
        setError(
          getErrorMessage(result.error, "Não foi possível salvar a política SLA."),
        );
        return false;
      }
      await refresh();
      return true;
    },
    [defaultCalendar?.id, ensureManagePermission, profile, refresh],
  );

  const togglePolicy = useCallback(
    async (policyId: string, active: boolean) => {
      if (!ensureManagePermission() || !profile) return false;
      setIsSaving(true);
      const { error: updateError } = await supabase
        .from("document_sla_policies")
        .update({ active })
        .eq("id", policyId)
        .eq("org_id", profile.org_id);
      setIsSaving(false);
      if (updateError) {
        setError(
          getErrorMessage(updateError, "Não foi possível alterar a política."),
        );
        return false;
      }
      await refresh();
      return true;
    },
    [ensureManagePermission, profile, refresh],
  );

  return {
    calendars,
    holidays,
    policies,
    defaultCalendar,
    status,
    schemaMessage: statusMessage(status),
    error,
    isLoading: status === "loading",
    isSaving,
    canManage,
    canUseCalendar: status === "ready",
    fallbackWorkweek: DEFAULT_OPERATIONAL_WORKWEEK,
    refresh,
    suggestDeadline,
    getBusinessDaysUntil,
    saveDefaultCalendar,
    addHoliday,
    deleteHoliday,
    savePolicy,
    togglePolicy,
  };
}
