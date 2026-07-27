import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, RealtimePresenceState } from "@supabase/supabase-js";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export interface GlobalMessageUser {
  id: string;
  full_name: string;
  role: string;
  department: string | null;
  avatar_url: string | null;
  active: boolean;
  isOnline: boolean;
}

export interface GlobalChatMessage {
  id: string;
  orgId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  body: string;
  createdAt: string;
}

interface PresencePayload {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  online_at: string;
}

const MESSAGE_STORAGE_PREFIX = "tramita.messages.";
const MESSAGE_BROADCAST_PREFIX = "tramita.messages.broadcast.";

function getMessageStorageKey(orgId: string) {
  return `${MESSAGE_STORAGE_PREFIX}${orgId}`;
}

function getBroadcastChannelName(orgId: string) {
  return `${MESSAGE_BROADCAST_PREFIX}${orgId}`;
}

function parseStoredMessages(orgId: string) {
  try {
    const raw = localStorage.getItem(getMessageStorageKey(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is GlobalChatMessage =>
        item &&
        typeof item === "object" &&
        item.orgId === orgId &&
        typeof item.id === "string" &&
        typeof item.senderId === "string" &&
        typeof item.recipientId === "string" &&
        typeof item.body === "string",
    );
  } catch {
    return [];
  }
}

function persistMessages(orgId: string, messages: GlobalChatMessage[]) {
  try {
    localStorage.setItem(
      getMessageStorageKey(orgId),
      JSON.stringify(messages.slice(-400)),
    );
  } catch {
    // O widget continua funcionando em memória.
  }
}

function mergeMessages(
  current: GlobalChatMessage[],
  incoming: GlobalChatMessage[],
): GlobalChatMessage[] {
  const map = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => {
    map.set(message.id, message);
  });
  return [...map.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

export function useGlobalMessages() {
  const { profile } = useAuthContext();
  const [users, setUsers] = useState<GlobalMessageUser[]>([]);
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [realtimeAvailable, setRealtimeAvailable] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const orgIdRef = useRef<string | null>(null);
  const profileIdRef = useRef<string | null>(null);
  const presenceRef = useRef<Record<string, PresencePayload>>({});

  const upsertMessages = useCallback(
    (incoming: GlobalChatMessage[]) => {
      if (!profile?.org_id || !incoming.length) return;
      setMessages((current) => {
        const next = mergeMessages(current, incoming);
        persistMessages(profile.org_id, next);
        return next;
      });
    },
    [profile?.org_id],
  );

  const applyPresenceState = useCallback((presence: Record<string, PresencePayload>) => {
    presenceRef.current = presence;
    setUsers((current) =>
      current.map((user) => ({
        ...user,
        isOnline: Boolean(presence[user.id]),
      })),
    );
  }, []);

  useEffect(() => {
    if (!profile?.org_id) {
      setUsers([]);
      setMessages([]);
      return;
    }

    orgIdRef.current = profile.org_id;
    profileIdRef.current = profile.id;
    setMessages(parseStoredMessages(profile.org_id));
  }, [profile?.id, profile?.org_id]);

  useEffect(() => {
    if (!profile?.org_id) return;

    let cancelled = false;
    setLoadingUsers(true);

    void supabase
      .from("profiles")
      .select("id, full_name, role, department, avatar_url, active")
      .eq("org_id", profile.org_id)
      .eq("active", true)
      .order("full_name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setUsers([
            {
              id: profile.id,
              full_name: profile.full_name,
              role: profile.role,
              department: profile.department,
              avatar_url: profile.avatar_url,
              active: true,
              isOnline: true,
            },
          ]);
          setLoadingUsers(false);
          return;
        }

        const currentPresence = presenceRef.current;
        setUsers(
          (data ?? []).map((item) => ({
            ...item,
            active: item.active !== false,
            isOnline: Boolean(currentPresence[item.id]) || item.id === profile.id,
          })),
        );
        setLoadingUsers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    profile?.avatar_url,
    profile?.department,
    profile?.full_name,
    profile?.id,
    profile?.org_id,
    profile?.role,
  ]);

  useEffect(() => {
    if (!profile?.org_id) return;

    const orgId = profile.org_id;

    function handleStorage(event: StorageEvent) {
      if (event.key !== getMessageStorageKey(orgId)) return;
      setMessages(parseStoredMessages(orgId));
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [profile?.org_id]);

  useEffect(() => {
    if (!profile?.org_id) return;
    if (typeof BroadcastChannel === "undefined") return;

    const orgId = profile.org_id;
    const profileId = profile.id;
    const broadcast = new BroadcastChannel(getBroadcastChannelName(orgId));
    broadcastRef.current = broadcast;

    broadcast.onmessage = (event: MessageEvent<GlobalChatMessage>) => {
      const incoming = event.data;
      if (!incoming || incoming.orgId !== orgId) return;
      if (
        incoming.senderId !== profileId &&
        incoming.recipientId !== profileId
      ) {
        return;
      }
      upsertMessages([incoming]);
    };

    return () => {
      broadcast.close();
      broadcastRef.current = null;
    };
  }, [profile?.id, profile?.org_id, upsertMessages]);

  useEffect(() => {
    if (!profile?.org_id) return;

    const channel = supabase.channel(`org-chat:${profile.org_id}`, {
      config: {
        broadcast: { self: false },
        presence: { key: profile.id },
      },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "chat_message" }, ({ payload }) => {
        const incoming = payload as GlobalChatMessage;
        if (!incoming || incoming.orgId !== profile.org_id) return;
        if (
          incoming.senderId !== profile.id &&
          incoming.recipientId !== profile.id
        ) {
          return;
        }
        upsertMessages([incoming]);
      })
      .on("presence", { event: "sync" }, () => {
        const rawState = channel.presenceState() as RealtimePresenceState<PresencePayload>;
        const nextPresence = Object.values(rawState).reduce<Record<string, PresencePayload>>(
          (accumulator, metas) => {
            metas.forEach((meta) => {
              accumulator[meta.user_id] = meta;
            });
            return accumulator;
          },
          {},
        );
        applyPresenceState(nextPresence);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeAvailable(true);
          await channel.track({
            user_id: profile.id,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            role: profile.role,
            online_at: new Date().toISOString(),
          });
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeAvailable(false);
          applyPresenceState({
            [profile.id]: {
              user_id: profile.id,
              full_name: profile.full_name,
              avatar_url: profile.avatar_url,
              role: profile.role,
              online_at: new Date().toISOString(),
            },
          });
        }
      });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [
    applyPresenceState,
    profile?.avatar_url,
    profile?.full_name,
    profile?.id,
    profile?.org_id,
    profile?.role,
    upsertMessages,
  ]);

  const onlineUsers = useMemo(
    () => users.filter((user) => user.isOnline && user.id !== profile?.id),
    [profile?.id, users],
  );

  const sendMessage = useCallback(
    async (recipientId: string, body: string) => {
      if (!profile?.org_id || !profileIdRef.current) return false;
      const trimmedBody = body.trim();
      if (!trimmedBody) return false;

      const message: GlobalChatMessage = {
        id:
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        orgId: profile.org_id,
        senderId: profile.id,
        senderName: profile.full_name,
        recipientId,
        body: trimmedBody,
        createdAt: new Date().toISOString(),
      };

      upsertMessages([message]);

      try {
        broadcastRef.current?.postMessage(message);
      } catch {
        // Ignora fallback local indisponível.
      }

      try {
        await channelRef.current?.send({
          type: "broadcast",
          event: "chat_message",
          payload: message,
        });
      } catch {
        setRealtimeAvailable(false);
      }

      return true;
    },
    [profile?.full_name, profile?.id, profile?.org_id, upsertMessages],
  );

  const getConversation = useCallback(
    (userId: string) =>
      messages.filter(
        (message) =>
          (message.senderId === userId && message.recipientId === profile?.id) ||
          (message.senderId === profile?.id && message.recipientId === userId),
      ),
    [messages, profile?.id],
  );

  return {
    users,
    onlineUsers,
    messages,
    loadingUsers,
    realtimeAvailable,
    sendMessage,
    getConversation,
    currentUserId: profile?.id ?? null,
  };
}
