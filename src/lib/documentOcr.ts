export type DocumentOcrJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "completed_with_warnings"
  | "partial"
  | "failed"
  | "canceled"
  | "unsupported"
  | "unavailable";

export type DocumentOcrPageStatus =
  | "pending"
  | "extracted"
  | "empty_text_layer"
  | "ocr_extracted"
  | "unreadable"
  | "failed"
  | "skipped"
  | "unsupported";

export type DocumentOcrMethod =
  | "text_layer"
  | "browser_extraction"
  | "manual_text"
  | "external_ocr_placeholder"
  | "unavailable";

export type DocumentOcrSchemaState =
  | "available"
  | "not_installed"
  | "restricted"
  | "error";

export interface DocumentOcrOption {
  value: string;
  label: string;
}

export interface DocumentOcrDocumentRef {
  id: string;
  code: string | null;
  title: string | null;
  docType: string | null;
  area: string | null;
}

export interface DocumentOcrJob {
  id: string;
  documentId: string;
  documentVersionId: string | null;
  evidenceId: string | null;
  document: DocumentOcrDocumentRef | null;
  sourceTable: string | null;
  sourceId: string | null;
  sourceStorageBucket: string | null;
  sourceStoragePath: string | null;
  sourceFileName: string | null;
  sourceMimeType: string | null;
  sourceSizeBytes: number | null;
  sourceChecksum: string | null;
  requestedBy: string | null;
  status: DocumentOcrJobStatus;
  method: DocumentOcrMethod;
  languageHint: string | null;
  pageCount: number | null;
  processedPageCount: number;
  extractedTextLength: number;
  averageConfidence: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  warnings: string[];
  limitations: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string | null;
}

export interface DocumentOcrPage {
  id: string;
  pageNumber: number;
  status: DocumentOcrPageStatus;
  method: DocumentOcrMethod;
  rawText: string | null;
  normalizedText: string | null;
  textHash: string | null;
  confidence: number | null;
  warnings: string[];
  errors: string[];
  metadata: Record<string, unknown>;
}

export interface DocumentOcrOverview {
  raw: Record<string, unknown>;
  feature: Record<string, unknown>;
  countsByStatus: Partial<Record<DocumentOcrJobStatus, number>>;
  totals: {
    jobs: number;
    processedPages: number;
    extractedTextLength: number;
    averageConfidence: number | null;
  };
  jobs: DocumentOcrJob[];
  limitations: string[];
}

export interface DocumentOcrJobDetail {
  raw: Record<string, unknown>;
  job: DocumentOcrJob;
  document: DocumentOcrDocumentRef | null;
  pages: DocumentOcrPage[];
  antiHallucination: Record<string, unknown>;
}

export interface DocumentOcrCreateJobInput {
  documentId: string;
  documentVersionId?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  sourceStorageBucket?: string | null;
  sourceStoragePath?: string | null;
  sourceFileName?: string | null;
  sourceMimeType?: string | null;
  sourceSizeBytes?: number | null;
  sourceChecksum?: string | null;
  method: DocumentOcrMethod;
  languageHint?: string | null;
}

type UnknownRecord = Record<string, unknown>;

const JOB_STATUSES: DocumentOcrJobStatus[] = [
  "queued",
  "processing",
  "completed",
  "completed_with_warnings",
  "partial",
  "failed",
  "canceled",
  "unsupported",
  "unavailable",
];

const PAGE_STATUSES: DocumentOcrPageStatus[] = [
  "pending",
  "extracted",
  "empty_text_layer",
  "ocr_extracted",
  "unreadable",
  "failed",
  "skipped",
  "unsupported",
];

const METHODS: DocumentOcrMethod[] = [
  "text_layer",
  "browser_extraction",
  "manual_text",
  "external_ocr_placeholder",
  "unavailable",
];

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

function stringArray(value: unknown) {
  return array(value).map(String);
}

function jobStatus(value: unknown): DocumentOcrJobStatus {
  return JOB_STATUSES.includes(value as DocumentOcrJobStatus)
    ? (value as DocumentOcrJobStatus)
    : "unavailable";
}

function pageStatus(value: unknown): DocumentOcrPageStatus {
  return PAGE_STATUSES.includes(value as DocumentOcrPageStatus)
    ? (value as DocumentOcrPageStatus)
    : "failed";
}

function method(value: unknown): DocumentOcrMethod {
  return METHODS.includes(value as DocumentOcrMethod)
    ? (value as DocumentOcrMethod)
    : "unavailable";
}

function normalizeDocumentRef(input: unknown): DocumentOcrDocumentRef | null {
  const row = record(input);
  const id = stringOrNull(row.id);
  if (!id) return null;
  return {
    id,
    code: stringOrNull(row.code),
    title: stringOrNull(row.title),
    docType: stringOrNull(row.doc_type ?? row.docType),
    area: stringOrNull(row.area),
  };
}

export function normalizeDocumentOcrJob(input: unknown): DocumentOcrJob {
  const row = record(input);
  return {
    id: String(row.id ?? ""),
    documentId: String(row.document_id ?? row.documentId ?? ""),
    documentVersionId: stringOrNull(row.document_version_id),
    evidenceId: stringOrNull(row.evidence_id),
    document: normalizeDocumentRef(row.document),
    sourceTable: stringOrNull(row.source_table),
    sourceId: stringOrNull(row.source_id),
    sourceStorageBucket: stringOrNull(row.source_storage_bucket),
    sourceStoragePath: stringOrNull(row.source_storage_path),
    sourceFileName: stringOrNull(row.source_file_name),
    sourceMimeType: stringOrNull(row.source_mime_type),
    sourceSizeBytes: numberOrNull(row.source_size_bytes),
    sourceChecksum: stringOrNull(row.source_checksum),
    requestedBy: stringOrNull(row.requested_by),
    status: jobStatus(row.status),
    method: method(row.method),
    languageHint: stringOrNull(row.language_hint),
    pageCount: numberOrNull(row.page_count),
    processedPageCount: numberOrNull(row.processed_page_count) ?? 0,
    extractedTextLength: numberOrNull(row.extracted_text_length) ?? 0,
    averageConfidence: numberOrNull(row.average_confidence),
    startedAt: stringOrNull(row.started_at),
    finishedAt: stringOrNull(row.finished_at),
    errorCode: stringOrNull(row.error_code),
    errorMessage: stringOrNull(row.error_message),
    warnings: stringArray(row.warnings),
    limitations: stringArray(row.limitations),
    metadata: record(row.metadata),
    createdAt: String(row.created_at ?? ""),
    updatedAt: stringOrNull(row.updated_at),
  };
}

export function normalizeDocumentOcrPage(input: unknown): DocumentOcrPage {
  const row = record(input);
  return {
    id: String(row.id ?? `${row.job_id ?? "page"}-${row.page_number ?? ""}`),
    pageNumber: numberOrNull(row.page_number) ?? 0,
    status: pageStatus(row.status),
    method: method(row.method),
    rawText: stringOrNull(row.raw_text),
    normalizedText: stringOrNull(row.normalized_text),
    textHash: stringOrNull(row.text_hash),
    confidence: numberOrNull(row.confidence),
    warnings: stringArray(row.warnings),
    errors: stringArray(row.errors),
    metadata: record(row.metadata),
  };
}

export function normalizeDocumentOcrOverview(
  input: unknown,
): DocumentOcrOverview {
  const root = record(input);
  const totals = record(root.totals);
  const counts = record(root.counts_by_status);
  return {
    raw: root,
    feature: record(root.feature),
    countsByStatus: Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [
        key,
        numberOrNull(value) ?? 0,
      ]),
    ) as Partial<Record<DocumentOcrJobStatus, number>>,
    totals: {
      jobs: numberOrNull(totals.jobs) ?? 0,
      processedPages: numberOrNull(totals.processed_pages) ?? 0,
      extractedTextLength: numberOrNull(totals.extracted_text_length) ?? 0,
      averageConfidence: numberOrNull(totals.average_confidence),
    },
    jobs: array(root.jobs).map(normalizeDocumentOcrJob),
    limitations: stringArray(root.limitations),
  };
}

export function normalizeDocumentOcrJobDetail(
  input: unknown,
): DocumentOcrJobDetail {
  const root = record(input);
  const document = normalizeDocumentRef(root.document);
  const job = normalizeDocumentOcrJob({
    ...record(root.job),
    document,
  });
  return {
    raw: root,
    job,
    document,
    pages: array(root.pages).map(normalizeDocumentOcrPage),
    antiHallucination: record(root.anti_hallucination),
  };
}

export function getDocumentOcrStatusLabel(value: DocumentOcrJobStatus) {
  const labels: Record<DocumentOcrJobStatus, string> = {
    queued: "Na fila",
    processing: "Processando",
    completed: "Concluída",
    completed_with_warnings: "Concluída com avisos",
    partial: "Parcial",
    failed: "Falhou",
    canceled: "Cancelada",
    unsupported: "Incompatível",
    unavailable: "Indisponível",
  };
  return labels[value];
}

export function getDocumentOcrPageStatusLabel(value: DocumentOcrPageStatus) {
  const labels: Record<DocumentOcrPageStatus, string> = {
    pending: "Pendente",
    extracted: "Texto extraído",
    empty_text_layer: "Camada sem texto",
    ocr_extracted: "OCR extraído",
    unreadable: "Ilegível",
    failed: "Falhou",
    skipped: "Ignorada",
    unsupported: "Incompatível",
  };
  return labels[value];
}

export function getDocumentOcrMethodLabel(value: DocumentOcrMethod) {
  const labels: Record<DocumentOcrMethod, string> = {
    text_layer: "Camada de texto",
    browser_extraction: "Extração no navegador",
    manual_text: "Texto manual",
    external_ocr_placeholder: "OCR externo futuro",
    unavailable: "Indisponível",
  };
  return labels[value];
}

export function getDocumentOcrStatusTone(value: DocumentOcrJobStatus) {
  const tones: Record<DocumentOcrJobStatus, string> = {
    queued: "border-sky-200 bg-sky-50 text-sky-800",
    processing: "border-indigo-200 bg-indigo-50 text-indigo-800",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    completed_with_warnings: "border-amber-200 bg-amber-50 text-amber-800",
    partial: "border-amber-200 bg-amber-50 text-amber-800",
    failed: "border-red-200 bg-red-50 text-red-800",
    canceled: "border-slate-200 bg-slate-50 text-slate-700",
    unsupported: "border-orange-200 bg-orange-50 text-orange-800",
    unavailable: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return tones[value];
}

export function getDocumentOcrMethodTone(value: DocumentOcrMethod) {
  const tones: Record<DocumentOcrMethod, string> = {
    text_layer: "border-emerald-200 bg-emerald-50 text-emerald-800",
    browser_extraction: "border-sky-200 bg-sky-50 text-sky-800",
    manual_text: "border-violet-200 bg-violet-50 text-violet-800",
    external_ocr_placeholder: "border-amber-200 bg-amber-50 text-amber-800",
    unavailable: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return tones[value];
}

export function formatDocumentOcrDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatDocumentOcrPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
}

export function formatDocumentOcrFileSize(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function getDocumentOcrPrimaryText(page: DocumentOcrPage) {
  return page.rawText ?? page.normalizedText ?? "";
}

export function buildDocumentOcrTextFromPages(pages: DocumentOcrPage[]) {
  return pages
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => {
      const text = getDocumentOcrPrimaryText(page);
      return [
        `--- Página ${page.pageNumber} (${getDocumentOcrPageStatusLabel(page.status)}) ---`,
        text || "[sem texto extraído; confira o arquivo original]",
      ].join("\n");
    })
    .join("\n\n");
}

export function buildManualTextPages(text: string) {
  const trimmed = text.trim();
  return [
    {
      page_number: 1,
      status: trimmed ? "extracted" : "unreadable",
      method: "manual_text",
      raw_text: trimmed || null,
      normalized_text: trimmed || null,
      confidence: null,
      warnings: [
        "Texto informado manualmente por usuário autorizado; confira contra o arquivo original.",
      ],
      errors: [],
      metadata: {
        source: "manual_text_form",
        does_not_interpret_content: true,
      },
    },
  ];
}

export function downloadDocumentOcrText(job: DocumentOcrJob, text: string) {
  const safeDocument = job.document?.code || job.documentId || "documento";
  const fileName = `tramita-ocr-${safeDocument}-${new Date()
    .toISOString()
    .slice(0, 10)}.txt`
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return fileName;
}

export function isDocumentOcrSchemaMissing(error: unknown) {
  const row = record(error);
  const code = String(row.code ?? "").toUpperCase();
  const message = [row.message, row.details, row.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    ["42P01", "42883", "PGRST202", "PGRST205"].includes(code) ||
    message.includes("document_ocr_jobs") ||
    message.includes("document_ocr_pages") ||
    message.includes("create_document_ocr_job") ||
    message.includes("get_document_ocr_overview") ||
    message.includes("get_document_ocr_job") ||
    message.includes("store_document_ocr_result") ||
    message.includes("get_document_ocr_text") ||
    message.includes("could not find the function")
  );
}

export function isDocumentOcrPermissionError(error: unknown) {
  const row = record(error);
  const code = String(row.code ?? "").toUpperCase();
  const message = [row.message, row.details, row.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    ["42501", "PGRST301"].includes(code) ||
    message.includes("permission denied") ||
    message.includes("sem permissão") ||
    message.includes("não pode") ||
    message.includes("somente administradores")
  );
}
