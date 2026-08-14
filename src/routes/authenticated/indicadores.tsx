import { createFileRoute } from "@tanstack/react-router";
import { LibraryRouteRedirect } from "@/components/libraries/LibraryRouteRedirect";
import { OperationalIndicatorsDashboard } from "@/components/indicators/OperationalIndicatorsDashboard";

export const Route = createFileRoute("/authenticated/indicadores")({
  component: IndicatorsRedirectPage,
});

function IndicatorsRedirectPage() {
  return <LibraryRouteRedirect target="/authenticated/indicadores" />;
}

export function IndicatorsPage() {
  return <OperationalIndicatorsDashboard />;
}
