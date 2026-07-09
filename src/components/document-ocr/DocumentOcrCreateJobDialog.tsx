import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDocumentOcrMethodLabel,
  type DocumentOcrMethod,
} from "@/lib/documentOcr";

interface DocumentOption {
  value: string;
  label: string;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileHash: string | null;
}

const METHODS: DocumentOcrMethod[] = [
  "unavailable",
  "manual_text",
  "text_layer",
  "browser_extraction",
  "external_ocr_placeholder",
];

export function DocumentOcrCreateJobDialog({
  documents,
  selectedDocumentId,
  selectedMethod,
  isCreating,
  onDocumentChange,
  onMethodChange,
  onCreate,
}: {
  documents: DocumentOption[];
  selectedDocumentId: string;
  selectedMethod: DocumentOcrMethod;
  isCreating: boolean;
  onDocumentChange: (documentId: string) => void;
  onMethodChange: (method: DocumentOcrMethod) => void;
  onCreate: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);

  async function handleCreate() {
    const created = await onCreate();
    if (created) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Criar solicitação
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova solicitação de leitura</DialogTitle>
          <DialogDescription>
            Registra um job rastreável. Esta ação não processa OCR externo, não
            interpreta conteúdo e não altera o documento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Documento</Label>
            <Select
              value={selectedDocumentId}
              onValueChange={onDocumentChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um documento" />
              </SelectTrigger>
              <SelectContent>
                {documents.map((document) => (
                  <SelectItem key={document.value} value={document.value}>
                    {document.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Método inicial</Label>
            <Select
              value={selectedMethod}
              onValueChange={(value) => onMethodChange(value as DocumentOcrMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {getDocumentOcrMethodLabel(method)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              `manual_text` registra texto observado por usuário autorizado.
              `external_ocr_placeholder` não chama serviço externo nesta fase.
            </p>
          </div>

          <div className="rounded-xl border bg-muted/50 p-3 text-sm text-muted-foreground">
            O job pode ficar como indisponível até existir engine configurada.
            Texto ausente, ilegível ou falho não significa documento vazio nem
            inválido.
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isCreating || !selectedDocumentId}
            onClick={() => void handleCreate()}
          >
            {isCreating ? "Criando..." : "Criar job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
