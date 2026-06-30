import { ListChecks, SlidersHorizontal, Zap } from "lucide-react";
import type { DocumentCreationMode } from "@/lib/documentIntelligence";
import { cn } from "@/lib/utils";

const MODES: Array<{
  value: DocumentCreationMode;
  title: string;
  description: string;
  icon: typeof Zap;
}> = [
  {
    value: "quick",
    title: "Rápido",
    description: "Poucos campos, sugestões automáticas e criação imediata.",
    icon: Zap,
  },
  {
    value: "guided",
    title: "Guiado",
    description: "Assistente em etapas com revisão antes de criar.",
    icon: ListChecks,
  },
  {
    value: "expert",
    title: "Especialista",
    description: "Governança e metadados avançados quando disponíveis.",
    icon: SlidersHorizontal,
  },
];

interface DocumentCreationModeSelectorProps {
  value: DocumentCreationMode;
  onChange: (mode: DocumentCreationMode) => void;
}

export function DocumentCreationModeSelector({
  value,
  onChange,
}: DocumentCreationModeSelectorProps) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const selected = value === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            className={cn(
              "rounded-xl border p-4 text-left transition-all hover:border-primary/50 hover:bg-muted/40",
              selected
                ? "border-primary bg-primary/5 shadow-sm"
                : "bg-background",
            )}
            onClick={() => onChange(mode.value)}
            aria-pressed={selected}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "rounded-lg p-2",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold">{mode.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {mode.description}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
