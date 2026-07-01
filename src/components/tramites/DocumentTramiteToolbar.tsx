import {
  AlignHorizontalSpaceAround,
  Download,
  Play,
  Redo2,
  Save,
  Send,
  Undo2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentTramiteToolbarProps {
  isSaving: boolean;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canPublish: boolean;
  onSave: () => void;
  onValidate: () => void;
  onSimulate: () => void;
  onPublish: () => void;
  onAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onImport: () => void;
}

export function DocumentTramiteToolbar({
  isSaving,
  isDirty,
  canUndo,
  canRedo,
  canPublish,
  onSave,
  onValidate,
  onSimulate,
  onPublish,
  onAutoLayout,
  onUndo,
  onRedo,
  onExport,
  onImport,
}: DocumentTramiteToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 shadow-sm">
      <Button type="button" onClick={onSave} disabled={isSaving || !isDirty}>
        <Save className="h-4 w-4" />
        {isSaving ? "Salvando…" : "Salvar rascunho"}
      </Button>
      <Button type="button" variant="outline" onClick={onValidate}>
        Validar
      </Button>
      <Button type="button" variant="outline" onClick={onSimulate}>
        <Play className="h-4 w-4" />
        Simular
      </Button>
      <Button type="button" variant="outline" onClick={onAutoLayout}>
        <AlignHorizontalSpaceAround className="h-4 w-4" />
        Auto-organizar
      </Button>
      <div className="flex items-center rounded-md border">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canUndo}
          onClick={onUndo}
          aria-label="Desfazer"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canRedo}
          onClick={onRedo}
          aria-label="Refazer"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>
      <Button type="button" variant="ghost" onClick={onExport}>
        <Download className="h-4 w-4" />
        Exportar
      </Button>
      <Button type="button" variant="ghost" onClick={onImport}>
        <Upload className="h-4 w-4" />
        Importar
      </Button>
      <Button
        type="button"
        className="ml-auto"
        onClick={onPublish}
        disabled={!canPublish || isSaving}
      >
        <Send className="h-4 w-4" />
        Publicar modelo
      </Button>
    </div>
  );
}
