import { createFileRoute } from "@tanstack/react-router";
import { LibraryRouteRedirect } from "@/components/libraries/LibraryRouteRedirect";
import { DocumentWorkCenter } from "@/components/documents/DocumentWorkCenter";

export const Route = createFileRoute("/authenticated/documentos/central")({
  component: DocumentCenterRedirectPage,
});

function DocumentCenterRedirectPage() {
  return <LibraryRouteRedirect target="/authenticated/documentos/central" />;
}

export { DocumentWorkCenter };
