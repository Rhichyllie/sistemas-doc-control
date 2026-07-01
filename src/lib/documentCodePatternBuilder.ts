import { normalizeCodeToken } from "@/lib/documentCodePatterns";

export type DocumentCodeTokenType =
  | "PREFIX"
  | "ORG"
  | "PROJECT"
  | "AREA"
  | "TYPE"
  | "YEAR"
  | "MONTH"
  | "SEQ"
  | "CUSTOM"
  | "TEXT"
  | "SEPARATOR";

export interface DocumentCodePatternBlock {
  id: string;
  type: DocumentCodeTokenType;
  value?: string;
}

export interface DocumentCodePatternBuilderState {
  blocks: DocumentCodePatternBlock[];
  mode: "visual" | "advanced";
  expression: string;
}

export interface DocumentCodePatternValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DocumentCodePatternExampleContext {
  prefix?: string | null;
  org?: string | null;
  project?: string | null;
  projectId?: string | null;
  area?: string | null;
  docType?: string | null;
  custom?: string | null;
  referenceDate?: Date;
  sequenceNumber?: number;
  sequencePadding?: number;
}

export interface DocumentCodePatternParseResult extends DocumentCodePatternValidationResult {
  blocks: DocumentCodePatternBlock[];
  isLossless: boolean;
}

export interface DocumentCodePatternPreset {
  id: string;
  name: string;
  description: string;
  expression: string;
  example: string;
}

interface TokenDescriptor {
  type: DocumentCodeTokenType;
  label: string;
  description: string;
  example: string;
}

const TOKEN_TYPES = [
  "PREFIX",
  "ORG",
  "PROJECT",
  "AREA",
  "TYPE",
  "YEAR",
  "MONTH",
  "SEQ",
  "CUSTOM",
] as const;

const TOKEN_DESCRIPTORS: Record<DocumentCodeTokenType, TokenDescriptor> = {
  PREFIX: {
    type: "PREFIX",
    label: "Prefixo",
    description:
      "Identifica a família de códigos da organização ou deste padrão.",
    example: "TR",
  },
  ORG: {
    type: "ORG",
    label: "Organização",
    description: "Usa o código configurado para a organização.",
    example: "ACME",
  },
  PROJECT: {
    type: "PROJECT",
    label: "Projeto",
    description:
      "Usa o código do projeto. Sem código explícito, aplica fallback seguro.",
    example: "OBRA-MARINA",
  },
  AREA: {
    type: "AREA",
    label: "Área",
    description:
      "Diferencia Engenharia, Operação, Qualidade ou outra área cadastrada.",
    example: "ENG",
  },
  TYPE: {
    type: "TYPE",
    label: "Tipo documental",
    description:
      "Identifica contrato, certificado, procedimento, registro ou outro tipo.",
    example: "ET",
  },
  YEAR: {
    type: "YEAR",
    label: "Ano",
    description: "Inclui o ano da data de referência.",
    example: "2026",
  },
  MONTH: {
    type: "MONTH",
    label: "Mês",
    description: "Inclui o mês da data de referência com dois dígitos.",
    example: "07",
  },
  SEQ: {
    type: "SEQ",
    label: "Sequência",
    description:
      "Garante numeração crescente. O número é reservado somente na criação.",
    example: "0001",
  },
  CUSTOM: {
    type: "CUSTOM",
    label: "Valor personalizado",
    description: "Inclui um valor fixo configurável e normalizado.",
    example: "CERT",
  },
  TEXT: {
    type: "TEXT",
    label: "Texto fixo",
    description: "Adiciona uma palavra controlada ao código.",
    example: "DOC",
  },
  SEPARATOR: {
    type: "SEPARATOR",
    label: "Separador",
    description: "Separa visualmente as partes do código.",
    example: "-",
  },
};

export const DOCUMENT_CODE_PATTERN_PRESETS: DocumentCodePatternPreset[] = [
  {
    id: "simple",
    name: "Padrão simples",
    description: "Prefixo, área, tipo documental e sequência.",
    expression: "{PREFIX}-{AREA}-{TYPE}-{SEQ}",
    example: "TR-ENG-ET-0001",
  },
  {
    id: "project",
    name: "Padrão por projeto",
    description: "Inclui o projeto antes da área e do tipo.",
    expression: "{PREFIX}-{PROJECT}-{AREA}-{TYPE}-{SEQ}",
    example: "TR-OBRA-MARINA-ENG-ET-0001",
  },
  {
    id: "year",
    name: "Padrão por ano",
    description: "Separa a numeração por contexto anual.",
    expression: "{PREFIX}-{AREA}-{TYPE}-{YEAR}-{SEQ}",
    example: "TR-ENG-ET-2026-0001",
  },
  {
    id: "organization",
    name: "Padrão por organização",
    description: "Usa o código da organização, tipo e sequência.",
    expression: "{ORG}-{TYPE}-{SEQ}",
    example: "ACME-ET-0001",
  },
  {
    id: "generic",
    name: "Padrão documental genérico",
    description: "Combina prefixo, tipo, ano e sequência.",
    expression: "{PREFIX}-{TYPE}-{YEAR}-{SEQ}",
    example: "TR-CERT-2026-0001",
  },
];

function blockId(index: number, type: DocumentCodeTokenType) {
  return `pattern-block-${index}-${type.toLowerCase()}`;
}

function isTokenType(value: string): value is (typeof TOKEN_TYPES)[number] {
  return TOKEN_TYPES.includes(value as (typeof TOKEN_TYPES)[number]);
}

function isSeparatorText(value: string) {
  return /^[-_.:/]+$/.test(value);
}

function splitLiteralIntoBlocks(
  value: string,
  offset: number,
): DocumentCodePatternBlock[] {
  const chunks = value.match(/[-_.:/]+|[^-_.:/]+/g) ?? [];
  return chunks.filter(Boolean).map((chunk, index) => ({
    id: blockId(offset + index, isSeparatorText(chunk) ? "SEPARATOR" : "TEXT"),
    type: isSeparatorText(chunk) ? "SEPARATOR" : "TEXT",
    value: chunk,
  }));
}

export function getAvailableCodeTokens(): TokenDescriptor[] {
  return TOKEN_TYPES.map((type) => TOKEN_DESCRIPTORS[type]);
}

export function getCodeTokenLabel(token: DocumentCodeTokenType): string {
  return TOKEN_DESCRIPTORS[token].label;
}

export function getCodeTokenDescription(token: DocumentCodeTokenType): string {
  return TOKEN_DESCRIPTORS[token].description;
}

export function getCodeTokenExample(token: DocumentCodeTokenType): string {
  return TOKEN_DESCRIPTORS[token].example;
}

export function normalizeFixedTextBlock(value: string): string {
  return normalizeCodeToken(value);
}

export function parsePatternToBlocks(
  pattern: string,
): DocumentCodePatternParseResult {
  const expression = pattern.trim();
  const blocks: DocumentCodePatternBlock[] = [];
  const errors: string[] = [];
  let cursor = 0;

  while (cursor < expression.length) {
    const current = expression[cursor];
    if (current === "}") {
      errors.push("A expressão contém uma chave de fechamento sem abertura.");
      cursor += 1;
      continue;
    }
    if (current !== "{") {
      let end = cursor;
      while (
        end < expression.length &&
        expression[end] !== "{" &&
        expression[end] !== "}"
      ) {
        end += 1;
      }
      blocks.push(
        ...splitLiteralIntoBlocks(expression.slice(cursor, end), blocks.length),
      );
      cursor = end;
      continue;
    }

    const closing = expression.indexOf("}", cursor + 1);
    if (closing < 0) {
      errors.push("A expressão contém uma chave de abertura sem fechamento.");
      break;
    }
    const rawToken = expression
      .slice(cursor + 1, closing)
      .trim()
      .toUpperCase();
    if (!isTokenType(rawToken)) {
      errors.push(
        rawToken
          ? `Token desconhecido: {${rawToken}}.`
          : "Existe um token vazio na expressão.",
      );
    } else {
      blocks.push({
        id: blockId(blocks.length, rawToken),
        type: rawToken,
      });
    }
    cursor = closing + 1;
  }

  const validation = validatePatternBlocks(blocks);
  const serialized = serializeBlocksToPattern(blocks);
  const normalizedExpression = expression.toUpperCase();
  return {
    blocks,
    errors: [...errors, ...validation.errors],
    warnings: validation.warnings,
    isValid: errors.length === 0 && validation.isValid,
    isLossless: errors.length === 0 && serialized === normalizedExpression,
  };
}

export function serializeBlocksToPattern(
  blocks: DocumentCodePatternBlock[],
): string {
  return blocks
    .map((block) => {
      if (block.type === "TEXT")
        return normalizeFixedTextBlock(block.value ?? "");
      if (block.type === "SEPARATOR") return block.value ?? "-";
      return `{${block.type}}`;
    })
    .join("");
}

export function validatePatternBlocks(
  blocks: DocumentCodePatternBlock[],
  context: DocumentCodePatternExampleContext = {},
): DocumentCodePatternValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const meaningful = blocks.filter(
    (block) =>
      block.type !== "TEXT" ||
      normalizeFixedTextBlock(block.value ?? "").length > 0,
  );

  if (meaningful.length === 0) {
    errors.push("Adicione ao menos um bloco ao padrão.");
  }
  if (!blocks.some((block) => block.type === "SEQ")) {
    errors.push("O bloco Sequência é obrigatório.");
  }
  if (meaningful.length === 1 && meaningful[0]?.type === "SEQ") {
    warnings.push(
      "O padrão contém apenas a sequência. Ele é válido, mas pouco descritivo.",
    );
  }
  if (
    blocks.some((block) => block.type === "PROJECT") &&
    !context.project &&
    !context.projectId
  ) {
    warnings.push(
      "Projeto não selecionado: o preview usará um fallback seguro.",
    );
  }
  if (
    blocks.some((block) => block.type === "CUSTOM") &&
    !normalizeFixedTextBlock(context.custom ?? "")
  ) {
    warnings.push(
      "O bloco Valor personalizado está vazio e não aparecerá no código.",
    );
  }
  blocks.forEach((block, index) => {
    if (block.type === "SEPARATOR" && blocks[index + 1]?.type === "SEPARATOR") {
      warnings.push(
        "Há separadores consecutivos. Use a normalização automática antes de salvar.",
      );
    }
    if (block.type === "TEXT" && !normalizeFixedTextBlock(block.value ?? "")) {
      errors.push(
        "Um bloco de texto fixo está vazio ou contém apenas símbolos.",
      );
    }
  });

  return {
    isValid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

export function validatePatternExpression(
  pattern: string,
  context: DocumentCodePatternExampleContext = {},
): DocumentCodePatternValidationResult {
  if (!pattern.trim()) {
    return {
      isValid: false,
      errors: ["Informe uma expressão para o padrão."],
      warnings: [],
    };
  }
  const parsed = parsePatternToBlocks(pattern);
  const contextual = validatePatternBlocks(parsed.blocks, context);
  return {
    isValid: parsed.errors.length === 0 && contextual.isValid,
    errors: [...new Set([...parsed.errors, ...contextual.errors])],
    warnings: [...new Set([...parsed.warnings, ...contextual.warnings])],
  };
}

export function buildPatternExample(
  blocks: DocumentCodePatternBlock[],
  context: DocumentCodePatternExampleContext = {},
): string {
  const date = context.referenceDate ?? new Date();
  const sequence = Math.max(0, Math.trunc(context.sequenceNumber ?? 1));
  const padding = Math.max(2, Math.min(8, context.sequencePadding ?? 4));
  const projectFallback = context.projectId
    ? `PROJ${normalizeCodeToken(context.projectId).slice(0, 6)}`
    : "PROJXXXXXX";
  const values: Record<(typeof TOKEN_TYPES)[number], string> = {
    PREFIX: normalizeCodeToken(context.prefix || "TR"),
    ORG: normalizeCodeToken(context.org || "ACME"),
    PROJECT: normalizeCodeToken(context.project || projectFallback),
    AREA: normalizeCodeToken(context.area || "ENG"),
    TYPE: normalizeCodeToken(context.docType || "ET"),
    YEAR: String(date.getFullYear()),
    MONTH: String(date.getMonth() + 1).padStart(2, "0"),
    SEQ: String(sequence).padStart(padding, "0"),
    CUSTOM: normalizeCodeToken(context.custom || ""),
  };

  return blocks
    .map((block) => {
      if (block.type === "TEXT")
        return normalizeFixedTextBlock(block.value ?? "");
      if (block.type === "SEPARATOR") return block.value ?? "-";
      return values[block.type];
    })
    .join("")
    .replace(/([-_.:/])\1+/g, "$1")
    .replace(/^[-_.:/]+|[-_.:/]+$/g, "");
}

export function explainPatternBlocks(
  blocks: DocumentCodePatternBlock[],
): string[] {
  return blocks
    .filter((block) => block.type !== "SEPARATOR")
    .map((block) => {
      if (block.type === "TEXT") {
        return `Texto fixo adiciona “${normalizeFixedTextBlock(block.value ?? "") || "valor"}” ao código.`;
      }
      return getCodeTokenDescription(block.type);
    });
}

export function canSavePattern(
  blocks: DocumentCodePatternBlock[],
  context: DocumentCodePatternExampleContext = {},
): boolean {
  return validatePatternBlocks(blocks, context).isValid;
}

export function ensureSequenceToken(
  blocks: DocumentCodePatternBlock[],
  separator = "-",
): DocumentCodePatternBlock[] {
  if (blocks.some((block) => block.type === "SEQ")) return blocks;
  const result = [...blocks];
  if (result.length > 0 && result.at(-1)?.type !== "SEPARATOR") {
    result.push({
      id: blockId(result.length, "SEPARATOR"),
      type: "SEPARATOR",
      value: separator,
    });
  }
  result.push({
    id: blockId(result.length, "SEQ"),
    type: "SEQ",
  });
  return result;
}

export function dedupeSeparators(
  blocks: DocumentCodePatternBlock[],
): DocumentCodePatternBlock[] {
  const result: DocumentCodePatternBlock[] = [];
  blocks.forEach((block) => {
    if (block.type === "SEPARATOR" && result.at(-1)?.type === "SEPARATOR") {
      return;
    }
    result.push({
      ...block,
      value:
        block.type === "SEPARATOR"
          ? (block.value || "-").slice(0, 1)
          : block.value,
    });
  });
  while (result[0]?.type === "SEPARATOR") result.shift();
  while (result.at(-1)?.type === "SEPARATOR") result.pop();
  return result.map((block, index) => ({
    ...block,
    id: blockId(index, block.type),
  }));
}

export function createDefaultPatternBlocks(): DocumentCodePatternBlock[] {
  return parsePatternToBlocks(DOCUMENT_CODE_PATTERN_PRESETS[0].expression)
    .blocks;
}
