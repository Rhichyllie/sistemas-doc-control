import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useLibraryScope } from "@/contexts/library-context";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";
import {
  generateTramiteCode,
  type DocumentTramiteGraph,
  type DocumentTramiteTemplate,
  type DocumentTramiteTemplateScope,
  type DocumentTramiteTemplateStatus,
  type DocumentTramiteTemplateVersion,
} from "@/lib/documentTramiteModel";
import {
  deserializeTramiteGraph,
  serializeTramiteGraph,
} from "@/lib/documentTramiteSerialization";
import { validateTramiteGraph } from "@/lib/documentTramiteValidation";

export type DocumentTramiteSchemaStatus =
  | "loading"
  | "ready"
  | "empty"
  | "not_installed"
  | "partial"
  | "restricted"
  | "error";

export interface DocumentTramiteTemplateInput {
  name: string;
  code?: string;
  description?: string | null;
  template_scope?: DocumentTramiteTemplateScope;
  doc_type?: string | null;
  area?: string | null;
  project_id?: string | null;
  is_default?: boolean;
  metadata?: Record<string, unknown>;
  graph: DocumentTramiteGraph;
}

const LOCAL_DOCUMENT_TRAMITE_STORAGE_PREFIX =
  "tramita.document_tramites.local.";

interface LocalDocumentTramiteStore {
  templates: unknown[];
  versions: unknown[];
}

function getLocalDocumentTramiteStorageKey(orgId: string) {
  return `${LOCAL_DOCUMENT_TRAMITE_STORAGE_PREFIX}${orgId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createLocalIdentifier(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isMissingSchema(error: unknown) {
  if (!isRecord(error)) return false;
  const text = [error.code, error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    text.includes("pgrst205") ||
    text.includes("42p01") ||
    text.includes("document_tramite_") ||
    text.includes("schema cache")
  );
}

function isMissingRpc(error: unknown) {
  if (!isRecord(error)) return false;
  const text = [error.code, error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    text.includes("pgrst202") ||
    text.includes("could not find the function") ||
    (text.includes("function") && text.includes("does not exist"))
  );
}

function isDeleteRestrictedByExecution(error: unknown) {
  if (!isRecord(error)) return false;
  const text = [error.code, error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    text.includes("foreign key") &&
    (text.includes("document_tramite_instances") ||
      text.includes("document_tramite_instance_steps") ||
      text.includes("on delete restrict"))
  );
}

function normalizeStatus(value: unknown): DocumentTramiteTemplateStatus {
  return value === "published" || value === "archived" ? value : "draft";
}

function normalizeScope(value: unknown): DocumentTramiteTemplateScope {
  return value === "project" ||
    value === "area" ||
    value === "type" ||
    value === "area_type"
    ? value
    : "organization";
}

function normalizeValidation(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function normalizeVersion(
  value: Record<string, unknown>,
): DocumentTramiteTemplateVersion | null {
  if (typeof value.id !== "string" || typeof value.template_id !== "string") {
    return null;
  }
  return {
    id: value.id,
    org_id: String(value.org_id ?? ""),
    template_id: value.template_id,
    version_number: Number(value.version_number) || 1,
    status: normalizeStatus(value.status),
    graph: deserializeTramiteGraph(value.graph),
    validation: normalizeValidation(value.validation),
    nodes_count: Number(value.nodes_count) || 0,
    edges_count: Number(value.edges_count) || 0,
    created_by: typeof value.created_by === "string" ? value.created_by : null,
    published_by:
      typeof value.published_by === "string" ? value.published_by : null,
    published_at:
      typeof value.published_at === "string" ? value.published_at : null,
    metadata: isRecord(value.metadata) ? value.metadata : {},
    created_at: String(value.created_at ?? ""),
  };
}

function normalizeTemplate(
  value: Record<string, unknown>,
  versions: DocumentTramiteTemplateVersion[],
): DocumentTramiteTemplate | null {
  if (typeof value.id !== "string") return null;
  const related = versions
    .filter((version) => version.template_id === value.id)
    .sort((left, right) => right.version_number - left.version_number);
  const working = related.find((version) => version.status === "draft") ?? null;
  const published =
    related.find((version) => version.id === value.current_version_id) ??
    related.find((version) => version.status === "published") ??
    null;
  const current = working ?? published ?? related[0] ?? null;
  return {
    id: value.id,
    org_id: String(value.org_id ?? ""),
    library_id:
      typeof value.library_id === "string" ? value.library_id : null,
    code: String(value.code ?? ""),
    name: String(value.name ?? "Trâmite sem nome"),
    description:
      typeof value.description === "string" ? value.description : null,
    status: normalizeStatus(value.status),
    template_scope: normalizeScope(value.template_scope),
    doc_type: typeof value.doc_type === "string" ? value.doc_type : null,
    area: typeof value.area === "string" ? value.area : null,
    project_id: typeof value.project_id === "string" ? value.project_id : null,
    is_default: value.is_default === true,
    is_active: value.is_active !== false,
    current_version_id:
      typeof value.current_version_id === "string"
        ? value.current_version_id
        : null,
    created_by: typeof value.created_by === "string" ? value.created_by : null,
    updated_by: typeof value.updated_by === "string" ? value.updated_by : null,
    published_by:
      typeof value.published_by === "string" ? value.published_by : null,
    published_at:
      typeof value.published_at === "string" ? value.published_at : null,
    metadata: isRecord(value.metadata) ? value.metadata : {},
    created_at: String(value.created_at ?? ""),
    updated_at: String(value.updated_at ?? value.created_at ?? ""),
    current_version: current,
    published_version: published,
    working_version: working,
  };
}

function loadLocalTramiteStore(orgId: string) {
  if (typeof window === "undefined") {
    return {
      templates: [] as DocumentTramiteTemplate[],
      versions: [] as DocumentTramiteTemplateVersion[],
    };
  }
  try {
    const raw = window.localStorage.getItem(
      getLocalDocumentTramiteStorageKey(orgId),
    );
    if (!raw) {
      return {
        templates: [] as DocumentTramiteTemplate[],
        versions: [] as DocumentTramiteTemplateVersion[],
      };
    }
    const parsed = JSON.parse(raw) as Partial<LocalDocumentTramiteStore>;
    const versions = Array.isArray(parsed.versions)
      ? parsed.versions
          .filter(isRecord)
          .map(normalizeVersion)
          .filter((value): value is DocumentTramiteTemplateVersion =>
            Boolean(value),
          )
      : [];
    const templates = Array.isArray(parsed.templates)
      ? parsed.templates
          .filter(isRecord)
          .map((value) => normalizeTemplate(value, versions))
          .filter((value): value is DocumentTramiteTemplate => Boolean(value))
      : [];
    return { templates, versions };
  } catch {
    return {
      templates: [] as DocumentTramiteTemplate[],
      versions: [] as DocumentTramiteTemplateVersion[],
    };
  }
}

function saveLocalTramiteStore(
  orgId: string,
  templates: DocumentTramiteTemplate[],
  versions: DocumentTramiteTemplateVersion[],
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getLocalDocumentTramiteStorageKey(orgId),
    JSON.stringify({ templates, versions }),
  );
}

function clearLocalTramiteStore(orgId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getLocalDocumentTramiteStorageKey(orgId));
}

function hasLocalIdentifiers(value: string): boolean {
  return (
    value.startsWith("tramite-")
    || value.startsWith("tramite-version-")
    || value.startsWith("tramite-node-")
    || value.startsWith("tramite-edge-")
  );
}

function newCleanUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const randomBytes = (size: number): string => {
    let out = "";
    const chars = "abcdef0123456789";
    for (let i = 0; i < size; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  };
  return [
    randomBytes(8),
    randomBytes(4),
    `4${randomBytes(3)}`,
    `${["8", "9", "a", "b"][Math.floor(Math.random() * 4)]}${randomBytes(3)}`,
    randomBytes(12),
  ].join("-");
}

export function useDocumentTramiteTemplates() {
  const { profile } = useAuthContext();
  const { libraryId } = useLibraryScope();
  const [templates, setTemplates] = useState<DocumentTramiteTemplate[]>([]);
  const [versions, setVersions] = useState<DocumentTramiteTemplateVersion[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaStatus, setSchemaStatus] =
    useState<DocumentTramiteSchemaStatus>("loading");
  const canManage = profile?.role === "admin" || profile?.role === "manager";
  const [isLocalMode, setIsLocalMode] = useState(false);

  const refresh = useCallback(async () => {
    if (!profile?.org_id) {
      setTemplates([]);
      setVersions([]);
      setSchemaStatus("restricted");
      setError("Seu perfil não possui organização válida.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const templatesResult = await supabase
      .from("document_tramite_templates")
      .select("*")
      .eq("org_id", profile.org_id)
      .match(libraryId ? { library_id: libraryId } : {})
      .order("updated_at", { ascending: false });
    if (templatesResult.error) {
      if (isMissingSchema(templatesResult.error)) {
        const localStore = loadLocalTramiteStore(profile.org_id);
        setTemplates(localStore.templates);
        setVersions(localStore.versions);
        setIsLocalMode(true);
        setSchemaStatus(localStore.templates.length ? "ready" : "empty");
        setError(
          localStore.templates.length
            ? "Ciclo P-12 não instalado. Os trâmites estão sendo mantidos localmente neste navegador."
            : "Ciclo P-12 não instalado. Você pode modelar trâmites localmente neste navegador.",
        );
      } else {
        const realMessage = getErrorMessage(
          templatesResult.error,
          "Verifique RLS, papel e organização.",
        );
        const localFallback = loadLocalTramiteStore(profile.org_id);
        // Usa store local APENAS se houver dados e o erro for de permissão.
        if (localFallback.templates.length) {
          setTemplates(localFallback.templates);
          setVersions(localFallback.versions);
          setIsLocalMode(true);
          setSchemaStatus(
            localFallback.templates.length ? "ready" : "empty",
          );
        } else {
          setTemplates([]);
          setVersions([]);
          setIsLocalMode(false);
          setSchemaStatus("restricted");
        }
        setError(
          `Não foi possível carregar os trâmites (${realMessage}).`,
        );
      }
      setIsLoading(false);
      return;
    }

    const versionsResult = await supabase
      .from("document_tramite_template_versions")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("version_number", { ascending: false });
    if (versionsResult.error) {
      if (isMissingSchema(versionsResult.error)) {
        const localStore = loadLocalTramiteStore(profile.org_id);
        setTemplates(localStore.templates);
        setVersions(localStore.versions);
        setIsLocalMode(true);
        setSchemaStatus(localStore.templates.length ? "ready" : "empty");
        setError(
          localStore.templates.length
            ? "Schema P-12 parcial. Os trâmites estão sendo mantidos localmente neste navegador."
            : "Schema P-12 parcial. Você pode modelar trâmites localmente neste navegador.",
        );
      } else {
        setTemplates([]);
        setVersions([]);
        setIsLocalMode(false);
        setSchemaStatus("restricted");
        setError(
          `Não foi possível carregar versões. ${getErrorMessage(
            versionsResult.error,
            "Verifique RLS e o schema P-12.",
          )}`,
        );
      }
      setIsLoading(false);
      return;
    }

    const normalizedVersions = (versionsResult.data ?? [])
      .filter(isRecord)
      .map(normalizeVersion)
      .filter((value): value is DocumentTramiteTemplateVersion =>
        Boolean(value),
      );
    const normalizedTemplates = (templatesResult.data ?? [])
      .filter(isRecord)
      .map((value) => normalizeTemplate(value, normalizedVersions))
      .filter((value): value is DocumentTramiteTemplate => Boolean(value));
    setTemplates(normalizedTemplates);
    setVersions(normalizedVersions);

    // Se já existem templates salvos localmente com IDs não-UUID (tramite-*),
    // faz a migração automática: insere tudo no banco e apaga do localStorage.
    const localStore = loadLocalTramiteStore(profile.org_id);
    const needsMigration =
      localStore.templates.length > 0
      && localStore.templates.some((t) => hasLocalIdentifiers(t.id));
    if (needsMigration && canManage) {
      setError("Migrando trâmites locais para o banco…");
      const migratedOk = await migrateLocalStoreToRemote(
        profile.org_id,
        profile.id,
        libraryId ?? null,
        localStore,
      );
      if (migratedOk) {
        clearLocalTramiteStore(profile.org_id);
        setError(null);
        // Recarrega do banco com os registros recém-inseridos.
        await refresh();
        return;
      }
      setError(
        "Não foi possível migrar os trâmites locais. Eles continuam disponíveis neste navegador.",
      );
    }

    setIsLocalMode(false);
    setSchemaStatus(normalizedTemplates.length ? "ready" : "empty");
    setIsLoading(false);
  }, [libraryId, profile?.id, profile?.org_id, canManage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const migrateLocalStoreToRemote = useCallback(
    async (
      orgId: string,
      actorId: string,
      defaultLibraryId: string | null,
      localStore: {
        templates: DocumentTramiteTemplate[];
        versions: DocumentTramiteTemplateVersion[];
      },
    ): Promise<boolean> => {
      try {
        for (const localTemplate of localStore.templates) {
          // 1. Cria o template limpo no banco (o Supabase gera o id UUID).
          const code = localTemplate.code
            || generateTramiteCode(localTemplate.name);
          const insertTemplate = {
            org_id: orgId,
            library_id: localTemplate.library_id ?? defaultLibraryId,
            code,
            name: localTemplate.name.trim(),
            description: localTemplate.description?.trim() || null,
            status: "draft" as const,
            template_scope: localTemplate.template_scope ?? "organization",
            doc_type: localTemplate.doc_type ?? null,
            area: localTemplate.area ?? null,
            project_id: localTemplate.project_id ?? null,
            is_default: localTemplate.is_default ?? false,
            is_active: localTemplate.is_active,
            created_by: actorId,
            updated_by: actorId,
            metadata: {
              ...(localTemplate.metadata ?? {}),
              migrated_from_local_id: localTemplate.id,
            },
          };
          const templateRes = await supabase
            .from("document_tramite_templates")
            .insert(insertTemplate)
            .select("id")
            .single();
          if (templateRes.error || !templateRes.data) {
            // Se der erro de UNIQUE no code, ignora esse template (já existe).
            const isDuplicate =
              /unique|duplic/i.test(
                [
                  templateRes.error?.code,
                  templateRes.error?.message,
                  templateRes.error?.details,
                ]
                  .filter(Boolean)
                  .join(" "),
              );
            if (!isDuplicate) return false;
            continue;
          }
          const newTemplateId = String(templateRes.data.id);

          // 2. Mapa de versão-local → nova versão (para atualizar FKs).
          const localVersions = localStore.versions
            .filter((v) => v.template_id === localTemplate.id)
            .sort((a, b) => a.version_number - b.version_number);

          const localVersionIdToNew: Record<string, string> = {};
          for (const localVersion of localVersions) {
            const versionRes = await supabase
              .from("document_tramite_template_versions")
              .insert({
                org_id: orgId,
                template_id: newTemplateId,
                version_number: localVersion.version_number || 1,
                status: normalizeStatus(localVersion.status),
                graph: serializeTramiteGraph(localVersion.graph),
                validation: localVersion.validation ?? {},
                nodes_count: localVersion.nodes_count || 0,
                edges_count: localVersion.edges_count || 0,
                created_by: actorId,
                published_by:
                  localVersion.status === "published" ? actorId : null,
                published_at: localVersion.published_at ?? null,
                metadata: {
                  ...(localVersion.metadata ?? {}),
                  migrated_from_local_id: localVersion.id,
                },
              })
              .select("id")
              .single();
            if (versionRes.error || !versionRes.data) return false;
            localVersionIdToNew[localVersion.id] = String(
              versionRes.data.id,
            );
          }

          // 3. Atualiza current_version_id e status do template com a versão mais recente.
          const localCurrentId = localTemplate.current_version
            ? localVersionIdToNew[localTemplate.current_version.id]
            : undefined;
          const fallbackVersionId =
            localCurrentId
            ?? (localVersions.length
              ? localVersionIdToNew[
                localVersions[localVersions.length - 1].id
              ]
              : undefined);
          const anyPublished = localVersions.some(
            (v) => v.status === "published",
          );
          const updatePayload: Record<string, unknown> = {
            updated_by: actorId,
            status: anyPublished ? "published" : "draft",
            published_by: anyPublished ? actorId : null,
            published_at: anyPublished
              ? localTemplate.published_at ?? new Date().toISOString()
              : null,
          };
          if (fallbackVersionId) {
            updatePayload.current_version_id = fallbackVersionId;
          }
          await supabase
            .from("document_tramite_templates")
            .update(updatePayload)
            .eq("id", newTemplateId);

          // 4. Evento de criação / migração.
          if (fallbackVersionId) {
            await supabase.from("document_tramite_events").insert({
              org_id: orgId,
              template_id: newTemplateId,
              version_id: fallbackVersionId,
              event_type: "created",
              actor_id: actorId,
              metadata: { migrated_from_local: true },
            });
          }
        }
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const createTemplate = useCallback(
    async (input: DocumentTramiteTemplateInput) => {
      if (!profile?.id || !profile.org_id || !canManage) {
        setError("Somente administradores e gestores podem criar trâmites.");
        return null;
      }
      if (!libraryId) {
        setError("Selecione uma biblioteca antes de criar trâmites.");
        return null;
      }
      if (isLocalMode) {
        setIsSaving(true);
        setError(null);
        const now = new Date().toISOString();
        const code = generateTramiteCode(input.code || input.name);
        const validation = validateTramiteGraph(input.graph);
        const templateId = createLocalIdentifier("tramite");
        const versionId = createLocalIdentifier("tramite-version");
        const nextVersion: DocumentTramiteTemplateVersion = {
          id: versionId,
          org_id: profile.org_id,
          template_id: templateId,
          version_number: 1,
          status: "draft",
          graph: structuredClone(input.graph),
          validation: { ...validation },
          nodes_count: input.graph.nodes.length,
          edges_count: input.graph.edges.length,
          created_by: profile.id,
          published_by: null,
          published_at: null,
          metadata: { local_mode: true },
          created_at: now,
        };
        const nextTemplate: DocumentTramiteTemplate = {
          id: templateId,
          org_id: profile.org_id,
          library_id: libraryId,
          code,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          status: "draft",
          template_scope: input.template_scope ?? "organization",
          doc_type: input.doc_type || null,
          area: input.area || null,
          project_id: input.project_id || null,
          is_default: input.is_default ?? false,
          is_active: true,
          current_version_id: versionId,
          created_by: profile.id,
          updated_by: profile.id,
          published_by: null,
          published_at: null,
          metadata: { ...(input.metadata ?? {}), local_mode: true },
          created_at: now,
          updated_at: now,
          current_version: nextVersion,
          published_version: null,
          working_version: nextVersion,
        };
        const nextTemplates: DocumentTramiteTemplate[] = [
          nextTemplate,
          ...templates,
        ];
        const nextVersions: DocumentTramiteTemplateVersion[] = [
          nextVersion,
          ...versions,
        ];
        saveLocalTramiteStore(profile.org_id, nextTemplates, nextVersions);
        setTemplates(nextTemplates);
        setVersions(nextVersions);
        setSchemaStatus("ready");
        setIsSaving(false);
        return templateId;
      }
      setIsSaving(true);
      setError(null);
      const code = generateTramiteCode(input.code || input.name);
      const validation = validateTramiteGraph(input.graph);
      const templateResult = await supabase
        .from("document_tramite_templates")
        .insert({
          org_id: profile.org_id,
          library_id: libraryId,
          code,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          status: "draft",
          template_scope: input.template_scope ?? "organization",
          doc_type: input.doc_type || null,
          area: input.area || null,
          project_id: input.project_id || null,
          is_default: input.is_default ?? false,
          is_active: true,
          created_by: profile.id,
          updated_by: profile.id,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (templateResult.error || !templateResult.data) {
        setError(
          getErrorMessage(
            templateResult.error,
            "Não foi possível criar o modelo de trâmite.",
          ),
        );
        setIsSaving(false);
        return null;
      }

      const templateId = String(templateResult.data.id);
      const versionResult = await supabase
        .from("document_tramite_template_versions")
        .insert({
          org_id: profile.org_id,
          template_id: templateId,
          version_number: 1,
          status: "draft",
          graph: serializeTramiteGraph(input.graph),
          validation,
          nodes_count: input.graph.nodes.length,
          edges_count: input.graph.edges.length,
          created_by: profile.id,
          metadata: {},
        })
        .select("id")
        .single();
      if (versionResult.error || !versionResult.data) {
        setError(
          `O modelo foi criado, mas a versão inicial falhou. ${getErrorMessage(
            versionResult.error,
            "Revise o schema P-12 antes de continuar.",
          )}`,
        );
        setIsSaving(false);
        await refresh();
        return null;
      }

      await supabase.from("document_tramite_events").insert({
        org_id: profile.org_id,
        template_id: templateId,
        version_id: versionResult.data.id,
        event_type: "created",
        actor_id: profile.id,
        metadata: { preset: true },
      });
      setIsSaving(false);
      await refresh();
      return templateId;
    },
    [canManage, isLocalMode, libraryId, profile?.id, profile?.org_id, refresh, templates, versions],
  );

  const updateTemplate = useCallback(
    async (
      templateId: string,
      updates: Partial<
        Omit<DocumentTramiteTemplateInput, "graph"> & {
          is_active: boolean;
          status: DocumentTramiteTemplateStatus;
        }
      >,
    ) => {
      if (!profile?.id || !canManage) return false;
      if (isLocalMode && profile.org_id) {
        setIsSaving(true);
        setError(null);
        const nextTemplates: DocumentTramiteTemplate[] = templates.map((template) =>
          template.id === templateId
            ? {
                ...template,
                ...updates,
                updated_by: profile.id,
                updated_at: new Date().toISOString(),
              }
            : template,
        );
        saveLocalTramiteStore(profile.org_id, nextTemplates, versions);
        setTemplates(nextTemplates);
        setIsSaving(false);
        return true;
      }
      setIsSaving(true);
      const result = await supabase
        .from("document_tramite_templates")
        .update({ ...updates, updated_by: profile.id })
        .eq("id", templateId);
      setIsSaving(false);
      if (result.error) {
        setError(getErrorMessage(result.error, "Não foi possível atualizar."));
        return false;
      }
      await refresh();
      return true;
    },
    [canManage, profile?.id, refresh],
  );

  const ensureDraftVersion = useCallback(
    async (templateId: string) => {
      if (isLocalMode && profile?.id && profile.org_id) {
        const existing = versions
          .filter(
            (version) =>
              version.template_id === templateId && version.status === "draft",
          )
          .sort((left, right) => right.version_number - left.version_number)[0];
        if (existing) return existing;
        const source = versions
          .filter((version) => version.template_id === templateId)
          .sort((left, right) => right.version_number - left.version_number)[0];
        if (!source) return null;
        const nextVersion: DocumentTramiteTemplateVersion = {
          ...source,
          id: createLocalIdentifier("tramite-version"),
          version_number: source.version_number + 1,
          status: "draft",
          graph: structuredClone(source.graph),
          validation: {},
          nodes_count: source.graph.nodes.length,
          edges_count: source.graph.edges.length,
          created_by: profile.id,
          published_by: null,
          published_at: null,
          metadata: {
            ...(source.metadata ?? {}),
            created_from_version_id: source.id,
            local_mode: true,
          },
          created_at: new Date().toISOString(),
        };
        const nextVersions: DocumentTramiteTemplateVersion[] = [
          nextVersion,
          ...versions,
        ];
        const nextTemplates: DocumentTramiteTemplate[] = templates.map((template) =>
          template.id === templateId
            ? {
                ...template,
                current_version_id: nextVersion.id,
                current_version: nextVersion,
                working_version: nextVersion,
                updated_by: profile.id,
                updated_at: nextVersion.created_at,
              }
            : template,
        );
        saveLocalTramiteStore(profile.org_id, nextTemplates, nextVersions);
        setVersions(nextVersions);
        setTemplates(nextTemplates);
        return nextVersion;
      }
      const existing = versions
        .filter(
          (version) =>
            version.template_id === templateId && version.status === "draft",
        )
        .sort((left, right) => right.version_number - left.version_number)[0];
      if (existing) return existing;
      const source = versions
        .filter((version) => version.template_id === templateId)
        .sort((left, right) => right.version_number - left.version_number)[0];
      if (!source || !profile?.id || !profile.org_id) return null;
      const result = await supabase
        .from("document_tramite_template_versions")
        .insert({
          org_id: profile.org_id,
          template_id: templateId,
          version_number: source.version_number + 1,
          status: "draft",
          graph: serializeTramiteGraph(source.graph),
          validation: {},
          nodes_count: source.graph.nodes.length,
          edges_count: source.graph.edges.length,
          created_by: profile.id,
          metadata: { created_from_version_id: source.id },
        })
        .select("*")
        .single();
      if (result.error || !isRecord(result.data)) {
        setError(
          getErrorMessage(
            result.error,
            "Não foi possível abrir uma nova versão de trabalho.",
          ),
        );
        return null;
      }
      const normalized = normalizeVersion(result.data);
      await refresh();
      return normalized;
    },
    [profile?.id, profile?.org_id, refresh, versions],
  );

  const saveGraph = useCallback(
    async (templateId: string, graph: DocumentTramiteGraph) => {
      if (!profile?.id || !profile.org_id || !canManage) return false;
      if (isLocalMode) {
        setIsSaving(true);
        setError(null);
        const baseVersion = await ensureDraftVersion(templateId);
        if (!baseVersion) {
          setIsSaving(false);
          return false;
        }
        const validation = validateTramiteGraph(graph);
        const updatedVersion: DocumentTramiteTemplateVersion = {
          ...baseVersion,
          graph: structuredClone(graph),
          validation: { ...validation },
          nodes_count: graph.nodes.length,
          edges_count: graph.edges.length,
        };
        const baseVersions = versions.some(
          (version) => version.id === updatedVersion.id,
        )
          ? versions
          : [baseVersion, ...versions];
        const nextVersions: DocumentTramiteTemplateVersion[] = baseVersions.map(
          (version) => (version.id === updatedVersion.id ? updatedVersion : version),
        );
        const nextTemplates: DocumentTramiteTemplate[] = templates.map((template) =>
          template.id === templateId
            ? {
                ...template,
                current_version_id: updatedVersion.id,
                current_version: updatedVersion,
                working_version:
                  updatedVersion.status === "draft" ? updatedVersion : null,
                updated_by: profile.id,
                updated_at: new Date().toISOString(),
              }
            : template,
        );
        saveLocalTramiteStore(profile.org_id, nextTemplates, nextVersions);
        setVersions(nextVersions);
        setTemplates(nextTemplates);
        setIsSaving(false);
        return true;
      }
      setIsSaving(true);
      setError(null);
      const version = await ensureDraftVersion(templateId);
      if (!version) {
        setIsSaving(false);
        return false;
      }
      const validation = validateTramiteGraph(graph);
      const versionResult = await supabase
        .from("document_tramite_template_versions")
        .update({
          graph: serializeTramiteGraph(graph),
          validation,
          nodes_count: graph.nodes.length,
          edges_count: graph.edges.length,
        })
        .eq("id", version.id)
        .eq("org_id", profile.org_id);
      if (versionResult.error) {
        setError(
          getErrorMessage(
            versionResult.error,
            "Não foi possível salvar o grafo.",
          ),
        );
        setIsSaving(false);
        return false;
      }

      const nodeRows = graph.nodes.map((node) => ({
        org_id: profile.org_id,
        template_id: templateId,
        version_id: version.id,
        node_key: node.node_key,
        node_type: node.node_type,
        label: node.label,
        description: node.description || null,
        position_x: node.position.x,
        position_y: node.position.y,
        assignment_type: node.assignment_type,
        assignee_user_id: node.assignee_user_id,
        assignee_group_id: node.assignee_group_id,
        due_days: node.due_days,
        required_evidence: node.required_evidence,
        required_file: node.required_file,
        require_comment: node.require_comment,
        allow_correction: node.allow_correction,
        metadata: {
          ...node.metadata,
          required_role: node.required_role,
          instructions: node.instructions,
        },
      }));
      const edgeRows = graph.edges.map((edge) => ({
        org_id: profile.org_id,
        template_id: templateId,
        version_id: version.id,
        edge_key: edge.edge_key,
        source_node_key:
          graph.nodes.find((node) => node.id === edge.source)?.node_key ??
          edge.source,
        target_node_key:
          graph.nodes.find((node) => node.id === edge.target)?.node_key ??
          edge.target,
        label: edge.label || null,
        condition_type: edge.condition_type,
        condition_value: edge.condition_value,
        priority: edge.priority,
        metadata: edge.metadata,
      }));

      const [deleteNodes, deleteEdges] = await Promise.all([
        supabase
          .from("document_tramite_nodes")
          .delete()
          .eq("version_id", version.id),
        supabase
          .from("document_tramite_edges")
          .delete()
          .eq("version_id", version.id),
      ]);
      if (!deleteNodes.error && nodeRows.length) {
        await supabase.from("document_tramite_nodes").insert(nodeRows);
      }
      if (!deleteEdges.error && edgeRows.length) {
        await supabase.from("document_tramite_edges").insert(edgeRows);
      }

      await Promise.all([
        supabase
          .from("document_tramite_templates")
          .update({ updated_by: profile.id })
          .eq("id", templateId),
        supabase.from("document_tramite_events").insert({
          org_id: profile.org_id,
          template_id: templateId,
          version_id: version.id,
          event_type: "updated",
          actor_id: profile.id,
          metadata: {
            nodes_count: graph.nodes.length,
            edges_count: graph.edges.length,
          },
        }),
      ]);
      setIsSaving(false);
      await refresh();
      return true;
    },
    [canManage, ensureDraftVersion, profile?.id, profile?.org_id, refresh],
  );

  const publishTemplate = useCallback(
    async (templateId: string) => {
      if (!profile?.id || !profile.org_id || !canManage) return false;
      if (isLocalMode) {
        setIsSaving(true);
        setError(null);
        const now = new Date().toISOString();
        const latestVersion = versions
          .filter((version) => version.template_id === templateId)
          .sort((left, right) => right.version_number - left.version_number)[0];
        if (!latestVersion) {
          setError("Nenhuma versão disponível para publicar.");
          setIsSaving(false);
          return false;
        }
        const publishedVersion: DocumentTramiteTemplateVersion = {
          ...latestVersion,
          status: "published",
          published_by: profile.id,
          published_at: now,
          metadata: { ...(latestVersion.metadata ?? {}), local_mode: true },
        };
        const nextVersions: DocumentTramiteTemplateVersion[] = versions.map(
          (version) => (version.id === publishedVersion.id ? publishedVersion : version),
        );
        const nextTemplates: DocumentTramiteTemplate[] = templates.map((template) =>
          template.id === templateId
            ? {
                ...template,
                status: "published",
                current_version_id: publishedVersion.id,
                current_version: publishedVersion,
                published_version: publishedVersion,
                working_version: null,
                published_by: profile.id,
                published_at: now,
                updated_by: profile.id,
                updated_at: now,
              }
            : template,
        );
        saveLocalTramiteStore(profile.org_id, nextTemplates, nextVersions);
        setVersions(nextVersions);
        setTemplates(nextTemplates);
        setIsSaving(false);
        return true;
      }
      setIsSaving(true);
      setError(null);
      const rpc = await supabase.rpc("publish_document_tramite_template", {
        p_template_id: templateId,
      });
      if (!rpc.error) {
        setIsSaving(false);
        await refresh();
        return true;
      }
      setError(
        isMissingRpc(rpc.error)
          ? "A RPC publish_document_tramite_template não está disponível. Aplique integralmente a migration P-12 antes de publicar."
          : getErrorMessage(
              rpc.error,
              "O banco recusou a publicação do trâmite.",
            ),
      );
      setIsSaving(false);
      return false;
    },
    [canManage, profile?.id, profile?.org_id, refresh],
  );

  const archiveTemplate = useCallback(
    (templateId: string) =>
      updateTemplate(templateId, { status: "archived", is_active: false }),
    [updateTemplate],
  );

  const deleteTemplate = useCallback(
    async (templateId: string) => {
      if (!profile?.id || !profile.org_id || !canManage) {
        setError("Somente administradores e gestores podem excluir trâmites.");
        return false;
      }

      if (isLocalMode) {
        setIsSaving(true);
        setError(null);
        const nextTemplates = templates.filter((template) => template.id !== templateId);
        const nextVersions = versions.filter((version) => version.template_id !== templateId);
        saveLocalTramiteStore(profile.org_id, nextTemplates, nextVersions);
        setTemplates(nextTemplates);
        setVersions(nextVersions);
        setSchemaStatus(nextTemplates.length ? "ready" : "empty");
        setIsSaving(false);
        return true;
      }

      setIsSaving(true);
      setError(null);
      const result = await supabase
        .from("document_tramite_templates")
        .delete()
        .eq("id", templateId)
        .eq("org_id", profile.org_id);

      if (!result.error) {
        setIsSaving(false);
        await refresh();
        return true;
      }

      setError(
        isDeleteRestrictedByExecution(result.error)
          ? "Este fluxo já possui execuções iniciadas e não pode ser excluído. Arquive-o ou encerre os trâmites vinculados antes de tentar novamente."
          : getErrorMessage(
              result.error,
              "Não foi possível excluir o trâmite.",
            ),
      );
      setIsSaving(false);
      return false;
    },
    [
      canManage,
      isLocalMode,
      profile?.id,
      profile?.org_id,
      refresh,
      templates,
      versions,
    ],
  );

  const duplicateTemplate = useCallback(
    async (template: DocumentTramiteTemplate) => {
      return createTemplate({
        name: `${template.name} — cópia`,
        code: `${template.code}-COPIA-${Date.now().toString().slice(-5)}`,
        description: template.description,
        template_scope: template.template_scope,
        doc_type: template.doc_type,
        area: template.area,
        project_id: template.project_id,
        is_default: false,
        metadata: template.metadata,
        graph:
          template.current_version?.graph ??
          deserializeTramiteGraph({ nodes: [], edges: [] }),
      });
    },
    [createTemplate],
  );

  const publishedTemplates = useMemo(
    () =>
      templates
        .filter(
          (template) => template.status === "published" && template.is_active,
        )
        .map((template) => ({
          ...template,
          current_version:
            template.published_version ?? template.current_version ?? null,
        })),
    [templates],
  );

  return {
    templates,
    versions,
    publishedTemplates,
    isLoading,
    isSaving,
    error,
    schemaStatus,
    isLocalMode,
    canManage,
    refresh,
    createTemplate,
    updateTemplate,
    ensureDraftVersion,
    saveGraph,
    publishTemplate,
    archiveTemplate,
    deleteTemplate,
    duplicateTemplate,
  };
}
