import { useRouter } from "@tanstack/react-router";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";

export interface RouteErrorProps {
  title?: string;
  subtitle?: string;
  error: Error;
  reset?: () => void;
  resetLabel?: string;
  homeLabel?: string;
}

export function PageErrorView({
  error,
  reset,
  title = "Falha ao carregar página",
  subtitle = "Ocorreu um erro inesperado. Os detalhes abaixo ajudam a diagnosticar o problema.",
  resetLabel = "Recarregar página",
  homeLabel = "Voltar para Início",
}: RouteErrorProps) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-destructive/50 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
            Erro inesperado
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
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
              try {
                window.location.reload();
              } catch {
                /* noop */
              }
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {resetLabel}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {homeLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

interface PageErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  resetLabel?: string;
  homeLabel?: string;
}

interface PageErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

export class PageErrorBoundary extends Component<
  PageErrorBoundaryProps,
  PageErrorBoundaryState
> {
  state: PageErrorBoundaryState = {
    error: null,
    componentStack: null,
  };

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return {
      error,
      componentStack:
        (error as Error & { componentStack?: string }).componentStack ?? null,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      "[PageErrorBoundary] Captured error:",
      error,
      "\nComponent stack:\n",
      info.componentStack,
    );
    this.setState({
      componentStack: info.componentStack ?? null,
    });
  }

  reset = (): void => {
    this.setState({ error: null, componentStack: null });
  };

  render(): ReactNode {
    const { error, componentStack } = this.state;
    if (error) {
      return (
        <PageErrorView
          error={error}
          reset={this.reset}
          title={this.props.title}
          subtitle={this.props.subtitle}
          resetLabel={this.props.resetLabel}
          homeLabel={this.props.homeLabel}
        />
      );
    }
    return this.props.children;
  }
}

export { PageErrorBoundary as RouteErrorBoundary };
