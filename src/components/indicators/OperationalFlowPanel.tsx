import { ArrowRight, Workflow } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatCount,
  formatDurationHours,
  getOperationalFlow,
  type IndicatorTone,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

const TONE_CLASS: Record<IndicatorTone, string> = {
  neutral: "border-border bg-muted/25",
  positive: "border-emerald-200 bg-emerald-50/50",
  attention: "border-amber-200 bg-amber-50/50",
  critical: "border-destructive/30 bg-destructive/[0.035]",
};

export function OperationalFlowPanel({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const flow = getOperationalFlow(report);
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="h-4 w-4 text-primary" />
          Fluxo operacional
        </CardTitle>
        <CardDescription>
          Do volume em execução à vazão do período.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row">
          {flow.map((item, index) => (
            <div
              key={item.id}
              className="flex min-w-0 flex-1 flex-col lg:flex-row lg:items-center"
            >
              <div
                className={`w-full min-w-0 flex-1 rounded-xl border p-3 ${TONE_CLASS[item.tone]}`}
              >
                <p className="text-2xl font-semibold">
                  {formatCount(item.value)}
                </p>
                <p className="mt-1 text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
              {index < flow.length - 1 && (
                <ArrowRight className="mx-auto my-2 h-4 w-4 shrink-0 rotate-90 text-muted-foreground lg:mx-2 lg:my-0 lg:rotate-0" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-3">
          <FlowSummary
            label="Ciclo médio de etapa"
            value={formatDurationHours(report.tramites.averageStepCycleHours)}
          />
          <FlowSummary
            label="Ciclo médio de instância"
            value={formatDurationHours(
              report.tramites.averageInstanceCycleHours,
            )}
          />
          <FlowSummary
            label="Taxa de conclusão"
            value={
              report.tramites.completionRate === null
                ? "—"
                : `${report.tramites.completionRate}%`
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FlowSummary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
