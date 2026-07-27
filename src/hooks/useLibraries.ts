import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";

export type LibraryPhaseCode = "project" | "om";

export interface EnterpriseRecord {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
}

export interface PhaseTemplateRecord {
  id: string;
  code: LibraryPhaseCode;
  display_name: string;
  reference_standard: string;
  workflow_definition: Record<string, unknown>;
}

export interface LibraryRecord {
  id: string;
  org_id: string;
  enterprise_id: string;
  phase_template_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  enterprise: EnterpriseRecord | null;
  phase_template: PhaseTemplateRecord | null;
}

interface ProvisionLibraryInput {
  enterpriseId: string;
  phaseCode: LibraryPhaseCode;
  name: string;
}

function normalizeEnterprise(value: unknown): EnterpriseRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }
  return {
    id: record.id,
    org_id: String(record.org_id ?? ""),
    name: record.name,
    created_at: String(record.created_at ?? ""),
  };
}

function normalizePhaseTemplate(value: unknown): PhaseTemplateRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    (record.code !== "project" && record.code !== "om")
  ) {
    return null;
  }
  return {
    id: record.id,
    code: record.code,
    display_name: String(record.display_name ?? record.code),
    reference_standard: String(record.reference_standard ?? ""),
    workflow_definition:
      record.workflow_definition &&
      typeof record.workflow_definition === "object" &&
      !Array.isArray(record.workflow_definition)
        ? (record.workflow_definition as Record<string, unknown>)
        : {},
  };
}

function normalizeLibrary(value: unknown): LibraryRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.enterprise_id !== "string" ||
    typeof record.phase_template_id !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    org_id: String(record.org_id ?? ""),
    enterprise_id: record.enterprise_id,
    phase_template_id: record.phase_template_id,
    name: String(record.name ?? "Biblioteca"),
    created_by:
      typeof record.created_by === "string" ? record.created_by : null,
    created_at: String(record.created_at ?? ""),
    enterprise: normalizeEnterprise(record.enterprise),
    phase_template: normalizePhaseTemplate(record.phase_template),
  };
}

export function useLibraries(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const { profile } = useAuthContext();
  const [libraries, setLibraries] = useState<LibraryRecord[]>([]);
  const [enterprises, setEnterprises] = useState<EnterpriseRecord[]>([]);
  const [phaseTemplates, setPhaseTemplates] = useState<PhaseTemplateRecord[]>(
    [],
  );
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!profile?.org_id) {
      setLibraries([]);
      setEnterprises([]);
      setPhaseTemplates([]);
      setLoading(false);
      setError("Seu perfil não possui organização associada.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [librariesResult, enterprisesResult, phaseTemplatesResult] =
        await Promise.all([
          supabase
            .from("libraries")
            .select(
              `
                id,
                org_id,
                enterprise_id,
                phase_template_id,
                name,
                created_by,
                created_at,
                enterprise:enterprises (id, org_id, name, created_at),
                phase_template:phase_templates (
                  id,
                  code,
                  display_name,
                  reference_standard,
                  workflow_definition
                )
              `,
            )
            .eq("org_id", profile.org_id)
            .order("created_at", { ascending: true }),
          supabase
            .from("enterprises")
            .select("id, org_id, name, created_at")
            .eq("org_id", profile.org_id)
            .order("name", { ascending: true }),
          supabase
            .from("phase_templates")
            .select(
              "id, code, display_name, reference_standard, workflow_definition",
            )
            .order("display_name", { ascending: true }),
        ]);

      if (librariesResult.error) throw librariesResult.error;
      if (enterprisesResult.error) throw enterprisesResult.error;
      if (phaseTemplatesResult.error) throw phaseTemplatesResult.error;

      setLibraries(
        (librariesResult.data ?? [])
          .map(normalizeLibrary)
          .filter((value): value is LibraryRecord => Boolean(value)),
      );
      setEnterprises(
        (enterprisesResult.data ?? [])
          .map(normalizeEnterprise)
          .filter((value): value is EnterpriseRecord => Boolean(value)),
      );
      setPhaseTemplates(
        (phaseTemplatesResult.data ?? [])
          .map(normalizePhaseTemplate)
          .filter((value): value is PhaseTemplateRecord => Boolean(value)),
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar as bibliotecas."));
    } finally {
      setLoading(false);
    }
  }, [enabled, profile?.org_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groupedByEnterprise = useMemo(() => {
    return enterprises.map((enterprise) => ({
      enterprise,
      libraries: libraries.filter(
        (library) => library.enterprise_id === enterprise.id,
      ),
    }));
  }, [enterprises, libraries]);

  async function createEnterprise(name: string) {
    if (!profile?.org_id) return null;
    setSaving(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from("enterprises")
        .insert({
          org_id: profile.org_id,
          name: name.trim(),
        })
        .select("id, org_id, name, created_at")
        .single();
      if (insertError) throw insertError;
      const enterprise = normalizeEnterprise(data);
      await refresh();
      return enterprise;
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, "Não foi possível criar o empreendimento."),
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function provisionLibrary(input: ProvisionLibraryInput) {
    if (!profile?.org_id) return null;
    setSaving(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("provision_library", {
        p_enterprise_id: input.enterpriseId,
        p_phase_code: input.phaseCode,
        p_library_name: input.name.trim(),
      });
      if (rpcError) throw rpcError;
      await refresh();
      return typeof data === "string" ? data : String(data ?? "");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível criar a biblioteca."));
      return null;
    } finally {
      setSaving(false);
    }
  }

  return {
    libraries,
    enterprises,
    phaseTemplates,
    groupedByEnterprise,
    loading,
    saving,
    error,
    refresh,
    createEnterprise,
    provisionLibrary,
  };
}
