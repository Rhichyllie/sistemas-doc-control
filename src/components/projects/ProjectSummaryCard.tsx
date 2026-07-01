import {
  Archive,
  CalendarDays,
  FileStack,
  MapPin,
  Pencil,
  Power,
  UserRound,
} from "lucide-react";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getProjectTypeLabel,
  type ProjectOperationalContext,
} from "@/lib/projectOperationalContext";

interface ProjectSummaryCardProps {
  project: ProjectOperationalContext;
  canManage: boolean;
  isSaving: boolean;
  onEdit: (project: ProjectOperationalContext) => void;
  onToggleActive: (project: ProjectOperationalContext) => void;
  onClose: (project: ProjectOperationalContext) => void;
  onArchive: (project: ProjectOperationalContext) => void;
}

function dateLabel(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function ProjectSummaryCard({
  project,
  canManage,
  isSaving,
  onEdit,
  onToggleActive,
  onClose,
  onArchive,
}: ProjectSummaryCardProps) {
  return (
    <Card className={!project.is_active ? "opacity-75" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {project.code}
              </Badge>
              <ProjectStatusBadge status={project.status} />
              {project.is_legacy && (
                <Badge variant="secondary">Legado/global</Badge>
              )}
            </div>
            <CardTitle className="mt-3 truncate text-xl">
              {project.name}
            </CardTitle>
            <CardDescription>
              {getProjectTypeLabel(project.project_type)}
              {project.area ? ` · Área ${project.area}` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <FileStack className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">
              {project.document_count}
            </span>
            <span className="text-xs text-muted-foreground">
              documento{project.document_count === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {project.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {project.description}
          </p>
        )}

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Cliente</p>
            <p className="font-medium">
              {project.client_name || "Não definido"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contrato</p>
            <p className="font-medium">
              {project.contract_number || "Não definido"}
            </p>
          </div>
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span>{project.location || "Local não definido"}</span>
          </div>
          <div className="flex gap-2">
            <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span>{project.responsible_name || "Sem responsável"}</span>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span>
              {dateLabel(project.start_date) || "Início não definido"}
              {" → "}
              {dateLabel(project.end_date) || "Término não definido"}
            </span>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={() => onEdit(project)}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            {!["closed", "archived", "cancelled"].includes(project.status) && (
              <Button
                size="sm"
                variant="outline"
                disabled={isSaving}
                onClick={() => onClose(project)}
              >
                Encerrar
              </Button>
            )}
            {project.status !== "archived" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isSaving}
                onClick={() => onArchive(project)}
              >
                <Archive className="h-4 w-4" />
                Arquivar
              </Button>
            )}
            {!["closed", "archived", "cancelled"].includes(project.status) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={isSaving}
                onClick={() => onToggleActive(project)}
              >
                <Power className="h-4 w-4" />
                {project.is_active ? "Pausar" : "Reativar"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
