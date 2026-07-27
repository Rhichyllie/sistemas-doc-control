import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LibraryScopeProvider } from "@/contexts/library-context";
import { useLibraries } from "@/hooks/useLibraries";

export const Route = createFileRoute("/authenticated/biblioteca/$bibliotecaId")({
  component: LibraryScopedRoute,
});

function LibraryScopedRoute() {
  const { bibliotecaId } = Route.useParams();
  const catalog = useLibraries();
  const library = catalog.libraries.find((item) => item.id === bibliotecaId);

  if (!catalog.loading && !library) {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Biblioteca não encontrada</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">
          A biblioteca solicitada não pertence à sua organização ou ainda não foi provisionada.
        </CardContent>
      </Card>
    );
  }

  return (
    <LibraryScopeProvider libraryId={bibliotecaId}>
      <Outlet />
    </LibraryScopeProvider>
  );
}
