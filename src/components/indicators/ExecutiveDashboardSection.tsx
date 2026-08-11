import type { OperationalIndicatorsReport } from "@/lib/operationalIndicators";
import { SlaDistributionChart } from "@/components/indicators/SlaDistributionChart";
import { RiskMatrixPanel } from "@/components/indicators/RiskMatrixPanel";
import { TrendComparisonPanel } from "@/components/indicators/TrendComparisonPanel";
import { ResponsibleRiskPanel } from "@/components/indicators/ResponsibleRiskPanel";
import { OperationalFlowPanel } from "@/components/indicators/OperationalFlowPanel";
import { OperationalHeatmapPanel } from "@/components/indicators/OperationalHeatmapPanel";
import { ExecutiveSummaryCard } from "@/components/indicators/ExecutiveSummaryCard";
import { MetricCardGrid } from "@/components/indicators/MetricCardGrid";
import { getKpiCards } from "@/lib/operationalIndicators";

export function ExecutiveIndicatorsCockpit({
  report,
  recommendations,
  presentation,
}: {
  report: OperationalIndicatorsReport;
  recommendations: OperationalIndicatorsReport["recommendations"];
  presentation: boolean;
}) {
  void recommendations;
  return (
    <>
      <section
        aria-label="SLA, risco e comparação de período"
        className="grid gap-4 2xl:grid-cols-12"
      >
        <div className="2xl:col-span-5">
          <SlaDistributionChart report={report} />
        </div>
        <div className="2xl:col-span-4">
          <RiskMatrixPanel report={report} />
        </div>
        <div className="2xl:col-span-3">
          <TrendComparisonPanel report={report} />
        </div>
      </section>

      <section
        data-print-page-break-before={presentation ? "" : undefined}
        aria-label="Gargalos e concentração de risco"
        className="grid gap-4 xl:grid-cols-2"
      >
        <ResponsibleRiskPanel report={report} />
        <OperationalFlowPanel report={report} />
      </section>

      <section
        aria-label="Comparação e matriz de risco"
        className="grid gap-4 xl:grid-cols-2"
      >
        <TrendComparisonPanel report={report} />
        <RiskMatrixPanel report={report} />
      </section>

      <section
        aria-label="Intensidade operacional"
        className="grid gap-4"
      >
        <OperationalHeatmapPanel report={report} />
      </section>
    </>
  );
}

export function ExecutiveDashboardSection({
  report,
  recommendations,
  viewMode,
}: {
  report: OperationalIndicatorsReport;
  recommendations: OperationalIndicatorsReport["recommendations"];
  viewMode: "management" | "presentation" | "analysis";
}) {
  const presentation = viewMode === "presentation";
  return (
    <>
      <ExecutiveSummaryCard report={report} />
      <MetricCardGrid metrics={getKpiCards(report)} />
      <ExecutiveIndicatorsCockpit
        report={report}
        recommendations={recommendations}
        presentation={presentation}
      />
    </>
  );
}
