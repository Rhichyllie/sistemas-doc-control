import { createFileRoute } from "@tanstack/react-router";
import { ProjectAdmin } from "@/components/projects/ProjectAdmin";

export const Route = createFileRoute("/authenticated/configuracoes/projetos")({
  component: ConfiguracoesProjetosPage,
});

function ConfiguracoesProjetosPage() {
  return <ProjectAdmin />;
}
