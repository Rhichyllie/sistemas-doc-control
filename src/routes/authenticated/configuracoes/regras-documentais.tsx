import { createFileRoute } from "@tanstack/react-router";
import { DocumentRulesPage } from "../documentos/regras";

export const Route = createFileRoute(
  "/authenticated/configuracoes/regras-documentais",
)({
  component: DocumentRulesPage,
});
