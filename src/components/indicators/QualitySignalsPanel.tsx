import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, ShieldAlert } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatCount,
  getQualitySignals,
  type OperationalIndicatorsReport,
} from "@/lib/operationalIndicators";

export function QualitySignalsPanel({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const signals = getQualitySignals(report);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Qualidade da governança
        </CardTitle>
        <CardDescription>
          Lacunas documentais que reduzem controle e rastreabilidade.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {signals.map((signal) => {
          const healthy = (signal.value ?? 0) === 0;
          const Icon = healthy ? CheckCircle2 : ShieldAlert;
          return (
            <Link
              key={signal.id}
              to={signal.actionUrl}
              className="group flex items-start justify-between gap-3 rounded-xl border p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex gap-3">
                <div
                  className={
                    healthy
                      ? "rounded-lg bg-emerald-100 p-2 text-emerald-700"
                      : "rounded-lg bg-amber-100 p-2 text-amber-700"
                  }
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium">{signal.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {healthy
                      ? "Nenhuma ocorrência neste recorte."
                      : signal.explanation}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold">
                  {formatCount(signal.value)}
                </p>
                <ArrowUpRight className="ml-auto mt-2 h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
