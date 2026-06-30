import { CheckCircle2, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SchemaDoctorCheck } from "@/hooks/useSchemaDoctor";

const CHECK_TYPE_LABELS: Record<SchemaDoctorCheck["type"], string> = {
  table: "Tabela",
  column: "Coluna",
  rpc: "RPC",
  policy: "Policy",
};

interface SchemaCheckCardProps {
  module: string;
  checks: SchemaDoctorCheck[];
}

export function SchemaCheckCard({ module, checks }: SchemaCheckCardProps) {
  const missing = checks.filter((check) => check.status === "missing");
  const available = checks.length - missing.length;
  const isReady = missing.length === 0;

  return (
    <Card className={isReady ? "border-emerald-200" : "border-amber-200"}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              {isReady ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <CircleAlert className="h-5 w-5 text-amber-600" />
              )}
              {module}
            </CardTitle>
            <CardDescription className="mt-1">
              {available} de {checks.length} verificações disponíveis.
            </CardDescription>
          </div>
          <Badge variant={isReady ? "secondary" : "outline"}>
            {isReady
              ? "Pronto"
              : `${missing.length} pendente${missing.length === 1 ? "" : "s"}`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {checks.map((check) => (
          <div
            key={`${check.type}-${check.table ?? "public"}-${check.name}`}
            className="rounded-lg border bg-background px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {check.status === "ok" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <CircleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <span className="break-all text-sm font-medium">
                    {check.name}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {CHECK_TYPE_LABELS[check.type]}
                  </Badge>
                </div>
                {check.table && check.type !== "table" && (
                  <p className="ml-6 mt-0.5 text-xs text-muted-foreground">
                    {check.table}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={check.status === "ok" ? "secondary" : "destructive"}
                >
                  {check.status === "ok" ? "OK" : "Faltando"}
                </Badge>
                {check.status === "missing" && (
                  <Badge variant="outline">Ciclo {check.cycle}</Badge>
                )}
              </div>
            </div>
            {check.status === "missing" && (
              <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                {check.impact}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
