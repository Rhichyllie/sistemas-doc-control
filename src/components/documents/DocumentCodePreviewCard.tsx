import { AlertTriangle, Braces, Hash, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DocumentCodePreview } from "@/lib/documentCodePatterns";

interface DocumentCodePreviewCardProps {
  preview: DocumentCodePreview;
  isLoading?: boolean;
  compatibilityMessage?: string | null;
  compact?: boolean;
  patternExpression?: string | null;
  projectUsesFallback?: boolean;
}

const MODE_LABEL = {
  configured: "Padrão P-11",
  configured_local: "Estimativa local",
  legacy_fallback: "Fallback legado",
  unavailable: "Automático",
} as const;

export function DocumentCodePreviewCard({
  preview,
  isLoading = false,
  compatibilityMessage,
  compact = false,
  patternExpression,
  projectUsesFallback = false,
}: DocumentCodePreviewCardProps) {
  return (
    <Card className="border-primary/15 bg-primary/[0.025]">
      <CardHeader className={compact ? "pb-3" : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Hash className="h-4 w-4 text-primary" />
            Código documental previsto
          </CardTitle>
          <Badge variant="outline">{MODE_LABEL[preview.mode]}</Badge>
        </div>
        <CardDescription>
          {preview.patternName
            ? `Padrão: ${preview.patternName}`
            : "O código será confirmado pelo banco durante a criação."}
        </CardDescription>
      </CardHeader>
      <CardContent className={compact ? "space-y-2 pt-0" : "space-y-3"}>
        <div className="flex min-h-12 items-center rounded-lg border bg-background px-4 font-mono text-lg font-semibold tracking-wide">
          {isLoading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculando preview…
            </span>
          ) : (
            preview.code || "Código será gerado automaticamente"
          )}
        </div>
        {patternExpression && (
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Expressão usada
            </p>
            <p className="mt-1 break-all font-mono text-xs">
              {patternExpression}
            </p>
          </div>
        )}
        {preview.nextNumber !== null && (
          <p className="text-xs text-muted-foreground">
            Próxima sequência estimada: {preview.nextNumber}. Em criações
            concorrentes, o número final pode mudar.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Este preview não reserva o número. O código final é confirmado no
          momento da criação.
        </p>
        {preview.tokens.PROJECT && preview.tokens.PROJECT !== "GERAL" && (
          <p className="text-xs text-muted-foreground">
            Contexto de projeto disponível:{" "}
            <span className="font-mono font-medium text-foreground">
              {preview.tokens.PROJECT}
            </span>
          </p>
        )}
        {projectUsesFallback && (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              O projeto não possui código explícito. O token {"{PROJECT}"} usa o
              fallback seguro PROJxxxxxx.
            </p>
          </div>
        )}
        {preview.collisionWarning && (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Este código previsto já existe. A alocação final avançará a
              sequência até encontrar um código livre.
            </p>
          </div>
        )}
        {!compact && preview.explanation.length > 0 && (
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Braces className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              {preview.explanation.slice(0, 3).map((explanation) => (
                <p key={explanation}>{explanation}</p>
              ))}
              {preview.mode === "configured_local" && (
                <p>
                  O preview local ajuda na montagem; o preview do banco usa a
                  sequência corrente e continua sendo a confirmação operacional.
                </p>
              )}
            </div>
          </div>
        )}
        {compatibilityMessage && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {compatibilityMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
