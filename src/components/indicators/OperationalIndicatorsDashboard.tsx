import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { BottleneckBarChart } from "@/components/indicators/BottleneckBarChart";
import { DelegationImpactPanel } from "@/components/indicators/DelegationImpactPanel";
import { DocumentQualityRadar } from "@/components/indicators/DocumentQualityRadar";
import { EmptyIndicatorsState } from "@/components/indicators/EmptyIndicatorsState";
import { ExecutiveSummaryCard } from "@/components/indicators/ExecutiveSummaryCard";
import { IndicatorExportBar } from "@/components/indicators/IndicatorExportBar";
import { IndicatorFilterBar } from "@/components/indicators/IndicatorFilterBar";
import { IndicatorSectionTabs } from "@/components/indicators/IndicatorSectionTabs";
import { IndicatorsVisualOverview } from "@/components/indicators/IndicatorsVisualOverview";
import { MeetingModeLayout } from "@/components/indicators/MeetingModeLayout";
import { MetricCardGrid } from "@/components/indicators/MetricCardGrid";
import { NotificationSignalPanel } from "@/components/indicators/NotificationSignalPanel";
import { OperationalFlowPanel } from "@/components/indicators/OperationalFlowPanel";
import { OperationalHealthHero } from "@/components/indicators/OperationalHealthHero";
import { OperationalHeatmapPanel } from "@/components/indicators/OperationalHeatmapPanel";
import { OperationalRecommendations } from "@/components/indicators/OperationalRecommendations";
import { ResponsibleRiskPanel } from "@/components/indicators/ResponsibleRiskPanel";
import { RiskMatrixPanel } from "@/components/indicators/RiskMatrixPanel";
import { SlaDistributionChart } from "@/components/indicators/SlaDistributionChart";
import { TrendComparisonPanel } from "@/components/indicators/TrendComparisonPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOperationalIndicators } from "@/hooks/useOperationalIndicators";
import {
  getIndicatorsSourceMessage,
  getKpiCards,
  hasOperationalIndicatorData,
  type IndicatorViewMode,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

const VIEW_MODE_KEY = "tramita.indicators.viewMode";

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

const SOURCE_LABEL = {
  rpc: "RPC ativa",
  fallback: "Fallback limitado",
  not_installed: "Ciclo não instalado",
  restricted: "Escopo pessoal",
  empty: "Sem dados",
  error: "Erro de leitura",
} as const;

export function OperationalIndicatorsDashboard() {
  const indicators = useOperationalIndicators();
  const report = indicators.report;
  const [viewMode, setViewMode] = useState<IndicatorViewMode>("management");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isLibraryIndicatorsRoute = /^\/authenticated\/biblioteca\/[^/]+\/indicadores\/?$/.test(
    pathname,
  );

  useEffect(() => {
    if (isLibraryIndicatorsRoute) {
      setViewMode("management");
      return;
    }

    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      if (
        stored === "management" ||
        stored === "presentation" ||
        stored === "analysis"
      ) {
        setViewMode(stored);
      }
    } catch {
      // Estado local é opcional; o modo Gestão permanece como fallback.
    }
  }, [isLibraryIndicatorsRoute]);

  const recommendations = useMemo(
    () =>
      report
        ? [...report.recommendations].sort((left, right) => {
            const weight = { critical: 0, warning: 1, info: 2 };
            return weight[left.severity] - weight[right.severity];
          })
        : [],
    [report],
  );

  function changeViewMode(mode: IndicatorViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // A tela continua funcional quando a persistência local é bloqueada.
    }
  }

  if (indicators.isLoading && !report) {
    return <IndicatorsLoadingState />;
  }

  const hasData = report ? hasOperationalIndicatorData(report) : false;
  const showManagementOverview = Boolean(
    report && viewMode === "management",
  );
  const showAdvancedEmptyState = Boolean(
    report && !hasData && !showManagementOverview,
  );
  return (
    <MeetingModeLayout mode={viewMode} report={report}>
      <header
        data-print-hidden
        className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.075] via-background to-background p-5 md:p-7"
      >
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Executive BI Cockpit</Badge>
              <Badge
                variant={indicators.source === "rpc" ? "default" : "secondary"}
              >
                {SOURCE_LABEL[indicators.source]}
              </Badge>
              {viewMode === "presentation" && (
                <Badge variant="secondary">Modo reunião</Badge>
              )}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Indicadores Operacionais
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              SLA, gargalos, risco e performance documental.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {report && (
                <>
                  <span>
                    Período: {report.period.from} a {report.period.to}
                  </span>
                  <span>
                    Atualizado em {formatGeneratedAt(report.generatedAt)}
                  </span>
                </>
              )}
            </div>
          </div>
          {viewMode !== "presentation" && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/authenticated/documentos/central">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Central Documental
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/authenticated/configuracoes">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Configurações
                </Link>
              </Button>
              <Button
                aria-label="Atualizar indicadores operacionais"
                onClick={() => void indicators.refresh()}
                disabled={indicators.isLoading}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${
                    indicators.isLoading ? "animate-spin" : ""
                  }`}
                />
                Atualizar
              </Button>
            </div>
          )}
        </div>
      </header>

      {report && (
        <IndicatorExportBar
          report={report}
          mode={viewMode}
          onModeChange={changeViewMode}
        />
      )}

      {viewMode !== "presentation" && (
        <div data-print-hidden>
          <IndicatorFilterBar
            filters={indicators.filters}
            onChange={indicators.setFilters}
            canViewOrganization={indicators.canViewOrganization}
            dimensions={indicators.dimensions}
          />
        </div>
      )}

      {indicators.error && report && (
        <Alert
          data-print-break-inside
          variant="destructive"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Leitura parcial</AlertTitle>
          <AlertDescription>
            {indicators.error}{" "}
            {getIndicatorsSourceMessage(indicators.source)}
          </AlertDescription>
        </Alert>
      )}

      {!report ? (
        <EmptyIndicatorsState source={indicators.source} />
      ) : (
        <>
          {showManagementOverview && (
            <IndicatorsVisualOverview report={report} />
          )}

          {showAdvancedEmptyState ? (
            <EmptyIndicatorsState
              source={indicators.source === "fallback" ? "fallback" : "empty"}
              hasFallbackReport={indicators.source === "fallback"}
            />
          ) : (
            <>
              <ExecutiveSummaryCard report={report} />

              {viewMode === "management" && (
                <OperationalHealthHero
                  report={report}
                  primaryRecommendation={recommendations[0]}
                />
              )}

              <MetricCardGrid metrics={getKpiCards(report)} />

              {viewMode === "analysis" ? (
                <AnalysisCockpit
                  report={report}
                  recommendations={recommendations}
                />
              ) : (
                <ExecutiveCockpit
                  report={report}
                  recommendations={recommendations}
                  presentation={viewMode === "presentation"}
                />
              )}
            </>
          )}

          <Alert data-print-break-inside className="border-dashed">
            <Activity className="h-4 w-4" />
            <AlertTitle>Leitura analítica, sem mutação</AlertTitle>
            <AlertDescription>
              {report.limitations.join(" ")} Este cockpit não altera status,
              responsável, prazo ou notificações. A exportação é gerencial e não
              substitui relatório formal de auditoria.
            </AlertDescription>
          </Alert>
        </>
      )}
    </MeetingModeLayout>
  );
}

function ExecutiveCockpit({
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
        <BottleneckBarChart report={report} />
        <ResponsibleRiskPanel report={report} />
      </section>

      <section
        aria-label="Fluxo e intensidade operacional"
        className="grid gap-4 2xl:grid-cols-[1.35fr_0.65fr]"
      >
        <OperationalFlowPanel report={report} />
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

      <OperationalRecommendations recommendations={recommendations} />
    </>
  );
}

function AnalysisCockpit({
  report,
  recommendations,
}: {
  report: OperationalIndicatorsReport;
  recommendations: OperationalIndicatorsReport["recommendations"];
}) {
  return (
    <>
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

      <IndicatorSectionTabs report={report} />
      <OperationalRecommendations recommendations={recommendations} />
    </>
  );
}

function IndicatorsLoadingState() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-14 rounded-xl" />
      <Skeleton className="h-56 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-44 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}
