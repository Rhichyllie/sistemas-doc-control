import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Braces,
  CheckCircle2,
  ChevronDown,
  Code2,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { DocumentCodePatternBlockChip } from "@/components/documents/DocumentCodePatternBlockChip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DOCUMENT_CODE_PATTERN_PRESETS,
  buildPatternExample,
  createDefaultPatternBlocks,
  dedupeSeparators,
  explainPatternBlocks,
  getAvailableCodeTokens,
  parsePatternToBlocks,
  serializeBlocksToPattern,
  validatePatternBlocks,
  validatePatternExpression,
  type DocumentCodePatternBlock,
  type DocumentCodePatternExampleContext,
  type DocumentCodeTokenType,
} from "@/lib/documentCodePatternBuilder";

interface DocumentCodePatternBuilderProps {
  value: string;
  onChange: (value: string) => void;
  separator: string;
  onSeparatorChange: (value: string) => void;
  context?: DocumentCodePatternExampleContext;
  onModeChange?: (mode: "visual" | "advanced") => void;
  initialMode?: "visual" | "advanced";
}

const SEPARATORS = [
  { value: "-", label: "Hífen (-)" },
  { value: "_", label: "Sublinhado (_)" },
  { value: ".", label: "Ponto (.)" },
  { value: "/", label: "Barra (/)" },
];

function withFreshIds(blocks: DocumentCodePatternBlock[]) {
  return blocks.map((block, index) => ({
    ...block,
    id: `builder-${Date.now()}-${index}-${block.type.toLowerCase()}`,
  }));
}

export function DocumentCodePatternBuilder({
  value,
  onChange,
  separator,
  onSeparatorChange,
  context = {},
  onModeChange,
  initialMode,
}: DocumentCodePatternBuilderProps) {
  const [initialParse] = useState(() => parsePatternToBlocks(value));
  const [blocks, setBlocks] = useState<DocumentCodePatternBlock[]>(
    initialParse.isLossless
      ? withFreshIds(initialParse.blocks)
      : createDefaultPatternBlocks(),
  );
  const [mode, setMode] = useState<"visual" | "advanced">(
    initialParse.isLossless ? (initialMode ?? "visual") : "advanced",
  );
  const [advancedValue, setAdvancedValue] = useState(value);
  const [advancedMessage, setAdvancedMessage] = useState<string | null>(
    initialParse.isLossless
      ? null
      : "Este padrão não pôde ser convertido sem perda. Ele foi preservado no modo avançado.",
  );
  const [fixedText, setFixedText] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(
    !initialParse.isLossless || initialMode === "advanced",
  );
  const lastEmittedValue = useRef(value);

  useEffect(() => {
    if (value === lastEmittedValue.current) return;
    const parsed = parsePatternToBlocks(value);
    setAdvancedValue(value);
    if (parsed.isLossless) {
      setBlocks(withFreshIds(parsed.blocks));
      setAdvancedMessage(null);
    } else {
      setMode("advanced");
      setAdvancedOpen(true);
      setAdvancedMessage(
        "O padrão existente foi preservado. Corrija a expressão antes de sincronizar com o builder.",
      );
      onModeChange?.("advanced");
    }
  }, [onModeChange, value]);

  const visualValidation = useMemo(
    () => validatePatternBlocks(blocks, context),
    [blocks, context],
  );
  const advancedValidation = useMemo(
    () => validatePatternExpression(advancedValue, context),
    [advancedValue, context],
  );
  const expression = serializeBlocksToPattern(blocks);
  const example = buildPatternExample(blocks, context);
  const explanations = explainPatternBlocks(blocks);

  function emit(nextBlocks: DocumentCodePatternBlock[]) {
    const nextExpression = serializeBlocksToPattern(nextBlocks);
    setBlocks(nextBlocks);
    setAdvancedValue(nextExpression);
    lastEmittedValue.current = nextExpression;
    onChange(nextExpression);
  }

  function setBuilderMode(nextMode: "visual" | "advanced") {
    setMode(nextMode);
    setAdvancedOpen(nextMode === "advanced");
    onModeChange?.(nextMode);
  }

  function addBlock(type: DocumentCodeTokenType, customValue?: string) {
    const next = [...blocks];
    if (
      next.length > 0 &&
      next.at(-1)?.type !== "SEPARATOR" &&
      type !== "SEPARATOR"
    ) {
      next.push({
        id: `builder-${Date.now()}-separator`,
        type: "SEPARATOR",
        value: separator,
      });
    }
    next.push({
      id: `builder-${Date.now()}-${type.toLowerCase()}`,
      type,
      value:
        type === "SEPARATOR"
          ? separator
          : type === "TEXT"
            ? customValue
            : undefined,
    });
    emit(next);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    emit(next);
  }

  function removeBlock(index: number) {
    emit(blocks.filter((_, blockIndex) => blockIndex !== index));
  }

  function applyPreset(expressionValue: string) {
    const parsed = parsePatternToBlocks(expressionValue);
    emit(withFreshIds(parsed.blocks));
    setAdvancedMessage(null);
    setBuilderMode("visual");
  }

  function synchronizeAdvanced() {
    const parsed = parsePatternToBlocks(advancedValue);
    if (!parsed.isValid || !parsed.isLossless) {
      setAdvancedMessage(
        parsed.errors[0] ||
          "A expressão usa elementos que não podem ser convertidos sem perda.",
      );
      return;
    }
    const nextBlocks = withFreshIds(parsed.blocks);
    setAdvancedMessage(null);
    emit(nextBlocks);
    setBuilderMode("visual");
  }

  function normalizeSeparators() {
    emit(dedupeSeparators(blocks));
  }

  const availableTokens = getAvailableCodeTokens();

  return (
    <div className="space-y-5 rounded-xl border bg-muted/15 p-4 md:p-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <WandSparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Builder visual do código</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte o padrão clicando nos blocos. O TRAMITA gera a expressão
            técnica automaticamente.
          </p>
        </div>
        <Badge variant={mode === "visual" ? "default" : "secondary"}>
          {mode === "visual" ? "Modo visual" : "Modo avançado"}
        </Badge>
      </div>

      <div className="space-y-2">
        <Label>Comece com um modelo</Label>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {DOCUMENT_CODE_PATTERN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/[0.03]"
              onClick={() => applyPreset(preset.expression)}
            >
              <span className="block text-sm font-medium">{preset.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {preset.description}
              </span>
              <span className="mt-2 block font-mono text-[11px]">
                {preset.example}
              </span>
            </button>
          ))}
        </div>
      </div>

      {mode === "visual" && (
        <>
          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Label>Blocos disponíveis</Label>
              <div className="w-full sm:w-48">
                <Select
                  value={separator}
                  onValueChange={(nextSeparator) => {
                    onSeparatorChange(nextSeparator);
                    emit(
                      blocks.map((block) =>
                        block.type === "SEPARATOR"
                          ? { ...block, value: nextSeparator }
                          : block,
                      ),
                    );
                  }}
                >
                  <SelectTrigger aria-label="Separador padrão">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEPARATORS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {availableTokens.map((token) => (
                <DocumentCodePatternBlockChip
                  key={token.type}
                  block={{
                    id: `available-${token.type}`,
                    type: token.type,
                  }}
                  onAdd={() => addBlock(token.type)}
                />
              ))}
              <DocumentCodePatternBlockChip
                block={{
                  id: "available-separator",
                  type: "SEPARATOR",
                  value: separator,
                }}
                onAdd={() => addBlock("SEPARATOR")}
              />
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-background p-3 sm:flex-row">
              <Input
                value={fixedText}
                onChange={(event) => setFixedText(event.target.value)}
                placeholder="Texto fixo, por exemplo CERT"
                aria-label="Texto fixo"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!fixedText.trim()}
                onClick={() => {
                  addBlock("TEXT", fixedText);
                  setFixedText("");
                }}
              >
                Adicionar texto fixo
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Seu padrão</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={normalizeSeparators}
                >
                  Normalizar separadores
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => emit([])}
                >
                  Limpar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    emit(withFreshIds(createDefaultPatternBlocks()))
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurar recomendado
                </Button>
              </div>
            </div>
            {blocks.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
                Clique nos blocos acima para montar o código.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 rounded-lg border bg-background p-3">
                {blocks.map((block, index) => (
                  <DocumentCodePatternBlockChip
                    key={block.id}
                    block={block}
                    index={index}
                    total={blocks.length}
                    onMoveLeft={() => moveBlock(index, -1)}
                    onMoveRight={() => moveBlock(index, 1)}
                    onRemove={() => removeBlock(index)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Expressão gerada
              </p>
              <p className="mt-2 break-all font-mono text-sm font-semibold">
                {expression || "Nenhuma expressão"}
              </p>
            </div>
            <div className="rounded-lg border bg-primary/[0.025] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Exemplo visual
              </p>
              <p className="mt-2 break-all font-mono text-lg font-semibold">
                {example || "Adicione blocos para gerar um exemplo"}
              </p>
            </div>
          </div>

          {visualValidation.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Padrão ainda inválido</AlertTitle>
              <AlertDescription>
                {visualValidation.errors.join(" ")}
              </AlertDescription>
            </Alert>
          )}
          {visualValidation.isValid && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Padrão válido para salvar</AlertTitle>
              <AlertDescription>
                A expressão é compatível com o motor P-11. O número exibido é
                apenas uma estimativa.
              </AlertDescription>
            </Alert>
          )}
          {visualValidation.warnings.map((warning) => (
            <p
              key={warning}
              className="text-sm text-amber-700 dark:text-amber-300"
            >
              {warning}
            </p>
          ))}

          {explanations.length > 0 && (
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Como este padrão funciona
              </div>
              <ul className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                {explanations.slice(0, 6).map((explanation) => (
                  <li key={explanation}>• {explanation}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <Code2 className="h-4 w-4" />
              {mode === "advanced"
                ? "Editor avançado aberto"
                : "Abrir modo avançado"}
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3 rounded-lg border bg-background p-4">
          <div>
            <Label htmlFor="advanced-code-pattern">Expressão técnica</Label>
            <Textarea
              id="advanced-code-pattern"
              className="mt-2 font-mono"
              value={advancedValue}
              onFocus={() => setBuilderMode("advanced")}
              onChange={(event) => {
                const nextValue = event.target.value.toUpperCase();
                setAdvancedValue(nextValue);
                setBuilderMode("advanced");
                lastEmittedValue.current = nextValue;
                onChange(nextValue);
              }}
              rows={3}
              spellCheck={false}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Tokens aceitos: {"{PREFIX} {ORG} {PROJECT} {AREA} {TYPE} {YEAR} "}
            {"{MONTH} {SEQ} {CUSTOM}"}. O bloco {"{SEQ}"} é obrigatório.
          </p>
          {(advancedMessage || advancedValidation.errors[0]) && (
            <p className="text-sm text-destructive">
              {advancedMessage || advancedValidation.errors[0]}
            </p>
          )}
          {advancedValidation.warnings.map((warning) => (
            <p
              key={warning}
              className="text-xs text-amber-700 dark:text-amber-300"
            >
              {warning}
            </p>
          ))}
          <Button
            type="button"
            disabled={!advancedValidation.isValid}
            onClick={synchronizeAdvanced}
          >
            <Braces className="h-4 w-4" />
            Sincronizar com builder
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
