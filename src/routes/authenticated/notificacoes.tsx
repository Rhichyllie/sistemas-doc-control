import { createFileRoute } from "@tanstack/react-router";
import { NotificationsInbox } from "@/components/notifications/NotificationsInbox";

export const Route = createFileRoute("/authenticated/notificacoes")({
  component: NotificationsInbox,
});
