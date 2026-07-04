import { CalendarRange, FileSearch, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuditReportFilters, AuditReportOption } from "@/lib/auditReports";

const REPORT_TYPES = [
  {
    value: "operational",
    label: "Auditoria operacional por período",
    description: "Documentos, eventos, trâmites, SLA e auditoria.",
  },
  {
    value: "document",
    label: "Auditoria de documento",
    description: "Histórico completo do documento selecionado.",
  },
  {
    value: "sla",
    label: "SLA e prazos",
    description: "Recorte formal de prazo e cumprimento operacional.",
  },
  {
    value: "evidence_workflow",
    label: "Evidências e workflow",
    description: "Execução, etapas, decisões e evidências disponíveis.",
  },
] as const;

function periodDates(days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function OptionalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: AuditReportOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value || "all"}
        onValueChange={(next) => onChange(next === "all" ? "" : next)}
      >
        <SelectTrigger>
          <SelectValue placeholder={`Todos — ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AuditReportBuilder({
  filters,
  options,
  canViewOrganization,
  isGenerating,
  onChange,
  onGenerate,
}: {
  filters: AuditReportFilters;
  options: {
    documents: AuditReportOption[];
    projects: AuditReportOption[];
    docTypes: AuditReportOption[];
    areas: AuditReportOption[];
    statuses: AuditReportOption[];
  };
  canViewOrganization: boolean;
  isGenerating: boolean;
  onChange: (filters: AuditReportFilters) => void;
  onGenerate: () => void;
}) {
  function update<K extends keyof AuditReportFilters>(
    key: K,
    value: AuditReportFilters[K],
  ) {
    onChange({ ...filters, [key]: value });
  }

  function setPeriod(days: number) {
    onChange({ ...filters, ...periodDates(days) });
  }

  return (
    <Card data-print-hidden>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-primary" />
          Construir relatório
        </CardTitle>
        <CardDescription>
          Defina o escopo formal. A consulta é somente leitura e não altera a
          operação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Tipo de relatório</Label>
            <Select
              value={filters.reportType}
              onValueChange={(value) =>
                update("reportType", value as AuditReportFilters["reportType"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {
                REPORT_TYPES.find((type) => type.value === filters.reportType)
                  ?.description
              }
            </p>
          </div>

          <div className="space-y-2">
            <Label>Escopo</Label>
            <Select
              value={filters.scope}
              onValueChange={(value) =>
                update("scope", value as AuditReportFilters["scope"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Minha operação</SelectItem>
                {canViewOrganization && (
                  <SelectItem value="org">Organização</SelectItem>
                )}
              </SelectContent>
            </Select>
            {!canViewOrganization && (
              <p className="text-xs text-muted-foreground">
                Seu perfil está limitado ao escopo pessoal.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CalendarRange className="h-4 w-4" />
                Período
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Máximo de 365 dias.
              </p>
            </div>
            <div className="flex gap-1">
              {[7, 30, 90].map((days) => (
                <Button
                  key={days}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPeriod(days)}
                >
                  {days} dias
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="audit-period-from">Data inicial</Label>
              <Input
                id="audit-period-from"
                type="date"
                value={filters.from}
                onChange={(event) => update("from", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-period-to">Data final</Label>
              <Input
                id="audit-period-to"
                type="date"
                value={filters.to}
                onChange={(event) => update("to", event.target.value)}
              />
            </div>
          </div>
        </div>

        {filters.reportType === "document" && (
          <div className="space-y-2">
            <Label>Documento obrigatório</Label>
            <Select
              value={filters.documentId || "none"}
              onValueChange={(value) =>
                update("documentId", value === "none" ? "" : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecione um documento</SelectItem>
                {options.documents.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <OptionalSelect
            label="Projeto"
            value={filters.projectId}
            options={options.projects}
            onChange={(value) => update("projectId", value)}
          />
          <OptionalSelect
            label="Tipo documental"
            value={filters.docType}
            options={options.docTypes}
            onChange={(value) => update("docType", value)}
          />
          <OptionalSelect
            label="Área"
            value={filters.area}
            options={options.areas}
            onChange={(value) => update("area", value)}
          />
          <OptionalSelect
            label="Status"
            value={filters.status}
            options={options.statuses}
            onChange={(value) => update("status", value)}
          />
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              disabled={
                isGenerating ||
                (filters.reportType === "document" && !filters.documentId)
              }
              onClick={onGenerate}
            >
              {isGenerating ? (
                <>
                  <RotateCcw className="mr-2 h-4 w-4 animate-spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <FileSearch className="mr-2 h-4 w-4" />
                  Gerar relatório
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
