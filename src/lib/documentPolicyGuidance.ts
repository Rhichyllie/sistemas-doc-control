import {
  explainAppliedRules,
  explainTemplateSelection,
  normalizeRuleEffects,
  type DocumentRuleField,
  type DocumentRuleInput,
  type DocumentRuleRecord,
  type DocumentTemplateRecord,
  type GovernanceRiskProfile,
  type RequiredFieldChecklistItem,
} from "@/lib/documentTemplateRules";

export type DocumentPolicyGuidanceStatus =
  | "ready"
  | "needs_attention"
  | "blocked"
  | "fallback";

export type DocumentPolicyAvailability =
  | "available"
  | "empty"
  | "not_applicable"
  | "schema_missing"
  | "permission_denied";

export interface DocumentPolicyRequiredItem {
  field: DocumentRuleField | string;
  label: string;
  requiredBy: string[];
  isSatisfied: boolean;
  reason: string;
  actionLabel: string;
  severity: "info" | "warning" | "critical";
}

export interface DocumentPolicyGuidance {
  status: DocumentPolicyGuidanceStatus;
  title: string;
  summary: string;
  appliedPolicyNames: string[];
  requiredItems: DocumentPolicyRequiredItem[];
  nextActions: string[];
  blockingReasons: string[];
  satisfiedCount: number;
  totalRequiredCount: number;
  explanation: string[];
  canAutoApply: boolean;
}

interface BuildDocumentPolicyGuidanceInput {
  form: DocumentRuleInput;
  template: DocumentTemplateRecord | null;
  appliedRules: DocumentRuleRecord[];
  checklist: RequiredFieldChecklistItem[];
  governanceScore: number;
  governanceRiskProfile: GovernanceRiskProfile;
  warnings: string[];
  validationErrors: string[];
  enforcedReviewPeriodMonths: number | null;
  availability: DocumentPolicyAvailability;
}

const FIELD_GUIDANCE: Record<
  DocumentRuleField,
  { reason: string; action: string }
> = {
  title: {
    reason: "Identifica o documento e permite sua recuperação.",
    action: "Informe o título do documento.",
  },
  doc_type: {
    reason: "Define as regras de classificação e governança aplicáveis.",
    action: "Selecione o tipo documental.",
  },
  area: {
    reason: "Determina a área responsável e suas políticas.",
    action: "Selecione a área responsável.",
  },
  description: {
    reason: "Fornece contexto mínimo para busca, auditoria e aprovação.",
    action: "Adicione uma descrição para atender à política.",
  },
  file: {
    reason: "Mantém a evidência ou o conteúdo inicial do documento governado.",
    action: "Anexe um arquivo inicial para concluir a política documental.",
  },
  project_id: {
    reason: "Vincula o documento ao contexto de execução correto.",
    action: "Selecione o projeto relacionado.",
  },
  next_review_at: {
    reason: "Define quando a validade documental deve ser reavaliada.",
    action: "Defina a próxima revisão.",
  },
  confidentiality: {
    reason: "Aplica o tratamento de acesso exigido pela governança.",
    action: "Defina a confidencialidade.",
  },
  external_reference: {
    reason: "Preserva a rastreabilidade com a referência de origem.",
    action: "Informe a referência externa.",
  },
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  ];
}

function policySources(item: RequiredFieldChecklistItem) {
  const sources = item.sources.filter((source) => source !== "TRAMITA");
  return sources.length ? sources : item.sources;
}

function itemSeverity(
  item: RequiredFieldChecklistItem,
  rules: DocumentRuleRecord[],
  risk: GovernanceRiskProfile,
) {
  if (item.isComplete) return "info" as const;
  const hasCriticalRule = rules.some(
    (rule) =>
      rule.severity === "critical" &&
      item.sources.includes(rule.name) &&
      normalizeRuleEffects(rule.effects).required_fields.includes(item.field),
  );
  return hasCriticalRule || risk === "critical"
    ? ("critical" as const)
    : ("warning" as const);
}

function fallbackContent(availability: DocumentPolicyAvailability) {
  if (availability === "schema_missing") {
    return {
      title: "Criação em modo heurístico",
      summary:
        "Ciclo 14 não instalado. A criação continua com a inteligência local P-10B.",
    };
  }
  if (availability === "permission_denied") {
    return {
      title: "Políticas indisponíveis por permissão",
      summary:
        "Não foi possível carregar políticas documentais por permissão. A criação continua com heurísticas locais.",
    };
  }
  if (availability === "not_applicable") {
    return {
      title: "Nenhuma política aplicável",
      summary:
        "Existem políticas cadastradas, mas nenhuma corresponde ao tipo, área ou projeto atual. Usando inteligência local P-10B.",
    };
  }
  return {
    title: "Inteligência local ativa",
    summary:
      "Sem políticas documentais configuradas. Usando inteligência local P-10B.",
  };
}

export function buildDocumentPolicyGuidance({
  form,
  template,
  appliedRules,
  checklist,
  governanceScore,
  governanceRiskProfile,
  warnings,
  validationErrors,
  enforcedReviewPeriodMonths,
  availability,
}: BuildDocumentPolicyGuidanceInput): DocumentPolicyGuidance {
  const appliedPolicyNames = uniqueStrings([
    template?.name,
    ...appliedRules.map((rule) => rule.name),
  ]);
  const requiredItems = checklist.map<DocumentPolicyRequiredItem>((item) => {
    const requiredBy = policySources(item);
    const sourceText = requiredBy.length
      ? ` Exigido por ${requiredBy.join(", ")}.`
      : "";
    return {
      field: item.field,
      label: item.label,
      requiredBy,
      isSatisfied: item.isComplete,
      reason: `${FIELD_GUIDANCE[item.field].reason}${sourceText}`,
      actionLabel: FIELD_GUIDANCE[item.field].action,
      severity: itemSeverity(item, appliedRules, governanceRiskProfile),
    };
  });
  const missingItems = requiredItems.filter((item) => !item.isSatisfied);
  const reviewConflict =
    enforcedReviewPeriodMonths !== null &&
    form.review_period_months !== enforcedReviewPeriodMonths;
  const policyMissingItems = missingItems.filter((item) =>
    item.requiredBy.some((source) => source !== "TRAMITA"),
  );
  const policyBlockingReasons = policyMissingItems.map(
    (item) =>
      `${item.label} obrigatória ausente (${item.requiredBy.join(", ")}).`,
  );
  if (reviewConflict) {
    policyBlockingReasons.push(
      `Período de revisão diferente dos ${enforcedReviewPeriodMonths} meses exigidos pela política.`,
    );
  }
  const genericReasons = validationErrors.filter(
    (error) =>
      !error.startsWith("Preencha os campos obrigatórios da política") &&
      !error.startsWith("A política documental exige revisão"),
  );
  const blockingReasons = uniqueStrings([
    ...policyBlockingReasons,
    ...genericReasons,
  ]);
  const nextActions = uniqueStrings([
    ...missingItems.map((item) => item.actionLabel),
    reviewConflict
      ? `Aplique o prazo de ${enforcedReviewPeriodMonths} meses exigido pela política.`
      : null,
  ]);
  const explanation = uniqueStrings([
    explainTemplateSelection(template),
    ...explainAppliedRules(appliedRules).flatMap((rule) => [
      `${rule.ruleName}: ${rule.reason}`,
      rule.impact,
    ]),
    governanceRiskProfile === "high" || governanceRiskProfile === "critical"
      ? `O risco foi elevado para ${governanceRiskProfile} pela política aplicada.`
      : null,
    enforcedReviewPeriodMonths
      ? `O período de revisão foi definido em ${enforcedReviewPeriodMonths} meses pela política aplicada.`
      : null,
    ...warnings,
  ]);
  const isFallback =
    availability !== "available" || appliedPolicyNames.length === 0;
  const isBlocked =
    !isFallback &&
    (policyBlockingReasons.length > 0 || validationErrors.length > 0);
  const isReady =
    !isFallback && blockingReasons.length === 0 && missingItems.length === 0;
  const status: DocumentPolicyGuidanceStatus = isFallback
    ? "fallback"
    : isBlocked
      ? "blocked"
      : isReady
        ? "ready"
        : "needs_attention";
  const fallback = fallbackContent(availability);
  const title =
    status === "fallback"
      ? fallback.title
      : status === "blocked"
        ? "Criação bloqueada por política documental"
        : status === "ready"
          ? "Documento em conformidade"
          : "Política aplicada — revise as orientações";
  const summary =
    status === "fallback"
      ? fallback.summary
      : status === "blocked"
        ? `Faltam ${policyBlockingReasons.length || blockingReasons.length} requisito(s) de política antes de criar.`
        : status === "ready"
          ? "Documento em conformidade com as regras aplicadas."
          : `Aderência de governança em ${governanceScore}%. Revise as recomendações antes de criar.`;
  const canAutoApply = Boolean(
    reviewConflict ||
    (!form.description?.trim() && template?.default_description) ||
    (!form.doc_type && template?.doc_type) ||
    (!form.area && template?.area),
  );

  return {
    status,
    title,
    summary,
    appliedPolicyNames,
    requiredItems,
    nextActions:
      nextActions.length || status !== "ready"
        ? nextActions
        : ["Documento pronto para criação."],
    blockingReasons,
    satisfiedCount: requiredItems.filter((item) => item.isSatisfied).length,
    totalRequiredCount: requiredItems.length,
    explanation,
    canAutoApply,
  };
}
