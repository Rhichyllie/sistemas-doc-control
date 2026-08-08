import { useMemo, useState } from "react";
import { CalendarRange, ChevronDown, Filter, FilterX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

const MONTH_OPTIONS = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

function buildMonthRange(year: string, month: string) {
  const safeYear = Number.parseInt(year, 10);
  const safeMonth = Number.parseInt(month, 10);
  const from = new Date(safeYear, safeMonth - 1, 1);
  const to = new Date(safeYear, safeMonth, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function getMonthFromDate(value: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  return match?.[2] ?? String(new Date().getMonth() + 1).padStart(2, "0");
}

function getYearFromDate(value: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  return match?.[1] ?? String(new Date().getFullYear());
}

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
  canViewOrganization: _canViewOrganization,
  dimensions,
}: IndicatorFilterBarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function update<K extends keyof OperationalIndicatorFilters>(
    key: K,
    value: OperationalIndicatorFilters[K],
  ) {
    onChange({ ...filters, [key]: value });
  }

  function updateMonthYear(month: string, year: string) {
    const period = buildMonthRange(year, month);
    onChange({
      ...filters,
      from: period.from,
      to: period.to,
    });
  }

  function clearFilters() {
    const today = new Date();
    const period = buildMonthRange(
      String(today.getFullYear()),
      String(today.getMonth() + 1).padStart(2, "0"),
    );
    onChange({
      ...filters,
      from: period.from,
      to: period.to,
      projectId: "",
      area: "",
      docType: "",
      responsibleUserId: "",
      severity: "",
      status: "",
    });
  }

  const selectedMonth = useMemo(() => getMonthFromDate(filters.from), [filters.from]);
  const selectedYear = useMemo(() => getYearFromDate(filters.from), [filters.from]);
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => String(currentYear - index));
  }, []);

  const activeFilters = useMemo(() => {
    const label = (
      options: OperationalIndicatorOption[],
      value: string,
      fallback: string,
    ) => options.find((option) => option.value === value)?.label ?? fallback;
    return [
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
          <Select
            value={selectedMonth}
            onValueChange={(value) => updateMonthYear(value, selectedYear)}
          >
            <SelectTrigger className="h-9 w-[160px]" aria-label="Mês">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedYear}
            onValueChange={(value) => updateMonthYear(selectedMonth, value)}
          >
            <SelectTrigger className="h-9 w-[120px]" aria-label="Ano">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Select
            value={selectedMonth}
            onValueChange={(value) => updateMonthYear(value, selectedYear)}
          >
            <SelectTrigger aria-label="Mês de referência">
              <SelectValue placeholder="Selecione o mês" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedYear}
            onValueChange={(value) => updateMonthYear(selectedMonth, value)}
          >
            <SelectTrigger aria-label="Ano de referência">
              <SelectValue placeholder="Selecione o ano" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
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
