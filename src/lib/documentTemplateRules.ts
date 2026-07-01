import type { DocumentRiskLevel } from "@/lib/documentIntelligence";
import { DOC_TYPES } from "@/lib/constants";
import {
  formatReviewPeriod,
  readStoredReviewPeriod,
} from "@/lib/documentReviewPeriod";

export const DOCUMENT_RULE_FIELD_KEYS = [
  "title",
  "doc_type",
  "area",
  "description",
  "file",
  "project_id",
  "next_review_at",
  "confidentiality",
  "external_reference",
] as const;

export type DocumentRuleField = (typeof DOCUMENT_RULE_FIELD_KEYS)[number];
export type GovernanceRiskProfile = DocumentRiskLevel | "critical";
export type DocumentRuleSeverity = "info" | "warning" | "critical";

export const DOCUMENT_RULE_FIELD_LABELS: Record<DocumentRuleField, string> = {
  title: "Título",
  doc_type: "Tipo documental",
  area: "Área",
  description: "Descrição",
  file: "Arquivo",
  project_id: "Projeto",
  next_review_at: "Próxima revisão",
  confidentiality: "Confidencialidade",
  external_reference: "Referência externa",
};

export interface DocumentTemplateRecord {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  doc_type: string | null;
  area: string | null;
  project_id: string | null;
  is_active: boolean;
  is_default: boolean;
  priority: number;
  template_scope: "organization" | "project" | "area" | "type";
  default_title_pattern: string | null;
  default_description: string | null;
  default_review_months: number | null;
  required_fields: DocumentRuleField[];
  recommended_fields: DocumentRuleField[];
  default_metadata: Record<string, unknown>;
  governance_hints: Record<string, unknown>;
  risk_profile: GovernanceRiskProfile;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRuleRecord {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  condition: Record<string, unknown>;
  effects: Record<string, unknown>;
  severity: DocumentRuleSeverity;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRuleInput {
  org_id?: string | null;
  title?: string | null;
  doc_type?: string | null;
  area?: string | null;
  project_id?: string | null;
  description?: string | null;
  file?: File | null;
  hasFile?: boolean;
  next_review_at?: string | null;
  review_period_months?: number | null;
  confidentiality?: string | null;
  external_reference?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
}

export interface NormalizedRuleEffects {
  required_fields: DocumentRuleField[];
  recommended_fields: DocumentRuleField[];
  review_period_months: number | null;
  risk_level: GovernanceRiskProfile | null;
  recommendations: string[];
}

export interface RequiredFieldChecklistItem {
  field: DocumentRuleField;
  label: string;
  isRequired: true;
  isComplete: boolean;
  sources: string[];
}

export interface MergeTemplateAndHeuristicsInput {
  heuristic: {
    reviewPeriodMonths: number;
    riskLevel: DocumentRiskLevel;
    recommendations: string[];
  };
  template: DocumentTemplateRecord | null;
  appliedRules: DocumentRuleRecord[];
  configuredReviewMonths?: number | null;
}

export interface DocumentGovernanceDecision {
  reviewPeriodMonths: number;
  enforcedReviewPeriodMonths: number | null;
  reviewSource: "rule" | "template" | "document_type" | "heuristic";
  riskProfile: GovernanceRiskProfile;
  recommendations: string[];
  requiredFields: DocumentRuleField[];
  recommendedFields: DocumentRuleField[];
  defaultDescription: string | null;
  defaultMetadata: Record<string, unknown>;
  warnings: string[];
}

const BASE_REQUIRED_FIELDS: DocumentRuleField[] = ["title", "doc_type", "area"];

const RISK_WEIGHT: Record<GovernanceRiskProfile, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const KNOWN_CONDITION_KEYS = new Set([
  "doc_type",
  "area",
  "project_id",
  "title_contains",
  "description_contains",
  "tags_contains",
  "metadata_contains",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeComparable(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function containsComparable(value: string | null | undefined, expected: unknown) {
  if (typeof expected !== "string" || !expected.trim()) return false;
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes(
      expected
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase(),
    );
}

function uniqueFields(value: unknown): DocumentRuleField[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (field): field is DocumentRuleField =>
          typeof field === "string" &&
          DOCUMENT_RULE_FIELD_KEYS.includes(field as DocumentRuleField),
      ),
    ),
  ];
}

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeRisk(value: unknown): GovernanceRiskProfile | null {
  return value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
    ? value
    : null;
}

function highestRisk(values: Array<GovernanceRiskProfile | null | undefined>) {
  return (
    values
      .filter((value): value is GovernanceRiskProfile => Boolean(value))
      .sort((left, right) => RISK_WEIGHT[right] - RISK_WEIGHT[left])[0] ?? "low"
  );
}

function templateSpecificity(template: DocumentTemplateRecord) {
  return (
    Number(Boolean(template.project_id)) * 4 +
    Number(Boolean(template.doc_type)) * 2 +
    Number(Boolean(template.area))
  );
}

export function matchTemplateForDocument(
  input: DocumentRuleInput,
  templates: DocumentTemplateRecord[],
) {
  const candidates = templates.filter((template) => {
    if (!template.is_active) return false;
    if (!input.org_id || template.org_id !== input.org_id) return false;
    if (template.project_id && template.project_id !== input.project_id)
      return false;
    if (
      template.doc_type &&
      normalizeComparable(template.doc_type) !==
        normalizeComparable(input.doc_type)
    ) {
      return false;
    }
    if (
      template.area &&
      normalizeComparable(template.area) !== normalizeComparable(input.area)
    ) {
      return false;
    }
    if (template.template_scope === "project" && !template.project_id)
      return false;
    if (template.template_scope === "area" && !template.area) return false;
    if (template.template_scope === "type" && !template.doc_type) return false;
    return true;
  });

  return (
    [...candidates].sort(
      (left, right) =>
        left.priority - right.priority ||
        templateSpecificity(right) - templateSpecificity(left) ||
        Number(right.is_default) - Number(left.is_default) ||
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id) ||
        left.name.localeCompare(right.name, "pt-BR"),
    )[0] ?? null
  );
}

function metadataContains(
  metadata: Record<string, unknown> | null | undefined,
  expected: unknown,
) {
  if (!metadata || !isRecord(expected)) return false;
  return Object.entries(expected).every(([key, expectedValue]) => {
    const actualValue = metadata[key];
    if (Array.isArray(actualValue)) {
      const expectedItems = Array.isArray(expectedValue)
        ? expectedValue
        : [expectedValue];
      return expectedItems.every((item) =>
        actualValue.some(
          (actualItem) =>
            normalizeComparable(actualItem) === normalizeComparable(item),
        ),
      );
    }
    return (
      normalizeComparable(actualValue) === normalizeComparable(expectedValue)
    );
  });
}

function matchesCondition(input: DocumentRuleInput, condition: unknown) {
  if (!isRecord(condition)) return false;
  const keys = Object.keys(condition);
  if (keys.some((key) => !KNOWN_CONDITION_KEYS.has(key))) return false;

  return keys.every((key) => {
    const expected = condition[key];
    if (key === "tags_contains") {
      const expectedTags = Array.isArray(expected) ? expected : [expected];
      const actualTags = (input.tags ?? []).map((tag) =>
        normalizeComparable(tag),
      );
      return expectedTags.every((tag) =>
        actualTags.includes(normalizeComparable(tag)),
      );
    }
    if (key === "metadata_contains") {
      return metadataContains(input.metadata, expected);
    }
    if (key === "title_contains") {
      return containsComparable(input.title, expected);
    }
    if (key === "description_contains") {
      return containsComparable(input.description, expected);
    }
    return (
      normalizeComparable(input[key as "doc_type" | "area" | "project_id"]) ===
      normalizeComparable(expected)
    );
  });
}

export function evaluateDocumentRules(
  input: DocumentRuleInput,
  rules: DocumentRuleRecord[],
) {
  return rules
    .filter(
      (rule) =>
        rule.is_active &&
        Boolean(input.org_id) &&
        rule.org_id === input.org_id &&
        matchesCondition(input, rule.condition),
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id) ||
        left.name.localeCompare(right.name, "pt-BR"),
    );
}

export function normalizeRuleEffects(effects: unknown): NormalizedRuleEffects {
  const value = isRecord(effects) ? effects : {};
  const reviewMonths = Number(value.review_period_months);

  return {
    required_fields: uniqueFields(value.required_fields),
    recommended_fields: uniqueFields(value.recommended_fields),
    review_period_months:
      Number.isInteger(reviewMonths) && reviewMonths >= 1 && reviewMonths <= 120
        ? reviewMonths
        : null,
    risk_level: normalizeRisk(value.risk_level),
    recommendations: uniqueStrings(value.recommendations),
  };
}

export function mergeTemplateAndHeuristics({
  heuristic,
  template,
  appliedRules,
  configuredReviewMonths,
}: MergeTemplateAndHeuristicsInput): DocumentGovernanceDecision {
  const ruleEffects = appliedRules.map((rule) =>
    normalizeRuleEffects(rule.effects),
  );
  const enforcedReviewPeriodMonths =
    ruleEffects.find((effects) => effects.review_period_months !== null)
      ?.review_period_months ?? null;
  const periodRules = appliedRules
    .map((rule, index) => ({
      rule,
      period: ruleEffects[index].review_period_months,
    }))
    .filter(
      (
        item,
      ): item is {
        rule: DocumentRuleRecord;
        period: number;
      } => item.period !== null,
    );
  const distinctPeriods = [...new Set(periodRules.map((item) => item.period))];
  const warnings =
    distinctPeriods.length > 1
      ? [
          `Conflito de prazo: a regra "${periodRules[0].rule.name}" (${periodRules[0].period} meses) prevalece por prioridade sobre ${periodRules
            .slice(1)
            .map((item) => `"${item.rule.name}" (${item.period} meses)`)
            .join(", ")}.`,
        ]
      : [];
  const validConfiguredMonths =
    Number.isInteger(configuredReviewMonths) &&
    (configuredReviewMonths ?? 0) >= 1 &&
    (configuredReviewMonths ?? 0) <= 120
      ? configuredReviewMonths!
      : null;
  const reviewPeriodMonths =
    enforcedReviewPeriodMonths ??
    template?.default_review_months ??
    validConfiguredMonths ??
    heuristic.reviewPeriodMonths ??
    24;
  const reviewSource = enforcedReviewPeriodMonths
    ? "rule"
    : template?.default_review_months
      ? "template"
      : validConfiguredMonths
        ? "document_type"
        : "heuristic";
  const hintRecommendations = uniqueStrings(
    template?.governance_hints.recommendations,
  );
  const requiredFields = [
    ...new Set([
      ...(template?.required_fields ?? []),
      ...ruleEffects.flatMap((effects) => effects.required_fields),
    ]),
  ];
  const compatibleHeuristicRecommendations = requiredFields.includes("file")
    ? heuristic.recommendations.filter(
        (recommendation) =>
          !recommendation
            .toLowerCase()
            .includes("documento sem arquivo pode ser usado"),
      )
    : heuristic.recommendations;

  return {
    reviewPeriodMonths,
    enforcedReviewPeriodMonths,
    reviewSource,
    riskProfile: highestRisk([
      heuristic.riskLevel,
      template?.risk_profile,
      ...ruleEffects.map((effects) => effects.risk_level),
    ]),
    recommendations: [
      ...new Set([
        ...ruleEffects.flatMap((effects) => effects.recommendations),
        ...hintRecommendations,
        ...compatibleHeuristicRecommendations,
      ]),
    ],
    requiredFields,
    recommendedFields: [
      ...new Set([
        ...(template?.recommended_fields ?? []),
        ...ruleEffects.flatMap((effects) => effects.recommended_fields),
      ]),
    ],
    defaultDescription: template?.default_description ?? null,
    defaultMetadata: template?.default_metadata ?? {},
    warnings,
  };
}

function isFieldComplete(input: DocumentRuleInput, field: DocumentRuleField) {
  if (field === "file") return input.hasFile === true || Boolean(input.file);
  const value = input[field];
  return typeof value === "string" ? Boolean(value.trim()) : Boolean(value);
}

export function buildRequiredFieldChecklist(
  input: DocumentRuleInput,
  template: DocumentTemplateRecord | null,
  rules: DocumentRuleRecord[],
) {
  const ruleEffects = rules.map((rule) => ({
    rule,
    effects: normalizeRuleEffects(rule.effects),
  }));
  const requiredFields = [
    ...new Set([
      ...BASE_REQUIRED_FIELDS,
      ...(template?.required_fields ?? []),
      ...ruleEffects.flatMap(({ effects }) => effects.required_fields),
    ]),
  ];

  return requiredFields.map<RequiredFieldChecklistItem>((field) => {
    const sources: string[] = [];
    if (BASE_REQUIRED_FIELDS.includes(field)) sources.push("TRAMITA");
    if (template?.required_fields.includes(field)) sources.push(template.name);
    for (const { rule, effects } of ruleEffects) {
      if (effects.required_fields.includes(field)) sources.push(rule.name);
    }

    return {
      field,
      label: DOCUMENT_RULE_FIELD_LABELS[field],
      isRequired: true,
      isComplete: isFieldComplete(input, field),
      sources,
    };
  });
}

export function calculateGovernanceScore(
  input: DocumentRuleInput,
  template: DocumentTemplateRecord | null,
  rules: DocumentRuleRecord[],
) {
  const checklist = buildRequiredFieldChecklist(input, template, rules);
  const completeRequired = checklist.filter((item) => item.isComplete).length;
  const requiredScore = checklist.length
    ? (completeRequired / checklist.length) * 40
    : 40;
  const templateScore = template
    ? completeRequired === checklist.length
      ? 20
      : 10
    : 20;
  const reviewScore =
    input.review_period_months &&
    input.review_period_months > 0 &&
    input.next_review_at
      ? 15
      : 0;
  const fileRequired = checklist.some((item) => item.field === "file");
  const fileScore =
    !fileRequired || input.hasFile === true || Boolean(input.file) ? 10 : 0;
  const ruleRisk = highestRisk([
    template?.risk_profile,
    ...rules.map((rule) => normalizeRuleEffects(rule.effects).risk_level),
  ]);
  const riskScore = { low: 15, medium: 10, high: 5, critical: 0 }[ruleRisk];

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        requiredScore + templateScore + reviewScore + fileScore + riskScore,
      ),
    ),
  );
}

function documentTypeLabel(value: unknown) {
  return (
    DOC_TYPES.find((type) => type.value === String(value))?.label ??
    String(value)
  );
}

const AREA_LABELS: Record<string, string> = {
  SGI: "Sistema de Gestão Integrada",
  ENG: "Engenharia",
  OPS: "Operações",
  MNT: "Manutenção",
  SST: "Saúde e Segurança",
  MA: "Meio Ambiente",
  QUA: "Qualidade",
  ADM: "Administrativo",
};

function areaLabel(value: unknown) {
  return AREA_LABELS[String(value)] ?? String(value);
}

export function describeDocumentPolicyCondition(
  condition: Record<string, unknown>,
) {
  const parts: string[] = [];
  if (condition.doc_type)
    parts.push(`tipo documental “${documentTypeLabel(condition.doc_type)}”`);
  if (condition.area)
    parts.push(`área “${areaLabel(condition.area)}”`);
  if (condition.project_id) parts.push("projeto específico selecionado");
  if (condition.title_contains)
    parts.push(`título contendo “${String(condition.title_contains)}”`);
  if (condition.description_contains)
    parts.push(
      `descrição contendo “${String(condition.description_contains)}”`,
    );
  if (condition.tags_contains) parts.push("tags correspondentes");
  if (condition.metadata_contains) parts.push("metadados correspondentes");
  return parts.length ? parts.join(" e ") : "todos os documentos";
}

export function explainAppliedRules(appliedRules: DocumentRuleRecord[]) {
  return appliedRules.map((rule) => {
    const effects = normalizeRuleEffects(rule.effects);
    const impacts: string[] = [];
    if (effects.required_fields.length) {
      impacts.push(
        `exige ${effects.required_fields
          .map((field) => DOCUMENT_RULE_FIELD_LABELS[field].toLowerCase())
          .join(", ")}`,
      );
    }
    if (effects.review_period_months) {
      impacts.push(
        `define revisão em ${formatReviewPeriod(
          readStoredReviewPeriod(
            rule.effects.review_period,
            effects.review_period_months,
          ),
        )}`,
      );
    }
    if (effects.risk_level) {
      impacts.push(`define risco ${effects.risk_level}`);
    }
    if (effects.recommendations.length) {
      impacts.push("adiciona orientação de governança");
    }

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      reason: `Aplicada a ${describeDocumentPolicyCondition(rule.condition)}.`,
      impact: impacts.join("; ") || "Regra informativa sem efeito obrigatório.",
      severity: rule.severity,
    };
  });
}

export function explainTemplateSelection(
  template: DocumentTemplateRecord | null,
) {
  if (!template) return null;
  const matches = [
    template.project_id ? "projeto" : null,
    template.doc_type ? `tipo ${template.doc_type}` : null,
    template.area ? `área ${template.area}` : null,
  ].filter(Boolean);
  return `O template "${template.name}" foi escolhido por prioridade ${template.priority}${
    matches.length ? ` e correspondência com ${matches.join(" e ")}` : ""
  }. ${
    template.required_fields.length
      ? "Ele contém exigências legadas que ainda podem bloquear a criação."
      : "Este template apenas sugere valores; ele não bloqueia a criação."
  }`;
}

export function explainRuleEvaluation(
  input: DocumentRuleInput,
  rules: DocumentRuleRecord[],
) {
  return rules.map((rule) => {
    if (!rule.is_active) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        applied: false,
        explanation: `A regra "${rule.name}" não foi aplicada porque está inativa.`,
      };
    }
    if (!input.org_id || rule.org_id !== input.org_id) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        applied: false,
        explanation: `A regra "${rule.name}" não foi aplicada porque pertence a outra organização.`,
      };
    }
    const condition = rule.condition;
    const unknownKey = Object.keys(condition).find(
      (key) => !KNOWN_CONDITION_KEYS.has(key),
    );
    if (unknownKey) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        applied: false,
        explanation: `A regra "${rule.name}" não foi aplicada porque usa a condição desconhecida "${unknownKey}".`,
      };
    }
    if (
      condition.doc_type &&
      normalizeComparable(condition.doc_type) !==
        normalizeComparable(input.doc_type)
    ) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        applied: false,
        explanation: `A regra "${rule.name}" exige tipo ${String(condition.doc_type)}, mas o tipo atual é ${input.doc_type || "não definido"}.`,
      };
    }
    if (
      condition.area &&
      normalizeComparable(condition.area) !== normalizeComparable(input.area)
    ) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        applied: false,
        explanation: `A regra "${rule.name}" exige área ${String(condition.area)}, mas a área atual é ${input.area || "não definida"}.`,
      };
    }
    if (
      condition.project_id &&
      normalizeComparable(condition.project_id) !==
        normalizeComparable(input.project_id)
    ) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        applied: false,
        explanation: `A regra "${rule.name}" não foi aplicada porque o projeto atual não corresponde ao configurado.`,
      };
    }
    if (
      condition.title_contains &&
      !containsComparable(input.title, condition.title_contains)
    ) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        applied: false,
        explanation: `A regra "${rule.name}" não foi aplicada porque o título não contém “${String(condition.title_contains)}”.`,
      };
    }
    if (
      condition.description_contains &&
      !containsComparable(input.description, condition.description_contains)
    ) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        applied: false,
        explanation: `A regra "${rule.name}" não foi aplicada porque a descrição não contém “${String(condition.description_contains)}”.`,
      };
    }
    if (!matchesCondition(input, condition)) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        applied: false,
        explanation: `A regra "${rule.name}" não foi aplicada porque tags ou metadados não correspondem às condições.`,
      };
    }

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      applied: true,
      explanation: `A regra "${rule.name}" foi aplicada porque corresponde a ${describeDocumentPolicyCondition(condition)}.`,
    };
  });
}

export function describeTemplatePolicy(template: DocumentTemplateRecord) {
  const reviewPeriod = readStoredReviewPeriod(
    template.governance_hints.review_period,
    template.default_review_months,
  );
  const context = [
    template.doc_type
      ? `documentos do tipo ${documentTypeLabel(template.doc_type)}`
      : null,
    template.area ? `da área ${areaLabel(template.area)}` : null,
    template.project_id ? "do projeto selecionado" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const suggestions = [
    template.default_description ? "uma estrutura inicial de descrição" : null,
    template.default_review_months
      ? `revisão em ${formatReviewPeriod(reviewPeriod)}`
      : null,
    template.recommended_fields.length
      ? `o preenchimento de ${template.recommended_fields
          .map((field) => DOCUMENT_RULE_FIELD_LABELS[field].toLowerCase())
          .join(", ")}`
      : null,
  ].filter(Boolean);

  return `${context ? `Para ${context}, ` : ""}sugere ${
    suggestions.join(", ") || "valores padrão para a criação"
  }. Templates orientam o usuário e não bloqueiam por si só.${
    template.required_fields.length
      ? " Este template legado ainda possui exigências obrigatórias configuradas."
      : ""
  }`;
}

export function describeRulePolicy(rule: DocumentRuleRecord) {
  const effects = normalizeRuleEffects(rule.effects);
  const reviewPeriod = readStoredReviewPeriod(
    rule.effects.review_period,
    effects.review_period_months,
  );
  const impacts = [
    effects.required_fields.length
      ? `exige ${effects.required_fields
          .map((field) => DOCUMENT_RULE_FIELD_LABELS[field].toLowerCase())
          .join(", ")}`
      : null,
    effects.review_period_months
      ? `mantém revisão em ${formatReviewPeriod(reviewPeriod)}`
      : null,
    effects.risk_level ? `eleva o risco para ${effects.risk_level}` : null,
    effects.recommendations.length ? "mostra orientações ao usuário" : null,
  ].filter(Boolean);

  return `Quando corresponder a ${describeDocumentPolicyCondition(
    rule.condition,
  )}, ${impacts.join(", ") || "apresenta uma orientação informativa"}.${
    effects.required_fields.length
      ? " A criação será bloqueada enquanto os requisitos não forem atendidos."
      : ""
  }`;
}

export function isDocumentTemplateSchemaUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(code) ||
    message.includes("document_creation_templates") ||
    message.includes("document_creation_rules") ||
    message.includes("document_template_usage_logs") ||
    message.includes("schema cache")
  );
}
