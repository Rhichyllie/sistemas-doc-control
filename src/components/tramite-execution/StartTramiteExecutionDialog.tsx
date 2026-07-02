import { useEffect, useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DocumentTramiteTemplate } from "@/lib/documentTramiteModel";

export function StartTramiteExecutionDialog({
  open,
  onOpenChange,
  templates,
  isStarting,
  initialTemplateId,
  suggestedTemplateId,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: DocumentTramiteTemplate[];
  isStarting: boolean;
  initialTemplateId?: string | null;
  suggestedTemplateId?: string | null;
  onStart: (template: DocumentTramiteTemplate) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState("");
  useEffect(() => {
    if (open && !templateId && templates[0]) {
      const preferred =
        templates.find((template) => template.id === initialTemplateId) ??
        templates.find((template) => template.id === suggestedTemplateId) ??
        templates[0];
      setTemplateId(preferred.id);
    }
    if (!open) setTemplateId("");
  }, [initialTemplateId, open, suggestedTemplateId, templateId, templates]);
  const selected = templates.find((template) => template.id === templateId);
  const version = selected?.published_version;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Iniciar trâmite documental
          </DialogTitle>
          <DialogDescription>
            Iniciar um trâmite cria uma instância rastreável, mas não altera o
            documento automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Modelo publicado</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um modelo" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name} · v
                    {template.published_version?.version_number ?? 1}
                    {template.id === suggestedTemplateId ? " · sugerido" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{selected.name}</p>
                <Badge variant="secondary">{selected.code}</Badge>
                <Badge variant="outline">
                  versão {version?.version_number ?? 1}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {selected.description || "Modelo publicado sem descrição."}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {version?.graph.nodes.length ?? 0} etapas ·{" "}
                {version?.graph.edges.length ?? 0} conexões
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Esta ação não cria approval_flows, não muda o status do documento e
            não envia notificações.
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isStarting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!selected || !version || isStarting}
            onClick={() => selected && void onStart(selected)}
          >
            {isStarting && <Loader2 className="h-4 w-4 animate-spin" />}
            Iniciar trâmite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
