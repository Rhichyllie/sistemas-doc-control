import { Activity, CheckCircle2, CircleX, Paperclip } from "lucide-react";
import type { DocumentTramiteInstanceEvent } from "@/lib/documentTramiteExecution";

const EVENT_LABELS: Record<string, string> = {
  instance_started: "Trâmite iniciado",
  step_activated: "Etapa ativada",
  step_completed: "Etapa concluída",
  step_blocked: "Etapa bloqueada",
  evidence_added: "Evidência registrada",
  decision_recorded: "Decisão registrada",
  instance_completed: "Trâmite concluído",
  instance_cancelled: "Trâmite cancelado",
  instance_failed: "Execução interrompida",
  repaired: "Execução reparada",
};

function EventIcon({ eventType }: { eventType: string }) {
  if (eventType === "evidence_added") return <Paperclip className="h-4 w-4" />;
  if (eventType.includes("completed") || eventType === "decision_recorded") {
    return <CheckCircle2 className="h-4 w-4" />;
  }
  if (eventType.includes("cancelled") || eventType.includes("failed")) {
    return <CircleX className="h-4 w-4" />;
  }
  return <Activity className="h-4 w-4" />;
}

function metadataSummary(metadata: Record<string, unknown>) {
  const values = [
    metadata.decision,
    metadata.reason,
    metadata.comment,
    metadata.evidence_type,
  ].filter(
    (value): value is string => typeof value === "string" && Boolean(value),
  );
  return values.join(" · ");
}

export function TramiteExecutionEvents({
  events,
  actorNames = {},
}: {
  events: DocumentTramiteInstanceEvent[];
  actorNames?: Record<string, string>;
}) {
  if (!events.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum evento registrado nesta execução.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {events.map((event) => {
        const summary = metadataSummary(event.metadata);
        return (
          <div key={event.id} className="flex gap-3 text-sm">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <EventIcon eventType={event.event_type} />
            </span>
            <div className="min-w-0">
              <p className="font-medium">
                {EVENT_LABELS[event.event_type] ?? event.event_type}
              </p>
              <p className="text-xs text-muted-foreground">
                {event.actor_id
                  ? actorNames[event.actor_id] || "Usuário da organização"
                  : "Sistema"}{" "}
                ·{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(event.created_at))}
              </p>
              {summary && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {summary}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
