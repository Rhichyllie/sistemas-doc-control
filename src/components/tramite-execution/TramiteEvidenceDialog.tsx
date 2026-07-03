import { useEffect, useState } from "react";
import { FileUp, Link2, Loader2, NotebookPen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentTramiteInstanceStep } from "@/lib/documentTramiteExecution";
import {
  formatEvidenceFileSize,
  TRAMITE_EVIDENCE_FILE_ACCEPT,
} from "@/lib/tramiteEvidenceFiles";

type EvidenceDialogType = "note" | "link" | "external_reference" | "file";

export function TramiteEvidenceDialog({
  open,
  onOpenChange,
  step,
  isSaving,
  canUploadFiles,
  isCheckingFileSupport,
  fileCompatibilityMessage,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: DocumentTramiteInstanceStep | null;
  isSaving: boolean;
  canUploadFiles: boolean;
  isCheckingFileSupport: boolean;
  fileCompatibilityMessage?: string | null;
  onSave: (input: {
    evidenceType: EvidenceDialogType;
    note: string;
    file: File | null;
  }) => Promise<void>;
}) {
  const [type, setType] = useState<EvidenceDialogType>("note");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    setType(open && step?.required_file && canUploadFiles ? "file" : "note");
    setNote("");
    setFile(null);
  }, [canUploadFiles, open, step?.id, step?.required_file]);

  const label =
    type === "note"
      ? "Nota de evidência"
      : type === "link"
        ? "Link da evidência"
        : type === "external_reference"
          ? "Referência externa"
          : "Descrição do arquivo (opcional)";
  const canSubmit =
    Boolean(step) &&
    (type === "file" ? Boolean(file) : Boolean(note.trim())) &&
    !isSaving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar evidência</DialogTitle>
          <DialogDescription>
            {step
              ? `Etapa: ${step.label}. O registro fica vinculado à execução.`
              : "Registre uma evidência rastreável para a etapa."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as EvidenceDialogType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="note">
                  <span className="flex items-center gap-2">
                    <NotebookPen className="h-4 w-4" /> Nota
                  </span>
                </SelectItem>
                <SelectItem value="link">
                  <span className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" /> Link
                  </span>
                </SelectItem>
                <SelectItem value="external_reference">
                  Referência externa
                </SelectItem>
                {canUploadFiles && (
                  <SelectItem value="file">
                    <span className="flex items-center gap-2">
                      <FileUp className="h-4 w-4" /> Arquivo
                    </span>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          {type === "file" && (
            <div className="space-y-2">
              <Label htmlFor="tramite-evidence-file">
                Arquivo de evidência
              </Label>
              <input
                id="tramite-evidence-file"
                type="file"
                accept={TRAMITE_EVIDENCE_FILE_ACCEPT}
                className="block w-full rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
                disabled={isSaving}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                PDF, DOC, DOCX, XLS, XLSX, PNG, JPG ou DWG. Limite de 50 MB.
              </p>
              {file && (
                <p className="rounded-md border bg-muted/30 p-2 text-xs">
                  {file.name}
                  {formatEvidenceFileSize(file.size)
                    ? ` · ${formatEvidenceFileSize(file.size)}`
                    : ""}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="tramite-evidence">{label}</Label>
            <Textarea
              id="tramite-evidence"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                type === "file"
                  ? "Descreva brevemente o conteúdo ou finalidade do arquivo."
                  : type === "note"
                    ? "Descreva a evidência verificada."
                    : "Informe o endereço ou identificador externo."
              }
              rows={type === "file" ? 2 : 4}
            />
          </div>
          {!canUploadFiles && !isCheckingFileSupport && (
            <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              {fileCompatibilityMessage ??
                "Upload de evidência ainda não instalado. Notas e links continuam disponíveis."}
            </p>
          )}
          {step?.required_file && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Esta etapa exige um arquivo de evidência. O upload registra o
              arquivo, mas não conclui a etapa automaticamente.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void onSave({ evidenceType: type, note, file })}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {type === "file" ? "Enviar e registrar" : "Registrar evidência"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
