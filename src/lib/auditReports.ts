export type AuditReportType =
  | "operational"
  | "document"
  | "sla"
  | "evidence_workflow";
export type AuditReportScope = "mine" | "org";
export type AuditReportFormat = "json" | "csv" | "pdf" | "summary";
export type AuditReportsSchemaState =
  | "available"
  | "not_installed"
  | "restricted"
  | "error";

export interface AuditReportFilters {
  reportType: AuditReportType;
  from: string;
  to: string;
  scope: AuditReportScope;
  documentId: string;
  projectId: string;
  docType: string;
  area: string;
  status: string;
}

export interface AuditReportOption {
  value: string;
  label: string;
}

export interface AuditTimelineEvent {
  source: string;
  eventType: string;
  occurredAt: string;
  documentId: string | null;
  entityId: string | null;
  instanceId: string | null;
  stepId: string | null;
  actorId: string | null;
  details: Record<string, unknown>;
}

export interface AuditSourceCoverage {
  key: string;
  status: "available" | "limited" | "summary_only" | "unavailable" | "unknown";
  canonical: boolean | null;
  records: number | null;
  note: string | null;
}

export interface AuditReportPackage {
  raw: Record<string, unknown>;
  manifest: Record<string, unknown>;
  organization: Record<string, unknown>;
  generatedBy: Record<string, unknown>;
  reportType: AuditReportType;
  reportPeriod: { from: string; to: string };
  filters: Record<string, unknown>;
  capabilities: Record<string, boolean>;
  sourceCoverage: AuditSourceCoverage[];
  operationalSummary: Record<string, unknown>;
  documentSummary: Record<string, unknown>;
  timeline: AuditTimelineEvent[];
  documents: Array<Record<string, unknown>>;
  versions: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
  approvalFlows: Array<Record<string, unknown>>;
  tramiteInstances: Array<Record<string, unknown>>;
  tramiteSteps: Array<Record<string, unknown>>;
  tramiteEvents: Array<Record<string, unknown>>;
  evidences: Array<Record<string, unknown>>;
  notificationsSummary: Record<string, unknown>;
  slaSummary: Record<string, unknown>;
  auditEvents: Array<Record<string, unknown>>;
  recordCounts: Record<string, unknown>;
  limitations: string[];
}

export interface AuditExportHistoryEntry {
  id: string;
  reportType: AuditReportType;
  reportFormat: AuditReportFormat;
  scope: AuditReportScope;
  periodFrom: string | null;
  periodTo: string | null;
  documentId: string | null;
  projectId: string | null;
  filters: Record<string, unknown>;
  manifest: Record<string, unknown>;
  recordCounts: Record<string, unknown>;
  integrityHash: string | null;
  fileName: string | null;
  generatedAt: string;
  requestedBy: string;
  requestedByName: string | null;
  documentLabel: string | null;
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

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function reportType(value: unknown): AuditReportType {
  return value === "document" ||
    value === "sla" ||
    value === "evidence_workflow"
    ? value
    : "operational";
}

function sourceStatus(value: unknown): AuditSourceCoverage["status"] {
  return value === "available" ||
    value === "limited" ||
    value === "summary_only" ||
    value === "unavailable"
    ? value
    : "unknown";
}

function records(value: unknown) {
  return array(value).map(record);
}

export function getDefaultAuditReportFilters(
  canViewOrganization: boolean,
  days = 30,
): AuditReportFilters {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - Math.max(1, days) + 1);
  return {
    reportType: "operational",
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    scope: canViewOrganization ? "org" : "mine",
    documentId: "",
    projectId: "",
    docType: "",
    area: "",
    status: "",
  };
}

export function normalizeAuditReportPackage(
  input: unknown,
): AuditReportPackage {
  const root = record(input);
  const period = record(root.report_period);
  const coverage = record(root.source_coverage);
  return {
    raw: root,
    manifest: record(root.manifest),
    organization: record(root.organization),
    generatedBy: record(root.generated_by),
    reportType: reportType(root.report_type),
    reportPeriod: {
      from: String(period.from ?? ""),
      to: String(period.to ?? ""),
    },
    filters: record(root.filters),
    capabilities: Object.fromEntries(
      Object.entries(record(root.capabilities)).map(([key, value]) => [
        key,
        value === true,
      ]),
    ),
    sourceCoverage: Object.entries(coverage).map(([key, value]) => {
      const row = record(value);
      return {
        key,
        status: sourceStatus(row.status),
        canonical: typeof row.canonical === "boolean" ? row.canonical : null,
        records:
          numberOrNull(row.records) ??
          numberOrNull(row.instances) ??
          numberOrNull(row.steps),
        note: stringOrNull(row.note),
      };
    }),
    operationalSummary: record(root.operational_summary),
    documentSummary: record(root.document_summary),
    timeline: array(root.timeline).map((value) => {
      const row = record(value);
      return {
        source: String(row.source ?? "unknown"),
        eventType: String(row.event_type ?? "event"),
        occurredAt: String(row.occurred_at ?? ""),
        documentId: stringOrNull(row.document_id),
        entityId: stringOrNull(row.entity_id),
        instanceId: stringOrNull(row.instance_id),
        stepId: stringOrNull(row.step_id),
        actorId: stringOrNull(row.actor_id),
        details: record(row.details),
      };
    }),
    documents: records(root.documents),
    versions: records(root.versions),
    revisions: records(root.revisions),
    approvalFlows: records(root.approval_flows),
    tramiteInstances: records(root.tramite_instances),
    tramiteSteps: records(root.tramite_steps),
    tramiteEvents: records(root.tramite_events),
    evidences: records(root.evidences),
    notificationsSummary: record(root.notifications_summary),
    slaSummary: record(root.sla_summary),
    auditEvents: records(root.audit_events),
    recordCounts: record(root.record_counts),
    limitations: array(root.limitations).map(String),
  };
}

const VOLATILE_HASH_KEYS = new Set([
  "integrity_hash",
  "technical_signature",
  "exported_at",
  "registered_export_id",
]);

function stableValue(value: unknown, key?: string): unknown {
  if (key && VOLATILE_HASH_KEYS.has(key)) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as UnknownRecord)
        .sort()
        .flatMap((childKey) => {
          const normalized = stableValue(
            (value as UnknownRecord)[childKey],
            childKey,
          );
          return normalized === undefined ? [] : [[childKey, normalized]];
        }),
    );
  }
  return value;
}

export function canonicalizeAuditPackage(data: unknown) {
  return JSON.stringify(stableValue(data));
}

export async function calculateAuditPackageHash(data: unknown) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API indisponível neste navegador.");
  }
  const bytes = new TextEncoder().encode(canonicalizeAuditPackage(data));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function buildOfficialAuditPackage(
  report: AuditReportPackage,
  integrityHash: string,
) {
  return {
    ...report.raw,
    technical_signature: {
      algorithm: "SHA-256",
      canonicalization: "TRAMITA_CANONICAL_JSON_V1",
      integrity_hash: integrityHash,
      notice:
        "Este hash técnico ajuda a verificar integridade do pacote exportado. Ele não substitui assinatura digital ICP-Brasil.",
    },
    exported_at: new Date().toISOString(),
  };
}

function downloadBlob(fileName: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadOfficialAuditJson(
  report: AuditReportPackage,
  integrityHash: string,
) {
  const fileName = `tramita-auditoria-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  downloadBlob(
    fileName,
    JSON.stringify(buildOfficialAuditPackage(report, integrityHash), null, 2),
    "application/json;charset=utf-8",
  );
  return fileName;
}

function csvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csvFromRows(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "\uFEFF";
  const columns = Array.from(
    rows.reduce((keys, row) => {
      Object.keys(row).forEach((key) => keys.add(key));
      return keys;
    }, new Set<string>()),
  );
  return `\uFEFF${[
    columns.map(csvValue).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvValue(row[column])).join(","),
    ),
  ].join("\n")}`;
}

export function downloadAuditTimelineCsv(report: AuditReportPackage) {
  const fileName = `tramita-auditoria-timeline-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  downloadBlob(
    fileName,
    csvFromRows(
      report.timeline.map((event) => ({
        source: event.source,
        event_type: event.eventType,
        occurred_at: event.occurredAt,
        document_id: event.documentId,
        entity_id: event.entityId,
        actor_id: event.actorId,
        details: event.details,
      })),
    ),
    "text/csv;charset=utf-8",
  );
  return fileName;
}

export function downloadAuditEvidencesCsv(report: AuditReportPackage) {
  const fileName = `tramita-auditoria-evidencias-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  downloadBlob(
    fileName,
    csvFromRows(report.evidences),
    "text/csv;charset=utf-8",
  );
  return fileName;
}

export function getAuditReportTypeLabel(type: AuditReportType) {
  const labels: Record<AuditReportType, string> = {
    operational: "Auditoria operacional por período",
    document: "Auditoria de documento",
    sla: "SLA e prazos",
    evidence_workflow: "Evidências e workflow",
  };
  return labels[type];
}

export function getAuditSourceLabel(source: string) {
  const labels: Record<string, string> = {
    documents: "Documentos",
    document_versions: "Versões formais",
    document_revisions: "Revisões legadas",
    approval_flows: "Aprovações formais",
    tramite_execution: "Execução de trâmites",
    tramite_events: "Eventos de trâmite",
    evidences: "Evidências",
    notifications: "Notificações",
    audit_trail: "Trilha de auditoria",
    legacy_audit_sources: "Auditoria legada",
    sla: "SLA e prazos",
  };
  return labels[source] ?? source.replaceAll("_", " ");
}

export function countAuditRecords(report: AuditReportPackage) {
  return [
    report.documents.length,
    report.versions.length,
    report.revisions.length,
    report.approvalFlows.length,
    report.tramiteInstances.length,
    report.tramiteSteps.length,
    report.tramiteEvents.length,
    report.evidences.length,
    report.auditEvents.length,
  ].reduce((sum, value) => sum + value, 0);
}

export function buildAuditSummary(
  report: AuditReportPackage,
  integrityHash: string | null,
) {
  const sources = report.sourceCoverage.filter(
    (source) => source.status === "available",
  ).length;
  const mainEvents = report.timeline.slice(0, 5);
  return [
    "TRAMITA — Relatório Formal de Auditoria",
    `Tipo: ${getAuditReportTypeLabel(report.reportType)}`,
    `Período: ${report.reportPeriod.from} a ${report.reportPeriod.to}`,
    `Escopo: ${String(report.filters.scope ?? "—")}`,
    `Organização: ${String(report.organization.name ?? "—")}`,
    `Gerado por: ${String(report.generatedBy.full_name ?? report.generatedBy.id ?? "—")}`,
    `Registros retornados: ${countAuditRecords(report)}`,
    `Fontes disponíveis: ${sources} de ${report.sourceCoverage.length}`,
    "Principais eventos:",
    ...(mainEvents.length
      ? mainEvents.map(
          (event, index) =>
            `${index + 1}. ${event.occurredAt} — ${event.eventType} (${event.source})`,
        )
      : ["1. Nenhum evento no recorte."]),
    "Limitações:",
    ...report.limitations.map(
      (limitation, index) => `${index + 1}. ${limitation}`,
    ),
    `Hash técnico SHA-256: ${integrityHash ?? "indisponível"}`,
    "Este hash técnico ajuda a verificar integridade do pacote exportado. Ele não substitui assinatura digital ICP-Brasil.",
  ].join("\n");
}

export function formatAuditDateTime(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export function compactHash(value: string | null | undefined) {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

export function isAuditReportsSchemaMissing(error: unknown) {
  const row = record(error);
  const code = String(row.code ?? "").toUpperCase();
  const message = [row.message, row.details, row.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    ["42P01", "42883", "PGRST202", "PGRST205"].includes(code) ||
    message.includes("get_audit_report_package") ||
    message.includes("register_audit_report_export") ||
    message.includes("audit_report_exports") ||
    message.includes("could not find the function")
  );
}

export function isAuditReportsPermissionError(error: unknown) {
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
