import { createFileRoute } from "@tanstack/react-router";
import { LibraryRouteRedirect } from "@/components/libraries/LibraryRouteRedirect";
import { OperationalIndicatorsDashboard } from "@/components/indicators/OperationalIndicatorsDashboard";
import {
  PageErrorBoundary,
  PageErrorView,
} from "@/components/shared/route-error-boundary";

export const Route = createFileRoute("/authenticated/indicadores")({
  component: IndicatorsRedirectPage,
  errorComponent: ({ error, reset }) => (
    <PageErrorView
      title="Falha ao carregar Indicadores Operacionais"
      subtitle="Ocorreu um erro inesperado ao montar a página de Indicadores. Os detalhes abaixo ajudam a diagnosticar o problema."
      error={error}
      reset={reset}
    />
  ),
});

function IndicatorsRedirectPage() {
  return <LibraryRouteRedirect target="/authenticated/indicadores" />;
}

export function IndicatorsPage() {
  return (
    <PageErrorBoundary
      title="Falha ao carregar Indicadores Operacionais"
      subtitle="Ocorreu um erro inesperado ao montar a página de Indicadores. Os detalhes abaixo ajudam a diagnosticar o problema."
    >
      <OperationalIndicatorsDashboard />
    </PageErrorBoundary>
  );
}
