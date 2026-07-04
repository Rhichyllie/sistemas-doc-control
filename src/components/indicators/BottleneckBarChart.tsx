import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
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
  getBottleneckSeries,
  type BottleneckDimension,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

const DIMENSIONS: Array<{ id: BottleneckDimension; label: string }> = [
  { id: "responsible", label: "Responsável" },
  { id: "project", label: "Projeto" },
  { id: "area", label: "Área" },
  { id: "step_type", label: "Etapa" },
  { id: "doc_type", label: "Tipo" },
];

export function BottleneckBarChart({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const [dimension, setDimension] =
    useState<BottleneckDimension>("responsible");
  const items = useMemo(
    () => getBottleneckSeries(report, dimension),
    [dimension, report],
  );
  const maximum = Math.max(...items.map((item) => item.count), 1);
  const top = items[0];

  return (
    <Card data-print-break-inside className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Gargalos
            </CardTitle>
            <CardDescription>
              Concentração de etapas vencidas por dimensão.
            </CardDescription>
          </div>
          {top && (
            <Badge variant="destructive">
              Top: {top.label} · {top.count}
            </Badge>
          )}
        </div>
        <div
          className="flex gap-1 overflow-x-auto pt-3"
          aria-label="Dimensão do ranking"
        >
          {DIMENSIONS.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={dimension === option.id ? "default" : "ghost"}
              aria-pressed={dimension === option.id}
              onClick={() => setDimension(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum gargalo identificado nesta dimensão.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.key}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    <span className="mr-2 text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    {item.label}
                  </span>
                  <span className="text-sm font-semibold">{item.count}</span>
                </div>
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${item.label}: ${item.count} itens em risco`}
                >
                  <div
                    className={
                      index === 0
                        ? "h-full rounded-full bg-destructive"
                        : "h-full rounded-full bg-primary/70"
                    }
                    style={{
                      width: `${Math.max((item.count / maximum) * 100, 4)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
