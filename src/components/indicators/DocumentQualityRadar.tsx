import { ScanSearch } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatCount,
  getQualityScoreGrid,
  type IndicatorTone,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

const BAR: Record<IndicatorTone, string> = {
  neutral: "bg-muted-foreground/45",
  positive: "bg-emerald-500",
  attention: "bg-amber-500",
  critical: "bg-destructive",
};

export function DocumentQualityRadar({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const signals = getQualityScoreGrid(report);

  return (
    <Card data-print-break-inside className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanSearch className="h-4 w-4 text-primary" />
          Radar de qualidade documental
        </CardTitle>
        <CardDescription>
          Cobertura dos controles; barras substituem um radar decorativo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {signals.map((signal) => (
          <div key={signal.id}>
            <div className="mb-1.5 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{signal.label}</p>
                <p className="text-xs text-muted-foreground">
                  {signal.explanation}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">
                  {signal.governedPercent === null
                    ? "—"
                    : `${signal.governedPercent}%`}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatCount(signal.occurrences)} lacuna(s)
                </p>
              </div>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${signal.label}: ${
                signal.governedPercent === null
                  ? "cobertura não mensurada"
                  : `${signal.governedPercent}% de cobertura`
              }`}
            >
              <div
                className={`h-full rounded-full ${BAR[signal.tone]}`}
                style={{ width: `${signal.governedPercent ?? 0}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
