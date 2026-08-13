import { History } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  compactExceptionHash,
  formatAuditExceptionDate,
  type AuditReconciliationRun,
} from "@/lib/auditExceptions";

function totalExceptions(run: AuditReconciliationRun) {
  const total = Number(run.exceptionCounts.total);
  return Number.isFinite(total) ? total : 0;
}

export function AuditReconciliationRuns({
  runs,
}: {
  runs: AuditReconciliationRun[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Histórico de reconciliações
        </CardTitle>
        <CardDescription>
          Runs append-only registrados pela Central de Exceções.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma reconciliação executada.
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div
                key={run.id}
                className="grid gap-3 rounded-xl border p-3 text-sm lg:grid-cols-[180px_1fr_160px]"
              >
                <div>
                  <p className="font-semibold">
                    {formatAuditExceptionDate(run.createdAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {run.periodFrom ?? "—"} a {run.periodTo ?? "—"}
                  </p>
                </div>
                <div>
                  <p>{totalExceptions(run)} exceção(ões) detectada(s)</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    Hash pacote: {compactExceptionHash(run.packageHash)}
                  </p>
                  {run.limitations.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {run.limitations.slice(0, 2).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="lg:text-right">
                  <p className="font-medium">{run.status}</p>
                  <p className="text-xs text-muted-foreground">
                    Escopo: {run.scope}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
