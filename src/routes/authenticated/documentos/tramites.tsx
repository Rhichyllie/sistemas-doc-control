import { createFileRoute } from "@tanstack/react-router";
import { DocumentTramiteAdmin } from "@/components/tramites/DocumentTramiteAdmin";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthContext } from "@/contexts/AuthContext";

export const Route = createFileRoute("/authenticated/documentos/tramites")({
  component: DocumentTramitePage,
});

function DocumentTramitePage() {
  const { profile } = useAuthContext();
  const canAccess = profile?.role === "admin" || profile?.role === "manager";

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Esta área é exclusiva para administradores e gestores. Modelos de
            trâmite não são executados automaticamente e documentos existentes
            permanecem inalterados.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <DocumentTramiteAdmin />;
}
