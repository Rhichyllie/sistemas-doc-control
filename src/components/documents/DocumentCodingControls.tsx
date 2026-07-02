import { useEffect, useMemo } from "react";
import { Code2, FileKey2, ListChecks } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DocumentCodePreviewCard } from "@/components/documents/DocumentCodePreviewCard";
import type { DocumentCreationCodeMode } from "@/hooks/useDocumentCreationControls";
import type {
  DocumentCodePattern,
  DocumentCodePreview,
} from "@/lib/documentCodePatterns";

const MODES: Array<{
  value: DocumentCreationCodeMode;
  title: string;
  description: string;
  icon: typeof Code2;
}> = [
  {
    value: "automatic",
    title: "Automática recomendada",
    description: "O banco escolhe o melhor padrão aplicável ou usa o legado.",
    icon: Code2,
  },
  {
    value: "selected_pattern",
    title: "Escolher padrão",
    description: "Use explicitamente um padrão ativo da organização.",
    icon: ListChecks,
  },
  {
    value: "manual",
    title: "Código legado/manual",
    description: "Preserve a codificação oficial já usada pelo cliente.",
    icon: FileKey2,
  },
];

export function DocumentCodingControls({
  mode,
  onModeChange,
  selectedPatternId,
  onSelectedPatternChange,
  manualCode,
  onManualCodeChange,
  manualReason,
  onManualReasonChange,
  patterns,
  applicablePatternIds,
  preview,
  isLoading,
  supportsPatternSelection,
  supportsManualCode,
  compatibilityMessage,
}: {
  mode: DocumentCreationCodeMode;
  onModeChange: (mode: DocumentCreationCodeMode) => void;
  selectedPatternId: string;
  onSelectedPatternChange: (id: string) => void;
  manualCode: string;
  onManualCodeChange: (value: string) => void;
  manualReason: string;
  onManualReasonChange: (value: string) => void;
  patterns: DocumentCodePattern[];
  applicablePatternIds: string[];
  preview: DocumentCodePreview;
  isLoading: boolean;
  supportsPatternSelection: boolean;
  supportsManualCode: boolean;
  compatibilityMessage?: string | null;
}) {
  const selected = patterns.find((pattern) => pattern.id === selectedPatternId);
  const applicableIds = useMemo(
    () => new Set(applicablePatternIds),
    [applicablePatternIds],
  );

  useEffect(() => {
    if (selectedPatternId && !applicableIds.has(selectedPatternId)) {
      onSelectedPatternChange("");
    }
  }, [applicableIds, onSelectedPatternChange, selectedPatternId]);

  return (
    <div className="space-y-4 rounded-xl border bg-muted/10 p-4">
      <div>
        <h3 className="font-semibold">Codificação do documento</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Defina de forma explícita como o código oficial será confirmado.
        </p>
      </div>

      <RadioGroup
        value={mode}
        onValueChange={(value) =>
          onModeChange(value as DocumentCreationCodeMode)
        }
        className="grid gap-2 lg:grid-cols-3"
      >
        {MODES.map((item) => {
          const disabled =
            (item.value === "selected_pattern" && !supportsPatternSelection) ||
            (item.value === "manual" && !supportsManualCode);
          const Icon = item.icon;
          return (
            <Label
              key={item.value}
              htmlFor={`document-code-mode-${item.value}`}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                disabled
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-primary"
              } ${mode === item.value ? "border-primary bg-primary/5" : ""}`}
            >
              <RadioGroupItem
                id={`document-code-mode-${item.value}`}
                value={item.value}
                disabled={disabled}
                className="mt-0.5"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-4 w-4" />
                  {item.title}
                </span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </Label>
          );
        })}
      </RadioGroup>

      {compatibilityMessage && (
        <Alert>
          <AlertTitle>Compatibilidade de codificação</AlertTitle>
          <AlertDescription>{compatibilityMessage}</AlertDescription>
        </Alert>
      )}

      {mode === "selected_pattern" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Padrão aplicável *</Label>
            <Select
              value={selectedPatternId}
              onValueChange={onSelectedPatternChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha um padrão" />
              </SelectTrigger>
              <SelectContent>
                {patterns.map((pattern) => (
                  <SelectItem
                    key={pattern.id}
                    value={pattern.id}
                    disabled={!applicableIds.has(pattern.id)}
                  >
                    {pattern.name}
                    {pattern.is_default ? " · recomendado" : ""}
                    {!applicableIds.has(pattern.id)
                      ? " · não aplicável ao contexto"
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <div className="rounded-lg border bg-background p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{selected.name}</strong>
                {selected.is_default && <Badge>Default</Badge>}
                <Badge variant="outline">{selected.pattern_scope}</Badge>
              </div>
              <p className="mt-2 break-all font-mono text-xs">
                {selected.pattern}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Prioridade {selected.priority} · sequência com{" "}
                {selected.sequence_padding} dígitos
              </p>
            </div>
          )}
          {!patterns.length && (
            <p className="text-sm text-muted-foreground">
              Nenhum padrão ativo está cadastrado. Use a opção automática para
              manter o gerador legado.
            </p>
          )}
        </div>
      )}

      {mode === "manual" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="document-manual-code">Código oficial *</Label>
            <Input
              id="document-manual-code"
              value={manualCode}
              onChange={(event) => onManualCodeChange(event.target.value)}
              placeholder="Ex.: CLI-OBRA-ENG-001-A"
              maxLength={160}
            />
            <p className="text-xs text-muted-foreground">
              O texto é preservado como informado e validado por organização.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="document-manual-reason">
              Motivo da codificação manual *
            </Label>
            <Textarea
              id="document-manual-reason"
              value={manualReason}
              onChange={(event) => onManualReasonChange(event.target.value)}
              placeholder="Ex.: Código já vigente no acervo legado do cliente."
              rows={3}
            />
          </div>
        </div>
      )}

      {mode !== "manual" && (
        <DocumentCodePreviewCard
          preview={preview}
          isLoading={isLoading}
          compact
        />
      )}
      {mode === "manual" && manualCode.trim() && (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Código informado
          </p>
          <p className="mt-1 break-all font-mono text-lg font-semibold">
            {manualCode.trim()}
          </p>
        </div>
      )}
    </div>
  );
}
