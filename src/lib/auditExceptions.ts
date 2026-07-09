export type AuditExceptionSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export type AuditExceptionStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "ignored";

export type AuditExceptionScope = "mine" | "org";
export type AuditExceptionsSchemaState =
  | "available"
  | "not_installed"
  | "restricted"
  | "error";

export interface AuditExceptionFilters {
  from: string;
  to: string;
  scope: AuditExceptionScope;
  severity: "all" | AuditExceptionSeverity;
  status: "all" | AuditExceptionStatus;
  type: string;
  source: string;
  documentId: string;
  projectId: string;
}

export interface AuditExceptionOption {
  value: string;
  label: string;
}

export interface AuditReconciliationCoverageSource {
  key: string;
  status: "available" | "limited" | "summary_only" | "unavailable" | "unknown";
  canonical: boolean | null;
  records: number | null;
  note: string | null;
}

export interface AuditReconciliationRun {
  id: string;
  scope: AuditExceptionScope;
  periodFrom: string | null;
  periodTo: string | null;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  sourceCoverage: Record<string, unknown>;
  recordCounts: Record<string, unknown>;
  exceptionCounts: Record<string, unknown>;
  limitations: string[];
  packageHash: string | null;
  requestedBy: string | null;
  createdAt: string;
}

export interface AuditExceptionItem {
  id: string;
  runId: string | null;
  exceptionType: string;
  severity: AuditExceptionSeverity;
  status: AuditExceptionStatus;
  source: string;
  entityType: string;
  entityId: string | null;
  documentId: string | null;
  projectId: string | null;
  title: string;
  description: string;
  recommendation: string | null;
  evidence: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  ignoredAt: string | null;
  resolutionNote: string | null;
}

export interface AuditExceptionDetail extends AuditExceptionItem {
  document: Record<string, unknown> | null;
  run: Record<string, unknown> | null;
  writeContract: Record<string, unknown>;
}

export interface AuditReconciliationOverview {
  raw: Record<string, unknown>;
  version: string;
  generatedAt: string;
  scope: AuditExceptionScope;
  period: { from: string; to: string };
  filters: Record<string, unknown>;
  sourceCoverage: AuditReconciliationCoverageSource[];
  counts: {
    bySeverity: Partial<Record<AuditExceptionSeverity, number>>;
    byStatus: Partial<Record<AuditExceptionStatus, number>>;
    byType: Record<string, number>;
    bySource: Record<string, number>;
  };
  exceptions: AuditExceptionItem[];
  latestRun: AuditReconciliationRun | null;
  runs: AuditReconciliationRun[];
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

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberRecord(value: unknown) {
  return Object.fromEntries(
    Object.entries(record(value)).map(([key, raw]) => {
      const parsed = Number(raw);
      return [key, Number.isFinite(parsed) ? parsed : 0];
    }),
  ) as Record<string, number>;
}

function severity(value: unknown): AuditExceptionSeverity {
  return value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
    ? value
    : "info";
}

function status(value: unknown): AuditExceptionStatus {
  return value === "acknowledged" ||
    value === "resolved" ||
    value === "ignored"
    ? value
    : "open";
}

function scope(value: unknown): AuditExceptionScope {
  return value === "mine" ? "mine" : "org";
}

function coverageStatus(
  value: unknown,
): AuditReconciliationCoverageSource["status"] {
  return value === "available" ||
    value === "limited" ||
    value === "summary_only" ||
    value === "unavailable"
    ? value
    : "unknown";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCoverage(value: unknown): AuditReconciliationCoverageSource[] {
  return Object.entries(record(value)).map(([key, raw]) => {
    const row = record(raw);
    return {
      key,
      status: coverageStatus(row.status),
      canonical: typeof row.canonical === "boolean" ? row.canonical : null,
      records: numberOrNull(row.records),
      note: stringOrNull(row.note),
    };
  });
}

export function normalizeAuditException(input: unknown): AuditExceptionItem {
  const row = record(input);
  return {
    id: String(row.id ?? ""),
    runId: stringOrNull(row.run_id),
    exceptionType: String(row.exception_type ?? "UNKNOWN_EXCEPTION"),
    severity: severity(row.severity),
    status: status(row.status),
    source: String(row.source ?? "unknown"),
    entityType: String(row.entity_type ?? "entity"),
    entityId: stringOrNull(row.entity_id),
    documentId: stringOrNull(row.document_id),
    projectId: stringOrNull(row.project_id),
    title: String(row.title ?? "Exceção sem título"),
    description: String(row.description ?? ""),
    recommendation: stringOrNull(row.recommendation),
    evidence: record(row.evidence),
    firstSeenAt: String(row.first_seen_at ?? row.created_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? row.created_at ?? ""),
    resolvedAt: stringOrNull(row.resolved_at),
    acknowledgedAt: stringOrNull(row.acknowledged_at),
    ignoredAt: stringOrNull(row.ignored_at),
    resolutionNote: stringOrNull(row.resolution_note),
  };
}

export function normalizeAuditExceptionDetail(
  input: unknown,
): AuditExceptionDetail {
  const row = record(input);
  return {
    ...normalizeAuditException(row),
    document: row.document ? record(row.document) : null,
    run: row.run ? record(row.run) : null,
    writeContract: record(row.write_contract),
  };
}

function normalizeRun(input: unknown): AuditReconciliationRun {
  const row = record(input);
  return {
    id: String(row.id ?? ""),
    scope: scope(row.scope),
    periodFrom: stringOrNull(row.period_from),
    periodTo: stringOrNull(row.period_to),
    status: String(row.status ?? "completed"),
    startedAt: stringOrNull(row.started_at),
    finishedAt: stringOrNull(row.finished_at),
    sourceCoverage: record(row.source_coverage),
    recordCounts: record(row.record_counts),
    exceptionCounts: record(row.exception_counts),
    limitations: array(row.limitations).map(String),
    packageHash: stringOrNull(row.package_hash),
    requestedBy: stringOrNull(row.requested_by),
    createdAt: String(row.created_at ?? ""),
  };
}

export function normalizeAuditReconciliationOverview(
  input: unknown,
): AuditReconciliationOverview {
  const root = record(input);
  const counts = record(root.counts);
  const period = record(root.period);
  const latestRun = root.latest_run ? normalizeRun(root.latest_run) : null;
  return {
    raw: root,
    version: String(root.version ?? "P-27.1"),
    generatedAt: String(root.generated_at ?? ""),
    scope: scope(root.scope),
    period: {
      from: String(period.from ?? ""),
      to: String(period.to ?? ""),
    },
    filters: record(root.filters),
    sourceCoverage: normalizeCoverage(root.source_coverage),
    counts: {
      bySeverity: numberRecord(counts.by_severity) as Partial<
        Record<AuditExceptionSeverity, number>
      >,
      byStatus: numberRecord(counts.by_status) as Partial<
        Record<AuditExceptionStatus, number>
      >,
      byType: numberRecord(counts.by_type),
      bySource: numberRecord(counts.by_source),
    },
    exceptions: array(root.exceptions).map(normalizeAuditException),
    latestRun,
    runs: array(root.runs).map(normalizeRun),
    limitations: array(root.limitations).map(String),
  };
}

export function getDefaultAuditExceptionFilters(
  canViewOrganization: boolean,
  days = 30,
): AuditExceptionFilters {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - Math.max(1, days) + 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    scope: canViewOrganization ? "org" : "mine",
    severity: "all",
    status: "all",
    type: "",
    source: "",
    documentId: "",
    projectId: "",
  };
}

export function getAuditExceptionSeverityLabel(value: AuditExceptionSeverity) {
  const labels: Record<AuditExceptionSeverity, string> = {
    critical: "Crítica",
    high: "Alta",
    medium: "Média",
    low: "Baixa",
    info: "Info",
  };
  return labels[value];
}

export function getAuditExceptionStatusLabel(value: AuditExceptionStatus) {
  const labels: Record<AuditExceptionStatus, string> = {
    open: "Aberta",
    acknowledged: "Reconhecida",
    resolved: "Resolvida",
    ignored: "Ignorada",
  };
  return labels[value];
}

export function getAuditExceptionSourceLabel(source: string) {
  const labels: Record<string, string> = {
    documents: "Documentos",
    document_versions: "Versões formais",
    document_revisions: "Revisões legadas",
    approval_flows: "Aprovações",
    document_tramite_instances: "Instâncias de trâmite",
    document_tramite_instance_steps: "Etapas de trâmite",
    document_tramite_instance_events: "Eventos de trâmite",
    document_tramite_instance_evidence: "Evidências",
    internal_notifications: "Notificações",
    notification_events: "Eventos de notificação",
    audit_trail: "Trilha de auditoria",
    audit_report_exports: "Exportações formais",
    completeness: "Completude",
  };
  return labels[source] ?? source.replaceAll("_", " ");
}

export function getSeverityTone(value: AuditExceptionSeverity) {
  const tones: Record<AuditExceptionSeverity, string> = {
    critical: "border-red-300 bg-red-50 text-red-800",
    high: "border-orange-300 bg-orange-50 text-orange-800",
    medium: "border-amber-300 bg-amber-50 text-amber-800",
    low: "border-sky-300 bg-sky-50 text-sky-800",
    info: "border-slate-300 bg-slate-50 text-slate-700",
  };
  return tones[value];
}

export function getStatusTone(value: AuditExceptionStatus) {
  const tones: Record<AuditExceptionStatus, string> = {
    open: "border-red-200 bg-red-50 text-red-800",
    acknowledged: "border-amber-200 bg-amber-50 text-amber-800",
    resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
    ignored: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return tones[value];
}

export function formatAuditExceptionDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function compactExceptionHash(value: string | null | undefined) {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

export function getOpenExceptionCount(overview: AuditReconciliationOverview | null) {
  return overview?.counts.byStatus.open ?? 0;
}

export function isAuditExceptionsSchemaMissing(error: unknown) {
  const row = record(error);
  const code = String(row.code ?? "").toUpperCase();
  const message = [row.message, row.details, row.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    ["42P01", "42883", "PGRST202", "PGRST205"].includes(code) ||
    message.includes("get_audit_reconciliation_overview") ||
    message.includes("run_audit_reconciliation") ||
    message.includes("audit_reconciliation_runs") ||
    message.includes("audit_reconciliation_exceptions") ||
    message.includes("could not find the function")
  );
}

export function isAuditExceptionsPermissionError(error: unknown) {
  const row = record(error);
  const code = String(row.code ?? "").toUpperCase();
  const message = [row.message, row.details, row.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    ["42501", "PGRST301"].includes(code) ||
    message.includes("permission denied") ||
    message.includes("somente administradores") ||
    message.includes("não pode acessar")
  );
}
