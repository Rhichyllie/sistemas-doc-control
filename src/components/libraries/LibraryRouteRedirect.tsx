import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStoredActiveLibraryId } from "@/contexts/library-context";
import { useLibraries } from "@/hooks/useLibraries";
import {
  toLibraryDocumentPath,
  toLibraryScopedPath,
} from "@/lib/library-routing";

export function LibraryRouteRedirect({
  target,
  documentId,
}: {
  target: string;
  documentId?: string;
}) {
  const navigate = useNavigate();
  const catalog = useLibraries();

  useEffect(() => {
    if (catalog.loading) return;

    const storedId = getStoredActiveLibraryId();
    const selectedLibrary =
      catalog.libraries.find((library) => library.id === storedId) ??
      catalog.libraries[0] ??
      null;

    if (!selectedLibrary) {
      void navigate({ to: "/authenticated/organizacao", replace: true });
      return;
    }

    const nextPath = documentId
      ? toLibraryDocumentPath(selectedLibrary.id, documentId)
      : toLibraryScopedPath(target, selectedLibrary.id);

    void navigate({ to: nextPath, replace: true });
  }, [catalog.libraries, catalog.loading, documentId, navigate, target]);

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Abrindo biblioteca</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-slate-500">
        Redirecionando para a biblioteca ativa...
      </CardContent>
    </Card>
  );
}
