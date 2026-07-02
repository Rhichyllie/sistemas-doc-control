import { createFileRoute } from "@tanstack/react-router";
import { DocumentWorkCenter } from "@/components/documents/DocumentWorkCenter";

export const Route = createFileRoute("/authenticated/documentos/central")({
  component: DocumentWorkCenter,
});
