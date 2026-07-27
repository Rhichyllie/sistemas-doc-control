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

export const Route = createFileRoute("/authenticated/configuracoes/codificacao-documental/tipos-documento")({
  component: TiposDocumentoPage,
});

interface OptionDialogState {
  open: boolean;
  item: { id: string; code: string; label: string; is_active: boolean } | null;
}

function TiposDocumentoPage() {
  const options = useDocumentCodeOptions();
  const [optionDialog, setOptionDialog] = useState<OptionDialogState>({ open: false, item: null });

  function openOptionDialog(item: { id: string; code: string; label: string; is_active: boolean } | null = null) {
    setOptionDialog({ open: true, item });
  }

  async function saveOption(code: string, label: string) {
    const success = optionDialog.item?.id
      ? await options.saveDocType(optionDialog.item.id, { code, label, is_active: optionDialog.item.is_active })
      : await options.saveDocType(null, { code, label, is_active: true });

    if (success) {
      toast.success(optionDialog.item ? "Tipo de documento atualizado" : "Tipo de documento criado");
      setOptionDialog({ ...optionDialog, open: false });
    }
    return success;
  }

  async function deleteOption(id: string) {
    const success = await options.deleteDocType(id);
    if (success) {
      toast.success("Tipo de documento excluído");
      setOptionDialog({ ...optionDialog, open: false });
    }
    return success;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Tipos de Documento</CardTitle>
            <Button onClick={() => openOptionDialog()}>
              <Plus className="h-4 w-4 mr-1" /> Novo
            </Button>
          </div>
          <CardDescription>Cadastre os tipos de documento para a codificação</CardDescription>
        </CardHeader>
        <CardContent>
          {options.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : options.docTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum tipo de documento cadastrado</p>
          ) : (
            <div className="space-y-2">
              {options.docTypes.map((type) => (
                <div key={type.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {type.code} — {type.label}
                    </p>
                    {!type.is_active && (
                      <span className="text-xs text-muted-foreground">Inativo</span>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openOptionDialog(type)}>
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
          <DialogTitle>{state.item ? "Editar Tipo de Documento" : "Novo Tipo de Documento"}</DialogTitle>
          <DialogDescription>Cadastre o código e o rótulo para o tipo de documento</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="option-code">Código</Label>
            <Input
              id="option-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: DOC"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="option-label">Rótulo</Label>
            <Input
              id="option-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Documento"
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
