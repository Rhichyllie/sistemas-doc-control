import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import {
  isEscalationNotification,
  isNotificationSchemaMissing,
  normalizeInternalNotification,
  type InternalNotification,
  type NotificationPreferences,
  type NotificationSchemaStatus,
  type OperationalNotificationResult,
} from "@/lib/notifications";
import { supabase } from "@/lib/supabase";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  notify_in_app: true,
  notify_email: false,
  daily_digest: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

export type Notification = InternalNotification;

export function useNotifications(options: { organizationView?: boolean } = {}) {
  const { profile } = useAuthContext();
  const organizationView =
    options.organizationView === true &&
    (profile?.role === "admin" || profile?.role === "manager");
  const [notifications, setNotifications] = useState<InternalNotification[]>(
    [],
  );
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [schemaStatus, setSchemaStatus] =
    useState<NotificationSchemaStatus>("loading");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const fetchLegacyNotifications = useCallback(async () => {
    if (!profile?.id) return;
    const legacyResult = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (legacyResult.error) {
      setNotifications([]);
      setSchemaStatus("unavailable");
      setError(
        getErrorMessage(
          legacyResult.error,
          "Notificações não estão disponíveis neste ambiente.",
        ),
      );
      return;
    }
    setNotifications(
      (legacyResult.data ?? [])
        .map(normalizeInternalNotification)
        .filter((item): item is InternalNotification => Boolean(item)),
    );
    setPreferences(DEFAULT_PREFERENCES);
    setSchemaStatus("legacy");
    setLastGeneratedAt(null);
  }, [profile?.id]);

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id || !profile.org_id) {
      setNotifications([]);
      setSchemaStatus("unavailable");
      setLastGeneratedAt(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    let notificationQuery = supabase
      .from("internal_notifications")
      .select("*")
      .eq("org_id", profile.org_id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!organizationView) {
      notificationQuery = notificationQuery.eq("recipient_user_id", profile.id);
    }
    const notificationResult = await notificationQuery;

    if (notificationResult.error) {
      if (isNotificationSchemaMissing(notificationResult.error)) {
        await fetchLegacyNotifications();
      } else {
        setNotifications([]);
        setSchemaStatus("unavailable");
        setLastGeneratedAt(null);
        setError(
          getErrorMessage(
            notificationResult.error,
            "Não foi possível carregar as notificações internas.",
          ),
        );
      }
      setLoading(false);
      return;
    }

    setNotifications(
      (notificationResult.data ?? [])
        .map(normalizeInternalNotification)
        .filter((item): item is InternalNotification => Boolean(item)),
    );
    setSchemaStatus("enterprise");

    const [preferenceResult, generationEventResult] = await Promise.all([
      supabase
        .from("notification_preferences")
        .select(
          "notify_in_app, notify_email, daily_digest, quiet_hours_start, quiet_hours_end",
        )
        .eq("org_id", profile.org_id)
        .eq("user_id", profile.id)
        .maybeSingle(),
      supabase
        .from("notification_events")
        .select("created_at")
        .eq("org_id", profile.org_id)
        .eq("event_type", "notification_generated")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!preferenceResult.error && preferenceResult.data) {
      setPreferences({
        notify_in_app: preferenceResult.data.notify_in_app !== false,
        notify_email: preferenceResult.data.notify_email === true,
        daily_digest: preferenceResult.data.daily_digest === true,
        quiet_hours_start: preferenceResult.data.quiet_hours_start ?? null,
        quiet_hours_end: preferenceResult.data.quiet_hours_end ?? null,
      });
    } else {
      setPreferences(DEFAULT_PREFERENCES);
    }
    setLastGeneratedAt(
      !generationEventResult.error && generationEventResult.data?.created_at
        ? String(generationEventResult.data.created_at)
        : null,
    );
    setLoading(false);
  }, [
    fetchLegacyNotifications,
    organizationView,
    profile?.id,
    profile?.org_id,
  ]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!profile?.id) return;
    if (schemaStatus !== "enterprise" && schemaStatus !== "legacy") return;

    let destroyed = false;
    const enterprise = schemaStatus === "enterprise";
    const table = enterprise ? "internal_notifications" : "notifications";
    const orgId = profile.org_id;
    const userId = profile.id;

    if (enterprise && !orgId) return;

    const nonce =
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 14) +
          Date.now().toString(36));

    const channelName = enterprise
      ? `notifications-enterprise-${orgId}-${userId}-${organizationView ? "org" : "user"}-${nonce}`
      : `notifications-legacy-${userId}-${nonce}`;

    const filter = enterprise
      ? `org_id=eq.${orgId}`
      : `user_id=eq.${userId}`;

    const handleInsert = (record: Record<string, unknown>) => {
      if (destroyed) return;
      const normalized = normalizeInternalNotification(record);
      if (!normalized) return;

      if (enterprise && !organizationView) {
        if (normalized.recipient_user_id !== userId) return;
      }
      if (normalized.dismissed_at) return;

      setNotifications((current) => {
        if (current.some((n) => n.id === normalized.id)) return current;
        return [normalized, ...current].slice(0, 200);
      });
    };

    const handleUpdate = (record: Record<string, unknown>) => {
      if (destroyed) return;
      const normalized = normalizeInternalNotification(record);
      if (!normalized) return;

      if (enterprise && !organizationView) {
        if (normalized.recipient_user_id !== userId) return;
      }

      setNotifications((current) => {
        const existingIndex = current.findIndex((n) => n.id === normalized.id);

        if (enterprise && normalized.dismissed_at) {
          if (existingIndex === -1) return current;
          return current.filter((n) => n.id !== normalized.id);
        }

        if (existingIndex === -1) {
          if (enterprise && normalized.dismissed_at) return current;
          return [normalized, ...current].slice(0, 200);
        }

        const next = current.slice();
        next[existingIndex] = normalized;
        return next;
      });
    };

    const handleDelete = (record: Record<string, unknown>) => {
      if (destroyed) return;
      const id = String(record.id ?? "");
      if (!id) return;
      setNotifications((current) => current.filter((n) => n.id !== id));
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const setupChannel = () => {
      if (destroyed || cancelled) return;
      try {
        channel = supabase.channel(channelName, {
          config: {
            broadcast: { ack: false, self: false },
            presence: { key: "", enabled: false },
          },
        });

        try {
          channel.on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table,
              filter,
            },
            (payload) => {
              if (destroyed) return;
              try {
                if (payload.eventType === "INSERT" && payload.new) {
                  handleInsert(payload.new as Record<string, unknown>);
                } else if (payload.eventType === "UPDATE" && payload.new) {
                  handleUpdate(payload.new as Record<string, unknown>);
                } else if (payload.eventType === "DELETE" && payload.old) {
                  handleDelete(payload.old as Record<string, unknown>);
                }
              } catch (innerHandlerError) {
                console.error(
                  "[useNotifications] Realtime payload handler error",
                  innerHandlerError,
                  payload,
                );
              }
            },
          );
        } catch (onError) {
          console.error(
            "[useNotifications] Failed to attach postgres_changes listener",
            onError,
          );
          channel = null;
          return;
        }

        try {
          channel.subscribe((status, err) => {
            if (destroyed || cancelled) return;
            if (
              (status as unknown as string) !== "SUBSCRIBED" ||
              err
            ) {
              console.warn(
                "[useNotifications] Realtime channel status:",
                status,
                err ?? null,
              );
            }
          });
        } catch (subscribeError) {
          console.error(
            "[useNotifications] subscribe() threw synchronously",
            subscribeError,
          );
          channel = null;
        }
      } catch (realtimeError) {
        console.error(
          "[useNotifications] Failed to setup realtime channel — notifications will fall back to pull-only",
          realtimeError,
        );
        channel = null;
      }
    };

    const timeoutId = window.setTimeout(setupChannel, 0);

    return () => {
      destroyed = true;
      cancelled = true;
      try {
        window.clearTimeout(timeoutId);
      } catch {
        /* noop */
      }
      if (channel) {
        const ch = channel;
        channel = null;
        try {
          void Promise.resolve()
            .then(() => supabase.removeChannel(ch))
            .catch(() => {
              /* noop: cleanup failures must not propagate */
            });
        } catch {
          /* noop */
        }
      }
    };
  }, [schemaStatus, profile?.id, profile?.org_id, organizationView]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!profile?.id) return false;
      setError(null);
      if (schemaStatus === "enterprise") {
        const { error: rpcError } = await supabase.rpc(
          "mark_notification_read",
          { p_notification_id: notificationId },
        );
        if (rpcError) {
          setError(
            getErrorMessage(
              rpcError,
              "Não foi possível marcar a notificação como lida.",
            ),
          );
          return false;
        }
      } else if (schemaStatus === "legacy") {
        const { error: updateError } = await supabase
          .from("notifications")
          .update({ read: true })
          .eq("id", notificationId)
          .eq("user_id", profile.id);
        if (updateError) {
          setError(
            getErrorMessage(
              updateError,
              "Não foi possível marcar a notificação como lida.",
            ),
          );
          return false;
        }
      } else {
        return false;
      }

      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, read: true, read_at: readAt }
            : notification,
        ),
      );
      return true;
    },
    [profile?.id, schemaStatus],
  );

  const dismiss = useCallback(
    async (notificationId: string) => {
      if (schemaStatus !== "enterprise") {
        return markRead(notificationId);
      }
      const { error: rpcError } = await supabase.rpc("dismiss_notification", {
        p_notification_id: notificationId,
      });
      if (rpcError) {
        setError(
          getErrorMessage(
            rpcError,
            "Não foi possível dispensar a notificação.",
          ),
        );
        return false;
      }
      setNotifications((current) =>
        current.filter((notification) => notification.id !== notificationId),
      );
      return true;
    },
    [markRead, schemaStatus],
  );

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications
      .filter(
        (notification) =>
          !notification.read && notification.recipient_user_id === profile?.id,
      )
      .map((notification) => notification.id);
    for (const notificationId of unreadIds) {
      await markRead(notificationId);
    }
  }, [markRead, notifications, profile?.id]);

  const savePreferences = useCallback(
    async (input: NotificationPreferences) => {
      if (!profile?.id || !profile.org_id || schemaStatus !== "enterprise") {
        setError("Aplique o ciclo 23 para salvar preferências.");
        return false;
      }
      setIsSaving(true);
      setError(null);
      const { error: upsertError } = await supabase
        .from("notification_preferences")
        .upsert(
          {
            org_id: profile.org_id,
            user_id: profile.id,
            notify_in_app: input.notify_in_app,
            notify_email: input.notify_email,
            daily_digest: input.daily_digest,
            quiet_hours_start: input.quiet_hours_start,
            quiet_hours_end: input.quiet_hours_end,
            metadata: { source: "notification_inbox" },
          },
          { onConflict: "org_id,user_id" },
        );
      setIsSaving(false);
      if (upsertError) {
        setError(
          getErrorMessage(
            upsertError,
            "Não foi possível salvar as preferências.",
          ),
        );
        return false;
      }
      setPreferences(input);
      return true;
    },
    [profile?.id, profile?.org_id, schemaStatus],
  );

  const generateOperational = useCallback(async () => {
    if (schemaStatus !== "enterprise") {
      setError("Aplique o ciclo 23 para gerar notificações operacionais.");
      return null;
    }
    setIsSaving(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      "generate_operational_notifications",
      { p_now: new Date().toISOString() },
    );
    setIsSaving(false);
    if (rpcError) {
      setError(
        getErrorMessage(
          rpcError,
          "Não foi possível gerar notificações operacionais.",
        ),
      );
      return null;
    }
    await fetchNotifications();
    return data as unknown as OperationalNotificationResult;
  }, [fetchNotifications, schemaStatus]);

  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;
  const criticalUnreadCount = notifications.filter(
    (notification) =>
      !notification.read &&
      ["critical", "danger"].includes(notification.severity),
  ).length;
  const escalationUnreadCount = notifications.filter(
    (notification) =>
      !notification.read && isEscalationNotification(notification),
  ).length;
  const notificationsByDocument = useMemo(() => {
    const map = new Map<string, InternalNotification[]>();
    notifications.forEach((notification) => {
      if (!notification.document_id) return;
      const items = map.get(notification.document_id) ?? [];
      items.push(notification);
      map.set(notification.document_id, items);
    });
    return map;
  }, [notifications]);

  return {
    notifications,
    notificationsByDocument,
    unreadCount,
    criticalUnreadCount,
    escalationUnreadCount,
    loading,
    isSaving,
    error,
    schemaStatus,
    organizationView,
    preferences,
    lastGeneratedAt,
    markRead,
    markAllRead,
    dismiss,
    savePreferences,
    generateOperational,
    refetch: fetchNotifications,
  };
}
