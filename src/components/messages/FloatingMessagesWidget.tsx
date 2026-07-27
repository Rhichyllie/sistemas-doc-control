import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  MessageCircle,
  Search,
  SendHorizontal,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGlobalMessages, type GlobalMessageUser } from "@/hooks/useGlobalMessages";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function FloatingMessagesWidget() {
  const {
    users,
    onlineUsers,
    loadingUsers,
    realtimeAvailable,
    sendMessage,
    getConversation,
    currentUserId,
  } = useGlobalMessages();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<GlobalMessageUser | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const sorted = [...users]
      .filter((user) => user.id !== currentUserId)
      .sort((left, right) => {
        if (left.isOnline !== right.isOnline) {
          return left.isOnline ? -1 : 1;
        }
        return left.full_name.localeCompare(right.full_name, "pt-BR");
      });

    if (!query) return sorted;

    return sorted.filter((user) =>
      [user.full_name, user.role, user.department ?? ""]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(query),
    );
  }, [currentUserId, search, users]);

  const conversation = useMemo(
    () => (selectedUser ? getConversation(selectedUser.id) : []),
    [getConversation, selectedUser],
  );

  useEffect(() => {
    if (!selectedUser) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, selectedUser]);

  async function handleSend() {
    if (!selectedUser) return;
    const success = await sendMessage(selectedUser.id, draft);
    if (success) {
      setDraft("");
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex items-end">
      <div className="pointer-events-auto">
        {open && (
          <div className="mb-3 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_-20px_rgba(79,70,229,0.35)]">
            <div className="flex items-center justify-between bg-gradient-to-r from-[#4b8ef8] to-[#7c5cf6] px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                {selectedUser ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setSelectedUser(null)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                <div>
                  <p className="text-sm font-semibold">
                    {selectedUser ? selectedUser.full_name : "Mensagens"}
                  </p>
                  <p className="text-[11px] text-white/80">
                    {selectedUser
                      ? selectedUser.isOnline
                        ? "Online agora"
                        : "Offline"
                      : `${onlineUsers.length} usuários online`}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setOpen(false)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            {!selectedUser ? (
              <>
                <div className="border-b border-slate-100 p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar pessoas..."
                      className="h-10 rounded-xl border-slate-200 pl-9"
                    />
                  </div>
                </div>
                <ScrollArea className="h-[360px]">
                  <div className="space-y-1 p-3">
                    {loadingUsers ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Carregando usuários...
                      </p>
                    ) : filteredUsers.length ? (
                      filteredUsers.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => setSelectedUser(user)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50"
                        >
                          <div className="relative shrink-0">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={user.avatar_url ?? undefined} />
                              <AvatarFallback className="bg-slate-100 text-slate-700">
                                {initials(user.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                                user.isOnline ? "bg-emerald-500" : "bg-slate-300"
                              }`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {user.full_name}
                              </p>
                              {user.isOnline && (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                  Online
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-xs text-slate-500">
                              {user.department || user.role}
                            </p>
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum membro encontrado
                      </p>
                    )}
                  </div>
                </ScrollArea>
                <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                  {realtimeAvailable
                    ? "Mensagens ao vivo ativas."
                    : "Modo local ativo. As mensagens ficam disponíveis neste navegador."}
                </div>
              </>
            ) : (
              <>
                <ScrollArea className="h-[320px] bg-slate-50/60 px-3 py-3">
                  <div className="space-y-3">
                    {conversation.length ? (
                      conversation.map((message) => {
                        const isMine = message.senderId === currentUserId;
                        return (
                          <div
                            key={message.id}
                            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                isMine
                                  ? "bg-gradient-to-r from-[#4b8ef8] to-[#7c5cf6] text-white"
                                  : "bg-white text-slate-700"
                              }`}
                            >
                              <p>{message.body}</p>
                              <p
                                className={`mt-1 text-[10px] ${
                                  isMine ? "text-white/75" : "text-slate-400"
                                }`}
                              >
                                {formatMessageTime(message.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex h-[260px] items-center justify-center text-center text-sm text-muted-foreground">
                        Comece a conversa com {selectedUser.full_name}.
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
                <div className="border-t border-slate-100 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Digite uma mensagem..."
                      className="h-10 rounded-xl border-slate-200"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleSend();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      className="h-10 rounded-xl bg-gradient-to-r from-[#4b8ef8] to-[#7c5cf6] text-white hover:opacity-95"
                      onClick={() => void handleSend()}
                    >
                      <SendHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex h-10 items-center gap-2 rounded-t-xl rounded-bl-xl bg-gradient-to-r from-[#4b8ef8] to-[#7c5cf6] px-4 text-sm font-semibold text-white shadow-[0_16px_32px_-18px_rgba(99,102,241,0.75)]"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Mensagens</span>
          <Badge className="h-5 rounded-full bg-white/20 px-2 text-[10px] text-white hover:bg-white/20">
            {onlineUsers.length} usuários
          </Badge>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}
