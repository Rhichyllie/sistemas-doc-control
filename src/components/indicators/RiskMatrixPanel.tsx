import { Grid2X2, ShieldAlert } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getRiskMatrixSignals,
  type OperationalIndicatorsReport,
  type RiskMatrixSignal,
} from "@/lib/operationalIndicators";

const CELLS: Array<{
  impact: RiskMatrixSignal["impact"];
  urgency: RiskMatrixSignal["urgency"];
  label: string;
  className: string;
}> = [
  {
    impact: "high",
    urgency: "high",
    label: "Ação imediata",
    className: "border-destructive/30 bg-destructive/[0.055]",
  },
  {
    impact: "low",
    urgency: "high",
    label: "Resposta rápida",
    className: "border-amber-200 bg-amber-50/60",
  },
  {
    impact: "high",
    urgency: "low",
    label: "Planejar tratamento",
    className: "border-amber-200 bg-amber-50/35",
  },
  {
    impact: "low",
    urgency: "low",
    label: "Monitorar",
    className: "border-border bg-muted/25",
  },
];

export function RiskMatrixPanel({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const signals = getRiskMatrixSignals(report);

  return (
    <Card data-print-break-inside className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Grid2X2 className="h-4 w-4 text-primary" />
          Matriz de risco
        </CardTitle>
        <CardDescription>
          Priorização determinística por impacto e urgência do sinal atual.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {signals.length === 0 ? (
          <div className="flex flex-1 min-h-64 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
            <ShieldAlert className="h-8 w-8 text-emerald-600" />
            <p className="mt-3 font-semibold">Sem riscos para posicionar</p>
            <p className="mt-1 text-sm text-muted-foreground">
              O recorte atual não possui sinais operacionais abertos.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="mb-2 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Impacto alto</span>
              <span>Urgência alta</span>
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              {CELLS.map((cell) => {
                const items = signals.filter(
                  (signal) =>
                    signal.impact === cell.impact &&
                    signal.urgency === cell.urgency,
                );
                return (
                  <div
                    key={`${cell.impact}-${cell.urgency}`}
                    className={`flex flex-col min-h-[180px] rounded-xl border p-4 ${cell.className}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {cell.label}
                    </p>
                    <div className="mt-3 flex flex-1 flex-wrap content-start gap-1.5">
                      {items.length ? (
                        items.map((item) => (
                          <span
                            key={item.id}
                            className="rounded-lg border bg-background/80 px-2 py-1 text-xs font-medium"
                          >
                            {item.label} · {item.count}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Nenhum sinal
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
