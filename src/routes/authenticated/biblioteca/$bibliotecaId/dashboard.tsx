import { createFileRoute } from "@tanstack/react-router";
import { OperationalHome } from "@/components/dashboard/OperationalHome";

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/dashboard",
)({
  component: OperationalHome,
});
