import { CalendarRange, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  OperationalIndicatorFilters,
  OperationalIndicatorOption,
} from "@/lib/operationalIndicators";

interface IndicatorFilterBarProps {
  filters: OperationalIndicatorFilters;
  onChange: (filters: OperationalIndicatorFilters) => void;
  canViewOrganization: boolean;
  dimensions: {
    projects: OperationalIndicatorOption[];
    areas: OperationalIndicatorOption[];
    docTypes: OperationalIndicatorOption[];
    responsibles: OperationalIndicatorOption[];
    statuses: OperationalIndicatorOption[];
  };
}

function selectValue(value: string) {
  return value || "all";
}

function fromSelect(value: string) {
  return value === "all" ? "" : value;
}

export function IndicatorFilterBar({
  filters,
  onChange,
  canViewOrganization,
  dimensions,
}: IndicatorFilterBarProps) {
  function update<K extends keyof OperationalIndicatorFilters>(
    key: K,
    value: OperationalIndicatorFilters[K],
  ) {
    onChange({ ...filters, [key]: value });
  }

  function applyPeriod(days: number) {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days + 1);
    onChange({
      ...filters,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
  }

  function clearContext() {
    onChange({
      ...filters,
      projectId: "",
      area: "",
      docType: "",
      responsibleUserId: "",
      severity: "",
      status: "",
    });
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Período e escopo</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              size="sm"
              variant="outline"
              onClick={() => applyPeriod(days)}
            >
              {days} dias
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={clearContext}>
            <FilterX className="mr-2 h-4 w-4" />
            Limpar contexto
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input
          aria-label="Data inicial"
          type="date"
          value={filters.from}
          onChange={(event) => update("from", event.target.value)}
        />
        <Input
          aria-label="Data final"
          type="date"
          value={filters.to}
          onChange={(event) => update("to", event.target.value)}
        />
        <Select
          value={filters.scope}
          onValueChange={(value) =>
            update("scope", value === "org" ? "org" : "mine")
          }
        >
          <SelectTrigger aria-label="Escopo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">Minha operação</SelectItem>
            {canViewOrganization && (
              <SelectItem value="org">Toda a organização</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Select
          value={selectValue(filters.projectId)}
          onValueChange={(value) => update("projectId", fromSelect(value))}
        >
          <SelectTrigger aria-label="Projeto">
            <SelectValue placeholder="Todos os projetos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os projetos</SelectItem>
            {dimensions.projects.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectValue(filters.area)}
          onValueChange={(value) => update("area", fromSelect(value))}
        >
          <SelectTrigger aria-label="Área">
            <SelectValue placeholder="Todas as áreas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {dimensions.areas.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectValue(filters.docType)}
          onValueChange={(value) => update("docType", fromSelect(value))}
        >
          <SelectTrigger aria-label="Tipo documental">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {dimensions.docTypes.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectValue(filters.responsibleUserId)}
          onValueChange={(value) =>
            update("responsibleUserId", fromSelect(value))
          }
          disabled={filters.scope === "mine"}
        >
          <SelectTrigger aria-label="Responsável">
            <SelectValue placeholder="Todos os responsáveis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os responsáveis</SelectItem>
            {dimensions.responsibles.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectValue(filters.severity)}
          onValueChange={(value) => update("severity", fromSelect(value))}
        >
          <SelectTrigger aria-label="Severidade">
            <SelectValue placeholder="Todas as severidades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as severidades</SelectItem>
            <SelectItem value="critical">Crítica</SelectItem>
            <SelectItem value="danger">Perigo</SelectItem>
            <SelectItem value="warning">Atenção</SelectItem>
            <SelectItem value="info">Informativa</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={selectValue(filters.status)}
          onValueChange={(value) => update("status", fromSelect(value))}
        >
          <SelectTrigger aria-label="Status documental">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {dimensions.statuses.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
