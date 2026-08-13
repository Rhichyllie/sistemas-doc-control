import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckSquare2,
  Clock,
  FileCheck2,
  FilePlus2,
  FileStack,
  FileText,
  Filter,
  GitBranch,
  Hash,
  Inbox,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivityInboxPreview } from "@/components/operational/ActivityInboxPreview";
import { DocumentRouterLink } from "@/components/documents/DocumentRouterLink";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type OperationalActivityType,
  useOperationalCockpit,
} from "@/hooks/useOperationalCockpit";
import { useDocumentWorkCenter } from "@/hooks/useDocumentWorkCenter";
import { useOperationalHome } from "@/hooks/useOperationalHome";
import { getDeadlineModeLabel } from "@/lib/operationalCalendar";
import { cn } from "@/lib/utils";

function formatDate(value?: string | null) {
  if (!value) return "Sem prazo";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Prazo inválido";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: value.includes("T") ? "short" : undefined,
  }).format(date);
}

function renderAttentionBody(
  item: {
    title: string
    priority: "critical" | "high" | "medium" | "low"
    documentCode?: string | null
    documentTitle?: string
    documentId: string
    externalLink?: string | null
    origin?: string
  },
  externalOverride: string | null,
) {
  const external = externalOverride ?? item.externalLink ?? null
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-800">{item.title}</p>
        <Badge
          variant={
            item.priority === "critical"
              ? "destructive"
              : item.priority === "high"
                ? "default"
                : "secondary"
          }
        >
          {item.priority === "critical"
            ? "Crítico"
            : item.priority === "high"
              ? "Alto"
              : item.priority === "medium"
                ? "Médio"
                : "Baixo"}
        </Badge>
      </div>
      {(item.documentCode || item.documentTitle) && (
        <div className="mt-1">
          <DocumentRouterLink
            documentId={item.documentId}
            externalLink={external}
            className="line-clamp-2 text-xs font-medium text-slate-600 underline-offset-2 hover:underline"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            {[item.documentCode, item.documentTitle].filter(Boolean).join(" — ")}
          </DocumentRouterLink>
        </div>
      )}
    </>
  )
}

const TYPE_OPTIONS: { value: OperationalActivityType | "all"; label: string }[] =
  [
    { value: "all", label: "Todos os tipos" },
    { value: "approval_pending", label: "Aprovações pendentes" },
    { value: "review_pending", label: "Revisões pendentes" },
    { value: "rejected_for_correction", label: "Correções necessárias" },
    { value: "mention", label: "Menções" },
    { value: "nearing_due", label: "Próximos do prazo" },
    { value: "overdue", label: "Atrasados" },
    { value: "recent_update", label: "Atualizações recentes" },
    { value: "informational", label: "Informativos" },
    { value: "completed_by_me", label: "Concluídas por mim" },
  ];

interface HeroAction {
  label: string;
  target: string;
  icon: LucideIcon;
  managerOnly?: boolean;
  iconBg: string;
  accent: string;
}

const HERO_ACTIONS: HeroAction[] = [
  {
    label: "Novo documento",
    target: "/authenticated/documents",
    icon: FilePlus2,
    iconBg: "bg-transparent",
    accent: "hover:bg-white/10 hover:border-teal-400/40",
  },
  {
    label: "Documento integrado",
    target: "/authenticated/documentos/novo-inteligente",
    icon: FileStack,
    iconBg: "bg-transparent",
    accent: "hover:bg-white/10 hover:border-teal-400/40",
  },
  {
    label: "Modelo de tramitação",
    target: "/authenticated/documentos/tramites",
    icon: GitBranch,
    iconBg: "bg-transparent",
    accent: "hover:bg-white/10 hover:border-teal-400/40",
    managerOnly: true,
  },
  {
    label: "Codificação",
    target: "/authenticated/documentos/codificacao",
    icon: Hash,
    iconBg: "bg-transparent",
    accent: "hover:bg-white/10 hover:border-teal-400/40",
    managerOnly: true,
  },
  {
    label: "Regras documentais",
    target: "/authenticated/documentos/regras",
    icon: FileCheck2,
    iconBg: "bg-transparent",
    accent: "hover:bg-white/10 hover:border-teal-400/40",
    managerOnly: true,
  },
];

interface MetricCard {
  label: string;
  hint: string;
  value: number;
  accent: string;
  badgeLabel?: string;
  badgeTone?: "emerald" | "amber" | "slate";
}

function HeroActionButton({ action }: { action: HeroAction }) {
  const Icon = action.icon;
  return (
    <Button
      asChild
      variant="outline"
      className={cn(
        "group h-auto min-h-[80px] flex-row items-center justify-start gap-3.5 rounded-xl border border-white/10 bg-white/5 px-4 text-left text-white backdrop-blur-sm transition-all hover:text-white",
        action.accent,
      )}
    >
      <Link to={action.target}>
        <Icon className="h-6 w-6 text-teal-400 shrink-0" />
        <span className="text-sm font-medium leading-tight">{action.label}</span>
      </Link>
    </Button>
  );
}

function Metric({ metric }: { metric: MetricCard }) {
  const badgeToneClass =
    metric.badgeTone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : metric.badgeTone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-50 text-slate-600";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1.5 opacity-90",
          metric.accent,
        )}
      />
      <div className="flex items-start justify-between gap-3 pl-3">
        <div className="min-w-0">
          <p className="text-3xl font-semibold tracking-tight text-slate-900">
            {metric.value}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {metric.label}
          </p>
          <p className="mt-1 text-xs text-slate-500">{metric.hint}</p>
        </div>
        {metric.badgeLabel && (
          <Badge
            variant="outline"
            className={cn("shrink-0 border-transparent text-xs font-medium", badgeToneClass)}
          >
            {metric.badgeLabel}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function OperationalHome() {
  const home = useOperationalHome();
  const cockpit = useOperationalCockpit();
  const workCenter = useDocumentWorkCenter();
  const canSeeAllInstances = workCenter.canViewOrganization ?? false;
  const isEmptyP12 =
    workCenter.tramiteStatus === "not_installed" ||
    workCenter.tramiteStatus === "restricted";
  const safeActiveInstances = workCenter.activeInstances ?? [];
  const safeWorkItems = workCenter.workItems ?? [];
  const hasActiveTramiteInstances = safeActiveInstances.length > 0;
  const hasSuggestedTramitesOnly =
    !hasActiveTramiteInstances &&
    safeWorkItems.some((item) => item.type === "suggested_tramite");
  const hasOnlyAttentionAlerts =
    !hasActiveTramiteInstances && !hasSuggestedTramitesOnly;
  const [typeFilter, setTypeFilter] =
    useState<OperationalActivityType | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<
    "all" | "actionable" | "critical"
  >("all");
  const firstName = home.profile?.full_name?.trim().split(/\s+/)[0];
  const currentDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const currentDateCapitalized =
    currentDate.charAt(0).toUpperCase() + currentDate.slice(1);
  const safeActivityItems = cockpit.activityItems ?? [];
  const filteredActivities = useMemo(
    () =>
      safeActivityItems.filter((item) => {
        if (typeFilter !== "all" && item.type !== typeFilter) return false;
        if (priorityFilter === "critical" && item.priority !== "critical") {
          return false;
        }
        if (
          priorityFilter === "actionable" &&
          ["recent_update", "informational", "completed_by_me"].includes(item.type)
        ) {
          return false;
        }
        return true;
      }),
    [safeActivityItems, priorityFilter, typeFilter],
  );
  const attentionItems = useMemo(
    () =>
      safeWorkItems
        .filter((item) => {
          if (item.priority === "critical") return true;
          if (item.type === "attention") return true;
          if (item.type === "suggested_tramite") return true;
          if (item.type === "tramite_step" && !item.responsibleName) return true;
          if (
            (item.type === "tramite_step" || item.type === "approval") &&
            item.dueAt
          ) {
            const due = new Date(item.dueAt);
            const now = new Date();
            const diffMs = due.getTime() - now.getTime();
            const diffDays = Math.ceil(
              diffMs / (1000 * 60 * 60 * 24),
            );
            return diffDays >= 0 && diffDays <= 3;
          }
          return false;
        })
        .slice(0, 8),
    [safeWorkItems],
  );

  const kpis = cockpit.kpis ?? {
    myPending: 0,
    awaitingMyAction: 0,
    rejectedForCorrection: 0,
    nearingReview: 0,
    overdue: 0,
    approvalsPending: 0,
    unreadNotifications: 0,
  };

  const metrics: MetricCard[] = useMemo(() => {
    const inProgress = safeActiveInstances.filter(
      (instance) => (canSeeAllInstances ? true : !instance.isOverdue),
    ).length;
    const reviewPending = kpis.nearingReview ?? 0;
    const operationalAlerts = attentionItems.length;
    return [
      {
        label: "Pendentes de aprovação",
        hint:
          (kpis.approvalsPending ?? 0) > 0
            ? "Sem alteração hoje"
            : "Sem itens para aprovar",
        value: kpis.approvalsPending ?? 0,
        accent: "bg-gradient-to-b from-sky-200 to-sky-400",
      },
      {
        label: canSeeAllInstances
          ? "Fluxos em tramitação (Gestão)"
          : "Em tramitação",
        hint:
          inProgress > 0
            ? `${inProgress} fluxo(s) ativo(s)`
            : "Nenhum fluxo ativo",
        value: inProgress,
        accent: "bg-gradient-to-b from-emerald-200 to-emerald-400",
      },
      {
        label: "Aguardando revisão",
        hint: reviewPending > 0 ? "Sem alteração hoje" : "Sem revisões pendentes",
        value: reviewPending,
        accent: "bg-gradient-to-b from-amber-200 to-amber-400",
        badgeLabel: (kpis.overdue ?? 0) > 0 ? "Atenção" : "Tudo em dia",
        badgeTone: (kpis.overdue ?? 0) > 0 ? "amber" : "emerald",
      },
      {
        label: "Alertas operacionais",
        hint:
          operationalAlerts > 0
            ? `${operationalAlerts} item(s) requerem ação`
            : "Sem itens críticos",
        value: operationalAlerts,
        accent: "bg-gradient-to-b from-rose-200 to-rose-400",
      },
    ];
  }, [kpis, safeActiveInstances, attentionItems.length, canSeeAllInstances]);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#071d3d] via-[#0a2b63] to-[#0f766e] p-6 md:p-8 shadow-xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_55%,rgba(56,189,248,0.12)_75%,rgba(45,212,191,0.18)_100%)]"
        />
        <div className="relative space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
                Olá, {firstName ?? "usuário"}
              </h1>
              <p className="mt-2 text-sm font-medium text-blue-200/80">
                {currentDateCapitalized}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void home.refresh()}
              disabled={home.isLoading}
              className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white rounded-xl px-4 py-2"
            >
              <RefreshCw
                className={cn("h-4 w-4 mr-2", home.isLoading && "animate-spin")}
              />
              Atualizar visão
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {HERO_ACTIONS.filter(
              (action) => !action.managerOnly || home.canManage,
            ).map((action) => (
              <HeroActionButton key={action.label} action={action} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Metric key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-col gap-4 pb-0 md:flex-row md:items-start md:justify-between md:gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Inbox className="h-4.5 w-4.5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold tracking-tight">
                    Caixa de atividades
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-sm">
                    Aprovações, revisões, correções e alertas sob sua ação
                  </CardDescription>
                </div>
              </div>
            </div>
            <Badge
              variant="secondary"
              className="shrink-0 self-start border-sky-100 bg-sky-50 text-sky-700"
            >
              {kpis.myPending ?? 0}{" "}
              {(kpis.myPending ?? 0) === 1 ? "pendência" : "pendências"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Select
                value={typeFilter}
                onValueChange={(value) =>
                  setTypeFilter(value as OperationalActivityType | "all")
                }
              >
                <SelectTrigger
                  aria-label="Filtrar por tipo"
                  className="md:w-[220px]"
                >
                  <Filter className="mr-2 h-4 w-4 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={priorityFilter}
                onValueChange={(value) =>
                  setPriorityFilter(value as typeof priorityFilter)
                }
              >
                <SelectTrigger
                  aria-label="Filtrar por prioridade"
                  className="md:w-[220px]"
                >
                  <Clock className="mr-2 h-4 w-4 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as prioridades</SelectItem>
                  <SelectItem value="actionable">
                    Somente itens acionáveis
                  </SelectItem>
                  <SelectItem value="critical">Somente atrasados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ActivityInboxPreview
              items={filteredActivities}
              loading={cockpit.isLoading}
              className="border-0 shadow-none"
              title=""
              description=""
              emptyTitle={
                isEmptyP12
                  ? "Ciclo de execução de trâmites (P12.1) ainda não instalado"
                  : hasSuggestedTramitesOnly
                    ? "Trâmites sugeridos aguardando início"
                    : hasActiveTramiteInstances
                      ? "Existem fluxos em andamento, nada pendente de você"
                      : hasOnlyAttentionAlerts
                        ? "Sem aprovações pendentes de sua ação"
                        : "Nenhuma pendência agora"
              }
              emptyDescription={
                isEmptyP12
                  ? "No Supabase, abra o SQL Editor e execute a migration 20260630121000_p12_1_document_tramite_execution.sql. Isso cria as tabelas de instâncias e etapas de aprovação."
                  : hasSuggestedTramitesOnly
                    ? "Documentos como DOC-052563 já possuem modelo de trâmite recomendado — inicie a execução para começar a aprovação."
                    : hasActiveTramiteInstances
                      ? "Assim que um passo for atribuído diretamente a você ou ao seu grupo de aprovação, ele aparecerá aqui."
                      : hasOnlyAttentionAlerts
                        ? "Os itens listados em Atenção operacional exigem reclassificação — após resolver, o fluxo de aprovação começará normalmente."
                        : "Quando houver aprovações ou documentos aguardando sua ação, eles aparecem aqui."
              }
              emptyIcon={
                isEmptyP12 ? (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                ) : hasSuggestedTramitesOnly ? (
                  <GitBranch className="h-5 w-5 text-indigo-500" />
                ) : hasActiveTramiteInstances ? (
                  <CheckSquare2 className="h-5 w-5 text-emerald-500" />
                ) : hasOnlyAttentionAlerts ? (
                  <Filter className="h-5 w-5 text-slate-400" />
                ) : undefined
              }
              emptyPrimaryAction={
                isEmptyP12 ? undefined : (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="mt-3 border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
                  >
                    <Link to="/authenticated/documents">
                      Criar novo documento
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )
              }
              showAllLink
            />
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
              Atenção operacional
            </CardTitle>
            <CardDescription>
              Pontos que exigem decisão ou reclassificação
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {workCenter.isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))
            ) : attentionItems.length ? (
              attentionItems.map((item) => {
                const itemExternal = (item as any).externalLink ?? null
                const cardClass =
                  "block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
                const hash =
                  item.origin === "tramite"
                    ? "document-tramite-execution"
                    : undefined
                const Wrapper = itemExternal ? (
                  <a
                    key={item.id}
                    href={itemExternal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cardClass}
                  >
                    {renderAttentionBody(item, itemExternal)}
                  </a>
                ) : (
                  <Link
                    key={item.id}
                    to="/authenticated/documents/$documentId"
                    params={{ documentId: item.documentId }}
                    hash={hash}
                    className={cardClass}
                  >
                    {renderAttentionBody(item, null)}
                  </Link>
                )
                return Wrapper
              })
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-800">
                  Nenhum alerta no momento
                </p>
                <p className="mt-1.5 max-w-xs text-xs text-slate-500">
                  Documentos vencidos, sem responsável ou fora de padrão
                  aparecerão aqui.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
