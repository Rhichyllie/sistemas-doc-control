import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  FileClock,
  FileSearch,
  FileText,
  Layers3,
  TimerReset,
} from "lucide-react";
import * as RechartsPrimitive from "recharts";
import { useAuthContext } from "@/contexts/AuthContext";
import { useDashboard } from "@/hooks/useDashboard";
import { useOperationalCockpit } from "@/hooks/useOperationalCockpit";
import {
  formatCount,
  formatDurationHours,
  formatPercent,
  getSlaDistribution,
  type IndicatorTone,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const MONTHLY_CHART_CONFIG = {
  created: { label: "Criados", color: "#22c55e" },
  published: { label: "Publicados", color: "#3b82f6" },
  review_due: { label: "Revisões", color: "#ef4444" },
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getFlowTone(value: number | null): IndicatorTone {
  if (value === null) return "neutral";
  if (value >= 85) return "positive";
  if (value >= 65) return "attention";
  return "critical";
}

function toneClass(tone: IndicatorTone) {
  if (tone === "positive") return "text-emerald-600";
  if (tone === "attention") return "text-amber-600";
  if (tone === "critical") return "text-rose-600";
  return "text-slate-600";
}

function toneTrackClass(tone: IndicatorTone) {
  if (tone === "positive") return "bg-emerald-500";
  if (tone === "attention") return "bg-amber-500";
  if (tone === "critical") return "bg-rose-500";
  return "bg-slate-400";
}

function GaugeCard({ report }: { report: OperationalIndicatorsReport }) {
  const flowValue = report.sla.complianceRate ?? report.tramites.completionRate;
  const safeValue = Math.max(0, Math.min(flowValue ?? 0, 100));
  const angle = -110 + safeValue * 2.2;
  const tone = getFlowTone(flowValue);
  const toneLabel =
    tone === "positive"
      ? "Bom"
      : tone === "attention"
        ? "Atenção"
        : tone === "critical"
          ? "Crítico"
          : "Sem base";

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Indicador do Fluxo</CardTitle>
        <CardDescription>
          Leitura consolidada do fluxo com base em SLA e execução.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 240 150" className="h-44 w-full max-w-[260px]">
            <path
              d="M 42 120 A 78 78 0 0 1 84 53"
              fill="none"
              stroke="#ef4444"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <path
              d="M 84 53 A 78 78 0 0 1 156 53"
              fill="none"
              stroke="#facc15"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <path
              d="M 156 53 A 78 78 0 0 1 198 120"
              fill="none"
              stroke="#22c55e"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <g transform={`rotate(${angle} 120 120)`}>
              <line
                x1="120"
                y1="120"
                x2="120"
                y2="56"
                stroke="#0f172a"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </g>
            <circle cx="120" cy="120" r="8" fill="#0f172a" />
          </svg>
          <div className="mt-[-8px] flex w-full max-w-[240px] items-center justify-between px-2 text-[11px] font-medium">
            <span className="text-rose-600">Crítico</span>
            <span className="text-amber-600">Atenção</span>
            <span className="text-emerald-600">Bom</span>
          </div>
          <div className={cn("mt-2 text-sm font-semibold", toneClass(tone))}>
            {flowValue === null ? "Sem base" : `${Math.round(safeValue)}% · ${toneLabel}`}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
          <div className="rounded-xl bg-rose-50 px-2 py-2 text-rose-700">
            {formatCount(report.summary.overdueSteps)}
            <div className="mt-1 text-[11px] text-rose-600">Vencidas</div>
          </div>
          <div className="rounded-xl bg-amber-50 px-2 py-2 text-amber-700">
            {formatCount(report.summary.dueSoonSteps)}
            <div className="mt-1 text-[11px] text-amber-600">Próximas</div>
          </div>
          <div className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-700">
            {formatCount(report.tramites.completedStepsInPeriod)}
            <div className="mt-1 text-[11px] text-emerald-600">Concluídas</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewMetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accentClass,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof FileText;
  accentClass: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            accentClass,
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function DistributionList({
  title,
  description,
  items,
  itemKey,
}: {
  title: string;
  description: string;
  items: Array<{ label: string; count: number }>;
  itemKey: string;
}) {
  const maximum = Math.max(...items.map((item) => item.count), 1);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? (
          items.map((item, index) => (
            <div key={`${itemKey}-${item.label}-${index}`} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-slate-700">{item.label}</span>
                <span className="font-medium text-slate-500">
                  {item.count}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2563eb] to-[#06b6d4]"
                  style={{
                    width: `${Math.max((item.count / maximum) * 100, 6)}%`,
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">
            Ainda não há dados suficientes para distribuir este indicador.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SlaSummary({ report }: { report: OperationalIndicatorsReport }) {
  const rows = [
    {
      label: "Compliance de SLA",
      value: formatPercent(report.sla.complianceRate),
      tone: getFlowTone(report.sla.complianceRate),
    },
    {
      label: "Tempo medio de etapa",
      value: formatDurationHours(report.tramites.averageStepCycleHours),
      tone: "neutral" as const,
    },
    {
      label: "Tempo medio de fluxo",
      value: formatDurationHours(report.tramites.averageInstanceCycleHours),
      tone: "neutral" as const,
    },
    {
      label: "Etapas vencidas",
      value: formatCount(report.summary.overdueSteps),
      tone:
        (report.summary.overdueSteps ?? 0) > 0 ? ("critical" as const) : ("positive" as const),
    },
    {
      label: "Evidencias pendentes",
      value: formatCount(report.summary.pendingEvidenceSteps),
      tone:
        (report.summary.pendingEvidenceSteps ?? 0) > 0
          ? ("attention" as const)
          : ("positive" as const),
    },
  ];

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">SLA Geral</CardTitle>
        <CardDescription>
          Leitura gerencial consolidada dos prazos e da resposta operacional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3"
          >
            <span className="text-sm text-slate-600">{row.label}</span>
            <span className={cn("text-sm font-semibold", toneClass(row.tone))}>
              {row.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AttentionPanel({ report }: { report: OperationalIndicatorsReport }) {
  const items = [
    {
      label: "No prazo",
      value: report.sla.onTime ?? 0,
      tone: "positive" as const,
      total: report.sla.totalItemsWithDueDate ?? 0,
    },
    {
      label: "Proximos do vencimento",
      value: report.sla.dueSoon ?? 0,
      tone: "attention" as const,
      total: report.sla.totalItemsWithDueDate ?? 0,
    },
    {
      label: "Vencidos",
      value: report.sla.overdue ?? 0,
      tone: "critical" as const,
      total: report.sla.totalItemsWithDueDate ?? 0,
    },
    {
      label: "Escalonamentos",
      value: report.summary.openEscalations ?? 0,
      tone:
        (report.summary.openEscalations ?? 0) > 0
          ? ("critical" as const)
          : ("positive" as const),
      total: Math.max(
        report.summary.openEscalations ?? 0,
        report.notifications.unread ?? 0,
        1,
      ),
    },
  ];

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Painel de Atenção</CardTitle>
        <CardDescription>
          Onde a operação está saudável, pressionada ou em atraso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => {
          const denominator = Math.max(item.total, item.value, 1);
          const percent = Math.min(100, Math.round((item.value / denominator) * 100));
          return (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">{item.label}</span>
                <span className={cn("font-semibold", toneClass(item.tone))}>
                  {formatCount(item.value)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn("h-full rounded-full", toneTrackClass(item.tone))}
                  style={{ width: `${Math.max(percent, item.value > 0 ? 8 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MonthlyTrendCard({
  points,
}: {
  points: Array<{
    month: string;
    label: string;
    created: number;
    published: number;
    review_due: number;
  }>;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Evolução Mensal de Documentos</CardTitle>
        <CardDescription>
          Criados, publicados e revisões previstas nos ultimos meses.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={MONTHLY_CHART_CONFIG}
          className="h-[300px] w-full"
        >
          <RechartsPrimitive.LineChart data={points}>
            <RechartsPrimitive.CartesianGrid vertical={false} />
            <RechartsPrimitive.XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
            />
            <RechartsPrimitive.YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelKey="label"
                  indicator="line"
                />
              }
            />
            <RechartsPrimitive.Line
              type="monotone"
              dataKey="created"
              stroke="var(--color-created)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <RechartsPrimitive.Line
              type="monotone"
              dataKey="published"
              stroke="var(--color-published)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <RechartsPrimitive.Line
              type="monotone"
              dataKey="review_due"
              stroke="var(--color-review_due)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </RechartsPrimitive.LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function RecentActivitiesCard() {
  const cockpit = useOperationalCockpit();

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Atividades Recentes</CardTitle>
        <CardDescription>
          Ultimas movimentacoes detectadas no sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cockpit.isLoading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))
        ) : cockpit.recentActivities.length ? (
          cockpit.recentActivities.slice(0, 5).map((activity) => {
            const content = (
              <div className="rounded-xl border border-slate-100 px-3 py-3 transition-colors hover:bg-slate-50">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {activity.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {activity.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                      <span>{formatDateTime(activity.createdAt)}</span>
                      {activity.actorName && <span>{activity.actorName}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );

            return activity.documentId ? (
              <Link
                key={activity.id}
                to="/authenticated/documents/$documentId"
                params={{ documentId: activity.documentId }}
                className="block"
              >
                {content}
              </Link>
            ) : (
              <div key={activity.id}>{content}</div>
            );
          })
        ) : (
          <p className="text-sm text-slate-500">
            Ainda nao houve movimentacoes suficientes para listar atividades recentes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function IndicatorsVisualOverview({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const { profile } = useAuthContext();
  const dashboard = useDashboard();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "Usuario";
  const currentDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const headlineMetrics = dashboard.metrics
    ? [
        {
          label: "Total de documentos",
          value: dashboard.metrics.total,
          hint: "Volume total do acervo",
          icon: FileText,
          accentClass: "bg-sky-50 text-sky-600",
        },
        {
          label: "Em analise",
          value: dashboard.metrics.in_review,
          hint: "Documentos em revisao",
          icon: FileSearch,
          accentClass: "bg-amber-50 text-amber-600",
        },
        {
          label: "Em aprovacao",
          value: dashboard.metrics.pending_approval,
          hint: "Aguardando decisao",
          icon: CheckCircle2,
          accentClass: "bg-emerald-50 text-emerald-600",
        },
        {
          label: "Publicados",
          value: dashboard.metrics.published,
          hint: "Ja aprovados e vigentes",
          icon: BadgeCheck,
          accentClass: "bg-blue-50 text-blue-600",
        },
        {
          label: "Atrasados",
          value:
            (report.summary.overdueSteps ?? 0) + (report.summary.overdueReviews ?? 0),
          hint: "Fluxo e revisoes vencidas",
          icon: AlertTriangle,
          accentClass: "bg-rose-50 text-rose-600",
        },
        {
          label: "Revisoes em 30 dias",
          value: dashboard.metrics.expiring_30_days,
          hint: "Publicados com revisao proxima",
          icon: TimerReset,
          accentClass: "bg-violet-50 text-violet-600",
        },
      ]
    : [];

  const areaItems = dashboard.metrics?.by_area
    .slice(0, 5)
    .map((item) => ({
      label: item.area || "Sem area",
      count: item.count,
    })) ?? [];

  const typeItems = dashboard.metrics?.by_type
    .slice(0, 5)
    .map((item) => ({
      label: item.doc_type || "Sem tipo",
      count: item.count,
    })) ?? [];

  const distribution = getSlaDistribution(report);

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#071d3d] via-[#0b2f63] to-[#0f766e] p-6 text-white shadow-[0_0_30px_rgba(15,23,42,0.5)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-100/85">
              Bem-vindo(a), {firstName}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Dashboard Operacional
            </h2>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-blue-100/85">
            {currentDate.charAt(0).toUpperCase() + currentDate.slice(1)}
          </div>
        </div>
      </div>

      {dashboard.error && (
        <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{dashboard.error}</span>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {dashboard.loading && !dashboard.metrics
          ? Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-[104px] rounded-2xl" />
            ))
          : headlineMetrics.map((metric) => (
              <OverviewMetricCard key={metric.label} {...metric} />
            ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {dashboard.loading && !dashboard.metrics ? (
          <>
            <Skeleton className="h-[340px] rounded-2xl" />
            <Skeleton className="h-[340px] rounded-2xl" />
          </>
        ) : (
          <>
            <GaugeCard report={report} />
            <SlaSummary report={report} />
          </>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {dashboard.loading && !dashboard.metrics ? (
          <>
            <Skeleton className="h-[250px] rounded-2xl" />
            <Skeleton className="h-[250px] rounded-2xl" />
            <Skeleton className="h-[250px] rounded-2xl" />
          </>
        ) : (
          <>
            <DistributionList
              title="Documentos por Area"
              description="Concentracao documental por contexto de trabalho."
              items={areaItems}
              itemKey="area"
            />
            <DistributionList
              title="Documentos por Tipo"
              description="Volume por tipo documental cadastrado no sistema."
              items={typeItems}
              itemKey="type"
            />
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Desempenho de SLA</CardTitle>
                <CardDescription>
                  Distribuicao do recorte atual com base nos itens com prazo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {distribution.map((item) => (
                  <div key={item.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-700">{item.label}</span>
                      <span className={cn("font-semibold", toneClass(item.tone))}>
                        {item.value}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          toneTrackClass(item.tone),
                        )}
                        style={{
                          width: `${Math.max(
                            report.sla.totalItemsWithDueDate
                              ? Math.round(
                                  (item.value / report.sla.totalItemsWithDueDate) *
                                    100,
                                )
                              : 0,
                            item.value > 0 ? 8 : 0,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <AttentionPanel report={report} />
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        {dashboard.loading && !dashboard.metrics ? (
          <>
            <Skeleton className="h-[390px] rounded-2xl" />
            <Skeleton className="h-[390px] rounded-2xl" />
          </>
        ) : (
          <>
            <MonthlyTrendCard points={dashboard.metrics?.monthly_trend ?? []} />
            <RecentActivitiesCard />
          </>
        )}
      </section>
    </section>
  );
}
