import { createFileRoute } from "@tanstack/react-router";
import { DocumentCreationStudio } from "@/components/documents/DocumentCreationStudio";

export const Route = createFileRoute(
  "/authenticated/documentos/novo-inteligente",
)({
  component: DocumentCreationStudio,
});
