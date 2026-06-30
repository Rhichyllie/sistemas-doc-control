import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";
import {
  buildDocumentRulesDiagnostics,
  classifyDocumentRulesError,
  getDocumentRulesMutationErrorMessage,
  type DocumentRulesDiagnostics,
} from "@/lib/documentRulesDiagnostics";
import {
  evaluateDocumentRules,
  explainAppliedRules,
  matchTemplateForDocument,
  normalizeRuleEffects,
  type DocumentRuleField,
  type DocumentRuleInput,
  type DocumentRuleRecord,
  type DocumentRuleSeverity,
  type DocumentTemplateRecord,
  type GovernanceRiskProfile,
} from "@/lib/documentTemplateRules";

export interface DocumentRulesProject {
  id: string;
  code: string;
  name: string;
}

export interface DocumentTemplateMutationInput {
  name: string;
  description?: string | null;
  doc_type?: string | null;
  area?: string | null;
  project_id?: string | null;
  is_active?: boolean;
  is_default?: boolean;
  priority?: number;
  template_scope?: DocumentTemplateRecord["template_scope"];
  default_title_pattern?: string | null;
  default_description?: string | null;
  default_review_months?: number | null;
  required_fields?: DocumentRuleField[];
  recommended_fields?: DocumentRuleField[];
  default_metadata?: Record<string, unknown>;
  governance_hints?: Record<string, unknown>;
  risk_profile?: GovernanceRiskProfile;
}

export interface DocumentRuleMutationInput {
  name: string;
  description?: string | null;
  is_active?: boolean;
  priority?: number;
  condition?: Record<string, unknown>;
  effects?: Record<string, unknown>;
  severity?: DocumentRuleSeverity;
}

interface UseDocumentTemplatesAndRulesOptions {
  enabled?: boolean;
  includeInactive?: boolean;
}

const COMPATIBILITY_MESSAGE =
  "Templates e regras documentais ainda não estão disponíveis neste ambiente. Aplique o ciclo 14 para habilitar a governança configurável.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeTemplate(value: unknown): DocumentTemplateRecord | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const requiredFields = normalizeRuleEffects({
    required_fields: value.required_fields,
  }).required_fields;
  const recommendedFields = normalizeRuleEffects({
    recommended_fields: value.recommended_fields,
  }).recommended_fields;
  const riskProfile: GovernanceRiskProfile =
    value.risk_profile === "low" ||
    value.risk_profile === "high" ||
    value.risk_profile === "critical"
      ? value.risk_profile
      : "medium";
  const templateScope: DocumentTemplateRecord["template_scope"] =
    value.template_scope === "project" ||
    value.template_scope === "area" ||
    value.template_scope === "type"
      ? value.template_scope
      : "organization";

  return {
    id: value.id,
    org_id: String(value.org_id ?? ""),
    name: String(value.name ?? "Template sem nome"),
    description:
      typeof value.description === "string" ? value.description : null,
    doc_type: typeof value.doc_type === "string" ? value.doc_type : null,
    area: typeof value.area === "string" ? value.area : null,
    project_id: typeof value.project_id === "string" ? value.project_id : null,
    is_active: value.is_active !== false,
    is_default: value.is_default === true,
    priority: Number.isInteger(value.priority) ? Number(value.priority) : 100,
    template_scope: templateScope,
    default_title_pattern:
      typeof value.default_title_pattern === "string"
        ? value.default_title_pattern
        : null,
    default_description:
      typeof value.default_description === "string"
        ? value.default_description
        : null,
    default_review_months:
      Number.isInteger(value.default_review_months) &&
      Number(value.default_review_months) >= 1 &&
      Number(value.default_review_months) <= 120
        ? Number(value.default_review_months)
        : null,
    required_fields: requiredFields,
    recommended_fields: recommendedFields,
    default_metadata: isRecord(value.default_metadata)
      ? value.default_metadata
      : {},
    governance_hints: isRecord(value.governance_hints)
      ? value.governance_hints
      : {},
    risk_profile: riskProfile,
    created_by: typeof value.created_by === "string" ? value.created_by : null,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

function normalizeRule(value: unknown): DocumentRuleRecord | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const severity: DocumentRuleSeverity =
    value.severity === "warning" || value.severity === "critical"
      ? value.severity
      : "info";
  return {
    id: value.id,
    org_id: String(value.org_id ?? ""),
    name: String(value.name ?? "Regra sem nome"),
    description:
      typeof value.description === "string" ? value.description : null,
    is_active: value.is_active !== false,
    priority: Number.isInteger(value.priority) ? Number(value.priority) : 100,
    condition: isRecord(value.condition) ? value.condition : {},
    effects: isRecord(value.effects) ? value.effects : {},
    severity,
    created_by: typeof value.created_by === "string" ? value.created_by : null,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

function normalizeConditionForMutation(
  condition: Record<string, unknown> | undefined,
) {
  const normalized = { ...(condition ?? {}) };
  if (typeof normalized.doc_type === "string") {
    normalized.doc_type = normalized.doc_type.trim().toUpperCase();
  }
  if (typeof normalized.area === "string") {
    normalized.area = normalized.area.trim().toUpperCase();
  }
  return normalized;
}

function normalizeEffectsForMutation(
  effects: Record<string, unknown> | undefined,
) {
  const source = { ...(effects ?? {}) };
  const normalized = normalizeRuleEffects(source);
  if ("required_fields" in source) {
    source.required_fields = normalized.required_fields;
  }
  if ("recommended_fields" in source) {
    source.recommended_fields = normalized.recommended_fields;
  }
  if ("review_period_months" in source) {
    if (normalized.review_period_months === null) {
      delete source.review_period_months;
    } else {
      source.review_period_months = normalized.review_period_months;
    }
  }
  if ("risk_level" in source) {
    if (normalized.risk_level === null) delete source.risk_level;
    else source.risk_level = normalized.risk_level;
  }
  if ("recommendations" in source) {
    source.recommendations = normalized.recommendations;
  }
  return source;
}

export function useDocumentTemplatesAndRules(
  options: UseDocumentTemplatesAndRulesOptions = {},
) {
  const { enabled = true, includeInactive = false } = options;
  const { profile } = useAuthContext();
  const [templates, setTemplates] = useState<DocumentTemplateRecord[]>([]);
  const [rules, setRules] = useState<DocumentRuleRecord[]>([]);
  const [projects, setProjects] = useState<DocumentRulesProject[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUseTemplates, setCanUseTemplates] = useState(false);
  const [canUseRules, setCanUseRules] = useState(false);
  const [canUseProjects, setCanUseProjects] = useState(false);
  const [compatibilityMessage, setCompatibilityMessage] = useState<
    string | null
  >(null);
  const [diagnostics, setDiagnostics] =
    useState<DocumentRulesDiagnostics | null>(null);
  const [lastMutationMessage, setLastMutationMessage] = useState<string | null>(
    null,
  );

  const refresh = useCallback(async () => {
    if (!enabled || !profile?.org_id) {
      setTemplates([]);
      setRules([]);
      setProjects([]);
      setCanUseTemplates(false);
      setCanUseRules(false);
      setCanUseProjects(false);
      setCompatibilityMessage(null);
      setDiagnostics(
        buildDocumentRulesDiagnostics({
          profile,
        }),
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCompatibilityMessage(null);
    setLastMutationMessage(null);

    try {
      const templateQuery = supabase
        .from("document_creation_templates")
        .select("*")
        .eq("org_id", profile.org_id);
      const ruleQuery = supabase
        .from("document_creation_rules")
        .select("*")
        .eq("org_id", profile.org_id);
      const [templateResult, ruleResult, projectResult] = await Promise.all([
        templateQuery
          .order("priority", { ascending: true })
          .order("name", { ascending: true }),
        ruleQuery
          .order("priority", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("projects")
          .select("id, code, name, status")
          .order("name", { ascending: true }),
      ]);

      const loadedTemplates = templateResult.error
        ? []
        : (templateResult.data ?? [])
            .map(normalizeTemplate)
            .filter((template): template is DocumentTemplateRecord =>
              Boolean(template),
            );
      const loadedRules = ruleResult.error
        ? []
        : (ruleResult.data ?? [])
            .map(normalizeRule)
            .filter((rule): rule is DocumentRuleRecord => Boolean(rule));

      setTemplates(
        includeInactive
          ? loadedTemplates
          : loadedTemplates.filter((template) => template.is_active),
      );
      setRules(
        includeInactive
          ? loadedRules
          : loadedRules.filter((rule) => rule.is_active),
      );
      setCanUseTemplates(!templateResult.error);
      setCanUseRules(!ruleResult.error);

      if (projectResult.error) {
        setProjects([]);
        setCanUseProjects(false);
      } else {
        setProjects(
          (projectResult.data ?? [])
            .filter(
              (project) =>
                project.status !== "cancelled" && project.status !== "archived",
            )
            .map((project) => ({
              id: project.id,
              code: project.code ?? "",
              name: project.name,
            })),
        );
        setCanUseProjects(true);
      }

      const nextDiagnostics = buildDocumentRulesDiagnostics({
        profile,
        templateError: templateResult.error,
        ruleError: ruleResult.error,
        templates: loadedTemplates,
        rules: loadedRules,
      });
      setDiagnostics(nextDiagnostics);

      if (
        nextDiagnostics.code === "schema_missing" ||
        nextDiagnostics.code === "partial_schema"
      ) {
        setCompatibilityMessage(COMPATIBILITY_MESSAGE);
      }
      if (
        nextDiagnostics.code === "permission_denied" ||
        nextDiagnostics.code === "load_error"
      ) {
        const rawErrors = [templateResult.error, ruleResult.error]
          .filter(Boolean)
          .map((item) => getErrorMessage(item, "erro não identificado"))
          .join(" · ");
        setError(`${nextDiagnostics.message} ${rawErrors}`.trim());
      }
    } catch (err: unknown) {
      setDiagnostics(
        buildDocumentRulesDiagnostics({
          profile,
          templateError: err,
          ruleError: err,
        }),
      );
      setError(
        getErrorMessage(
          err,
          "Não foi possível carregar templates e regras documentais.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [enabled, includeInactive, profile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getBestTemplate = useCallback(
    (input: DocumentRuleInput) =>
      matchTemplateForDocument(
        { ...input, org_id: profile?.org_id ?? input.org_id },
        templates,
      ),
    [profile?.org_id, templates],
  );

  const evaluate = useCallback(
    (input: DocumentRuleInput) => {
      const scopedInput = {
        ...input,
        org_id: profile?.org_id ?? input.org_id,
      };
      const template = matchTemplateForDocument(scopedInput, templates);
      const appliedRules = evaluateDocumentRules(scopedInput, rules);
      const activeTemplates = diagnostics?.templates.active ?? templates.length;
      const activeRules = diagnostics?.rules.active ?? rules.length;
      const contextLabel = [
        scopedInput.doc_type ? `tipo ${scopedInput.doc_type}` : null,
        scopedInput.area ? `área ${scopedInput.area}` : null,
        scopedInput.project_id ? "projeto selecionado" : null,
      ]
        .filter(Boolean)
        .join(" e ");
      const applicationMessages: string[] = [];
      if (activeTemplates > 0 && !template) {
        applicationMessages.push(
          `${activeTemplates} template(s) ativo(s), mas nenhum corresponde a ${contextLabel || "este contexto"}.`,
        );
      }
      if (activeRules > 0 && !appliedRules.length) {
        applicationMessages.push(
          `${activeRules} regra(s) ativa(s), mas nenhuma corresponde a ${contextLabel || "este contexto"}.`,
        );
      }
      return {
        template,
        appliedRules,
        explanations: explainAppliedRules(appliedRules),
        applicationDiagnostics: {
          activeTemplates,
          inactiveTemplates: diagnostics?.templates.inactive ?? 0,
          activeRules,
          inactiveRules: diagnostics?.rules.inactive ?? 0,
          hasApplicableTemplate: Boolean(template),
          applicableRuleCount: appliedRules.length,
          message: applicationMessages.join(" "),
        },
      };
    },
    [diagnostics, profile?.org_id, rules, templates],
  );

  function canManage() {
    if (!profile?.id) {
      const message =
        "Perfil interno não disponível. Atualize a sessão antes de administrar regras.";
      setError(message);
      setLastMutationMessage(message);
      return false;
    }
    if (!profile.org_id) {
      const message =
        "Perfil sem organização disponível para gerenciar regras.";
      setError(message);
      setLastMutationMessage(message);
      return false;
    }
    if (profile.role !== "admin" && profile.role !== "manager") {
      const message =
        "Você não tem permissão para administrar regras documentais. Se o próprio usuário perdeu o papel administrativo, apenas outro admin ou uma manutenção controlada no Supabase pode restaurá-lo.";
      setError(message);
      setLastMutationMessage(message);
      return false;
    }
    return true;
  }

  function handleMutationError(
    err: unknown,
    fallback: string,
    entity: "template" | "regra",
  ) {
    const kind = classifyDocumentRulesError(err);
    if (kind === "schema_missing") {
      setCompatibilityMessage(COMPATIBILITY_MESSAGE);
    }
    const classifiedMessage = getDocumentRulesMutationErrorMessage(err, entity);
    const rawMessage = getErrorMessage(err, fallback);
    const message = classifiedMessage
      ? `${classifiedMessage} Detalhes: ${rawMessage}`
      : rawMessage;
    setError(message);
    setLastMutationMessage(message);
  }

  function requireResource(available: boolean, entity: "template" | "regra") {
    if (available) return true;
    const message =
      diagnostics?.message ??
      `Não é possível salvar ${entity}: o recurso não está disponível neste ambiente.`;
    setError(message);
    setLastMutationMessage(message);
    return false;
  }

  async function createTemplate(input: DocumentTemplateMutationInput) {
    if (!canManage() || !profile?.org_id) return false;
    if (!requireResource(canUseTemplates, "template")) return false;
    setIsSaving(true);
    setError(null);
    setLastMutationMessage(null);
    try {
      const { data: createdTemplate, error: mutationError } = await supabase
        .from("document_creation_templates")
        .insert({
          org_id: profile.org_id,
          created_by: profile.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          doc_type: input.doc_type?.trim().toUpperCase() || null,
          area: input.area?.trim().toUpperCase() || null,
          project_id: input.project_id || null,
          is_active: input.is_active ?? true,
          is_default: input.is_default ?? false,
          priority: input.priority ?? 100,
          template_scope: input.template_scope ?? "organization",
          default_title_pattern: input.default_title_pattern?.trim() || null,
          default_description: input.default_description?.trim() || null,
          default_review_months: input.default_review_months ?? null,
          required_fields: input.required_fields ?? [],
          recommended_fields: input.recommended_fields ?? [],
          default_metadata: input.default_metadata ?? {},
          governance_hints: input.governance_hints ?? {},
          risk_profile: input.risk_profile ?? "medium",
        })
        .select("id")
        .single();
      if (mutationError || !createdTemplate?.id) {
        handleMutationError(
          mutationError ??
            new Error("O insert não retornou o template criado."),
          "Erro ao criar template documental.",
          "template",
        );
        return false;
      }
      await refresh();
      return true;
    } finally {
      setIsSaving(false);
    }
  }

  async function updateTemplate(
    templateId: string,
    input: DocumentTemplateMutationInput,
  ) {
    if (!canManage() || !profile?.org_id) return false;
    if (!requireResource(canUseTemplates, "template")) return false;
    setIsSaving(true);
    setError(null);
    setLastMutationMessage(null);
    try {
      const { data: updatedTemplate, error: mutationError } = await supabase
        .from("document_creation_templates")
        .update({
          name: input.name.trim(),
          description: input.description?.trim() || null,
          doc_type: input.doc_type?.trim().toUpperCase() || null,
          area: input.area?.trim().toUpperCase() || null,
          project_id: input.project_id || null,
          is_active: input.is_active ?? true,
          is_default: input.is_default ?? false,
          priority: input.priority ?? 100,
          template_scope: input.template_scope ?? "organization",
          default_title_pattern: input.default_title_pattern?.trim() || null,
          default_description: input.default_description?.trim() || null,
          default_review_months: input.default_review_months ?? null,
          required_fields: input.required_fields ?? [],
          recommended_fields: input.recommended_fields ?? [],
          default_metadata: input.default_metadata ?? {},
          governance_hints: input.governance_hints ?? {},
          risk_profile: input.risk_profile ?? "medium",
        })
        .eq("id", templateId)
        .eq("org_id", profile.org_id)
        .select("id")
        .maybeSingle();
      if (mutationError || !updatedTemplate?.id) {
        handleMutationError(
          mutationError ??
            new Error(
              "Nenhum template foi atualizado. O registro pode pertencer a outra organização ou estar bloqueado por RLS.",
            ),
          "Erro ao atualizar template documental.",
          "template",
        );
        return false;
      }
      await refresh();
      return true;
    } finally {
      setIsSaving(false);
    }
  }

  async function setTemplateActive(templateId: string, isActive: boolean) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return false;
    return updateTemplate(templateId, { ...template, is_active: isActive });
  }

  async function createRule(input: DocumentRuleMutationInput) {
    if (!canManage() || !profile?.org_id) return false;
    if (!requireResource(canUseRules, "regra")) return false;
    setIsSaving(true);
    setError(null);
    setLastMutationMessage(null);
    try {
      const { data: createdRule, error: mutationError } = await supabase
        .from("document_creation_rules")
        .insert({
          org_id: profile.org_id,
          created_by: profile.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          is_active: input.is_active ?? true,
          priority: input.priority ?? 100,
          condition: normalizeConditionForMutation(input.condition),
          effects: normalizeEffectsForMutation(input.effects),
          severity: input.severity ?? "info",
        })
        .select("id")
        .single();
      if (mutationError || !createdRule?.id) {
        handleMutationError(
          mutationError ?? new Error("O insert não retornou a regra criada."),
          "Erro ao criar regra documental.",
          "regra",
        );
        return false;
      }
      await refresh();
      return true;
    } finally {
      setIsSaving(false);
    }
  }

  async function updateRule(ruleId: string, input: DocumentRuleMutationInput) {
    if (!canManage() || !profile?.org_id) return false;
    if (!requireResource(canUseRules, "regra")) return false;
    setIsSaving(true);
    setError(null);
    setLastMutationMessage(null);
    try {
      const { data: updatedRule, error: mutationError } = await supabase
        .from("document_creation_rules")
        .update({
          name: input.name.trim(),
          description: input.description?.trim() || null,
          is_active: input.is_active ?? true,
          priority: input.priority ?? 100,
          condition: normalizeConditionForMutation(input.condition),
          effects: normalizeEffectsForMutation(input.effects),
          severity: input.severity ?? "info",
        })
        .eq("id", ruleId)
        .eq("org_id", profile.org_id)
        .select("id")
        .maybeSingle();
      if (mutationError || !updatedRule?.id) {
        handleMutationError(
          mutationError ??
            new Error(
              "Nenhuma regra foi atualizada. O registro pode pertencer a outra organização ou estar bloqueado por RLS.",
            ),
          "Erro ao atualizar regra documental.",
          "regra",
        );
        return false;
      }
      await refresh();
      return true;
    } finally {
      setIsSaving(false);
    }
  }

  async function setRuleActive(ruleId: string, isActive: boolean) {
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) return false;
    return updateRule(ruleId, { ...rule, is_active: isActive });
  }

  function clearMutationFeedback() {
    setError(null);
    setLastMutationMessage(null);
  }

  return {
    templates,
    rules,
    projects,
    isLoading,
    isSaving,
    error,
    canUseTemplates,
    canUseRules,
    canUseProjects,
    compatibilityMessage,
    diagnostics,
    lastMutationMessage,
    refresh,
    getBestTemplate,
    evaluate,
    createTemplate,
    updateTemplate,
    setTemplateActive,
    createRule,
    updateRule,
    setRuleActive,
    clearMutationFeedback,
  };
}
