import { createFileRoute } from "@tanstack/react-router";
import { DocumentWorkCenter } from "@/components/documents/DocumentWorkCenter";

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/documentos/central",
)({
  component: DocumentWorkCenter,
});
