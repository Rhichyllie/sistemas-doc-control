import { createFileRoute } from "@tanstack/react-router";
import { IndicatorsPage } from "@/routes/authenticated/indicadores";
import {
  PageErrorView,
} from "@/components/shared/route-error-boundary";

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/indicadores",
)({
  component: IndicatorsPage,
  errorComponent: ({ error, reset }) => (
    <PageErrorView
      title="Falha ao carregar Indicadores Operacionais"
      subtitle="Ocorreu um erro inesperado ao montar a página de Indicadores. Os detalhes abaixo ajudam a diagnosticar o problema."
      error={error}
      reset={reset}
    />
  ),
});
