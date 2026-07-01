import { createFileRoute } from "@tanstack/react-router";
import { ProjectAdmin } from "@/components/projects/ProjectAdmin";

export const Route = createFileRoute("/authenticated/projetos")({
  component: ProjectsOperationalPage,
});

function ProjectsOperationalPage() {
  return <ProjectAdmin />;
}
