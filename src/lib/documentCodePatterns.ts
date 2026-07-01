export const DOCUMENT_CODE_TOKENS = [
  "PREFIX",
  "AREA",
  "TYPE",
  "PROJECT",
  "YEAR",
  "MONTH",
  "SEQ",
  "ORG",
  "CUSTOM",
] as const;

export type DocumentCodeToken = (typeof DOCUMENT_CODE_TOKENS)[number];
export type DocumentCodePatternScope =
  | "organization"
  | "project"
  | "area"
  | "type"
  | "area_type";
export type DocumentCodeSequenceReset =
  | "never"
  | "yearly"
  | "monthly"
  | "project"
  | "area"
  | "type"
  | "area_type";

export interface DocumentCodePattern {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  priority: number;
  pattern_scope: DocumentCodePatternScope;
  doc_type: string | null;
  area: string | null;
  project_id: string | null;
  prefix: string;
  pattern: string;
  separator: string;
  sequence_padding: number;
  sequence_reset: DocumentCodeSequenceReset;
  sequence_start: number;
  include_year: boolean;
  include_month: boolean;
  tokens: unknown;
  example_output: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentCodeContext {
  orgId?: string | null;
  orgCode?: string | null;
  docType?: string | null;
  area?: string | null;
  projectId?: string | null;
  projectCode?: string | null;
  custom?: string | null;
  referenceDate?: Date | string | null;
}

export interface DocumentCodePreview {
  available: boolean;
  mode: "configured" | "configured_local" | "legacy_fallback" | "unavailable";
  patternId: string | null;
  patternName: string | null;
  code: string | null;
  sequenceKey: string | null;
  nextNumber: number | null;
  collisionWarning: boolean;
  existingCode: boolean;
  tokens: Record<string, string>;
  explanation: string[];
}

export interface DocumentCodePatternValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const TOKEN_EXPRESSION = /\{([A-Z_]+)\}/g;
const ANY_TOKEN_EXPRESSION = /\{([^{}]*)\}/g;

function comparable(value: string | null | undefined) {
  return normalizeCodeToken(value).toLowerCase();
}

function referenceDate(value: DocumentCodeContext["referenceDate"]) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function specificity(pattern: DocumentCodePattern) {
  return (
    Number(Boolean(pattern.project_id)) * 8 +
    Number(Boolean(pattern.doc_type)) * 4 +
    Number(Boolean(pattern.area)) * 2
  );
}

function fallbackProjectCode(projectId: string | null | undefined) {
  return projectId
    ? `PROJ${projectId.replaceAll("-", "").slice(0, 6).toUpperCase()}`
    : "GERAL";
}

export function normalizeCodeToken(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

export function buildSequenceKey(
  input: DocumentCodeContext,
  pattern: DocumentCodePattern,
) {
  const date = referenceDate(input.referenceDate);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const area = normalizeCodeToken(input.area);
  const docType = normalizeCodeToken(input.docType);

  switch (pattern.sequence_reset) {
    case "yearly":
      return `year:${year}`;
    case "monthly":
      return `month:${year}-${month}`;
    case "project":
      return `project:${input.projectId || "none"}`;
    case "area":
      return `area:${area || "none"}`;
    case "type":
      return `type:${docType || "none"}`;
    case "area_type":
      return `area:${area || "none"}|type:${docType || "none"}`;
    default:
      return "global";
  }
}

export function renderDocumentCodePattern(
  pattern: DocumentCodePattern,
  context: DocumentCodeContext,
  sequenceNumber: number,
) {
  const date = referenceDate(context.referenceDate);
  const configuredCustom =
    pattern.tokens &&
    typeof pattern.tokens === "object" &&
    !Array.isArray(pattern.tokens) &&
    typeof (pattern.tokens as Record<string, unknown>).custom === "string"
      ? String((pattern.tokens as Record<string, unknown>).custom)
      : "";
  const values: Record<DocumentCodeToken, string> = {
    PREFIX: normalizeCodeToken(pattern.prefix),
    AREA: normalizeCodeToken(context.area),
    TYPE: normalizeCodeToken(context.docType),
    PROJECT: normalizeCodeToken(
      context.projectCode || fallbackProjectCode(context.projectId),
    ),
    YEAR: String(date.getFullYear()),
    MONTH: String(date.getMonth() + 1).padStart(2, "0"),
    SEQ: String(Math.max(0, Math.trunc(sequenceNumber))).padStart(
      pattern.sequence_padding,
      "0",
    ),
    ORG: normalizeCodeToken(context.orgCode),
    CUSTOM: normalizeCodeToken(context.custom ?? configuredCustom),
  };

  const code = pattern.pattern
    .toUpperCase()
    .replace(TOKEN_EXPRESSION, (token, tokenName: string) =>
      DOCUMENT_CODE_TOKENS.includes(tokenName as DocumentCodeToken)
        ? values[tokenName as DocumentCodeToken]
        : token,
    );

  return {
    code: code.replace(/-{2,}/g, "-").replace(/^-|-$/g, "").toUpperCase(),
    tokens: values,
  };
}

export function explainCodePattern(
  pattern: DocumentCodePattern,
  context: DocumentCodeContext,
) {
  const explanations = [
    `Padrão “${pattern.name}” selecionado por prioridade ${pattern.priority}.`,
    `A sequência usa a chave “${buildSequenceKey(context, pattern)}”.`,
  ];

  if (pattern.project_id) {
    explanations.push("O padrão corresponde ao projeto selecionado.");
  }
  if (pattern.doc_type && pattern.area) {
    explanations.push(
      `O padrão corresponde ao tipo ${normalizeCodeToken(pattern.doc_type)} e à área ${normalizeCodeToken(pattern.area)}.`,
    );
  } else if (pattern.doc_type) {
    explanations.push(
      `O padrão corresponde ao tipo ${normalizeCodeToken(pattern.doc_type)}.`,
    );
  } else if (pattern.area) {
    explanations.push(
      `O padrão corresponde à área ${normalizeCodeToken(pattern.area)}.`,
    );
  } else {
    explanations.push("O padrão é aplicável à organização.");
  }

  return explanations;
}

export function validateCodePattern(
  pattern: Pick<
    DocumentCodePattern,
    | "pattern"
    | "prefix"
    | "sequence_padding"
    | "sequence_start"
    | "pattern_scope"
    | "sequence_reset"
    | "doc_type"
    | "area"
    | "project_id"
  >,
): DocumentCodePatternValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const expression = pattern.pattern.trim().toUpperCase();
  const tokenMatches = [...expression.matchAll(ANY_TOKEN_EXPRESSION)];
  const tokens = tokenMatches.map((match) => match[1].trim());

  if (!expression) errors.push("Informe o padrão de código.");
  if (!tokens.includes("SEQ")) {
    errors.push("O padrão precisa conter o token {SEQ}.");
  }
  const unknownTokens = [
    ...new Set(
      tokens.filter(
        (token) => !DOCUMENT_CODE_TOKENS.includes(token as DocumentCodeToken),
      ),
    ),
  ];
  if (unknownTokens.length) {
    errors.push(
      `Tokens não reconhecidos: ${unknownTokens
        .map((token) => token || "(vazio)")
        .join(", ")}.`,
    );
  }
  const expressionWithoutTokens = expression.replace(ANY_TOKEN_EXPRESSION, "");
  if (/[{}]/.test(expressionWithoutTokens)) {
    errors.push(
      "O padrão possui chaves malformadas. Use tokens no formato {TOKEN}.",
    );
  }
  if (!normalizeCodeToken(pattern.prefix)) {
    errors.push("Informe um prefixo válido.");
  }
  if (
    !Number.isInteger(pattern.sequence_padding) ||
    pattern.sequence_padding < 2 ||
    pattern.sequence_padding > 8
  ) {
    errors.push("O preenchimento da sequência deve estar entre 2 e 8.");
  }
  if (!Number.isInteger(pattern.sequence_start) || pattern.sequence_start < 0) {
    errors.push("O início da sequência deve ser zero ou maior.");
  }
  if (pattern.pattern_scope === "project" && !pattern.project_id) {
    errors.push("Selecione um projeto para um padrão de projeto.");
  }
  if (
    (pattern.pattern_scope === "type" ||
      pattern.pattern_scope === "area_type") &&
    !pattern.doc_type
  ) {
    errors.push("Selecione um tipo documental para este escopo.");
  }
  if (
    (pattern.pattern_scope === "area" ||
      pattern.pattern_scope === "area_type") &&
    !pattern.area
  ) {
    errors.push("Selecione uma área para este escopo.");
  }
  if (tokens.includes("PROJECT") && !pattern.project_id) {
    warnings.push(
      "O token {PROJECT} usará GERAL quando nenhum projeto estiver selecionado.",
    );
  }
  if (tokens.includes("ORG")) {
    warnings.push(
      "O token {ORG} depende do código da organização disponível no ambiente.",
    );
  }

  return { isValid: errors.length === 0, errors, warnings };
}

export function previewLocalDocumentCode(
  pattern: DocumentCodePattern,
  context: DocumentCodeContext,
  sequenceNumber = pattern.sequence_start,
): DocumentCodePreview {
  const validation = validateCodePattern(pattern);
  if (!validation.isValid) {
    return {
      available: false,
      mode: "unavailable",
      patternId: pattern.id,
      patternName: pattern.name,
      code: null,
      sequenceKey: null,
      nextNumber: null,
      collisionWarning: false,
      existingCode: false,
      tokens: {},
      explanation: validation.errors,
    };
  }

  const rendered = renderDocumentCodePattern(pattern, context, sequenceNumber);
  return {
    available: Boolean(rendered.code),
    mode: "configured_local",
    patternId: pattern.id,
    patternName: pattern.name,
    code: rendered.code || null,
    sequenceKey: buildSequenceKey(context, pattern),
    nextNumber: sequenceNumber,
    collisionWarning: false,
    existingCode: false,
    tokens: rendered.tokens,
    explanation: [
      ...explainCodePattern(pattern, context),
      "Preview local: o número final será confirmado pelo banco na criação.",
    ],
  };
}

export function rankCodePatterns(
  patterns: DocumentCodePattern[],
  input: DocumentCodeContext,
) {
  return patterns
    .filter((pattern) => {
      if (!pattern.is_active) return false;
      if (input.orgId && pattern.org_id !== input.orgId) return false;
      if (pattern.project_id && pattern.project_id !== input.projectId)
        return false;
      if (
        pattern.doc_type &&
        comparable(pattern.doc_type) !== comparable(input.docType)
      )
        return false;
      if (pattern.area && comparable(pattern.area) !== comparable(input.area))
        return false;
      return true;
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      const specificityDifference = specificity(right) - specificity(left);
      if (specificityDifference) return specificityDifference;
      if (left.is_default !== right.is_default) {
        return Number(right.is_default) - Number(left.is_default);
      }
      const createdDifference = left.created_at.localeCompare(right.created_at);
      if (createdDifference) return createdDifference;
      const nameDifference = left.name.localeCompare(right.name);
      return nameDifference || left.id.localeCompare(right.id);
    });
}

export function isDocumentCodingCompatibilityError(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : undefined;
  const message = [
    record?.message,
    record?.details,
    record?.hint,
    typeof error === "string" ? error : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const code = String(record?.code ?? "").toUpperCase();

  return (
    code === "PGRST202" ||
    code === "PGRST205" ||
    code === "42P01" ||
    code === "42883" ||
    message.includes("could not find the function") ||
    message.includes("function does not exist") ||
    (message.includes("does not exist") &&
      (message.includes("preview_document_code") ||
        message.includes("allocate_document_code") ||
        message.includes("document_code_patterns") ||
        message.includes("document_code_sequences") ||
        message.includes("document_code_events"))) ||
    (message.includes("schema cache") &&
      (message.includes("preview_document_code") ||
        message.includes("allocate_document_code") ||
        message.includes("document_code_patterns") ||
        message.includes("document_code_sequences") ||
        message.includes("document_code_events")))
  );
}
