import { useState } from "react";
import {
  FileCog,
  FlaskConical,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentPolicySimulator } from "@/components/documents/DocumentPolicySimulator";
import {
  DocumentPolicyWizard,
  type DocumentPolicyWizardSubmission,
} from "@/components/documents/DocumentPolicyWizard";
import { DocumentRuleForm } from "@/components/documents/DocumentRuleForm";
import { DocumentTemplateForm } from "@/components/documents/DocumentTemplateForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDocumentTemplatesAndRules,
  type DocumentRuleMutationInput,
  type DocumentTemplateMutationInput,
} from "@/hooks/useDocumentTemplatesAndRules";
import {
  describeRulePolicy,
  describeTemplatePolicy,
  normalizeRuleEffects,
  type DocumentRuleRecord,
  type DocumentTemplateRecord,
} from "@/lib/documentTemplateRules";
import {
  formatReviewPeriod,
  readStoredReviewPeriod,
} from "@/lib/documentReviewPeriod";

interface TemplateCardProps {
  template: DocumentTemplateRecord;
  isSaving: boolean;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
}

function TemplateCard({
  template,
  isSaving,
  onEdit,
  onToggle,
}: TemplateCardProps) {
  const reviewPeriod = readStoredReviewPeriod(
    template.governance_hints.review_period,
    template.default_review_months,
  );
  return (
    <Card className={template.is_active ? "" : "opacity-65"}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{template.name}</CardTitle>
              <Badge variant="secondary">Sugere</Badge>
            </div>
            <CardDescription className="mt-2">
              {template.description || "Padrão reutilizável de criação."}
            </CardDescription>
          </div>
          <Switch
            checked={template.is_active}
            disabled={isSaving}
            onCheckedChange={onToggle}
            aria-label={`Ativar ${template.name}`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {describeTemplatePolicy(template)}
        </p>
        <div className="flex flex-wrap gap-2">
          {template.default_review_months && (
            <Badge variant="outline">
              Sugere {formatReviewPeriod(reviewPeriod)}
            </Badge>
          )}
          <Badge variant="outline">Risco {template.risk_profile}</Badge>
          {template.is_default && <Badge>Padrão</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Editar template
        </Button>
      </CardContent>
    </Card>
  );
}

interface RuleCardProps {
  rule: DocumentRuleRecord;
  isSaving: boolean;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
}

function RuleCard({ rule, isSaving, onEdit, onToggle }: RuleCardProps) {
  const effects = normalizeRuleEffects(rule.effects);
  const reviewPeriod = readStoredReviewPeriod(
    rule.effects.review_period,
    effects.review_period_months,
  );
  return (
    <Card className={rule.is_active ? "" : "opacity-65"}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{rule.name}</CardTitle>
              <Badge
                variant={
                  effects.required_fields.length ? "destructive" : "secondary"
                }
              >
                {effects.required_fields.length ? "Pode bloquear" : "Orienta"}
              </Badge>
            </div>
            <CardDescription className="mt-2">
              {rule.description || "Regra operacional de governança."}
            </CardDescription>
          </div>
          <Switch
            checked={rule.is_active}
            disabled={isSaving}
            onCheckedChange={onToggle}
            aria-label={`Ativar ${rule.name}`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {describeRulePolicy(rule)}
        </p>
        <div className="flex flex-wrap gap-2">
          {effects.review_period_months && (
            <Badge variant="outline">
              Exige {formatReviewPeriod(reviewPeriod)}
            </Badge>
          )}
          {effects.risk_level && (
            <Badge variant="outline">Risco {effects.risk_level}</Badge>
          )}
          <Badge variant="outline">
            {rule.severity === "critical"
              ? "Crítica"
              : rule.severity === "warning"
                ? "Alerta"
                : "Informativa"}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Editar regra
        </Button>
      </CardContent>
    </Card>
  );
}

export function DocumentRulesAdmin() {
  const governance = useDocumentTemplatesAndRules({ includeInactive: true });
  const [policyWizardOpen, setPolicyWizardOpen] = useState(false);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<DocumentTemplateRecord | null>(null);
  const [editingRule, setEditingRule] = useState<DocumentRuleRecord | null>(
    null,
  );

  const activeTemplates = governance.templates.filter(
    (template) => template.is_active,
  );
  const activeRules = governance.rules.filter((rule) => rule.is_active);

  function openPolicyWizard() {
    governance.clearMutationFeedback();
    setPolicyWizardOpen(true);
  }

  function openNewTemplate() {
    governance.clearMutationFeedback();
    setEditingTemplate(null);
    setTemplateFormOpen(true);
  }

  function openNewRule() {
    governance.clearMutationFeedback();
    setEditingRule(null);
    setRuleFormOpen(true);
  }

  async function saveTemplate(input: DocumentTemplateMutationInput) {
    const success = editingTemplate
      ? await governance.updateTemplate(editingTemplate.id, input)
      : await governance.createTemplate(input);
    if (success) toast.success("Template de criação salvo.");
    return success;
  }

  async function saveRule(input: DocumentRuleMutationInput) {
    const success = editingRule
      ? await governance.updateRule(editingRule.id, input)
      : await governance.createRule(input);
    if (success) toast.success("Regra documental salva.");
    return success;
  }

  async function savePolicy(submission: DocumentPolicyWizardSubmission) {
    let templateCreated = false;
    if (submission.template) {
      templateCreated = await governance.createTemplate(submission.template);
      if (!templateCreated) return false;
    }
    if (submission.rule) {
      const ruleCreated = await governance.createRule(submission.rule);
      if (!ruleCreated) {
        if (templateCreated) {
          toast.warning(
            "O template foi salvo, mas a regra não. Revise a mensagem e complete a política.",
          );
        }
        return false;
      }
    }
    toast.success(
      submission.template && submission.rule
        ? "Política salva como template e regra."
        : submission.rule
          ? "Política obrigatória salva."
          : "Template de criação salvo.",
    );
    return true;
  }

  async function toggleTemplate(
    template: DocumentTemplateRecord,
    active: boolean,
  ) {
    const success = await governance.setTemplateActive(template.id, active);
    if (success)
      toast.success(active ? "Template ativado." : "Template desativado.");
  }

  async function toggleRule(rule: DocumentRuleRecord, active: boolean) {
    const success = await governance.setRuleActive(rule.id, active);
    if (success)
      toast.success(active ? "Regra ativada." : "Regra desativada.");
  }

  function editTemplate(template: DocumentTemplateRecord) {
    governance.clearMutationFeedback();
    setEditingTemplate(template);
    setTemplateFormOpen(true);
  }

  function editRule(rule: DocumentRuleRecord) {
    governance.clearMutationFeedback();
    setEditingRule(rule);
    setRuleFormOpen(true);
  }

  const noActivePolicies =
    activeTemplates.length === 0 && activeRules.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Badge variant="outline" className="mb-3">
            Governança documental
          </Badge>
          <div className="flex items-center gap-3">
            <ScrollText className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">
              Regras Documentais
            </h1>
          </div>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Configure como documentos devem ser criados, revisados e
            bloqueados.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              (!governance.canUseRules && !governance.canUseTemplates) ||
              governance.isLoading
            }
            onClick={openPolicyWizard}
          >
            <Sparkles className="h-4 w-4" />
            Nova política documental
          </Button>
          <Button
            variant="outline"
            disabled={!governance.canUseTemplates || governance.isLoading}
            onClick={openNewTemplate}
          >
            <FileCog className="h-4 w-4" />
            Novo template
          </Button>
          <Button
            variant="ghost"
            disabled={!governance.canUseRules || governance.isLoading}
            onClick={openNewRule}
          >
            <Plus className="h-4 w-4" />
            Nova regra avançada
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={governance.isLoading}
            onClick={() => governance.refresh()}
            aria-label="Atualizar políticas"
          >
            <RefreshCw
              className={`h-4 w-4 ${governance.isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {governance.diagnostics && governance.diagnostics.code !== "ready" && (
        <Alert
          variant={
            governance.diagnostics.status === "critical"
              ? "destructive"
              : "default"
          }
        >
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>{governance.diagnostics.title}</AlertTitle>
          <AlertDescription>{governance.diagnostics.message}</AlertDescription>
        </Alert>
      )}

      {governance.error && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível concluir a operação</AlertTitle>
          <AlertDescription>{governance.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Políticas ativas</p>
            <p className="mt-1 text-3xl font-bold">
              {activeTemplates.length + activeRules.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Orientações</p>
            <p className="mt-1 text-3xl font-bold">
              {activeTemplates.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              Regras de exigência
            </p>
            <p className="mt-1 text-3xl font-bold">{activeRules.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="active">Políticas ativas</TabsTrigger>
          <TabsTrigger value="templates">Templates de criação</TabsTrigger>
          <TabsTrigger value="rules">
            Regras de bloqueio e exigência
          </TabsTrigger>
          <TabsTrigger value="test">
            <FlaskConical className="h-4 w-4" />
            Testar política
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">
              O que afeta a criação agora
            </h2>
            <p className="text-sm text-muted-foreground">
              Templates sugerem valores. Regras podem exigir informações e
              bloquear documentos incompletos.
            </p>
          </div>
          {governance.isLoading && noActivePolicies ? (
            <Card>
              <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando políticas...
              </CardContent>
            </Card>
          ) : noActivePolicies ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">
                  Nenhuma política ativa configurada.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A criação continua usando a inteligência local P-10B.
                </p>
                <Button className="mt-4" onClick={openPolicyWizard}>
                  <Sparkles className="h-4 w-4" />
                  Criar primeira política
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {activeTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSaving={governance.isSaving}
                  onEdit={() => editTemplate(template)}
                  onToggle={(active) => toggleTemplate(template, active)}
                />
              ))}
              {activeRules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  isSaving={governance.isSaving}
                  onEdit={() => editRule(rule)}
                  onToggle={(active) => toggleRule(rule, active)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Templates de criação</h2>
              <p className="text-sm text-muted-foreground">
                Use templates para sugerir valores padrão ao criar documentos.
              </p>
            </div>
            <Button
              disabled={!governance.canUseTemplates}
              onClick={openNewTemplate}
            >
              <Plus className="h-4 w-4" />
              Novo template
            </Button>
          </div>
          {governance.templates.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Nenhum template cadastrado. Sugestões locais continuam ativas.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {governance.templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSaving={governance.isSaving}
                  onEdit={() => editTemplate(template)}
                  onToggle={(active) => toggleTemplate(template, active)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                Regras de bloqueio e exigência
              </h2>
              <p className="text-sm text-muted-foreground">
                Use regras quando algo deve ser obrigatório.
              </p>
            </div>
            <Button disabled={!governance.canUseRules} onClick={openNewRule}>
              <Plus className="h-4 w-4" />
              Nova regra avançada
            </Button>
          </div>
          {governance.rules.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma regra cadastrada. Documentos não recebem bloqueios
                adicionais.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {governance.rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  isSaving={governance.isSaving}
                  onEdit={() => editRule(rule)}
                  onToggle={(active) => toggleRule(rule, active)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="test">
          <DocumentPolicySimulator
            templates={governance.templates}
            rules={governance.rules}
            projects={governance.projects}
          />
        </TabsContent>
      </Tabs>

      <DocumentPolicyWizard
        open={policyWizardOpen}
        onOpenChange={setPolicyWizardOpen}
        projects={governance.projects}
        canUseProjects={governance.canUseProjects}
        canUseTemplates={governance.canUseTemplates}
        canUseRules={governance.canUseRules}
        isSaving={governance.isSaving}
        submissionError={governance.lastMutationMessage ?? governance.error}
        onSubmit={savePolicy}
      />
      <DocumentTemplateForm
        open={templateFormOpen}
        onOpenChange={setTemplateFormOpen}
        template={editingTemplate}
        projects={governance.projects}
        canUseProjects={governance.canUseProjects}
        isSaving={governance.isSaving}
        submissionError={governance.lastMutationMessage ?? governance.error}
        onSubmit={saveTemplate}
      />
      <DocumentRuleForm
        open={ruleFormOpen}
        onOpenChange={setRuleFormOpen}
        rule={editingRule}
        projects={governance.projects}
        canUseProjects={governance.canUseProjects}
        isSaving={governance.isSaving}
        submissionError={governance.lastMutationMessage ?? governance.error}
        onSubmit={saveRule}
      />
    </div>
  );
}
