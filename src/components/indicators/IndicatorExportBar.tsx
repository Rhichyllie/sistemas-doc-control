import { useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Check,
  Clipboard,
  Download,
  MonitorUp,
  Printer,
  Rows3,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  getExecutiveInsights,
  getGovernanceScore,
  getMeetingSummary,
  type IndicatorViewMode,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

const MODES: Array<{
  id: IndicatorViewMode;
  label: string;
  icon: typeof BriefcaseBusiness;
}> = [
  { id: "management", label: "Gestão", icon: BriefcaseBusiness },
  { id: "presentation", label: "Apresentação", icon: MonitorUp },
  { id: "analysis", label: "Análise", icon: Rows3 },
];

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

export function IndicatorExportBar({
  report,
  mode,
  onModeChange,
}: {
  report: OperationalIndicatorsReport;
  mode: IndicatorViewMode;
  onModeChange: (mode: IndicatorViewMode) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copySummary() {
    const summary = getMeetingSummary(report);
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
      toast.success("Resumo executivo copiado.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar o resumo executivo.");
    }
  }

  function exportData() {
    const exportedAt = new Date().toISOString();
    const payload = {
      exportType: "TRAMITA_OPERATIONAL_COCKPIT",
      exportPurpose: "visual_management_meeting",
      exportedAt,
      sourceGeneratedAt: report.generatedAt,
      sourceVersion: report.version,
      period: report.period,
      scope: report.scope,
      filters: report.filters,
      capabilities: report.capabilities,
      governanceScore: getGovernanceScore(report),
      executiveInsights: getExecutiveInsights(report),
      summary: report.summary,
      sla: report.sla,
      tramites: report.tramites,
      documents: report.documents,
      notifications: report.notifications,
      delegations: report.delegations,
      quality: report.quality,
      bottlenecks: report.bottlenecks,
      trends: report.trends,
      recommendations: report.recommendations,
      limitations: report.limitations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tramita-indicadores-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Dados gerenciais exportados em JSON.");
  }

  function enterMeetingMode() {
    onModeChange("presentation");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <section
      data-print-hidden
      aria-label="Modo de visualização e exportação"
      className="flex flex-col gap-3 rounded-xl border bg-card/90 p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <span className="mr-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Visualização
        </span>
        {MODES.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={mode === item.id ? "default" : "ghost"}
              aria-pressed={mode === item.id}
              onClick={() => onModeChange(item.id)}
            >
              <Icon className="mr-1.5 h-4 w-4" />
              {item.label}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Separator orientation="vertical" className="hidden h-7 xl:block" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={enterMeetingMode}
        >
          <BarChart3 className="mr-1.5 h-4 w-4" />
          Modo reunião
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => window.print()}
        >
          <Printer className="mr-1.5 h-4 w-4" />
          Imprimir / salvar PDF
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void copySummary()}
        >
          {copied ? (
            <Check className="mr-1.5 h-4 w-4 text-emerald-600" />
          ) : (
            <Clipboard className="mr-1.5 h-4 w-4" />
          )}
          Copiar resumo
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={exportData}>
          <Download className="mr-1.5 h-4 w-4" />
          Exportar dados
        </Button>
      </div>
    </section>
  );
}
