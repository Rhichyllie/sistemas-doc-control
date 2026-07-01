import {
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  FilePenLine,
  GitFork,
  RefreshCcw,
  Rocket,
  SearchCheck,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getTramiteNodeTypeDescription,
  getTramiteNodeTypeLabel,
  type DocumentTramiteNodeType,
} from "@/lib/documentTramiteModel";

const TYPES: Array<{
  type: DocumentTramiteNodeType;
  icon: typeof CircleDot;
}> = [
  { type: "start", icon: CircleDot },
  { type: "draft", icon: FilePenLine },
  { type: "review", icon: SearchCheck },
  { type: "approval", icon: ShieldCheck },
  { type: "correction", icon: RefreshCcw },
  { type: "evidence", icon: UploadCloud },
  { type: "mandatory_reading", icon: BookOpenCheck },
  { type: "publication", icon: Rocket },
  { type: "decision", icon: GitFork },
  { type: "end", icon: CheckCircle2 },
];

export function DocumentTramitePalette({
  onAdd,
}: {
  onAdd: (type: DocumentTramiteNodeType) => void;
}) {
  return (
    <aside className="space-y-3">
      <div>
        <h3 className="font-semibold">Etapas</h3>
        <p className="text-xs text-muted-foreground">
          Clique para adicionar ao canvas.
        </p>
      </div>
      <div className="space-y-2">
        {TYPES.map(({ type, icon: Icon }) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            className="h-auto w-full justify-start gap-3 whitespace-normal p-3 text-left"
            onClick={() => onAdd(type)}
            title={getTramiteNodeTypeDescription(type)}
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium">
                {getTramiteNodeTypeLabel(type)}
              </span>
              <span className="block text-[11px] font-normal text-muted-foreground">
                {getTramiteNodeTypeDescription(type)}
              </span>
            </span>
          </Button>
        ))}
      </div>
    </aside>
  );
}
