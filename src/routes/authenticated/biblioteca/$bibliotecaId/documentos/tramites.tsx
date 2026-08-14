import { createFileRoute } from "@tanstack/react-router";
import { DocumentTramiteAdmin } from "@/components/tramites/DocumentTramiteAdmin";

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/documentos/tramites",
)({
  component: DocumentTramiteAdmin,
});
