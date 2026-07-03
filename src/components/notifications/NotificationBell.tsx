import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { useNotifications } from "@/hooks/useNotifications";
import { getNotificationSeverityLabel } from "@/lib/notifications";

export function NotificationBell({
  state,
}: {
  state: ReturnType<typeof useNotifications>;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="relative bg-white/90 text-gray-800 shadow-md transition-all hover:bg-white hover:shadow-lg"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          {state.unreadCount > 0 && (
            <Badge
              className="absolute -right-2 -top-2 h-5 min-w-5 px-1 text-[10px]"
              variant="destructive"
            >
              {state.unreadCount > 99 ? "99+" : state.unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Notificações</p>
              <p className="text-xs text-muted-foreground">
                Alertas internos e escalonamentos operacionais
              </p>
            </div>
            {state.unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void state.markAllRead()}
              >
                <CheckCheck className="h-4 w-4" />
                Ler todas
              </Button>
            )}
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {state.loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Carregando notificações...
              </p>
            ) : state.notifications.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nada pendente agora. A operação documental está respirando.
              </p>
            ) : (
              state.notifications.slice(0, 6).map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-lg border p-3 ${
                    notification.read ? "" : "bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {notification.body}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {getNotificationSeverityLabel(notification.severity)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(notification.created_at))}
                    </span>
                    {!notification.read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => void state.markRead(notification.id)}
                      >
                        Marcar lida
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <Button asChild variant="secondary" className="w-full">
            <Link to="/authenticated/notificacoes">
              Abrir inbox
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
