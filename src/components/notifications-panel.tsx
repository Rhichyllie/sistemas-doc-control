import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, CheckCheck, Trash2, AlertTriangle, Clock, RefreshCw, Info } from "lucide-react";
import { useLocalData } from "@/hooks/use-local-data";
import type { AppNotification } from "@/contexts/local-data-context";
import { cn } from "@/lib/utils";

const typeConfig: Record<AppNotification["type"], { icon: any; label: string; class: string }> = {
  overdue:       { icon: AlertTriangle, label: "Atrasado",       class: "text-destructive" },
  reminder:      { icon: Clock,         label: "Lembrete",        class: "text-warning" },
  status_change: { icon: RefreshCw,     label: "Status",          class: "text-info" },
  info:          { icon: Info,          label: "Informação",      class: "text-muted-foreground" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "agora";
  if (mins < 60)  return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

export function NotificationPanel() {
  const { notifications, setNotifications } = useLocalData();
  const [filter, setFilter] = useState<"all" | "unread" | AppNotification["type"]>("all");

  const unreadCount = notifications.filter(n => !n.read).length;

  const filtered = notifications.filter(n => {
    if (filter === "all")    return true;
    if (filter === "unread") return !n.read;
    return n.type === filter;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  function markAsRead(id: string) {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function markAllAsRead() {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  }

  function deleteNotification(id: string) {
    setNotifications(notifications.filter(n => n.id !== id));
  }

  function clearAll() {
    setNotifications([]);
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="default" className="relative bg-white/90 text-gray-800 hover:bg-white shadow-md hover:shadow-lg transition-all">
          <Bell className="h-5 w-5 mr-2" />
          Notificações
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-[11px] font-bold text-white flex items-center justify-center shadow-lg">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="w-[420px] sm:w-[480px] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notificações
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-xs">{unreadCount} novas</Badge>
              )}
            </SheetTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={markAllAsRead} disabled={unreadCount === 0}>
                <CheckCheck className="h-4 w-4 mr-1" /> Ler todas
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll} disabled={notifications.length === 0}>
                <Trash2 className="h-4 w-4 mr-1" /> Limpar
              </Button>
            </div>
          </div>

          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="mt-2">
            <TabsList className="w-full grid grid-cols-5 h-8">
              <TabsTrigger value="all"          className="text-xs">Todas</TabsTrigger>
              <TabsTrigger value="unread"       className="text-xs">Não lidas</TabsTrigger>
              <TabsTrigger value="overdue"      className="text-xs">Atraso</TabsTrigger>
              <TabsTrigger value="reminder"     className="text-xs">Lembrete</TabsTrigger>
              <TabsTrigger value="status_change" className="text-xs">Status</TabsTrigger>
            </TabsList>
          </Tabs>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 py-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Bell className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="space-y-2 py-2">
              {filtered.map(notif => {
                const cfg = typeConfig[notif.type] ?? typeConfig.info;
                const Icon = cfg.icon;
                return (
                  <div
                    key={notif.id}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      notif.read
                        ? "bg-background border-border"
                        : "bg-muted/40 border-border"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 shrink-0", cfg.class)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("text-sm font-medium truncate", !notif.read && "font-semibold")}>
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {notif.message}
                        </p>
                        {notif.documentTitle && (
                          <p className="text-xs text-primary mt-1 truncate">
                            📄 {notif.documentTitle}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {timeAgo(notif.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2 justify-end">
                      {!notif.read && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                          onClick={() => markAsRead(notif.id)}>
                          <CheckCheck className="h-3 w-3 mr-1" /> Marcar como lida
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-destructive hover:text-destructive"
                        onClick={() => deleteNotification(notif.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}