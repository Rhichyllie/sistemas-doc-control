import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { OperationalHome } from "@/components/dashboard/OperationalHome";

function DashboardErrorView({
  error,
  reset,
}: {
  error: Error;
  reset?: () => void;
}) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-destructive/50 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
            Erro no Dashboard
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Falha ao carregar a página Início
          </h1>
          <p className="text-sm text-muted-foreground">
            Ocorreu um erro inesperado ao montar o painel operacional. Os
            detalhes abaixo ajudam a diagnosticar o problema.
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
            type="button"
            onClick={() => {
              try {
                reset?.();
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
            Recarregar página
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

class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      "[DashboardErrorBoundary] Captured error:",
      error,
      "\nComponent stack:\n",
      info.componentStack,
    );
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return <DashboardErrorView error={error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DashboardPage() {
  return (
    <DashboardErrorBoundary>
      <OperationalHome />
    </DashboardErrorBoundary>
  );
}

export const Route = createFileRoute(
  "/authenticated/biblioteca/$bibliotecaId/dashboard",
)({
  component: DashboardPage,
  errorComponent: ({ error, reset }) => (
    <DashboardErrorView error={error} reset={reset} />
  ),
});
