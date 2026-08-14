import { createFileRoute } from "@tanstack/react-router";
import { DocumentTramiteAdmin } from "@/components/tramites/DocumentTramiteAdmin";
import {
  PageErrorBoundary,
  PageErrorView,
} from "@/components/shared/route-error-boundary";

function TramitesPage() {
  return (
    <PageErrorBoundary
      title="Falha ao carregar a página Trâmites"
      subtitle="Ocorreu um erro inesperado ao montar a Central de Trâmites. Os detalhes abaixo ajudam a diagnosticar o problema."
    >
      <DocumentTramiteAdmin />
    </PageErrorBoundary>
  );
}

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/documentos/tramites",
)({
  component: TramitesPage,
  errorComponent: ({ error, reset }) => (
    <PageErrorView
      title="Falha ao carregar a página Trâmites"
      subtitle="Ocorreu um erro inesperado ao montar a Central de Trâmites. Os detalhes abaixo ajudam a diagnosticar o problema."
      error={error}
      reset={reset}
    />
  ),
});
