import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

export function TramiteCancelDialog({
  open,
  onOpenChange,
  isCancelling,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCancelling: boolean;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar execução do trâmite</DialogTitle>
          <DialogDescription>
            O cancelamento preserva etapas, decisões, evidências e eventos para
            auditoria. Ele não pode ser usado para reutilizar esta instância.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="tramite-cancel-reason">Motivo obrigatório</Label>
          <Textarea
            id="tramite-cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explique por que esta execução deve ser cancelada."
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCancelling}
          >
            Voltar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isCancelling || !reason.trim()}
            onClick={() => void onConfirm(reason)}
          >
            {isCancelling && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar cancelamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
