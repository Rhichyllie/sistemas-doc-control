import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OperationalIndicatorsReport } from "@/lib/operationalIndicators";
import { formatCount } from "@/lib/operationalIndicators";

export function NotificationSignalPanel({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const signals = [
    {
      label: "Não lidas",
      value: report.notifications.unread,
      width: 70,
      color: "bg-primary",
    },
    {
      label: "Críticas",
      value: report.notifications.criticalUnread,
      width: 100,
      color: "bg-destructive",
    },
    {
      label: "Escalonamentos abertos",
      value: report.notifications.openEscalations,
      width: 86,
      color: "bg-amber-500",
    },
    {
      label: "Geradas no período",
      value: report.notifications.generatedInPeriod,
      width: 55,
      color: "bg-sky-500",
    },
    {
      label: "Escaladas no período",
      value: report.notifications.escalatedInPeriod,
      width: 70,
      color: "bg-orange-500",
    },
    {
      label: "Suprimidas",
      value: report.notifications.suppressedInPeriod,
      width: 35,
      color: "bg-muted-foreground/50",
    },
  ];
  const maximum = Math.max(...signals.map((item) => item.value ?? 0), 1);

  return (
    <Card data-print-break-inside>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4 text-primary" />
          Sinal de notificações
        </CardTitle>
        <CardDescription>
          Leitura da inbox e dos eventos; nenhuma geração é executada aqui.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {signals.map((signal) => (
            <div key={signal.label} className="rounded-xl border p-3">
              <p className="text-2xl font-semibold">
                {formatCount(signal.value)}
              </p>
              <p className="mt-1 text-sm">{signal.label}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${signal.color}`}
                  style={{
                    width: `${Math.max(
                      ((signal.value ?? 0) / maximum) * signal.width,
                      signal.value ? 5 : 0,
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
          <span>
            Última geração:{" "}
            {report.notifications.lastGenerationAt
              ? new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(report.notifications.lastGenerationAt))
              : "não informada"}
          </span>
          <span>
            Erros na última geração:{" "}
            {formatCount(report.notifications.lastGenerationErrors)}
          </span>
        </div>
        <Button asChild className="mt-4 h-auto p-0" variant="link">
          <Link to="/authenticated/notificacoes">
            Abrir inbox
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
