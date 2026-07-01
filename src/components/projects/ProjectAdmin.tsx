import { useMemo, useState } from "react";
import {
  FolderKanban,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { ProjectEmptyState } from "@/components/projects/ProjectEmptyState";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { ProjectSummaryCard } from "@/components/projects/ProjectSummaryCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects } from "@/hooks/useProjects";
import {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  buildProjectSearchText,
  getProjectStatusLabel,
  getProjectTypeLabel,
  type ProjectInput,
  type ProjectOperationalContext,
} from "@/lib/projectOperationalContext";

export function ProjectAdmin() {
  const catalog = useProjects();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectOperationalContext | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return catalog.projects.filter((project) => {
      if (statusFilter !== "all" && project.status !== statusFilter)
        return false;
      if (typeFilter !== "all" && project.project_type !== typeFilter)
        return false;
      return !query || buildProjectSearchText(project).includes(query);
    });
  }, [catalog.projects, search, statusFilter, typeFilter]);

  function openNew() {
    catalog.clearError();
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(project: ProjectOperationalContext) {
    catalog.clearError();
    setEditing(project);
    setFormOpen(true);
  }

  async function saveProject(input: ProjectInput) {
    const success = editing
      ? await catalog.updateProject(editing.id, input)
      : await catalog.createProject(input);
    if (success) {
      toast.success(editing ? "Projeto atualizado." : "Projeto criado.");
    }
    return success;
  }

  async function updateState(
    action: () => Promise<boolean>,
    successMessage: string,
  ) {
    const success = await action();
    if (success) toast.success(successMessage);
  }

  const hasFilters =
    Boolean(search.trim()) || statusFilter !== "all" || typeFilter !== "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Badge variant="outline" className="mb-3">
            Contextos operacionais
          </Badge>
          <div className="flex items-center gap-3">
            <FolderKanban className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Projetos</h1>
          </div>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Organize projetos, obras, contratos, unidades e frentes de trabalho
            usados por documentos e códigos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={catalog.isLoading}
            onClick={() => catalog.refresh()}
          >
            <RefreshCw
              className={`h-4 w-4 ${catalog.isLoading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
          {catalog.canManage && (
            <Button
              onClick={openNew}
              disabled={!catalog.canUseEnterpriseProjects}
            >
              <Plus className="h-4 w-4" />
              Novo projeto
            </Button>
          )}
        </div>
      </div>

      {catalog.compatibilityMessage && (
        <Alert
          variant={
            ["denied", "error"].includes(catalog.diagnostic)
              ? "destructive"
              : "default"
          }
        >
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>
            {catalog.diagnostic === "legacy"
              ? "Catálogo legado em modo de compatibilidade"
              : catalog.diagnostic === "not_installed"
                ? "Projetos ainda não disponíveis"
                : "Compatibilidade do catálogo"}
          </AlertTitle>
          <AlertDescription>{catalog.compatibilityMessage}</AlertDescription>
        </Alert>
      )}

      {catalog.error && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível concluir a operação</AlertTitle>
          <AlertDescription>{catalog.error}</AlertDescription>
        </Alert>
      )}

      {!catalog.canManage && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Consulta operacional</AlertTitle>
          <AlertDescription>
            Você pode visualizar os projetos. Criação e alterações são
            exclusivas para administradores e gestores.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Contextos</p>
            <p className="mt-1 text-2xl font-semibold">
              {catalog.projects.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Ativos</p>
            <p className="mt-1 text-2xl font-semibold">
              {
                catalog.projects.filter(
                  (project) => project.is_active && project.status === "active",
                ).length
              }
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              Documentos vinculados
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {catalog.projects.reduce(
                (total, project) => total + project.document_count,
                0,
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Localizar contexto</CardTitle>
          <CardDescription>
            Busque por código, nome, cliente, contrato, local ou responsável.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar projetos…"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {PROJECT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {getProjectStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {PROJECT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {getProjectTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {catalog.isLoading ? (
        <Card>
          <CardContent className="flex min-h-56 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando projetos…
          </CardContent>
        </Card>
      ) : filteredProjects.length === 0 ? (
        <ProjectEmptyState
          canManage={catalog.canManage && catalog.canUseEnterpriseProjects}
          filtered={hasFilters}
          onCreate={openNew}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredProjects.map((project) => (
            <ProjectSummaryCard
              key={project.id}
              project={project}
              canManage={catalog.canManage && catalog.canUseEnterpriseProjects}
              isSaving={catalog.isSaving}
              onEdit={openEdit}
              onToggleActive={(item) =>
                void updateState(
                  () => catalog.setProjectActive(item, !item.is_active),
                  item.is_active ? "Projeto pausado." : "Projeto reativado.",
                )
              }
              onClose={(item) =>
                void updateState(
                  () => catalog.closeProject(item),
                  "Projeto encerrado.",
                )
              }
              onArchive={(item) =>
                void updateState(
                  () => catalog.archiveProject(item),
                  "Projeto arquivado.",
                )
              }
            />
          ))}
        </div>
      )}

      <ProjectForm
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editing}
        existingCodes={catalog.projects
          .filter((project) => project.has_explicit_code)
          .map((project) => project.code)}
        users={catalog.users}
        isSaving={catalog.isSaving}
        submissionError={catalog.error}
        onSubmit={saveProject}
      />
    </div>
  );
}
