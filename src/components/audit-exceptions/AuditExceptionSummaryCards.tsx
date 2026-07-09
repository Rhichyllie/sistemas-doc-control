import {
  AlertOctagon,
  CheckCircle2,
  CircleSlash,
  Clock3,
  Eye,
  ShieldAlert,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatAuditExceptionDate,
  type AuditReconciliationOverview,
} from "@/lib/auditExceptions";

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("pt-BR") : "0";
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: unknown;
  description: string;
  icon: typeof ShieldAlert;
}) {
  return (
    <Card>
      <CardHeader className="space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{count(value)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function AuditExceptionSummaryCards({
  overview,
}: {
  overview: AuditReconciliationOverview | null;
}) {
  const bySeverity = overview?.counts.bySeverity ?? {};
  const byStatus = overview?.counts.byStatus ?? {};
  const latestRun = overview?.latestRun;
  const coverage = overview?.sourceCoverage ?? [];
  const availableSources = coverage.filter(
    (source) => source.status === "available" || source.status === "limited",
  ).length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <SummaryCard
        title="Abertas"
        value={byStatus.open}
        description="Exceções ainda pendentes."
        icon={ShieldAlert}
      />
      <SummaryCard
        title="Críticas"
        value={bySeverity.critical}
        description="Risco alto para auditoria."
        icon={AlertOctagon}
      />
      <SummaryCard
        title="Altas"
        value={bySeverity.high}
        description="Investigar antes do piloto."
        icon={Clock3}
      />
      <SummaryCard
        title="Reconhecidas"
        value={byStatus.acknowledged}
        description="Assumidas para investigação."
        icon={Eye}
      />
      <SummaryCard
        title="Resolvidas"
        value={byStatus.resolved}
        description="Encerradas com nota."
        icon={CheckCircle2}
      />
      <SummaryCard
        title="Ignoradas"
        value={byStatus.ignored}
        description="Aceitas como exceção."
        icon={CircleSlash}
      />
      <Card>
        <CardHeader className="space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Última reconciliação
          </CardTitle>
          <CardDescription className="text-xs">
            {availableSources} de {coverage.length || 0} fontes cobertas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-semibold">
            {latestRun ? formatAuditExceptionDate(latestRun.createdAt) : "Nunca executada"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {latestRun?.status ?? "Sem histórico"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
