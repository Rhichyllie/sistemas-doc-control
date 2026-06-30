export const DOCUMENT_TYPE_CODES = [
  "PRO",
  "IT",
  "ET",
  "DRW",
  "RNC",
  "PLN",
  "REG",
  "MAN",
] as const;

export const DOCUMENT_AREAS = [
  "SGI",
  "ENG",
  "OPS",
  "MNT",
  "SST",
  "MA",
] as const;

export type DocumentTypeCode = (typeof DOCUMENT_TYPE_CODES)[number];
export type DocumentArea = (typeof DOCUMENT_AREAS)[number];
export type DocumentCreationMode = "quick" | "guided" | "expert";
export type DocumentRiskLevel = "low" | "medium" | "high";

export interface DocumentCreationCapabilities {
  confidentiality: boolean;
  external_reference: boolean;
  source_system: boolean;
  metadata: boolean;
  tags: boolean;
  project_id: boolean;
}

export interface DocumentCreationIntelligenceInput {
  title?: string;
  description?: string;
  keywords?: string[];
  doc_type?: string | null;
  area?: string | null;
  selectedArea?: string | null;
  projectName?: string | null;
  project_id?: string | null;
  file?: File | null;
  hasFile?: boolean;
  review_period_months?: number | null;
  default_review_months?: number | null;
  next_review_at?: string | null;
  revision?: number | null;
  author_id?: string | null;
  confidentiality?: string | null;
  external_reference?: string | null;
  source_system?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
  mode?: DocumentCreationMode;
  initialStatus?: string;
  importJustification?: string | null;
  criticalMetadataComplete?: boolean;
}

export interface DocumentCompletenessAssessment {
  score: number;
  missingItems: string[];
}

const REVIEW_PERIODS: Record<DocumentTypeCode, number> = {
  RNC: 6,
  IT: 12,
  PLN: 12,
  PRO: 24,
  ET: 24,
  DRW: 36,
  REG: 60,
  MAN: 36,
};

const TYPE_RULES: Array<{
  type: DocumentTypeCode;
  expressions: RegExp[];
}> = [
  {
    type: "RNC",
    expressions: [/\bnao conformidade\b/, /\brnc\b/, /\bdesvio\b/],
  },
  {
    type: "DRW",
    expressions: [/\bdesenho\b/, /\bplanta\b/, /\blayout\b/, /\bdiagrama\b/],
  },
  {
    type: "ET",
    expressions: [
      /\bespecificacao\b/,
      /\brequisito tecnico\b/,
      /\bmemorial tecnico\b/,
    ],
  },
  {
    type: "PRO",
    expressions: [
      /\bprocedimento\b/,
      /\bprocesso\b/,
      /\bnorma\b/,
      /\bpolitica\b/,
    ],
  },
  {
    type: "IT",
    expressions: [
      /\binstrucao\b/,
      /\bpasso a passo\b/,
      /\boperacional\b/,
      /\bcomo executar\b/,
    ],
  },
  {
    type: "PLN",
    expressions: [/\bplano\b/, /\bprograma\b/, /\bplanejamento\b/],
  },
  {
    type: "REG",
    expressions: [/\bregistro\b/, /\bevidencia\b/, /\bchecklist\b/, /\bata\b/],
  },
  {
    type: "MAN",
    expressions: [/\bmanual\b/, /\bguia de uso\b/],
  },
];

const AREA_RULES: Array<{
  area: DocumentArea;
  expressions: RegExp[];
}> = [
  {
    area: "SST",
    expressions: [
      /\bseguranca\b/,
      /\bsaude ocupacional\b/,
      /\bacidente\b/,
      /\bepi\b/,
      /\bemergencia\b/,
    ],
  },
  {
    area: "MA",
    expressions: [
      /\bmeio ambiente\b/,
      /\bambiental\b/,
      /\bresiduo\b/,
      /\bemissao\b/,
      /\bsustentabilidade\b/,
    ],
  },
  {
    area: "MNT",
    expressions: [
      /\bmanutencao\b/,
      /\bequipamento\b/,
      /\bpreventiva\b/,
      /\bcorretiva\b/,
      /\binspecao mecanica\b/,
    ],
  },
  {
    area: "ENG",
    expressions: [
      /\bengenharia\b/,
      /\bprojeto\b/,
      /\bdesenho\b/,
      /\bplanta\b/,
      /\bespecificacao\b/,
      /\btecnico\b/,
    ],
  },
  {
    area: "OPS",
    expressions: [
      /\boperacao\b/,
      /\boperacional\b/,
      /\bproducao\b/,
      /\bturno\b/,
      /\bprocesso produtivo\b/,
    ],
  },
  {
    area: "SGI",
    expressions: [
      /\bqualidade\b/,
      /\bauditoria\b/,
      /\bgestao\b/,
      /\bsgi\b/,
      /\bnorma\b/,
      /\biso\b/,
    ],
  },
];

function normalizeSearchText(parts: Array<string | null | undefined>) {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDocumentType(
  value: string | null | undefined,
): value is DocumentTypeCode {
  return DOCUMENT_TYPE_CODES.includes(value as DocumentTypeCode);
}

function hasFile(input: DocumentCreationIntelligenceInput) {
  return input.hasFile === true || Boolean(input.file);
}

export function inferDocumentType(
  input: DocumentCreationIntelligenceInput,
): DocumentTypeCode | null {
  const text = normalizeSearchText([
    input.title,
    input.description,
    ...(input.keywords ?? []),
  ]);

  if (text) {
    const match = TYPE_RULES.find((rule) =>
      rule.expressions.some((expression) => expression.test(text)),
    );
    if (match) return match.type;
  }

  return isDocumentType(input.doc_type) ? input.doc_type : null;
}

export function inferArea(input: DocumentCreationIntelligenceInput): string {
  const text = normalizeSearchText([
    input.title,
    input.description,
    input.projectName,
    ...(input.keywords ?? []),
  ]);

  if (text) {
    const match = AREA_RULES.find((rule) =>
      rule.expressions.some((expression) => expression.test(text)),
    );
    if (match) return match.area;
  }

  if (input.selectedArea?.trim()) return input.selectedArea.trim();
  if (input.area?.trim()) return input.area.trim();
  return "SGI";
}

export function suggestReviewPeriod(
  input: DocumentCreationIntelligenceInput,
): number {
  if (
    typeof input.default_review_months === "number" &&
    input.default_review_months > 0
  ) {
    return Math.round(input.default_review_months);
  }

  const type = inferDocumentType(input);
  return type ? REVIEW_PERIODS[type] : 24;
}

export function suggestNextReviewDate(
  input: DocumentCreationIntelligenceInput & {
    baseDate?: Date | string;
  },
): string | null {
  const months =
    input.review_period_months && input.review_period_months > 0
      ? input.review_period_months
      : suggestReviewPeriod(input);
  if (!Number.isFinite(months) || months <= 0) return null;

  const source = input.baseDate ? new Date(input.baseDate) : new Date();
  if (Number.isNaN(source.getTime())) return null;

  const sourceDay = source.getUTCDate();
  const result = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), 1),
  );
  result.setUTCMonth(result.getUTCMonth() + Math.round(months));
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(sourceDay, lastDay));

  return result.toISOString().slice(0, 10);
}

export function calculateInitialRevision(
  input: DocumentCreationIntelligenceInput,
): number {
  const isControlledPublishedImport =
    input.mode === "expert" &&
    input.initialStatus === "published" &&
    Boolean(input.importJustification?.trim());

  return isControlledPublishedImport ? 1 : 0;
}

export function assessDocumentCompleteness(
  input: DocumentCreationIntelligenceInput,
): DocumentCompletenessAssessment {
  const checks = [
    { ready: Boolean(input.title?.trim()), weight: 15, missing: "Título" },
    {
      ready: isDocumentType(input.doc_type),
      weight: 15,
      missing: "Tipo documental",
    },
    { ready: Boolean(input.area?.trim()), weight: 10, missing: "Área" },
    {
      ready: Boolean(input.description?.trim()),
      weight: 10,
      missing: "Descrição",
    },
    { ready: Boolean(input.project_id), weight: 5, missing: "Projeto" },
    { ready: hasFile(input), weight: 10, missing: "Arquivo" },
    {
      ready: Boolean(input.next_review_at),
      weight: 10,
      missing: "Prazo de revisão",
    },
    {
      ready: Boolean(input.author_id),
      weight: 10,
      missing: "Responsável/autor",
    },
    {
      ready:
        input.criticalMetadataComplete === true ||
        Boolean(input.description?.trim() && input.review_period_months),
      weight: 15,
      missing: "Metadados críticos",
    },
  ];

  return {
    score: checks.reduce(
      (total, check) => total + (check.ready ? check.weight : 0),
      0,
    ),
    missingItems: checks
      .filter((check) => !check.ready)
      .map((check) => check.missing),
  };
}

export function classifyDocumentRisk(
  input: DocumentCreationIntelligenceInput,
): DocumentRiskLevel {
  let riskPoints = 0;
  const confidentiality = input.confidentiality?.toLowerCase();
  const type = inferDocumentType(input);

  if (confidentiality === "restricted" || confidentiality === "confidential") {
    riskPoints += 3;
  }
  if (!input.next_review_at) riskPoints += 2;
  if (
    type &&
    ["RNC", "PRO", "IT"].includes(type) &&
    (input.description?.trim().length ?? 0) < 40
  ) {
    riskPoints += 2;
  }
  if (!hasFile(input)) riskPoints += 1;
  if ((input.revision ?? 0) !== calculateInitialRevision(input))
    riskPoints += 2;

  if (riskPoints >= 5) return "high";
  if (riskPoints >= 2) return "medium";
  return "low";
}

export function buildCreationRecommendations(
  input: DocumentCreationIntelligenceInput,
): string[] {
  const recommendations: string[] = [];
  const type = inferDocumentType(input);
  const suggestedPeriod = suggestReviewPeriod(input);

  if ((input.description?.trim().length ?? 0) < 40) {
    recommendations.push(
      "Adicione uma descrição para facilitar busca e auditoria.",
    );
  }
  if (
    !input.review_period_months ||
    input.review_period_months !== suggestedPeriod
  ) {
    recommendations.push(
      `Este tipo normalmente revisa a cada ${suggestedPeriod} meses.`,
    );
  }
  if (!hasFile(input)) {
    recommendations.push(
      "Documento sem arquivo pode ser usado como cadastro preliminar.",
    );
  }
  if (type && ["PRO", "IT", "RNC"].includes(type)) {
    recommendations.push(
      "Para documento crítico, considere configurar o fluxo de aprovação logo após a criação.",
    );
  }
  if (!input.project_id) {
    recommendations.push(
      "Vincule um projeto quando o documento pertencer a uma entrega específica.",
    );
  }
  if (!input.next_review_at) {
    recommendations.push(
      "Defina a próxima revisão para manter a governança documental.",
    );
  }

  return [...new Set(recommendations)];
}

export function normalizeDocumentCreationPayload<
  T extends Record<string, unknown>,
>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ])
      .filter(([, value]) => value !== ""),
  ) as Partial<T>;
}

export function getDocumentCreationModeCapabilities(
  schemaCapabilities: Partial<DocumentCreationCapabilities> | null | undefined,
): DocumentCreationCapabilities {
  return {
    confidentiality: schemaCapabilities?.confidentiality === true,
    external_reference: schemaCapabilities?.external_reference === true,
    source_system: schemaCapabilities?.source_system === true,
    metadata: schemaCapabilities?.metadata === true,
    tags: schemaCapabilities?.tags === true,
    project_id: schemaCapabilities?.project_id === true,
  };
}
