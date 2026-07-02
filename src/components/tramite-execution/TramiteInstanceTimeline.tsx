import { Check, Circle, CircleAlert, Clock3, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getStepStatusLabel,
  sortStepsByGraph,
  type DocumentTramiteInstanceEdge,
  type DocumentTramiteInstanceStep,
} from "@/lib/documentTramiteExecution";
import { TramiteStepAssignmentBadge } from "./TramiteStepAssignmentBadge";

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function StepIcon({
  status,
}: {
  status: DocumentTramiteInstanceStep["status"];
}) {
  const common = "h-4 w-4";
  if (status === "completed") return <Check className={common} />;
  if (status === "active") return <Clock3 className={common} />;
  if (status === "blocked") return <CircleAlert className={common} />;
  if (status === "cancelled") return <X className={common} />;
  if (status === "skipped") return <Minus className={common} />;
  return <Circle className={common} />;
}

export function TramiteInstanceTimeline({
  steps,
  edges,
  userNames = {},
  groupNames = {},
}: {
  steps: DocumentTramiteInstanceStep[];
  edges: DocumentTramiteInstanceEdge[];
  userNames?: Record<string, string>;
  groupNames?: Record<string, string>;
}) {
  const ordered = sortStepsByGraph(steps, edges);
  return (
    <div className="space-y-1">
      {ordered.map((step, index) => {
        const overdue =
          step.status === "active" &&
          Boolean(step.due_at && new Date(step.due_at).getTime() < Date.now());
        return (
          <div key={step.id} className="relative flex gap-3 pb-4">
            {index < ordered.length - 1 && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border" />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                step.status === "active"
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : step.status === "completed"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : step.status === "blocked"
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "bg-background text-muted-foreground"
              }`}
            >
              <StepIcon status={step.status} />
            </span>
            <div
              className={`min-w-0 flex-1 rounded-lg border p-3 ${
                step.status === "active" ? "border-blue-200 bg-blue-50/40" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {step.description || step.node_type}
                  </p>
                </div>
                <Badge variant="outline">
                  {getStepStatusLabel(step.status)}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {!["start", "end"].includes(step.node_type) && (
                  <TramiteStepAssignmentBadge
                    step={step}
                    userName={
                      step.assignee_user_id
                        ? userNames[step.assignee_user_id]
                        : undefined
                    }
                    groupName={
                      step.assignee_group_id
                        ? groupNames[step.assignee_group_id]
                        : undefined
                    }
                  />
                )}
                {step.decision && (
                  <Badge variant="secondary">{step.decision}</Badge>
                )}
                {step.due_at && (
                  <Badge
                    variant="outline"
                    className={
                      overdue ? "border-red-200 bg-red-50 text-red-700" : ""
                    }
                  >
                    {overdue ? "Vencida" : "Prazo"}: {formatDate(step.due_at)}
                  </Badge>
                )}
              </div>
              {step.comment && (
                <p className="mt-2 text-xs text-muted-foreground">
                  “{step.comment}”
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
