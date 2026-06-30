import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Stethoscope } from "lucide-react";
import { SchemaDoctorPanel } from "@/components/schema/SchemaDoctorPanel";
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
import { useAuthContext } from "@/contexts/AuthContext";
import { useSchemaDoctor } from "@/hooks/useSchemaDoctor";

export const Route = createFileRoute("/authenticated/schema-doctor")({
  component: SchemaDoctorPage,
});

function SchemaDoctorPage() {
  const { profile } = useAuthContext();
  const canAccess = profile?.role === "admin" || profile?.role === "manager";
  const { report, isLoading, error, refresh } = useSchemaDoctor(
    Boolean(canAccess),
  );

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Acesso restrito. Esta área é para administradores e gestores.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="outline" className="mb-3">
          Governança técnica
        </Badge>
        <div className="flex items-center gap-3">
          <Stethoscope className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Schema Doctor</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Verifique a prontidão do Supabase para os módulos enterprise do
          TRAMITA.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Diagnóstico indisponível</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{error}</p>
            <Button size="sm" variant="outline" onClick={() => refresh()}>
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading && !report ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Executando diagnóstico do schema...
          </CardContent>
        </Card>
      ) : report ? (
        <SchemaDoctorPanel
          report={report}
          isRefreshing={isLoading}
          onRefresh={() => refresh()}
        />
      ) : null}
    </div>
  );
}
