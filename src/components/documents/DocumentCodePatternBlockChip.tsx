import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCodeTokenDescription,
  getCodeTokenLabel,
  type DocumentCodePatternBlock,
} from "@/lib/documentCodePatternBuilder";

interface DocumentCodePatternBlockChipProps {
  block: DocumentCodePatternBlock;
  index?: number;
  total?: number;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onRemove?: () => void;
  onAdd?: () => void;
}

function technicalValue(block: DocumentCodePatternBlock) {
  if (block.type === "TEXT") return block.value || "TEXTO";
  if (block.type === "SEPARATOR") return block.value || "-";
  return `{${block.type}}`;
}

export function DocumentCodePatternBlockChip({
  block,
  index,
  total,
  onMoveLeft,
  onMoveRight,
  onRemove,
  onAdd,
}: DocumentCodePatternBlockChipProps) {
  const isLiteral = block.type === "TEXT";
  const isSeparator = block.type === "SEPARATOR";
  const label = getCodeTokenLabel(block.type);
  const description = getCodeTokenDescription(block.type);
  const style = isSeparator
    ? "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
    : isLiteral
      ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/35"
      : "border-primary/30 bg-primary/5";

  if (onAdd) {
    return (
      <button
        type="button"
        className={`rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/10 ${style}`}
        onClick={onAdd}
        title={description}
      >
        <span className="block text-sm font-medium">{label}</span>
        <span className="block font-mono text-[11px] text-muted-foreground">
          {technicalValue(block)}
        </span>
      </button>
    );
  }

  return (
    <div
      className={`flex items-center gap-1 rounded-lg border p-1.5 ${style}`}
      title={description}
    >
      <div className="min-w-0 px-1.5">
        <span className="block truncate text-xs font-medium">{label}</span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">
          {technicalValue(block)}
        </span>
      </div>
      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={index === 0}
          onClick={onMoveLeft}
          aria-label={`Mover ${label} para a esquerda`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={
            typeof index === "number" &&
            typeof total === "number" &&
            index >= total - 1
          }
          onClick={onMoveRight}
          aria-label={`Mover ${label} para a direita`}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remover ${label}`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
