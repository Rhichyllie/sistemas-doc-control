import { createFileRoute } from "@tanstack/react-router";
import { DocumentDetailPage } from "@/routes/authenticated/documents.$documentId";

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/documentos/$documentId",
)({
  component: DocumentDetailPage,
});
