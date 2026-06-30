export type DocumentRulesDiagnosticStatus = "ok" | "warning" | "critical";
export type DocumentRulesResourceState =
  | "ready"
  | "empty"
  | "schema_missing"
  | "permission_denied"
  | "load_error";

export interface DocumentRulesResourceDiagnostic {
  state: DocumentRulesResourceState;
  total: number;
  active: number;
  inactive: number;
  message: string;
}

export interface DocumentRulesDiagnostics {
  status: DocumentRulesDiagnosticStatus;
  code:
    | "ready"
    | "empty"
    | "schema_missing"
    | "partial_schema"
    | "permission_denied"
    | "missing_profile"
    | "missing_org"
    | "insufficient_role"
    | "load_error";
  title: string;
  message: string;
  recommendations: string[];
  canManage: boolean;
  templates: DocumentRulesResourceDiagnostic;
  rules: DocumentRulesResourceDiagnostic;
}

export type DocumentRulesErrorKind =
  | "schema_missing"
  | "permission_denied"
  | "missing_org"
  | "profile_reference"
  | "validation"
  | "unknown";

interface BuildDiagnosticsInput {
  profile: {
    id?: string | null;
    org_id?: string | null;
    role?: string | null;
  } | null;
  templateError?: unknown;
  ruleError?: unknown;
  templates?: Array<{ is_active: boolean }>;
  rules?: Array<{ is_active: boolean }>;
}

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  return [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : "";
}

export function classifyDocumentRulesError(
  error: unknown,
): DocumentRulesErrorKind {
  const code = errorCode(error);
  const text = errorText(error);

  if (
    ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(code) ||
    text.includes("could not find the table") ||
    (text.includes("relation") && text.includes("does not exist")) ||
    text.includes("schema cache")
  ) {
    return "schema_missing";
  }
  if (
    code === "42501" ||
    text.includes("row-level security") ||
    text.includes("permission denied") ||
    text.includes("not authorized")
  ) {
    return "permission_denied";
  }
  if (
    (code === "23502" || code === "23503") &&
    (text.includes("org_id") || text.includes("organizations"))
  ) {
    return "missing_org";
  }
  if (
    code === "23503" &&
    (text.includes("created_by") || text.includes("profiles"))
  ) {
    return "profile_reference";
  }
  if (code === "23514" || code === "22P02") return "validation";
  return "unknown";
}

function resourceDiagnostic(
  label: string,
  rows: Array<{ is_active: boolean }>,
  error: unknown,
): DocumentRulesResourceDiagnostic {
  if (error) {
    const kind = classifyDocumentRulesError(error);
    if (kind === "schema_missing") {
      return {
        state: "schema_missing",
        total: 0,
        active: 0,
        inactive: 0,
        message: `${label}: tabela indisponível no schema atual.`,
      };
    }
    if (kind === "permission_denied") {
      return {
        state: "permission_denied",
        total: 0,
        active: 0,
        inactive: 0,
        message: `${label}: leitura bloqueada por política de acesso.`,
      };
    }
    return {
      state: "load_error",
      total: 0,
      active: 0,
      inactive: 0,
      message: `${label}: falha ao consultar os registros.`,
    };
  }

  const active = rows.filter((row) => row.is_active).length;
  const inactive = rows.length - active;
  return {
    state: rows.length ? "ready" : "empty",
    total: rows.length,
    active,
    inactive,
    message: rows.length
      ? `${label}: ${active} ativo(s) e ${inactive} inativo(s).`
      : `${label}: tabela disponível, ainda sem cadastros.`,
  };
}

export function buildDocumentRulesDiagnostics({
  profile,
  templateError,
  ruleError,
  templates = [],
  rules = [],
}: BuildDiagnosticsInput): DocumentRulesDiagnostics {
  const templateDiagnostic = resourceDiagnostic(
    "Templates",
    templates,
    templateError,
  );
  const ruleDiagnostic = resourceDiagnostic("Regras", rules, ruleError);
  const canManage = profile?.role === "admin" || profile?.role === "manager";
  const base = {
    canManage,
    templates: templateDiagnostic,
    rules: ruleDiagnostic,
  };

  if (!profile?.id) {
    return {
      ...base,
      status: "critical",
      code: "missing_profile",
      title: "Perfil interno não carregado",
      message:
        "Não foi possível identificar o perfil necessário para consultar regras documentais.",
      recommendations: [
        "Atualize a sessão e confirme a existência do usuário em public.profiles.",
      ],
    };
  }
  if (!profile.org_id) {
    return {
      ...base,
      status: "critical",
      code: "missing_org",
      title: "Perfil sem organização",
      message:
        "O usuário não possui org_id e não pode ler ou administrar regras documentais.",
      recommendations: [
        "Corrija o vínculo organizacional do perfil antes de cadastrar regras.",
      ],
    };
  }

  const resources = [templateDiagnostic, ruleDiagnostic];
  if (resources.every((resource) => resource.state === "schema_missing")) {
    return {
      ...base,
      status: "warning",
      code: "schema_missing",
      title: "Ciclo P-10C não instalado",
      message:
        "As tabelas de templates e regras não estão disponíveis. A criação usa o fallback P-10B.",
      recommendations: [
        "Revise e aplique manualmente o ciclo 14 no ambiente correto.",
      ],
    };
  }
  if (resources.some((resource) => resource.state === "schema_missing")) {
    return {
      ...base,
      status: "critical",
      code: "partial_schema",
      title: "Schema P-10C incompleto",
      message:
        "Apenas parte das tabelas de governança está disponível neste ambiente.",
      recommendations: [
        "Confira a aplicação integral da migration P-10C e recarregue o schema do PostgREST.",
      ],
    };
  }
  if (resources.some((resource) => resource.state === "permission_denied")) {
    return {
      ...base,
      status: "critical",
      code: "permission_denied",
      title: "Leitura bloqueada por RLS",
      message:
        "Não foi possível carregar regras por política de acesso. Verifique seu papel e organização.",
      recommendations: [
        "Confira auth.uid(), profiles.org_id, profiles.role e as policies do ciclo 14.",
      ],
    };
  }
  if (resources.some((resource) => resource.state === "load_error")) {
    return {
      ...base,
      status: "critical",
      code: "load_error",
      title: "Falha ao carregar governança",
      message:
        "As tabelas existem, mas uma consulta falhou por motivo não classificado.",
      recommendations: [
        "Consulte os detalhes do erro e execute as queries de diagnóstico P-10C.1.",
      ],
    };
  }
  if (resources.every((resource) => resource.state === "empty")) {
    return {
      ...base,
      status: "warning",
      code: "empty",
      title: "Templates e regras ainda não foram cadastrados",
      message:
        "O ciclo P-10C está disponível, mas não há políticas documentais nesta organização.",
      recommendations: canManage
        ? [
            "Cadastre um template ou regra para iniciar a governança configurável.",
          ]
        : ["Solicite o cadastro a um administrador ou gestor."],
    };
  }
  if (!canManage) {
    return {
      ...base,
      status: "ok",
      code: "insufficient_role",
      title: "Governança disponível para consulta",
      message:
        "Templates e regras podem ser aplicados na criação, mas somente admin/manager podem administrá-los.",
      recommendations: [],
    };
  }

  return {
    ...base,
    status: "ok",
    code: "ready",
    title: "Governança documental disponível",
    message: `${templateDiagnostic.message} ${ruleDiagnostic.message}`,
    recommendations: [],
  };
}

export function getDocumentRulesMutationErrorMessage(
  error: unknown,
  entity: "template" | "regra",
) {
  const kind = classifyDocumentRulesError(error);
  if (kind === "permission_denied") {
    return `Não foi possível salvar ${entity}: a operação foi bloqueada por RLS. Confirme se seu perfil é admin/manager e possui org_id.`;
  }
  if (kind === "missing_org") {
    return `Não foi possível salvar ${entity}: o org_id está ausente ou não corresponde a uma organização válida.`;
  }
  if (kind === "profile_reference") {
    return `Não foi possível salvar ${entity}: o created_by não corresponde a um perfil válido.`;
  }
  if (kind === "schema_missing") {
    return `Não foi possível salvar ${entity}: o ciclo P-10C não está disponível ou o schema cache está desatualizado.`;
  }
  if (kind === "validation") {
    return `Não foi possível salvar ${entity}: um valor não atende aos checks do ciclo P-10C.`;
  }
  return null;
}
