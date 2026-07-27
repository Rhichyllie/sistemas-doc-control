import { createFileRoute } from "@tanstack/react-router";
import { ProjectAdmin } from "@/components/projects/ProjectAdmin";

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/projetos",
)({
  component: ProjectAdmin,
});
