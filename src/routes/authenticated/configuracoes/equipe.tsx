import { createFileRoute } from "@tanstack/react-router";
import { EquipePage } from "../equipe";

export const Route = createFileRoute("/authenticated/configuracoes/equipe")({
  component: EquipePage,
});
