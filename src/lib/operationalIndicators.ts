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

export type IndicatorTone = "neutral" | "positive" | "attention" | "critical";
export type OperationalHealthStatus =
  | "healthy"
  | "attention"
  | "critical"
  | "insufficient";
export type BottleneckDimension =
  | "responsible"
  | "project"
  | "area"
  | "doc_type"
  | "step_type";

export interface OperationalRiskSignal {
  id: string;
  label: string;
  explanation: string;
  count: number;
  tone: IndicatorTone;
  actionUrl: string;
}

export interface OperationalKpiCard {
  id:
    | "sla"
    | "overdue_steps"
    | "cycle_time"
    | "pending_evidence"
    | "critical_notifications"
    | "unavailable_responsibles";
  label: string;
  value: string;
  rawValue: number | null;
  context: string;
  calculation: string;
  tone: IndicatorTone;
  actionUrl?: string;
}

export interface SlaDistributionItem {
  id: "on_time" | "due_soon" | "overdue";
  label: string;
  value: number;
  tone: IndicatorTone;
}

export interface OperationalFlowItem {
  id:
    | "active_instances"
    | "active_steps"
    | "overdue_steps"
    | "completed_steps"
    | "failed_instances";
  label: string;
  value: number | null;
  tone: IndicatorTone;
  description: string;
}

export interface QualitySignal {
  id: string;
  label: string;
  value: number | null;
  explanation: string;
  tone: IndicatorTone;
  actionUrl: string;
}

export type IndicatorViewMode = "management" | "presentation" | "analysis";

export interface GovernanceScoreBreakdownItem {
  id: string;
  label: string;
  penalty: number;
  maxPenalty: number;
  explanation: string;
}

export interface OperationalGovernanceScore {
  score: number | null;
  classification:
    | "Excelente"
    | "Boa"
    | "Atenção"
    | "Crítica"
    | "Dados insuficientes";
  tone: IndicatorTone;
  breakdown: GovernanceScoreBreakdownItem[];
  penalizers: GovernanceScoreBreakdownItem[];
}

export interface TrendComparisonMetric {
  id: "documents" | "steps" | "instances";
  label: string;
  current: number | null;
  previous: number | null;
  deltaPercent: number | null;
  tone: IndicatorTone;
  explanation: string;
}

export interface RiskMatrixSignal {
  id: string;
  label: string;
  count: number;
  impact: "high" | "low";
  urgency: "high" | "low";
  tone: IndicatorTone;
}

export interface QualityScoreSignal {
  id: string;
  label: string;
  governedPercent: number | null;
  occurrences: number | null;
  tone: IndicatorTone;
  explanation: string;
}

export interface ExecutiveInsight {
  id: string;
  title: string;
  description: string;
  tone: IndicatorTone;
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

export function formatDurationHours(hours: number | null) {
  return formatCycleTime(hours);
}

export function formatPercent(value: number | null) {
  return value === null
    ? "—"
    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function formatCount(value: number | null) {
  return value === null ? "—" : value.toLocaleString("pt-BR");
}

export function getSeverityTone(
  severity: string | null | undefined,
): IndicatorTone {
  if (severity === "critical" || severity === "danger") return "critical";
  if (severity === "warning" || severity === "high") return "attention";
  if (severity === "success" || severity === "healthy") return "positive";
  return "neutral";
}

function count(value: number | null) {
  return value ?? 0;
}

export function hasOperationalIndicatorData(
  report: OperationalIndicatorsReport,
) {
  return [
    report.summary.activeDocuments,
    report.summary.activeTramiteInstances,
    report.summary.activeSteps,
    report.documents.createdInPeriod,
    report.tramites.completedStepsInPeriod,
    report.notifications.createdInPeriod,
  ].some((value) => value !== null && value > 0);
}

export function getTopRisks(
  report: OperationalIndicatorsReport,
  limit = 3,
): OperationalRiskSignal[] {
  const signals: OperationalRiskSignal[] = [
    {
      id: "overdue-steps",
      label: "Etapas vencidas",
      explanation: "Trabalho ativo ultrapassou o prazo persistido.",
      count: count(report.summary.overdueSteps),
      tone: "critical",
      actionUrl: "/authenticated/documentos/central",
    },
    {
      id: "critical-notifications",
      label: "Notificações críticas",
      explanation: "Alertas críticos continuam sem leitura.",
      count: count(report.summary.criticalUnreadNotifications),
      tone: "critical",
      actionUrl: "/authenticated/notificacoes",
    },
    {
      id: "open-escalations",
      label: "Escalonamentos abertos",
      explanation: "Escalonamentos aguardam tratamento operacional.",
      count: count(report.summary.openEscalations),
      tone: "critical",
      actionUrl: "/authenticated/notificacoes",
    },
    {
      id: "overdue-reviews",
      label: "Revisões vencidas",
      explanation: "Documentos publicados ultrapassaram a revisão.",
      count: count(report.summary.overdueReviews),
      tone: "critical",
      actionUrl: "/authenticated/documentos/central",
    },
    {
      id: "pending-evidence",
      label: "Evidências pendentes",
      explanation: "Etapas aguardam evidência obrigatória.",
      count: count(report.summary.pendingEvidenceSteps),
      tone: "attention",
      actionUrl: "/authenticated/documentos/central",
    },
    {
      id: "unavailable-responsibles",
      label: "Responsáveis ausentes",
      explanation: "Ausências estão impactando etapas ativas.",
      count: count(report.summary.unavailableResponsiblesWithActiveSteps),
      tone: "attention",
      actionUrl: "/authenticated/equipe",
    },
    {
      id: "without-sla",
      label: "Sem política SLA",
      explanation: "Documentos não encontram política de prazo.",
      count: count(report.sla.withoutSlaPolicy),
      tone: "attention",
      actionUrl: "/authenticated/configuracoes/calendario",
    },
  ];
  const weight: Record<IndicatorTone, number> = {
    critical: 0,
    attention: 1,
    neutral: 2,
    positive: 3,
  };
  return signals
    .filter((signal) => signal.count > 0)
    .sort(
      (left, right) =>
        weight[left.tone] - weight[right.tone] || right.count - left.count,
    )
    .slice(0, limit);
}

export function getHealthStatus(
  report: OperationalIndicatorsReport,
): OperationalHealthStatus {
  const knownSignals = [
    report.summary.activeDocuments,
    report.summary.overdueSteps,
    report.summary.criticalUnreadNotifications,
    report.summary.openEscalations,
    report.sla.complianceRate,
  ];
  if (knownSignals.every((value) => value === null)) return "insufficient";
  if (
    count(report.summary.overdueSteps) > 0 ||
    count(report.summary.criticalUnreadNotifications) > 0 ||
    count(report.summary.openEscalations) > 0 ||
    count(report.summary.overdueReviews) > 0 ||
    (report.sla.complianceRate !== null && report.sla.complianceRate < 70)
  ) {
    return "critical";
  }
  if (
    count(report.summary.dueSoonSteps) > 0 ||
    count(report.summary.pendingEvidenceSteps) > 0 ||
    count(report.summary.unavailableResponsiblesWithActiveSteps) > 0 ||
    count(report.sla.withoutSlaPolicy) > 0 ||
    (report.sla.complianceRate !== null && report.sla.complianceRate < 90)
  ) {
    return "attention";
  }
  return "healthy";
}

export function getHealthNarrative(report: OperationalIndicatorsReport) {
  const status = getHealthStatus(report);
  const risks = getTopRisks(report, 2);
  if (status === "insufficient") {
    return "Ainda não há dados suficientes para classificar a saúde operacional.";
  }
  if (status === "healthy") {
    return "A operação está estável: nenhum sinal crítico foi encontrado no recorte atual.";
  }
  const singularLabels: Record<string, string> = {
    "overdue-steps": "etapa vencida",
    "critical-notifications": "notificação crítica",
    "open-escalations": "escalonamento aberto",
    "overdue-reviews": "revisão vencida",
    "pending-evidence": "evidência pendente",
    "unavailable-responsibles": "responsável ausente",
    "without-sla": "item sem política SLA",
  };
  const details = risks
    .map(
      (risk) =>
        `${formatCount(risk.count)} ${
          risk.count === 1
            ? (singularLabels[risk.id] ?? risk.label.toLowerCase())
            : risk.label.toLowerCase()
        }`,
    )
    .join(" e ");
  return status === "critical"
    ? `A operação está em risco: há ${details}.`
    : `A operação exige atenção: há ${details}.`;
}

export function getKpiCards(
  report: OperationalIndicatorsReport,
): OperationalKpiCard[] {
  const compliance = report.sla.complianceRate;
  const overdue = report.summary.overdueSteps;
  const evidence = report.summary.pendingEvidenceSteps;
  const notifications = report.summary.criticalUnreadNotifications;
  const unavailable = report.summary.unavailableResponsiblesWithActiveSteps;
  return [
    {
      id: "sla",
      label: "Compliance de SLA",
      value: formatPercent(compliance),
      rawValue: compliance,
      context: `${formatCount(report.sla.onTime)} no prazo de ${formatCount(report.sla.totalItemsWithDueDate)} com vencimento`,
      calculation:
        "Itens no prazo divididos pelo total com data de vencimento.",
      tone:
        compliance === null
          ? "neutral"
          : compliance < 70
            ? "critical"
            : compliance < 90
              ? "attention"
              : "positive",
      actionUrl: "/authenticated/configuracoes/calendario",
    },
    {
      id: "overdue_steps",
      label: "Etapas vencidas",
      value: formatCount(overdue),
      rawValue: overdue,
      context: `${formatCount(report.summary.activeSteps)} etapas ativas`,
      calculation: "Etapas ativas com due_at anterior ao momento da leitura.",
      tone: count(overdue) > 0 ? "critical" : "positive",
      actionUrl: "/authenticated/documentos/central",
    },
    {
      id: "cycle_time",
      label: "Tempo médio de ciclo",
      value: formatDurationHours(report.tramites.averageInstanceCycleHours),
      rawValue: report.tramites.averageInstanceCycleHours,
      context: `${formatCount(report.tramites.completedInstancesInPeriod)} instâncias concluídas`,
      calculation: "Média entre início e conclusão das instâncias no período.",
      tone: "neutral",
    },
    {
      id: "pending_evidence",
      label: "Evidências pendentes",
      value: formatCount(evidence),
      rawValue: evidence,
      context: "Exigências ainda não atendidas",
      calculation:
        "Etapas ativas que exigem evidência ou arquivo sem registro válido.",
      tone: count(evidence) > 0 ? "attention" : "positive",
      actionUrl: "/authenticated/documentos/central",
    },
    {
      id: "critical_notifications",
      label: "Notificações críticas",
      value: formatCount(notifications),
      rawValue: notifications,
      context: `${formatCount(report.summary.openEscalations)} escalonamentos abertos`,
      calculation: "Notificações danger/critical não lidas e não dispensadas.",
      tone: count(notifications) > 0 ? "critical" : "positive",
      actionUrl: "/authenticated/notificacoes",
    },
    {
      id: "unavailable_responsibles",
      label: "Ausências com impacto",
      value: formatCount(unavailable),
      rawValue: unavailable,
      context: `${formatCount(report.delegations.activeStepsWithoutSubstitute)} sem substituto`,
      calculation: "Titulares indisponíveis que mantêm etapas ativas.",
      tone: count(unavailable) > 0 ? "attention" : "positive",
      actionUrl: "/authenticated/equipe",
    },
  ];
}

export function getSlaDistribution(
  report: OperationalIndicatorsReport,
): SlaDistributionItem[] {
  return [
    {
      id: "on_time",
      label: "No prazo",
      value: count(report.sla.onTime),
      tone: "positive",
    },
    {
      id: "due_soon",
      label: "Próximo",
      value: count(report.sla.dueSoon),
      tone: "attention",
    },
    {
      id: "overdue",
      label: "Vencido",
      value: count(report.sla.overdue),
      tone: "critical",
    },
  ];
}

export function getBottleneckSeries(
  report: OperationalIndicatorsReport,
  dimension: BottleneckDimension,
) {
  const source: Record<BottleneckDimension, OperationalBottleneck[]> = {
    responsible: report.bottlenecks.byResponsible,
    project: report.bottlenecks.byProject,
    area: report.bottlenecks.byArea,
    doc_type: report.bottlenecks.byDocType,
    step_type: report.bottlenecks.byStepType,
  };
  return source[dimension].slice(0, 8);
}

export function getOperationalFlow(
  report: OperationalIndicatorsReport,
): OperationalFlowItem[] {
  return [
    {
      id: "active_instances",
      label: "Instâncias ativas",
      value: report.tramites.activeInstances,
      tone: "neutral",
      description: "Trâmites em execução.",
    },
    {
      id: "active_steps",
      label: "Etapas ativas",
      value: report.tramites.activeSteps,
      tone: "neutral",
      description: "Trabalho aberto agora.",
    },
    {
      id: "overdue_steps",
      label: "Etapas vencidas",
      value: report.tramites.overdueSteps,
      tone: count(report.tramites.overdueSteps) > 0 ? "critical" : "positive",
      description: "Fora do prazo persistido.",
    },
    {
      id: "completed_steps",
      label: "Concluídas",
      value: report.tramites.completedStepsInPeriod,
      tone: "positive",
      description: "Vazão no período.",
    },
    {
      id: "failed_instances",
      label: "Falhas",
      value: report.tramites.failedInstancesInPeriod,
      tone:
        count(report.tramites.failedInstancesInPeriod) > 0
          ? "critical"
          : "positive",
      description: "Instâncias falhadas no período.",
    },
  ];
}

export function getQualitySignals(
  report: OperationalIndicatorsReport,
): QualitySignal[] {
  return [
    {
      id: "without-code",
      label: "Documentos sem código",
      value: report.quality.documentsWithoutCode,
      explanation: "Reduz rastreabilidade e padronização.",
      tone:
        count(report.quality.documentsWithoutCode) > 0
          ? "attention"
          : "positive",
      actionUrl: "/authenticated/documentos/codificacao",
    },
    {
      id: "without-context",
      label: "Sem projeto ou contexto",
      value: report.quality.documentsWithoutContext,
      explanation: "Dificulta análise por operação.",
      tone:
        count(report.quality.documentsWithoutContext) > 0
          ? "attention"
          : "positive",
      actionUrl: "/authenticated/projetos",
    },
    {
      id: "without-review",
      label: "Sem próxima revisão",
      value: report.quality.documentsWithoutNextReview,
      explanation: "Documento publicado sem horizonte de revisão.",
      tone:
        count(report.quality.documentsWithoutNextReview) > 0
          ? "attention"
          : "positive",
      actionUrl: "/authenticated/documentos/central",
    },
    {
      id: "without-sla",
      label: "Sem política SLA",
      value: report.quality.documentsWithoutSlaPolicy,
      explanation: "Prazo não encontra política aplicável.",
      tone:
        count(report.quality.documentsWithoutSlaPolicy) > 0
          ? "attention"
          : "positive",
      actionUrl: "/authenticated/configuracoes/calendario",
    },
    {
      id: "suggested-not-started",
      label: "Trâmite sugerido não iniciado",
      value: report.quality.documentsWithSuggestedTramiteNotStarted,
      explanation: "Próximo passo documental ainda não confirmado.",
      tone:
        count(report.quality.documentsWithSuggestedTramiteNotStarted) > 0
          ? "attention"
          : "positive",
      actionUrl: "/authenticated/documentos/central",
    },
  ];
}

function penaltyFromRatio(
  occurrences: number | null,
  total: number | null,
  maxPenalty: number,
) {
  if (occurrences === null) return 0;
  if (occurrences <= 0) return 0;
  if (total === null || total <= 0) return maxPenalty;
  return Math.min(maxPenalty, (occurrences / total) * maxPenalty);
}

export function getGovernanceScoreBreakdown(
  report: OperationalIndicatorsReport,
): GovernanceScoreBreakdownItem[] {
  const compliancePenalty =
    report.sla.complianceRate === null
      ? 0
      : Math.max(0, (100 - report.sla.complianceRate) * 0.3);
  const activeDocuments =
    report.documents.activeDocuments ?? report.summary.activeDocuments;
  const activeSteps = report.tramites.activeSteps ?? report.summary.activeSteps;

  return [
    {
      id: "sla",
      label: "Compliance de SLA",
      penalty: compliancePenalty,
      maxPenalty: 30,
      explanation: "Até 30 pontos conforme a distância para 100% de SLA.",
    },
    {
      id: "overdue-steps",
      label: "Etapas vencidas",
      penalty: penaltyFromRatio(report.summary.overdueSteps, activeSteps, 20),
      maxPenalty: 20,
      explanation: "Até 20 pontos pela proporção de etapas ativas vencidas.",
    },
    {
      id: "pending-evidence",
      label: "Evidências pendentes",
      penalty: penaltyFromRatio(
        report.summary.pendingEvidenceSteps,
        activeSteps,
        12,
      ),
      maxPenalty: 12,
      explanation:
        "Até 12 pontos por etapas bloqueadas por evidência obrigatória.",
    },
    {
      id: "critical-notifications",
      label: "Notificações críticas",
      penalty: Math.min(
        15,
        count(report.summary.criticalUnreadNotifications) * 3,
      ),
      maxPenalty: 15,
      explanation: "Três pontos por alerta crítico ainda não tratado.",
    },
    {
      id: "uncovered-absences",
      label: "Ausências sem cobertura",
      penalty: Math.min(
        10,
        count(report.delegations.activeStepsWithoutSubstitute) * 4,
      ),
      maxPenalty: 10,
      explanation: "Até 10 pontos por etapas sem substituto disponível.",
    },
    {
      id: "document-quality",
      label: "Qualidade documental",
      penalty:
        penaltyFromRatio(
          report.quality.documentsWithoutCode,
          activeDocuments,
          5,
        ) +
        penaltyFromRatio(
          report.quality.documentsWithoutContext,
          activeDocuments,
          4,
        ) +
        penaltyFromRatio(
          report.quality.documentsWithoutSlaPolicy,
          activeDocuments,
          4,
        ) +
        penaltyFromRatio(
          report.quality.documentsWithoutNextReview,
          activeDocuments,
          3,
        ),
      maxPenalty: 16,
      explanation:
        "Até 16 pontos por lacunas de código, contexto, SLA e revisão.",
    },
  ].map((item) => ({
    ...item,
    penalty: Math.round(item.penalty * 10) / 10,
  }));
}

export function getScoreTone(score: number | null): IndicatorTone {
  if (score === null) return "neutral";
  if (score >= 90) return "positive";
  if (score >= 75) return "neutral";
  if (score >= 55) return "attention";
  return "critical";
}

export function getGovernanceScore(
  report: OperationalIndicatorsReport,
): OperationalGovernanceScore {
  const measurableSignals = [
    report.sla.complianceRate,
    report.summary.overdueSteps,
    report.summary.pendingEvidenceSteps,
    report.summary.criticalUnreadNotifications,
    report.delegations.activeStepsWithoutSubstitute,
    report.quality.documentsWithoutCode,
    report.quality.documentsWithoutContext,
  ];
  const breakdown = getGovernanceScoreBreakdown(report);

  const knownSignals = measurableSignals.filter(
    (value) => value !== null,
  ).length;
  if (
    report.version.toLowerCase().includes("fallback") ||
    report.sla.complianceRate === null ||
    knownSignals < 4
  ) {
    return {
      score: null,
      classification: "Dados insuficientes",
      tone: "neutral",
      breakdown,
      penalizers: [],
    };
  }

  const totalPenalty = breakdown.reduce(
    (total, item) => total + item.penalty,
    0,
  );
  const score = Math.max(0, Math.round(100 - totalPenalty));
  const classification =
    score >= 90
      ? "Excelente"
      : score >= 75
        ? "Boa"
        : score >= 55
          ? "Atenção"
          : "Crítica";

  return {
    score,
    classification,
    tone: getScoreTone(score),
    breakdown,
    penalizers: [...breakdown]
      .filter((item) => item.penalty > 0)
      .sort((left, right) => right.penalty - left.penalty)
      .slice(0, 3),
  };
}

export function getTrendComparison(
  report: OperationalIndicatorsReport,
): TrendComparisonMetric[] {
  const metrics: Array<
    Omit<TrendComparisonMetric, "deltaPercent" | "tone"> & {
      positiveGrowth: boolean;
    }
  > = [
    {
      id: "documents",
      label: "Documentos criados",
      current: report.trends.documentsCreatedCurrent,
      previous: report.trends.documentsCreatedPrevious,
      positiveGrowth: false,
      explanation:
        "Volume criado no período selecionado contra o intervalo anterior equivalente.",
    },
    {
      id: "steps",
      label: "Etapas concluídas",
      current: report.trends.stepsCompletedCurrent,
      previous: report.trends.stepsCompletedPrevious,
      positiveGrowth: true,
      explanation:
        "Vazão de etapas comparada ao intervalo anterior equivalente.",
    },
    {
      id: "instances",
      label: "Trâmites concluídos",
      current: report.trends.instancesCompletedCurrent,
      previous: report.trends.instancesCompletedPrevious,
      positiveGrowth: true,
      explanation:
        "Instâncias finalizadas comparadas ao intervalo anterior equivalente.",
    },
  ];

  return metrics.map(({ positiveGrowth, ...metric }) => {
    const deltaPercent = calculateTrend(metric.current, metric.previous);
    return {
      ...metric,
      deltaPercent,
      tone:
        deltaPercent === null || deltaPercent === 0 || !positiveGrowth
          ? "neutral"
          : deltaPercent > 0
            ? "positive"
            : "attention",
    };
  });
}

export function getRiskMatrixSignals(
  report: OperationalIndicatorsReport,
): RiskMatrixSignal[] {
  return [
    {
      id: "overdue-steps",
      label: "Etapas vencidas",
      count: count(report.summary.overdueSteps),
      impact: "high",
      urgency: "high",
      tone: "critical",
    },
    {
      id: "critical-notifications",
      label: "Alertas críticos",
      count: count(report.summary.criticalUnreadNotifications),
      impact: "high",
      urgency: "high",
      tone: "critical",
    },
    {
      id: "uncovered-absence",
      label: "Ausências sem cobertura",
      count: count(report.delegations.activeStepsWithoutSubstitute),
      impact: "high",
      urgency: "high",
      tone: "critical",
    },
    {
      id: "pending-evidence",
      label: "Evidências pendentes",
      count: count(report.summary.pendingEvidenceSteps),
      impact: "high",
      urgency: "low",
      tone: "attention",
    },
    {
      id: "without-sla",
      label: "Documentos sem SLA",
      count: count(report.quality.documentsWithoutSlaPolicy),
      impact: "low",
      urgency: "low",
      tone: "attention",
    },
    {
      id: "without-review",
      label: "Sem próxima revisão",
      count: count(report.quality.documentsWithoutNextReview),
      impact: "low",
      urgency: "low",
      tone: "attention",
    },
  ].filter((signal) => signal.count > 0) as RiskMatrixSignal[];
}

export function getQualityScoreGrid(
  report: OperationalIndicatorsReport,
): QualityScoreSignal[] {
  const activeDocuments =
    report.documents.activeDocuments ?? report.summary.activeDocuments;
  const activeSteps = report.tramites.activeSteps ?? report.summary.activeSteps;
  const items = [
    {
      id: "code",
      label: "Codificação",
      occurrences: report.quality.documentsWithoutCode,
      total: activeDocuments,
      explanation: "Documentos com código controlado.",
    },
    {
      id: "context",
      label: "Contexto operacional",
      occurrences: report.quality.documentsWithoutContext,
      total: activeDocuments,
      explanation: "Documentos vinculados a projeto ou contexto.",
    },
    {
      id: "review",
      label: "Revisão programada",
      occurrences: report.quality.documentsWithoutNextReview,
      total: activeDocuments,
      explanation: "Documentos com próxima revisão definida.",
    },
    {
      id: "sla",
      label: "Cobertura de SLA",
      occurrences: report.quality.documentsWithoutSlaPolicy,
      total: activeDocuments,
      explanation: "Documentos cobertos por política de prazo.",
    },
    {
      id: "evidence",
      label: "Evidências atendidas",
      occurrences: report.quality.pendingEvidenceSteps,
      total: activeSteps,
      explanation: "Etapas sem pendência de evidência obrigatória.",
    },
  ];

  return items.map((item) => {
    const governedPercent =
      item.occurrences === null || item.total === null || item.total <= 0
        ? null
        : Math.max(0, Math.round((1 - item.occurrences / item.total) * 100));
    return {
      id: item.id,
      label: item.label,
      governedPercent,
      occurrences: item.occurrences,
      tone:
        governedPercent === null
          ? "neutral"
          : governedPercent >= 90
            ? "positive"
            : governedPercent >= 70
              ? "attention"
              : "critical",
      explanation: item.explanation,
    };
  });
}

function topBottleneck(report: OperationalIndicatorsReport) {
  return [
    ...report.bottlenecks.byResponsible.map((item) => ({
      ...item,
      dimension: "responsável",
    })),
    ...report.bottlenecks.byProject.map((item) => ({
      ...item,
      dimension: "projeto",
    })),
    ...report.bottlenecks.byArea.map((item) => ({
      ...item,
      dimension: "área",
    })),
    ...report.bottlenecks.byStepType.map((item) => ({
      ...item,
      dimension: "tipo de etapa",
    })),
  ].sort((left, right) => right.count - left.count)[0];
}

export function getExecutiveInsights(
  report: OperationalIndicatorsReport,
): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];
  const bottleneck = topBottleneck(report);
  const deadlineRisk =
    report.sla.totalItemsWithDueDate &&
    report.sla.totalItemsWithDueDate > 0 &&
    report.sla.dueSoon !== null &&
    report.sla.overdue !== null
      ? Math.round(
          ((report.sla.dueSoon + report.sla.overdue) /
            report.sla.totalItemsWithDueDate) *
            100,
        )
      : null;

  if (bottleneck) {
    insights.push({
      id: "top-bottleneck",
      title: `Risco concentrado em ${bottleneck.label}`,
      description: `${bottleneck.count} ocorrência(s) no ranking por ${bottleneck.dimension}.`,
      tone: "critical",
    });
  }
  if (deadlineRisk !== null) {
    insights.push({
      id: "deadline-risk",
      title: `${deadlineRisk}% dos itens exigem atenção de prazo`,
      description: "Soma dos itens vencidos e próximos do vencimento.",
      tone:
        deadlineRisk >= 30
          ? "critical"
          : deadlineRisk > 0
            ? "attention"
            : "positive",
    });
  }
  if (count(report.summary.pendingEvidenceSteps) > 0) {
    insights.push({
      id: "pending-evidence",
      title: `${formatCount(report.summary.pendingEvidenceSteps)} evidência(s) pendente(s)`,
      description: "Exigências obrigatórias podem estar bloqueando avanço.",
      tone: "attention",
    });
  }
  if (count(report.delegations.activeStepsWithoutSubstitute) > 0) {
    insights.push({
      id: "uncovered-absence",
      title: `${formatCount(report.delegations.activeStepsWithoutSubstitute)} etapa(s) sem cobertura`,
      description: "Há titular ausente sem substituto operacional disponível.",
      tone: "critical",
    });
  }

  const stepsTrend = calculateTrend(
    report.trends.stepsCompletedCurrent,
    report.trends.stepsCompletedPrevious,
  );
  if (
    report.trends.stepsCompletedCurrent !== null &&
    report.trends.stepsCompletedPrevious !== null
  ) {
    insights.push({
      id: "throughput",
      title: `${formatCount(report.trends.stepsCompletedCurrent)} etapas concluídas no período`,
      description:
        stepsTrend === null
          ? `O período anterior teve ${formatCount(report.trends.stepsCompletedPrevious)} conclusão(ões); não há base percentual válida.`
          : `${stepsTrend >= 0 ? "+" : ""}${stepsTrend}% contra o intervalo anterior equivalente.`,
      tone:
        stepsTrend === null || stepsTrend === 0
          ? "neutral"
          : stepsTrend > 0
            ? "positive"
            : "attention",
    });
  }

  insights.push({
    id: "snapshot-limit",
    title: "Leitura gerencial do recorte atual",
    description:
      "Sem snapshots históricos, o painel não cria série temporal nem substitui fechamento formal.",
    tone: "neutral",
  });

  return insights.slice(0, 6);
}

export function getMeetingSummary(report: OperationalIndicatorsReport) {
  const score = getGovernanceScore(report);
  const bottleneck = topBottleneck(report);
  const recommendations = [...report.recommendations]
    .sort((left, right) => {
      const weight = { critical: 0, warning: 1, info: 2 };
      return weight[left.severity] - weight[right.severity];
    })
    .slice(0, 3);

  return [
    "TRAMITA — Indicadores Operacionais",
    `Período: ${report.period.from} a ${report.period.to}`,
    `Saúde operacional: ${getHealthNarrative(report)}`,
    `Governance Score: ${score.score === null ? "dados insuficientes" : `${score.score}/100 — ${score.classification}`}`,
    `SLA: ${formatPercent(report.sla.complianceRate)} de compliance; ${formatCount(report.summary.overdueSteps)} etapa(s) vencida(s).`,
    `Maior gargalo: ${
      bottleneck
        ? `${bottleneck.label} (${bottleneck.count}, por ${bottleneck.dimension})`
        : "não identificado no recorte"
    }.`,
    `Notificações críticas: ${formatCount(report.summary.criticalUnreadNotifications)}.`,
    "Recomendações:",
    ...(recommendations.length
      ? recommendations.map(
          (item, index) => `${index + 1}. ${item.title} — ${item.explanation}`,
        )
      : ["1. Manter acompanhamento do recorte operacional."]),
    "Limitação: esta é uma leitura visual gerencial; não substitui relatório formal de auditoria nem série histórica por snapshot.",
  ].join("\n");
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
