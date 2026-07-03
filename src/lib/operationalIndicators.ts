export type OperationalIndicatorsScope = "mine" | "org";
export type OperationalIndicatorsSource =
  | "rpc"
  | "fallback"
  | "not_installed"
  | "restricted"
  | "empty"
  | "error";

export interface OperationalIndicatorFilters {
  from: string;
  to: string;
  scope: OperationalIndicatorsScope;
  projectId: string;
  docType: string;
  area: string;
  responsibleUserId: string;
  severity: string;
  status: string;
}

export interface OperationalIndicatorOption {
  value: string;
  label: string;
}

export interface OperationalIndicatorRecommendation {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  explanation: string;
  actionLabel: string;
  actionUrl: string;
}

export interface OperationalBottleneck {
  key: string;
  label: string;
  count: number;
  id?: string;
  documentId?: string;
  documentCode?: string | null;
  documentTitle?: string | null;
  stepType?: string;
  ageHours?: number | null;
  requiredFile?: boolean;
}

export interface OperationalIndicatorsReport {
  version: string;
  generatedAt: string;
  period: { from: string; to: string };
  scope: OperationalIndicatorsScope;
  filters: Record<string, string | null>;
  capabilities: {
    documents: boolean;
    projects: boolean;
    tramites: boolean;
    tramiteEvents: boolean;
    evidence: boolean;
    calendarSla: boolean;
    notifications: boolean;
    availability: boolean;
    auditTrail: boolean;
    formalApprovals: boolean;
    historicalSnapshots: boolean;
    notificationGenerationErrorHistory: boolean;
  };
  summary: {
    activeDocuments: number | null;
    activeTramiteInstances: number | null;
    activeSteps: number | null;
    overdueSteps: number | null;
    dueSoonSteps: number | null;
    overdueReviews: number | null;
    dueSoonReviews: number | null;
    criticalUnreadNotifications: number | null;
    openEscalations: number | null;
    pendingEvidenceSteps: number | null;
    unavailableResponsiblesWithActiveSteps: number | null;
  };
  sla: {
    totalItemsWithDueDate: number | null;
    onTime: number | null;
    dueSoon: number | null;
    overdue: number | null;
    complianceRate: number | null;
    withoutSlaPolicy: number | null;
    deadlineMode: "operational_calendar" | "simple_date";
    explanation: string;
  };
  tramites: {
    activeInstances: number | null;
    completedInstancesInPeriod: number | null;
    failedInstancesInPeriod: number | null;
    completionRate: number | null;
    completedStepsInPeriod: number | null;
    averageStepCycleHours: number | null;
    averageInstanceCycleHours: number | null;
    activeSteps: number | null;
    overdueSteps: number | null;
    dueSoonSteps: number | null;
    stalledActiveSteps: number | null;
    activeStepsWithoutDueDate: number | null;
  };
  documents: {
    activeDocuments: number | null;
    drafts: number | null;
    withoutCode: number | null;
    withoutProject: number | null;
    withoutNextReview: number | null;
    withReviewOverdue: number | null;
    withReviewDueSoon: number | null;
    createdInPeriod: number | null;
    createdPreviousPeriod: number | null;
  };
  notifications: {
    unread: number | null;
    criticalUnread: number | null;
    openEscalations: number | null;
    createdInPeriod: number | null;
    generatedInPeriod: number | null;
    escalatedInPeriod: number | null;
    suppressedInPeriod: number | null;
    lastGenerationAt: string | null;
    lastGenerationErrors: number | null;
  };
  delegations: {
    activeAbsences: number | null;
    activeDelegations: number | null;
    delegatedStepCompletions: number | null;
    unavailableResponsiblesWithActiveSteps: number | null;
    activeStepsWithSubstituteAvailable: number | null;
    activeStepsWithoutSubstitute: number | null;
  };
  quality: {
    documentsWithoutCode: number | null;
    documentsWithoutContext: number | null;
    documentsWithSuggestedTramiteNotStarted: number | null;
    activeStepsWithoutDueDate: number | null;
    documentsWithoutSlaPolicy: number | null;
    documentsWithoutNextReview: number | null;
    pendingEvidenceSteps: number | null;
  };
  bottlenecks: {
    byProject: OperationalBottleneck[];
    byArea: OperationalBottleneck[];
    byDocType: OperationalBottleneck[];
    byStepType: OperationalBottleneck[];
    byResponsible: OperationalBottleneck[];
    evidencePending: OperationalBottleneck[];
    longestStalledSteps: OperationalBottleneck[];
  };
  trends: {
    documentsCreatedCurrent: number | null;
    documentsCreatedPrevious: number | null;
    stepsCompletedCurrent: number | null;
    stepsCompletedPrevious: number | null;
    instancesCompletedCurrent: number | null;
    instancesCompletedPrevious: number | null;
  };
  dimensions: {
    projects: OperationalIndicatorOption[];
    areas: OperationalIndicatorOption[];
    docTypes: OperationalIndicatorOption[];
    responsibles: OperationalIndicatorOption[];
    statuses: OperationalIndicatorOption[];
  };
  recommendations: OperationalIndicatorRecommendation[];
  limitations: string[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function bool(value: unknown) {
  return value === true;
}

function optionList(value: unknown): OperationalIndicatorOption[] {
  return array(value)
    .map(record)
    .map((item) => ({
      value: String(item.value ?? ""),
      label: String(item.label ?? item.value ?? ""),
    }))
    .filter((item) => item.value && item.label);
}

function bottleneckList(value: unknown): OperationalBottleneck[] {
  return array(value)
    .map(record)
    .map((item) => ({
      key: String(item.key ?? item.id ?? ""),
      label: String(item.label ?? "Item operacional"),
      count: numberOrNull(item.count) ?? 1,
      id: stringOrNull(item.id) ?? undefined,
      documentId: stringOrNull(item.document_id) ?? undefined,
      documentCode: stringOrNull(item.document_code),
      documentTitle: stringOrNull(item.document_title),
      stepType: stringOrNull(item.step_type) ?? undefined,
      ageHours: numberOrNull(item.age_hours),
      requiredFile: item.required_file === true,
    }))
    .filter((item) => item.key || item.label);
}

export function getDefaultIndicatorFilters(
  canViewOrganization: boolean,
  days = 30,
): OperationalIndicatorFilters {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - Math.max(1, days) + 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    scope: canViewOrganization ? "org" : "mine",
    projectId: "",
    docType: "",
    area: "",
    responsibleUserId: "",
    severity: "",
    status: "",
  };
}

export function normalizeOperationalIndicators(
  input: unknown,
): OperationalIndicatorsReport {
  const root = record(input);
  const capabilities = record(root.capabilities);
  const summary = record(root.summary);
  const sla = record(root.sla);
  const tramites = record(root.tramites);
  const documents = record(root.documents);
  const notifications = record(root.notifications);
  const delegations = record(root.delegations);
  const quality = record(root.quality);
  const bottlenecks = record(root.bottlenecks);
  const trends = record(root.trends);
  const dimensions = record(root.dimensions);
  const period = record(root.period);

  return {
    version: String(root.version ?? "P-26"),
    generatedAt: String(root.generated_at ?? new Date().toISOString()),
    period: {
      from: String(period.from ?? ""),
      to: String(period.to ?? ""),
    },
    scope: root.scope === "org" ? "org" : "mine",
    filters: Object.fromEntries(
      Object.entries(record(root.filters)).map(([key, value]) => [
        key,
        stringOrNull(value),
      ]),
    ),
    capabilities: {
      documents: bool(capabilities.documents),
      projects: bool(capabilities.projects),
      tramites: bool(capabilities.tramites),
      tramiteEvents: bool(capabilities.tramite_events),
      evidence: bool(capabilities.evidence),
      calendarSla: bool(capabilities.calendar_sla),
      notifications: bool(capabilities.notifications),
      availability: bool(capabilities.availability),
      auditTrail: bool(capabilities.audit_trail),
      formalApprovals: bool(capabilities.formal_approvals),
      historicalSnapshots: bool(capabilities.historical_snapshots),
      notificationGenerationErrorHistory: bool(
        capabilities.notification_generation_error_history,
      ),
    },
    summary: {
      activeDocuments: numberOrNull(summary.active_documents),
      activeTramiteInstances: numberOrNull(summary.active_tramite_instances),
      activeSteps: numberOrNull(summary.active_steps),
      overdueSteps: numberOrNull(summary.overdue_steps),
      dueSoonSteps: numberOrNull(summary.due_soon_steps),
      overdueReviews: numberOrNull(summary.overdue_reviews),
      dueSoonReviews: numberOrNull(summary.due_soon_reviews),
      criticalUnreadNotifications: numberOrNull(
        summary.critical_unread_notifications,
      ),
      openEscalations: numberOrNull(summary.open_escalations),
      pendingEvidenceSteps: numberOrNull(summary.pending_evidence_steps),
      unavailableResponsiblesWithActiveSteps: numberOrNull(
        summary.unavailable_responsibles_with_active_steps,
      ),
    },
    sla: {
      totalItemsWithDueDate: numberOrNull(sla.total_items_with_due_date),
      onTime: numberOrNull(sla.on_time),
      dueSoon: numberOrNull(sla.due_soon),
      overdue: numberOrNull(sla.overdue),
      complianceRate: numberOrNull(sla.compliance_rate),
      withoutSlaPolicy: numberOrNull(sla.without_sla_policy),
      deadlineMode:
        sla.deadline_mode === "operational_calendar"
          ? "operational_calendar"
          : "simple_date",
      explanation: String(
        sla.explanation ??
          "Compliance compara itens dentro do prazo com o total que possui vencimento.",
      ),
    },
    tramites: {
      activeInstances: numberOrNull(tramites.active_instances),
      completedInstancesInPeriod: numberOrNull(
        tramites.completed_instances_in_period,
      ),
      failedInstancesInPeriod: numberOrNull(
        tramites.failed_instances_in_period,
      ),
      completionRate: numberOrNull(tramites.completion_rate),
      completedStepsInPeriod: numberOrNull(tramites.completed_steps_in_period),
      averageStepCycleHours: numberOrNull(tramites.average_step_cycle_hours),
      averageInstanceCycleHours: numberOrNull(
        tramites.average_instance_cycle_hours,
      ),
      activeSteps: numberOrNull(tramites.active_steps),
      overdueSteps: numberOrNull(tramites.overdue_steps),
      dueSoonSteps: numberOrNull(tramites.due_soon_steps),
      stalledActiveSteps: numberOrNull(tramites.stalled_active_steps),
      activeStepsWithoutDueDate: numberOrNull(
        tramites.active_steps_without_due_date,
      ),
    },
    documents: {
      activeDocuments: numberOrNull(documents.active_documents),
      drafts: numberOrNull(documents.drafts),
      withoutCode: numberOrNull(documents.without_code),
      withoutProject: numberOrNull(documents.without_project),
      withoutNextReview: numberOrNull(documents.without_next_review),
      withReviewOverdue: numberOrNull(documents.with_review_overdue),
      withReviewDueSoon: numberOrNull(documents.with_review_due_soon),
      createdInPeriod: numberOrNull(documents.created_in_period),
      createdPreviousPeriod: numberOrNull(documents.created_previous_period),
    },
    notifications: {
      unread: numberOrNull(notifications.unread),
      criticalUnread: numberOrNull(notifications.critical_unread),
      openEscalations: numberOrNull(notifications.open_escalations),
      createdInPeriod: numberOrNull(notifications.created_in_period),
      generatedInPeriod: numberOrNull(notifications.generated_in_period),
      escalatedInPeriod: numberOrNull(notifications.escalated_in_period),
      suppressedInPeriod: numberOrNull(notifications.suppressed_in_period),
      lastGenerationAt: stringOrNull(notifications.last_generation_at),
      lastGenerationErrors: numberOrNull(notifications.last_generation_errors),
    },
    delegations: {
      activeAbsences: numberOrNull(delegations.active_absences),
      activeDelegations: numberOrNull(delegations.active_delegations),
      delegatedStepCompletions: numberOrNull(
        delegations.delegated_step_completions,
      ),
      unavailableResponsiblesWithActiveSteps: numberOrNull(
        delegations.unavailable_responsibles_with_active_steps,
      ),
      activeStepsWithSubstituteAvailable: numberOrNull(
        delegations.active_steps_with_substitute_available,
      ),
      activeStepsWithoutSubstitute: numberOrNull(
        delegations.active_steps_without_substitute,
      ),
    },
    quality: {
      documentsWithoutCode: numberOrNull(quality.documents_without_code),
      documentsWithoutContext: numberOrNull(quality.documents_without_context),
      documentsWithSuggestedTramiteNotStarted: numberOrNull(
        quality.documents_with_suggested_tramite_not_started,
      ),
      activeStepsWithoutDueDate: numberOrNull(
        quality.active_steps_without_due_date,
      ),
      documentsWithoutSlaPolicy: numberOrNull(
        quality.documents_without_sla_policy,
      ),
      documentsWithoutNextReview: numberOrNull(
        quality.documents_without_next_review,
      ),
      pendingEvidenceSteps: numberOrNull(quality.pending_evidence_steps),
    },
    bottlenecks: {
      byProject: bottleneckList(bottlenecks.by_project),
      byArea: bottleneckList(bottlenecks.by_area),
      byDocType: bottleneckList(bottlenecks.by_doc_type),
      byStepType: bottleneckList(bottlenecks.by_step_type),
      byResponsible: bottleneckList(bottlenecks.by_responsible),
      evidencePending: bottleneckList(bottlenecks.evidence_pending),
      longestStalledSteps: bottleneckList(bottlenecks.longest_stalled_steps),
    },
    trends: {
      documentsCreatedCurrent: numberOrNull(trends.documents_created_current),
      documentsCreatedPrevious: numberOrNull(trends.documents_created_previous),
      stepsCompletedCurrent: numberOrNull(trends.steps_completed_current),
      stepsCompletedPrevious: numberOrNull(trends.steps_completed_previous),
      instancesCompletedCurrent: numberOrNull(
        trends.instances_completed_current,
      ),
      instancesCompletedPrevious: numberOrNull(
        trends.instances_completed_previous,
      ),
    },
    dimensions: {
      projects: optionList(dimensions.projects),
      areas: optionList(dimensions.areas),
      docTypes: optionList(dimensions.doc_types),
      responsibles: optionList(dimensions.responsibles),
      statuses: optionList(dimensions.statuses),
    },
    recommendations: array(root.recommendations)
      .map(record)
      .map((item) => ({
        id: String(item.id ?? item.title ?? "operational-recommendation"),
        severity:
          item.severity === "critical"
            ? "critical"
            : item.severity === "warning"
              ? "warning"
              : "info",
        title: String(item.title ?? "Revisar operação"),
        explanation: String(item.explanation ?? ""),
        actionLabel: String(item.action_label ?? "Abrir"),
        actionUrl: String(
          item.action_url ?? "/authenticated/documentos/central",
        ),
      })),
    limitations: array(root.limitations).map(String),
  };
}

export function calculateTrend(
  current: number | null,
  previous: number | null,
) {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatCycleTime(hours: number | null) {
  if (hours === null) return "Não mensurado";
  if (hours < 24) return `${hours.toLocaleString("pt-BR")} h`;
  return `${(hours / 24).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} dias`;
}

export function getIndicatorsSourceMessage(
  source: OperationalIndicatorsSource,
) {
  const messages: Record<OperationalIndicatorsSource, string> = {
    rpc: "Indicadores consolidados pelo ciclo 25, com leitura organizacional segura.",
    fallback:
      "Ciclo 25 ausente. Exibindo um resumo local limitado aos dados permitidos.",
    not_installed:
      "O ciclo 25_TRAMITA_operational_indicators ainda não foi aplicado.",
    restricted: "Seu perfil não possui permissão para o escopo solicitado.",
    empty: "Nenhum dado operacional foi encontrado para os filtros atuais.",
    error: "Não foi possível carregar os indicadores operacionais.",
  };
  return messages[source];
}

export function isMissingIndicatorsRpc(error: unknown) {
  const row = record(error);
  const code = String(row.code ?? "").toUpperCase();
  const message = [row.message, row.details, row.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    ["42883", "PGRST202", "PGRST205"].includes(code) ||
    message.includes("get_operational_indicators") ||
    message.includes("could not find the function")
  );
}

export function isIndicatorsPermissionError(error: unknown) {
  const row = record(error);
  const code = String(row.code ?? "").toUpperCase();
  const message = [row.message, row.details, row.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    ["42501", "PGRST301"].includes(code) ||
    message.includes("permission denied") ||
    message.includes("somente administradores")
  );
}
