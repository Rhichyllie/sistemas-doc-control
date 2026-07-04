import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { EmptyIndicatorsState } from "@/components/indicators/EmptyIndicatorsState";
import { IndicatorFilterBar } from "@/components/indicators/IndicatorFilterBar";
import { IndicatorSectionTabs } from "@/components/indicators/IndicatorSectionTabs";
import { MetricCardGrid } from "@/components/indicators/MetricCardGrid";
import { OperationalHealthHero } from "@/components/indicators/OperationalHealthHero";
import { OperationalRecommendations } from "@/components/indicators/OperationalRecommendations";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOperationalIndicators } from "@/hooks/useOperationalIndicators";
import {
  getIndicatorsSourceMessage,
  getKpiCards,
  hasOperationalIndicatorData,
} from "@/lib/operationalIndicators";

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

  if (indicators.isLoading && !report) {
    return <IndicatorsLoadingState />;
  }

  const hasData = report ? hasOperationalIndicatorData(report) : false;
  const recommendations = report
    ? [...report.recommendations].sort((left, right) => {
        const weight = { critical: 0, warning: 1, info: 2 };
        return weight[left.severity] - weight[right.severity];
      })
    : [];

  return (
    <div className="space-y-5 md:space-y-6">
      <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.075] via-background to-background p-5 md:p-7">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Cockpit de gestão</Badge>
              <Badge
                variant={indicators.source === "rpc" ? "default" : "secondary"}
              >
                {SOURCE_LABEL[indicators.source]}
              </Badge>
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
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/authenticated/documentos/central">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Central Documental
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/authenticated/configuracoes/diagnostico">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Diagnóstico
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
        </div>
      </header>

      <IndicatorFilterBar
        filters={indicators.filters}
        onChange={indicators.setFilters}
        canViewOrganization={indicators.canViewOrganization}
        dimensions={indicators.dimensions}
      />

      {(indicators.warning || (indicators.error && report)) && (
        <Alert variant={indicators.error ? "destructive" : "default"}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {indicators.error ? "Leitura parcial" : "Modo de compatibilidade"}
          </AlertTitle>
          <AlertDescription>
            {indicators.error ?? indicators.warning}{" "}
            {getIndicatorsSourceMessage(indicators.source)}
          </AlertDescription>
        </Alert>
      )}

      {!report ? (
        <EmptyIndicatorsState source={indicators.source} />
      ) : !hasData ? (
        <EmptyIndicatorsState
          source={indicators.source === "fallback" ? "fallback" : "empty"}
          hasFallbackReport={indicators.source === "fallback"}
        />
      ) : (
        <>
          <OperationalHealthHero
            report={report}
            primaryRecommendation={recommendations[0]}
          />

          <MetricCardGrid metrics={getKpiCards(report)} />

          <IndicatorSectionTabs report={report} />

          <OperationalRecommendations recommendations={recommendations} />

          <Alert className="border-dashed">
            <Activity className="h-4 w-4" />
            <AlertTitle>Leitura analítica, sem mutação</AlertTitle>
            <AlertDescription>
              {report.limitations.join(" ")} Este cockpit não altera status,
              responsável, prazo ou notificações.
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}

function IndicatorsLoadingState() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-14 rounded-xl" />
      <Skeleton className="h-72 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-44 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
