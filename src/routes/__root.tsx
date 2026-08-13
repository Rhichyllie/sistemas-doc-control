import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { LocalDataProvider } from "../contexts/local-data-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-destructive/50 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
            Erro inesperado
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            This page didn&apos;t load
          </h1>
          <p className="text-sm text-muted-foreground">
            Ocorreu um erro inesperado. Os detalhes abaixo ajudam a diagnosticar o problema.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Mensagem
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-destructive">
              {error?.message ?? "Erro sem mensagem"}
            </pre>
          </div>
          {(error as Error & { cause?: unknown })?.cause ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Causa
              </div>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                {String((error as Error & { cause?: unknown }).cause)}
              </pre>
            </div>
          ) : null}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Stack Trace
            </div>
            <pre className="mt-1 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 font-mono text-xs text-muted-foreground">
              {error?.stack ?? "Sem stack trace disponível"}
            </pre>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              try {
                router.invalidate();
              } catch {
                /* noop */
              }
              try {
                reset();
              } catch {
                /* noop */
              }
              window.location.reload();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LocalDataProvider>
          <Outlet />
          <Toaster richColors position="top-right" />
        </LocalDataProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
