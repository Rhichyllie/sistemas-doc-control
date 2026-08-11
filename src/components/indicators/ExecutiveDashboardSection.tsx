import type { OperationalIndicatorsReport } from "@/lib/operationalIndicators";
import { SlaDistributionChart } from "@/components/indicators/SlaDistributionChart";
import { RiskMatrixPanel } from "@/components/indicators/RiskMatrixPanel";
import { TrendComparisonPanel } from "@/components/indicators/TrendComparisonPanel";
import { ResponsibleRiskPanel } from "@/components/indicators/ResponsibleRiskPanel";
import { OperationalFlowPanel } from "@/components/indicators/OperationalFlowPanel";
import { OperationalHeatmapPanel } from "@/components/indicators/OperationalHeatmapPanel";
import { OperationalHealthHero } from "@/components/indicators/OperationalHealthHero";
import { BottleneckBarChart } from "@/components/indicators/BottleneckBarChart";
import { NotificationSignalPanel } from "@/components/indicators/NotificationSignalPanel";
import { DelegationImpactPanel } from "@/components/indicators/DelegationImpactPanel";
import { DocumentQualityRadar } from "@/components/indicators/DocumentQualityRadar";
import { ExecutiveSummaryCard } from "@/components/indicators/ExecutiveSummaryCard";
import { MetricCardGrid } from "@/components/indicators/MetricCardGrid";
import { getKpiCards } from "@/lib/operationalIndicators";
import { IndicatorsVisualOverview } from "@/components/indicators/IndicatorsVisualOverview";
import { IndicatorSectionTabs } from "@/components/indicators/IndicatorSectionTabs";
import { OperationalRecommendations } from "@/components/indicators/OperationalRecommendations";

export function ExecutiveIndicatorsCockpit({
  report,
  recommendations,
  presentation,
}: {
  report: OperationalIndicatorsReport;
  recommendations: OperationalIndicatorsReport["recommendations"];
  presentation: boolean;
}) {
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

export function AnalysisIndicatorsCockpit({
  report,
  recommendations,
  primaryRecommendation,
}: {
  report: OperationalIndicatorsReport;
  recommendations: OperationalIndicatorsReport["recommendations"];
  primaryRecommendation?: OperationalIndicatorsReport["recommendations"][number];
}) {
  return (
    <>
      <OperationalHealthHero
        report={report}
        primaryRecommendation={primaryRecommendation}
      />

      <section
        aria-label="Comparação e matriz de risco"
        className="grid gap-4 xl:grid-cols-2"
      >
        <TrendComparisonPanel report={report} />
        <RiskMatrixPanel report={report} />
      </section>

      <section
        aria-label="Rankings analíticos"
        className="grid gap-4 xl:grid-cols-2"
      >
        <BottleneckBarChart report={report} />
        <OperationalHeatmapPanel report={report} />
      </section>

      <section
        data-print-page-break-before
        aria-label="Sinais operacionais complementares"
        className="grid gap-4 2xl:grid-cols-3"
      >
        <NotificationSignalPanel report={report} />
        <DelegationImpactPanel report={report} />
        <DocumentQualityRadar report={report} />
      </section>

      <IndicatorSectionTabs report={report} />
      <OperationalRecommendations recommendations={recommendations} />
    </>
  );
}

export function ExecutiveDashboardSection({
  report,
  recommendations,
  viewMode,
  showManagementOverview = true,
}: {
  report: OperationalIndicatorsReport;
  recommendations: OperationalIndicatorsReport["recommendations"];
  viewMode: "management" | "presentation" | "analysis";
  showManagementOverview?: boolean;
}) {
  return (
    <>
      {showManagementOverview && viewMode === "management" ? (
        <IndicatorsVisualOverview report={report} />
      ) : null}

      <ExecutiveSummaryCard report={report} />
      <MetricCardGrid metrics={getKpiCards(report)} />

      {viewMode === "analysis" ? (
        <AnalysisIndicatorsCockpit
          report={report}
          recommendations={recommendations}
          primaryRecommendation={recommendations[0]}
        />
      ) : (
        <ExecutiveIndicatorsCockpit
          report={report}
          recommendations={recommendations}
          presentation={viewMode === "presentation"}
        />
      )}
    </>
  );
}
