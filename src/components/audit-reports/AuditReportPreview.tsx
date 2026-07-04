import {
  BellRing,
  FileStack,
  Gauge,
  GitBranch,
  ScrollText,
} from "lucide-react";
import { AuditEvidenceTable } from "@/components/audit-reports/AuditEvidenceTable";
import { AuditLimitationsPanel } from "@/components/audit-reports/AuditLimitationsPanel";
import { AuditReportManifest } from "@/components/audit-reports/AuditReportManifest";
import { AuditSourceCoveragePanel } from "@/components/audit-reports/AuditSourceCoveragePanel";
import { AuditTimelineTable } from "@/components/audit-reports/AuditTimelineTable";
import { AuditWorkflowTable } from "@/components/audit-reports/AuditWorkflowTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatAuditDateTime,
  type AuditReportPackage,
} from "@/lib/auditReports";

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("pt-BR") : "—";
}

export function AuditReportPreview({
  report,
  integrityHash,
  isHashing,
}: {
  report: AuditReportPackage;
  integrityHash: string | null;
  isHashing: boolean;
}) {
  const sla = report.slaSummary;
  const notifications = report.notificationsSummary;

  return (
    <article
      data-audit-report-root
      className="space-y-8 rounded-2xl border bg-card p-5 shadow-sm md:p-8"
    >
      <AuditReportManifest
        report={report}
        integrityHash={integrityHash}
        isHashing={isHashing}
      />

      <section data-audit-print-section>
        <h3 className="text-lg font-semibold">Sumário executivo</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Contagens do pacote retornado, sem inferência sobre fontes
          indisponíveis.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryMetric
            icon={FileStack}
            label="Documentos"
            value={report.documents.length}
          />
          <SummaryMetric
            icon={ScrollText}
            label="Eventos"
            value={report.timeline.length}
          />
          <SummaryMetric
            icon={GitBranch}
            label="Etapas"
            value={report.tramiteSteps.length}
          />
          <SummaryMetric
            icon={FileStack}
            label="Evidências"
            value={report.evidences.length}
          />
          <SummaryMetric
            icon={BellRing}
            label="Notificações resumidas"
            value={
              typeof notifications.total === "number"
                ? notifications.total
                : null
            }
          />
        </div>
      </section>

      <AuditSourceCoveragePanel report={report} />

      <section data-audit-print-section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-primary" />
              SLA e prazos
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Compliance" value={sla.compliance_rate} suffix="%" />
            <Detail label="No prazo" value={sla.on_time} />
            <Detail label="Próximos" value={sla.due_soon} />
            <Detail label="Vencidos" value={sla.overdue} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="h-4 w-4 text-primary" />
              Notificações — resumo protegido
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Total" value={notifications.total} />
            <Detail label="Não lidas" value={notifications.unread} />
            <Detail label="Críticas" value={notifications.critical} />
            <Detail label="Dispensadas" value={notifications.dismissed} />
          </CardContent>
        </Card>
      </section>

      <AuditTimelineTable events={report.timeline} />
      <DocumentsSection report={report} />
      <VersionsSection report={report} />
      <AuditWorkflowTable steps={report.tramiteSteps} />
      <AuditEvidenceTable evidences={report.evidences} />
      <AuditLimitationsPanel limitations={report.limitations} />

      <footer
        data-audit-print-section
        className="border-t pt-5 text-xs leading-relaxed text-muted-foreground"
      >
        <p>
          <strong>Assinatura técnica:</strong> SHA-256 calculado sobre JSON
          canônico TRAMITA_CANONICAL_JSON_V1.
        </p>
        <p className="mt-1">
          Relatório gerado em{" "}
          {formatAuditDateTime(report.manifest.generated_at)}. O hash técnico
          verifica integridade do conteúdo exportado, sem equivaler a assinatura
          digital ICP-Brasil.
        </p>
      </footer>
    </article>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileStack;
  label: string;
  value: number | null;
}) {
  return (
    <div className="rounded-xl border p-4">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-3 text-2xl font-semibold">
        {value === null ? "—" : value.toLocaleString("pt-BR")}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Detail({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: unknown;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">
        {count(value)}
        {value !== null && value !== undefined && suffix}
      </p>
    </div>
  );
}

function DocumentsSection({ report }: { report: AuditReportPackage }) {
  return (
    <section data-audit-print-section>
      <h3 className="text-lg font-semibold">Documentos envolvidos</h3>
      <p className="text-sm text-muted-foreground">
        Estado documental registrado no recorte.
      </p>
      <div className="mt-4 grid gap-2">
        {report.documents.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum documento retornado.
          </p>
        ) : (
          report.documents.slice(0, 30).map((document, index) => (
            <div
              key={String(document.id ?? index)}
              className="grid gap-2 rounded-xl border p-3 text-sm md:grid-cols-[160px_1fr_120px_100px]"
            >
              <span className="font-mono">
                {String(document.code ?? "Sem código")}
              </span>
              <span className="font-medium">
                {String(document.title ?? "Documento")}
              </span>
              <span>{String(document.doc_type ?? "—")}</span>
              <Badge variant="outline" className="w-fit">
                {String(document.status ?? "—")}
              </Badge>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function VersionsSection({ report }: { report: AuditReportPackage }) {
  return (
    <section data-audit-print-section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <RecordSummary
          title="Versões formais"
          value={report.versions.length}
          note="Fonte canônica: document_versions."
        />
        <RecordSummary
          title="Revisões legadas"
          value={report.revisions.length}
          note="Fonte de compatibilidade, declarada separadamente."
        />
        <RecordSummary
          title="Aprovações"
          value={report.approvalFlows.length}
          note="Leitura de approval_flows; nenhum estado foi alterado."
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RecordList
          title="Últimas versões/revisões"
          rows={[...report.versions, ...report.revisions].slice(0, 20)}
          render={(row) => ({
            primary: `Revisão ${String(row.revision ?? "—")}`,
            secondary: `Status ${String(row.status ?? "—")} · Documento ${String(row.document_id ?? "—")}`,
            trailing: formatAuditDateTime(row.created_at ?? row.uploaded_at),
          })}
        />
        <RecordList
          title="Decisões de aprovação"
          rows={report.approvalFlows.slice(0, 20)}
          render={(row) => ({
            primary: String(row.step_label ?? `Etapa ${row.step ?? "—"}`),
            secondary: `Status ${String(row.status ?? "—")} · Documento ${String(row.document_id ?? "—")}`,
            trailing: formatAuditDateTime(
              row.decided_at ?? row.completed_at ?? row.created_at,
            ),
          })}
        />
      </div>
    </section>
  );
}

function RecordSummary({
  title,
  value,
  note,
}: {
  title: string;
  value: number;
  note: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-3xl font-semibold">
        {value.toLocaleString("pt-BR")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function RecordList({
  title,
  rows,
  render,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  render: (row: Record<string, unknown>) => {
    primary: string;
    secondary: string;
    trailing: string;
  };
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="font-semibold">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum registro disponível.
          </p>
        ) : (
          rows.map((row, index) => {
            const content = render(row);
            return (
              <div
                key={String(row.id ?? index)}
                className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {content.primary}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {content.secondary}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {content.trailing}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
