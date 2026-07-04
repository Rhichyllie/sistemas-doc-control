import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";
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
import type { OperationalIndicatorRecommendation } from "@/lib/operationalIndicators";

export function OperationalRecommendations({
  recommendations,
}: {
  recommendations: OperationalIndicatorRecommendation[];
}) {
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => {
    const weight = { critical: 0, warning: 1, info: 2 };
    return [...recommendations].sort(
      (left, right) => weight[left.severity] - weight[right.severity],
    );
  }, [recommendations]);
  const primary = sorted.slice(0, 3);
  const remaining = sorted.slice(3);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-primary" />
          Próximas ações recomendadas
        </CardTitle>
        <CardDescription>
          Ações determinísticas ordenadas por impacto operacional.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 xl:grid-cols-3">
          {primary.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
            />
          ))}
        </div>
        {remaining.length > 0 && (
          <Collapsible
            open={showAll}
            onOpenChange={setShowAll}
            className="mt-3"
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full">
                {showAll
                  ? "Ocultar ações adicionais"
                  : `Ver mais ${remaining.length} ação(ões)`}
                <ChevronDown
                  className={`ml-2 h-4 w-4 transition-transform ${
                    showAll ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-3 pt-3 xl:grid-cols-3">
              {remaining.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationCard({
  recommendation,
}: {
  recommendation: OperationalIndicatorRecommendation;
}) {
  const Icon =
    recommendation.severity === "critical"
      ? ShieldAlert
      : recommendation.severity === "warning"
        ? CircleAlert
        : CircleCheck;
  return (
    <div className="flex h-full flex-col rounded-xl border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <div
          className={
            recommendation.severity === "critical"
              ? "rounded-lg bg-destructive/10 p-2 text-destructive"
              : recommendation.severity === "warning"
                ? "rounded-lg bg-amber-100 p-2 text-amber-700"
                : "rounded-lg bg-emerald-100 p-2 text-emerald-700"
          }
        >
          <Icon className="h-4 w-4" />
        </div>
        <Badge variant="outline">
          {recommendation.severity === "critical"
            ? "Crítico"
            : recommendation.severity === "warning"
              ? "Atenção"
              : "Informativo"}
        </Badge>
      </div>
      <p className="mt-4 font-semibold">{recommendation.title}</p>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">
        {recommendation.explanation}
      </p>
      <p className="mt-3 text-xs font-medium text-muted-foreground">
        Por que importa: reduz exposição operacional no recorte atual.
      </p>
      <Button asChild className="mt-4 justify-between" variant="outline">
        <Link to={recommendation.actionUrl}>
          {recommendation.actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
