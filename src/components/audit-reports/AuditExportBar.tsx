import { useState } from "react";
import {
  Check,
  Clipboard,
  Download,
  FileJson,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  buildAuditSummary,
  downloadAuditEvidencesCsv,
  downloadAuditTimelineCsv,
  downloadOfficialAuditJson,
  type AuditReportFormat,
  type AuditReportPackage,
} from "@/lib/auditReports";

function fallbackCopy(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard indisponível.");
}

export function AuditExportBar({
  report,
  integrityHash,
  isHashing,
  registrationAvailable,
  onRegister,
}: {
  report: AuditReportPackage;
  integrityHash: string | null;
  isHashing: boolean;
  registrationAvailable: boolean;
  onRegister: (
    format: AuditReportFormat,
    fileName: string | null,
  ) => Promise<{ id: string | null; warning: string | null }>;
}) {
  const [busy, setBusy] = useState<AuditReportFormat | null>(null);
  const [copied, setCopied] = useState(false);
  const disabled = isHashing || !integrityHash || Boolean(busy);

  async function register(format: AuditReportFormat, fileName: string | null) {
    const result = await onRegister(format, fileName);
    if (result.warning) toast.warning(result.warning);
    else if (result.id) toast.success("Exportação registrada no histórico.");
  }

  async function exportJson() {
    if (!integrityHash) return;
    setBusy("json");
    const fileName = downloadOfficialAuditJson(report, integrityHash);
    await register("json", fileName);
    setBusy(null);
  }

  async function exportTimeline() {
    setBusy("csv");
    const fileName = downloadAuditTimelineCsv(report);
    await register("csv", fileName);
    setBusy(null);
  }

  async function exportEvidences() {
    setBusy("csv");
    const fileName = downloadAuditEvidencesCsv(report);
    await register("csv", fileName);
    setBusy(null);
  }

  async function printReport() {
    setBusy("pdf");
    const fileName = `tramita-auditoria-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    await register("pdf", fileName);
    setBusy(null);
    window.print();
  }

  async function copySummary() {
    setBusy("summary");
    const summary = buildAuditSummary(report, integrityHash);
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(summary);
        } catch {
          fallbackCopy(summary);
        }
      } else {
        fallbackCopy(summary);
      }
      setCopied(true);
      await register("summary", null);
      toast.success("Resumo formal copiado.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar o resumo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section data-print-hidden className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <Button disabled={disabled} onClick={() => void exportJson()}>
          <FileJson className="mr-2 h-4 w-4" />
          Exportar JSON oficial
        </Button>
        <Button
          variant="outline"
          disabled={disabled || report.timeline.length === 0}
          onClick={() => void exportTimeline()}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Timeline CSV
        </Button>
        <Button
          variant="outline"
          disabled={disabled || report.evidences.length === 0}
          onClick={() => void exportEvidences()}
        >
          <Download className="mr-2 h-4 w-4" />
          Evidências CSV
        </Button>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => void printReport()}
        >
          <Printer className="mr-2 h-4 w-4" />
          Imprimir / salvar PDF
        </Button>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => void copySummary()}
        >
          {copied ? (
            <Check className="mr-2 h-4 w-4 text-emerald-600" />
          ) : (
            <Clipboard className="mr-2 h-4 w-4" />
          )}
          Copiar resumo
        </Button>
      </div>
      {!registrationAvailable && (
        <Alert>
          <AlertTitle>Registro append-only indisponível</AlertTitle>
          <AlertDescription>
            A exportação local continua disponível, mas não será registrada até
            a aplicação do ciclo 26.
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
