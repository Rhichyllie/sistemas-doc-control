import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getEdgeConditionLabel,
  type DocumentTramiteEdge,
  type DocumentTramiteEdgeCondition,
} from "@/lib/documentTramiteModel";

const CONDITIONS: DocumentTramiteEdgeCondition[] = [
  "always",
  "approved",
  "rejected",
  "needs_correction",
  "expired",
  "evidence_missing",
  "custom",
];

export function DocumentTramiteEdgeInspector({
  edge,
  onChange,
  onRemove,
}: {
  edge: DocumentTramiteEdge;
  onChange: (updates: Partial<DocumentTramiteEdge>) => void;
  onRemove: () => void;
}) {
  return (
    <aside className="space-y-4 rounded-xl border bg-background p-4">
      <div>
        <h3 className="font-semibold">Configurar conexão</h3>
        <p className="text-xs text-muted-foreground">
          Defina quando este caminho deve ser seguido.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Condição</Label>
        <Select
          value={edge.condition_type}
          onValueChange={(value) =>
            onChange({
              condition_type: value as DocumentTramiteEdgeCondition,
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDITIONS.map((condition) => (
              <SelectItem key={condition} value={condition}>
                {getEdgeConditionLabel(condition)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tramite-edge-label">Texto no caminho</Label>
        <Input
          id="tramite-edge-label"
          value={edge.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder={getEdgeConditionLabel(edge.condition_type)}
        />
      </div>
      {edge.condition_type === "custom" && (
        <div className="space-y-2">
          <Label htmlFor="tramite-edge-value">Condição personalizada</Label>
          <Input
            id="tramite-edge-value"
            value={edge.condition_value ?? ""}
            onChange={(event) =>
              onChange({ condition_value: event.target.value || null })
            }
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="tramite-edge-priority">Prioridade</Label>
        <Input
          id="tramite-edge-priority"
          type="number"
          min={0}
          value={edge.priority}
          onChange={(event) =>
            onChange({ priority: Number(event.target.value) || 0 })
          }
        />
        <p className="text-xs text-muted-foreground">
          Menor número é avaliado primeiro na simulação.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full text-destructive hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
        Remover conexão
      </Button>
    </aside>
  );
}
