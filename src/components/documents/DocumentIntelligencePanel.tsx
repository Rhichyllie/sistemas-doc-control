import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  FolderKanban,
  Lightbulb,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DocumentCodePreviewCard } from "@/components/documents/DocumentCodePreviewCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DocumentRiskLevel } from "@/lib/documentIntelligence";
import type { DocumentPolicyGuidance } from "@/lib/documentPolicyGuidance";
import type { GovernanceRiskProfile } from "@/lib/documentTemplateRules";
import type { DocumentCodePreview } from "@/lib/documentCodePatterns";
import {
  getProjectStatusLabel,
  type ProjectOperationalContext,
} from "@/lib/projectOperationalContext";
import type { DocumentTramiteTemplate } from "@/lib/documentTramiteModel";

const RISK_META: Record<
  DocumentRiskLevel,
  { label: string; description: string; className: string }
> = {
  low: {
    label: "Baixo",
    description: "Metadados consistentes para um rascunho inicial.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  medium: {
    label: "Médio",
    description: "Revise os alertas antes de configurar o workflow.",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  high: {
    label: "Alto",
    description: "Há lacunas relevantes de governança ou conteúdo.",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

interface DocumentIntelligencePanelProps {
  completenessScore: number;
  riskLevel: DocumentRiskLevel;
  inferredType: string | null;
  inferredArea: string;
  reviewPeriodSuggestion: number;
  nextReviewSuggestion: string | null;
  recommendations: string[];
  warnings: string[];
  missingItems: string[];
  configurationMessage: string | null;
  governanceScore: number;
  governanceRiskProfile: GovernanceRiskProfile;
  policyGuidance: DocumentPolicyGuidance;
  suggestionsApplied: boolean;
  suggestionsDisabled: boolean;
  onApplySuggestions: () => void;
  codePreview: DocumentCodePreview;
  codePreviewLoading: boolean;
  codeCompatibilityMessage: string | null;
  selectedProject: ProjectOperationalContext | null;
  suggestedTramite: DocumentTramiteTemplate | null;
  tramiteCompatibilityMessage: string | null;
}

export function DocumentIntelligencePanel({
  completenessScore,
  riskLevel,
  inferredType,
  inferredArea,
  reviewPeriodSuggestion,
  nextReviewSuggestion,
  recommendations,
  warnings,
  missingItems,
  configurationMessage,
  governanceScore,
  governanceRiskProfile,
  policyGuidance,
  suggestionsApplied,
  suggestionsDisabled,
  onApplySuggestions,
  codePreview,
  codePreviewLoading,
  codeCompatibilityMessage,
  selectedProject,
  suggestedTramite,
  tramiteCompatibilityMessage,
}: DocumentIntelligencePanelProps) {
  const risk = RISK_META[riskLevel];

  return (
    <div className="space-y-4 xl:sticky xl:top-6">
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="bg-primary/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                Inteligência documental
              </CardTitle>
              <CardDescription className="mt-1">
                Orientação combinada entre políticas e inteligência local.
              </CardDescription>
            </div>
            <Badge variant="outline" className={risk.className}>
              Risco {risk.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Completude</span>
              <span className="text-2xl font-bold tracking-tight">
                {completenessScore}%
              </span>
            </div>
            <Progress value={completenessScore} className="h-2.5" />
            <p className="mt-2 text-xs text-muted-foreground">
              {missingItems.length
                ? `Pode melhorar: ${missingItems.slice(0, 3).join(", ")}.`
                : "Metadados essenciais preenchidos."}
            </p>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Política aplicada
                </p>
                <p className="mt-1 text-sm font-medium">
                  {policyGuidance.title}
                </p>
              </div>
              <Badge variant="outline">{governanceScore}% aderente</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {policyGuidance.summary}
            </p>
            {policyGuidance.appliedPolicyNames.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {policyGuidance.appliedPolicyNames.map((name) => (
                  <Badge key={name} variant="secondary">
                    {name}
                  </Badge>
                ))}
              </div>
            )}
            {policyGuidance.explanation.slice(0, 3).map((explanation) => (
              <p
                key={explanation}
                className="mt-2 text-xs text-muted-foreground"
              >
                {explanation}
              </p>
            ))}
            {governanceRiskProfile === "critical" && (
              <p className="mt-2 text-xs font-medium text-destructive">
                Política crítica: todos os requisitos devem ser atendidos.
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sugestões
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Tipo {inferredType ?? "—"}</Badge>
              <Badge variant="secondary">Área {inferredArea}</Badge>
              <Badge variant="outline">{reviewPeriodSuggestion} meses</Badge>
            </div>
            {nextReviewSuggestion && (
              <p className="mt-2 text-xs text-muted-foreground">
                Próxima revisão sugerida: {nextReviewSuggestion}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              className="mt-3 w-full"
              variant={suggestionsApplied ? "secondary" : "default"}
              disabled={suggestionsDisabled}
              onClick={onApplySuggestions}
            >
              {suggestionsApplied ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {policyGuidance.appliedPolicyNames.length
                    ? "Política aplicada"
                    : "Sugestões aplicadas"}
                </>
              ) : (
                <>
                  {policyGuidance.appliedPolicyNames.length
                    ? "Aplicar política sugerida"
                    : "Aplicar sugestões"}
                </>
              )}
            </Button>
          </div>

          <div className="space-y-2">
            {selectedProject && (
              <div className="rounded-lg border border-primary/15 bg-primary/[0.025] p-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  <FolderKanban className="h-3.5 w-3.5" />
                  Contexto operacional
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {selectedProject.code} · {selectedProject.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[
                    selectedProject.client_name,
                    selectedProject.contract_number,
                    selectedProject.location,
                    getProjectStatusLabel(selectedProject.status),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            )}
            {suggestedTramite && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/30">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                  <Workflow className="h-3.5 w-3.5" />
                  Trâmite sugerido
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {suggestedTramite.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {suggestedTramite.current_version?.graph.nodes.length ?? 0}{" "}
                  etapas · primeira ação:{" "}
                  {suggestedTramite.current_version?.graph.nodes.find(
                    (node) => node.node_type !== "start",
                  )?.label ?? "a definir"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Sugestão informativa. A execução automática ainda não está
                  habilitada.
                </p>
              </div>
            )}
            {tramiteCompatibilityMessage && (
              <p className="px-1 text-xs text-amber-700 dark:text-amber-300">
                {tramiteCompatibilityMessage}
              </p>
            )}
            <DocumentCodePreviewCard
              preview={codePreview}
              isLoading={codePreviewLoading}
              compatibilityMessage={codeCompatibilityMessage}
              compact
            />
            {policyGuidance.appliedPolicyNames.length > 0 &&
              codePreview.code && (
                <p className="px-1 text-xs text-muted-foreground">
                  Com a política {policyGuidance.appliedPolicyNames[0]}{" "}
                  aplicada, o código previsto segue o padrão{" "}
                  <span className="font-mono font-medium text-foreground">
                    {codePreview.code}
                  </span>
                  .
                </p>
              )}
          </div>

          <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
            <strong className="text-foreground">Leitura de risco:</strong>{" "}
            {risk.description}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Campos obrigatórios
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
              {policyGuidance.requiredItems.map((item) => (
                <div
                  key={item.field}
                  className={`rounded-md border p-2.5 text-xs ${
                    item.isSatisfied
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      {item.isSatisfied ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                      ) : (
                        <CircleAlert className="h-3.5 w-3.5 text-amber-700" />
                      )}
                      {item.label}
                    </span>
                    <Badge
                      variant={item.isSatisfied ? "secondary" : "destructive"}
                      className="h-5"
                    >
                      {item.isSatisfied ? "Atendido" : "Pendente"}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-muted-foreground">{item.reason}</p>
                </div>
              ))}
            </div>
          </div>

          {policyGuidance.status === "blocked" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <strong>Criação bloqueada por política documental.</strong>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                {policyGuidance.blockingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-md border px-3 py-2">
            <p className="text-xs font-semibold">Próximas ações</p>
            {policyGuidance.nextActions.length > 0 ? (
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {policyGuidance.nextActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-emerald-700">
                Documento pronto para criação.
              </p>
            )}
          </div>

          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.slice(0, 3).map((warning) => (
                <div
                  key={warning}
                  className="flex gap-2 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-amber-600" />
            Recomendações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recommendations.length ? (
            recommendations.slice(0, 4).map((recommendation) => (
              <div key={recommendation} className="flex gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{recommendation}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma recomendação adicional.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Próximos passos
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Criar rascunho</span>
            <ArrowRight className="h-3 w-3" />
            <span>Revisar conteúdo</span>
            <ArrowRight className="h-3 w-3" />
            <span>Configurar fluxo</span>
          </div>
        </CardContent>
      </Card>

      {configurationMessage && (
        <Alert>
          <AlertTitle>Modo compatível</AlertTitle>
          <AlertDescription>{configurationMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
