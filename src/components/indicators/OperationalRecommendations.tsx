import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleAlert, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OperationalIndicatorRecommendation } from "@/lib/operationalIndicators";

export function OperationalRecommendations({
  recommendations,
}: {
  recommendations: OperationalIndicatorRecommendation[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-primary" />
          Próximas ações recomendadas
        </CardTitle>
        <CardDescription>
          Recomendações determinísticas geradas pelos indicadores disponíveis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.map((recommendation) => (
          <div
            key={recommendation.id}
            className="flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"
          >
            <div className="flex gap-3">
              <CircleAlert
                className={
                  recommendation.severity === "critical"
                    ? "mt-0.5 h-4 w-4 text-destructive"
                    : "mt-0.5 h-4 w-4 text-amber-600"
                }
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{recommendation.title}</p>
                  <Badge variant="outline">{recommendation.severity}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {recommendation.explanation}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to={recommendation.actionUrl}>
                {recommendation.actionLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
