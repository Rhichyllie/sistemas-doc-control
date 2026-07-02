import { useEffect, useState } from "react";
import { Link2, Loader2, NotebookPen } from "lucide-react";
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

export function TramiteEvidenceDialog({
  open,
  onOpenChange,
  step,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: DocumentTramiteInstanceStep | null;
  isSaving: boolean;
  onSave: (input: {
    evidenceType: "note" | "link" | "external_reference";
    note: string;
  }) => Promise<void>;
}) {
  const [type, setType] = useState<"note" | "link" | "external_reference">(
    "note",
  );
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) {
      setType("note");
      setNote("");
    }
  }, [open]);

  const label =
    type === "note"
      ? "Nota de evidência"
      : type === "link"
        ? "Link da evidência"
        : "Referência externa";

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
              onValueChange={(value) =>
                setType(value as "note" | "link" | "external_reference")
              }
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
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tramite-evidence">{label}</Label>
            <Textarea
              id="tramite-evidence"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                type === "note"
                  ? "Descreva a evidência verificada."
                  : "Informe o endereço ou identificador externo."
              }
              rows={4}
            />
          </div>
          {step?.required_file && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Esta etapa exige arquivo. O upload não faz parte da P-12.1; uma
              nota não substitui esse requisito.
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
            disabled={isSaving || !step || !note.trim()}
            onClick={() => void onSave({ evidenceType: type, note })}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar evidência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
