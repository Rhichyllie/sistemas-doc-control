import { VisualMetricCard } from "@/components/indicators/VisualMetricCard";
import type { OperationalKpiCard } from "@/lib/operationalIndicators";

export function MetricCardGrid({ metrics }: { metrics: OperationalKpiCard[] }) {
  return (
    <section aria-labelledby="primary-kpis-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="primary-kpis-title" className="text-lg font-semibold">
            Sinais prioritários
          </h2>
          <p className="text-sm text-muted-foreground">
            Seis indicadores para decidir onde agir primeiro.
          </p>
        </div>
      </div>
      <div
        data-print-break-inside
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
      >
        {metrics.map((metric) => (
          <VisualMetricCard key={metric.id} metric={metric} />
        ))}
      </div>
    </section>
  );
}
