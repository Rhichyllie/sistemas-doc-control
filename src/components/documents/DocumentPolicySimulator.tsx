import { useState } from "react";
import { ChevronDown, FlaskConical, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { useAuthContext } from "@/contexts/AuthContext";
import type { DocumentRulesProject } from "@/hooks/useDocumentTemplatesAndRules";
import { DOC_TYPES } from "@/lib/constants";
import { validateDocumentCreation } from "@/lib/documentCreationValidation";
import {
  classifyDocumentRisk,
  suggestReviewPeriod,
} from "@/lib/documentIntelligence";
import { buildDocumentPolicyGuidance } from "@/lib/documentPolicyGuidance";
import { calculateNextReviewDate } from "@/lib/documentReviewPeriod";
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
  { value: "SGI", label: "Sistema de Gestão Integrada" },
  { value: "ENG", label: "Engenharia" },
  { value: "OPS", label: "Operações" },
  { value: "MNT", label: "Manutenção" },
  { value: "SST", label: "Saúde e Segurança" },
  { value: "MA", label: "Meio Ambiente" },
  { value: "QUA", label: "Qualidade" },
  { value: "ADM", label: "Administrativo" },
];

const EXAMPLES = {
  certificate: {
    label: "Certificado técnico vencendo",
    title: "Certificado Técnico de Calibração",
    doc_type: "ET",
    area: "ENG",
    description: true,
    descriptionText: "Certificado técnico com validade anual.",
    hasFile: false,
    project_id: "",
    review_period_months: 12,
  },
  contract: {
    label: "Contrato sem responsável",
    title: "Contrato de Prestação de Serviços",
    doc_type: "REG",
    area: "ADM",
    description: true,
    descriptionText: "Contrato de prestação de serviços especializados.",
    hasFile: true,
    project_id: "",
    review_period_months: 24,
  },
  procedure: {
    label: "Procedimento operacional sem arquivo",
    title: "Procedimento Operacional de Partida",
    doc_type: "PRO",
    area: "OPS",
    description: true,
    descriptionText: "Procedimento para operação segura do equipamento.",
    hasFile: false,
    project_id: "",
    review_period_months: 18,
  },
  inspection: {
    label: "Registro de inspeção com evidência",
    title: "Registro de Inspeção de Equipamento",
    doc_type: "REG",
    area: "QUA",
    description: true,
    descriptionText: "Registro da inspeção e das evidências encontradas.",
    hasFile: true,
    project_id: "",
    review_period_months: 12,
  },
  project: {
    label: "Documento de projeto sem projeto",
    title: "Especificação Técnica do Projeto",
    doc_type: "ET",
    area: "ENG",
    description: true,
    descriptionText: "Especificação aplicável à execução do projeto.",
    hasFile: true,
    project_id: "",
    review_period_months: 18,
  },
} as const;

type ExampleKey = keyof typeof EXAMPLES;

interface DocumentPolicySimulatorProps {
  templates: DocumentTemplateRecord[];
  rules: DocumentRuleRecord[];
  projects: DocumentRulesProject[];
}

interface SimulatorFormState {
  title: string;
  doc_type: string;
  area: string;
  project_id: string;
  hasDescription: boolean;
  descriptionText: string;
  hasFile: boolean;
  review_period_months: number;
  next_review_at: string;
}

export function DocumentPolicySimulator({
  templates,
  rules,
  projects,
}: DocumentPolicySimulatorProps) {
  const { profile } = useAuthContext();
  const initialExample = EXAMPLES.certificate;
  const [open, setOpen] = useState(false);
  const [selectedExample, setSelectedExample] =
    useState<ExampleKey>("certificate");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [form, setForm] = useState<SimulatorFormState>({
    title: initialExample.title,
    doc_type: initialExample.doc_type,
    area: initialExample.area,
    project_id: initialExample.project_id,
    hasDescription: initialExample.description,
    descriptionText: initialExample.descriptionText,
    hasFile: initialExample.hasFile,
    review_period_months: initialExample.review_period_months,
    next_review_at: calculateNextReviewDate({
      value: initialExample.review_period_months,
      unit: "months",
    }),
  });

  function applyExample() {
    const example = EXAMPLES[selectedExample];
    setForm({
      title: example.title,
      doc_type: example.doc_type,
      area: example.area,
      project_id: example.project_id,
      hasDescription: example.description,
      descriptionText: example.descriptionText,
      hasFile: example.hasFile,
      review_period_months: example.review_period_months,
      next_review_at: calculateNextReviewDate({
        value: example.review_period_months,
        unit: "months",
      }),
    });
    setOpen(true);
  }

  const simulatedTemplates = includeInactive
    ? templates.map((template) => ({ ...template, is_active: true }))
    : templates;
  const simulatedRules = includeInactive
    ? rules.map((rule) => ({ ...rule, is_active: true }))
    : rules;
  const input = {
    ...form,
    org_id: profile?.org_id,
    project_id: form.project_id || null,
    description: form.hasDescription ? form.descriptionText : "",
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
    next_review_at: form.next_review_at,
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
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                Testar impacto da política
              </CardTitle>
              <CardDescription className="mt-1">
                Veja como templates e regras afetariam um documento antes de
                ativar.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={selectedExample}
                onValueChange={(value) =>
                  setSelectedExample(value as ExampleKey)
                }
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXAMPLES).map(([key, example]) => (
                    <SelectItem key={key} value={key}>
                      {example.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={applyExample}>
                Usar exemplo
              </Button>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost">
                  {open ? "Recolher" : "Abrir teste"}
                  <ChevronDown
                    className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Título do documento</Label>
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
                  onValueChange={(doc_type) =>
                    setForm((current) => ({ ...current, doc_type }))
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
                  onValueChange={(area) =>
                    setForm((current) => ({ ...current, area }))
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
                    onValueChange={(project_id) =>
                      setForm((current) => ({
                        ...current,
                        project_id: project_id === "none" ? "" : project_id,
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
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <Switch
                  checked={form.hasDescription}
                  onCheckedChange={(hasDescription) =>
                    setForm((current) => ({
                      ...current,
                      hasDescription,
                    }))
                  }
                />
                Tem descrição?
              </label>
              <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <Switch
                  checked={form.hasFile}
                  onCheckedChange={(hasFile) =>
                    setForm((current) => ({ ...current, hasFile }))
                  }
                />
                Tem arquivo?
              </label>
              {form.hasDescription && (
                <div className="space-y-2 md:col-span-2">
                  <Label>Descrição simulada</Label>
                  <Input
                    value={form.descriptionText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        descriptionText: event.target.value,
                      }))
                    }
                  />
                </div>
              )}
              <div className="space-y-2 md:col-span-2">
                <Label>Próxima revisão</Label>
                <Input
                  type="date"
                  value={form.next_review_at}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      next_review_at: event.target.value,
                    }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <Switch
                  checked={includeInactive}
                  onCheckedChange={setIncludeInactive}
                />
                Incluir políticas inativas somente neste teste
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

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Políticas aplicadas
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {guidance.appliedPolicyNames.length ? (
                    guidance.appliedPolicyNames.map((name) => (
                      <Badge key={name} variant="secondary">
                        {name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Nenhuma política corresponde a este exemplo.
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  O que seria obrigatório
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
                  <p className="font-semibold">O que bloquearia</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {guidance.blockingReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recomendações ao usuário
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {decision.recommendations.length ? (
                    decision.recommendations.map((recommendation) => (
                      <li key={recommendation}>{recommendation}</li>
                    ))
                  ) : (
                    <li>Nenhuma recomendação adicional.</li>
                  )}
                </ul>
              </div>

              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Por que foi aplicada
                </p>
                <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  {ruleEvaluation.slice(0, 5).map((item) => (
                    <p key={item.ruleId}>{item.explanation}</p>
                  ))}
                  {!ruleEvaluation.length && (
                    <p>Nenhuma regra disponível para avaliar.</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
