import { createFileRoute } from "@tanstack/react-router";
import { DocumentWorkCenter } from "@/components/documents/DocumentWorkCenter";
import {
  PageErrorBoundary,
  PageErrorView,
} from "@/components/shared/route-error-boundary";

function CentralPage() {
  return (
    <PageErrorBoundary
      title="Falha ao carregar a Central Documental"
      subtitle="Ocorreu um erro inesperado ao montar a Central de Documentos. Os detalhes abaixo ajudam a diagnosticar o problema."
    >
      <DocumentWorkCenter />
    </PageErrorBoundary>
  );
}

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/documentos/central",
)({
  component: CentralPage,
  errorComponent: ({ error, reset }) => (
    <PageErrorView
      title="Falha ao carregar a Central Documental"
      subtitle="Ocorreu um erro inesperado ao montar a Central de Documentos. Os detalhes abaixo ajudam a diagnosticar o problema."
      error={error}
      reset={reset}
    />
  ),
});
