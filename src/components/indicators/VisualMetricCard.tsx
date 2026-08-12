import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BellRing,
  CalendarCheck2,
  CalendarX2,
  Clock3,
  FileCheck2,
  Info,
  UserRoundX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  IndicatorTone,
  OperationalKpiCard,
} from "@/lib/operationalIndicators";

const KPI_ICONS: Record<OperationalKpiCard["id"], LucideIcon> = {
  sla: CalendarCheck2,
  overdue_steps: CalendarX2,
  cycle_time: Clock3,
  pending_evidence: FileCheck2,
  critical_notifications: BellRing,
  unavailable_responsibles: UserRoundX,
};

const TONE_STYLE: Record<
  IndicatorTone,
  { border: string; icon: string; value: string }
> = {
  neutral: {
    border: "border-border",
    icon: "bg-primary/10 text-primary",
    value: "text-foreground",
  },
  positive: {
    border: "border-emerald-200",
    icon: "bg-emerald-100 text-emerald-700",
    value: "text-emerald-700",
  },
  attention: {
    border: "border-amber-200",
    icon: "bg-amber-100 text-amber-700",
    value: "text-amber-700",
  },
  critical: {
    border: "border-destructive/30",
    icon: "bg-destructive/10 text-destructive",
    value: "text-destructive",
  },
};

export function VisualMetricCard({ metric }: { metric: OperationalKpiCard }) {
  const Icon = KPI_ICONS[metric.id];
  const style = TONE_STYLE[metric.tone];
  const content = (
    <div
      className={`group flex h-full min-h-[156px] flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_-6px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(15,23,42,0.22)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl p-2 ${style.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Como ${metric.label} é calculado`}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              {metric.calculation}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="mt-4 flex flex-1 flex-col">
        <p
          className={`text-[26px] font-semibold leading-tight tracking-tight ${style.value}`}
        >
          {metric.value}
        </p>
        <p className="mt-0.5 text-sm font-medium text-slate-700">
          {metric.label}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          {metric.context}
        </p>
      </div>
      {metric.actionUrl && (
        <Link
          to={metric.actionUrl}
          className="mt-3 inline-flex w-fit items-center rounded-lg text-xs font-semibold text-primary hover:underline"
        >
          Investigar
          <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );

  return metric.actionUrl ? (
    <div className="h-full">{content}</div>
  ) : (
    content
  );
}
