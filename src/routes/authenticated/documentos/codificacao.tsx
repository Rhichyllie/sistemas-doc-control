import { createFileRoute } from "@tanstack/react-router";
import { DocumentCodeAdmin } from "@/components/documents/DocumentCodeAdmin";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthContext } from "@/contexts/AuthContext";

export const Route = createFileRoute("/authenticated/documentos/codificacao")({
  component: DocumentCodePage,
});

function DocumentCodePage() {
  const { profile } = useAuthContext();
  const canAccess = profile?.role === "admin" || profile?.role === "manager";

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Esta área é exclusiva para administradores e gestores. A codificação
            continua sendo aplicada automaticamente na criação de documentos.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <DocumentCodeAdmin />;
}
