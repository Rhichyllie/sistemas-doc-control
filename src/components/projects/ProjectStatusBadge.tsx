import { Badge } from "@/components/ui/badge";
import {
  getProjectStatusLabel,
  type ProjectStatus,
} from "@/lib/projectOperationalContext";

const STATUS_CLASS: Record<ProjectStatus, string> = {
  planning: "border-sky-200 bg-sky-50 text-sky-800",
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  paused: "border-amber-200 bg-amber-50 text-amber-800",
  closed: "border-slate-300 bg-slate-100 text-slate-700",
  cancelled: "border-red-200 bg-red-50 text-red-800",
  archived: "border-zinc-300 bg-zinc-100 text-zinc-700",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {getProjectStatusLabel(status)}
    </Badge>
  );
}
