import type { ReactNode } from "react";
import type {
  IndicatorViewMode,
  OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function MeetingModeLayout({
  mode,
  report,
  children,
}: {
  mode: IndicatorViewMode;
  report: OperationalIndicatorsReport | null;
  children: ReactNode;
}) {
  return (
    <div
      data-indicator-cockpit
      data-view-mode={mode}
      className={
        mode === "presentation"
          ? "mx-auto max-w-[1800px] space-y-6"
          : "space-y-5 md:space-y-6"
      }
    >
      <div data-print-only className="hidden">
        <div className="flex items-end justify-between border-b-2 border-primary pb-3">
          <div>
            <p className="text-sm font-bold tracking-[0.18em]">TRAMITA</p>
            <h1 className="mt-1 text-2xl font-bold">
              Indicadores Operacionais
            </h1>
          </div>
          <div className="text-right text-xs">
            <p>
              Período: {report?.period.from ?? "—"} a {report?.period.to ?? "—"}
            </p>
            <p>
              Gerado em {report ? formatGeneratedAt(report.generatedAt) : "—"}
            </p>
            <p>Fonte: cockpit gerencial P-26</p>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
