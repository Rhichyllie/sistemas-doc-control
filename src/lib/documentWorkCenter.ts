export type DocumentWorkItemType =
  | "tramite_step"
  | "approval"
  | "formal_revision"
  | "draft"
  | "review_due"
  | "suggested_tramite"
  | "attention";

export type DocumentWorkItemOrigin =
  | "tramite"
  | "approval"
  | "revision"
  | "creation";

export type DocumentWorkItemPriority = "critical" | "high" | "medium" | "low";
export type DocumentDeadlineMode =
  | "operational_calendar"
  | "simple_date";

export interface DocumentWorkItem {
  id: string;
  type: DocumentWorkItemType;
  origin: DocumentWorkItemOrigin;
  priority: DocumentWorkItemPriority;
  title: string;
  description: string;
  documentId: string;
  documentCode: string | null;
  documentTitle: string;
  projectId: string | null;
  projectName: string | null;
  docType: string;
  area: string;
  documentStatus: string;
  dueAt: string | null;
  dueAtSuggested?: boolean;
  deadlineMode?: DocumentDeadlineMode;
  businessDaysRemaining?: number | null;
  slaPolicyName?: string | null;
  responsibleName: string | null;
  isMine: boolean;
  createdAt: string;
  statusLabel: string;
  actionLabel: string;
}

export interface DocumentWorkCenterGroups {
  myPending: DocumentWorkItem[];
  overdue: DocumentWorkItem[];
  tramite: DocumentWorkItem[];
  approval: DocumentWorkItem[];
  review: DocumentWorkItem[];
  creation: DocumentWorkItem[];
}

const PRIORITY_ORDER: Record<DocumentWorkItemPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const ACTION_LABELS: Record<DocumentWorkItemType, string> = {
  tramite_step: "Abrir etapa no documento",
  approval: "Abrir aprovação",
  formal_revision: "Continuar revisão",
  draft: "Abrir rascunho",
  review_due: "Planejar revisão",
  suggested_tramite: "Escolher trâmite",
  attention: "Revisar documento",
};

export function isOverdue(value?: string | null, now = new Date()) {
  if (!value) return false;
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59`).getTime()
    : new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp < now.getTime();
}

export function daysUntilWorkItem(value?: string | null, now = new Date()) {
  if (!value) return null;
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59`).getTime()
    : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.ceil((timestamp - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function normalizeWorkItemStatus(status: string, dueAt?: string | null) {
  if (isOverdue(dueAt)) return "Atrasado";
  const labels: Record<string, string> = {
    active: "Em ação",
    pending: "Pendente",
    draft: "Rascunho",
    rejected: "Correção necessária",
    in_review: "Em revisão",
    pending_approval: "Aguardando aprovação",
    published: "Publicado",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

export function calculateWorkItemPriority(input: {
  type: DocumentWorkItemType;
  dueAt?: string | null;
  hasResponsible?: boolean;
  remainingDays?: number | null;
  now?: Date;
}): DocumentWorkItemPriority {
  const now = input.now ?? new Date();
  if (isOverdue(input.dueAt, now)) return "critical";
  if (input.hasResponsible === false && input.type === "tramite_step") {
    return "high";
  }
  const remainingDays =
    input.remainingDays ?? daysUntilWorkItem(input.dueAt, now);
  if (remainingDays !== null && remainingDays <= 3) return "high";
  if (
    input.type === "approval" ||
    input.type === "formal_revision" ||
    input.type === "suggested_tramite"
  ) {
    return "medium";
  }
  return "low";
}

export function explainWorkItem(item: DocumentWorkItem) {
  if (isOverdue(item.dueAt)) {
    return `${item.title} está fora do prazo e precisa de atenção.`;
  }
  if (!item.responsibleName && item.type === "tramite_step") {
    return `${item.title} está ativa, mas não possui responsável legível.`;
  }
  if (item.type === "suggested_tramite") {
    return "Existe um modelo aplicável, mas nenhuma execução foi iniciada.";
  }
  return item.description;
}

export function buildWorkItemAction(type: DocumentWorkItemType) {
  return ACTION_LABELS[type];
}

export function sortWorkItemsByUrgency(items: DocumentWorkItem[]) {
  return [...items].sort((left, right) => {
    const priority =
      PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    if (priority !== 0) return priority;
    if (left.dueAt && right.dueAt) {
      return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    }
    if (left.dueAt) return -1;
    if (right.dueAt) return 1;
    return (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  });
}

export function groupWorkItems(
  items: DocumentWorkItem[],
): DocumentWorkCenterGroups {
  return {
    myPending: items.filter((item) => item.isMine),
    overdue: items.filter((item) => item.priority === "critical"),
    tramite: items.filter((item) => item.origin === "tramite"),
    approval: items.filter((item) => item.origin === "approval"),
    review: items.filter((item) => item.origin === "revision"),
    creation: items.filter((item) => item.origin === "creation"),
  };
}
