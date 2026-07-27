import { createFileRoute } from "@tanstack/react-router";
import { ApprovalFlowPage } from "@/routes/authenticated/fluxo-de-aprovacao";

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/fluxo-de-aprovacao",
)({
  component: ApprovalFlowPage,
});
