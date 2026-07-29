import {
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  FileCheck2,
  FilePenLine,
  GitFork,
  RefreshCcw,
  Rocket,
  SearchCheck,
  ShieldCheck,
  UploadCloud,
  Wrench,
} from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getTramiteNodeTypeLabel,
  type DocumentTramiteNode as TramiteNode,
  type DocumentTramiteNodeType,
} from "@/lib/documentTramiteModel";

interface TramiteNodeData extends Record<string, unknown> {
  tramite: TramiteNode;
  invalid: boolean;
  warning: boolean;
}

export type TramiteFlowNode = Node<TramiteNodeData, "tramite">;

const ICONS = {
  start: CircleDot,
  draft: FilePenLine,
  review: SearchCheck,
  approval: ShieldCheck,
  correction: RefreshCcw,
  evidence: UploadCloud,
  mandatory_reading: BookOpenCheck,
  publication: Rocket,
  decision: GitFork,
  end: CheckCircle2,
  custom: Wrench,
} satisfies Record<DocumentTramiteNodeType, typeof CircleDot>;

const COLORS: Record<DocumentTramiteNodeType, string> = {
  start: "border-emerald-500 bg-emerald-100 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-50",
  draft: "border-sky-300 bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-50",
  review: "border-violet-300 bg-violet-50 text-violet-950 dark:bg-violet-950/40 dark:text-violet-50",
  approval: "border-indigo-400 bg-indigo-50 text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-50",
  correction: "border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50",
  evidence: "border-cyan-400 bg-cyan-50 text-cyan-950 dark:bg-cyan-950/40 dark:text-cyan-50",
  mandatory_reading: "border-blue-300 bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-50",
  publication: "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-950 dark:bg-fuchsia-950/40 dark:text-fuchsia-50",
  decision: "border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-50",
  end: "border-violet-500 bg-violet-100 text-violet-950 dark:bg-violet-950/60 dark:text-violet-50",
  custom: "border-slate-400 bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50",
};

function actorLabel(node: TramiteNode) {
  if (node.assignment_type === "author") return "Autor";
  if (node.assignment_type === "document_owner") return "Dono";
  if (node.assignment_type === "specific_user") return "Usuário";
  if (node.assignment_type === "approval_group") return "Grupo";
  if (node.assignment_type === "role") return node.required_role || "Papel";
  return null;
}

export function DocumentTramiteNode({
  data,
  selected,
}: NodeProps<TramiteFlowNode>) {
  const node = data.tramite;
  const Icon = ICONS[node.node_type];
  const actor = actorLabel(node);
  const isStart = node.node_type === "start";
  const isEnd = node.node_type === "end";
  const isCircular = isStart || isEnd;
  const isDecision = node.node_type === "decision";

  const rootClassName = cn(
    "border-2 shadow-sm transition-shadow",
    COLORS[node.node_type],
    selected && "ring-2 ring-primary ring-offset-2",
    data.invalid && "ring-2 ring-destructive",
    isCircular
      ? "h-32 w-32 rounded-full"
      : isDecision
        ? "h-36 w-36 rotate-45 rounded-[1.75rem]"
        : "min-w-56 rounded-xl",
  );

  const contentClassName = cn(
    "relative z-10 h-full w-full",
    isCircular
      ? "flex flex-col items-center justify-center gap-2 p-4 text-center"
      : isDecision
        ? "flex h-full w-full -rotate-45 flex-col items-center justify-center gap-1.5 p-4 text-center"
        : "p-3",
  );

  const iconShellClassName = cn(
    "flex items-center justify-center border border-white/70 bg-white/80 shadow-sm dark:border-white/10 dark:bg-slate-950/40",
    isCircular
      ? "h-12 w-12 rounded-full"
      : isDecision
        ? "h-10 w-10 rounded-xl"
        : "rounded-lg p-2",
  );

  return (
    <div className={rootClassName}>
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      )}
      <div className={contentClassName}>
        {isCircular || isDecision ? (
          <>
            <div className={iconShellClassName}>
              <Icon className="h-5 w-5 text-current" />
            </div>
            <div className="space-y-0.5">
              <p className="line-clamp-2 text-sm font-semibold leading-tight">
                {node.label}
              </p>
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-75">
                {getTramiteNodeTypeLabel(node.node_type)}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <div className={iconShellClassName}>
                <Icon className="h-4 w-4 text-current" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{node.label}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide opacity-70">
                  {getTramiteNodeTypeLabel(node.node_type)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {actor && (
                <Badge variant="secondary" className="text-[10px]">
                  {actor}
                </Badge>
              )}
              {node.due_days !== null && (
                <Badge variant="outline" className="text-[10px]">
                  {node.due_days} dia(s)
                </Badge>
              )}
              {(node.required_evidence || node.required_file) && (
                <Badge variant="outline" className="text-[10px]">
                  Evidência
                </Badge>
              )}
              {data.warning && (
                <Badge variant="outline" className="text-[10px] text-amber-700">
                  Aviso
                </Badge>
              )}
            </div>
          </>
        )}
        {(isCircular || isDecision) && (
          <div className="flex flex-wrap justify-center gap-1">
            {actor && (
              <Badge variant="secondary" className="text-[10px]">
                {actor}
              </Badge>
            )}
            {data.warning && (
              <Badge variant="outline" className="text-[10px] text-amber-700">
                Aviso
              </Badge>
            )}
          </div>
        )}
        {(isCircular || isDecision) && node.due_days !== null && (
          <Badge variant="outline" className="mx-auto text-[10px]">
            {node.due_days} dia(s)
          </Badge>
        )}
        {(isCircular || isDecision) &&
          (node.required_evidence || node.required_file) && (
            <Badge variant="outline" className="mx-auto text-[10px]">
              Evidência
            </Badge>
          )}
        {(isCircular || isDecision) && (
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-white/10" />
        )}
      </div>
      {!isEnd && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      )}
    </div>
  );
}
