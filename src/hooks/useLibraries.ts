import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import type { ProjectOperationalContext } from "@/lib/projectOperationalContext";
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
  active: boolean;
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

interface UpdateLibraryInput {
  name?: string;
  code?: string;
  active?: boolean;
}

const LOCAL_ENTERPRISES_STORAGE_PREFIX = "tramita.enterprises.local.";
const LOCAL_LIBRARIES_STORAGE_PREFIX = "tramita.libraries.local.";
const LOCAL_PROJECTS_STORAGE_PREFIX = "tramita.projects.local.";

const DEFAULT_PHASE_TEMPLATES: PhaseTemplateRecord[] = [
  {
    id: "template-project",
    code: "project",
    display_name: "Projeto",
    reference_standard: "ISO 19650-1/2",
    workflow_definition: {
      lifecycle: "linear",
      statuses: ["elaboracao", "verificacao", "aprovacao", "emissao"],
    },
  },
  {
    id: "template-om",
    code: "om",
    display_name: "Operacao / O&M",
    reference_standard: "ISO 19650-3 / ISO 55000",
    workflow_definition: {
      lifecycle: "cyclical",
      statuses: ["ativo", "revisao", "ativo"],
    },
  },
];

function isMissingCatalogContract(error: unknown, contracts: string[]) {
  const message = getErrorMessage(error, "").toLowerCase();
  if (!message) return false;

  const indicatesMissingContract =
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("could not find the function");

  return (
    indicatesMissingContract &&
    contracts.some((contract) => message.includes(contract.toLowerCase()))
  );
}

function normalizeEnterprise(value: unknown): EnterpriseRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name =
    typeof record.name === "string"
      ? record.name
      : typeof record.nome === "string"
        ? record.nome
        : null;
  if (typeof record.id !== "string" || !name) {
    return null;
  }
  return {
    id: record.id,
    org_id: String(record.org_id ?? record.organizacao_id ?? ""),
    name,
    created_at: String(record.created_at ?? record.criado_em ?? ""),
  };
}

function normalizePhaseTemplate(value: unknown): PhaseTemplateRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const code = record.code ?? record.codigo;
  if (typeof record.id !== "string" || (code !== "project" && code !== "om")) {
    return null;
  }
  const workflowDefinition =
    record.workflow_definition ?? record.definicao_workflow;
  return {
    id: record.id,
    code,
    display_name: String(record.display_name ?? record.nome_exibicao ?? code),
    reference_standard: String(
      record.reference_standard ?? record.norma_referencia ?? "",
    ),
    workflow_definition:
      workflowDefinition &&
      typeof workflowDefinition === "object" &&
      !Array.isArray(workflowDefinition)
        ? (workflowDefinition as Record<string, unknown>)
        : {},
  };
}

function normalizeLibrary(value: unknown): LibraryRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const enterpriseId = record.enterprise_id ?? record.empreendimento_id;
  const phaseTemplateId = record.phase_template_id ?? record.fase_template_id;
  if (
    typeof record.id !== "string" ||
    typeof enterpriseId !== "string" ||
    typeof phaseTemplateId !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    org_id: String(record.org_id ?? record.organizacao_id ?? ""),
    enterprise_id: enterpriseId,
    phase_template_id: phaseTemplateId,
    name: String(record.name ?? record.nome ?? "Biblioteca"),
    active:
      typeof (record.active ?? record.ativo) === "boolean"
        ? Boolean(record.active ?? record.ativo)
        : true,
    created_by:
      typeof (record.created_by ?? record.criado_por) === "string"
        ? String(record.created_by ?? record.criado_por)
        : null,
    created_at: String(record.created_at ?? record.criado_em ?? ""),
    enterprise: normalizeEnterprise(record.enterprise ?? record.empreendimento),
    phase_template: normalizePhaseTemplate(
      record.phase_template ?? record.fase_template,
    ),
  };
}

function getLocalEnterprisesStorageKey(orgId: string) {
  return `${LOCAL_ENTERPRISES_STORAGE_PREFIX}${orgId}`;
}

function getLocalLibrariesStorageKey(orgId: string) {
  return `${LOCAL_LIBRARIES_STORAGE_PREFIX}${orgId}`;
}

function getLocalProjectsStorageKey(orgId: string) {
  return `${LOCAL_PROJECTS_STORAGE_PREFIX}${orgId}`;
}

function loadLocalEnterprises(orgId: string) {
  if (typeof window === "undefined") return [] as EnterpriseRecord[];
  try {
    const raw = window.localStorage.getItem(
      getLocalEnterprisesStorageKey(orgId),
    );
    if (!raw) return [] as EnterpriseRecord[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is EnterpriseRecord =>
          Boolean(normalizeEnterprise(item)),
        )
      : [];
  } catch {
    return [] as EnterpriseRecord[];
  }
}

function saveLocalEnterprises(orgId: string, items: EnterpriseRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getLocalEnterprisesStorageKey(orgId),
    JSON.stringify(items),
  );
}

function loadLocalLibraries(orgId: string) {
  if (typeof window === "undefined") return [] as LibraryRecord[];
  try {
    const raw = window.localStorage.getItem(getLocalLibrariesStorageKey(orgId));
    if (!raw) return [] as LibraryRecord[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is LibraryRecord =>
          Boolean(normalizeLibrary(item)),
        )
      : [];
  } catch {
    return [] as LibraryRecord[];
  }
}

function saveLocalLibraries(orgId: string, items: LibraryRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getLocalLibrariesStorageKey(orgId),
    JSON.stringify(items),
  );
}

function clearLocalLibraries(orgId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getLocalLibrariesStorageKey(orgId));
}

function loadLocalProjects(orgId: string) {
  if (typeof window === "undefined") return [] as ProjectOperationalContext[];
  try {
    const raw = window.localStorage.getItem(getLocalProjectsStorageKey(orgId));
    if (!raw) return [] as ProjectOperationalContext[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is ProjectOperationalContext =>
          Boolean(item && typeof item === "object" && "id" in item),
        )
      : [];
  } catch {
    return [] as ProjectOperationalContext[];
  }
}

function saveLocalProjects(orgId: string, items: ProjectOperationalContext[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getLocalProjectsStorageKey(orgId),
    JSON.stringify(items),
  );
}

function clearLocalEnterprises(orgId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getLocalEnterprisesStorageKey(orgId));
}

function resolveLocalPhaseCode(library: LibraryRecord): LibraryPhaseCode {
  if (library.phase_template?.code === "om") return "om";
  if (library.phase_template_id.toLowerCase().includes("om")) return "om";
  return "project";
}

function classifyProjectContract(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  if (!message) return "error" as const;
  if (
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    (message.includes("projects") && message.includes("does not exist"))
  ) {
    return "missing" as const;
  }
  if (
    message.includes("library_id") ||
    message.includes("project_type") ||
    message.includes("client_name") ||
    message.includes("contract_number") ||
    message.includes("responsible_id") ||
    message.includes("metadata")
  ) {
    return "legacy" as const;
  }
  return "error" as const;
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

  const syncLocalCatalogToRemote = useCallback(
    async (templates: PhaseTemplateRecord[]) => {
      if (!profile?.org_id) return false;
      if (profile.role !== "admin" && profile.role !== "manager") return false;

      const localEnterprises = loadLocalEnterprises(profile.org_id);
      const localLibraries = loadLocalLibraries(profile.org_id);

      if (localEnterprises.length === 0 && localLibraries.length === 0) {
        return false;
      }

      const templateByCode = new Map(
        templates.map((template) => [template.code, template.id]),
      );

      if (localEnterprises.length > 0) {
        const enterpriseRows = localEnterprises.map((enterprise) => ({
          id: enterprise.id,
          org_id: profile.org_id,
          name: enterprise.name.trim(),
          created_by: profile.id ?? null,
          created_at: enterprise.created_at || new Date().toISOString(),
          updated_at: enterprise.created_at || new Date().toISOString(),
        }));

        const { error: enterprisesError } = await supabase
          .from("enterprises")
          .upsert(enterpriseRows, { onConflict: "id" });

        if (enterprisesError) {
          throw enterprisesError;
        }
      }

      if (localLibraries.length > 0) {
        const libraryRows = localLibraries.map((library) => ({
          id: library.id,
          org_id: profile.org_id,
          enterprise_id: library.enterprise_id,
          phase_template_id:
            templateByCode.get(resolveLocalPhaseCode(library)) ??
            templates[0]?.id,
          name: library.name.trim(),
          created_by: profile.id ?? null,
          created_at: library.created_at || new Date().toISOString(),
          updated_at: library.created_at || new Date().toISOString(),
        }));

        const validLibraryRows = libraryRows.filter((library) =>
          Boolean(library.enterprise_id && library.phase_template_id),
        );

        if (validLibraryRows.length > 0) {
          const { error: librariesError } = await supabase
            .from("libraries")
            .upsert(validLibraryRows, { onConflict: "id" });

          if (librariesError) {
            throw librariesError;
          }
        }
      }

      clearLocalEnterprises(profile.org_id);
      clearLocalLibraries(profile.org_id);
      return true;
    },
    [profile?.id, profile?.org_id, profile?.role],
  );

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
      let librariesData: unknown[] = [];
      let enterprisesData: unknown[] = [];
      let phaseTemplatesData: unknown[] = DEFAULT_PHASE_TEMPLATES;
      let usingLocalCatalogFallback = false;

      const phaseTemplatesResult = await supabase
        .from("phase_templates")
        .select(
          "id, code, display_name, reference_standard, workflow_definition",
        )
        .order("display_name", { ascending: true });

      if (!phaseTemplatesResult.error) {
        phaseTemplatesData = phaseTemplatesResult.data ?? [];
      } else if (
        isMissingCatalogContract(phaseTemplatesResult.error, [
          "phase_templates",
        ])
      ) {
        const fallbackPhaseTemplatesResult = await supabase
          .from("fase_templates")
          .select(
            "id, codigo, nome_exibicao, norma_referencia, definicao_workflow",
          )
          .order("nome_exibicao", { ascending: true });

        if (!fallbackPhaseTemplatesResult.error) {
          phaseTemplatesData = fallbackPhaseTemplatesResult.data ?? [];
        } else if (
          !isMissingCatalogContract(fallbackPhaseTemplatesResult.error, [
            "fase_templates",
          ])
        ) {
          throw fallbackPhaseTemplatesResult.error;
        }
      } else {
        throw phaseTemplatesResult.error;
      }

      const [librariesResult, enterprisesResult] = await Promise.all([
        supabase
          .from("libraries")
          .select(
            `
              id,
              org_id,
              enterprise_id,
              phase_template_id,
              name,
              active,
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
      ]);

      if (librariesResult.error || enterprisesResult.error) {
        const englishError = librariesResult.error ?? enterprisesResult.error;

        if (
          !isMissingCatalogContract(englishError, ["libraries", "enterprises"])
        ) {
          throw englishError;
        }

        const [bibliotecasResult, empreendimentosResult] = await Promise.all([
          supabase
            .from("bibliotecas")
            .select(
              `
                  id,
                  organizacao_id,
                  empreendimento_id,
                  fase_template_id,
                  nome,
                  ativo,
                  criado_por,
                  criado_em,
                  empreendimento:empreendimentos (
                    id,
                    organizacao_id,
                    nome,
                    criado_em
                  ),
                  fase_template:fase_templates (
                    id,
                    codigo,
                    nome_exibicao,
                    norma_referencia,
                    definicao_workflow
                  )
                `,
            )
            .eq("organizacao_id", profile.org_id)
            .order("criado_em", { ascending: true }),
          supabase
            .from("empreendimentos")
            .select("id, organizacao_id, nome, criado_em")
            .eq("organizacao_id", profile.org_id)
            .order("nome", { ascending: true }),
        ]);

        if (!bibliotecasResult.error && !empreendimentosResult.error) {
          librariesData = bibliotecasResult.data ?? [];
          enterprisesData = empreendimentosResult.data ?? [];
        } else {
          const portugueseError =
            bibliotecasResult.error ?? empreendimentosResult.error;

          if (
            !isMissingCatalogContract(portugueseError, [
              "bibliotecas",
              "empreendimentos",
            ])
          ) {
            throw portugueseError;
          }

          librariesData = loadLocalLibraries(profile.org_id);
          enterprisesData = loadLocalEnterprises(profile.org_id);
          usingLocalCatalogFallback = true;
        }
      } else {
        librariesData = librariesResult.data ?? [];
        enterprisesData = enterprisesResult.data ?? [];
      }

      let normalizedPhaseTemplates = phaseTemplatesData
        .map(normalizePhaseTemplate)
        .filter((value): value is PhaseTemplateRecord => Boolean(value));

      if (!usingLocalCatalogFallback) {
        const didSyncLocalCatalog = await syncLocalCatalogToRemote(
          normalizedPhaseTemplates,
        );

        if (didSyncLocalCatalog) {
          const [syncedLibrariesResult, syncedEnterprisesResult] =
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
                    active,
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
            ]);

          if (syncedLibrariesResult.error) {
            throw syncedLibrariesResult.error;
          }

          if (syncedEnterprisesResult.error) {
            throw syncedEnterprisesResult.error;
          }

          librariesData = syncedLibrariesResult.data ?? [];
          enterprisesData = syncedEnterprisesResult.data ?? [];
        }
      }

      const normalizedLibraries = librariesData
        .map(normalizeLibrary)
        .filter((value): value is LibraryRecord => Boolean(value));
      const normalizedEnterprises = enterprisesData
        .map(normalizeEnterprise)
        .filter((value): value is EnterpriseRecord => Boolean(value));

      setLibraries(normalizedLibraries);
      setEnterprises(normalizedEnterprises);
      setPhaseTemplates(normalizedPhaseTemplates);

      await Promise.all(
        normalizedLibraries.map((library) =>
          ensureProjectForLibrary({
            libraryId: library.id,
            libraryName: library.name,
            enterpriseId: library.enterprise_id,
            phaseCode:
              library.phase_template?.code ??
              normalizedPhaseTemplates.find(
                (template) => template.id === library.phase_template_id,
              )?.code ??
              "project",
          }),
        ),
      );
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, "Não foi possível carregar as bibliotecas."),
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, profile?.org_id, syncLocalCatalogToRemote]);

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
      let data: unknown = null;
      let insertError: unknown = null;

      const enterpriseInsert = await supabase
        .from("enterprises")
        .insert({
          org_id: profile.org_id,
          name: name.trim(),
        })
        .select("id, org_id, name, created_at")
        .single();

      data = enterpriseInsert.data;
      insertError = enterpriseInsert.error;

      if (enterpriseInsert.error) {
        if (
          !isMissingCatalogContract(enterpriseInsert.error, ["enterprises"])
        ) {
          throw enterpriseInsert.error;
        }

        const empreendimentoInsert = await supabase
          .from("empreendimentos")
          .insert({
            organizacao_id: profile.org_id,
            nome: name.trim(),
          })
          .select("id, organizacao_id, nome, criado_em")
          .single();

        if (!empreendimentoInsert.error) {
          data = empreendimentoInsert.data;
          insertError = empreendimentoInsert.error;
        } else if (
          isMissingCatalogContract(empreendimentoInsert.error, [
            "empreendimentos",
          ])
        ) {
          const enterprise: EnterpriseRecord = {
            id: globalThis.crypto?.randomUUID?.() ?? `enterprise-${Date.now()}`,
            org_id: profile.org_id,
            name: name.trim(),
            created_at: new Date().toISOString(),
          };
          const localEnterprises = loadLocalEnterprises(profile.org_id);
          saveLocalEnterprises(profile.org_id, [
            ...localEnterprises,
            enterprise,
          ]);
          data = enterprise;
          insertError = null;
        } else {
          throw empreendimentoInsert.error;
        }
      }

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

  async function ensureProjectForLibrary(input: {
    libraryId: string;
    libraryName: string;
    enterpriseId: string;
    phaseCode: LibraryPhaseCode;
  }) {
    if (!profile?.org_id) return true;

    const metadata = {
      auto_created_from_library: true,
      enterprise_id: input.enterpriseId,
      phase_code: input.phaseCode,
      linked_library_id: input.libraryId,
    };

    try {
      const existingEnterpriseProject = await supabase
        .from("projects")
        .select("id")
        .eq("org_id", profile.org_id)
        .eq("library_id", input.libraryId)
        .maybeSingle();

      if (existingEnterpriseProject.data?.id) {
        return true;
      }

      if (
        existingEnterpriseProject.error &&
        classifyProjectContract(existingEnterpriseProject.error) === "error"
      ) {
        throw existingEnterpriseProject.error;
      }

      const enterpriseInsert = await supabase
        .from("projects")
        .insert({
          org_id: profile.org_id,
          library_id: input.libraryId,
          code: null,
          name: input.libraryName.trim(),
          description: `Projeto gerado automaticamente a partir da biblioteca ${input.libraryName.trim()}.`,
          client_name: null,
          contract_number: null,
          location: null,
          project_type: input.phaseCode === "project" ? "project" : "unidade",
          status: "active",
          area: null,
          responsible_id: null,
          start_date: null,
          end_date: null,
          metadata,
          is_active: true,
          created_by: profile.id ?? null,
        })
        .select("id")
        .single();

      if (!enterpriseInsert.error) {
        return true;
      }

      const projectMode = classifyProjectContract(enterpriseInsert.error);
      if (projectMode === "error") {
        throw enterpriseInsert.error;
      }

      if (projectMode === "legacy") {
        const legacyExisting = await supabase
          .from("projects")
          .select("id, name")
          .eq("name", input.libraryName.trim())
          .maybeSingle();

        if (legacyExisting.data?.id) {
          return true;
        }

        if (
          legacyExisting.error &&
          classifyProjectContract(legacyExisting.error) === "error"
        ) {
          throw legacyExisting.error;
        }

        const legacyInsert = await supabase
          .from("projects")
          .insert({
            code: null,
            name: input.libraryName.trim(),
            client: null,
            start_date: null,
            end_date: null,
            status: "active",
            created_by: profile.id ?? null,
          })
          .select("id")
          .single();

        if (!legacyInsert.error) {
          return true;
        }

        if (classifyProjectContract(legacyInsert.error) === "error") {
          throw legacyInsert.error;
        }
      }

      const localProjects = loadLocalProjects(profile.org_id);
      const existingLocalProject = localProjects.find(
        (project) => project.library_id === input.libraryId,
      );
      if (existingLocalProject) {
        return true;
      }

      const now = new Date().toISOString();
      const localProject: ProjectOperationalContext = {
        id: globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
        org_id: profile.org_id,
        library_id: input.libraryId,
        code: `PROJ${input.libraryId.replaceAll("-", "").slice(0, 6).toUpperCase()}`,
        has_explicit_code: false,
        name: input.libraryName.trim(),
        description: `Projeto gerado automaticamente a partir da biblioteca ${input.libraryName.trim()}.`,
        client_name: null,
        contract_number: null,
        location: null,
        project_type: input.phaseCode === "project" ? "project" : "unidade",
        status: "active",
        area: null,
        responsible_id: null,
        responsible_name: null,
        start_date: null,
        end_date: null,
        metadata,
        is_active: true,
        created_by: profile.id ?? null,
        created_at: now,
        updated_at: now,
        document_count: 0,
        is_legacy: false,
      };
      saveLocalProjects(profile.org_id, [...localProjects, localProject]);
      return true;
    } catch (err: unknown) {
      setError(
        getErrorMessage(
          err,
          "A biblioteca foi criada, mas não foi possível registrar o projeto automaticamente.",
        ),
      );
      return false;
    }
  }

  async function provisionLibrary(input: ProvisionLibraryInput) {
    if (!profile?.org_id) return null;
    setSaving(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "provision_library",
        {
          p_enterprise_id: input.enterpriseId,
          p_phase_code: input.phaseCode,
          p_library_name: input.name.trim(),
        },
      );

      if (!rpcError) {
        await refresh();
        return typeof data === "string" ? data : String(data ?? "");
      }

      const selectedPhaseTemplate = phaseTemplates.find(
        (template) => template.code === input.phaseCode,
      );

      if (
        !isMissingCatalogContract(rpcError, [
          "provision_library",
          "libraries",
          "phase_templates",
        ])
      ) {
        throw rpcError;
      }

      if (!selectedPhaseTemplate) {
        throw new Error(
          "Nenhum template de fase compatível foi carregado para provisionar a biblioteca.",
        );
      }

      let insertedLibraryId = "";
      const englishInsert = await supabase
        .from("libraries")
        .insert({
          org_id: profile.org_id,
          enterprise_id: input.enterpriseId,
          phase_template_id: selectedPhaseTemplate.id,
          name: input.name.trim(),
          created_by: profile.id ?? null,
        })
        .select("id")
        .single();

      if (!englishInsert.error) {
        insertedLibraryId = String(englishInsert.data?.id ?? "");
      } else {
        if (!isMissingCatalogContract(englishInsert.error, ["libraries"])) {
          throw englishInsert.error;
        }

        const portugueseInsert = await supabase
          .from("bibliotecas")
          .insert({
            organizacao_id: profile.org_id,
            empreendimento_id: input.enterpriseId,
            fase_template_id: selectedPhaseTemplate.id,
            nome: input.name.trim(),
            criado_por: profile.id ?? null,
          })
          .select("id")
          .single();

        if (!portugueseInsert.error) {
          insertedLibraryId = String(portugueseInsert.data?.id ?? "");
        } else if (
          isMissingCatalogContract(portugueseInsert.error, ["bibliotecas"])
        ) {
          const enterprise =
            enterprises.find((item) => item.id === input.enterpriseId) ??
            loadLocalEnterprises(profile.org_id).find(
              (item) => item.id === input.enterpriseId,
            ) ??
            null;

          const localLibraries = loadLocalLibraries(profile.org_id);
          const library: LibraryRecord = {
            id: globalThis.crypto?.randomUUID?.() ?? `library-${Date.now()}`,
            org_id: profile.org_id,
            enterprise_id: input.enterpriseId,
            phase_template_id: selectedPhaseTemplate.id,
            name: input.name.trim(),
            active: true,
            created_by: profile.id ?? null,
            created_at: new Date().toISOString(),
            enterprise,
            phase_template: selectedPhaseTemplate,
          };
          saveLocalLibraries(profile.org_id, [...localLibraries, library]);
          insertedLibraryId = library.id;
        } else {
          throw portugueseInsert.error;
        }
      }

      await ensureProjectForLibrary({
        libraryId: insertedLibraryId,
        libraryName: input.name.trim(),
        enterpriseId: input.enterpriseId,
        phaseCode: input.phaseCode,
      });
      await refresh();
      return insertedLibraryId;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível criar a biblioteca."));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateLibrary(libraryId: string, updates: UpdateLibraryInput) {
    if (!profile?.org_id) return false;
    setSaving(true);
    setError(null);
    try {
      const libraryUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) libraryUpdates.name = updates.name.trim();
      if (updates.active !== undefined) libraryUpdates.active = updates.active;

      if (Object.keys(libraryUpdates).length > 0) {
        const englishUpdate = await supabase
          .from("libraries")
          .update(libraryUpdates)
          .eq("id", libraryId)
          .eq("org_id", profile.org_id);

        if (englishUpdate.error) {
          if (!isMissingCatalogContract(englishUpdate.error, ["libraries"])) {
            throw englishUpdate.error;
          }

          const portugueseUpdates: Record<string, unknown> = {};
          if (updates.name !== undefined)
            portugueseUpdates.nome = updates.name.trim();
          if (updates.active !== undefined)
            portugueseUpdates.ativo = updates.active;

          const portugueseUpdate = await supabase
            .from("bibliotecas")
            .update(portugueseUpdates)
            .eq("id", libraryId)
            .eq("organizacao_id", profile.org_id);

          if (portugueseUpdate.error) {
            if (
              !isMissingCatalogContract(portugueseUpdate.error, ["bibliotecas"])
            ) {
              throw portugueseUpdate.error;
            }

            const localLibraries = loadLocalLibraries(profile.org_id);
            const next = localLibraries.map((library) =>
              library.id === libraryId
                ? {
                    ...library,
                    name: updates.name?.trim() ?? library.name,
                    active: updates.active ?? library.active,
                  }
                : library,
            );
            saveLocalLibraries(profile.org_id, next);
          }
        }
      }

      if (updates.code !== undefined) {
        const trimmedCode = updates.code.trim();
        // Primeiro tenta com has_explicit_code. Se a coluna não existir no
        // banco do usuário, faz o fallback para atualizar apenas "code".
        let codeResult = await supabase
          .from("projects")
          .update({
            code: trimmedCode || null,
            has_explicit_code: Boolean(trimmedCode),
          })
          .eq("library_id", libraryId)
          .eq("org_id", profile.org_id);

        if (codeResult.error) {
          const msg = getErrorMessage(codeResult.error, "").toLowerCase();
          const missingHasExplicit =
            msg.includes("has_explicit_code") &&
            (msg.includes("schema cache") ||
              msg.includes("does not exist") ||
              msg.includes("could not find"));

          if (missingHasExplicit) {
            codeResult = await supabase
              .from("projects")
              .update({ code: trimmedCode || null })
              .eq("library_id", libraryId)
              .eq("org_id", profile.org_id);
          }
        }

        if (codeResult.error) {
          throw codeResult.error;
        }
      }

      await refresh();
      return true;
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, "Não foi possível atualizar a biblioteca."),
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  /**
   * Busca o código atual do projeto vinculado a uma biblioteca — usado para
   * pré-preencher o campo "Código" no diálogo de edição.
   */
  async function getLibraryCode(libraryId: string): Promise<string> {
    try {
      const { data, error: fetchError } = await supabase
        .from("projects")
        .select("code")
        .eq("library_id", libraryId)
        .maybeSingle();

      if (fetchError || !data) return "";
      return String((data as { code?: string | null }).code ?? "");
    } catch {
      return "";
    }
  }

  async function deleteLibrary(libraryId: string) {
    if (!profile?.org_id) return false;
    setSaving(true);
    setError(null);
    try {
      // 1) Bloqueia a exclusão se existirem documentos nesta biblioteca.
      // TODO: confirme o nome real da tabela/coluna de documentos no seu
      // banco — aqui tento "documentos" (pt) e depois "documents" (en),
      // ambas com uma coluna "library_id".
      let documentCount = 0;

      const documentosCount = await supabase
        .from("documentos")
        .select("id", { count: "exact", head: true })
        .eq("library_id", libraryId);

      if (!documentosCount.error) {
        documentCount = documentosCount.count ?? 0;
      } else if (
        !isMissingCatalogContract(documentosCount.error, ["documentos"])
      ) {
        const documentsCount = await supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("library_id", libraryId);

        if (!documentsCount.error) {
          documentCount = documentsCount.count ?? 0;
        } else if (
          !isMissingCatalogContract(documentsCount.error, ["documents"])
        ) {
          throw documentsCount.error;
        }
      }

      if (documentCount > 0) {
        setError(
          `Não é possível excluir: esta biblioteca tem ${documentCount} documento${
            documentCount === 1 ? "" : "s"
          }. Remova os documentos antes de excluir a biblioteca.`,
        );
        return false;
      }

      // 2) Remove o projeto vinculado (criado automaticamente pela biblioteca)
      await supabase
        .from("projects")
        .delete()
        .eq("library_id", libraryId)
        .eq("org_id", profile.org_id);

      // 3) Remove a biblioteca em si (com fallback pt-BR e local)
      const englishDelete = await supabase
        .from("libraries")
        .delete()
        .eq("id", libraryId)
        .eq("org_id", profile.org_id);

      if (englishDelete.error) {
        if (!isMissingCatalogContract(englishDelete.error, ["libraries"])) {
          throw englishDelete.error;
        }

        const portugueseDelete = await supabase
          .from("bibliotecas")
          .delete()
          .eq("id", libraryId)
          .eq("organizacao_id", profile.org_id);

        if (portugueseDelete.error) {
          if (
            !isMissingCatalogContract(portugueseDelete.error, ["bibliotecas"])
          ) {
            throw portugueseDelete.error;
          }
        }
      }

      const localLibraries = loadLocalLibraries(profile.org_id);
      saveLocalLibraries(
        profile.org_id,
        localLibraries.filter((library) => library.id !== libraryId),
      );

      await refresh();
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível excluir a biblioteca."));
      return false;
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
    updateLibrary,
    getLibraryCode,
    deleteLibrary,
  };
}
