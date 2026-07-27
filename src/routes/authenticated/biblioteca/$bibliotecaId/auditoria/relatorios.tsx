import { createFileRoute } from "@tanstack/react-router";
import { AuditReportsPage } from "@/components/audit-reports/AuditReportsPage";
import { requirePermission } from "@/routes/authenticated/-route-guards";

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/auditoria/relatorios",
)({
  beforeLoad: async ({ location }) => {
    await requirePermission(location.href, "report:view");
  },
  component: AuditReportsPage,
});
