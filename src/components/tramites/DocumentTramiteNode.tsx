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
  start: "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
  draft: "border-sky-300 bg-sky-50 dark:bg-sky-950/40",
  review: "border-violet-300 bg-violet-50 dark:bg-violet-950/40",
  approval: "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40",
  correction: "border-amber-400 bg-amber-50 dark:bg-amber-950/40",
  evidence: "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/40",
  mandatory_reading: "border-blue-300 bg-blue-50 dark:bg-blue-950/40",
  publication: "border-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-950/40",
  decision: "border-orange-400 bg-orange-50 dark:bg-orange-950/40",
  end: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
  custom: "border-slate-400 bg-slate-50 dark:bg-slate-900",
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

  return (
    <div
      className={`min-w-48 rounded-xl border-2 p-3 shadow-sm transition-shadow ${
        COLORS[node.node_type]
      } ${selected ? "ring-2 ring-primary ring-offset-2" : ""} ${
        data.invalid ? "ring-2 ring-destructive" : ""
      }`}
    >
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      )}
      <div className="flex items-start gap-2">
        <div className="rounded-lg bg-background/80 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{node.label}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
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
