import { Link } from "@tanstack/react-router";
import {
  Activity,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAuditExceptions } from "@/hooks/useAuditExceptions";
import { AuditExceptionCoveragePanel } from "./AuditExceptionCoveragePanel";
import { AuditExceptionDetailPanel } from "./AuditExceptionDetailPanel";
import { AuditExceptionFilters } from "./AuditExceptionFilters";
import { AuditExceptionList } from "./AuditExceptionList";
import { AuditExceptionSummaryCards } from "./AuditExceptionSummaryCards";
import { AuditReconciliationRuns } from "./AuditReconciliationRuns";

export function AuditExceptionsPage() {
  const exceptions = useAuditExceptions();

  async function handleRun() {
    const result = await exceptions.runReconciliation();
    if (result) {
      toast.success("Reconciliação registrada sem alterar dados operacionais.");
    }
  }

  async function handleUpdateStatus(
    status: "acknowledged" | "ignored" | "resolved",
    note: string,
  ) {
    if (!exceptions.selectedExceptionId) return;
    const ok = await exceptions.updateStatus(
      exceptions.selectedExceptionId,
      status,
      note,
    );
    if (ok) {
      toast.success("Status da exceção atualizado.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border bg-gradient-to-br from-red-500/[0.08] via-background to-background p-5 md:p-7">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">P-27.1</Badge>
              <Badge
                variant={
                  exceptions.schemaState === "available"
                    ? "default"
                    : "secondary"
                }
              >
                {exceptions.schemaState === "available"
                  ? "Reconciliação disponível"
                  : "Modo de compatibilidade"}
              </Badge>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Central de Exceções e Reconciliação
            </h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Detecte lacunas, divergências e fontes incompletas antes do
              piloto, sem corrigir dados automaticamente.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/authenticated/auditoria/relatorios">
                <FileCheck2 className="mr-2 h-4 w-4" />
                Relatórios
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/authenticated/indicadores">
                <Activity className="mr-2 h-4 w-4" />
                Indicadores
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/authenticated/documentos/central">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Central
              </Link>
            </Button>
            <Button asChild variant="outline" disabled>
              <Link to="/authenticated/configuracoes" type="button" aria-disabled="true">
                <ClipboardList className="mr-2 h-4 w-4" />
                Diagnóstico (em breve)
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {exceptions.schemaState === "not_installed" && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Central ainda não instalada no banco</AlertTitle>
          <AlertDescription>
            Aplique manualmente o ciclo
            `27_TRAMITA_audit_exceptions_reconciliation` no Supabase SQL
            Editor. Relatórios P-27 continuam funcionando.
          </AlertDescription>
        </Alert>
      )}

      {(exceptions.error || exceptions.warning) && (
        <Alert variant={exceptions.error ? "destructive" : "default"}>
          <AlertTitle>
            {exceptions.error ? "Reconciliação indisponível" : "Atenção"}
          </AlertTitle>
          <AlertDescription>
            {exceptions.error ?? exceptions.warning}
          </AlertDescription>
        </Alert>
      )}

      <AuditExceptionFilters
        filters={exceptions.filters}
        options={exceptions.options}
        canViewOrganization={exceptions.canViewOrganization}
        isRunning={exceptions.isRunning}
        onChange={exceptions.setFilters}
        onRun={() => void handleRun()}
      />

      {exceptions.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <AuditExceptionSummaryCards overview={exceptions.overview} />
      )}

      {exceptions.lastRunResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Última execução</CardTitle>
            <CardDescription>
              Resultado retornado pela RPC de reconciliação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-56 overflow-auto rounded-xl bg-muted p-3 text-xs">
              {JSON.stringify(exceptions.lastRunResult, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(380px,0.9fr)]">
        <div className="space-y-6">
          <AuditExceptionList
            exceptions={exceptions.filteredExceptions}
            selectedId={exceptions.selectedExceptionId}
            onSelect={(id) => void exceptions.loadDetail(id)}
          />
          <AuditExceptionCoveragePanel
            coverage={exceptions.overview?.sourceCoverage ?? []}
          />
          <AuditReconciliationRuns runs={exceptions.overview?.runs ?? []} />
        </div>
        <AuditExceptionDetailPanel
          detail={exceptions.detail}
          isLoading={exceptions.isDetailLoading}
          isUpdating={exceptions.isUpdatingStatus}
          onUpdateStatus={(status, note) => void handleUpdateStatus(status, note)}
        />
      </div>
    </div>
  );
}
