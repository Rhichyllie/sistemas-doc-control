import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  FileCheck2,
  LayoutDashboard,
  MonitorUp,
  Printer,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { EmptyIndicatorsState } from "@/components/indicators/EmptyIndicatorsState";
import {
  IndicatorExportBar,
  type IndicatorPrintOrientation,
} from "@/components/indicators/IndicatorExportBar";
import { IndicatorFilterBar } from "@/components/indicators/IndicatorFilterBar";
import { MeetingModeLayout } from "@/components/indicators/MeetingModeLayout";
import { IndicatorsVisualOverview } from "@/components/indicators/IndicatorsVisualOverview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOperationalIndicators } from "@/hooks/useOperationalIndicators";
import { OperationalHealthHero } from "@/components/indicators/OperationalHealthHero";
import { TrendComparisonPanel } from "@/components/indicators/TrendComparisonPanel";
import { RiskMatrixPanel } from "@/components/indicators/RiskMatrixPanel";
import { BottleneckBarChart } from "@/components/indicators/BottleneckBarChart";
import { OperationalHeatmapPanel } from "@/components/indicators/OperationalHeatmapPanel";
import { NotificationSignalPanel } from "@/components/indicators/NotificationSignalPanel";
import { DelegationImpactPanel } from "@/components/indicators/DelegationImpactPanel";
import { DocumentQualityRadar } from "@/components/indicators/DocumentQualityRadar";
import { IndicatorSectionTabs } from "@/components/indicators/IndicatorSectionTabs";
import { OperationalRecommendations } from "@/components/indicators/OperationalRecommendations";
import {
  getIndicatorsSourceMessage,
  hasOperationalIndicatorData,
  type IndicatorViewMode,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

const VIEW_MODE_KEY = "tramita.indicators.viewMode";
const PRINT_ORIENTATION_KEY = "tramita.indicators.printOrientation";

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
  const [printOrientation, setPrintOrientation] =
    useState<IndicatorPrintOrientation>("landscape");
  const navigate = useNavigate();
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      searchStr: state.location.searchStr,
    }),
  });
  const pathname = location.pathname;
  const requestedView = new URLSearchParams(location.searchStr).get("view");
  const rawRequestedMode =
    requestedView === "management" ||
    requestedView === "presentation" ||
    requestedView === "analysis"
      ? requestedView
      : null;
  const requestedMode =
    rawRequestedMode === "analysis" ? "management" : rawRequestedMode;
  const isLibraryIndicatorsRoute = /^\/authenticated\/biblioteca\/[^/]+\/indicadores\/?$/.test(
    pathname,
  );

  useEffect(() => {
    try {
      const storedOrientation = localStorage.getItem(PRINT_ORIENTATION_KEY);
      if (
        storedOrientation === "landscape" ||
        storedOrientation === "portrait"
      ) {
        setPrintOrientation(storedOrientation);
      }
    } catch {
      // A orientação padrão segue como paisagem quando o storage não estiver disponível.
    }
  }, []);

  useEffect(() => {
    if (requestedMode) {
      setViewMode(requestedMode);
      if (rawRequestedMode === "analysis") {
        void navigate({
          to: pathname,
          search: (previous: Record<string, unknown>) => {
            const next = { ...previous };
            delete next.view;
            return next;
          },
          replace: true,
        });
      }
      return;
    }

    if (isLibraryIndicatorsRoute) {
      setViewMode("management");
      return;
    }

    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      if (stored === "management" || stored === "presentation") {
        setViewMode(stored);
      } else if (stored === "analysis") {
        setViewMode("management");
        localStorage.setItem(VIEW_MODE_KEY, "management");
      }
    } catch {
      // Estado local é opcional; o modo Gestão permanece como fallback.
    }
  }, [isLibraryIndicatorsRoute, requestedMode]);

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
    void navigate({
      to: pathname,
      search: (previous: Record<string, unknown>) => {
        const next = { ...previous };
        if (mode === "management" && isLibraryIndicatorsRoute) {
          delete next.view;
        } else {
          next.view = mode;
        }
        return next;
      },
      replace: true,
    });
  }

  function changePrintOrientation(orientation: IndicatorPrintOrientation) {
    setPrintOrientation(orientation);
    try {
      localStorage.setItem(PRINT_ORIENTATION_KEY, orientation);
    } catch {
      // A seleção permanece funcional sem persistência local.
    }
  }

  if (indicators.isLoading && !report) {
    return <IndicatorsLoadingState />;
  }

  const hasData = report ? hasOperationalIndicatorData(report) : false;
  const showManagementOverview = Boolean(
    report && viewMode === "management",
  );
  return (
    <MeetingModeLayout
      mode={viewMode}
      report={report}
      printOrientation={printOrientation}
    >
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
              <Button asChild variant="outline">
                <Link to="/authenticated/auditoria/relatorios">
                  <FileCheck2 className="mr-2 h-4 w-4" />
                  Relatórios
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

      {viewMode === "presentation" && (
        <div
          data-presentation-exit-fab
          data-print-hidden
          className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/90 px-3 py-2 shadow-[0_18px_50px_rgba(2,6,23,0.7)] backdrop-blur-md">
            <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20 border-0">
              Modo Apresentação
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
              onClick={() => window.print()}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => {
                try {
                  if (document.exitFullscreen && document.fullscreenElement) {
                    void document.exitFullscreen().catch(() => undefined);
                  }
                } catch {
                  // ignore
                }
                changeViewMode("management");
              }}
            >
              <X className="mr-1.5 h-4 w-4" />
              Sair
            </Button>
          </div>
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
          <IndicatorsVisualOverview report={report} />

          {viewMode === "analysis" ? (
            <>
              <OperationalHealthHero
                report={report}
                primaryRecommendation={recommendations[0]}
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
          ) : (
            <>
              <Alert data-print-break-inside className="border-dashed">
                <Activity className="h-4 w-4" />
                <AlertTitle>Leitura gerencial consolidada</AlertTitle>
                <AlertDescription>
                  {report.limitations.join(" ")} Para exportação formal, utilize
                  a tela de Relatórios.
                </AlertDescription>
                {viewMode !== "presentation" ? (
                  <div data-print-hidden className="mt-3 flex flex-wrap gap-2">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                    >
                      <Link to="/authenticated/auditoria/relatorios">
                        <FileCheck2 className="mr-2 h-4 w-4" />
                        Exportação executiva em Relatórios
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </Alert>
            </>
          )}
        </>
      )}
    </MeetingModeLayout>
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
