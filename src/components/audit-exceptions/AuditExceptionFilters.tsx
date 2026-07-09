import { CalendarRange, FilterX, PlayCircle } from "lucide-react";
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
import {
  getDefaultAuditExceptionFilters,
  type AuditExceptionFilters,
  type AuditExceptionOption,
} from "@/lib/auditExceptions";

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
  options: AuditExceptionOption[];
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
          <SelectValue placeholder="Todos" />
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

export function AuditExceptionFilters({
  filters,
  options,
  canViewOrganization,
  isRunning,
  onChange,
  onRun,
}: {
  filters: AuditExceptionFilters;
  options: {
    documents: AuditExceptionOption[];
    projects: AuditExceptionOption[];
    types: AuditExceptionOption[];
    sources: AuditExceptionOption[];
  };
  canViewOrganization: boolean;
  isRunning: boolean;
  onChange: (filters: AuditExceptionFilters) => void;
  onRun: () => void;
}) {
  function update<K extends keyof AuditExceptionFilters>(
    key: K,
    value: AuditExceptionFilters[K],
  ) {
    onChange({ ...filters, [key]: value });
  }

  function setPeriod(days: number) {
    onChange({ ...filters, ...periodDates(days) });
  }

  function reset() {
    onChange(getDefaultAuditExceptionFilters(canViewOrganization));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-primary" />
          Filtros e execução
        </CardTitle>
        <CardDescription>
          A reconciliação registra apenas runs e exceções; a operação auditada
          permanece intacta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
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
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            <FilterX className="mr-2 h-4 w-4" />
            Limpar
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2">
            <Label htmlFor="exception-period-from">Data inicial</Label>
            <Input
              id="exception-period-from"
              type="date"
              value={filters.from}
              onChange={(event) => update("from", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exception-period-to">Data final</Label>
            <Input
              id="exception-period-to"
              type="date"
              value={filters.to}
              onChange={(event) => update("to", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Escopo</Label>
            <Select
              value={filters.scope}
              onValueChange={(value) =>
                update("scope", value as AuditExceptionFilters["scope"])
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
          </div>
          <div className="space-y-2">
            <Label>Severidade</Label>
            <Select
              value={filters.severity}
              onValueChange={(value) =>
                update(
                  "severity",
                  value as AuditExceptionFilters["severity"],
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={filters.status}
              onValueChange={(value) =>
                update("status", value as AuditExceptionFilters["status"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Aberta</SelectItem>
                <SelectItem value="acknowledged">Reconhecida</SelectItem>
                <SelectItem value="resolved">Resolvida</SelectItem>
                <SelectItem value="ignored">Ignorada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              disabled={isRunning}
              onClick={onRun}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              {isRunning ? "Executando…" : "Executar reconciliação"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <OptionalSelect
            label="Tipo"
            value={filters.type}
            options={options.types}
            onChange={(value) => update("type", value)}
          />
          <OptionalSelect
            label="Fonte"
            value={filters.source}
            options={options.sources}
            onChange={(value) => update("source", value)}
          />
          <OptionalSelect
            label="Documento"
            value={filters.documentId}
            options={options.documents}
            onChange={(value) => update("documentId", value)}
          />
          <OptionalSelect
            label="Projeto"
            value={filters.projectId}
            options={options.projects}
            onChange={(value) => update("projectId", value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
