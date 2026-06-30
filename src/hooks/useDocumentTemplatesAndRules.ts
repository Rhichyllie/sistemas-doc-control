import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import { supabase } from "@/lib/supabase";
import {
  evaluateDocumentRules,
  explainAppliedRules,
  isDocumentTemplateSchemaUnavailable,
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

  const refresh = useCallback(async () => {
    if (!enabled || !profile?.org_id) {
      setTemplates([]);
      setRules([]);
      setProjects([]);
      setCanUseTemplates(false);
      setCanUseRules(false);
      setCanUseProjects(false);
      setCompatibilityMessage(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCompatibilityMessage(null);

    try {
      let templateQuery = supabase
        .from("document_creation_templates")
        .select("*")
        .eq("org_id", profile.org_id);
      let ruleQuery = supabase
        .from("document_creation_rules")
        .select("*")
        .eq("org_id", profile.org_id);
      if (!includeInactive) {
        templateQuery = templateQuery.eq("is_active", true);
        ruleQuery = ruleQuery.eq("is_active", true);
      }

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

      if (templateResult.error) {
        if (isDocumentTemplateSchemaUnavailable(templateResult.error)) {
          setTemplates([]);
          setCanUseTemplates(false);
        } else {
          throw templateResult.error;
        }
      } else {
        setTemplates(
          (templateResult.data ?? [])
            .map(normalizeTemplate)
            .filter((template): template is DocumentTemplateRecord =>
              Boolean(template),
            ),
        );
        setCanUseTemplates(true);
      }

      if (ruleResult.error) {
        if (isDocumentTemplateSchemaUnavailable(ruleResult.error)) {
          setRules([]);
          setCanUseRules(false);
        } else {
          throw ruleResult.error;
        }
      } else {
        setRules(
          (ruleResult.data ?? [])
            .map(normalizeRule)
            .filter((rule): rule is DocumentRuleRecord => Boolean(rule)),
        );
        setCanUseRules(true);
      }

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

      if (templateResult.error || ruleResult.error) {
        setCompatibilityMessage(COMPATIBILITY_MESSAGE);
      }
    } catch (err: unknown) {
      setError(
        getErrorMessage(
          err,
          "Não foi possível carregar templates e regras documentais.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [enabled, includeInactive, profile?.org_id]);

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
      return {
        template,
        appliedRules,
        explanations: explainAppliedRules(appliedRules),
      };
    },
    [profile?.org_id, rules, templates],
  );

  function canManage() {
    if (!profile?.org_id) {
      setError("Perfil sem organização disponível para gerenciar regras.");
      return false;
    }
    if (profile.role !== "admin" && profile.role !== "manager") {
      setError(
        "Apenas administradores e gestores podem alterar regras documentais.",
      );
      return false;
    }
    return true;
  }

  function handleMutationError(err: unknown, fallback: string) {
    if (isDocumentTemplateSchemaUnavailable(err)) {
      setCompatibilityMessage(COMPATIBILITY_MESSAGE);
    }
    setError(getErrorMessage(err, fallback));
  }

  async function createTemplate(input: DocumentTemplateMutationInput) {
    if (!canManage() || !profile?.org_id || !canUseTemplates) return false;
    setIsSaving(true);
    setError(null);
    const { error: mutationError } = await supabase
      .from("document_creation_templates")
      .insert({
        org_id: profile.org_id,
        created_by: profile.id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        doc_type: input.doc_type || null,
        area: input.area || null,
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
      });
    setIsSaving(false);
    if (mutationError) {
      handleMutationError(mutationError, "Erro ao criar template documental.");
      return false;
    }
    await refresh();
    return true;
  }

  async function updateTemplate(
    templateId: string,
    input: DocumentTemplateMutationInput,
  ) {
    if (!canManage() || !profile?.org_id || !canUseTemplates) return false;
    setIsSaving(true);
    setError(null);
    const { error: mutationError } = await supabase
      .from("document_creation_templates")
      .update({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        doc_type: input.doc_type || null,
        area: input.area || null,
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
      .eq("org_id", profile.org_id);
    setIsSaving(false);
    if (mutationError) {
      handleMutationError(
        mutationError,
        "Erro ao atualizar template documental.",
      );
      return false;
    }
    await refresh();
    return true;
  }

  async function setTemplateActive(templateId: string, isActive: boolean) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return false;
    return updateTemplate(templateId, { ...template, is_active: isActive });
  }

  async function createRule(input: DocumentRuleMutationInput) {
    if (!canManage() || !profile?.org_id || !canUseRules) return false;
    setIsSaving(true);
    setError(null);
    const { error: mutationError } = await supabase
      .from("document_creation_rules")
      .insert({
        org_id: profile.org_id,
        created_by: profile.id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        is_active: input.is_active ?? true,
        priority: input.priority ?? 100,
        condition: input.condition ?? {},
        effects: input.effects ?? {},
        severity: input.severity ?? "info",
      });
    setIsSaving(false);
    if (mutationError) {
      handleMutationError(mutationError, "Erro ao criar regra documental.");
      return false;
    }
    await refresh();
    return true;
  }

  async function updateRule(ruleId: string, input: DocumentRuleMutationInput) {
    if (!canManage() || !profile?.org_id || !canUseRules) return false;
    setIsSaving(true);
    setError(null);
    const { error: mutationError } = await supabase
      .from("document_creation_rules")
      .update({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        is_active: input.is_active ?? true,
        priority: input.priority ?? 100,
        condition: input.condition ?? {},
        effects: input.effects ?? {},
        severity: input.severity ?? "info",
      })
      .eq("id", ruleId)
      .eq("org_id", profile.org_id);
    setIsSaving(false);
    if (mutationError) {
      handleMutationError(mutationError, "Erro ao atualizar regra documental.");
      return false;
    }
    await refresh();
    return true;
  }

  async function setRuleActive(ruleId: string, isActive: boolean) {
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) return false;
    return updateRule(ruleId, { ...rule, is_active: isActive });
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
    refresh,
    getBestTemplate,
    evaluate,
    createTemplate,
    updateTemplate,
    setTemplateActive,
    createRule,
    updateRule,
    setRuleActive,
  };
}
