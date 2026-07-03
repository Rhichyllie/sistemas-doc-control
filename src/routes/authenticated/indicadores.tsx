import { createFileRoute } from "@tanstack/react-router";
import { OperationalIndicatorsDashboard } from "@/components/indicators/OperationalIndicatorsDashboard";

export const Route = createFileRoute("/authenticated/indicadores")({
  component: IndicatorsPage,
});

function IndicatorsPage() {
  return <OperationalIndicatorsDashboard />;
}
