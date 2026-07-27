import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useDocumentCodeOptions } from "@/hooks/useDocumentCodeOptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/configuracoes/codificacao-documental/areas")({
  component: AreasPage,
});

interface OptionDialogState {
  open: boolean;
  item: { id: string; code: string; label: string; is_active: boolean } | null;
}

function AreasPage() {
  const options = useDocumentCodeOptions();
  const [optionDialog, setOptionDialog] = useState<OptionDialogState>({ open: false, item: null });

  function openOptionDialog(item: { id: string; code: string; label: string; is_active: boolean } | null = null) {
    setOptionDialog({ open: true, item });
  }

  async function saveOption(code: string, label: string) {
    const success = optionDialog.item?.id
      ? await options.saveArea(optionDialog.item.id, { code, label, is_active: optionDialog.item.is_active })
      : await options.saveArea(null, { code, label, is_active: true });

    if (success) {
      toast.success(optionDialog.item ? "Área atualizada" : "Área criada");
      setOptionDialog({ ...optionDialog, open: false });
    }
    return success;
  }

  async function deleteOption(id: string) {
    const success = await options.deleteArea(id);
    if (success) {
      toast.success("Área excluída");
      setOptionDialog({ ...optionDialog, open: false });
    }
    return success;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Áreas</CardTitle>
            <Button onClick={() => openOptionDialog()}>
              <Plus className="h-4 w-4 mr-1" /> Novo
            </Button>
          </div>
          <CardDescription>Cadastre as áreas para a codificação</CardDescription>
        </CardHeader>
        <CardContent>
          {options.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : options.areas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma área cadastrada</p>
          ) : (
            <div className="space-y-2">
              {options.areas.map((area) => (
                <div key={area.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {area.code} — {area.label}
                    </p>
                    {!area.is_active && (
                      <span className="text-xs text-muted-foreground">Inativo</span>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openOptionDialog(area)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <OptionDialog
        state={optionDialog}
        onChange={setOptionDialog}
        onSave={saveOption}
        onDelete={deleteOption}
      />
    </div>
  );
}

function OptionDialog({
  state,
  onChange,
  onSave,
  onDelete,
}: {
  state: OptionDialogState;
  onChange: (state: OptionDialogState) => void;
  onSave: (code: string, label: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (state.item) {
      setCode(state.item.code);
      setLabel(state.item.label);
    } else {
      setCode("");
      setLabel("");
    }
  }, [state.item]);

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => onChange({ ...state, open })}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{state.item ? "Editar Área" : "Nova Área"}</DialogTitle>
          <DialogDescription>Cadastre o código e o rótulo para a área</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="option-code">Código</Label>
            <Input
              id="option-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: ENG"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="option-label">Rótulo</Label>
            <Input
              id="option-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Engenharia"
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {state.item && (
            <Button
              variant="destructive"
              onClick={() => onDelete(state.item!.id)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onChange({ ...state, open: false })}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => onSave(code, label)}
              disabled={!code.trim() || !label.trim()}
            >
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
