import type { ReactNode } from "react";
import type {
  IndicatorViewMode,
  OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";
import type { IndicatorPrintOrientation } from "@/components/indicators/IndicatorExportBar";

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
  printOrientation,
  children,
}: {
  mode: IndicatorViewMode;
  report: OperationalIndicatorsReport | null;
  printOrientation: IndicatorPrintOrientation;
  children: ReactNode;
}) {
  const isPresentation = mode === "presentation";
  return (
    <div
      data-indicator-cockpit
      data-presentation-root
      data-view-mode={mode}
      data-print-orientation={printOrientation}
      className={
        isPresentation
          ? "data-presentation:mx-auto data-presentation:max-w-[1920px] data-presentation:px-4 data-presentation:py-8 space-y-6 data-presentation:min-h-screen"
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
