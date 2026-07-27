import { createFileRoute } from "@tanstack/react-router";
import { LibraryRouteRedirect } from "@/components/libraries/LibraryRouteRedirect";
import { ProjectAdmin } from "@/components/projects/ProjectAdmin";

export const Route = createFileRoute("/authenticated/projetos")({
  component: ProjectsRedirectPage,
});

function ProjectsRedirectPage() {
  return <LibraryRouteRedirect target="/authenticated/projetos" />;
}

export function ProjectsOperationalPage() {
  return <ProjectAdmin />;
}
