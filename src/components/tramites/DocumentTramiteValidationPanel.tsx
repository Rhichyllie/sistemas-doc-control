import { AlertCircle, CheckCircle2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DocumentTramiteValidationResult } from "@/lib/documentTramiteModel";

export function DocumentTramiteValidationPanel({
  validation,
  onFocusNode,
}: {
  validation: DocumentTramiteValidationResult;
  onFocusNode: (nodeId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            {validation.isPublishable ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
            Validação do trâmite
          </CardTitle>
          <Badge
            variant={validation.isPublishable ? "secondary" : "destructive"}
          >
            {validation.isPublishable
              ? "Pronto para publicar"
              : "Correções necessárias"}
          </Badge>
        </div>
        <CardDescription>{validation.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {validation.errors.map((item) => (
          <div
            key={`${item.code}-${item.nodeId || item.edgeId || item.message}`}
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
          >
            <div className="flex gap-2 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>{item.message}</span>
            </div>
            {item.nodeId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onFocusNode(item.nodeId!)}
              >
                Ver etapa
              </Button>
            )}
          </div>
        ))}
        {validation.warnings.map((item) => (
          <div
            key={`${item.code}-${item.nodeId || item.message}`}
            className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <div className="flex gap-2 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{item.message}</span>
            </div>
            {item.nodeId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onFocusNode(item.nodeId!)}
              >
                Ver etapa
              </Button>
            )}
          </div>
        ))}
        {!validation.errors.length && !validation.warnings.length && (
          <p className="text-sm text-muted-foreground">
            Estrutura completa, responsáveis definidos e caminho entre Início e
            Fim disponível.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
