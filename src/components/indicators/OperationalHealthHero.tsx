import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  OperationalIndicatorRecommendation,
  OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";
import {
  formatCount,
  getHealthNarrative,
  getHealthStatus,
  getTopRisks,
} from "@/lib/operationalIndicators";

const STATUS_CONTENT = {
  healthy: {
    label: "Saudável",
    icon: CheckCircle2,
    shell: "border-emerald-200 bg-emerald-50/50",
    iconClass: "bg-emerald-600 text-white",
  },
  attention: {
    label: "Atenção",
    icon: CircleAlert,
    shell: "border-amber-200 bg-amber-50/50",
    iconClass: "bg-amber-500 text-white",
  },
  critical: {
    label: "Crítico",
    icon: ShieldAlert,
    shell: "border-destructive/30 bg-destructive/[0.035]",
    iconClass: "bg-destructive text-destructive-foreground",
  },
  insufficient: {
    label: "Dados insuficientes",
    icon: CircleHelp,
    shell: "border-border bg-muted/30",
    iconClass: "bg-muted-foreground text-background",
  },
} as const;

export function OperationalHealthHero({
  report,
  primaryRecommendation,
}: {
  report: OperationalIndicatorsReport;
  primaryRecommendation: OperationalIndicatorRecommendation | undefined;
}) {
  const status = getHealthStatus(report);
  const content = STATUS_CONTENT[status];
  const Icon = content.icon;
  const risks = getTopRisks(report, 3);
  const topBottleneck = [
    ...report.bottlenecks.byResponsible.map((item) => ({
      ...item,
      dimension: "Responsável",
    })),
    ...report.bottlenecks.byProject.map((item) => ({
      ...item,
      dimension: "Projeto",
    })),
    ...report.bottlenecks.byArea.map((item) => ({
      ...item,
      dimension: "Área",
    })),
    ...report.bottlenecks.byStepType.map((item) => ({
      ...item,
      dimension: "Etapa",
    })),
  ].sort((left, right) => right.count - left.count)[0];

  return (
    <section
      aria-labelledby="operational-health-title"
      className={`overflow-hidden rounded-2xl border ${content.shell}`}
    >
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className={`rounded-xl p-2.5 ${content.iconClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Saúde operacional
              </p>
              <Badge className="mt-1" variant="outline">
                {content.label}
              </Badge>
            </div>
          </div>
          <h2
            id="operational-health-title"
            className="mt-5 max-w-4xl text-2xl font-semibold leading-tight tracking-tight md:text-3xl"
          >
            {getHealthNarrative(report)}
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {risks.length > 0 ? (
              risks.map((risk) => (
                <Link
                  key={risk.id}
                  to={risk.actionUrl}
                  className="rounded-xl border bg-background/70 p-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{risk.label}</span>
                    <span className="text-lg font-semibold">
                      {formatCount(risk.count)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {risk.explanation}
                  </p>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border bg-background/70 p-4 sm:col-span-3">
                <p className="font-medium">
                  Nenhum risco prioritário detectado
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Continue acompanhando SLA e qualidade documental.
                </p>
              </div>
            )}
          </div>
        </div>

        <aside className="border-t bg-background/55 p-6 xl:border-l xl:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Top gargalo agora
          </p>
          {topBottleneck ? (
            <>
              <p className="mt-3 text-xl font-semibold">
                {topBottleneck.label}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {topBottleneck.dimension} · {formatCount(topBottleneck.count)}{" "}
                item(ns) em risco
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhuma concentração de atraso identificada.
            </p>
          )}

          <div className="my-5 h-px bg-border" />
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Próxima ação
          </p>
          <p className="mt-3 font-semibold">
            {primaryRecommendation?.title ?? "Revisar a operação"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {primaryRecommendation?.explanation ??
              "Use a Central para validar o próximo movimento operacional."}
          </p>
          <Button asChild className="mt-4 w-full">
            <Link
              to={
                primaryRecommendation?.actionUrl ??
                "/authenticated/documentos/central"
              }
            >
              {primaryRecommendation?.actionLabel ?? "Abrir Central"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </aside>
      </div>
    </section>
  );
}
