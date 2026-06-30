import {
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { SchemaCheckCard } from "@/components/schema/SchemaCheckCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  SchemaDoctorCapabilities,
  SchemaDoctorOverallStatus,
  SchemaDoctorReport,
} from "@/hooks/useSchemaDoctor";

const MODULE_ORDER = [
  "Workflow Enterprise",
  "Grupos de Aprovação",
  "Correção/Reenvio",
  "Revisão Formal",
  "Publicação Transacional",
];

const CAPABILITIES: Array<{
  key: keyof SchemaDoctorCapabilities;
  label: string;
}> = [
  { key: "canUseWorkflowEnterprise", label: "Workflow enterprise" },
  { key: "canUseGroups", label: "Grupos de aprovação" },
  { key: "canUseCorrectionCycle", label: "Correção e reenvio" },
  { key: "canUseFormalRevision", label: "Revisão formal" },
  { key: "canUseTransactionalPublish", label: "Publicação transacional" },
];

const STATUS_CONTENT: Record<
  SchemaDoctorOverallStatus,
  { title: string; description: string; badge: string }
> = {
  ok: {
    title: "Schema enterprise pronto.",
    description:
      "Os módulos enterprise verificados estão disponíveis neste ambiente.",
    badge: "OK",
  },
  warning: {
    title:
      "Alguns recursos possuem fallback, mas o ambiente não está completo.",
    description:
      "Revise os itens pendentes antes de depender dos recursos enterprise em produção.",
    badge: "Atenção",
  },
  critical: {
    title:
      "Recursos enterprise podem falhar. Aplique os ciclos indicados antes de testar.",
    description:
      "Há tabelas, colunas ou policies essenciais ausentes no ambiente.",
    badge: "Crítico",
  },
};

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

interface SchemaDoctorPanelProps {
  report: SchemaDoctorReport;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function SchemaDoctorPanel({
  report,
  isRefreshing,
  onRefresh,
}: SchemaDoctorPanelProps) {
  const statusContent = STATUS_CONTENT[report.overallStatus];
  const StatusIcon =
    report.overallStatus === "ok"
      ? ShieldCheck
      : report.overallStatus === "critical"
        ? ShieldAlert
        : CircleAlert;

  return (
    <div className="space-y-6">
      <Card
        className={
          report.overallStatus === "ok"
            ? "border-emerald-200 bg-emerald-50/40"
            : report.overallStatus === "critical"
              ? "border-destructive/40 bg-destructive/5"
              : "border-amber-200 bg-amber-50/40"
        }
      >
        <CardContent className="flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <StatusIcon
              className={
                report.overallStatus === "ok"
                  ? "mt-0.5 h-6 w-6 text-emerald-600"
                  : report.overallStatus === "critical"
                    ? "mt-0.5 h-6 w-6 text-destructive"
                    : "mt-0.5 h-6 w-6 text-amber-600"
              }
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{statusContent.title}</h2>
                <Badge
                  variant={
                    report.overallStatus === "critical"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {statusContent.badge}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {statusContent.description}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Diagnóstico gerado em {formatGeneratedAt(report.generatedAt)}.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Atualizar diagnóstico
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {CAPABILITIES.map((capability) => {
          const available = report.capabilities[capability.key];
          return (
            <Card key={capability.key}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Capacidade</p>
                  <p className="mt-1 text-sm font-medium">{capability.label}</p>
                </div>
                {available ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <CircleAlert className="h-5 w-5 shrink-0 text-amber-600" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {report.recommendations.length > 0 && (
        <Alert>
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Próximas ações recomendadas</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {report.recommendations.map((recommendation) => (
                <li key={recommendation}>{recommendation}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {MODULE_ORDER.map((module) => {
          const checks = report.checks.filter(
            (check) => check.module === module,
          );
          return (
            <SchemaCheckCard key={module} module={module} checks={checks} />
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo do diagnóstico</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Badge variant="secondary">
            {report.checks.length - report.missingItems.length} itens OK
          </Badge>
          <Badge
            variant={report.missingItems.length ? "destructive" : "secondary"}
          >
            {report.missingItems.length} itens faltando
          </Badge>
          <span className="text-muted-foreground">
            O Schema Doctor apenas diagnostica; nenhuma correção é aplicada
            automaticamente.
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
