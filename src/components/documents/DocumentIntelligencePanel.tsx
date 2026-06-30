import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import type { DocumentRiskLevel } from "@/lib/documentIntelligence";

const RISK_META: Record<
  DocumentRiskLevel,
  { label: string; className: string }
> = {
  low: {
    label: "Baixo",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  medium: {
    label: "Médio",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  high: {
    label: "Alto",
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
  onApplySuggestions: () => void;
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
  onApplySuggestions,
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
                Leitura heurística dos metadados atuais.
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
              <span className="font-semibold">{completenessScore}%</span>
            </div>
            <Progress value={completenessScore} />
            <p className="mt-2 text-xs text-muted-foreground">
              {missingItems.length
                ? `Pode melhorar: ${missingItems.slice(0, 3).join(", ")}.`
                : "Metadados essenciais preenchidos."}
            </p>
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
              onClick={onApplySuggestions}
            >
              Aplicar sugestões
            </Button>
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
