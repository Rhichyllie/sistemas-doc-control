import { createFileRoute } from "@tanstack/react-router";
import { AuditReportsPage } from "@/components/audit-reports/AuditReportsPage";
import { requirePermission } from "../-route-guards";

export const Route = createFileRoute("/authenticated/auditoria/relatorios")({
  beforeLoad: async ({ location }) => {
    await requirePermission(location.href, "report:view");
  },
  component: AuditReportsPage,
});
