import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleOff,
  Code2,
  FilePlus2,
  FileStack,
  FolderKanban,
  Gauge,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  RefreshCw,
  ScrollText,
  Settings2,
  Sparkles,
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useOperationalHome } from "@/hooks/useOperationalHome";
import type {
  OperationalCapability,
  OperationalCapabilityStatus,
  OperationalHealthCard,
  OperationalRisk,
  OperationalTarget,
} from "@/lib/operationalHome";

const HEALTH_ICONS: Record<OperationalHealthCard["id"], typeof Gauge> = {
  active_documents: FileStack,
  critical_pending: AlertTriangle,
  active_tramites: GitBranch,
  upcoming_reviews: CalendarClock,
  drafts: FilePlus2,
  without_next_step: ListTodo,
};

const CAPABILITY_LABELS: Record<
  OperationalCapabilityStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  available: { label: "Disponível", variant: "default" },
  configure: { label: "Precisa configurar", variant: "secondary" },
  not_installed: { label: "Não instalado", variant: "outline" },
  attention: { label: "Atenção", variant: "destructive" },
};

function healthBorder(status: OperationalHealthCard["status"]) {
  if (status === "critical") return "border-destructive/40";
  if (status === "attention") return "border-amber-300";
  return "border-emerald-200";
}

function riskVariant(risk: OperationalRisk) {
  return risk.severity === "critical"
    ? ("destructive" as const)
    : ("secondary" as const);
}

function HealthCard({ card }: { card: OperationalHealthCard }) {
  const Icon = HEALTH_ICONS[card.id];
  return (
    <Link to={card.target} className="group">
      <Card
        className={`h-full transition-all hover:-translate-y-0.5 hover:shadow-md ${healthBorder(
          card.status,
        )}`}
      >
        <CardContent className="flex items-start justify-between gap-3 p-5">
          <div>
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-3xl font-semibold">{card.value}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {card.description}
            </p>
          </div>
          <div className="rounded-xl bg-primary/10 p-2 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function RiskLine({ risk }: { risk: OperationalRisk }) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 gap-3">
        <div
          className={`mt-0.5 rounded-lg p-2 ${
            risk.severity === "critical"
              ? "bg-destructive/10 text-destructive"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{risk.title}</p>
            <Badge variant={riskVariant(risk)}>{risk.count}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {risk.description}
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="ghost">
        <Link to={risk.target}>
          Ver detalhes
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function CapabilityLine({ capability }: { capability: OperationalCapability }) {
  const status = CAPABILITY_LABELS[capability.status];
  const Icon =
    capability.status === "available"
      ? CheckCircle2
      : capability.status === "not_installed"
        ? CircleOff
        : Settings2;
  return (
    <Link
      to={capability.target}
      className="flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary"
    >
      <div className="flex min-w-0 gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{capability.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {capability.description}
          </p>
        </div>
      </div>
      <Badge variant={status.variant} className="shrink-0">
        {status.label}
      </Badge>
    </Link>
  );
}

interface QuickAction {
  label: string;
  description: string;
  target: OperationalTarget | "/authenticated/documentos/novo-inteligente";
  icon: typeof Gauge;
  managerOnly?: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Novo Documento",
    description: "Abrir cadastro documental comum.",
    target: "/authenticated/documents",
    icon: FilePlus2,
  },
  {
    label: "Novo Documento Inteligente",
    description: "Criar com políticas e orientação.",
    target: "/authenticated/documentos/novo-inteligente",
    icon: Sparkles,
  },
  {
    label: "Central Documental",
    description: "Executar pendências e próximos passos.",
    target: "/authenticated/documentos/central",
    icon: LayoutDashboard,
  },
  {
    label: "Projetos",
    description: "Gerenciar contexto operacional.",
    target: "/authenticated/projetos",
    icon: FolderKanban,
  },
  {
    label: "Modelador de Trâmites",
    description: "Criar e publicar modelos.",
    target: "/authenticated/documentos/tramites",
    icon: Workflow,
    managerOnly: true,
  },
  {
    label: "Codificação",
    description: "Configurar padrões documentais.",
    target: "/authenticated/documentos/codificacao",
    icon: Code2,
    managerOnly: true,
  },
  {
    label: "Regras Documentais",
    description: "Definir políticas de criação.",
    target: "/authenticated/documentos/regras",
    icon: ScrollText,
    managerOnly: true,
  },
];

export function OperationalHome() {
  const home = useOperationalHome();
  const firstName = home.profile?.full_name?.trim().split(/\s+/)[0];
  const currentDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const healthLabel =
    home.status === "critical"
      ? "Risco crítico"
      : home.status === "attention"
        ? "Requer atenção"
        : "Operação estável";
  const healthVariant =
    home.status === "critical"
      ? ("destructive" as const)
      : home.status === "attention"
        ? ("secondary" as const)
        : ("default" as const);

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.08] via-background to-background p-6 md:p-8">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Visão executiva</Badge>
              <Badge variant={healthVariant}>{healthLabel}</Badge>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              {firstName ? `Olá, ${firstName}` : "Home Operacional"}
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Visão executiva da operação documental.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {home.org?.name ?? "Organização não identificada"} ·{" "}
              <span className="capitalize">{currentDate}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void home.refresh()}
              disabled={home.isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${home.isLoading ? "animate-spin" : ""}`}
              />
              Atualizar visão
            </Button>
            <Button asChild>
              <Link to="/authenticated/documentos/central">
                Abrir Central Documental
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {home.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Parte da visão operacional está indisponível</AlertTitle>
          <AlertDescription>{home.error}</AlertDescription>
        </Alert>
      )}
      {home.warnings.length > 0 && (
        <Alert>
          <Settings2 className="h-4 w-4" />
          <AlertTitle>Operação em modo de compatibilidade</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {home.warnings.slice(0, 4).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Saúde documental</h2>
          <p className="text-sm text-muted-foreground">
            Indicadores resumidos com acesso direto às telas operacionais.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {home.isLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-xl" />
              ))
            : home.healthCards.map((card) => (
                <HealthCard key={card.id} card={card} />
              ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Radar de risco
            </CardTitle>
            <CardDescription>
              Os principais sinais executivos — sem transformar a Home em caixa
              de tarefas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {home.isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-24" />
              ))
            ) : home.risks.length ? (
              home.risks.map((risk) => <RiskLine key={risk.id} risk={risk} />)
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-5 w-5" />
                  Nenhum risco executivo relevante
                </div>
                <p className="mt-1 text-sm">
                  A operação não possui atrasos ou lacunas críticas
                  consolidadas.
                </p>
              </div>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link to="/authenticated/documentos/central">
                Ver na Central Documental
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card
          className={
            home.recommendation.severity === "critical"
              ? "border-destructive/40"
              : home.recommendation.severity === "warning"
                ? "border-amber-300"
                : "border-emerald-200"
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Próximo movimento recomendado
            </CardTitle>
            <CardDescription>
              Recomendação determinística baseada na situação atual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {home.isLoading ? (
              <Skeleton className="h-40" />
            ) : (
              <div className="rounded-xl bg-muted/40 p-5">
                <p className="text-lg font-semibold">
                  {home.recommendation.title}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {home.recommendation.description}
                </p>
                <Button asChild className="mt-5">
                  <Link to={home.recommendation.target}>
                    {home.recommendation.actionLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Jornada rápida</h2>
          <p className="text-sm text-muted-foreground">
            Acesse os módulos principais sem percorrer o menu completo.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.filter(
            (action) => !action.managerOnly || home.canManage,
          ).map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                to={action.target}
                className="group rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-lg bg-muted p-2 group-hover:bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="mt-4 font-medium">{action.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {action.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <CardTitle>Maturidade da operação</CardTitle>
                <CardDescription>
                  Disponibilidade e configuração dos módulos documentais.
                </CardDescription>
              </div>
              <Badge variant="outline">
                {home.maturityPercent}% configurado
              </Badge>
            </div>
            <Progress value={home.maturityPercent} className="mt-3" />
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {home.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-20" />
                ))
              : home.capabilities.map((capability) => (
                  <CapabilityLine key={capability.id} capability={capability} />
                ))}
          </CardContent>
        </Card>

        <Card className="border-primary/25 bg-primary/[0.035]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-primary" />
              Central Documental
            </CardTitle>
            <CardDescription>
              A Home mostra a saúde. A Central organiza a execução.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Use a Central para abrir pendências, navegar para etapas ativas,
              tratar documentos atrasados e confirmar o início de trâmites
              sugeridos.
            </p>
            <Button asChild className="mt-5 w-full">
              <Link to="/authenticated/documentos/central">
                Ir para a Central Documental
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
