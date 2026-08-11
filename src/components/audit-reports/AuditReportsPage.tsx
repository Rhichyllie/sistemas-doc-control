import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { AuditExportBar } from "@/components/audit-reports/AuditExportBar";
import { AuditExportHistory } from "@/components/audit-reports/AuditExportHistory";
import { AuditReportBuilder } from "@/components/audit-reports/AuditReportBuilder";
import { AuditReportPreview } from "@/components/audit-reports/AuditReportPreview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuditReports } from "@/hooks/useAuditReports";
import { useOperationalIndicators } from "@/hooks/useOperationalIndicators";
import {
  ExecutiveDashboardSection,
} from "@/components/indicators/ExecutiveDashboardSection";
import {
  IndicatorExportBar,
  type IndicatorPrintOrientation,
} from "@/components/indicators/IndicatorExportBar";
import { IndicatorFilterBar } from "@/components/indicators/IndicatorFilterBar";
import { MeetingModeLayout } from "@/components/indicators/MeetingModeLayout";
import { EmptyIndicatorsState } from "@/components/indicators/EmptyIndicatorsState";
import {
  hasOperationalIndicatorData,
  type IndicatorViewMode,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

const REPORT_VIEW_KEY = "tramita.reports.viewMode";
const REPORT_PRINT_KEY = "tramita.reports.printOrientation";

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function AuditReportsPage() {
  const reports = useAuditReports();
  const indicators = useOperationalIndicators();
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
  const [viewMode, setViewMode] = useState<IndicatorViewMode>("management");
  const [printOrientation, setPrintOrientation] =
    useState<IndicatorPrintOrientation>("landscape");

  useEffect(() => {
    try {
      const storedView = localStorage.getItem(REPORT_VIEW_KEY);
      const storedPrint = localStorage.getItem(REPORT_PRINT_KEY);
      if (
        storedView === "management" ||
        storedView === "presentation" ||
        storedView === "analysis"
      ) {
        setViewMode(storedView);
      }
      if (
        storedPrint === "landscape" ||
        storedPrint === "portrait"
      ) {
        setPrintOrientation(storedPrint);
      }
    } catch {
      // usa o fallback se storage indisponível
    }
  }, []);

  useEffect(() => {
    if (requestedMode) {
      setViewMode(requestedMode);
    }
  }, [requestedMode]);

  const report = indicators.report;
  const hasData = report ? hasOperationalIndicatorData(report) : false;
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
      localStorage.setItem(REPORT_VIEW_KEY, mode);
    } catch {
      // ignora
    }
    void navigate({
      to: pathname,
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        view: mode === "management" ? undefined : mode,
      }),
      replace: true,
    });
  }

  function changePrintOrientation(orientation: IndicatorPrintOrientation) {
    setPrintOrientation(orientation);
    try {
      localStorage.setItem(REPORT_PRINT_KEY, orientation);
    } catch {
      // ignora
    }
  }

  return (
    <div className="space-y-6">
      <header
        data-print-hidden
        className="rounded-2xl border bg-gradient-to-br from-primary/[0.07] via-background to-background p-5 md:p-7"
      >
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Auditoria formal</Badge>
              <Badge
                variant={
                  reports.schemaState === "available" ? "default" : "secondary"
                }
              >
                {reports.schemaState === "available"
                  ? "Ciclo 26 disponível"
                  : "Modo de compatibilidade"}
              </Badge>
              {report && viewMode === "presentation" && (
                <Badge variant="secondary">Modo reunião</Badge>
              )}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Relatórios
            </h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Dashboard executivo, pacotes formais de auditoria, evidências e
              integridade técnica.
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
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/authenticated/indicadores">
                <Activity className="mr-2 h-4 w-4" />
                Indicadores
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/authenticated/documentos/central">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Central
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/authenticated/configuracoes">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Configurações
              </Link>
            </Button>
            {report && (
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
            )}
          </div>
        </div>
      </header>

      <MeetingModeLayout
        mode={viewMode}
        report={report as OperationalIndicatorsReport | null}
        printOrientation={printOrientation}
      >
        {report && (
          <IndicatorExportBar
            report={report}
            mode={viewMode}
            onModeChange={changeViewMode}
            printOrientation={printOrientation}
            onPrintOrientationChange={changePrintOrientation}
          />
        )}

        {report && viewMode !== "presentation" && (
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
              {indicators.error}
            </AlertDescription>
          </Alert>
        )}

        {!report ? (
          <EmptyIndicatorsState source={indicators.source} />
        ) : !hasData && viewMode !== "management" ? (
          <EmptyIndicatorsState
            source={indicators.source === "fallback" ? "fallback" : "empty"}
            hasFallbackReport={indicators.source === "fallback"}
          />
        ) : (
          <ExecutiveDashboardSection
            report={report}
            recommendations={recommendations}
            viewMode={viewMode}
          />
        )}
      </MeetingModeLayout>

      {reports.schemaState === "not_installed" && (
        <Alert data-print-hidden>
          <FileCheck2 className="h-4 w-4" />
          <AlertTitle>Exportação formal ainda não instalada</AlertTitle>
          <AlertDescription>
            Aplique manualmente o ciclo `26_TRAMITA_audit_reports_export`. A
            trilha existente continua disponível, mas não é apresentada como
            pacote formal.
            <Button asChild variant="link" className="ml-1 h-auto p-0">
              <Link to="/authenticated/trilha-de-auditoria">
                Abrir trilha atual
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {(reports.error || reports.warning || reports.hashError) && (
        <Alert
          data-print-hidden
          variant={
            reports.error || reports.hashError ? "destructive" : "default"
          }
        >
          <AlertTitle>
            {reports.error || reports.hashError
              ? "Relatório indisponível"
              : "Atenção"}
          </AlertTitle>
          <AlertDescription>
            {reports.error ?? reports.hashError ?? reports.warning}
          </AlertDescription>
        </Alert>
      )}

      <AuditReportBuilder
        filters={reports.filters}
        options={reports.options}
        canViewOrganization={reports.canViewOrganization}
        isGenerating={reports.isGenerating}
        onChange={reports.setFilters}
        onGenerate={() => void reports.generate()}
      />

      {reports.report ? (
        <>
          <AuditExportBar
            report={reports.report}
            integrityHash={reports.integrityHash}
            isHashing={reports.isHashing}
            registrationAvailable={reports.registrationAvailable}
            onRegister={reports.registerExport}
          />
          <AuditReportPreview
            report={reports.report}
            integrityHash={reports.integrityHash}
            isHashing={reports.isHashing}
          />
        </>
      ) : (
        <Card data-print-hidden>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Preview formal
            </CardTitle>
            <CardDescription>
              O preview será exibido após a geração segura do pacote.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Selecione o tipo, período e escopo para gerar o relatório.
            </div>
          </CardContent>
        </Card>
      )}

      <AuditExportHistory
        history={reports.history}
        isLoading={reports.isHistoryLoading}
        available={reports.registrationAvailable}
      />
    </div>
  );
}

