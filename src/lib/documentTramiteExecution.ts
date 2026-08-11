import type {
  DocumentTramiteAssignmentType,
  DocumentTramiteNodeType,
} from "@/lib/documentTramiteModel";

export type TramiteExecutionStatus =
  | "active"
  | "completed"
  | "cancelled"
  | "failed";

export type TramiteStepStatus =
  | "pending"
  | "active"
  | "completed"
  | "skipped"
  | "blocked"
  | "cancelled";

export type TramiteStepDecision =
  | "approved"
  | "rejected"
  | "needs_correction"
  | "completed"
  | "acknowledged"
  | "attached"
  | "skipped";

export interface DocumentTramiteInstance {
  id: string;
  org_id: string;
  document_id: string;
  document_version_id: string | null;
  template_id: string;
  template_version_id: string;
  project_id: string | null;
  code: string | null;
  status: TramiteExecutionStatus;
  current_node_keys: string[];
  started_by: string | null;
  cancelled_by: string | null;
  completed_by: string | null;
  started_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
  due_at: string | null;
  cancellation_reason: string | null;
  graph_snapshot: Record<string, unknown>;
  validation_snapshot: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DocumentTramiteInstanceStep {
  id: string;
  org_id: string;
  instance_id: string;
  document_id: string;
  template_id: string;
  template_version_id: string;
  node_key: string;
  node_type: DocumentTramiteNodeType;
  label: string;
  description: string | null;
  status: TramiteStepStatus;
  assignment_type: DocumentTramiteAssignmentType | null;
  assignee_user_id: string | null;
  assignee_group_id: string | null;
  required_role: string | null;
  due_days: number | null;
  due_at: string | null;
  required_evidence: boolean;
  required_file: boolean;
  require_comment: boolean;
  allow_correction: boolean;
  decision: TramiteStepDecision | null;
  comment: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DocumentTramiteInstanceEdge {
  id: string;
  org_id: string;
  instance_id: string;
  document_id: string;
  edge_key: string;
  source_node_key: string;
  target_node_key: string;
  label: string | null;
  condition_type:
    | "always"
    | "approved"
    | "rejected"
    | "needs_correction"
    | "expired"
    | "evidence_missing"
    | "custom";
  condition_value: string | null;
  priority: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DocumentTramiteInstanceEvidence {
  id: string;
  org_id: string;
  instance_id: string;
  step_id: string;
  document_id: string;
  evidence_type: "note" | "file" | "link" | "external_reference";
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_hash: string | null;
  note: string | null;
  uploaded_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DocumentTramiteInstanceEvent {
  id: string;
  org_id: string;
  instance_id: string | null;
  step_id: string | null;
  document_id: string | null;
  event_type:
    | "instance_started"
    | "step_activated"
    | "step_completed"
    | "step_blocked"
    | "evidence_added"
    | "decision_recorded"
    | "instance_completed"
    | "instance_cancelled"
    | "instance_failed"
    | "repaired";
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TramiteActorPermission {
  profileId: string | null;
  role: string | null;
  documentAuthorId: string | null;
  activeGroupIds?: string[];
  delegatedForUserId?: string | null;
}

export interface TramiteStepPermissionResult {
  allowed: boolean;
  reasons: string[];
}

export interface TramiteExecutionSummary {
  totalSteps: number;
  completedSteps: number;
  activeSteps: number;
  pendingSteps: number;
  progress: number;
  isOverdue: boolean;
  nextDueAt: string | null;
}

const INSTANCE_STATUS_LABELS: Record<TramiteExecutionStatus, string> = {
  active: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  failed: "Interrompido",
};

const STEP_STATUS_LABELS: Record<TramiteStepStatus, string> = {
  pending: "Aguardando",
  active: "Em ação",
  completed: "Concluída",
  skipped: "Ignorada",
  blocked: "Bloqueada",
  cancelled: "Cancelada",
};

export function getInstanceStatusLabel(status: TramiteExecutionStatus) {
  return INSTANCE_STATUS_LABELS[status] ?? status;
}

export function getStepStatusLabel(status: TramiteStepStatus) {
  return STEP_STATUS_LABELS[status] ?? status;
}

export function getStepDecisionOptions(
  nodeType: DocumentTramiteNodeType,
): Array<{ value: TramiteStepDecision; label: string; destructive?: boolean }> {
  if (nodeType === "review" || nodeType === "approval") {
    return [
      { value: "approved", label: "Aprovar" },
      {
        value: "needs_correction",
        label: "Solicitar correção",
        destructive: true,
      },
      { value: "rejected", label: "Rejeitar", destructive: true },
    ];
  }
  if (nodeType === "evidence") {
    return [
      { value: "attached", label: "Confirmar evidência" },
      { value: "completed", label: "Concluir etapa" },
    ];
  }
  if (nodeType === "mandatory_reading") {
    return [{ value: "acknowledged", label: "Registrar ciência" }];
  }
  return [{ value: "completed", label: "Concluir etapa" }];
}

export function normalizeDecisionForNodeType(
  nodeType: DocumentTramiteNodeType,
  decision?: string | null,
): TramiteStepDecision {
  const options = getStepDecisionOptions(nodeType);
  return (
    options.find((option) => option.value === decision)?.value ??
    options[0].value
  );
}

export function explainStepRequirement(step: DocumentTramiteInstanceStep) {
  const requirements: string[] = [];
  if (step.require_comment) requirements.push("comentário obrigatório");
  if (step.required_file) requirements.push("arquivo comprobatório");
  else if (step.required_evidence) requirements.push("evidência registrada");
  if (step.due_at) requirements.push("prazo definido");
  return requirements.length
    ? `Requisitos: ${requirements.join(", ")}.`
    : "Esta etapa não possui requisito complementar.";
}

export function canCompleteStepLocally(
  step: DocumentTramiteInstanceStep,
  evidence: DocumentTramiteInstanceEvidence[],
  actor: TramiteActorPermission,
): TramiteStepPermissionResult {
  const reasons: string[] = [];
  if (step.status !== "active") reasons.push("A etapa não está ativa.");
  if (!actor.profileId) reasons.push("Perfil autenticado não disponível.");

  const isManager = actor.role === "admin" || actor.role === "manager";
  const assignment = step.assignment_type ?? "none";
  const isAssigned =
    isManager ||
    ((assignment === "none" ||
      assignment === "author" ||
      assignment === "document_owner") &&
      actor.profileId === actor.documentAuthorId) ||
    (assignment === "specific_user" &&
      (step.assignee_user_id === actor.profileId ||
        (Boolean(actor.delegatedForUserId) &&
          actor.delegatedForUserId === step.assignee_user_id))) ||
    (assignment === "role" && step.required_role === actor.role) ||
    (assignment === "approval_group" &&
      Boolean(
        step.assignee_group_id &&
        actor.activeGroupIds?.includes(step.assignee_group_id),
      ));

  if (!isAssigned) reasons.push("A etapa está atribuída a outro responsável.");
  if (
    step.required_file &&
    !evidence.some(
      (item) => item.step_id === step.id && item.evidence_type === "file",
    )
  ) {
    reasons.push(
      "Esta etapa exige arquivo. Anexe uma evidência de arquivo antes de concluir.",
    );
  } else if (
    step.required_evidence &&
    !evidence.some((item) => item.step_id === step.id)
  ) {
    reasons.push("Registre a evidência obrigatória antes de concluir.");
  }

  return { allowed: reasons.length === 0, reasons };
}

export function summarizeInstance(
  instance: DocumentTramiteInstance,
  steps: DocumentTramiteInstanceStep[],
): TramiteExecutionSummary {
  const actionable = steps.filter(
    (step) => !["start", "end"].includes(step.node_type),
  );
  const completedSteps = actionable.filter((step) =>
    ["completed", "skipped"].includes(step.status),
  ).length;
  const dueDates = actionable
    .filter((step) => step.status === "active" && step.due_at)
    .map((step) => step.due_at!)
    .sort();
  const nextDueAt = dueDates[0] ?? instance.due_at;
  return {
    totalSteps: actionable.length,
    completedSteps,
    activeSteps: actionable.filter((step) => step.status === "active").length,
    pendingSteps: actionable.filter((step) => step.status === "pending").length,
    progress: actionable.length
      ? Math.round((completedSteps / actionable.length) * 100)
      : instance.status === "completed"
        ? 100
        : 0,
    isOverdue:
      instance.status === "active" &&
      Boolean(nextDueAt && new Date(nextDueAt).getTime() < Date.now()),
    nextDueAt: nextDueAt ?? null,
  };
}

export function sortStepsByGraph(
  steps: DocumentTramiteInstanceStep[],
  edges: DocumentTramiteInstanceEdge[],
) {
  const byKey = new Map(steps.map((step) => [step.node_key, step]));
  const startKeys = steps
    .filter((step) => step.node_type === "start")
    .map((step) => step.node_key);
  const ordered: DocumentTramiteInstanceStep[] = [];
  const visited = new Set<string>();
  const queue = startKeys.length
    ? [...startKeys]
    : steps.map((step) => step.node_key);

  while (queue.length) {
    const key = queue.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);
    const step = byKey.get(key);
    if (step) ordered.push(step);
    edges
      .filter((edge) => edge.source_node_key === key)
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          left.target_node_key.localeCompare(right.target_node_key),
      )
      .forEach((edge) => queue.push(edge.target_node_key));
  }

  steps
    .filter((step) => !visited.has(step.node_key))
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .forEach((step) => ordered.push(step));
  return ordered;
}

export function groupActiveSteps(steps: DocumentTramiteInstanceStep[]) {
  return {
    active: steps.filter((step) => step.status === "active"),
    waiting: steps.filter((step) => step.status === "pending"),
    history: steps.filter((step) =>
      ["completed", "skipped", "cancelled"].includes(step.status),
    ),
    blocked: steps.filter((step) => step.status === "blocked"),
  };
}

export function getNextStepPreview(
  step: DocumentTramiteInstanceStep,
  edges: DocumentTramiteInstanceEdge[],
  decision: TramiteStepDecision,
) {
  return edges
    .filter(
      (edge) =>
        edge.source_node_key === step.node_key &&
        (edge.condition_type === "always" ||
          edge.condition_type === decision ||
          (edge.condition_type === "needs_correction" &&
            decision === "needs_correction")),
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.target_node_key.localeCompare(right.target_node_key),
    )
    .map((edge) => edge.target_node_key);
}

export function buildExecutionErrorMessage(
  error: unknown,
  fallback = "Não foi possível concluir a operação do trâmite.",
) {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== "object") return fallback;
  const source = error as Record<string, unknown>;
  const message = [source.message, source.details, source.hint]
    .filter(
      (value): value is string =>
        typeof value === "string" && Boolean(value.trim()),
    )
    .join(" · ");
  if (!message) return fallback;
  if (
    String(source.code ?? "").toUpperCase() === "PGRST202" ||
    message.toLowerCase().includes("could not find the function") ||
    (message.toLowerCase().includes("function") &&
      message.toLowerCase().includes("does not exist"))
  ) {
    return "A execução de trâmites ainda não foi instalada neste ambiente.";
  }
  return message;
}
