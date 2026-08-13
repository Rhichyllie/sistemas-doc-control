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
import {
  Component,
  useEffect,
  type ErrorInfo,
  type ReactNode,
} from "react";

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

class GlobalErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; componentStack: string | null }
> {
  state = { error: null as Error | null, componentStack: null as string | null };

  static getDerivedStateFromError(error: Error): {
    error: Error;
    componentStack: string | null;
  } {
    return {
      error,
      componentStack:
        (error as Error & { componentStack?: string }).componentStack ?? null,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      "[GlobalErrorBoundary] Uncaught React error:",
      error,
      "\nComponent stack:\n",
      info.componentStack,
    );
    this.setState({ componentStack: info.componentStack ?? null });
  }

  reset = (): void => {
    this.setState({ error: null, componentStack: null });
  };

  render(): ReactNode {
    const { error, componentStack } = this.state;
    if (error) {
      return (
        <GlobalCrashView
          error={error}
          componentStack={componentStack}
          reset={this.reset}
        />
      );
    }
    return this.props.children;
  }
}

function GlobalCrashView({
  error,
  componentStack,
  reset,
}: {
  error: Error;
  componentStack: string | null;
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-destructive/50 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
            Erro Crítico (Global)
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            O sistema encontrou um problema inesperado
          </h1>
          <p className="text-sm text-muted-foreground">
            Esse erro foi capturado antes de quebrar todo o app. Tente recarregar
            ou volte para a tela inicial.
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
          {componentStack ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Árvore React
              </div>
              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 font-mono text-xs text-muted-foreground">
                {componentStack}
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
                reset();
              } catch {
                /* noop */
              }
              try {
                router.invalidate();
              } catch {
                /* noop */
              }
              window.location.reload();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Recarregar aplicativo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar para Início
          </a>
        </div>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LocalDataProvider>
            <GlobalUnhandledErrorCatcher />
            <Outlet />
            <Toaster richColors position="top-right" />
          </LocalDataProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}

function GlobalUnhandledErrorCatcher() {
  if (typeof window === "undefined") return null;
  return (
    <UnhandledErrorListeners />
  );
}

function UnhandledErrorListeners(): null {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      try {
        console.warn(
          "[Global] Unhandled promise rejection (swallowed to prevent crash):",
          event.reason,
        );
        event.preventDefault?.();
      } catch {
        /* noop */
      }
    };

    const onError = (event: ErrorEvent) => {
      try {
        const msg =
          event.error instanceof Error
            ? event.error.message
            : String(event.message ?? "");
        const isSupabaseRealtimeNoise =
          msg.includes("postgres_changes") ||
          msg.includes("after 'subscribe()'") ||
          msg.includes("supabase_realtime") ||
          msg.includes("realtime:");
        console.warn(
          `[Global] window.error ${isSupabaseRealtimeNoise ? "(realtime noise — swallowed)" : ""}:`,
          event.error ?? event.message,
        );
        if (isSupabaseRealtimeNoise) {
          try {
            event.preventDefault?.();
            event.stopImmediatePropagation?.();
          } catch {
            /* noop */
          }
        }
      } catch {
        /* noop */
      }
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError, true);

    return () => {
      try {
        window.removeEventListener(
          "unhandledrejection",
          onUnhandledRejection,
        );
      } catch {
        /* noop */
      }
      try {
        window.removeEventListener("error", onError, true);
      } catch {
        /* noop */
      }
    };
  }, []);

  return null;
}
