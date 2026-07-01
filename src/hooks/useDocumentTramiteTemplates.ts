import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
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
  graph: DocumentTramiteGraph;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    validation: isRecord(value.validation) ? value.validation : {},
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

export function useDocumentTramiteTemplates() {
  const { profile } = useAuthContext();
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
      .order("updated_at", { ascending: false });
    if (templatesResult.error) {
      setTemplates([]);
      setVersions([]);
      if (isMissingSchema(templatesResult.error)) {
        setSchemaStatus("not_installed");
        setError(
          "Ciclo P-12 não instalado. Aplique a migration do Modelador de Trâmites.",
        );
      } else {
        setSchemaStatus("restricted");
        setError(
          `Não foi possível carregar os trâmites. ${getErrorMessage(
            templatesResult.error,
            "Verifique RLS, papel e organização.",
          )}`,
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
      setTemplates([]);
      setVersions([]);
      setSchemaStatus(
        isMissingSchema(versionsResult.error) ? "partial" : "restricted",
      );
      setError(
        isMissingSchema(versionsResult.error)
          ? "Schema P-12 parcial: a tabela de versões não está disponível."
          : `Não foi possível carregar versões. ${getErrorMessage(
              versionsResult.error,
              "Verifique RLS e o schema P-12.",
            )}`,
      );
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
    setVersions(normalizedVersions);
    setTemplates(normalizedTemplates);
    setSchemaStatus(normalizedTemplates.length ? "ready" : "empty");
    setIsLoading(false);
  }, [profile?.org_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTemplate = useCallback(
    async (input: DocumentTramiteTemplateInput) => {
      if (!profile?.id || !profile.org_id || !canManage) {
        setError("Somente administradores e gestores podem criar trâmites.");
        return null;
      }
      setIsSaving(true);
      setError(null);
      const code = generateTramiteCode(input.code || input.name);
      const validation = validateTramiteGraph(input.graph);
      const templateResult = await supabase
        .from("document_tramite_templates")
        .insert({
          org_id: profile.org_id,
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
          metadata: {},
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
    [canManage, profile?.id, profile?.org_id, refresh],
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
      if (!isMissingRpc(rpc.error)) {
        setError(
          getErrorMessage(
            rpc.error,
            "O banco recusou a publicação do trâmite.",
          ),
        );
        setIsSaving(false);
        return false;
      }

      const version = await ensureDraftVersion(templateId);
      if (!version) {
        setIsSaving(false);
        return false;
      }
      const validation = validateTramiteGraph(version.graph);
      if (!validation.isPublishable) {
        setError(validation.summary);
        setIsSaving(false);
        return false;
      }
      const now = new Date().toISOString();
      await supabase
        .from("document_tramite_template_versions")
        .update({ status: "archived" })
        .eq("template_id", templateId)
        .eq("org_id", profile.org_id)
        .eq("status", "published");
      const versionUpdate = await supabase
        .from("document_tramite_template_versions")
        .update({
          status: "published",
          validation,
          published_by: profile.id,
          published_at: now,
        })
        .eq("id", version.id);
      if (versionUpdate.error) {
        setError(
          getErrorMessage(
            versionUpdate.error,
            "Não foi possível publicar a versão.",
          ),
        );
        setIsSaving(false);
        return false;
      }
      const templateUpdate = await supabase
        .from("document_tramite_templates")
        .update({
          status: "published",
          current_version_id: version.id,
          published_by: profile.id,
          published_at: now,
          updated_by: profile.id,
        })
        .eq("id", templateId);
      if (templateUpdate.error) {
        setError(
          `A versão foi publicada, mas o modelo não foi atualizado. ${getErrorMessage(
            templateUpdate.error,
            "Revise o modelo manualmente.",
          )}`,
        );
        setIsSaving(false);
        return false;
      }
      await supabase.from("document_tramite_events").insert({
        org_id: profile.org_id,
        template_id: templateId,
        version_id: version.id,
        event_type: "published",
        actor_id: profile.id,
        metadata: {
          version_number: version.version_number,
          fallback: "client",
        },
      });
      setIsSaving(false);
      await refresh();
      return true;
    },
    [canManage, ensureDraftVersion, profile?.id, profile?.org_id, refresh],
  );

  const archiveTemplate = useCallback(
    (templateId: string) =>
      updateTemplate(templateId, { status: "archived", is_active: false }),
    [updateTemplate],
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
    canManage,
    refresh,
    createTemplate,
    updateTemplate,
    ensureDraftVersion,
    saveGraph,
    publishTemplate,
    archiveTemplate,
    duplicateTemplate,
  };
}
