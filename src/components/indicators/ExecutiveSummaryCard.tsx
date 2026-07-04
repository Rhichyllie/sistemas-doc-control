import {
  BarChart3,
  CircleGauge,
  Info,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getExecutiveInsights,
  getGovernanceScore,
  type IndicatorTone,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

const TONE = {
  neutral: {
    text: "text-primary",
    stroke: "text-primary",
    shell: "border-primary/20 bg-primary/[0.035]",
  },
  positive: {
    text: "text-emerald-700",
    stroke: "text-emerald-600",
    shell: "border-emerald-200 bg-emerald-50/60",
  },
  attention: {
    text: "text-amber-700",
    stroke: "text-amber-500",
    shell: "border-amber-200 bg-amber-50/60",
  },
  critical: {
    text: "text-destructive",
    stroke: "text-destructive",
    shell: "border-destructive/25 bg-destructive/[0.035]",
  },
} satisfies Record<IndicatorTone, Record<string, string>>;

const INSIGHT_ICON = {
  neutral: Info,
  positive: ShieldCheck,
  attention: TriangleAlert,
  critical: TriangleAlert,
} as const;

export function ExecutiveSummaryCard({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const score = getGovernanceScore(report);
  const insights = getExecutiveInsights(report).slice(0, 4);
  const tone = TONE[score.tone];
  const circumference = 2 * Math.PI * 50;
  const dash = score.score === null ? 0 : (score.score / 100) * circumference;

  return (
    <section
      data-print-break-inside
      aria-labelledby="executive-summary-title"
      className={`overflow-hidden rounded-2xl border ${tone.shell}`}
    >
      <div className="grid xl:grid-cols-[310px_minmax(0,1fr)]">
        <div className="flex items-center gap-5 border-b p-5 md:p-7 xl:border-b-0 xl:border-r">
          <div className="relative h-32 w-32 shrink-0">
            <svg
              viewBox="0 0 120 120"
              className="h-full w-full -rotate-90"
              role="img"
              aria-label={`Governance Score ${
                score.score === null ? "indisponível" : `${score.score} de 100`
              }`}
            >
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="currentColor"
                strokeWidth="9"
                className="text-background/80"
              />
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="currentColor"
                strokeWidth="9"
                strokeLinecap="round"
                className={tone.stroke}
                style={{
                  strokeDasharray: `${dash} ${circumference - dash}`,
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold ${tone.text}`}>
                {score.score ?? "—"}
              </span>
              <span className="text-[11px] text-muted-foreground">de 100</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Governance Score
            </p>
            <h2
              id="executive-summary-title"
              className="mt-2 text-2xl font-bold"
            >
              {score.classification}
            </h2>
            <Badge variant="outline" className="mt-2">
              Score operacional
            </Badge>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Síntese do painel, não certificação formal.
            </p>
          </div>
        </div>

        <div className="p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Resumo executivo
              </p>
              <h3 className="mt-1 text-xl font-semibold">
                O que precisa entrar na pauta
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CircleGauge className="h-4 w-4" />
              cálculo determinístico
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {insights.map((insight) => {
              const Icon = INSIGHT_ICON[insight.tone];
              return (
                <div
                  key={insight.id}
                  className="flex gap-3 rounded-xl border bg-background/75 p-3.5"
                >
                  <div className={`mt-0.5 ${TONE[insight.tone].text}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{insight.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {insight.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {score.penalizers.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Maiores penalizadores:</span>
              {score.penalizers.map((item) => (
                <Badge key={item.id} variant="secondary">
                  {item.label} −{item.penalty.toLocaleString("pt-BR")} pt
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
