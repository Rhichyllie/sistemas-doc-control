export type DocumentTramiteNodeType =
  | "start"
  | "draft"
  | "review"
  | "approval"
  | "correction"
  | "evidence"
  | "mandatory_reading"
  | "publication"
  | "decision"
  | "end"
  | "custom";

export type DocumentTramiteEdgeCondition =
  | "always"
  | "approved"
  | "rejected"
  | "needs_correction"
  | "expired"
  | "evidence_missing"
  | "custom";

export type DocumentTramiteAssignmentType =
  | "none"
  | "author"
  | "document_owner"
  | "specific_user"
  | "approval_group"
  | "role";

export type DocumentTramiteTemplateStatus = "draft" | "published" | "archived";

export type DocumentTramiteTemplateScope =
  | "organization"
  | "project"
  | "area"
  | "type"
  | "area_type";

export interface DocumentTramiteNode {
  id: string;
  node_key: string;
  node_type: DocumentTramiteNodeType;
  label: string;
  description: string;
  position: { x: number; y: number };
  assignment_type: DocumentTramiteAssignmentType;
  assignee_user_id: string | null;
  assignee_group_id: string | null;
  required_role: string | null;
  due_days: number | null;
  required_evidence: boolean;
  required_file: boolean;
  require_comment: boolean;
  allow_correction: boolean;
  instructions: string;
  metadata: Record<string, unknown>;
}

export interface DocumentTramiteEdge {
  id: string;
  edge_key: string;
  source: string;
  target: string;
  label: string;
  condition_type: DocumentTramiteEdgeCondition;
  condition_value: string | null;
  priority: number;
  metadata: Record<string, unknown>;
}

export interface DocumentTramiteGraph {
  nodes: DocumentTramiteNode[];
  edges: DocumentTramiteEdge[];
}

export interface DocumentTramiteTemplate {
  id: string;
  org_id: string;
  code: string;
  name: string;
  description: string | null;
  status: DocumentTramiteTemplateStatus;
  template_scope: DocumentTramiteTemplateScope;
  doc_type: string | null;
  area: string | null;
  project_id: string | null;
  is_default: boolean;
  is_active: boolean;
  current_version_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  published_by: string | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  current_version?: DocumentTramiteTemplateVersion | null;
  published_version?: DocumentTramiteTemplateVersion | null;
  working_version?: DocumentTramiteTemplateVersion | null;
}

export interface DocumentTramiteTemplateVersion {
  id: string;
  org_id: string;
  template_id: string;
  version_number: number;
  status: DocumentTramiteTemplateStatus;
  graph: DocumentTramiteGraph;
  validation: Record<string, unknown>;
  nodes_count: number;
  edges_count: number;
  created_by: string | null;
  published_by: string | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DocumentTramiteValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  nodeId?: string;
  edgeId?: string;
}

export interface DocumentTramiteValidationResult {
  isValid: boolean;
  isPublishable: boolean;
  errors: DocumentTramiteValidationIssue[];
  warnings: DocumentTramiteValidationIssue[];
  summary: string;
}

export interface DocumentTramitePreset {
  id: string;
  name: string;
  description: string;
  graph: DocumentTramiteGraph;
}

export interface DocumentTramiteSimulationContext {
  docType?: string | null;
  area?: string | null;
  projectId?: string | null;
  hasFile: boolean;
  hasEvidence: boolean;
  approvalDecision: "approved" | "rejected";
}

export interface DocumentTramiteSimulationStep {
  nodeId: string;
  label: string;
  nodeType: DocumentTramiteNodeType;
  responsible: string;
  dueDays: number | null;
}

export interface DocumentTramiteSimulationResult {
  completed: boolean;
  path: DocumentTramiteSimulationStep[];
  blockers: string[];
  tasks: string[];
  warnings: string[];
}

const NODE_LABELS: Record<DocumentTramiteNodeType, string> = {
  start: "Início",
  draft: "Elaboração",
  review: "Revisão técnica",
  approval: "Aprovação",
  correction: "Correção",
  evidence: "Evidência obrigatória",
  mandatory_reading: "Ciência obrigatória",
  publication: "Publicação",
  decision: "Decisão",
  end: "Fim",
  custom: "Etapa personalizada",
};

const NODE_DESCRIPTIONS: Record<DocumentTramiteNodeType, string> = {
  start: "Ponto inicial do trâmite documental.",
  draft: "Preparação ou complementação do documento.",
  review: "Validação técnica antes da aprovação.",
  approval: "Decisão formal de aprovação ou rejeição.",
  correction: "Retorno controlado para ajuste sem perder rastreabilidade.",
  evidence: "Exige evidência ou arquivo comprobatório.",
  mandatory_reading: "Registra ciência obrigatória após disponibilização.",
  publication: "Torna o documento válido e disponível.",
  decision: "Ramifica o caminho conforme uma condição.",
  end: "Encerra o trâmite.",
  custom: "Etapa operacional específica da organização.",
};

const EDGE_LABELS: Record<DocumentTramiteEdgeCondition, string> = {
  always: "Sempre",
  approved: "Se aprovado",
  rejected: "Se rejeitado",
  needs_correction: "Se precisar correção",
  expired: "Se vencido",
  evidence_missing: "Se faltar evidência",
  custom: "Condição personalizada",
};

function identifier(prefix: string) {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${uuid}`;
}

export function getTramiteNodeTypeLabel(type: DocumentTramiteNodeType) {
  return NODE_LABELS[type];
}

export function getTramiteNodeTypeDescription(type: DocumentTramiteNodeType) {
  return NODE_DESCRIPTIONS[type];
}

export function getEdgeConditionLabel(condition: DocumentTramiteEdgeCondition) {
  return EDGE_LABELS[condition];
}

export function getDefaultNodeConfig(type: DocumentTramiteNodeType) {
  const needsActor = [
    "review",
    "approval",
    "evidence",
    "mandatory_reading",
  ].includes(type);
  return {
    assignment_type: (needsActor ? "role" : "none") as "role" | "none",
    required_role:
      type === "review"
        ? "reviewer"
        : type === "approval"
          ? "approver"
          : needsActor
            ? "manager"
            : null,
    allow_correction: ["draft", "review", "approval", "correction"].includes(
      type,
    ),
  };
}

export function createTramiteNode(
  type: DocumentTramiteNodeType,
  position = { x: 80, y: 80 },
  overrides: Partial<DocumentTramiteNode> = {},
): DocumentTramiteNode {
  const id = overrides.id ?? identifier("node");
  const defaults = getDefaultNodeConfig(type);
  return {
    id,
    node_key: overrides.node_key ?? id,
    node_type: type,
    label: overrides.label ?? getTramiteNodeTypeLabel(type),
    description: overrides.description ?? getTramiteNodeTypeDescription(type),
    position: overrides.position ?? position,
    assignment_type: overrides.assignment_type ?? defaults.assignment_type,
    assignee_user_id: overrides.assignee_user_id ?? null,
    assignee_group_id: overrides.assignee_group_id ?? null,
    required_role: overrides.required_role ?? defaults.required_role,
    due_days: overrides.due_days ?? null,
    required_evidence: overrides.required_evidence ?? type === "evidence",
    required_file: overrides.required_file ?? type === "evidence",
    require_comment: overrides.require_comment ?? false,
    allow_correction: overrides.allow_correction ?? defaults.allow_correction,
    instructions: overrides.instructions ?? "",
    metadata: overrides.metadata ?? {},
  };
}

export function createTramiteEdge(
  source: string,
  target: string,
  condition: DocumentTramiteEdgeCondition = "always",
  overrides: Partial<DocumentTramiteEdge> = {},
): DocumentTramiteEdge {
  const id = overrides.id ?? identifier("edge");
  return {
    id,
    edge_key: overrides.edge_key ?? id,
    source,
    target,
    label:
      overrides.label ??
      (condition === "always" ? "" : getEdgeConditionLabel(condition)),
    condition_type: condition,
    condition_value: overrides.condition_value ?? null,
    priority: overrides.priority ?? 100,
    metadata: overrides.metadata ?? {},
  };
}

export function createEmptyTramiteGraph(): DocumentTramiteGraph {
  const start = createTramiteNode("start", { x: 80, y: 180 });
  const end = createTramiteNode("end", { x: 720, y: 180 });
  return {
    nodes: [start, end],
    edges: [createTramiteEdge(start.id, end.id)],
  };
}

export function explainTramiteNode(node: DocumentTramiteNode) {
  const actor =
    node.assignment_type === "approval_group"
      ? "grupo de aprovação"
      : node.assignment_type === "specific_user"
        ? "usuário específico"
        : node.assignment_type === "role"
          ? `papel ${node.required_role || "a definir"}`
          : node.assignment_type === "author"
            ? "autor do documento"
            : node.assignment_type === "document_owner"
              ? "dono do documento"
              : "sem responsável";
  return `${node.label}: ${NODE_DESCRIPTIONS[node.node_type]} Responsável: ${actor}.`;
}

export function explainTramiteEdge(edge: DocumentTramiteEdge) {
  return `${getEdgeConditionLabel(edge.condition_type)}: segue de ${edge.source} para ${edge.target}.`;
}

export function summarizeTramiteGraph(graph: DocumentTramiteGraph) {
  const actionable = graph.nodes.filter(
    (node) => !["start", "end", "decision"].includes(node.node_type),
  );
  const actorSteps = actionable.filter(
    (node) => node.assignment_type !== "none",
  );
  const deadlineSteps = actionable.filter((node) => node.due_days !== null);
  return {
    nodesCount: graph.nodes.length,
    edgesCount: graph.edges.length,
    actionableSteps: actionable.length,
    actorSteps: actorSteps.length,
    deadlineSteps: deadlineSteps.length,
    estimatedDays: deadlineSteps.reduce(
      (total, node) => total + (node.due_days ?? 0),
      0,
    ),
  };
}

export function generateTramiteCode(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return normalized || "TRAMITE";
}
