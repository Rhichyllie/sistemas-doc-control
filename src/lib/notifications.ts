export type NotificationSeverity =
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "critical";

export type NotificationSchemaStatus =
  | "loading"
  | "enterprise"
  | "legacy"
  | "unavailable";

export interface InternalNotification {
  id: string;
  org_id: string | null;
  recipient_user_id: string | null;
  actor_user_id: string | null;
  notification_type: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  document_id: string | null;
  tramite_instance_id: string | null;
  tramite_step_id: string | null;
  action_url: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  expires_at: string | null;
  read: boolean;
}

export interface NotificationPreferences {
  notify_in_app: boolean;
  notify_email: boolean;
  daily_digest: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

export interface OperationalNotificationResult {
  created: number;
  skipped_duplicate: number;
  suppressed: number;
  errors: number;
  generated_at?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function severity(value: unknown): NotificationSeverity {
  return ["info", "success", "warning", "danger", "critical"].includes(
    String(value),
  )
    ? (String(value) as NotificationSeverity)
    : "info";
}

export function normalizeInternalNotification(
  value: unknown,
): InternalNotification | null {
  const row = record(value);
  if (!row.id || !row.title || !row.created_at) return null;
  const notificationType = String(
    row.notification_type ?? row.type ?? "information",
  );
  const readAt =
    typeof row.read_at === "string"
      ? row.read_at
      : row.read === true
        ? String(row.created_at)
        : null;
  return {
    id: String(row.id),
    org_id: row.org_id ? String(row.org_id) : null,
    recipient_user_id: row.recipient_user_id
      ? String(row.recipient_user_id)
      : row.user_id
        ? String(row.user_id)
        : null,
    actor_user_id: row.actor_user_id ? String(row.actor_user_id) : null,
    notification_type: notificationType,
    type: notificationType,
    severity: severity(row.severity),
    title: String(row.title),
    body: row.body
      ? String(row.body)
      : row.message
        ? String(row.message)
        : null,
    entity_type: row.entity_type ? String(row.entity_type) : null,
    entity_id: row.entity_id ? String(row.entity_id) : null,
    document_id: row.document_id ? String(row.document_id) : null,
    tramite_instance_id: row.tramite_instance_id
      ? String(row.tramite_instance_id)
      : null,
    tramite_step_id: row.tramite_step_id ? String(row.tramite_step_id) : null,
    action_url: isSafeNotificationAction(row.action_url)
      ? String(row.action_url)
      : row.document_id
        ? `/authenticated/documents/${String(row.document_id)}`
        : null,
    metadata: record(row.metadata),
    read_at: readAt,
    dismissed_at: row.dismissed_at ? String(row.dismissed_at) : null,
    created_at: String(row.created_at),
    expires_at: row.expires_at ? String(row.expires_at) : null,
    read: Boolean(readAt),
  };
}

export function isNotificationSchemaMissing(error: unknown) {
  const row = record(error);
  const code = String(row.code ?? "").toUpperCase();
  const message = [row.message, row.details, row.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    ["42P01", "PGRST202", "PGRST205"].includes(code) ||
    (message.includes("internal_notifications") &&
      (message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("could not find")))
  );
}

export function isSafeNotificationAction(value: unknown): value is string {
  const hasControlCharacter =
    typeof value === "string" &&
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
  return (
    typeof value === "string" &&
    value.startsWith("/authenticated/") &&
    !hasControlCharacter
  );
}

export function getNotificationSeverityLabel(value: NotificationSeverity) {
  const labels: Record<NotificationSeverity, string> = {
    info: "Informação",
    success: "Sucesso",
    warning: "Atenção",
    danger: "Risco",
    critical: "Crítica",
  };
  return labels[value];
}

export function isEscalationNotification(notification: InternalNotification) {
  return (
    notification.notification_type === "notification_escalated" ||
    notification.metadata.source === "escalation_rule" ||
    notification.metadata.source === "default_escalation"
  );
}

export function explainNotification(notification: InternalNotification) {
  if (isEscalationNotification(notification)) {
    return "Escalonamento operacional; nenhum responsável ou status foi alterado.";
  }
  if (notification.notification_type === "substitute_available") {
    return "Ação como substituto exige confirmação e será auditada.";
  }
  if (notification.notification_type.includes("overdue")) {
    return "Prazo vencido identificado na última geração operacional.";
  }
  return "Notificação interna do TRAMITA.";
}
