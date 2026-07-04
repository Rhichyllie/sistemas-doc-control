import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  compactHash,
  formatAuditDateTime,
  getAuditReportTypeLabel,
  type AuditExportHistoryEntry,
} from "@/lib/auditReports";

export function AuditExportHistory({
  history,
  isLoading,
  available,
}: {
  history: AuditExportHistoryEntry[];
  isLoading: boolean;
  available: boolean;
}) {
  return (
    <Card data-print-hidden>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Histórico de exportações
        </CardTitle>
        <CardDescription>
          Registro append-only das exportações formais realizadas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : !available ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Histórico indisponível. Aplique o ciclo 26 para registrar as
            exportações.
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma exportação formal registrada.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-3 rounded-xl border p-3 text-sm lg:grid-cols-[190px_90px_1fr_190px]"
              >
                <div>
                  <p className="font-semibold">
                    {getAuditReportTypeLabel(entry.reportType)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.requestedByName ?? entry.requestedBy}
                  </p>
                </div>
                <Badge variant="outline" className="h-fit w-fit uppercase">
                  {entry.reportFormat}
                </Badge>
                <div>
                  <p>
                    {entry.periodFrom ?? "—"} a {entry.periodTo ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {summarizeFilters(entry.filters)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {countReturnedRecords(entry.recordCounts)} registro(s)
                    retornado(s)
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    Hash: {compactHash(entry.integrityHash)}
                  </p>
                  {entry.documentLabel && (
                    <p className="text-xs text-muted-foreground">
                      {entry.documentLabel}
                    </p>
                  )}
                </div>
                <div className="lg:text-right">
                  <p>{formatAuditDateTime(entry.generatedAt)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.fileName ?? "Resumo copiado"}
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

function summarizeFilters(filters: Record<string, unknown>) {
  const active = Object.entries(filters)
    .filter(
      ([, value]) =>
        value !== null && value !== undefined && String(value).trim() !== "",
    )
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return active.length ? active.join(" · ") : "Sem filtros adicionais";
}

function countReturnedRecords(recordCounts: Record<string, unknown>) {
  return Object.values(recordCounts).reduce<number>((total, value) => {
    if (!value || typeof value !== "object") return total;
    const returned = Number((value as Record<string, unknown>).returned);
    return total + (Number.isFinite(returned) ? returned : 0);
  }, 0);
}
