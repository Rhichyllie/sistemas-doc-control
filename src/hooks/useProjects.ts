import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";
import {
  normalizeProjectRecord,
  validateProjectInput,
  type ProjectInput,
  type ProjectOperationalContext,
} from "@/lib/projectOperationalContext";

export type ProjectSchemaMode =
  | "enterprise"
  | "legacy"
  | "missing"
  | "denied"
  | "error";

export interface ProjectResponsibleOption {
  id: string;
  name: string;
}

interface UseProjectsOptions {
  enabled?: boolean;
  includeInactive?: boolean;
  loadDocumentCounts?: boolean;
  loadPeople?: boolean;
}

const ENTERPRISE_COLUMNS = `
  id,
  org_id,
  code,
  name,
  description,
  client_name,
  contract_number,
  location,
  project_type,
  status,
  area,
  responsible_id,
  start_date,
  end_date,
  metadata,
  is_active,
  created_by,
  created_at,
  updated_at
`;

const LEGACY_COLUMNS =
  "id, code, name, client, start_date, end_date, status, created_by, created_at, updated_at";

function classifyProjectError(error: unknown) {
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
    (message.includes("projects") &&
      (message.includes("does not exist") || message.includes("schema cache")))
  ) {
    return "missing" as const;
  }
  if (code === "42703" || code === "PGRST204" || message.includes("column")) {
    return "legacy" as const;
  }
  if (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "denied" as const;
  }
  return "error" as const;
}

function schemaMessage(mode: ProjectSchemaMode) {
  if (mode === "legacy") {
    return "Catálogo legado ativo. Aplique o ciclo P-11A para habilitar contextos operacionais completos.";
  }
  if (mode === "missing") {
    return "Tabela projects indisponível. Aplique o schema base e o ciclo P-11A.";
  }
  if (mode === "denied") {
    return "A leitura de projetos foi bloqueada por política de acesso. Verifique organização, papel e RLS.";
  }
  if (mode === "error") {
    return "Não foi possível carregar o catálogo de projetos.";
  }
  return null;
}

export function useProjects(options: UseProjectsOptions = {}) {
  const {
    enabled = true,
    includeInactive = true,
    loadDocumentCounts = true,
    loadPeople = true,
  } = options;
  const { profile } = useAuthContext();
  const [projects, setProjects] = useState<ProjectOperationalContext[]>([]);
  const [users, setUsers] = useState<ProjectResponsibleOption[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMode, setSchemaMode] = useState<ProjectSchemaMode>("enterprise");

  const canManage = profile?.role === "admin" || profile?.role === "manager";

  const refresh = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    if (!profile?.id || !profile.org_id) {
      setProjects([]);
      setUsers([]);
      setError("Seu perfil ou organização ainda não está disponível.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const enterpriseResult = await supabase
      .from("projects")
      .select(ENTERPRISE_COLUMNS)
      .or(`org_id.eq.${profile.org_id},org_id.is.null`)
      .order("name", { ascending: true });

    let rows: unknown[] = [];
    let mode: ProjectSchemaMode = "enterprise";
    if (!enterpriseResult.error) {
      rows = enterpriseResult.data ?? [];
    } else if (classifyProjectError(enterpriseResult.error) === "legacy") {
      const legacyResult = await supabase
        .from("projects")
        .select(LEGACY_COLUMNS)
        .order("name", { ascending: true });
      if (legacyResult.error) {
        mode = classifyProjectError(legacyResult.error);
        setError(
          `${schemaMessage(mode)} ${getErrorMessage(legacyResult.error, "Erro de leitura.")}`,
        );
      } else {
        rows = legacyResult.data ?? [];
        mode = "legacy";
      }
    } else {
      mode = classifyProjectError(enterpriseResult.error);
      setError(
        `${schemaMessage(mode)} ${getErrorMessage(enterpriseResult.error, "Erro de leitura.")}`,
      );
    }

    const projectIds = rows
      .map((row) =>
        row && typeof row === "object"
          ? String((row as Record<string, unknown>).id ?? "")
          : "",
      )
      .filter(Boolean);
    const counts = new Map<string, number>();
    if (loadDocumentCounts && projectIds.length > 0) {
      const countResult = await supabase
        .from("documents")
        .select("project_id")
        .in("project_id", projectIds);
      if (!countResult.error) {
        for (const item of countResult.data ?? []) {
          if (!item.project_id) continue;
          counts.set(item.project_id, (counts.get(item.project_id) ?? 0) + 1);
        }
      }
    }

    const loadedProjects = rows
      .map((row) => {
        const id =
          row && typeof row === "object"
            ? String((row as Record<string, unknown>).id ?? "")
            : "";
        return normalizeProjectRecord(row, counts.get(id) ?? 0);
      })
      .filter((project): project is ProjectOperationalContext =>
        Boolean(project),
      )
      .filter((project) => includeInactive || project.is_active);
    setSchemaMode(mode);

    let loadedUsers: ProjectResponsibleOption[] = [];
    if (loadPeople && mode === "enterprise") {
      const peopleResult = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("org_id", profile.org_id)
        .eq("active", true)
        .order("full_name", { ascending: true });
      if (!peopleResult.error) {
        loadedUsers = (peopleResult.data ?? []).map((person) => ({
          id: String(person.id),
          name: String(person.full_name ?? "Usuário"),
        }));
      }
    }
    setUsers(loadedUsers);
    const responsibleNames = new Map(
      loadedUsers.map((user) => [user.id, user.name]),
    );
    setProjects(
      loadedProjects.map((project) => ({
        ...project,
        responsible_name: project.responsible_id
          ? (responsibleNames.get(project.responsible_id) ??
            project.responsible_name)
          : null,
      })),
    );

    setIsLoading(false);
  }, [
    enabled,
    includeInactive,
    loadDocumentCounts,
    loadPeople,
    profile?.id,
    profile?.org_id,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveProject = useCallback(
    async (id: string | null, input: ProjectInput) => {
      if (!profile?.id || !profile.org_id) {
        setError("Seu perfil ou organização ainda não está disponível.");
        return false;
      }
      if (!canManage) {
        setError("Apenas administradores e gestores podem alterar projetos.");
        return false;
      }
      if (schemaMode !== "enterprise") {
        setError(
          "O ciclo P-11A precisa estar aplicado para criar ou editar contextos operacionais.",
        );
        return false;
      }

      const validation = validateProjectInput(input);
      if (!validation.isValid) {
        setError(validation.errors[0]);
        return false;
      }

      setIsSaving(true);
      setError(null);
      const status = input.status ?? "active";
      const payload = {
        org_id: profile.org_id,
        code: validation.normalizedCode,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        client_name: input.client_name?.trim() || null,
        contract_number: input.contract_number?.trim() || null,
        location: input.location?.trim() || null,
        project_type: input.project_type ?? "project",
        status,
        area: input.area?.trim().toUpperCase() || null,
        responsible_id: input.responsible_id || null,
        start_date: input.start_date || null,
        end_date: input.end_date || null,
        metadata: input.metadata ?? {},
        is_active: ["closed", "cancelled", "archived"].includes(status)
          ? false
          : (input.is_active ?? true),
      };
      const result = id
        ? await supabase
            .from("projects")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", id)
            .or(`org_id.eq.${profile.org_id},org_id.is.null`)
            .select("id")
            .maybeSingle()
        : await supabase
            .from("projects")
            .insert({ ...payload, created_by: profile.id })
            .select("id")
            .single();
      setIsSaving(false);

      if (result.error) {
        const classification = classifyProjectError(result.error);
        setError(
          classification === "legacy"
            ? "O ciclo P-11A não está completo neste ambiente."
            : `Não foi possível salvar o projeto. ${getErrorMessage(result.error, "Erro de persistência.")}`,
        );
        return false;
      }
      if (!result.data?.id) {
        setError(
          "O banco não confirmou a gravação. Verifique organização e policies.",
        );
        return false;
      }
      await refresh();
      return true;
    },
    [canManage, profile?.id, profile?.org_id, refresh, schemaMode],
  );

  const updateOperationalState = useCallback(
    async (
      project: ProjectOperationalContext,
      values: Pick<ProjectInput, "status" | "is_active">,
    ) =>
      saveProject(project.id, {
        ...project,
        code: project.has_explicit_code ? project.code : null,
        ...values,
      }),
    [saveProject],
  );

  const compatibilityMessage = schemaMessage(schemaMode);
  const diagnostic = useMemo(() => {
    if (isLoading) return "loading" as const;
    if (schemaMode === "missing") return "not_installed" as const;
    if (schemaMode === "denied") return "denied" as const;
    if (schemaMode === "error") return "error" as const;
    if (projects.length === 0) return "empty" as const;
    if (schemaMode === "legacy") return "legacy" as const;
    return "ready" as const;
  }, [isLoading, projects.length, schemaMode]);

  return {
    projects,
    users,
    isLoading,
    isSaving,
    error,
    schemaMode,
    diagnostic,
    compatibilityMessage,
    canManage,
    canUseEnterpriseProjects: schemaMode === "enterprise",
    refresh,
    createProject: (input: ProjectInput) => saveProject(null, input),
    updateProject: (id: string, input: ProjectInput) => saveProject(id, input),
    setProjectActive: (project: ProjectOperationalContext, isActive: boolean) =>
      updateOperationalState(project, {
        is_active: isActive,
        status: isActive ? "active" : "paused",
      }),
    archiveProject: (project: ProjectOperationalContext) =>
      updateOperationalState(project, {
        is_active: false,
        status: "archived",
      }),
    closeProject: (project: ProjectOperationalContext) =>
      updateOperationalState(project, {
        is_active: false,
        status: "closed",
      }),
    clearError: () => setError(null),
  };
}
