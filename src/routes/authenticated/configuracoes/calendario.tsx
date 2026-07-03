import { createFileRoute } from "@tanstack/react-router";
import { OperationalCalendarAdmin } from "@/components/calendar/OperationalCalendarAdmin";

export const Route = createFileRoute(
  "/authenticated/configuracoes/calendario",
)({
  component: OperationalCalendarAdmin,
});
