import { createFileRoute } from "@tanstack/react-router";
import { LibraryRouteRedirect } from "@/components/libraries/LibraryRouteRedirect";
import { AuditReportsPage } from "@/components/audit-reports/AuditReportsPage";
import { requirePermission } from "../-route-guards";

export const Route = createFileRoute("/authenticated/auditoria/relatorios")({
  beforeLoad: async ({ location }) => {
    await requirePermission(location.href, "report:view");
  },
  component: ReportsRedirectPage,
});

function ReportsRedirectPage() {
  return <LibraryRouteRedirect target="/authenticated/auditoria/relatorios" />;
}

export { AuditReportsPage };
