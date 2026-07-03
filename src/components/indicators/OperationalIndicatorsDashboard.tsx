import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CalendarX2,
  CheckCircle2,
  Clock3,
  FileQuestion,
  FileStack,
  Gauge,
  GitPullRequestArrow,
  RefreshCw,
  ShieldCheck,
  UserRoundX,
  Workflow,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BottleneckTable } from "@/components/indicators/BottleneckTable";
import { IndicatorFilterBar } from "@/components/indicators/IndicatorFilterBar";
import { IndicatorKpiCard } from "@/components/indicators/IndicatorKpiCard";
import { OperationalRecommendations } from "@/components/indicators/OperationalRecommendations";
import { SlaOverviewPanel } from "@/components/indicators/SlaOverviewPanel";
import { useOperationalIndicators } from "@/hooks/useOperationalIndicators";
import {
  calculateTrend,
  formatCycleTime,
  getIndicatorsSourceMessage,
} from "@/lib/operationalIndicators";

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function trendLabel(current: number | null, previous: number | null) {
  const trend = calculateTrend(current, previous);
  if (trend === null) return "Sem base comparável";
  if (trend === 0) return "Estável contra período anterior";
  return `${trend > 0 ? "+" : ""}${trend}% contra período anterior`;
}

export function OperationalIndicatorsDashboard() {
  const indicators = useOperationalIndicators();
  const report = indicators.report;

  if (indicators.isLoading && !report) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-44" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">P-26</Badge>
            <Badge
              variant={indicators.source === "rpc" ? "default" : "secondary"}
            >
              {indicators.source === "rpc"
                ? "Fonte consolidada"
                : "Modo compatível"}
            </Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            Indicadores Operacionais
          </h1>
          <p className="mt-1 text-muted-foreground">
            SLA, gargalos, throughput e risco documental com próxima ação
            explícita.
          </p>
          {report && (
            <p className="mt-2 text-xs text-muted-foreground">
              Gerado em {formatGeneratedAt(report.generatedAt)} · período de{" "}
              {report.period.from} a {report.period.to}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/authenticated/configuracoes/diagnostico">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Diagnóstico
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => void indicators.refresh()}
            disabled={indicators.isLoading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${indicators.isLoading ? "animate-spin" : ""}`}
            />
            Atualizar leitura
          </Button>
        </div>
      </header>

      {(indicators.warning || indicators.error) && (
        <Alert variant={indicators.error ? "destructive" : "default"}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {indicators.error
              ? "Indicadores indisponíveis"
              : "Leitura limitada"}
          </AlertTitle>
          <AlertDescription>
            {indicators.error ?? indicators.warning}
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Gauge className="h-4 w-4" />
        <AlertTitle>Estado da fonte de dados</AlertTitle>
        <AlertDescription>
          {getIndicatorsSourceMessage(indicators.source)} Nenhum indicador
          altera status, responsável, prazo ou notificação.
        </AlertDescription>
      </Alert>

      <IndicatorFilterBar
        filters={indicators.filters}
        onChange={indicators.setFilters}
        canViewOrganization={indicators.canViewOrganization}
        dimensions={indicators.dimensions}
      />

      {!report ? (
        <Card>
          <CardHeader>
            <CardTitle>Sem leitura disponível</CardTitle>
            <CardDescription>
              Ajuste o escopo ou consulte o Diagnóstico Operacional para
              verificar ciclo e permissões.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <section>
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Saúde operacional</h2>
              <p className="text-sm text-muted-foreground">
                Indicadores de ação. Cada card explica o risco que representa.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <IndicatorKpiCard
                title="Documentos ativos"
                value={report.summary.activeDocuments}
                description="Acervo em operação, excluindo documentos obsoletos."
                icon={FileStack}
                badge={trendLabel(
                  report.trends.documentsCreatedCurrent,
                  report.trends.documentsCreatedPrevious,
                )}
                actionUrl="/authenticated/documents"
              />
              <IndicatorKpiCard
                title="Etapas vencidas"
                value={report.summary.overdueSteps}
                description="Etapas ativas cujo prazo persistido já venceu."
                icon={CalendarX2}
                tone={
                  (report.summary.overdueSteps ?? 0) > 0
                    ? "critical"
                    : "success"
                }
                actionUrl="/authenticated/documentos/central"
              />
              <IndicatorKpiCard
                title="Compliance de SLA"
                value={
                  report.sla.complianceRate === null
                    ? null
                    : `${report.sla.complianceRate}%`
                }
                description="Itens dentro do prazo entre os que possuem vencimento."
                icon={CheckCircle2}
                tone={
                  (report.sla.complianceRate ?? 100) < 80
                    ? "warning"
                    : "success"
                }
                actionUrl="/authenticated/configuracoes/calendario"
              />
              <IndicatorKpiCard
                title="Tempo médio de ciclo"
                value={formatCycleTime(
                  report.tramites.averageInstanceCycleHours,
                )}
                description="Tempo entre início e conclusão das instâncias no período."
                icon={Clock3}
              />
              <IndicatorKpiCard
                title="Evidências pendentes"
                value={report.summary.pendingEvidenceSteps}
                description="Etapas ativas exigindo evidência ainda não registrada."
                icon={FileQuestion}
                tone={
                  (report.summary.pendingEvidenceSteps ?? 0) > 0
                    ? "warning"
                    : "success"
                }
                actionUrl="/authenticated/documentos/central"
              />
              <IndicatorKpiCard
                title="Críticas não lidas"
                value={report.summary.criticalUnreadNotifications}
                description="Alertas críticos ainda abertos na inbox interna."
                icon={BellRing}
                tone={
                  (report.summary.criticalUnreadNotifications ?? 0) > 0
                    ? "critical"
                    : "success"
                }
                actionUrl="/authenticated/notificacoes"
              />
              <IndicatorKpiCard
                title="Escalonamentos abertos"
                value={report.summary.openEscalations}
                description="Escalonamentos que ainda exigem leitura ou tratamento."
                icon={GitPullRequestArrow}
                tone={
                  (report.summary.openEscalations ?? 0) > 0
                    ? "critical"
                    : "success"
                }
                actionUrl="/authenticated/notificacoes"
              />
              <IndicatorKpiCard
                title="Ausências impactando etapas"
                value={report.summary.unavailableResponsiblesWithActiveSteps}
                description="Titulares indisponíveis com trabalho ativo no momento."
                icon={UserRoundX}
                tone={
                  (report.summary.unavailableResponsiblesWithActiveSteps ?? 0) >
                  0
                    ? "warning"
                    : "success"
                }
                actionUrl="/authenticated/equipe"
              />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <SlaOverviewPanel sla={report.sla} />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Workflow className="h-4 w-4 text-primary" />
                  Performance dos trâmites
                </CardTitle>
                <CardDescription>
                  Vazão e tempo de ciclo do período filtrado.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <ExecutionMetric
                  label="Instâncias ativas"
                  value={report.tramites.activeInstances}
                />
                <ExecutionMetric
                  label="Concluídas"
                  value={report.tramites.completedInstancesInPeriod}
                />
                <ExecutionMetric
                  label="Etapas concluídas"
                  value={report.tramites.completedStepsInPeriod}
                />
                <ExecutionMetric
                  label="Instâncias falhadas"
                  value={report.tramites.failedInstancesInPeriod}
                  critical
                />
                <ExecutionMetric
                  label="Taxa de conclusão"
                  value={
                    report.tramites.completionRate === null
                      ? null
                      : `${report.tramites.completionRate}%`
                  }
                />
                <ExecutionMetric
                  label="Ciclo médio de etapa"
                  value={formatCycleTime(report.tramites.averageStepCycleHours)}
                />
                <ExecutionMetric
                  label="Etapas paradas"
                  value={report.tramites.stalledActiveSteps}
                  critical
                />
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="process">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="text-lg font-semibold">Onde a operação trava</h2>
                <p className="text-sm text-muted-foreground">
                  Rankings de atraso para localizar causa e responsável.
                </p>
              </div>
              <TabsList>
                <TabsTrigger value="process">Processo</TabsTrigger>
                <TabsTrigger value="context">Contexto</TabsTrigger>
                <TabsTrigger value="evidence">Evidência</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="process" className="grid gap-4 xl:grid-cols-2">
              <BottleneckTable
                title="Por etapa"
                description="Tipos de etapa com maior concentração de atrasos."
                items={report.bottlenecks.byStepType}
              />
              <BottleneckTable
                title="Por responsável"
                description="Carga vencida por responsável, sem reatribuição automática."
                items={report.bottlenecks.byResponsible}
              />
            </TabsContent>
            <TabsContent value="context" className="grid gap-4 xl:grid-cols-3">
              <BottleneckTable
                title="Por projeto"
                description="Projetos com etapas vencidas."
                items={report.bottlenecks.byProject}
              />
              <BottleneckTable
                title="Por área"
                description="Áreas com maior risco operacional."
                items={report.bottlenecks.byArea}
              />
              <BottleneckTable
                title="Por tipo documental"
                description="Tipos com maior concentração de atraso."
                items={report.bottlenecks.byDocType}
              />
            </TabsContent>
            <TabsContent value="evidence" className="grid gap-4 xl:grid-cols-2">
              <BottleneckTable
                title="Evidências pendentes"
                description="Etapas que não atendem a exigência de evidência."
                items={report.bottlenecks.evidencePending}
                countLabel="Pendência"
              />
              <BottleneckTable
                title="Etapas paradas há mais tempo"
                description="Fila ordenada por prazo e tempo de permanência."
                items={report.bottlenecks.longestStalledSteps}
                countLabel="Peso"
              />
            </TabsContent>
          </Tabs>

          <section className="grid gap-4 xl:grid-cols-3">
            <QualityCard
              title="Governança documental"
              description="Lacunas que reduzem rastreabilidade."
              rows={[
                ["Sem código", report.quality.documentsWithoutCode],
                [
                  "Sem projeto/contexto",
                  report.quality.documentsWithoutContext,
                ],
                [
                  "Sem próxima revisão",
                  report.quality.documentsWithoutNextReview,
                ],
                ["Sem política SLA", report.quality.documentsWithoutSlaPolicy],
              ]}
            />
            <QualityCard
              title="Notificações e escalonamento"
              description="Leitura da P-25; nenhuma geração é disparada aqui."
              rows={[
                ["Não lidas", report.notifications.unread],
                ["Criadas no período", report.notifications.createdInPeriod],
                [
                  "Escalonadas no período",
                  report.notifications.escalatedInPeriod,
                ],
                [
                  "Suprimidas no período",
                  report.notifications.suppressedInPeriod,
                ],
                [
                  "Erros da última geração",
                  report.notifications.lastGenerationErrors,
                ],
              ]}
            />
            <QualityCard
              title="Delegação e disponibilidade"
              description="Impacto de ausências sem mudar o responsável persistido."
              rows={[
                ["Ausências ativas", report.delegations.activeAbsences],
                ["Delegações ativas", report.delegations.activeDelegations],
                [
                  "Ações delegadas",
                  report.delegations.delegatedStepCompletions,
                ],
                [
                  "Sem substituto",
                  report.delegations.activeStepsWithoutSubstitute,
                ],
              ]}
            />
          </section>

          <OperationalRecommendations
            recommendations={report.recommendations}
          />

          <Alert>
            <Activity className="h-4 w-4" />
            <AlertTitle>Limites da leitura</AlertTitle>
            <AlertDescription>{report.limitations.join(" ")}</AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}

function ExecutionMetric({
  label,
  value,
  critical = false,
}: {
  label: string;
  value: number | string | null;
  critical?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          critical && Number(value ?? 0) > 0
            ? "mt-1 text-xl font-semibold text-destructive"
            : "mt-1 text-xl font-semibold"
        }
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

function QualityCard({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<[string, number | null]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
          >
            <span className="text-sm">{label}</span>
            <span className="font-semibold">{value ?? "—"}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
