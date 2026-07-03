import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  ExternalLink,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuthContext } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import {
  explainNotification,
  getNotificationSeverityLabel,
  type OperationalNotificationResult,
  type NotificationPreferences,
  type NotificationSeverity,
} from "@/lib/notifications";

type ReadFilter = "all" | "unread" | "read";

function formatGenerationDate(value: string | null | undefined) {
  if (!value) return "Nunca registrada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function NotificationsInbox() {
  const { profile } = useAuthContext();
  const canViewOrganization =
    profile?.role === "admin" || profile?.role === "manager";
  const [scope, setScope] = useState<"mine" | "organization">("mine");
  const state = useNotifications({
    organizationView: canViewOrganization && scope === "organization",
  });
  const [readFilter, setReadFilter] = useState<ReadFilter>("unread");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [documentFilter, setDocumentFilter] = useState("");
  const [draftPreferences, setDraftPreferences] =
    useState<NotificationPreferences | null>(null);
  const [lastGeneration, setLastGeneration] =
    useState<OperationalNotificationResult | null>(null);
  const preferences = draftPreferences ?? state.preferences;
  const canGenerate = profile?.role === "admin" || profile?.role === "manager";

  const filtered = useMemo(
    () =>
      state.notifications.filter((notification) => {
        if (readFilter === "unread" && notification.read) return false;
        if (readFilter === "read" && !notification.read) return false;
        if (
          severityFilter !== "all" &&
          notification.severity !== severityFilter
        ) {
          return false;
        }
        if (
          typeFilter.trim() &&
          !notification.notification_type
            .toLowerCase()
            .includes(typeFilter.trim().toLowerCase())
        ) {
          return false;
        }
        if (
          documentFilter.trim() &&
          !String(notification.document_id ?? "")
            .toLowerCase()
            .includes(documentFilter.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [
      documentFilter,
      readFilter,
      severityFilter,
      state.notifications,
      typeFilter,
    ],
  );

  async function savePreferences() {
    if (await state.savePreferences(preferences)) {
      setDraftPreferences(null);
      toast.success("Preferências salvas.");
    }
  }

  async function generate() {
    const result = await state.generateOperational();
    if (result) {
      setLastGeneration(result);
      if (result.errors > 0) {
        toast.warning(
          "Alguns alertas não puderam ser gerados. Verifique o diagnóstico operacional.",
        );
      } else {
        toast.success(
          `${result.created} criada(s), ${result.skipped_duplicate} duplicada(s) ignorada(s).`,
        );
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Badge variant="outline" className="mb-3">
            Inbox operacional
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">Notificações</h1>
          <p className="mt-2 text-muted-foreground">
            Alertas internos, escalonamentos e ações documentais que exigem
            atenção.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void state.refetch()}
            disabled={state.loading}
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          {canGenerate && (
            <Button onClick={generate} disabled={state.isSaving}>
              Gerar alertas agora
            </Button>
          )}
        </div>
      </div>

      {state.schemaStatus === "legacy" && (
        <Alert>
          <Bell className="h-4 w-4" />
          <AlertTitle>Modo de compatibilidade</AlertTitle>
          <AlertDescription>
            O ciclo 23 ainda não está instalado. A inbox usa notificações
            legadas, sem severidade, eventos ou escalonamento.
          </AlertDescription>
        </Alert>
      )}
      {state.schemaStatus === "enterprise" && (
        <Alert>
          <Bell className="h-4 w-4" />
          <AlertTitle>Ciclo 23 ativo</AlertTitle>
          <AlertDescription>
            A inbox enterprise está disponível. A geração permanece manual e
            nenhum e-mail, WhatsApp ou SMS é enviado.
          </AlertDescription>
        </Alert>
      )}
      {state.error && (
        <Alert variant="destructive">
          <AlertTitle>Notificações indisponíveis</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {lastGeneration && (
        <Alert variant={lastGeneration.errors > 0 ? "destructive" : "default"}>
          <AlertTitle>Resultado da geração operacional</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {lastGeneration.created} criada(s),{" "}
              {lastGeneration.skipped_duplicate} duplicada(s) ignorada(s),{" "}
              {lastGeneration.suppressed} suprimida(s) e {lastGeneration.errors}{" "}
              erro(s).
            </p>
            {lastGeneration.errors > 0 && (
              <Button asChild size="sm" variant="outline">
                <Link to="/authenticated/configuracoes/diagnostico">
                  Abrir Diagnóstico Operacional
                </Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Não lidas</p>
            <p className="mt-1 text-2xl font-semibold">{state.unreadCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Críticas</p>
            <p className="mt-1 text-2xl font-semibold">
              {state.criticalUnreadCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Escalonamentos</p>
            <p className="mt-1 text-2xl font-semibold">
              {state.escalationUnreadCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Última geração</p>
            <p className="mt-2 text-base font-semibold">
              {formatGenerationDate(
                lastGeneration?.generated_at ?? state.lastGeneratedAt,
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lastGeneration
                ? `${lastGeneration.created} criada(s) e ${lastGeneration.errors} erro(s) nesta sessão`
                : "Evento notification_generated mais recente"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Refine a inbox sem alterar documentos ou etapas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {canViewOrganization && (
            <Select
              value={scope}
              onValueChange={(value) =>
                setScope(value as "mine" | "organization")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Minhas notificações</SelectItem>
                <SelectItem value="organization">Toda a organização</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select
            value={readFilter}
            onValueChange={(value) => setReadFilter(value as ReadFilter)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unread">Não lidas</SelectItem>
              <SelectItem value="read">Lidas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as severidades</SelectItem>
              {(
                [
                  "info",
                  "success",
                  "warning",
                  "danger",
                  "critical",
                ] as NotificationSeverity[]
              ).map((severity) => (
                <SelectItem key={severity} value={severity}>
                  {getNotificationSeverityLabel(severity)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            placeholder="Filtrar por tipo"
          />
          <Input
            value={documentFilter}
            onChange={(event) => setDocumentFilter(event.target.value)}
            placeholder="ID do documento"
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {state.loading ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Carregando notificações...
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">
              <Bell className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">
                Nada pendente agora. A operação documental está respirando.
              </p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((notification) => (
            <Card
              key={notification.id}
              className={notification.read ? "" : "border-primary/30"}
            >
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {getNotificationSeverityLabel(notification.severity)}
                    </Badge>
                    <Badge variant="secondary">
                      {notification.notification_type}
                    </Badge>
                    {!notification.read && <Badge>Nova</Badge>}
                  </div>
                  <h2 className="mt-3 font-semibold">{notification.title}</h2>
                  {notification.body && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {notification.body}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {explainNotification(notification)}
                  </p>
                  {state.organizationView && notification.recipient_user_id && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Destinatário: {notification.recipient_user_id.slice(0, 8)}
                      …
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(notification.created_at))}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {notification.action_url && (
                    <Button asChild size="sm">
                      <a href={notification.action_url}>
                        Abrir
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  {!notification.read &&
                    notification.recipient_user_id === profile?.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void state.markRead(notification.id)}
                      >
                        <CheckCheck className="h-4 w-4" />
                        Marcar lida
                      </Button>
                    )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void state.dismiss(notification.id)}
                    disabled={notification.recipient_user_id !== profile?.id}
                  >
                    <Trash2 className="h-4 w-4" />
                    Dispensar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preferências</CardTitle>
          <CardDescription>
            E-mail e digest ficam preparados, mas nenhum envio externo ocorre
            nesta fase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              key: "notify_in_app" as const,
              label: "Receber notificações internas",
            },
            {
              key: "notify_email" as const,
              label: "Preparar e-mail futuro",
            },
            {
              key: "daily_digest" as const,
              label: "Preparar digest diário futuro",
            },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 rounded-lg border p-3"
            >
              <Label>{item.label}</Label>
              <Switch
                checked={preferences[item.key]}
                disabled={state.schemaStatus !== "enterprise"}
                onCheckedChange={(checked) =>
                  setDraftPreferences({ ...preferences, [item.key]: checked })
                }
              />
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Silêncio a partir de</Label>
              <Input
                type="time"
                value={preferences.quiet_hours_start ?? ""}
                disabled={state.schemaStatus !== "enterprise"}
                onChange={(event) =>
                  setDraftPreferences({
                    ...preferences,
                    quiet_hours_start: event.target.value || null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Silêncio até</Label>
              <Input
                type="time"
                value={preferences.quiet_hours_end ?? ""}
                disabled={state.schemaStatus !== "enterprise"}
                onChange={(event) =>
                  setDraftPreferences({
                    ...preferences,
                    quiet_hours_end: event.target.value || null,
                  })
                }
              />
            </div>
          </div>
          <Button
            onClick={savePreferences}
            disabled={state.schemaStatus !== "enterprise" || state.isSaving}
          >
            Salvar preferências
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
