import { Fingerprint, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  compactHash,
  formatAuditDateTime,
  getAuditReportTypeLabel,
  type AuditReportPackage,
} from "@/lib/auditReports";

export function AuditReportManifest({
  report,
  integrityHash,
  isHashing,
}: {
  report: AuditReportPackage;
  integrityHash: string | null;
  isHashing: boolean;
}) {
  return (
    <section
      data-audit-print-section
      className="border-b-2 border-primary pb-6"
    >
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>TRAMITA</Badge>
            <Badge variant="outline">Pacote formal P-27</Badge>
            <Badge variant="secondary">
              {String(report.manifest.package_version ?? "P-27.0")}
            </Badge>
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight">
            Relatório Formal de Auditoria
          </h2>
          <p className="mt-2 text-lg text-muted-foreground">
            {getAuditReportTypeLabel(report.reportType)}
          </p>
        </div>
        <div className="grid gap-1 text-sm md:text-right">
          <span>
            <strong>Organização:</strong>{" "}
            {String(report.organization.name ?? "—")}
          </span>
          <span>
            <strong>Gerado por:</strong>{" "}
            {String(
              report.generatedBy.full_name ?? report.generatedBy.id ?? "—",
            )}
          </span>
          <span>
            <strong>Gerado em:</strong>{" "}
            {formatAuditDateTime(report.manifest.generated_at)}
          </span>
          <span>
            <strong>Período:</strong> {report.reportPeriod.from} a{" "}
            {report.reportPeriod.to}
          </span>
          <span>
            <strong>Escopo:</strong>{" "}
            {report.filters.scope === "org" ? "Organização" : "Pessoal"}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-muted/25 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold">
            <Fingerprint className="h-5 w-5 text-primary" />
            Hash técnico de integridade
          </p>
          <code className="rounded bg-background px-2 py-1 text-xs">
            {isHashing ? "Calculando SHA-256…" : compactHash(integrityHash)}
          </code>
        </div>
        <p className="mt-2 flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Este hash técnico ajuda a verificar integridade do pacote exportado.
          Ele não substitui assinatura digital ICP-Brasil.
        </p>
      </div>
    </section>
  );
}
