import { useState } from "react";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuthContext } from "@/contexts/AuthContext";
import type { DocumentRulesProject } from "@/hooks/useDocumentTemplatesAndRules";
import { DOC_TYPES } from "@/lib/constants";
import { validateDocumentCreation } from "@/lib/documentCreationValidation";
import {
  classifyDocumentRisk,
  suggestNextReviewDate,
  suggestReviewPeriod,
} from "@/lib/documentIntelligence";
import { buildDocumentPolicyGuidance } from "@/lib/documentPolicyGuidance";
import {
  buildRequiredFieldChecklist,
  calculateGovernanceScore,
  evaluateDocumentRules,
  explainRuleEvaluation,
  matchTemplateForDocument,
  mergeTemplateAndHeuristics,
  type DocumentRuleRecord,
  type DocumentTemplateRecord,
} from "@/lib/documentTemplateRules";

const AREAS = [
  { value: "SGI", label: "SGI — Sistema de Gestão Integrada" },
  { value: "ENG", label: "ENG — Engenharia" },
  { value: "OPS", label: "OPS — Operações" },
  { value: "MNT", label: "MNT — Manutenção" },
  { value: "SST", label: "SST — Saúde e Segurança" },
  { value: "MA", label: "MA — Meio Ambiente" },
];

interface DocumentPolicySimulatorProps {
  templates: DocumentTemplateRecord[];
  rules: DocumentRuleRecord[];
  projects: DocumentRulesProject[];
}

export function DocumentPolicySimulator({
  templates,
  rules,
  projects,
}: DocumentPolicySimulatorProps) {
  const { profile } = useAuthContext();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [form, setForm] = useState({
    title: "Procedimento de Segurança Operacional",
    doc_type: "PRO",
    area: "SST",
    project_id: "",
    description: "",
    hasFile: false,
    review_period_months: 24,
  });
  const simulatedTemplates = includeInactive
    ? templates.map((template) => ({ ...template, is_active: true }))
    : templates;
  const simulatedRules = includeInactive
    ? rules.map((rule) => ({ ...rule, is_active: true }))
    : rules;
  const nextReviewAt =
    suggestNextReviewDate({
      doc_type: form.doc_type,
      review_period_months: form.review_period_months,
    }) ?? "";
  const input = {
    ...form,
    org_id: profile?.org_id,
    project_id: form.project_id || null,
    next_review_at: nextReviewAt,
    metadata: {},
    tags: [],
  };
  const template = matchTemplateForDocument(input, simulatedTemplates);
  const appliedRules = evaluateDocumentRules(input, simulatedRules);
  const heuristicRisk = classifyDocumentRisk(input);
  const decision = mergeTemplateAndHeuristics({
    heuristic: {
      reviewPeriodMonths: suggestReviewPeriod({ doc_type: form.doc_type }),
      riskLevel: heuristicRisk,
      recommendations: [],
    },
    template,
    appliedRules,
  });
  const checklist = buildRequiredFieldChecklist(input, template, appliedRules);
  const governanceScore = calculateGovernanceScore(
    input,
    template,
    appliedRules,
  );
  const validationErrors = validateDocumentCreation({
    title: form.title,
    doc_type: form.doc_type,
    area: form.area,
    revision: 0,
    review_period_months: form.review_period_months,
    next_review_at: nextReviewAt,
    project_id: form.project_id || null,
  });
  const guidance = buildDocumentPolicyGuidance({
    form: input,
    template,
    appliedRules,
    checklist,
    governanceScore,
    governanceRiskProfile: decision.riskProfile,
    warnings: decision.warnings,
    validationErrors,
    enforcedReviewPeriodMonths: decision.enforcedReviewPeriodMonths,
    availability:
      simulatedTemplates.length || simulatedRules.length
        ? "available"
        : "empty",
  });
  const ruleEvaluation = explainRuleEvaluation(input, simulatedRules);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              Simulação rápida
            </CardTitle>
            <CardDescription className="mt-1">
              Teste como as políticas se comportam sem criar ou alterar dados.
            </CardDescription>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={includeInactive}
              onCheckedChange={setIncludeInactive}
            />
            Incluir políticas inativas
          </label>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Título de exemplo</Label>
            <Input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo documental</Label>
            <Select
              value={form.doc_type}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, doc_type: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Área</Label>
            <Select
              value={form.area}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, area: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREAS.map((area) => (
                  <SelectItem key={area.value} value={area.value}>
                    {area.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {projects.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <Label>Projeto</Label>
              <Select
                value={form.project_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    project_id: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem projeto</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.code ? `${project.code} · ` : ""}
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2 md:col-span-2">
            <Label>Descrição de exemplo</Label>
            <Textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={3}
              placeholder="Deixe vazio para testar o bloqueio."
            />
          </div>
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm md:col-span-2">
            <Switch
              checked={form.hasFile}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, hasFile: checked }))
              }
            />
            Simular arquivo inicial anexado
          </label>
        </div>

        <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{guidance.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {guidance.summary}
              </p>
            </div>
            <Badge variant="outline">{governanceScore}%</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              Template: {template?.name ?? "nenhum"}
            </Badge>
            <Badge variant="secondary">{appliedRules.length} regra(s)</Badge>
            <Badge variant="outline">Risco {decision.riskProfile}</Badge>
            <Badge variant="outline">
              Revisão {decision.reviewPeriodMonths} meses
            </Badge>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Requisitos
            </p>
            <div className="mt-2 space-y-2">
              {guidance.requiredItems.map((item) => (
                <div
                  key={item.field}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span>{item.label}</span>
                  <Badge
                    variant={item.isSatisfied ? "secondary" : "destructive"}
                  >
                    {item.isSatisfied ? "Atendido" : "Bloqueia"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
          {guidance.blockingReasons.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <p className="font-semibold">Bloqueios simulados</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {guidance.blockingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Explicabilidade
            </p>
            <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              {ruleEvaluation.slice(0, 4).map((item) => (
                <p key={item.ruleId}>{item.explanation}</p>
              ))}
              {!ruleEvaluation.length && (
                <p>Nenhuma regra disponível para simular.</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
