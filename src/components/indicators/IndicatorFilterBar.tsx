import { useMemo, useState } from "react";
import { CalendarRange, ChevronDown, Filter, FilterX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  function clearFilters() {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 29);
    onChange({
      ...filters,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      projectId: "",
      area: "",
      docType: "",
      responsibleUserId: "",
      severity: "",
      status: "",
    });
  }

  const activePeriod = useMemo(() => {
    const to = new Date(`${filters.to}T12:00:00`);
    const from = new Date(`${filters.from}T12:00:00`);
    if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime())) return null;
    return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  }, [filters.from, filters.to]);

  const activeFilters = useMemo(() => {
    const label = (
      options: OperationalIndicatorOption[],
      value: string,
      fallback: string,
    ) => options.find((option) => option.value === value)?.label ?? fallback;
    return [
      filters.projectId
        ? label(dimensions.projects, filters.projectId, "Projeto selecionado")
        : null,
      filters.area ? `Área: ${filters.area}` : null,
      filters.docType ? `Tipo: ${filters.docType}` : null,
      filters.responsibleUserId
        ? label(
            dimensions.responsibles,
            filters.responsibleUserId,
            "Responsável selecionado",
          )
        : null,
      filters.severity ? `Severidade: ${filters.severity}` : null,
      filters.status ? `Status: ${filters.status}` : null,
    ].filter((item): item is string => Boolean(item));
  }, [dimensions, filters]);

  return (
    <Collapsible
      open={advancedOpen}
      onOpenChange={setAdvancedOpen}
      className="rounded-xl border bg-card"
    >
      <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-2 text-sm font-medium">
            <CalendarRange className="h-4 w-4 text-primary" />
            Período
          </span>
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              size="sm"
              variant={activePeriod === days ? "default" : "outline"}
              aria-pressed={activePeriod === days}
              onClick={() => applyPeriod(days)}
            >
              {days}d
            </Button>
          ))}
          <Select
            value={filters.scope}
            onValueChange={(value) =>
              update("scope", value === "org" ? "org" : "mine")
            }
          >
            <SelectTrigger className="h-9 w-[180px]" aria-label="Escopo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">Minha operação</SelectItem>
              {canViewOrganization && (
                <SelectItem value="org">Toda a organização</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!canViewOrganization && (
            <span className="text-xs text-muted-foreground">
              Você está vendo apenas sua operação pessoal.
            </span>
          )}
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filtros avançados
              <ChevronDown
                className={`ml-2 h-4 w-4 transition-transform ${
                  advancedOpen ? "rotate-180" : ""
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <FilterX className="mr-2 h-4 w-4" />
            Limpar filtros
          </Button>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t px-3 py-2">
          {activeFilters.map((filter) => (
            <Badge key={filter} variant="secondary">
              {filter}
            </Badge>
          ))}
        </div>
      )}

      <CollapsibleContent>
        <div className="grid gap-3 border-t bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4">
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
      </CollapsibleContent>
    </Collapsible>
  );
}
