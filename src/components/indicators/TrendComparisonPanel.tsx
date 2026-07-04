import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  GitCompareArrows,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatCount,
  getTrendComparison,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

export function TrendComparisonPanel({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const metrics = getTrendComparison(report);

  return (
    <Card data-print-break-inside className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          Período atual x anterior
        </CardTitle>
        <CardDescription>
          Comparação real com intervalo anterior equivalente, sem série temporal
          estimada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.map((metric) => {
          const maximum = Math.max(
            metric.current ?? 0,
            metric.previous ?? 0,
            1,
          );
          const TrendIcon =
            metric.deltaPercent === null || metric.deltaPercent === 0
              ? ArrowRight
              : metric.deltaPercent > 0
                ? ArrowUpRight
                : ArrowDownRight;
          return (
            <div key={metric.id} className="rounded-xl border p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{metric.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metric.explanation}
                  </p>
                </div>
                <div
                  className={
                    metric.tone === "positive"
                      ? "flex items-center gap-1 text-sm font-semibold text-emerald-700"
                      : metric.tone === "attention"
                        ? "flex items-center gap-1 text-sm font-semibold text-amber-700"
                        : "flex items-center gap-1 text-sm font-semibold text-muted-foreground"
                  }
                >
                  <TrendIcon className="h-4 w-4" />
                  {metric.deltaPercent === null
                    ? "sem base %"
                    : `${metric.deltaPercent >= 0 ? "+" : ""}${metric.deltaPercent}%`}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[76px_1fr_42px] items-center gap-2 text-xs">
                <span className="text-muted-foreground">Atual</span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${((metric.current ?? 0) / maximum) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-right font-semibold">
                  {formatCount(metric.current)}
                </span>
                <span className="text-muted-foreground">Anterior</span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-muted-foreground/45"
                    style={{
                      width: `${((metric.previous ?? 0) / maximum) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-right font-semibold">
                  {formatCount(metric.previous)}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
