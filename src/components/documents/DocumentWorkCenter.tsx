import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  FileEdit,
  FileText,
  Filter,
  FolderKanban,
  GitBranch,
  Inbox,
  LineChart,
  RefreshCw,
  Search,
  ShieldAlert,
  Workflow,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentRouterLink } from "@/components/documents/DocumentRouterLink";
import { useDocumentWorkCenter } from "@/hooks/useDocumentWorkCenter";
import type { DocumentWorkCenterInstance } from "@/hooks/useDocumentWorkCenter";
import type { Document } from "@/hooks/useDocuments";
import type {
  DocumentWorkItem,
  DocumentWorkItemOrigin,
  DocumentWorkItemPriority,
  DocumentWorkItemType,
} from "@/lib/documentWorkCenter";
import { getDeadlineModeLabel } from "@/lib/operationalCalendar";

type ScopeFilter = "mine" | "organization";

const TYPE_LABELS: Record<DocumentWorkItemType, string> = {
  tramite_step: "Etapa de trâmite",
  approval: "Aprovação formal",
  formal_revision: "Revisão formal",
  draft: "Rascunho",
  review_due: "Revisão próxima",
  suggested_tramite: "Trâmite sugerido",
  attention: "Atenção",
};

const ORIGIN_LABELS: Record<DocumentWorkItemOrigin, string> = {
  tramite: "Trâmite",
  approval: "Aprovação",
  revision: "Revisão",
  creation: "Criação",
};

const PRIORITY_LABELS: Record<DocumentWorkItemPriority, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

function priorityVariant(priority: DocumentWorkItemPriority) {
  if (priority === "critical") return "destructive" as const;
  if (priority === "high") return "default" as const;
  return "secondary" as const;
}

function formatDate(value?: string | null) {
  if (!value) return "Sem prazo";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Prazo inválido";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: value.includes("T") ? "short" : undefined,
  }).format(date);
}

function itemIcon(type: DocumentWorkItemType) {
  if (type === "tramite_step" || type === "suggested_tramite") return Workflow;
  if (type === "approval") return ClipboardCheck;
  if (type === "formal_revision" || type === "review_due") return CalendarClock;
  if (type === "draft") return FileEdit;
  return AlertTriangle;
}

function WorkItemCard({ item }: { item: DocumentWorkItem }) {
  const Icon = itemIcon(item.type);
  const focusTramite =
    item.origin === "tramite" ? "document-tramite-execution" : undefined;
  const actionButton = item.externalLink ? (
    <Button asChild size="sm">
      <a
        href={item.externalLink}
        target="_blank"
        rel="noopener noreferrer"
      >
        {item.actionLabel}
        <ArrowRight className="h-4 w-4" />
      </a>
    </Button>
  ) : (
    <Button asChild size="sm">
      <Link
        to="/authenticated/documents/$documentId"
        params={{ documentId: item.documentId }}
        hash={focusTramite}
      >
        {item.actionLabel}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
  return (
    <div className="rounded-xl border bg-background p-4 transition-colors hover:border-primary/40">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{item.title}</p>
              <Badge variant={priorityVariant(item.priority)}>
                {PRIORITY_LABELS[item.priority]}
              </Badge>
              <Badge variant="outline">{TYPE_LABELS[item.type]}</Badge>
            </div>
            {(item.documentCode || item.documentTitle) && (
              <div className="mt-1">
                <DocumentRouterLink
                  documentId={item.documentId}
                  externalLink={item.externalLink}
                  hash={focusTramite}
                  className="text-sm font-medium text-muted-foreground underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  {[item.documentCode, item.documentTitle]
                    .filter(Boolean)
                    .join(" — ")}
                </DocumentRouterLink>
              </div>
            )}
            <p className="mt-2 text-sm">{item.description}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {item.projectName && (
                <span className="inline-flex items-center gap-1">
                  <FolderKanban className="h-3.5 w-3.5" />
                  {item.projectName}
                </span>
              )}
              <span>{item.docType}</span>
              <span>{item.area}</span>
              <span>{item.statusLabel}</span>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {formatDate(item.dueAt)}
              </span>
              {item.dueAt && (
                <span>
                  {getDeadlineModeLabel(item.deadlineMode ?? "simple_date")}
                </span>
              )}
              {item.responsibleName && (
                <span>Responsável: {item.responsibleName}</span>
              )}
            </div>
            {(item.dueAtSuggested || item.slaPolicyName) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {item.dueAtSuggested && (
                  <Badge variant="secondary">
                    Prazo sugerido · não persistido
                  </Badge>
                )}
                {item.slaPolicyName && (
                  <Badge variant="outline">
                    Política: {item.slaPolicyName}
                  </Badge>
                )}
              </div>
            )}
            {item.assigneeUnavailable && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="destructive">
                  {item.absenceLabel ?? "Responsável ausente"}
                </Badge>
                {item.substituteName ? (
                  <Badge variant="secondary">
                    Substituto: {item.substituteName}
                  </Badge>
                ) : (
                  <Badge variant="outline">Sem substituto válido</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  A etapa não foi reatribuída automaticamente.
                </span>
              </div>
            )}
            {(item.notificationCount ||
              item.escalated ||
              item.delegateCanAct) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {Boolean(item.notificationCount) && (
                  <Badge variant="outline">
                    {item.notificationCount} notificação(ões)
                  </Badge>
                )}
                {item.escalated && (
                  <Badge variant="destructive">Escalonado</Badge>
                )}
                {item.delegateCanAct && (
                  <Badge variant="secondary">
                    Substituto pode agir com auditoria
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {Boolean(item.notificationCount) && (
            <Button asChild size="sm" variant="outline">
              <Link to="/authenticated/notificacoes">Ver notificações</Link>
            </Button>
          )}
          {actionButton}
        </div>
      </div>
    </div>
  );
}

export function DocumentWorkCenter() {
  const rawWorkCenter = useDocumentWorkCenter() as any;
  const workCenter = (rawWorkCenter ?? {
    workItems: [],
    groups: {
      myPending: [],
      overdue: [],
      tramite: [],
      approval: [],
      review: [],
      creation: [],
    },
    activeInstances: [],
    allInstancesIsManager: false,
    recentDocuments: [],
    documentsWithoutSlaPolicy: 0,
    absentWithoutSubstitute: 0,
    activeSubstitutions: 0,
    deadlinesWithAbsentAssignee: 0,
    criticalUnreadNotifications: 0,
    openEscalations: 0,
    profile: null,
    canViewOrganization: false,
    isLoading: false,
  }) as NonNullable<typeof rawWorkCenter>;

  const safeWorkItems: DocumentWorkItem[] = Array.isArray(workCenter.workItems)
    ? (workCenter.workItems as DocumentWorkItem[])
    : [];
  const safeActiveInstances: any[] = Array.isArray(workCenter.activeInstances)
    ? (workCenter.activeInstances as any[])
    : [];
  const safeRecentDocuments: Document[] = Array.isArray(workCenter.recentDocuments)
    ? (workCenter.recentDocuments as Document[])
    : [];

  const [scope, setScope] = useState<ScopeFilter>("mine");
  const [search, setSearch] = useState("");
  const [urgency, setUrgency] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [docType, setDocType] = useState("all");
  const [area, setArea] = useState("all");
  const [status, setStatus] = useState("all");
  const [origin, setOrigin] = useState("all");

  const scopedItems = useMemo(
    () =>
      safeWorkItems.filter(
        (item) => scope === "organization" || item.isMine,
      ),
    [scope, safeWorkItems],
  );
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return scopedItems.filter((item) => {
      if (
        normalizedSearch &&
        ![item.documentCode, item.documentTitle, item.title, item.projectName]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase("pt-BR").includes(normalizedSearch),
          )
      ) {
        return false;
      }
      if (urgency === "overdue" && item.priority !== "critical") return false;
      if (projectId !== "all" && item.projectId !== projectId) return false;
      if (docType !== "all" && item.docType !== docType) return false;
      if (area !== "all" && item.area !== area) return false;
      if (status !== "all" && item.documentStatus !== status) return false;
      if (origin !== "all" && item.origin !== origin) return false;
      return true;
    });
  }, [area, docType, origin, projectId, scopedItems, search, status, urgency]);

  const scopedInstances = safeActiveInstances.filter(
    (instance) => scope === "organization" || instance.isMine,
  );
  const attentionItems = scopedInstances
    .filter(
      (item) =>
        item.priority === "critical" ||
        item.type === "attention" ||
        item.type === "suggested_tramite" ||
        (item.type === "tramite_step" && !item.responsibleName),
    )
    .slice(0, 6);
  const recentDocuments = safeRecentDocuments.filter(
    (document) =>
      scope === "organization" || document.author_id === workCenter.profile?.id,
  );
  const docTypes = [
    ...new Set(safeWorkItems.map((item) => item.docType)),
  ]
    .filter(Boolean)
    .sort();
  const areas = [...new Set(safeWorkItems.map((item) => item.area))]
    .filter(Boolean)
    .sort();
  const statuses = [
    ...new Set(safeWorkItems.map((item) => item.documentStatus)),
  ]
    .filter(Boolean)
    .sort();
  const overdueCount = scopedItems.filter(
    (item) => item.priority === "critical",
  ).length;
  const draftCount = scopedItems.filter((item) => item.type === "draft").length;
  const reviewCount = scopedItems.filter(
    (item) => item.type === "review_due",
  ).length;
  const awaitingNextStep = scopedItems.filter((item) =>
    ["suggested_tramite", "formal_revision"].includes(item.type),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="outline">Operação documental</Badge>
            {workCenter.notificationStatus === "enterprise" ? (
              <Badge variant="secondary">Notificações ativas</Badge>
            ) : workCenter.notificationStatus === "legacy" ? (
              <Badge variant="outline">Notificações em fallback</Badge>
            ) : workCenter.notificationStatus === "loading" ? (
              <Badge variant="outline">Verificando notificações</Badge>
            ) : (
              <Badge variant="outline">Notificações indisponíveis</Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Central Documental
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Veja pendências, trâmites em andamento, documentos sem próximo passo
            e revisões próximas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/authenticated/indicadores">
              <LineChart className="mr-2 h-4 w-4" />
              Ver indicadores deste conjunto
            </Link>
          </Button>
          {workCenter.canViewOrganization && (
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as ScopeFilter)}
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Minhas pendências</SelectItem>
                <SelectItem value="organization">Toda a organização</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void workCenter.refresh()}
            disabled={workCenter.isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                workCenter.isLoading ? "animate-spin" : ""
              }`}
            />
            Atualizar
          </Button>
        </div>
      </div>

      {workCenter.error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a Central</AlertTitle>
          <AlertDescription>{workCenter.error}</AlertDescription>
        </Alert>
      )}
      {(Array.isArray((workCenter as any).warnings) ? (workCenter as any).warnings as string[] : []).map((warning: string) => (
        <Alert key={warning}>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Fonte em modo de compatibilidade</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          {
            label: "Minhas pendências",
            value: workCenter.groups.myPending.length,
            icon: Inbox,
            detail: "Itens em que você pode agir",
          },
          {
            label: "Atrasados",
            value: overdueCount,
            icon: AlertTriangle,
            detail: "Prazos vencidos no escopo atual",
          },
          {
            label: "Em trâmite",
            value: scopedInstances.length,
            icon: GitBranch,
            detail: "Execuções documentais ativas",
          },
          {
            label: "Rascunhos",
            value: draftCount,
            icon: FileEdit,
            detail: "Documentos ainda em preparação",
          },
          {
            label: "Próximas revisões",
            value: reviewCount,
            icon: CalendarClock,
            detail: "Revisões em até 30 dias ou vencidas",
          },
          {
            label: "Aguardando próximo passo",
            value: awaitingNextStep,
            icon: Clock3,
            detail: "Rascunhos, revisões e sugestões",
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-3xl font-semibold">{metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metric.detail}
                  </p>
                </div>
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros operacionais
          </CardTitle>
          <CardDescription>
            Refine a caixa de trabalho sem alterar os documentos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por documento, código, projeto ou pendência"
            />
          </div>
          <Select value={urgency} onValueChange={setUrgency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os prazos</SelectItem>
              <SelectItem value="overdue">Somente atrasados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              {Object.entries(ORIGIN_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {workCenter.projectsAvailable && (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os projetos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                {(Array.isArray((workCenter as any).projects) ? (workCenter as any).projects as any[] : []).map((project: any) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code ? `${project.code} · ` : ""}
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {docTypes.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger>
              <SelectValue placeholder="Todas as áreas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as áreas</SelectItem>
              {areas.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {statuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.7fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Minha caixa de trabalho</CardTitle>
            <CardDescription>
              {filteredItems.length} item(ns) encontrado(s) para os filtros
              atuais.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {workCenter.isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-32 w-full" />
              ))
            ) : filteredItems.length ? (
              filteredItems.map((item) => (
                <WorkItemCard key={item.id} item={item} />
              ))
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <Inbox className="mx-auto h-9 w-9 text-muted-foreground" />
                <p className="mt-3 font-medium">
                  Nenhuma pendência para os filtros atuais
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajuste projeto, origem ou prazo para ampliar a consulta.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Atenção operacional
              </CardTitle>
              <CardDescription>
                Pontos que precisam de decisão ou regularização.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {attentionItems.length ? (
                attentionItems.map((item) => (
                  <Link
                    key={item.id}
                    to="/authenticated/documents/$documentId"
                    params={{ documentId: item.documentId }}
                    hash={
                      item.origin === "tramite"
                        ? "document-tramite-execution"
                        : undefined
                    }
                    className="block rounded-lg border p-3 hover:border-primary"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Badge variant={priorityVariant(item.priority as any)}>
                        {PRIORITY_LABELS[item.priority as DocumentWorkItemPriority]}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {[item.documentCode, item.documentTitle]
                        .filter(Boolean)
                        .join(" — ")}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                  Nenhum alerta operacional no escopo atual.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documentos recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentDocuments.length ? (
                recentDocuments.map((document) => (
                  <Link
                    key={document.id}
                    to="/authenticated/documents/$documentId"
                    params={{ documentId: document.id }}
                    className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {document.code || "Sem código"} — {document.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {document.status.replaceAll("_", " ")}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum documento recente neste escopo.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Trâmites em execução
          </CardTitle>
          <CardDescription>
            Progresso das instâncias ativas. As ações continuam no detalhe do
            documento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workCenter.isLoading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          ) : scopedInstances.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {scopedInstances.map((instance) => (
                <div key={instance.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{instance.templateName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[instance.documentCode, instance.documentTitle]
                          .filter(Boolean)
                          .join(" — ")}
                      </p>
                    </div>
                    <Badge
                      variant={instance.isOverdue ? "destructive" : "secondary"}
                    >
                      {instance.isOverdue ? "Atrasado" : "Em execução"}
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Progress value={instance.progress} />
                    <span className="text-sm font-medium">
                      {instance.progress}%
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {instance.activeStepLabels.length
                      ? `Etapa ativa: ${instance.activeStepLabels.join(", ")}`
                      : "Sem etapa ativa legível."}
                    {" · "}
                    {formatDate(instance.dueAt)}
                  </p>
                  {instance.dueAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {getDeadlineModeLabel(instance.deadlineMode)}
                      {instance.dueAtSuggested
                        ? " · prazo sugerido, não persistido"
                        : ""}
                    </p>
                  )}
                  <Button asChild size="sm" variant="outline" className="mt-4">
                    <Link
                      to="/authenticated/documents/$documentId"
                      params={{ documentId: instance.documentId }}
                      hash="document-tramite-execution"
                    >
                      Abrir execução
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <GitBranch className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Nenhum trâmite em execução</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A Central não inicia trâmites automaticamente.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
