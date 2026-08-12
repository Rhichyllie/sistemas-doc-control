import { createFileRoute } from "@tanstack/react-router";
import { LibraryRouteRedirect } from "@/components/libraries/LibraryRouteRedirect";

export const Route = createFileRoute("/authenticated/documentos/central")({
  component: () => (
    <LibraryRouteRedirect target="/authenticated/documentos/central" />
  ),
});
