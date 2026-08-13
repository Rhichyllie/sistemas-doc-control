import { createFileRoute } from "@tanstack/react-router";
import { AuditExceptionsPage } from "@/components/audit-exceptions/AuditExceptionsPage";
import { requirePermission } from "../-route-guards";

export const Route = createFileRoute("/authenticated/auditoria/excecoes")({
  beforeLoad: async ({ location }) => {
    await requirePermission(location.href, "audit:view");
  },
  component: AuditExceptionsPage,
});
