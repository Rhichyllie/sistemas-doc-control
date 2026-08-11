import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  FileCheck2,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { EmptyIndicatorsState } from "@/components/indicators/EmptyIndicatorsState";
import {
  IndicatorExportBar,
  type IndicatorPrintOrientation,
} from "@/components/indicators/IndicatorExportBar";
import { IndicatorFilterBar } from "@/components/indicators/IndicatorFilterBar";
import { MeetingModeLayout } from "@/components/indicators/MeetingModeLayout";
import { ExecutiveDashboardSection } from "@/components/indicators/ExecutiveDashboardSection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOperationalIndicators } from "@/hooks/useOperationalIndicators";
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
  const requestedMode =
    requestedView === "management" ||
    requestedView === "presentation" ||
    requestedView === "analysis"
      ? requestedView
      : null;
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
      return;
    }

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
  const showAdvancedEmptyState = Boolean(
    report && !hasData && !showManagementOverview,
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
          printOrientation={printOrientation}
          onPrintOrientationChange={changePrintOrientation}
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
          {showAdvancedEmptyState ? (
            <EmptyIndicatorsState
              source={indicators.source === "fallback" ? "fallback" : "empty"}
              hasFallbackReport={indicators.source === "fallback"}
            />
          ) : (
            <div
              data-print-hidden
              className="rounded-2xl border border-dashed p-6 text-center"
            >
              <p className="text-sm font-medium text-muted-foreground">
                Os indicadores executivos foram movidos para a tela de Relatórios.
              </p>
              <Button
                asChild
                variant="default"
                className="mt-3"
              >
                <Link to="/authenticated/auditoria/relatorios">
                  Ir para Relatórios
                </Link>
              </Button>
            </div>
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
