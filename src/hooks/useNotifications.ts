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
