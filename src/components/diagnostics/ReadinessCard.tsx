import {
  CheckCircle2,
  CircleAlert,
  CircleOff,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getReadinessStatusLabel,
  type ReadinessSection,
  type ReadinessStatus,
} from "@/lib/operationalReadiness";

export function ReadinessStatusBadge({ status }: { status: ReadinessStatus }) {
  const variant =
    status === "ok"
      ? "default"
      : ["absent", "not_installed", "read_error"].includes(status)
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{getReadinessStatusLabel(status)}</Badge>;
}

export function ReadinessCard({ section }: { section: ReadinessSection }) {
  const ready = section.checks.filter((item) => item.status === "ok").length;
  const blocking = section.checks.filter(
    (item) =>
      item.severity === "critical" &&
      ["absent", "not_installed", "read_error"].includes(item.status),
  ).length;
  const Icon =
    section.status === "ok"
      ? CheckCircle2
      : section.status === "not_installed"
        ? CircleOff
        : blocking > 0
          ? ShieldAlert
          : CircleAlert;

  return (
    <Card
      className={
        blocking > 0
          ? "border-destructive/40"
          : section.status === "ok"
            ? "border-emerald-200"
            : "border-amber-200"
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Icon
              className={`h-5 w-5 ${
                blocking > 0
                  ? "text-destructive"
                  : section.status === "ok"
                    ? "text-emerald-600"
                    : "text-amber-600"
              }`}
            />
          </div>
          <ReadinessStatusBadge status={section.status} />
        </div>
        <CardTitle className="pt-2 text-base">{section.title}</CardTitle>
        <CardDescription>{section.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Itens confirmados</span>
          <span className="font-semibold">
            {ready}/{section.checks.length}
          </span>
        </div>
        {blocking > 0 && (
          <p className="mt-2 text-xs text-destructive">
            {blocking} bloqueio(s) crítico(s) para o piloto.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
