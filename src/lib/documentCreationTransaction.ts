export interface TransactionalDocumentCreationResult {
  success: boolean;
  documentId: string;
  code: string;
  codeResult: Record<string, unknown> | null;
  versionId: string | null;
  warnings: string[];
  fallbackUsed: boolean;
  nextAction: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isTransactionalDocumentCreationUnavailable(error: unknown) {
  if (!isRecord(error)) return false;
  const code = String(error.code ?? "").toUpperCase();
  const message = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return (
    code === "PGRST202" ||
    (code === "42883" && message.includes("create_document_transactional")) ||
    (message.includes("could not find the function") &&
      message.includes("create_document_transactional")) ||
    (message.includes("function does not exist") &&
      message.includes("create_document_transactional")) ||
    (message.includes("schema cache") &&
      message.includes("create_document_transactional")) ||
    (message.includes("create_document_transactional") &&
      message.includes("not found"))
  );
}

export function normalizeTransactionalDocumentCreationResult(
  value: unknown,
): TransactionalDocumentCreationResult | null {
  if (!isRecord(value)) return null;
  const documentId =
    typeof value.document_id === "string" ? value.document_id : "";
  const code = typeof value.code === "string" ? value.code : "";
  if (value.success !== true || !documentId || !code) return null;

  return {
    success: true,
    documentId,
    code,
    codeResult: isRecord(value.code_result) ? value.code_result : null,
    versionId: typeof value.version_id === "string" ? value.version_id : null,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter(
          (warning): warning is string => typeof warning === "string",
        )
      : [],
    fallbackUsed: value.fallback_used === true,
    nextAction:
      typeof value.next_action === "string"
        ? value.next_action
        : "open_document_detail",
  };
}
