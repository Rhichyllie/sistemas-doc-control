import { createFileRoute } from "@tanstack/react-router";
import { OperationalReadinessPanel } from "@/components/diagnostics/OperationalReadinessPanel";

export const Route = createFileRoute(
  "/authenticated/configuracoes/diagnostico",
)({
  component: OperationalReadinessPanel,
});
