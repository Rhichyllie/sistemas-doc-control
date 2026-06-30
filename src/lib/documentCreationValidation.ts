import { DOCUMENT_TYPE_CODES } from "@/lib/documentIntelligence";

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const DOCUMENT_FILE_ACCEPT =
  ".pdf,.doc,.docx,.dwg,.xls,.xlsx,.png,.jpg,.jpeg";

const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/acad",
  "application/dwg",
  "application/x-acad",
  "application/x-dwg",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/vnd.dwg",
  "image/x-dwg",
  "image/png",
  "image/jpeg",
]);

const ALLOWED_FILE_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "dwg",
  "xls",
  "xlsx",
  "png",
  "jpg",
  "jpeg",
]);

export interface DocumentCreationValidationInput {
  title?: string | null;
  doc_type?: string | null;
  area?: string | null;
  revision?: number | null;
  review_period_months?: number | null;
  next_review_at?: string | null;
  project_id?: string | null;
  file?: File | null;
}

export interface ProjectValidationContext {
  projectCapabilityAvailable: boolean;
  availableProjectIds: string[];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateDocumentFile(file: File | null | undefined) {
  if (!file) return null;
  if (file.size <= 0) {
    return "O arquivo selecionado está vazio. Escolha um arquivo válido.";
  }
  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return "O arquivo excede o limite de 50 MB. Reduza o tamanho antes de continuar.";
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extensionAllowed = ALLOWED_FILE_EXTENSIONS.has(extension);
  const mimeAllowed = !file.type || ALLOWED_FILE_TYPES.has(file.type);
  if (!extensionAllowed || !mimeAllowed) {
    return "Formato não permitido. Use PDF, DOC, DOCX, DWG, XLS, XLSX, PNG ou JPG.";
  }

  return null;
}

export function validateDocumentCreation(
  input: DocumentCreationValidationInput,
) {
  const errors: string[] = [];
  const title = input.title?.trim() ?? "";
  const docType = input.doc_type?.trim().toUpperCase() ?? "";
  const area = input.area?.trim() ?? "";
  const revision = input.revision ?? 0;
  const reviewPeriod = input.review_period_months ?? 24;

  if (!title) {
    errors.push("Informe o título do documento.");
  } else if (title.length < 3) {
    errors.push("O título deve ter pelo menos 3 caracteres.");
  }

  if (!docType) {
    errors.push("Selecione o tipo documental.");
  } else if (
    !DOCUMENT_TYPE_CODES.includes(
      docType as (typeof DOCUMENT_TYPE_CODES)[number],
    )
  ) {
    errors.push("O tipo documental selecionado não é reconhecido.");
  }

  if (!area) {
    errors.push("Selecione a área responsável.");
  }

  if (!Number.isInteger(revision) || revision !== 0) {
    errors.push("Documento novo deve iniciar obrigatoriamente na revisão 0.");
  }

  if (
    !Number.isInteger(reviewPeriod) ||
    reviewPeriod < 1 ||
    reviewPeriod > 120
  ) {
    errors.push("O período de revisão deve ser um número entre 1 e 120 meses.");
  }

  if (input.next_review_at && !isValidDateInput(input.next_review_at)) {
    errors.push("A próxima revisão deve ser uma data válida.");
  }

  if (input.project_id && !isUuid(input.project_id)) {
    errors.push("O projeto selecionado possui um identificador inválido.");
  }

  const fileError = validateDocumentFile(input.file);
  if (fileError) errors.push(fileError);

  return errors;
}

export function validateSelectedProject(
  projectId: string | null | undefined,
  context: ProjectValidationContext,
) {
  if (!projectId) return null;
  if (!context.projectCapabilityAvailable) {
    return "Projetos não estão disponíveis neste ambiente. Remova o vínculo antes de criar.";
  }
  if (!context.availableProjectIds.includes(projectId)) {
    return "O projeto selecionado não está mais disponível. Atualize a página e escolha outro projeto.";
  }
  return null;
}
