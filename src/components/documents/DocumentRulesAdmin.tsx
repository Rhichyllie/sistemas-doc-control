import { useState } from "react";
import {
  FileCog,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentRuleForm } from "@/components/documents/DocumentRuleForm";
import { DocumentPolicySimulator } from "@/components/documents/DocumentPolicySimulator";
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
  DOCUMENT_RULE_FIELD_LABELS,
  normalizeRuleEffects,
  type DocumentRuleRecord,
  type DocumentTemplateRecord,
} from "@/lib/documentTemplateRules";

function templateContext(template: DocumentTemplateRecord) {
  return [
    template.doc_type ? `Tipo ${template.doc_type}` : null,
    template.area ? `Área ${template.area}` : null,
    template.project_id ? "Projeto específico" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function ruleCondition(rule: DocumentRuleRecord) {
  return [
    rule.condition.doc_type ? `Tipo ${String(rule.condition.doc_type)}` : null,
    rule.condition.area ? `Área ${String(rule.condition.area)}` : null,
    rule.condition.project_id ? "Projeto específico" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function DocumentRulesAdmin() {
  const governance = useDocumentTemplatesAndRules({
    includeInactive: true,
  });
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<DocumentTemplateRecord | null>(null);
  const [editingRule, setEditingRule] = useState<DocumentRuleRecord | null>(
    null,
  );

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
    if (success) toast.success("Template documental salvo.");
    return success;
  }

  async function saveRule(input: DocumentRuleMutationInput) {
    const success = editingRule
      ? await governance.updateRule(editingRule.id, input)
      : await governance.createRule(input);
    if (success) toast.success("Regra documental salva.");
    return success;
  }

  async function toggleTemplate(
    template: DocumentTemplateRecord,
    active: boolean,
  ) {
    const success = await governance.setTemplateActive(template.id, active);
    if (success) {
      toast.success(active ? "Template ativado." : "Template desativado.");
    }
  }

  async function toggleRule(rule: DocumentRuleRecord, active: boolean) {
    const success = await governance.setRuleActive(rule.id, active);
    if (success) {
      toast.success(active ? "Regra ativada." : "Regra desativada.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
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
            Configure templates, requisitos mínimos, risco e ciclos de revisão
            por contexto.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={governance.isLoading}
          onClick={() => governance.refresh()}
        >
          <RefreshCw
            className={`h-4 w-4 ${governance.isLoading ? "animate-spin" : ""}`}
          />
          Atualizar
        </Button>
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
          <AlertDescription className="space-y-2">
            <p>{governance.diagnostics.message}</p>
            {governance.diagnostics.recommendations.length > 0 && (
              <ul className="list-disc space-y-1 pl-4">
                {governance.diagnostics.recommendations.map(
                  (recommendation) => (
                    <li key={recommendation}>{recommendation}</li>
                  ),
                )}
              </ul>
            )}
          </AlertDescription>
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
            <p className="text-sm text-muted-foreground">Templates ativos</p>
            <p className="mt-1 text-3xl font-bold">
              {
                governance.templates.filter((template) => template.is_active)
                  .length
              }
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Regras ativas</p>
            <p className="mt-1 text-3xl font-bold">
              {governance.rules.filter((rule) => rule.is_active).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Disponibilidade</p>
            <p className="mt-2 text-sm font-medium">
              {governance.canUseTemplates && governance.canUseRules
                ? "Governança configurável ativa"
                : "Fallback P-10B ativo"}
            </p>
          </CardContent>
        </Card>
      </div>

      <DocumentPolicySimulator
        templates={governance.templates}
        rules={governance.rules}
        projects={governance.projects}
      />

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">
            Templates ({governance.templates.length})
          </TabsTrigger>
          <TabsTrigger value="rules">
            Regras ({governance.rules.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Templates de criação</h2>
              <p className="text-sm text-muted-foreground">
                Padrões sugeridos por tipo, área, projeto ou organização.
              </p>
            </div>
            <Button
              disabled={!governance.canUseTemplates || governance.isLoading}
              onClick={openNewTemplate}
            >
              <Plus className="h-4 w-4" />
              Novo template
            </Button>
          </div>

          {governance.isLoading && !governance.templates.length ? (
            <Card>
              <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando templates...
              </CardContent>
            </Card>
          ) : governance.templates.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileCog className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">
                  Nenhum template documental configurado.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A criação continuará usando as sugestões locais da P-10B.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {governance.templates.map((template) => (
                <Card
                  key={template.id}
                  className={template.is_active ? "" : "opacity-65"}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">
                          {template.name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {template.description || "Sem descrição."}
                        </CardDescription>
                      </div>
                      <Switch
                        checked={template.is_active}
                        disabled={governance.isSaving}
                        onCheckedChange={(checked) =>
                          toggleTemplate(template, checked)
                        }
                        aria-label={`Ativar ${template.name}`}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        Prioridade {template.priority}
                      </Badge>
                      <Badge variant="secondary">{template.risk_profile}</Badge>
                      {template.is_default && <Badge>Padrão</Badge>}
                      {template.default_review_months && (
                        <Badge variant="outline">
                          {template.default_review_months} meses
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {templateContext(template) || "Toda a organização"}
                    </p>
                    {template.required_fields.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Exige:{" "}
                        {template.required_fields
                          .map((field) => DOCUMENT_RULE_FIELD_LABELS[field])
                          .join(", ")}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        governance.clearMutationFeedback();
                        setEditingTemplate(template);
                        setTemplateFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Políticas obrigatórias</h2>
              <p className="text-sm text-muted-foreground">
                Condições simples com efeitos aplicados por prioridade.
              </p>
            </div>
            <Button
              disabled={!governance.canUseRules || governance.isLoading}
              onClick={openNewRule}
            >
              <Plus className="h-4 w-4" />
              Nova regra
            </Button>
          </div>

          {governance.isLoading && !governance.rules.length ? (
            <Card>
              <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando regras...
              </CardContent>
            </Card>
          ) : governance.rules.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">
                  Nenhuma regra documental configurada.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crie regras quando precisar tornar uma orientação obrigatória.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {governance.rules.map((rule) => {
                const effects = normalizeRuleEffects(rule.effects);
                return (
                  <Card
                    key={rule.id}
                    className={rule.is_active ? "" : "opacity-65"}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">{rule.name}</CardTitle>
                          <CardDescription className="mt-1">
                            {rule.description || "Sem descrição."}
                          </CardDescription>
                        </div>
                        <Switch
                          checked={rule.is_active}
                          disabled={governance.isSaving}
                          onCheckedChange={(checked) =>
                            toggleRule(rule, checked)
                          }
                          aria-label={`Ativar ${rule.name}`}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          Prioridade {rule.priority}
                        </Badge>
                        <Badge
                          variant={
                            rule.severity === "critical"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {rule.severity}
                        </Badge>
                        {effects.review_period_months && (
                          <Badge variant="outline">
                            {effects.review_period_months} meses
                          </Badge>
                        )}
                        {effects.risk_level && (
                          <Badge variant="outline">
                            Risco {effects.risk_level}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {ruleCondition(rule) || "Toda a organização"}
                      </p>
                      {effects.required_fields.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Exige:{" "}
                          {effects.required_fields
                            .map((field) => DOCUMENT_RULE_FIELD_LABELS[field])
                            .join(", ")}
                        </p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          governance.clearMutationFeedback();
                          setEditingRule(rule);
                          setRuleFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
