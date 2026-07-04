import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatPercent,
  getSlaDistribution,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

const COLORS = {
  on_time: "text-emerald-500",
  due_soon: "text-amber-500",
  overdue: "text-red-500",
} as const;

const DOTS = {
  on_time: "bg-emerald-500",
  due_soon: "bg-amber-500",
  overdue: "bg-red-500",
} as const;

export function SlaDistributionChart({
  report,
  compact = false,
}: {
  report: OperationalIndicatorsReport;
  compact?: boolean;
}) {
  const distribution = getSlaDistribution(report);
  const total = distribution.reduce((sum, item) => sum + item.value, 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <Card data-print-break-inside className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-primary" />
              SLA e prazo
            </CardTitle>
            <CardDescription>
              Distribuição dos itens com vencimento persistido.
            </CardDescription>
          </div>
          <Badge variant="outline">
            {report.sla.deadlineMode === "operational_calendar"
              ? "Calendário operacional"
              : "Data simples"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent
        className={
          compact
            ? "grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center"
            : "grid gap-6 md:grid-cols-[220px_1fr] md:items-center"
        }
      >
        <div className="relative mx-auto h-44 w-44">
          <svg
            viewBox="0 0 120 120"
            role="img"
            aria-label={`Compliance de SLA ${formatPercent(report.sla.complianceRate)}`}
            className="h-full w-full -rotate-90"
          >
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-muted"
            />
            {distribution.map((item) => {
              const length = total ? (item.value / total) * circumference : 0;
              const currentOffset = offset;
              offset += length;
              return (
                <circle
                  key={item.id}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeLinecap="butt"
                  className={COLORS[item.id]}
                  style={{
                    strokeDasharray: `${length} ${circumference - length}`,
                    strokeDashoffset: -currentOffset,
                  }}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-semibold">
              {formatPercent(report.sla.complianceRate)}
            </span>
            <span className="text-xs text-muted-foreground">compliance</span>
          </div>
        </div>
        <div>
          <div className="space-y-3">
            {distribution.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${DOTS[item.id]}`}
                  />
                  {item.label}
                </span>
                <span className="font-semibold">
                  {item.value.toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
          <div
            className="mt-5 flex h-3 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`Distribuição de SLA: ${distribution
              .map((item) => `${item.label} ${item.value}`)
              .join(", ")}`}
          >
            {distribution.map((item) => (
              <div
                key={item.id}
                className={
                  item.id === "on_time"
                    ? "bg-emerald-500"
                    : item.id === "due_soon"
                      ? "bg-amber-500"
                      : "bg-red-500"
                }
                style={{
                  width: `${total ? (item.value / total) * 100 : 0}%`,
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            <span>{total.toLocaleString("pt-BR")} itens com prazo</span>
            <span>
              {report.sla.overdue?.toLocaleString("pt-BR") ?? "—"} vencidos
            </span>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            {report.sla.explanation}
          </p>
          <Button asChild className="mt-4 h-auto p-0" variant="link">
            <Link to="/authenticated/configuracoes/calendario">
              Revisar política de prazo
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
