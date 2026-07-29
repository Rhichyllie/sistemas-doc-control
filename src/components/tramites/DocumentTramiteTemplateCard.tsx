import { useMemo, useState } from "react";
import {
  Archive,
  Check,
  Copy,
  Download,
  Eye,
  Pencil,
  Send,
  MoreHorizontal,
  User2,
  Clock3,
  Percent,
  ListChecks,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DocumentTramiteTemplate } from "@/lib/documentTramiteModel";

const STATUS_LABEL = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
} as const;

const STATUS_STYLES: Record<
  keyof typeof STATUS_LABEL,
  string
> = {
  published:
    "bg-emerald-50 text-emerald-700 border-emerald-200/70 ring-1 ring-emerald-100",
  draft:
    "bg-amber-50 text-amber-700 border-amber-200/70 ring-1 ring-amber-100",
  archived:
    "bg-slate-100 text-slate-600 border-slate-200 ring-1 ring-slate-100",
};

function formatRelativeDate(dateIso: string) {
  const date = new Date(dateIso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (Number.isNaN(diffDays)) return "—";
  if (diffDays <= 0) return "Atualizado hoje";
  if (diffDays === 1) return "Atualizado há 1 dia";
  if (diffDays < 30) return `Atualizado há ${diffDays} dias`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12)
    return `Atualizado há ${diffMonths} ${diffMonths === 1 ? "mês" : "meses"}`;
  const diffYears = Math.floor(diffDays / 365);
  return `Atualizado há ${diffYears} ${diffYears === 1 ? "ano" : "anos"}`;
}

interface FlowSummary {
  stagesCount: number;
  actorsCount: number;
  avgDays: string;
  conformity: string;
}

function useFlowSummary(template: DocumentTramiteTemplate): FlowSummary {
  return useMemo(() => {
    const nodes = template.current_version?.graph.nodes ?? [];
    const edges = template.current_version?.graph.edges ?? [];
    const actionable = nodes.filter(
      (n) => n.node_type !== "start" && n.node_type !== "end",
    );
    const actors = new Set<string>();
    let totalDays = 0;
    let withDeadline = 0;
    for (const node of actionable) {
      if (node.assignee_user_id) actors.add(`u:${node.assignee_user_id}`);
      if (node.assignee_group_id) actors.add(`g:${node.assignee_group_id}`);
      if (node.required_role) actors.add(`r:${node.required_role}`);
      if (typeof node.due_days === "number") {
        totalDays += node.due_days;
        withDeadline += 1;
      }
    }
    const avg = withDeadline > 0 ? totalDays / withDeadline : 0;
    const totalConnections = Math.max(1, actionable.length - 1 + (actionable.length > 0 ? 2 : 0));
    const actualConnections = edges.length;
    const conformity =
      actionable.length === 0
        ? "—"
        : actualConnections >= totalConnections
          ? "100%"
          : `${Math.round((actualConnections / Math.max(1, totalConnections)) * 100)}%`;
    return {
      stagesCount: actionable.length,
      actorsCount: actors.size,
      avgDays: avg > 0 ? `${Math.round(avg)} dias` : "—",
      conformity,
    };
  }, [template]);
}

export function DocumentTramiteTemplateCard({
  template,
  selectedId,
  selectedDocumentId,
  selectedDocumentOptions,
  selectedDocumentSummary,
  onSelectedDocumentChange,
  onSelect,
  onEdit,
  onDuplicate,
  onPublish,
  onArchive,
}: {
  template: DocumentTramiteTemplate;
  selectedId?: string | null;
  selectedDocumentId?: string;
  selectedDocumentOptions?: Array<{
    id: string;
    title: string;
    code: string | null;
  }>;
  selectedDocumentSummary?: {
    code: string | null;
    title: string;
    register_revision: string | null;
    register_status: string | null;
    project_name: string | null;
    discipline_name: string | null;
    received_at: string | null;
    analysis_deadline: string | null;
    analysis_days: number | null;
    doc_type: string | null;
    area: string | null;
  } | null;
  onSelectedDocumentChange?: (value: string) => void;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onPublish: () => void;
  onArchive: () => void;
}) {
  const version = template.current_version;
  const summary = useFlowSummary(template);
  const [menuOpen, setMenuOpen] = useState(false);
  const isSelected = selectedId === template.id;

  const flowColors = [
    { fill: "bg-sky-500", ring: "ring-sky-100", text: "text-white" },
    { fill: "bg-teal-500", ring: "ring-teal-100", text: "text-white" },
    { fill: "bg-emerald-500", ring: "ring-emerald-100", text: "text-white" },
    { fill: "bg-blue-500", ring: "ring-blue-100", text: "text-white" },
    { fill: "bg-indigo-500", ring: "ring-indigo-100", text: "text-white" },
    { fill: "bg-violet-500", ring: "ring-violet-100", text: "text-white" },
  ];

  const steps = useMemo(() => {
    const nodes = version?.graph.nodes ?? [];
    const maxVisible = isSelected ? 10 : 6;
    return nodes
      .filter((n) => n.node_type !== "start" && n.node_type !== "end")
      .slice(0, maxVisible);
  }, [version?.graph.nodes, isSelected]);

  const statusLabel = STATUS_LABEL[template.status];

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative flex cursor-pointer flex-col rounded-2xl border bg-white transition-all hover:shadow-md",
        isSelected ? "p-6 sm:p-7 lg:p-8" : "p-5",
        isSelected
          ? "border-sky-300 shadow-md ring-2 ring-sky-100 hover:shadow-lg"
          : "border-slate-200 hover:border-slate-300 hover:shadow-md",
        !template.is_active && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!isSelected && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className={cn(
                    "truncate font-semibold text-slate-900",
                    isSelected ? "text-xl" : "text-base",
                  )}
                >
                  {template.name}
                </h3>
                <Badge
                  className={cn(
                    "rounded-full border px-2 py-0 font-medium",
                    isSelected ? "text-xs" : "text-[11px]",
                    STATUS_STYLES[template.status],
                  )}
                >
                  {statusLabel}
                </Badge>
              </div>
              <p
                className={cn(
                  "mt-1 truncate text-slate-500",
                  isSelected ? "text-sm" : "text-xs",
                )}
              >
                {template.code} · Versão {version?.version_number ?? 1}
              </p>
            </>
          )}
        </div>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn(
                "shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                isSelected ? "h-10 w-10" : "h-8 w-8",
              )}
              onClick={(event) => event.stopPropagation()}
              aria-label="Ações do modelo"
            >
              <MoreHorizontal
                className={cn(isSelected ? "h-5 w-5" : "h-4 w-4")}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="bottom"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-4 w-4" />
              Abrir modelador
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                onDuplicate();
              }}
            >
              <Copy className="h-4 w-4" />
              Duplicar
            </DropdownMenuItem>
            {template.status !== "published" && (
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onPublish();
                }}
              >
                <Send className="h-4 w-4" />
                Publicar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <Download className="h-4 w-4" />
              Exportar JSON
            </DropdownMenuItem>
            {template.status !== "archived" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-slate-600"
                  onClick={(event) => {
                    event.stopPropagation();
                    onArchive();
                  }}
                >
                  <Archive className="h-4 w-4" />
                  Arquivar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isSelected && selectedDocumentSummary && (
        <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700/80">
                Documento no fluxo
              </p>
              {selectedDocumentOptions && selectedDocumentOptions.length > 0 && (
                <Select
                  value={selectedDocumentId ?? selectedDocumentOptions[0]?.id}
                  onValueChange={(value) => onSelectedDocumentChange?.(value)}
                >
                  <SelectTrigger
                    className="border-sky-200 bg-white"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <SelectValue placeholder="Selecione o documento" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedDocumentOptions.map((document) => (
                      <SelectItem key={document.id} value={document.id}>
                        {document.code ? `${document.code} · ` : ""}
                        {document.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex flex-wrap items-start gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {selectedDocumentSummary.code ?? "Sem código"}
              </p>
              <Badge
                variant="outline"
                className="rounded-full border-slate-200 bg-white text-slate-700"
              >
                Rev. {selectedDocumentSummary.register_revision ?? "—"}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full border-amber-200 bg-amber-50 text-amber-700"
              >
                {selectedDocumentSummary.register_status ?? "—"}
              </Badge>
            </div>
            <p className="text-sm text-slate-700">{selectedDocumentSummary.title}</p>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Projeto", selectedDocumentSummary.project_name ?? "Sem projeto"],
              ["Disciplina", selectedDocumentSummary.discipline_name ?? "—"],
              ["Recebido em", selectedDocumentSummary.received_at ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${selectedDocumentSummary.received_at}T00:00:00`)) : "—"],
              ["Prazo", selectedDocumentSummary.analysis_deadline ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${selectedDocumentSummary.analysis_deadline}T00:00:00`)) : "—"],
              ["Dias de análise", selectedDocumentSummary.analysis_days !== null ? String(selectedDocumentSummary.analysis_days) : "Não definido"],
              ["Tipo / Área", `${selectedDocumentSummary.doc_type ?? "—"} · ${selectedDocumentSummary.area ?? "—"}`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-white/80 bg-white/80 p-3"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isSelected && (
        <p
          className={cn(
            "line-clamp-2 text-slate-500",
            isSelected ? "mt-4 min-h-[3rem] text-base" : "mt-3 min-h-[2.5rem] text-sm",
          )}
        >
          {template.description?.trim() ||
            "Fluxo de aprovação modelado para o ciclo documental."}
        </p>
      )}

      {steps.length > 0 ? (
        <div
          className={cn(
            "flex items-start gap-1 overflow-x-auto",
            isSelected ? "mt-6 pb-2" : "mt-4 overflow-hidden",
          )}
        >
          {steps.map((step, index) => {
            const style = flowColors[index % flowColors.length];
            const showConnector = index < steps.length - 1;
            return (
              <div key={step.id} className="flex items-start gap-0.5">
                <div className="flex min-w-0 shrink-0 flex-col items-center">
                  <div
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full ring-4",
                      isSelected ? "h-14 w-14" : "h-9 w-9",
                      style.fill,
                      style.ring,
                    )}
                  >
                    <Check
                      className={cn(
                        "text-white/90",
                        isSelected ? "h-6 w-6" : "h-4 w-4",
                      )}
                    />
                  </div>
                  {!isSelected && (
                    <p
                      className={cn(
                        "font-medium text-slate-700",
                        isSelected
                          ? "mt-2.5 max-w-[150px] text-xs text-center"
                          : "mt-1.5 max-w-[76px] truncate text-[11px]",
                      )}
                    >
                      {step.label}
                    </p>
                  )}
                </div>
                {showConnector && (
                  <div
                    className={cn(
                      "shrink-0 bg-slate-200",
                      isSelected
                        ? "mx-1.5 mt-7 h-[2px] w-14"
                        : "mx-0.5 mb-6 h-px w-5",
                    )}
                  />
                )}
              </div>
            );
          })}
          {steps.length >= (isSelected ? 10 : 6) && (
            <div
              className={cn(
                "text-slate-400 shrink-0",
                isSelected
                  ? "mt-7 ml-3 text-base"
                  : "mb-6 ml-1 text-[11px]",
              )}
            >
              +{(version?.graph.nodes.length ?? 0) - steps.length - 2}
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center text-slate-500",
            isSelected ? "mt-6 p-4 text-sm" : "mt-4 p-3 text-xs",
          )}
        >
          Fluxo ainda sem etapas.
        </div>
      )}

      <div
        className={cn(
          "grid grid-cols-4 gap-1.5",
          isSelected ? "mt-6 gap-3" : "mt-4 gap-1.5",
        )}
      >
        <div
          className={cn(
            "rounded-xl border border-slate-200 bg-white/60 text-center",
            isSelected ? "p-3" : "p-2",
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center gap-1 text-slate-500",
              isSelected ? "text-xs" : "text-[11px]",
            )}
          >
            <ListChecks
              className={cn(isSelected ? "h-4 w-4" : "h-3.5 w-3.5")}
            />
            Etapas
          </div>
          <p
            className={cn(
              "mt-0.5 font-semibold text-slate-900",
              isSelected ? "text-lg" : "text-sm",
            )}
          >
            {summary.stagesCount}
          </p>
        </div>
        <div
          className={cn(
            "rounded-xl border border-slate-200 bg-white/60 text-center",
            isSelected ? "p-3" : "p-2",
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center gap-1 text-slate-500",
              isSelected ? "text-xs" : "text-[11px]",
            )}
          >
            <User2 className={cn(isSelected ? "h-4 w-4" : "h-3.5 w-3.5")} />
            Responsáveis
          </div>
          <p
            className={cn(
              "mt-0.5 font-semibold text-slate-900",
              isSelected ? "text-lg" : "text-sm",
            )}
          >
            {summary.actorsCount || "—"}
          </p>
        </div>
        <div
          className={cn(
            "rounded-xl border border-slate-200 bg-white/60 text-center",
            isSelected ? "p-3" : "p-2",
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center gap-1 text-slate-500",
              isSelected ? "text-xs" : "text-[11px]",
            )}
          >
            <Clock3 className={cn(isSelected ? "h-4 w-4" : "h-3.5 w-3.5")} />
            Tempo médio
          </div>
          <p
            className={cn(
              "mt-0.5 font-semibold text-slate-900",
              isSelected ? "text-lg" : "text-sm",
            )}
          >
            {summary.avgDays}
          </p>
        </div>
        <div
          className={cn(
            "rounded-xl border border-slate-200 bg-white/60 text-center",
            isSelected ? "p-3" : "p-2",
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center gap-1 text-slate-500",
              isSelected ? "text-xs" : "text-[11px]",
            )}
          >
            <Percent className={cn(isSelected ? "h-4 w-4" : "h-3.5 w-3.5")} />
            Conformidade
          </div>
          <p
            className={cn(
              "mt-0.5 font-semibold text-slate-900",
              isSelected ? "text-lg" : "text-sm",
            )}
          >
            {summary.conformity}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "flex items-center justify-between border-t border-slate-100",
          isSelected ? "mt-6 pt-4" : "mt-4 pt-3",
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full bg-teal-500 font-semibold text-white ring-2 ring-white",
              isSelected ? "h-8 w-8 text-xs" : "h-6 w-6 text-[11px]",
            )}
          >
            AM
          </div>
          <p className={cn(isSelected ? "text-sm" : "text-xs", "text-slate-500")}>
            <span className="font-medium text-slate-700">Ana Magno</span> ·{" "}
            {formatRelativeDate(template.updated_at)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1 rounded-lg font-medium text-slate-500 transition-opacity hover:bg-slate-100 hover:text-slate-700",
            isSelected
              ? "h-9 opacity-100 px-3 text-sm"
              : "h-7 opacity-0 px-2 text-xs group-hover:opacity-100",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Eye className={cn(isSelected ? "h-4.5 w-4.5" : "h-3.5 w-3.5")} />
          Detalhes
        </Button>
      </div>
    </div>
  );
}
