import { Link } from "@tanstack/react-router";
import { ArrowUpRight, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OperationalIndicatorsReport } from "@/lib/operationalIndicators";

export function ResponsibleRiskPanel({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const items = report.bottlenecks.byResponsible.slice(0, 5);
  const maximum = Math.max(...items.map((item) => item.count), 1);

  return (
    <Card data-print-break-inside className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersRound className="h-4 w-4 text-primary" />
          Risco por responsável
        </CardTitle>
        <CardDescription>
          Concentração de etapas vencidas que exige balanceamento operacional.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma concentração individual identificada.
          </div>
        ) : (
          <div className="space-y-3.5">
            {items.map((item, index) => (
              <div key={item.key}>
                <div className="mb-1.5 flex justify-between gap-3 text-sm">
                  <span className="truncate font-medium">
                    {index + 1}. {item.label}
                  </span>
                  <span className="font-semibold">{item.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      index === 0
                        ? "h-full rounded-full bg-destructive"
                        : "h-full rounded-full bg-primary/65"
                    }
                    style={{ width: `${(item.count / maximum) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          Este ranking mede carga vencida no recorte. Não deve ser usado
          isoladamente como avaliação individual de desempenho.
        </p>
        <Button asChild className="mt-3 h-auto p-0" variant="link">
          <Link to="/authenticated/documentos/central">
            Abrir distribuição na Central
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
