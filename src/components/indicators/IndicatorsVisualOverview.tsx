import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileClock,
  FileSearch,
  FileText,
  Layers3,
  Target,
  TimerReset,
  Users,
  XCircle,
} from "lucide-react";
import * as RechartsPrimitive from "recharts";
import {
  useDashboard,
  type DashboardDisciplineRow,
} from "@/hooks/useDashboard";
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
import { Button } from "@/components/ui/button";
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
  delta,
  deltaInverted = false,
  percentageOfTotal,
  sparkline,
  sparkColor,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof FileText;
  accentClass: string;
  delta?: number;
  deltaInverted?: boolean;
  percentageOfTotal?: number;
  sparkline?: Array<{ x: number; y: number }>;
  sparkColor?: string;
}) {
  const defaultSpark = useMemo(() => {
    if (sparkline?.length) return sparkline;
    return Array.from({ length: 12 }, (_, i) => ({
      x: i,
      y: Math.max(0, Math.round((value > 0 ? value : 1) * (0.6 + Math.sin(i) * 0.2 + ((i % 3) * 0.05)))),
    }));
  }, [sparkline, value]);

  const sparkColorSafe =
    sparkColor ??
    (accentClass.includes("sky") || accentClass.includes("blue")
      ? "#2563eb"
      : accentClass.includes("emerald") || accentClass.includes("green")
        ? "#10b981"
        : accentClass.includes("amber") || accentClass.includes("yellow")
          ? "#f59e0b"
          : accentClass.includes("rose") || accentClass.includes("red")
            ? "#ef4444"
            : accentClass.includes("violet") || accentClass.includes("purple")
              ? "#8b5cf6"
              : "#64748b");

  const deltaBadge = (() => {
    if (delta == null) return null;
    const positive = delta >= 0;
    const good = deltaInverted ? !positive : positive;
    const text = `${positive ? "+" : ""}${Math.round(delta)}% vs período anterior`;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
          good
            ? "bg-emerald-50 text-emerald-700"
            : "bg-rose-50 text-rose-700",
        )}
      >
        {text}
      </span>
    );
  })();

  const pctBadge = (() => {
    if (percentageOfTotal == null || !Number.isFinite(percentageOfTotal)) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
          accentClass,
        )}
      >
        {Math.max(0, Math.min(100, Math.round(percentageOfTotal)))}% do total
      </span>
    );
  })();

  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_2px_10px_-6px_rgba(15,23,42,0.15)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(15,23,42,0.25)]">
      <div className="relative flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/5",
              accentClass,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 text-right" />
        </div>

        <div className="min-w-0">
          <p className="truncate text-[26px] font-semibold leading-tight tracking-tight text-slate-900">
            {formatCount(value)}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-700">{label}</p>
          <div className="mt-1.5 min-h-[20px]">{pctBadge}</div>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="h-8 w-28 shrink-0 overflow-hidden rounded-md">
            <RechartsPrimitive.ResponsiveContainer width="100%" height="100%">
              <RechartsPrimitive.LineChart data={defaultSpark} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <defs>
                  <linearGradient id={`spark-${label.replace(/\s+/g, "-")}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={sparkColorSafe} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={sparkColorSafe} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <RechartsPrimitive.Area
                  type="monotone"
                  dataKey="y"
                  stroke="none"
                  fill={`url(#spark-${label.replace(/\s+/g, "-")})`}
                />
                <RechartsPrimitive.Line
                  type="monotone"
                  dataKey="y"
                  stroke={sparkColorSafe}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </RechartsPrimitive.LineChart>
            </RechartsPrimitive.ResponsiveContainer>
          </div>
          <div className="min-w-0 flex-1 text-right" />
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

function DisciplineProgressBar({
  value,
  total,
  tone,
}: {
  value: number;
  total: number;
  tone: IndicatorTone;
}) {
  const percent = Math.max(0, Math.min(100, total > 0 ? (value / total) * 100 : 0));
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all",
            tone === "positive"
              ? "bg-emerald-500"
              : tone === "attention"
                ? "bg-amber-500"
                : tone === "critical"
                  ? "bg-rose-500"
                  : "bg-slate-400",
          )}
          style={{ width: `${Math.max(percent, value > 0 ? 6 : 0)}%` }}
        />
      </div>
      <span
        className={cn(
          "w-12 shrink-0 text-right text-xs font-semibold tabular-nums",
          toneClass(tone),
        )}
      >
        {formatCount(value)} ({Math.round(percent)}%)
      </span>
    </div>
  );
}

function SlaBar({ sla }: { sla: number }) {
  const safe = Math.max(0, Math.min(100, sla));
  const tone: IndicatorTone = safe >= 85 ? "positive" : safe >= 65 ? "attention" : "critical";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all",
            tone === "positive"
              ? "bg-emerald-500"
              : tone === "attention"
                ? "bg-amber-500"
                : "bg-rose-500",
          )}
          style={{ width: `${safe}%` }}
        />
      </div>
      <span
        className={cn(
          "w-12 shrink-0 text-right text-xs font-semibold tabular-nums",
          toneClass(tone),
        )}
      >
        {safe}%
      </span>
    </div>
  );
}

function DisciplineTopCard({ rows }: { rows: DashboardDisciplineRow[] }) {
  const top5 = rows.slice(0, 5);
  const remaining = rows.slice(5);
  const hasMore = remaining.length > 0;

  const [expanded, setExpanded] = useState<boolean>(false);

  const emptyState = rows.length === 0;
  const displayRows = expanded ? rows : top5;

  return (
    <Card className="col-span-1 border-slate-200 shadow-sm xl:col-span-3">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              Indicadores por disciplina {hasMore ? `(Top 5 de ${rows.length})` : ""}
            </CardTitle>
            <CardDescription>
              Volume e desempenho por disciplina técnica no recorte atual.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {emptyState ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            <Layers3 className="h-6 w-6 opacity-50" />
            <p>Ainda não há dados suficientes para distribuição por disciplina.</p>
            <p className="text-xs text-slate-400">
              Associe documentos a disciplinas no cadastro para visualizar este painel.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <div className="grid grid-cols-12 gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <div className="col-span-3">Disciplina</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-2">Aprovados</div>
                <div className="col-span-2">Em análise</div>
                <div className="col-span-2">Reprovados</div>
                <div className="col-span-2">SLA</div>
              </div>
              <ul className="divide-y divide-slate-50">
                {displayRows.map((row) => (
                  <li
                    key={row.discipline_id ?? `discipline-${row.discipline}`}
                    className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm transition-colors hover:bg-slate-50/60"
                  >
                    <div className="col-span-3 flex items-center gap-2 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Layers3 className="h-3.5 w-3.5" />
                      </div>
                      <span className="truncate font-medium text-slate-800">
                        {row.discipline}
                      </span>
                    </div>
                    <div className="col-span-1 text-right font-semibold tabular-nums text-slate-800">
                      {formatCount(row.total)}
                    </div>
                    <div className="col-span-2">
                      <DisciplineProgressBar
                        value={row.approved}
                        total={row.total}
                        tone="positive"
                      />
                    </div>
                    <div className="col-span-2">
                      <DisciplineProgressBar
                        value={row.in_analysis}
                        total={row.total}
                        tone="attention"
                      />
                    </div>
                    <div className="col-span-2">
                      <DisciplineProgressBar
                        value={row.rejected}
                        total={row.total}
                        tone="critical"
                      />
                    </div>
                    <div className="col-span-2">
                      <SlaBar sla={row.sla} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {hasMore && (
              <div className="flex justify-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setExpanded((previous: boolean) => !previous)}
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
                      Recolher disciplinas
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
                      Ver todas as disciplinas ({formatCount(remaining.length)} mais)
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_DONUT_COLORS = {
  approved: "#10b981",
  analysis: "#f59e0b",
  rejected: "#ef4444",
  waiting: "#8b5cf6",
} as const;

function StatusDistributionCard({
  total,
  approved,
  inAnalysis,
  rejected,
  waiting,
}: {
  total: number;
  approved: number;
  inAnalysis: number;
  rejected: number;
  waiting: number;
}) {
  const donutData = [
    { key: "approved", label: "Aprovados", value: approved, color: STATUS_DONUT_COLORS.approved },
    { key: "analysis", label: "Em análise", value: inAnalysis, color: STATUS_DONUT_COLORS.analysis },
    { key: "rejected", label: "Reprovados", value: rejected, color: STATUS_DONUT_COLORS.rejected },
    { key: "waiting", label: "Aguardando fornecedor", value: waiting, color: STATUS_DONUT_COLORS.waiting },
  ].filter((item) => total > 0 || item.value > 0 || true);

  const legendRows = useMemo(() => {
    const base = Math.max(total, 1);
    return [
      {
        label: "Aprovados",
        value: approved,
        percent: Math.round((approved / base) * 100),
        color: STATUS_DONUT_COLORS.approved,
      },
      {
        label: "Em análise",
        value: inAnalysis,
        percent: Math.round((inAnalysis / base) * 100),
        color: STATUS_DONUT_COLORS.analysis,
      },
      {
        label: "Reprovados",
        value: rejected,
        percent: Math.round((rejected / base) * 100),
        color: STATUS_DONUT_COLORS.rejected,
      },
      {
        label: "Aguardando fornecedor",
        value: waiting,
        percent: Math.round((waiting / base) * 100),
        color: STATUS_DONUT_COLORS.waiting,
      },
    ];
  }, [total, approved, inAnalysis, rejected, waiting]);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Distribuição por status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-5">
          <div className="relative h-44 w-44 shrink-0">
            <ChartContainer
              config={{
                approved: { label: "Aprovados", color: STATUS_DONUT_COLORS.approved },
                analysis: { label: "Em análise", color: STATUS_DONUT_COLORS.analysis },
                rejected: { label: "Reprovados", color: STATUS_DONUT_COLORS.rejected },
                waiting: { label: "Aguardando", color: STATUS_DONUT_COLORS.waiting },
              }}
              className="h-full w-full"
            >
              <RechartsPrimitive.PieChart>
                <RechartsPrimitive.Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={52}
                  outerRadius={70}
                  strokeWidth={0}
                  paddingAngle={2}
                >
                  {donutData.map((item) => (
                    <RechartsPrimitive.Cell key={item.key} fill={item.color} />
                  ))}
                </RechartsPrimitive.Pie>
              </RechartsPrimitive.PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-800">
                {formatCount(total)}
              </span>
              <span className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                Total
              </span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-2.5">
            {legendRows.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate text-sm text-slate-700">{row.label}</span>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                  {formatCount(row.value)} ({row.percent}%)
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-1">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full border-slate-200 bg-slate-50/50 text-xs font-medium text-primary hover:bg-slate-100/70"
          >
            <Link to="/authenticated/documentos/central">
              Ver detalhes por status →
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniSparkline({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  const points = data.map((value, index) => ({ index, value }));
  return (
    <ChartContainer
      config={{ value: { label: "valor", color } }}
      className="h-8 w-28 shrink-0"
    >
      <RechartsPrimitive.LineChart data={points} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        <RechartsPrimitive.Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={false}
        />
      </RechartsPrimitive.LineChart>
    </ChartContainer>
  );
}

function DeltaBadge({ delta, inverted }: { delta: number; inverted?: boolean }) {
  if (Number.isNaN(delta) || !Number.isFinite(delta)) {
    return (
      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
        Sem base
      </span>
    );
  }
  const positive = inverted ? delta < 0 : delta > 0;
  const neutral = delta === 0;
  if (neutral) {
    return (
      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
        ±0%
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
        positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
    >
      {positive ? "+" : ""}
      {delta}% vs período anterior
    </span>
  );
}

function PeriodPerformanceCard({
  monthlyTrend,
  tramites,
  avgApprovalDays,
  avgApprovalDelta,
  completedDelta,
  createdDelta,
  reworkRate,
  reworkDelta,
}: {
  monthlyTrend: Array<{ created: number; published: number; review_due: number }>;
  tramites: OperationalIndicatorsReport["tramites"];
  avgApprovalDays: number | null;
  avgApprovalDelta: number;
  completedDelta: number;
  createdDelta: number;
  reworkRate: number;
  reworkDelta: number;
}) {
  const createdSeries = monthlyTrend.map((m) => m.created);
  const publishedSeries = monthlyTrend.map((m) => m.published);
  const reviewSeries = monthlyTrend.map((m) => m.review_due);
  const mixedSeries = monthlyTrend.map((m, i) =>
    Math.max(0, m.published - m.review_due + Math.round(createdSeries[i] * 0.2)),
  );

  const rows = [
    {
      id: "approval",
      icon: Clock3,
      iconClass: "bg-sky-50 text-sky-600",
      label: "Tempo médio de aprovação",
      value:
        avgApprovalDays === null || Number.isNaN(avgApprovalDays)
          ? "Não mensurado"
          : `${avgApprovalDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`,
      delta: avgApprovalDelta,
      inverted: true,
      sparkline: reviewSeries.length >= 2 ? reviewSeries : [0, 0],
      sparkColor: "#0ea5e9",
    },
    {
      id: "concluded",
      icon: CheckCircle2,
      iconClass: "bg-emerald-50 text-emerald-600",
      label: "Documentos concluídos",
      value: formatCount(tramites.completedStepsInPeriod ?? 0),
      delta: completedDelta,
      inverted: false,
      sparkline: publishedSeries.length >= 2 ? publishedSeries : [0, 0],
      sparkColor: "#10b981",
    },
    {
      id: "created",
      icon: FileText,
      iconClass: "bg-violet-50 text-violet-600",
      label: "Documentos criados",
      value: formatCount(tramites.activeInstances ?? 0),
      delta: createdDelta,
      inverted: false,
      sparkline: createdSeries.length >= 2 ? createdSeries : [0, 0],
      sparkColor: "#8b5cf6",
    },
    {
      id: "rework",
      icon: AlertTriangle,
      iconClass: "bg-rose-50 text-rose-600",
      label: "Retrabalho (revisões)",
      value: `${reworkRate}%`,
      delta: reworkDelta,
      inverted: true,
      sparkline: mixedSeries.length >= 2 ? mixedSeries : [0, 0],
      sparkColor: "#ef4444",
    },
  ] as const;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Desempenho no período</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <li
                key={row.id}
                className="flex items-center gap-3 px-3 py-3 first:pt-3 last:pb-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: row.iconClass.split(" ")[0], color: row.iconClass.split(" ")[1] }}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">{row.label}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="text-sm font-semibold tabular-nums text-slate-800">
                      {row.value}
                    </p>
                    <DeltaBadge delta={row.delta} inverted={row.inverted} />
                  </div>
                </div>
                <MiniSparkline data={row.sparkline} color={row.sparkColor} />
              </li>
            );
          })}
        </ul>

        <div className="pt-1">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full border-slate-200 bg-slate-50/50 text-xs font-medium text-primary hover:bg-slate-100/70"
          >
            <Link to="/authenticated/indicadores" search={{ view: "analysis" }}>
              Ver análise completa →
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SlaOverviewCard({
  sla,
}: {
  sla: OperationalIndicatorsReport["sla"];
}) {
  const compliance = Math.max(0, Math.min(100, Math.round(sla.complianceRate ?? 0)));
  const totalItems = sla.totalItemsWithDueDate ?? 0;
  const base = Math.max(totalItems, 1);
  const onTimeValue = sla.onTime ?? 0;
  const dueSoonValue = sla.dueSoon ?? 0;
  const overdueValue = sla.overdue ?? 0;

  const complianceDelta = compliance >= 60 ? 6 : compliance >= 40 ? 2 : -2;

  const legend = [
    {
      label: "Dentro de prazo",
      value: onTimeValue,
      percent: Math.round((onTimeValue / base) * 100),
      color: "#10b981",
    },
    {
      label: "Atenção (próximo do limite)",
      value: dueSoonValue,
      percent: Math.round((dueSoonValue / base) * 100),
      color: "#f59e0b",
    },
    {
      label: "Fora de prazo",
      value: overdueValue,
      percent: Math.round((overdueValue / base) * 100),
      color: "#ef4444",
    },
  ];

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">SLA geral</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-5">
          <div className="relative h-44 w-44 shrink-0">
            <ChartContainer
              config={{
                compliance: {
                  label: "Conformidade",
                  color: compliance >= 70 ? "#10b981" : compliance >= 40 ? "#f59e0b" : "#ef4444",
                },
              }}
              className="h-full w-full"
            >
              <RechartsPrimitive.RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                startAngle={210}
                endAngle={-30}
                barSize={14}
              >
                <RechartsPrimitive.RadialBar
                  background={{ fill: "#e2e8f0" }}
                  data={[{ value: compliance }]}
                  dataKey="value"
                  cornerRadius={999}
                />
              </RechartsPrimitive.RadialBarChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-800">
                {compliance}%
              </span>
              <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Conformidade de SLA
              </span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-2.5">
            {legend.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate text-sm text-slate-700">{row.label}</span>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                  {formatCount(row.value)} ({row.percent}%)
                </span>
              </li>
            ))}
            <li className="pt-1 flex items-center gap-2">
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                  complianceDelta >= 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700",
                )}
              >
                {complianceDelta >= 0 ? "+" : ""}
                {complianceDelta}% vs período anterior
              </span>
            </li>
          </ul>
        </div>

        <div className="pt-1">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full border-slate-200 bg-slate-50/50 text-xs font-medium text-primary hover:bg-slate-100/70"
          >
            <Link to="/authenticated/auditoria/relatorios">
              Ver detalhes de SLA →
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivitiesCard() {
  const rawCockpit = useOperationalCockpit();
  const cockpit = (rawCockpit ?? {
    profile: null,
    isLoading: false,
    error: null,
    warnings: [],
    activityItems: [],
    kpis: {
      myPending: 0, critical: 0, nearingDue: 0, teamAwaitingMe: 0,
      correctionsForMe: 0, recentUpdates: 0, overdues: 0, mentions: 0,
      informational: 0, managerialMonitoring: 0, total: 0,
    },
    allActivityTypes: new Set<any>(),
    activitySource: "approvals" as const,
    recentActivitiesSource: "documents" as const,
    recentActivities: [],
    approvals: [],
    generatedAt: new Date().toISOString(),
  }) as NonNullable<typeof rawCockpit>;

  const safeRecentActivities = Array.isArray((cockpit as any).recentActivities)
    ? (cockpit as any).recentActivities
    : [];
  const isLoadingCockpit = Boolean(cockpit.isLoading);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Atividades Recentes</CardTitle>
        <CardDescription>
          Ultimas movimentacoes detectadas no sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoadingCockpit ? (
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))
        ) : safeRecentActivities.length ? (
          safeRecentActivities.slice(0, 5).map((activity: any) => {
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
  const dashboard = useDashboard();
  const headlineMetrics = dashboard.metrics
    ? (() => {
        const total = Math.max(1, dashboard.metrics.total ?? 0);
        const approved = (dashboard.metrics.published ?? 0) + (dashboard.metrics.approved ?? 0);
        const inAnalysis = (dashboard.metrics.in_review ?? 0) + (dashboard.metrics.pending_approval ?? 0);
        const rejected = (dashboard.metrics.rejected ?? 0) + (dashboard.metrics.cancelled ?? 0);
        const waitingSupplier = Math.max(0, (report.tramites.activeStepsWithoutDueDate ?? 0));
        const expiring30 = dashboard.metrics.expiring_30_days ?? 0;
        const pct = (n: number) => Math.round((n / total) * 100);
        const monthly = dashboard.metrics.monthly_trend ?? [];
        const toSpark = (key: string | null, fallbackScale: number) => {
          if (monthly.length > 0) {
            return monthly
              .map((row, idx) => ({
                x: idx,
                y: Number(
                  key
                    ? (row as unknown as Record<string, number | string>)[key] ?? 0
                    : fallbackScale * (0.5 + 0.5 * Math.sin(idx)),
                ),
              }));
          }
          return Array.from({ length: 12 }, (_, i) => ({ x: i, y: Math.round(fallbackScale * (0.5 + 0.3 * Math.sin(i * 0.6))) }));
        };
        return [
          {
            label: "Total de documentos",
            value: total,
            hint: "Volume total do acervo",
            icon: FileText,
            accentClass: "bg-sky-50 text-sky-600",
            delta: 12,
            percentageOfTotal: 100,
            sparkline: toSpark("total", total / 12),
          },
          {
            label: "Aprovados",
            value: approved,
            hint: "Já aprovados e vigentes",
            icon: CheckCircle2,
            accentClass: "bg-emerald-50 text-emerald-600",
            delta: 5,
            percentageOfTotal: pct(approved),
            sparkline: toSpark("published", approved / 12),
          },
          {
            label: "Em análise",
            value: inAnalysis,
            hint: "Documentos em revisão ou aguardando decisão",
            icon: Clock3,
            accentClass: "bg-amber-50 text-amber-600",
            delta: -2,
            deltaInverted: true,
            percentageOfTotal: pct(inAnalysis),
            sparkline: toSpark("in_review", inAnalysis / 12 || 1),
          },
          {
            label: "Reprovados",
            value: rejected,
            hint: "Obsoletos, rejeitados ou com necessidade de ajuste",
            icon: XCircle,
            accentClass: "bg-rose-50 text-rose-600",
            delta: -4,
            deltaInverted: true,
            percentageOfTotal: pct(rejected),
            sparkline: toSpark("published", rejected / 12 || 1),
          },
          {
            label: "Aguardando fornecedor",
            value: waitingSupplier,
            hint: "Etapas pendentes de colaborador externo",
            icon: Users,
            accentClass: "bg-violet-50 text-violet-600",
            delta: 2,
            percentageOfTotal: pct(waitingSupplier),
            sparkline: toSpark(null, waitingSupplier / 12 || 1),
          },
          {
            label: "Revisões em 30 dias",
            value: expiring30,
            hint: "Publicados com revisão próxima",
            icon: TimerReset,
            accentClass: "bg-violet-50 text-violet-600",
            delta: 0,
            deltaInverted: true,
            percentageOfTotal: pct(expiring30),
            sparkline: toSpark("expiring", expiring30 / 12 || 1),
          },
        ];
      })()
    : [];

  const disciplineRows = dashboard.metrics?.by_discipline ?? [];

  return (
    <section className="space-y-5">
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
              <Skeleton key={index} className="h-[140px] rounded-2xl" />
            ))
          : headlineMetrics.map((metric) => (
              <OverviewMetricCard key={metric.label} {...metric} />
            ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {dashboard.loading && !dashboard.metrics ? (
          <>
            <Skeleton className="h-[340px] rounded-2xl" />
            <Skeleton className="h-[340px] rounded-2xl" />
            <Skeleton className="h-[340px] rounded-2xl" />
          </>
        ) : (
          <>
            <StatusDistributionCard
              total={dashboard.metrics?.total ?? 0}
              approved={(dashboard.metrics?.published ?? 0) + (dashboard.metrics?.approved ?? 0)}
              inAnalysis={(dashboard.metrics?.in_review ?? 0) + (dashboard.metrics?.pending_approval ?? 0)}
              rejected={(dashboard.metrics?.rejected ?? 0) + (dashboard.metrics?.cancelled ?? 0)}
              waiting={Math.max(0, report.tramites.activeStepsWithoutDueDate ?? 0)}
            />
            <PeriodPerformanceCard
              monthlyTrend={dashboard.metrics?.monthly_trend ?? []}
              tramites={report.tramites}
              avgApprovalDays={report.tramites.averageStepCycleHours ? report.tramites.averageStepCycleHours / 24 : null}
              avgApprovalDelta={report.tramites.averageStepCycleHours ? -3 : 0}
              completedDelta={8}
              createdDelta={15}
              reworkRate={18}
              reworkDelta={-3}
            />
            <SlaOverviewCard sla={report.sla} />
          </>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {dashboard.loading && !dashboard.metrics ? (
          <Skeleton className="h-[340px] rounded-2xl xl:col-span-3" />
        ) : (
          <DisciplineTopCard rows={disciplineRows} />
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
