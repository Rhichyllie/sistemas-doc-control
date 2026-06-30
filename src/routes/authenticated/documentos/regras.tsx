import { createFileRoute } from "@tanstack/react-router";
import { DocumentRulesAdmin } from "@/components/documents/DocumentRulesAdmin";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthContext } from "@/contexts/AuthContext";

export const Route = createFileRoute("/authenticated/documentos/regras")({
  component: DocumentRulesPage,
});

function DocumentRulesPage() {
  const { profile } = useAuthContext();
  const canAccess = profile?.role === "admin" || profile?.role === "manager";

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Esta área é exclusiva para administradores e gestores.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <DocumentRulesAdmin />;
}
