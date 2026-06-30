import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  FilePlus2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentCreationModeSelector } from "@/components/documents/DocumentCreationModeSelector";
import { DocumentCreationSummary } from "@/components/documents/DocumentCreationSummary";
import { DocumentIntelligencePanel } from "@/components/documents/DocumentIntelligencePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useCreateIntelligentDocument } from "@/hooks/useCreateIntelligentDocument";
import {
  useDocumentCreationIntelligence,
  type IntelligentDocumentFormState,
} from "@/hooks/useDocumentCreationIntelligence";
import {
  suggestNextReviewDate,
  type DocumentCreationMode,
} from "@/lib/documentIntelligence";
import {
  DOCUMENT_FILE_ACCEPT,
  isValidDateInput,
  validateDocumentFile,
} from "@/lib/documentCreationValidation";
import {
  buildDocumentPolicyGuidance,
  type DocumentPolicyAvailability,
} from "@/lib/documentPolicyGuidance";
import type { DocumentRuleField } from "@/lib/documentTemplateRules";
import { cn } from "@/lib/utils";

const GUIDED_STEPS = [
  "Identidade",
  "Classificação",
  "Governança",
  "Arquivo",
  "Revisão final",
];

const INITIAL_FORM: IntelligentDocumentFormState = {
  title: "",
  description: "",
  doc_type: "",
  area: "",
  project_id: "",
  file: null,
  review_period_months: 24,
  next_review_at: suggestNextReviewDate({ review_period_months: 24 }) ?? "",
  revision: 0,
  confidentiality: "",
  external_reference: "",
  source_system: "",
  tags: [],
  metadata: {},
  importJustification: "",
};

export function DocumentCreationStudio() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<DocumentCreationMode>("quick");
  const [guidedStep, setGuidedStep] = useState(0);
  const [suggestionsApplied, setSuggestionsApplied] = useState(false);
  const [form, setForm] = useState<IntelligentDocumentFormState>(INITIAL_FORM);
  const intelligence = useDocumentCreationIntelligence(form, mode);
  const creation = useCreateIntelligentDocument();

  function updateField<K extends keyof IntelligentDocumentFormState>(
    field: K,
    value: IntelligentDocumentFormState[K],
  ) {
    setSuggestionsApplied(false);
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyAllSuggestions() {
    setForm((current) => ({
      ...current,
      ...intelligence.applySuggestion("all"),
    }));
    setSuggestionsApplied(true);
    if (intelligence.selectedTemplate || intelligence.appliedRules.length > 0) {
      const manualItems = policyGuidance.requiredItems.filter(
        (item) =>
          !item.isSatisfied &&
          item.requiredBy.some((source) => source !== "TRAMITA") &&
          (item.field === "file" ||
            item.field === "project_id" ||
            item.field === "confidentiality" ||
            item.field === "external_reference" ||
            (item.field === "description" &&
              !intelligence.selectedTemplate?.default_description)),
      );
      toast.success(
        manualItems.length
          ? `Exigências aplicáveis foram preenchidas. Ainda falta: ${manualItems
              .map((item) => item.label.toLowerCase())
              .join(", ")}.`
          : "Exigências aplicáveis foram preenchidas.",
      );
    } else {
      toast.success("Sugestões aplicadas aos metadados.");
    }
  }

  const creationInput = {
    form,
    mode,
    capabilities: intelligence.capabilities,
    completenessScore: intelligence.completenessScore,
    riskLevel: intelligence.riskLevel,
    availableProjectIds: intelligence.projects.map((project) => project.id),
    governance: {
      templateId: intelligence.selectedTemplate?.id ?? null,
      templateName: intelligence.selectedTemplate?.name ?? null,
      appliedRuleIds: intelligence.appliedRules.map((rule) => rule.id),
      governanceScore: intelligence.governanceScore,
      requiredFieldsMissing: intelligence.requiredFieldsMissing,
      enforcedReviewPeriodMonths: intelligence.enforcedReviewPeriodMonths,
    },
    coding: {
      previewCode: intelligence.codePreview.code,
      patternId: intelligence.codePreview.patternId,
      previewMode: intelligence.codePreview.mode,
    },
  };
  const creationValidationErrors = creation.getValidationErrors(creationInput);
  const governanceDiagnostics = intelligence.governanceDiagnostics;
  let policyAvailability: DocumentPolicyAvailability = "available";
  if (
    governanceDiagnostics?.code === "schema_missing" ||
    governanceDiagnostics?.code === "partial_schema"
  ) {
    policyAvailability = "schema_missing";
  } else if (
    governanceDiagnostics?.code === "permission_denied" ||
    governanceDiagnostics?.code === "load_error"
  ) {
    policyAvailability = "permission_denied";
  } else if (
    governanceDiagnostics?.code === "empty" ||
    (intelligence.governanceApplicationDiagnostics.activeTemplates === 0 &&
      intelligence.governanceApplicationDiagnostics.activeRules === 0)
  ) {
    policyAvailability = "empty";
  } else if (
    !intelligence.selectedTemplate &&
    intelligence.appliedRules.length === 0
  ) {
    policyAvailability = "not_applicable";
  }
  const policyGuidance = buildDocumentPolicyGuidance({
    form,
    template: intelligence.selectedTemplate,
    appliedRules: intelligence.appliedRules,
    checklist: intelligence.requiredFieldChecklist,
    governanceScore: intelligence.governanceScore,
    governanceRiskProfile: intelligence.governanceRiskProfile,
    warnings: intelligence.governanceWarnings,
    validationErrors: creationValidationErrors,
    enforcedReviewPeriodMonths: intelligence.enforcedReviewPeriodMonths,
    availability: policyAvailability,
  });
  const creationDisabledReason = intelligence.isLoadingConfigurations
    ? "Aguarde o carregamento das regras documentais."
    : (policyGuidance.blockingReasons[0] ??
      creationValidationErrors[0] ??
      null);
  const canCreate =
    !intelligence.isLoadingConfigurations &&
    !creation.loading &&
    creationValidationErrors.length === 0;

  function getPolicyRequirement(field: DocumentRuleField) {
    const item = policyGuidance.requiredItems.find(
      (requirement) => requirement.field === field,
    );
    return item?.requiredBy.some((source) => source !== "TRAMITA")
      ? item
      : null;
  }

  function policyFieldClass(field: DocumentRuleField) {
    const requirement = getPolicyRequirement(field);
    return cn(
      "space-y-2",
      requirement &&
        (requirement.isSatisfied
          ? "rounded-lg border border-emerald-200 bg-emerald-50/50 p-3"
          : "rounded-lg border border-amber-300 bg-amber-50/60 p-3"),
    );
  }

  function renderPolicyBadge(field: DocumentRuleField) {
    const requirement = getPolicyRequirement(field);
    if (!requirement) return null;
    return (
      <Badge variant={requirement.isSatisfied ? "secondary" : "outline"}>
        Obrigatório por política
      </Badge>
    );
  }

  function renderPolicyHint(field: DocumentRuleField) {
    const requirement = getPolicyRequirement(field);
    if (!requirement) return null;
    return (
      <div
        className={cn(
          "flex gap-2 text-xs",
          requirement.isSatisfied ? "text-emerald-700" : "text-amber-800",
        )}
      >
        {requirement.isSatisfied ? (
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <span>
          {requirement.reason}{" "}
          {requirement.isSatisfied
            ? "Requisito atendido."
            : requirement.actionLabel}
        </span>
      </div>
    );
  }

  function validateGuidedStep() {
    if (guidedStep === 0 && form.title.trim().length < 3) {
      toast.error("Informe um título com pelo menos 3 caracteres.");
      return false;
    }
    if (guidedStep === 1 && (!form.doc_type || !form.area)) {
      toast.error("Defina tipo documental e área.");
      return false;
    }
    if (
      guidedStep === 2 &&
      (!Number.isInteger(form.review_period_months) ||
        form.review_period_months < 1 ||
        form.review_period_months > 120 ||
        !form.next_review_at ||
        !isValidDateInput(form.next_review_at))
    ) {
      toast.error(
        "Defina um período entre 1 e 120 meses e uma data de revisão válida.",
      );
      return false;
    }
    return true;
  }

  async function handleCreate() {
    if (!canCreate) {
      toast.error(
        creationDisabledReason ??
          creationValidationErrors[0] ??
          "Aguarde o carregamento das configurações.",
      );
      return;
    }

    const result = await creation.createIntelligentDocument(creationInput);
    if (!result) return;

    toast.success(`Documento criado: ${result.code ?? "Gerando código..."}`);
    if (result.warning) toast.warning(result.warning);
    navigate({
      to: "/authenticated/documents/$documentId",
      params: { documentId: result.id },
    });
  }

  function renderIdentity() {
    return (
      <div className="space-y-4">
        <div className={policyFieldClass("title")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="intelligent-title">Título *</Label>
            {renderPolicyBadge("title")}
          </div>
          <Input
            id="intelligent-title"
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="Ex.: Procedimento de Segurança Operacional"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            O título alimenta as sugestões de tipo e área.
          </p>
          {renderPolicyHint("title")}
        </div>
        <div className={policyFieldClass("description")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="intelligent-description">Descrição</Label>
            {renderPolicyBadge("description")}
          </div>
          <Textarea
            id="intelligent-description"
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="Objetivo, aplicação e contexto do documento."
            rows={4}
          />
          {renderPolicyHint("description")}
        </div>
        {intelligence.capabilities.project_id && (
          <div className={policyFieldClass("project_id")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Projeto</Label>
              {renderPolicyBadge("project_id")}
            </div>
            <Select
              value={form.project_id || "none"}
              onValueChange={(value) =>
                updateField("project_id", value === "none" ? "" : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem projeto</SelectItem>
                {intelligence.projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code ? `${project.code} · ` : ""}
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {renderPolicyHint("project_id")}
          </div>
        )}
      </div>
    );
  }

  function renderClassification() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className={policyFieldClass("doc_type")}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label>Tipo documental *</Label>
              {renderPolicyBadge("doc_type")}
            </div>
            {intelligence.inferredType &&
              intelligence.inferredType !== form.doc_type && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      ...intelligence.applySuggestion("type"),
                    }))
                  }
                >
                  Usar {intelligence.inferredType}
                </Button>
              )}
          </div>
          <Select
            value={form.doc_type}
            onValueChange={(value) => updateField("doc_type", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              {intelligence.documentTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {renderPolicyHint("doc_type")}
        </div>
        <div className={policyFieldClass("area")}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label>Área *</Label>
              {renderPolicyBadge("area")}
            </div>
            {intelligence.inferredArea !== form.area && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    ...intelligence.applySuggestion("area"),
                  }))
                }
              >
                Usar {intelligence.inferredArea}
              </Button>
            )}
          </div>
          <Select
            value={form.area}
            onValueChange={(value) => updateField("area", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione a área" />
            </SelectTrigger>
            <SelectContent>
              {intelligence.areas.map((area) => (
                <SelectItem key={area.value} value={area.value}>
                  {area.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {renderPolicyHint("area")}
        </div>

        {intelligence.capabilities.confidentiality && (
          <div
            className={cn(policyFieldClass("confidentiality"), "md:col-span-2")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Confidencialidade</Label>
              {renderPolicyBadge("confidentiality")}
            </div>
            <Select
              value={form.confidentiality || "internal"}
              onValueChange={(value) => updateField("confidentiality", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Público</SelectItem>
                <SelectItem value="internal">Interno</SelectItem>
                <SelectItem value="restricted">Restrito</SelectItem>
                <SelectItem value="confidential">Confidencial</SelectItem>
              </SelectContent>
            </Select>
            {renderPolicyHint("confidentiality")}
          </div>
        )}
      </div>
    );
  }

  function renderGovernance() {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Revisão inicial</Label>
          <Input value={form.revision} readOnly />
          <p className="text-xs text-muted-foreground">
            Documento novo nasce em revisão 0.
          </p>
        </div>
        <div
          className={cn(
            "space-y-2",
            intelligence.enforcedReviewPeriodMonths &&
              (form.review_period_months ===
              intelligence.enforcedReviewPeriodMonths
                ? "rounded-lg border border-emerald-200 bg-emerald-50/50 p-3"
                : "rounded-lg border border-amber-300 bg-amber-50/60 p-3"),
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="review-period">Período de revisão</Label>
            {intelligence.enforcedReviewPeriodMonths && (
              <Badge variant="outline">Obrigatório por política</Badge>
            )}
          </div>
          <div className="relative">
            <Input
              id="review-period"
              type="number"
              min={1}
              max={120}
              value={form.review_period_months}
              onChange={(event) =>
                updateField(
                  "review_period_months",
                  Math.max(1, Number(event.target.value) || 1),
                )
              }
            />
            <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">
              meses
            </span>
          </div>
          {form.review_period_months !==
            intelligence.reviewPeriodSuggestion && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  ...intelligence.applySuggestion("review"),
                }))
              }
            >
              Aplicar {intelligence.reviewPeriodSuggestion} meses
            </Button>
          )}
          {intelligence.enforcedReviewPeriodMonths && (
            <p
              className={cn(
                "text-xs",
                form.review_period_months ===
                  intelligence.enforcedReviewPeriodMonths
                  ? "text-emerald-700"
                  : "text-amber-800",
              )}
            >
              A política exige {intelligence.enforcedReviewPeriodMonths} meses.
              {form.review_period_months ===
              intelligence.enforcedReviewPeriodMonths
                ? " Requisito atendido."
                : " Aplique o prazo obrigatório."}
            </p>
          )}
        </div>
        <div className={policyFieldClass("next_review_at")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="next-review">Próxima revisão</Label>
            {renderPolicyBadge("next_review_at")}
          </div>
          <Input
            id="next-review"
            type="date"
            value={form.next_review_at}
            onChange={(event) =>
              updateField("next_review_at", event.target.value)
            }
          />
          {renderPolicyHint("next_review_at")}
        </div>
      </div>
    );
  }

  function renderFile() {
    return (
      <div className={cn(policyFieldClass("file"), "space-y-3")}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="intelligent-file">Arquivo inicial</Label>
            {renderPolicyBadge("file")}
          </div>
          <Input
            id="intelligent-file"
            type="file"
            accept={DOCUMENT_FILE_ACCEPT}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              const fileError = validateDocumentFile(file);
              if (fileError) {
                event.currentTarget.value = "";
                updateField("file", null);
                toast.error(fileError);
                return;
              }
              updateField("file", file);
            }}
          />
          {renderPolicyHint("file")}
        </div>
        <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
          {form.file ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{form.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(form.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => updateField("file", null)}
              >
                Remover
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Sem arquivo, será criado um cadastro preliminar editável.
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderExpertFields() {
    const hasAdvancedCapability =
      intelligence.capabilities.external_reference ||
      intelligence.capabilities.source_system ||
      intelligence.capabilities.metadata ||
      intelligence.capabilities.tags;

    if (!hasAdvancedCapability) {
      return (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Metadados avançados não estão disponíveis neste schema. Os campos
          compatíveis continuam habilitados.
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {intelligence.capabilities.external_reference && (
          <div className={policyFieldClass("external_reference")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Referência externa</Label>
              {renderPolicyBadge("external_reference")}
            </div>
            <Input
              value={form.external_reference}
              onChange={(event) =>
                updateField("external_reference", event.target.value)
              }
              placeholder="Contrato, norma ou código externo"
            />
            {renderPolicyHint("external_reference")}
          </div>
        )}
        {intelligence.capabilities.source_system && (
          <div className="space-y-2">
            <Label>Sistema de origem</Label>
            <Input
              value={form.source_system}
              onChange={(event) =>
                updateField("source_system", event.target.value)
              }
              placeholder="Ex.: SAP, GED legado"
            />
          </div>
        )}
        {intelligence.capabilities.tags && (
          <div className="space-y-2 md:col-span-2">
            <Label>Tags</Label>
            <Input
              value={form.tags.join(", ")}
              onChange={(event) =>
                updateField(
                  "tags",
                  event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                )
              }
              placeholder="segurança, operação, campo"
            />
          </div>
        )}
        {intelligence.capabilities.metadata && (
          <div className="space-y-2 md:col-span-2">
            <Label>Observações de governança</Label>
            <Textarea
              value={String(form.metadata.governance_notes ?? "")}
              onChange={(event) =>
                updateField("metadata", {
                  ...form.metadata,
                  governance_notes: event.target.value,
                })
              }
              placeholder="Contexto complementar para governança e auditoria."
            />
          </div>
        )}
      </div>
    );
  }

  function renderQuickMode() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Criação rápida</CardTitle>
          <CardDescription>
            Preencha o essencial e deixe o TRAMITA sugerir classificação e
            revisão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderIdentity()}
          {renderClassification()}
          {renderFile()}
        </CardContent>
      </Card>
    );
  }

  function renderGuidedMode() {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            {GUIDED_STEPS.map((step, index) => (
              <button
                key={step}
                type="button"
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                  index === guidedStep
                    ? "border-primary bg-primary text-primary-foreground"
                    : index < guidedStep
                      ? "border-primary/30 bg-primary/5 text-primary"
                      : "text-muted-foreground",
                )}
                onClick={() => {
                  if (index <= guidedStep) setGuidedStep(index);
                }}
              >
                {index < guidedStep ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span>{index + 1}</span>
                )}
                {step}
              </button>
            ))}
          </div>
          <CardTitle className="pt-3">{GUIDED_STEPS[guidedStep]}</CardTitle>
          <CardDescription>
            Etapa {guidedStep + 1} de {GUIDED_STEPS.length}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {guidedStep === 0 && renderIdentity()}
          {guidedStep === 1 && renderClassification()}
          {guidedStep === 2 && renderGovernance()}
          {guidedStep === 3 && renderFile()}
          {guidedStep === 4 && (
            <DocumentCreationSummary
              form={form}
              documentTypes={intelligence.documentTypes}
              projects={intelligence.projects}
              completenessScore={intelligence.completenessScore}
              riskLevel={intelligence.riskLevel}
              templateName={intelligence.selectedTemplate?.name ?? null}
              governanceScore={intelligence.governanceScore}
              appliedRulesCount={intelligence.appliedRules.length}
              policyGuidance={policyGuidance}
              codePreview={intelligence.codePreview}
              codePreviewLoading={intelligence.codePreviewLoading}
              codeCompatibilityMessage={intelligence.codeCompatibilityMessage}
            />
          )}

          <div className="flex justify-between border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={guidedStep === 0}
              onClick={() => setGuidedStep((step) => Math.max(0, step - 1))}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            {guidedStep < GUIDED_STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={() => {
                  if (validateGuidedStep()) {
                    setGuidedStep((step) =>
                      Math.min(GUIDED_STEPS.length - 1, step + 1),
                    );
                  }
                }}
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!canCreate}
                onClick={handleCreate}
              >
                {creation.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FilePlus2 className="h-4 w-4" />
                )}
                Criar documento
              </Button>
            )}
          </div>
          {guidedStep === GUIDED_STEPS.length - 1 && creationDisabledReason && (
            <p className="text-xs text-muted-foreground">
              Para criar: {creationDisabledReason}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderExpertMode() {
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Identidade e classificação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {renderIdentity()}
            {renderClassification()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Governança</CardTitle>
            <CardDescription>
              Controle de revisão e metadados suportados pelo ambiente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {renderGovernance()}
            {renderExpertFields()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Arquivo</CardTitle>
          </CardHeader>
          <CardContent>{renderFile()}</CardContent>
        </Card>
        <DocumentCreationSummary
          form={form}
          documentTypes={intelligence.documentTypes}
          projects={intelligence.projects}
          completenessScore={intelligence.completenessScore}
          riskLevel={intelligence.riskLevel}
          templateName={intelligence.selectedTemplate?.name ?? null}
          governanceScore={intelligence.governanceScore}
          appliedRulesCount={intelligence.appliedRules.length}
          policyGuidance={policyGuidance}
          codePreview={intelligence.codePreview}
          codePreviewLoading={intelligence.codePreviewLoading}
          codeCompatibilityMessage={intelligence.codeCompatibilityMessage}
        />
      </div>
    );
  }

  const showGlobalCreate = mode !== "guided";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link to="/authenticated/documents">
              <ArrowLeft className="h-4 w-4" />
              Voltar para Documentos
            </Link>
          </Button>
          <Badge variant="outline" className="mb-3">
            Assistente documental
          </Badge>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <Sparkles className="h-7 w-7 text-primary" />
            Novo Documento Inteligente
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Crie um rascunho com classificação assistida, governança de revisão
            e alertas de qualidade antes do primeiro workflow.
          </p>
        </div>
        {intelligence.isLoadingConfigurations && (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Carregando configurações
          </Badge>
        )}
      </div>

      <DocumentCreationModeSelector
        value={mode}
        disabled={creation.loading}
        onChange={(nextMode) => {
          setMode(nextMode);
          setGuidedStep(0);
          setSuggestionsApplied(false);
        }}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-5">
          {mode === "quick" && renderQuickMode()}
          {mode === "guided" && renderGuidedMode()}
          {mode === "expert" && renderExpertMode()}

          {creation.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {creation.error}
            </div>
          )}

          {showGlobalCreate && (
            <>
              <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-medium">{policyGuidance.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {policyGuidance.summary}
                  </p>
                  {policyGuidance.blockingReasons.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-destructive">
                      {policyGuidance.blockingReasons
                        .slice(0, 3)
                        .map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                    </ul>
                  )}
                </div>
                <Button size="lg" disabled={!canCreate} onClick={handleCreate}>
                  {creation.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FilePlus2 className="h-4 w-4" />
                  )}
                  Criar documento
                </Button>
              </div>
              {creationDisabledReason && (
                <p className="mt-2 text-xs text-muted-foreground sm:text-right">
                  Para criar: {creationDisabledReason}
                </p>
              )}
            </>
          )}
        </div>

        <DocumentIntelligencePanel
          completenessScore={intelligence.completenessScore}
          riskLevel={intelligence.riskLevel}
          inferredType={intelligence.inferredType}
          inferredArea={intelligence.inferredArea}
          reviewPeriodSuggestion={intelligence.reviewPeriodSuggestion}
          nextReviewSuggestion={intelligence.nextReviewSuggestion}
          recommendations={intelligence.recommendations}
          warnings={intelligence.warnings}
          missingItems={intelligence.missingItems}
          configurationMessage={intelligence.configurationMessage}
          governanceScore={intelligence.governanceScore}
          governanceRiskProfile={intelligence.governanceRiskProfile}
          policyGuidance={policyGuidance}
          codePreview={intelligence.codePreview}
          codePreviewLoading={intelligence.codePreviewLoading}
          codeCompatibilityMessage={intelligence.codeCompatibilityMessage}
          suggestionsApplied={suggestionsApplied}
          suggestionsDisabled={
            intelligence.isLoadingConfigurations || creation.loading
          }
          onApplySuggestions={applyAllSuggestions}
        />
      </div>
    </div>
  );
}
