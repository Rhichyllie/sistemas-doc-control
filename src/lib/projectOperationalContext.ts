export const PROJECT_STATUSES = [
  "planning",
  "active",
  "paused",
  "closed",
  "cancelled",
  "archived",
] as const;

export const PROJECT_TYPES = [
  "project",
  "obra",
  "contrato",
  "unidade",
  "frente_trabalho",
  "outro",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface ProjectOperationalContext {
  id: string;
  org_id: string | null;
  code: string;
  has_explicit_code: boolean;
  name: string;
  description: string | null;
  client_name: string | null;
  contract_number: string | null;
  location: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  area: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  start_date: string | null;
  end_date: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
  is_legacy: boolean;
}

export interface ProjectInput {
  name: string;
  code?: string | null;
  description?: string | null;
  client_name?: string | null;
  contract_number?: string | null;
  location?: string | null;
  project_type?: ProjectType;
  status?: ProjectStatus;
  area?: string | null;
  responsible_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  metadata?: Record<string, unknown> | null;
  is_active?: boolean;
}

export interface ProjectValidationResult {
  isValid: boolean;
  errors: string[];
  normalizedCode: string | null;
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planejamento",
  active: "Ativo",
  paused: "Pausado",
  closed: "Encerrado",
  cancelled: "Cancelado",
  archived: "Arquivado",
};

const TYPE_LABELS: Record<ProjectType, string> = {
  project: "Projeto",
  obra: "Obra",
  contrato: "Contrato",
  unidade: "Unidade",
  frente_trabalho: "Frente de trabalho",
  outro: "Outro",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fallbackProjectCode(id: string) {
  return `PROJ${id.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

export function normalizeProjectCode(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function suggestProjectCode(name: string, existingCodes: string[] = []) {
  const normalizedName = normalizeProjectCode(name);
  if (!normalizedName) return "";

  const words = normalizedName.split("-").filter(Boolean);
  const base =
    words.length >= 2
      ? words
          .slice(0, 4)
          .map((word) => word[0])
          .join("")
      : words[0].slice(0, 12);
  const existing = new Set(existingCodes.map(normalizeProjectCode));
  if (!existing.has(base)) return base;

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function validateProjectInput(
  input: ProjectInput,
): ProjectValidationResult {
  const errors: string[] = [];
  const name = input.name.trim();
  const normalizedCode = normalizeProjectCode(input.code) || null;
  const status = input.status ?? "active";
  const projectType = input.project_type ?? "project";

  if (name.length < 3) {
    errors.push("Informe um nome com pelo menos 3 caracteres.");
  }
  if (input.code && !normalizedCode) {
    errors.push("O código informado não contém caracteres válidos.");
  }
  if (normalizedCode && normalizedCode.length > 40) {
    errors.push("O código deve ter no máximo 40 caracteres.");
  }
  if (!PROJECT_STATUSES.includes(status)) {
    errors.push("Selecione um status operacional válido.");
  }
  if (!PROJECT_TYPES.includes(projectType)) {
    errors.push("Selecione um tipo de contexto válido.");
  }
  if (input.start_date && input.end_date && input.end_date < input.start_date) {
    errors.push("A data de término não pode ser anterior à data de início.");
  }
  if (input.metadata !== undefined && input.metadata !== null) {
    if (!isRecord(input.metadata)) {
      errors.push("Os metadados do projeto precisam formar um objeto válido.");
    }
  }

  return { isValid: errors.length === 0, errors, normalizedCode };
}

export function normalizeProjectStatus(value: unknown): ProjectStatus {
  const normalized = String(value ?? "").toLowerCase();
  if (PROJECT_STATUSES.includes(normalized as ProjectStatus)) {
    return normalized as ProjectStatus;
  }
  if (normalized === "in_progress") return "active";
  if (normalized === "completed") return "closed";
  return "active";
}

export function normalizeProjectType(value: unknown): ProjectType {
  const normalized = String(value ?? "").toLowerCase();
  return PROJECT_TYPES.includes(normalized as ProjectType)
    ? (normalized as ProjectType)
    : "project";
}

export function getProjectStatusLabel(status: ProjectStatus | string) {
  return STATUS_LABELS[normalizeProjectStatus(status)];
}

export function getProjectTypeLabel(type: ProjectType | string) {
  return TYPE_LABELS[normalizeProjectType(type)];
}

export function isProjectSelectable(project: ProjectOperationalContext) {
  return (
    project.is_active &&
    !["closed", "cancelled", "archived"].includes(project.status)
  );
}

export function describeProjectContext(project: ProjectOperationalContext) {
  return [
    `${project.code} · ${project.name}`,
    project.client_name ? `Cliente: ${project.client_name}` : null,
    project.contract_number ? `Contrato: ${project.contract_number}` : null,
    project.location ? `Local: ${project.location}` : null,
    getProjectStatusLabel(project.status),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function buildProjectSearchText(project: ProjectOperationalContext) {
  return [
    project.code,
    project.name,
    project.description,
    project.client_name,
    project.contract_number,
    project.location,
    project.area,
    project.responsible_name,
    getProjectStatusLabel(project.status),
    getProjectTypeLabel(project.project_type),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("pt-BR");
}

export function normalizeProjectRecord(
  value: unknown,
  documentCount = 0,
): ProjectOperationalContext | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const explicitCode =
    typeof value.code === "string" ? normalizeProjectCode(value.code) : "";
  const responsible = isRecord(value.responsible) ? value.responsible : null;
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const status = normalizeProjectStatus(value.status);

  return {
    id: value.id,
    org_id: typeof value.org_id === "string" ? value.org_id : null,
    code: explicitCode || fallbackProjectCode(value.id),
    has_explicit_code: Boolean(explicitCode),
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : `Projeto ${value.id.slice(0, 8)}`,
    description:
      typeof value.description === "string" ? value.description : null,
    client_name:
      typeof value.client_name === "string"
        ? value.client_name
        : typeof value.client === "string"
          ? value.client
          : null,
    contract_number:
      typeof value.contract_number === "string" ? value.contract_number : null,
    location: typeof value.location === "string" ? value.location : null,
    project_type: normalizeProjectType(value.project_type),
    status,
    area: typeof value.area === "string" ? value.area : null,
    responsible_id:
      typeof value.responsible_id === "string" ? value.responsible_id : null,
    responsible_name:
      responsible && typeof responsible.full_name === "string"
        ? responsible.full_name
        : null,
    start_date: typeof value.start_date === "string" ? value.start_date : null,
    end_date: typeof value.end_date === "string" ? value.end_date : null,
    metadata,
    is_active:
      typeof value.is_active === "boolean"
        ? value.is_active
        : !["closed", "cancelled", "archived"].includes(status),
    created_by: typeof value.created_by === "string" ? value.created_by : null,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
    document_count: documentCount,
    is_legacy: typeof value.org_id !== "string",
  };
}
