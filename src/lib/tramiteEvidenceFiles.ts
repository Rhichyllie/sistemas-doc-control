import {
  DOCUMENT_FILE_ACCEPT,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  validateDocumentFile,
} from "@/lib/documentCreationValidation";

export const TRAMITE_EVIDENCE_BUCKET = "documents";
export const TRAMITE_EVIDENCE_FILE_ACCEPT = DOCUMENT_FILE_ACCEPT;
export const TRAMITE_EVIDENCE_MAX_FILE_SIZE = MAX_DOCUMENT_FILE_SIZE_BYTES;

const MIME_TYPES_BY_EXTENSION: Record<string, ReadonlySet<string>> = {
  pdf: new Set(["application/pdf"]),
  doc: new Set(["application/msword"]),
  docx: new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  xls: new Set(["application/vnd.ms-excel"]),
  xlsx: new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]),
  png: new Set(["image/png"]),
  jpg: new Set(["image/jpeg"]),
  jpeg: new Set(["image/jpeg"]),
  dwg: new Set([
    "application/acad",
    "application/dwg",
    "application/x-acad",
    "application/x-dwg",
    "application/octet-stream",
    "image/vnd.dwg",
    "image/x-dwg",
  ]),
};

export function getEvidenceFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export function validateTramiteEvidenceFile(file: File | null | undefined) {
  if (!file) return "Selecione um arquivo de evidência.";

  const baseError = validateDocumentFile(file);
  if (baseError) return baseError;

  if (
    file.name.length > 255 ||
    hasControlCharacters(file.name) ||
    !file.name.trim()
  ) {
    return "O nome do arquivo é inválido.";
  }

  const extension = getEvidenceFileExtension(file.name);
  const compatibleTypes = MIME_TYPES_BY_EXTENSION[extension];
  if (
    file.type &&
    compatibleTypes &&
    !compatibleTypes.has(file.type.toLowerCase())
  ) {
    return "O tipo MIME não corresponde à extensão do arquivo selecionado.";
  }

  return null;
}

export function sanitizeEvidenceFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop() ?? "";
  const normalized = baseName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  if (!normalized) return null;
  if (normalized.length <= 180) return normalized;

  const extension = getEvidenceFileExtension(normalized);
  const suffix = extension ? `.${extension}` : "";
  return `${normalized.slice(0, 180 - suffix.length)}${suffix}`;
}

export async function calculateEvidenceFileHash(file: File) {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const bytes = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export function formatEvidenceFileSize(size: number | null | undefined) {
  if (!Number.isFinite(size) || !size || size < 1) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
