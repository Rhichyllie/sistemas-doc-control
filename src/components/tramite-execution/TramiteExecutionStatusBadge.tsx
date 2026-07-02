import { Badge } from "@/components/ui/badge";
import {
  getInstanceStatusLabel,
  type TramiteExecutionStatus,
} from "@/lib/documentTramiteExecution";

const STATUS_CLASS: Record<TramiteExecutionStatus, string> = {
  active: "border-blue-200 bg-blue-50 text-blue-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
  failed: "border-red-200 bg-red-50 text-red-700",
};

export function TramiteExecutionStatusBadge({
  status,
  activeSteps,
}: {
  status: TramiteExecutionStatus;
  activeSteps?: number;
}) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {getInstanceStatusLabel(status)}
      {status === "active" && typeof activeSteps === "number"
        ? ` · ${activeSteps} ${activeSteps === 1 ? "etapa" : "etapas"}`
        : ""}
    </Badge>
  );
}
