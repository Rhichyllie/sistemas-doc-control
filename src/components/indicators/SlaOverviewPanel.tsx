import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { OperationalIndicatorsReport } from "@/lib/operationalIndicators";

export function SlaOverviewPanel({
  sla,
}: {
  sla: OperationalIndicatorsReport["sla"];
}) {
  const compliance = sla.complianceRate ?? 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-primary" />
              Cumprimento de SLA
            </CardTitle>
            <CardDescription>{sla.explanation}</CardDescription>
          </div>
          <Badge variant="outline">
            {sla.deadlineMode === "operational_calendar"
              ? "Calendário operacional"
              : "Comparação simples"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Compliance</span>
            <span className="text-2xl font-semibold">
              {sla.complianceRate === null ? "—" : `${compliance}%`}
            </span>
          </div>
          <Progress value={compliance} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SlaValue label="No prazo" value={sla.onTime} />
          <SlaValue label="Próximos" value={sla.dueSoon} />
          <SlaValue label="Vencidos" value={sla.overdue} critical />
          <SlaValue label="Sem política" value={sla.withoutSlaPolicy} />
        </div>
        <Button asChild variant="outline">
          <Link to="/authenticated/configuracoes/calendario">
            Revisar Calendário e SLA
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SlaValue({
  label,
  value,
  critical = false,
}: {
  label: string;
  value: number | null;
  critical?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          critical
            ? "text-xl font-semibold text-destructive"
            : "text-xl font-semibold"
        }
      >
        {value ?? "—"}
      </p>
    </div>
  );
}
