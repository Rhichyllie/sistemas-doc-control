import { createFileRoute } from "@tanstack/react-router";
import { OperationalCalendarAdmin } from "@/components/calendar/OperationalCalendarAdmin";
import { requireRole } from "../-route-guards";

export const Route = createFileRoute(
  "/authenticated/configuracoes/calendario",
)({
  beforeLoad: async ({ location }) => {
    await requireRole(location.href, ["admin", "manager"]);
  },
  component: OperationalCalendarAdmin,
});
