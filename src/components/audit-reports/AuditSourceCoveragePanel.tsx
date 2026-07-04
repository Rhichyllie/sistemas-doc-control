import { CheckCircle2, CircleAlert, CircleHelp, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getAuditSourceLabel,
  type AuditReportPackage,
} from "@/lib/auditReports";

const STATUS = {
  available: {
    label: "Disponível",
    icon: CheckCircle2,
    className: "text-emerald-700",
  },
  limited: {
    label: "Limitada",
    icon: CircleAlert,
    className: "text-amber-700",
  },
  summary_only: {
    label: "Somente resumo",
    icon: CircleAlert,
    className: "text-amber-700",
  },
  unavailable: {
    label: "Indisponível",
    icon: CircleHelp,
    className: "text-muted-foreground",
  },
  unknown: {
    label: "Não comprovada",
    icon: CircleHelp,
    className: "text-muted-foreground",
  },
} as const;

export function AuditSourceCoveragePanel({
  report,
}: {
  report: AuditReportPackage;
}) {
  return (
    <section data-audit-print-section>
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">Cobertura das fontes</h3>
          <p className="text-sm text-muted-foreground">
            Ausência de fonte é declarada; nenhum zero é presumido.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {report.sourceCoverage.map((source) => {
          const status = STATUS[source.status];
          const Icon = status.icon;
          return (
            <div key={source.key} className="rounded-xl border p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-2">
                  <Icon className={`mt-0.5 h-4 w-4 ${status.className}`} />
                  <div>
                    <p className="text-sm font-semibold">
                      {getAuditSourceLabel(source.key)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {source.records === null
                        ? "Contagem não disponível"
                        : `${source.records.toLocaleString("pt-BR")} registro(s)`}
                    </p>
                  </div>
                </div>
                <Badge variant="outline">{status.label}</Badge>
              </div>
              {source.note && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {source.note}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
