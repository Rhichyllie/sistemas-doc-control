import { createFileRoute } from "@tanstack/react-router";
import { LibraryRouteRedirect } from "@/components/libraries/LibraryRouteRedirect";
import { DocumentTramiteAdmin } from "@/components/tramites/DocumentTramiteAdmin";

export const Route = createFileRoute("/authenticated/documentos/tramites")({
  component: TramitesRedirectPage,
});

function TramitesRedirectPage() {
  return <LibraryRouteRedirect target="/authenticated/documentos/tramites" />;
}

export { DocumentTramiteAdmin };
