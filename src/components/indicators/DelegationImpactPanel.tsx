import { Link } from "@tanstack/react-router";
import { ArrowUpRight, UserRoundCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export function DelegationImpactPanel({
  report,
}: {
  report: OperationalIndicatorsReport;
}) {
  const covered = report.delegations.activeStepsWithSubstituteAvailable ?? 0;
  const uncovered = report.delegations.activeStepsWithoutSubstitute ?? 0;
  const totalImpact = covered + uncovered;
  const coverage = totalImpact
    ? Math.round((covered / totalImpact) * 100)
    : 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRoundCog className="h-4 w-4 text-primary" />
              Impacto de delegação
            </CardTitle>
            <CardDescription>
              Cobertura de etapas durante ausências, sem reatribuição
              silenciosa.
            </CardDescription>
          </div>
          <Badge variant={uncovered > 0 ? "destructive" : "secondary"}>
            {coverage}% coberto
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-5">
          <DelegationMetric
            label="Ausências ativas"
            value={report.delegations.activeAbsences}
          />
          <DelegationMetric
            label="Regras ativas"
            value={report.delegations.activeDelegations}
          />
          <DelegationMetric label="Com substituto" value={covered} positive />
          <DelegationMetric label="Sem substituto" value={uncovered} critical />
          <DelegationMetric
            label="Ações delegadas"
            value={report.delegations.delegatedStepCompletions}
          />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-destructive/15">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${coverage}%` }}
            role="img"
            aria-label={`${coverage}% das etapas impactadas possuem substituto`}
          />
        </div>
        <Button asChild className="mt-4 h-auto p-0" variant="link">
          <Link to="/authenticated/equipe">
            Revisar ausências e substituições
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DelegationMetric({
  label,
  value,
  positive = false,
  critical = false,
}: {
  label: string;
  value: number | null;
  positive?: boolean;
  critical?: boolean;
}) {
  return (
    <div className="rounded-xl border p-3">
      <p
        className={`text-2xl font-semibold ${
          critical && (value ?? 0) > 0
            ? "text-destructive"
            : positive
              ? "text-emerald-700"
              : ""
        }`}
      >
        {formatCount(value)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
