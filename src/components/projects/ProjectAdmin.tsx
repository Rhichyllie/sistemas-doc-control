import { useMemo, useState } from "react";
import {
  FolderKanban,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ProjectEmptyState } from "@/components/projects/ProjectEmptyState";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjects } from "@/hooks/useProjects";
import {
  PROJECT_STATUSES,
  PROJECT_TYPE_LABELS,
  buildProjectSearchText,
  getProjectStatusLabel,
  getProjectTypeLabel,
  getProjectTypesByLabel,
} from "@/lib/projectOperationalContext";

function dateLabel(value: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function ProjectAdmin() {
  const catalog = useProjects();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return catalog.projects.filter((project) => {
      if (statusFilter !== "all" && project.status !== statusFilter)
        return false;
      if (typeFilter !== "all") {
        const typesToFilter = getProjectTypesByLabel(typeFilter);
        if (!typesToFilter.includes(project.project_type))
        return false;
      }
      return !query || buildProjectSearchText(project).includes(query);
    });
  }, [catalog.projects, search, statusFilter, typeFilter]);

  const hasFilters =
    Boolean(search.trim()) || statusFilter !== "all" || typeFilter !== "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-3">
            <FolderKanban className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Projetos</h1>
          </div>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Cada biblioteca representa um projeto operacional. Esta tela mostra
            os projetos gerados automaticamente a partir das bibliotecas da fase
            atual.
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
        </div>
      </div>

      {catalog.compatibilityMessage && catalog.schemaMode !== "missing" && (
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
              : "Compatibilidade do catálogo"}
          </AlertTitle>
          <AlertDescription>{catalog.compatibilityMessage}</AlertDescription>
        </Alert>
      )}

      {catalog.error && catalog.schemaMode !== "missing" && (
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
            Você pode visualizar os projetos vinculados à biblioteca. O cadastro
            manual deixou de ser necessário neste fluxo.
          </AlertDescription>
        </Alert>
      )}

      {catalog.canManage && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Projetos vinculados à biblioteca</AlertTitle>
          <AlertDescription>
            Ao criar uma biblioteca, o sistema registra automaticamente o
            projeto correspondente. O cadastro manual de projetos foi desativado
            para manter essa relação 1:1.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-stretch xl:justify-between">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 w-full xl:w-auto xl:flex-1 xl:max-w-3xl">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 w-1.5 rounded-l-2xl bg-gradient-to-b from-sky-200 to-sky-400"
            />
            <div className="pl-2.5">
              <p className="text-sm font-medium text-slate-700">Ativos</p>
              <p className="mt-0.5 text-xs text-slate-500">
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                {
                  catalog.projects.filter(
                    (project) =>
                    project.is_active && project.status === "active",
                  ).length
                }
              </p>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 w-1.5 rounded-l-2xl bg-gradient-to-b from-emerald-200 to-emerald-400"
            />
            <div className="pl-2.5">
              <p className="text-sm font-medium text-slate-700">Pausados</p>
              <p className="mt-0.5 text-xs text-slate-500">
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                {
                  catalog.projects.filter(
                    (project) =>
                      !project.is_active || project.status === "paused",
                  ).length
                }
              </p>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 w-1.5 rounded-l-2xl bg-gradient-to-b from-rose-200 to-rose-400"
            />
            <div className="pl-2.5">
              <p className="text-sm font-medium text-slate-700">Encerrados</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                {
                  catalog.projects.filter((project) =>
                    ["closed", "archived", "cancelled"].includes(project.status),
                  ).length
                }
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-stretch justify-center gap-3">
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar projetos…"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[170px]">
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
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fases</SelectItem>
              {PROJECT_TYPE_LABELS.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {catalog.isLoading ? (
        <Card>
          <CardContent className="flex min-h-56 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando projetos…
          </CardContent>
        </Card>
      ) : filteredProjects.length === 0 ? (
        <ProjectEmptyState
          filtered={hasFilters}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Projetos vinculados</CardTitle>
            <CardDescription>
              Cada linha corresponde a uma biblioteca já criada e ao projeto que
              foi registrado automaticamente para ela.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[900px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px] whitespace-nowrap">Código</TableHead>
                  <TableHead className="w-[280px] whitespace-nowrap">Projeto</TableHead>
                  <TableHead className="w-[120px] whitespace-nowrap">Fase</TableHead>
                  <TableHead className="w-[230px] whitespace-nowrap">Cliente</TableHead>
                  <TableHead className="w-[180px] whitespace-nowrap">Responsável</TableHead>
                  <TableHead className="w-[150px] whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => {
                  return (
                    <TableRow key={project.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono font-medium whitespace-nowrap">
                        {project.code}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div
                          className="truncate"
                          title={
                            project.description
                              ? `${project.name} - ${project.description}`
                              : project.name
                          }
                        >
                          <span className="font-medium">{project.name}</span>
                          {project.description && (
                            <span className="text-muted-foreground">
                              {" · "}
                              {project.description}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {getProjectTypeLabel(project.project_type)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div
                          className="truncate"
                          title={
                            project.contract_number
                              ? `${project.client_name || "Não definido"} · ${project.contract_number}`
                              : (project.client_name || "Não definido")
                          }
                        >
                          <span>{project.client_name || "Não definido"}</span>
                          <span className="text-xs text-muted-foreground">
                            {" · "}
                            {project.contract_number || "Sem contrato"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {project.responsible_name || "Sem responsável"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <ProjectStatusBadge status={project.status} />
                          {!project.is_active && (
                            <Badge variant="secondary">Pausado</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
