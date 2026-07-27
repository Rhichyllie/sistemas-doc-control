import { createFileRoute } from "@tanstack/react-router";
import { DocumentsPage } from "@/routes/authenticated/documents";

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/documentos",
)({
  component: DocumentsPage,
});
