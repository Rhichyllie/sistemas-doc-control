import { createFileRoute } from "@tanstack/react-router";
import { LibraryRouteRedirect } from "@/components/libraries/LibraryRouteRedirect";
import { OperationalHome } from "@/components/dashboard/OperationalHome";

export const Route = createFileRoute("/authenticated/dashboard")({
  component: DashboardRedirectPage,
});

function DashboardRedirectPage() {
  return <LibraryRouteRedirect target="/authenticated/dashboard" />;
}

export { OperationalHome };
