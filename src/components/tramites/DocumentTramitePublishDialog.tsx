import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  DocumentTramiteTemplate,
  DocumentTramiteValidationResult,
} from "@/lib/documentTramiteModel";

export function DocumentTramitePublishDialog({
  open,
  onOpenChange,
  template,
  validation,
  isPublishing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: DocumentTramiteTemplate;
  validation: DocumentTramiteValidationResult;
  isPublishing: boolean;
  onConfirm: () => void;
}) {
  const version = template.current_version?.version_number ?? 1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publicar modelo de trâmite</DialogTitle>
          <DialogDescription>
            A versão {version} de “{template.name}” ficará disponível para
            sugestão. Documentos antigos não serão alterados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
          <p>
            <strong>Etapas:</strong>{" "}
            {template.current_version?.graph.nodes.length ?? 0}
          </p>
          <p>
            <strong>Conexões:</strong>{" "}
            {template.current_version?.graph.edges.length ?? 0}
          </p>
          <p>
            <strong>Validação:</strong> {validation.summary}
          </p>
          <p className="text-muted-foreground">
            Publicar este modelo não inicia workflow, não cria tarefas e não
            envia notificações.
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!validation.isPublishable || isPublishing}
            onClick={onConfirm}
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Confirmar publicação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
