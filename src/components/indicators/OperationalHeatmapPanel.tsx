import { useMemo, useState } from "react";
import { MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OperationalIndicatorsReport } from "@/lib/operationalIndicators";

type Dimension = "project" | "area";

export function OperationalHeatmapPanel({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const [dimension, setDimension] = useState<Dimension>("project");
  const items = useMemo(
    () =>
      (dimension === "project"
        ? report.bottlenecks.byProject
        : report.bottlenecks.byArea
      ).slice(0, 8),
    [dimension, report.bottlenecks.byArea, report.bottlenecks.byProject],
  );
  const maximum = Math.max(...items.map((item) => item.count), 1);

  return (
    <Card data-print-break-inside className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPinned className="h-4 w-4 text-primary" />
              Intensidade operacional
            </CardTitle>
            <CardDescription>
              Ranking visual independente por projeto ou área.
            </CardDescription>
          </div>
          <div className="flex rounded-lg border p-1" data-print-hidden>
            <Button
              type="button"
              size="sm"
              variant={dimension === "project" ? "secondary" : "ghost"}
              onClick={() => setDimension("project")}
            >
              Projeto
            </Button>
            <Button
              type="button"
              size="sm"
              variant={dimension === "area" ? "secondary" : "ghost"}
              onClick={() => setDimension("area")}
            >
              Área
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sem concentração disponível para esta dimensão.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((item) => {
              const intensity = item.count / maximum;
              const shell =
                intensity >= 0.75
                  ? "border-destructive/30 bg-destructive/[0.08]"
                  : intensity >= 0.4
                    ? "border-amber-200 bg-amber-50/65"
                    : "border-primary/15 bg-primary/[0.035]";
              return (
                <div
                  key={item.key}
                  className={`rounded-xl border p-3 ${shell}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    <span className="text-lg font-semibold">{item.count}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(intensity * 100, 5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          O JSON atual não cruza projeto x área. A intensidade representa
          rankings separados; uma matriz real depende de dados dimensionais
          futuros.
        </p>
      </CardContent>
    </Card>
  );
}
