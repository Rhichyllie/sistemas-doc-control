import { createFileRoute } from "@tanstack/react-router";
import { ApprovalGroupsPage } from "../grupos-aprovacao";

export const Route = createFileRoute(
  "/authenticated/configuracoes/grupos-aprovacao",
)({
  component: ApprovalGroupsPage,
});
