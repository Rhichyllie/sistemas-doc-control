import { CheckCircle2, CircleAlert, CircleHelp, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAuditExceptionSourceLabel,
  type AuditReconciliationCoverageSource,
} from "@/lib/auditExceptions";

const STATUS = {
  available: { label: "Disponível", icon: CheckCircle2, className: "text-emerald-700" },
  limited: { label: "Limitada", icon: CircleAlert, className: "text-amber-700" },
  summary_only: { label: "Resumo", icon: CircleAlert, className: "text-amber-700" },
  unavailable: { label: "Ausente", icon: CircleHelp, className: "text-muted-foreground" },
  unknown: { label: "Desconhecida", icon: CircleHelp, className: "text-muted-foreground" },
} as const;

export function AuditExceptionCoveragePanel({
  coverage,
}: {
  coverage: AuditReconciliationCoverageSource[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Cobertura das fontes
        </CardTitle>
        <CardDescription>
          Fonte ausente ou limitada vira limitação explícita, não zero presumido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {coverage.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma cobertura carregada.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {coverage.map((source) => {
              const status = STATUS[source.status];
              const Icon = status.icon;
              return (
                <div key={source.key} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex gap-2">
                      <Icon className={`mt-0.5 h-4 w-4 ${status.className}`} />
                      <div>
                        <p className="text-sm font-semibold">
                          {getAuditExceptionSourceLabel(source.key)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {source.records === null
                            ? "Contagem indisponível"
                            : `${source.records.toLocaleString("pt-BR")} registro(s)`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{status.label}</Badge>
                  </div>
                  {source.note && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {source.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
