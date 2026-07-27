import { createFileRoute } from "@tanstack/react-router";
import { IndicatorsPage } from "@/routes/authenticated/indicadores";

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/indicadores",
)({
  component: IndicatorsPage,
});
