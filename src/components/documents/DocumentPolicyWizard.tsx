import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DocumentReviewPeriodInput } from "@/components/documents/DocumentReviewPeriodInput";
import type {
  DocumentRuleMutationInput,
  DocumentRulesProject,
  DocumentTemplateMutationInput,
} from "@/hooks/useDocumentTemplatesAndRules";
import { DOC_TYPES } from "@/lib/constants";
import {
  DOCUMENT_RULE_FIELD_LABELS,
  type DocumentRuleField,
  type GovernanceRiskProfile,
} from "@/lib/documentTemplateRules";
import {
  formatReviewPeriod,
  reviewPeriodToMonths,
  type DocumentReviewPeriod,
  validateReviewPeriod,
} from "@/lib/documentReviewPeriod";

const STEPS = [
  "Objetivo",
  "Aplicação",
  "Requisitos",
  "Revisão",
  "Impacto",
  "Salvar",
];

const OBJECTIVES = [
  {
    value: "required",
    label: "Exigir informações obrigatórias",
    description: "Bloqueia a criação enquanto faltarem campos definidos.",
  },
  {
    value: "template",
    label: "Sugerir um template de criação",
    description: "Preenche padrões e orienta sem bloquear.",
  },
  {
    value: "review",
    label: "Definir prazo de revisão",
    description: "Sugere ou exige quando o documento deve ser revisto.",
  },
  {
    value: "block",
    label: "Bloquear criação incompleta",
    description: "Impede salvar enquanto os requisitos críticos não forem atendidos.",
  },
  {
    value: "risk",
    label: "Aumentar risco documental",
    description: "Eleva o nível de atenção para contextos sensíveis.",
  },
  {
    value: "recommendation",
    label: "Recomendar cuidados ao usuário",
    description: "Mostra orientações durante a criação.",
  },
  {
    value: "advanced",
    label: "Política avançada",
    description: "Combina exigências, revisão, risco e recomendações.",
  },
] as const;

type PolicyObjective = (typeof OBJECTIVES)[number]["value"];
type PolicyScope =
  | "all"
  | "type"
  | "area"
  | "project"
  | "type_area"
  | "keyword";
type PolicySaveMode = "template" | "rule" | "both";
type PolicyReviewMode =
  | "local"
  | "suggest"
  | "enforce"
  | "require_date"
  | "none";

const AREAS = [
  { value: "SGI", label: "Sistema de Gestão Integrada" },
  { value: "ENG", label: "Engenharia" },
  { value: "OPS", label: "Operações" },
  { value: "MNT", label: "Manutenção" },
  { value: "SST", label: "Saúde e Segurança" },
  { value: "MA", label: "Meio Ambiente" },
  { value: "QUA", label: "Qualidade" },
  { value: "ADM", label: "Administrativo" },
];

const POLICY_FIELDS: DocumentRuleField[] = [
  "description",
  "file",
  "project_id",
  "next_review_at",
  "confidentiality",
  "external_reference",
];

export interface DocumentPolicyWizardSubmission {
  template?: DocumentTemplateMutationInput;
  rule?: DocumentRuleMutationInput;
}

interface DocumentPolicyWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: DocumentRulesProject[];
  canUseProjects: boolean;
  canUseTemplates: boolean;
  canUseRules: boolean;
  isSaving: boolean;
  submissionError: string | null;
  onSubmit: (submission: DocumentPolicyWizardSubmission) => Promise<boolean>;
}

function defaultSaveMode(objective: PolicyObjective): PolicySaveMode {
  return objective === "template" ||
    objective === "recommendation" ||
    objective === "review"
    ? "template"
    : "rule";
}

export function DocumentPolicyWizard({
  open,
  onOpenChange,
  projects,
  canUseProjects,
  canUseTemplates,
  canUseRules,
  isSaving,
  submissionError,
  onSubmit,
}: DocumentPolicyWizardProps) {
  const [step, setStep] = useState(0);
  const [objective, setObjective] = useState<PolicyObjective>("required");
  const [scope, setScope] = useState<PolicyScope>("all");
  const [docType, setDocType] = useState("");
  const [area, setArea] = useState("");
  const [projectId, setProjectId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [keywordTarget, setKeywordTarget] = useState<
    "title_contains" | "description_contains"
  >("title_contains");
  const [requiredFields, setRequiredFields] = useState<DocumentRuleField[]>([]);
  const [reviewMode, setReviewMode] =
    useState<PolicyReviewMode>("local");
  const [reviewPeriod, setReviewPeriod] = useState<DocumentReviewPeriod>({
    value: 12,
    unit: "months",
  });
  const [risk, setRisk] = useState<GovernanceRiskProfile>("medium");
  const [recommendation, setRecommendation] = useState("");
  const [defaultDescription, setDefaultDescription] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saveMode, setSaveMode] = useState<PolicySaveMode>("rule");
  const [formError, setFormError] = useState<string | null>(null);

  const contextText = useMemo(() => {
    if (scope === "type")
      return `documentos do tipo ${DOC_TYPES.find((item) => item.value === docType)?.label ?? "selecionado"}`;
    if (scope === "area")
      return `documentos da área ${AREAS.find((item) => item.value === area)?.label ?? "selecionada"}`;
    if (scope === "project")
      return `documentos do projeto ${projects.find((item) => item.id === projectId)?.name ?? "selecionado"}`;
    if (scope === "type_area")
      return `documentos do tipo ${DOC_TYPES.find((item) => item.value === docType)?.label ?? "selecionado"} na área ${AREAS.find((item) => item.value === area)?.label ?? "selecionada"}`;
    if (scope === "keyword")
      return `documentos ${
        keywordTarget === "title_contains"
          ? "cujo título"
          : "cuja descrição"
      } contenha “${keyword || "palavra-chave"}”`;
    return "todos os documentos";
  }, [area, docType, keyword, keywordTarget, projectId, projects, scope]);

  const impactText = useMemo(() => {
    const impacts: string[] = [];
    if (requiredFields.length) {
      impacts.push(
        `${saveMode === "template" ? "sugerir o preenchimento de" : "exigir"} ${requiredFields
          .map((field) => DOCUMENT_RULE_FIELD_LABELS[field].toLowerCase())
          .join(", ")}`,
      );
    }
    if (reviewMode === "suggest")
      impacts.push(`sugerir revisão em ${formatReviewPeriod(reviewPeriod)}`);
    if (reviewMode === "enforce")
      impacts.push(`exigir revisão em ${formatReviewPeriod(reviewPeriod)}`);
    if (reviewMode === "require_date")
      impacts.push("exigir uma data específica de próxima revisão");
    if (risk !== "medium") impacts.push(`elevar o risco para ${risk}`);
    if (recommendation.trim()) impacts.push("mostrar uma recomendação");
    if (!impacts.length) impacts.push("usar as sugestões locais do TRAMITA");
    return `Para ${contextText}, ${impacts.join(", ")}.`;
  }, [
    contextText,
    recommendation,
    requiredFields,
    reviewMode,
    reviewPeriod,
    risk,
    saveMode,
  ]);

  function resetWizard() {
    setStep(0);
    setObjective("required");
    setScope("all");
    setDocType("");
    setArea("");
    setProjectId("");
    setKeyword("");
    setKeywordTarget("title_contains");
    setRequiredFields([]);
    setReviewMode("local");
    setReviewPeriod({ value: 12, unit: "months" });
    setRisk("medium");
    setRecommendation("");
    setDefaultDescription("");
    setName("");
    setDescription("");
    setSaveMode("rule");
    setFormError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetWizard();
    onOpenChange(nextOpen);
  }

  function chooseObjective(nextObjective: PolicyObjective) {
    setObjective(nextObjective);
    setSaveMode(defaultSaveMode(nextObjective));
    if (nextObjective === "required") setRequiredFields(["description"]);
    if (nextObjective === "block")
      setRequiredFields(["description", "file"]);
    if (nextObjective === "review") setReviewMode("suggest");
    if (nextObjective === "risk") setRisk("high");
  }

  function toggleField(field: DocumentRuleField, checked: boolean) {
    setRequiredFields((current) =>
      checked
        ? [...new Set([...current, field])]
        : current.filter((item) => item !== field),
    );
  }

  function validateCurrentStep() {
    if (
      step === 1 &&
      ((scope === "type" && !docType) ||
        (scope === "area" && !area) ||
        (scope === "project" && !projectId) ||
        (scope === "type_area" && (!docType || !area)) ||
        (scope === "keyword" && keyword.trim().length < 2))
    ) {
      setFormError("Complete o contexto onde a política será aplicada.");
      return false;
    }
    if (
      step === 3 &&
      (reviewMode === "suggest" || reviewMode === "enforce")
    ) {
      const reviewError = validateReviewPeriod(reviewPeriod);
      if (reviewError) {
        setFormError(reviewError);
        return false;
      }
    }
    setFormError(null);
    return true;
  }

  async function handleSave() {
    if (name.trim().length < 3) {
      setFormError("Dê um nome claro para identificar esta política.");
      return;
    }
    if (
      (saveMode === "template" || saveMode === "both") &&
      !canUseTemplates
    ) {
      setFormError("Templates não estão disponíveis neste ambiente.");
      return;
    }
    if ((saveMode === "rule" || saveMode === "both") && !canUseRules) {
      setFormError("Regras não estão disponíveis neste ambiente.");
      return;
    }
    if (scope === "keyword" && saveMode !== "rule") {
      setFormError(
        "Políticas por palavra-chave precisam ser salvas como regra.",
      );
      return;
    }
    if (reviewMode === "suggest" && saveMode === "rule") {
      setFormError(
        "Prazo sugerido deve ser salvo como template. Use regra somente quando o prazo for obrigatório.",
      );
      return;
    }
    if (
      (reviewMode === "enforce" || reviewMode === "require_date") &&
      saveMode === "template"
    ) {
      setFormError(
        "Revisão obrigatória precisa ser salva como regra ou como template e regra.",
      );
      return;
    }

    const reviewMonths =
      reviewMode === "suggest" || reviewMode === "enforce"
        ? reviewPeriodToMonths(reviewPeriod)
        : null;
    const condition: Record<string, unknown> = {};
    if (scope === "type" || scope === "type_area") condition.doc_type = docType;
    if (scope === "area" || scope === "type_area") condition.area = area;
    if (scope === "project") condition.project_id = projectId;
    if (scope === "keyword") condition[keywordTarget] = keyword.trim();

    const shouldCreateTemplate = saveMode === "template" || saveMode === "both";
    const shouldCreateRule = saveMode === "rule" || saveMode === "both";
    const submission: DocumentPolicyWizardSubmission = {};

    if (shouldCreateTemplate) {
      submission.template = {
        name: name.trim(),
        description: description.trim() || impactText,
        doc_type:
          scope === "type" || scope === "type_area" ? docType : null,
        area: scope === "area" || scope === "type_area" ? area : null,
        project_id: scope === "project" ? projectId : null,
        template_scope:
          scope === "project"
            ? "project"
            : scope === "area" || scope === "type_area"
              ? "area"
              : scope === "type"
                ? "type"
                : "organization",
        default_description: defaultDescription.trim() || null,
        default_review_months:
          reviewMode === "suggest" ? reviewMonths : null,
        required_fields: [],
        recommended_fields: requiredFields,
        risk_profile: risk,
        priority: 100,
        is_active: true,
        is_default: false,
        governance_hints: {
          policy_objective: objective,
          review_period:
            reviewMode === "suggest" ? reviewPeriod : undefined,
          review_behavior: reviewMode,
          recommendations: recommendation.trim()
            ? [recommendation.trim()]
            : [],
        },
      };
    }

    if (shouldCreateRule) {
      const ruleRequiredFields = [...requiredFields];
      if (
        reviewMode === "require_date" &&
        !ruleRequiredFields.includes("next_review_at")
      ) {
        ruleRequiredFields.push("next_review_at");
      }
      submission.rule = {
        name: name.trim(),
        description: description.trim() || impactText,
        priority: 100,
        severity:
          ruleRequiredFields.length || reviewMode === "enforce"
            ? "critical"
            : "warning",
        condition,
        effects: {
          policy_objective: objective,
          required_fields: ruleRequiredFields,
          review_period_months:
            reviewMode === "enforce" ? reviewMonths : undefined,
          review_period:
            reviewMode === "enforce" ? reviewPeriod : undefined,
          review_enforcement: reviewMode,
          risk_level: risk,
          recommendations: recommendation.trim()
            ? [recommendation.trim()]
            : [],
        },
        is_active: true,
      };
    }

    setFormError(null);
    const success = await onSubmit(submission);
    if (success) handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Nova política documental
          </DialogTitle>
          <DialogDescription>
            Responda em linguagem operacional. O TRAMITA gera o template ou a
            regra no formato atual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 border-b pb-4">
          {STEPS.map((item, index) => (
            <Badge
              key={item}
              variant={index === step ? "default" : "outline"}
            >
              {index + 1}. {item}
            </Badge>
          ))}
        </div>

        <div className="min-h-80 py-4">
          {step === 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <h3 className="text-lg font-semibold">
                  O que você quer controlar?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Escolha a intenção; detalhes técnicos ficam ocultos.
                </p>
              </div>
              {OBJECTIVES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`rounded-xl border p-4 text-left transition ${
                    objective === item.value
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/40"
                  }`}
                  onClick={() => chooseObjective(item.value)}
                >
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold">Onde se aplica?</h3>
                <p className="text-sm text-muted-foreground">
                  Exemplo: um certificado técnico, um contrato ou todos os
                  documentos de um projeto.
                </p>
              </div>
              <Select
                value={scope}
                onValueChange={(value) => setScope(value as PolicyScope)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os documentos</SelectItem>
                  <SelectItem value="type">
                    Tipo documental específico
                  </SelectItem>
                  <SelectItem value="area">Área específica</SelectItem>
                  <SelectItem value="type_area">
                    Combinação de tipo e área
                  </SelectItem>
                  {canUseProjects && (
                    <SelectItem value="project">
                      Projeto específico
                    </SelectItem>
                  )}
                  <SelectItem value="keyword">
                    Palavra-chave no título
                  </SelectItem>
                </SelectContent>
              </Select>
              {(scope === "type" || scope === "type_area") && (
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o tipo documental" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(scope === "area" || scope === "type_area") && (
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a área" />
                  </SelectTrigger>
                  <SelectContent>
                    {AREAS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {scope === "project" && (
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {scope === "keyword" && (
                <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                  <div className="space-y-2">
                    <Label>Pesquisar em</Label>
                    <Select
                      value={keywordTarget}
                      onValueChange={(value) =>
                        setKeywordTarget(
                          value as
                            | "title_contains"
                            | "description_contains",
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="title_contains">Título</SelectItem>
                        <SelectItem value="description_contains">
                          Descrição
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="policy-keyword">
                      Palavra ou expressão
                    </Label>
                  <Input
                    id="policy-keyword"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="Ex.: Certificado"
                  />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold">
                  O que o documento precisa ter?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Em template, estes itens são sugeridos. Em regra, tornam-se
                  obrigatórios.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {POLICY_FIELDS.map((field) => (
                  <label
                    key={field}
                    className="flex items-center gap-3 rounded-lg border p-3 text-sm"
                  >
                    <Checkbox
                      checked={requiredFields.includes(field)}
                      onCheckedChange={(checked) =>
                        toggleField(field, checked === true)
                      }
                    />
                    {DOCUMENT_RULE_FIELD_LABELS[field]}
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="policy-default-description">
                  Estrutura sugerida para a descrição
                </Label>
                <Textarea
                  id="policy-default-description"
                  value={defaultDescription}
                  onChange={(event) =>
                    setDefaultDescription(event.target.value)
                  }
                  placeholder="Ex.: Objetivo, escopo, responsáveis e evidências."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policy-recommendation">
                  Recomendação mostrada ao usuário
                </Label>
                <Textarea
                  id="policy-recommendation"
                  value={recommendation}
                  onChange={(event) => setRecommendation(event.target.value)}
                  placeholder="Ex.: Confira a validade do certificado antes de enviar para aprovação."
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold">
                  Como tratar a revisão?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Presets são atalhos. Você pode informar dias, meses ou anos.
                </p>
              </div>
              <Select
                value={reviewMode}
                onValueChange={(value) =>
                  setReviewMode(value as PolicyReviewMode)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">
                    Usar sugestão inteligente local
                  </SelectItem>
                  <SelectItem value="suggest">
                    Sugerir um período, sem bloquear
                  </SelectItem>
                  <SelectItem value="enforce">
                    Exigir um período e bloquear divergência
                  </SelectItem>
                  <SelectItem value="require_date">
                    Exigir que o usuário informe uma data específica
                  </SelectItem>
                  <SelectItem value="none">Sem revisão programada</SelectItem>
                </SelectContent>
              </Select>
              {(reviewMode === "suggest" || reviewMode === "enforce") && (
                <DocumentReviewPeriodInput
                  id="policy-review-period"
                  label={
                    reviewMode === "enforce"
                      ? "Período obrigatório"
                      : "Período sugerido"
                  }
                  value={reviewPeriod}
                  onChange={setReviewPeriod}
                  requiredByPolicy={reviewMode === "enforce"}
                />
              )}
              <div className="space-y-2">
                <Label>Nível de atenção documental</Label>
                <Select
                  value={risk}
                  onValueChange={(value) =>
                    setRisk(value as GovernanceRiskProfile)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixo</SelectItem>
                    <SelectItem value="medium">Médio</SelectItem>
                    <SelectItem value="high">Alto</SelectItem>
                    <SelectItem value="critical">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                Impacto antes de salvar
              </h3>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                <p className="font-medium">{impactText}</p>
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <p>
                    {requiredFields.length
                      ? "Campos humanos, como arquivo e descrição, não serão preenchidos automaticamente."
                      : "Nenhum novo campo obrigatório foi selecionado."}
                  </p>
                  <p>
                    {reviewMode === "suggest"
                      ? "A revisão será sugerida e poderá ser alterada."
                      : reviewMode === "enforce"
                        ? "A revisão será exigida e a divergência bloqueará a criação."
                        : "A inteligência local continuará orientando a revisão."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold">
                  Como identificar e salvar?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Template sugere padrões. Regra exige ou bloqueia.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="policy-name">Nome da política *</Label>
                <Input
                  id="policy-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Certificados técnicos exigem arquivo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policy-description">Descrição interna</Label>
                <Textarea
                  id="policy-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={impactText}
                />
              </div>
              <Select
                value={saveMode}
                onValueChange={(value) =>
                  setSaveMode(value as PolicySaveMode)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="template"
                    disabled={
                      !canUseTemplates ||
                      scope === "keyword" ||
                      reviewMode === "enforce" ||
                      reviewMode === "require_date"
                    }
                  >
                    Salvar como template — sugere
                  </SelectItem>
                  <SelectItem value="rule" disabled={!canUseRules}>
                    Salvar como regra — exige/bloqueia
                  </SelectItem>
                  <SelectItem
                    value="both"
                    disabled={
                      !canUseTemplates || !canUseRules || scope === "keyword"
                    }
                  >
                    Salvar template e regra
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>{impactText}</p>
              </div>
            </div>
          )}

          {formError && (
            <p className="mt-4 text-sm text-destructive">{formError}</p>
          )}
          {!formError && submissionError && (
            <p className="mt-4 text-sm text-destructive">{submissionError}</p>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || isSaving}
            onClick={() => {
              setFormError(null);
              setStep((current) => Math.max(0, current - 1));
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={() => {
                if (validateCurrentStep()) setStep((current) => current + 1);
              }}
            >
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" disabled={isSaving} onClick={handleSave}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar política
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
