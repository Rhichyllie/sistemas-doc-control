import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "../-route-guards";
import { AuditTrailPage } from "../trilha-de-auditoria";

export const Route = createFileRoute(
  "/authenticated/configuracoes/trilha-de-auditoria",
)({
  beforeLoad: async ({ location }) => {
    await requirePermission(location.href, "audit:view");
  },
  component: AuditTrailPage,
});
