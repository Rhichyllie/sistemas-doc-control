import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { DocumentCodePatternBuilder } from "@/components/documents/DocumentCodePatternBuilder";
import { DocumentCodePreviewCard } from "@/components/documents/DocumentCodePreviewCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type {
  DocumentCodePatternMutationInput,
  DocumentCodeProject,
} from "@/hooks/useDocumentCodePatterns";
import { DOC_TYPES } from "@/lib/constants";
import {
  validatePatternExpression,
  type DocumentCodePatternExampleContext,
} from "@/lib/documentCodePatternBuilder";
import {
  previewLocalDocumentCode,
  validateCodePattern,
  type DocumentCodePattern,
  type DocumentCodePatternScope,
  type DocumentCodeSequenceReset,
} from "@/lib/documentCodePatterns";

const AREAS = [
  { value: "SGI", label: "SGI — Sistema de Gestão Integrada" },
  { value: "ENG", label: "ENG — Engenharia" },
  { value: "OPS", label: "OPS — Operações" },
  { value: "MNT", label: "MNT — Manutenção" },
  { value: "SST", label: "SST — Saúde e Segurança" },
  { value: "MA", label: "MA — Meio Ambiente" },
  { value: "QUA", label: "QUA — Qualidade" },
  { value: "ADM", label: "ADM — Administrativo" },
];

interface DocumentCodePatternFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pattern: DocumentCodePattern | null;
  projects: DocumentCodeProject[];
  isSaving: boolean;
  submissionError: string | null;
  onSubmit: (input: DocumentCodePatternMutationInput) => Promise<boolean>;
}

function asTokenRecord(tokens: unknown): Record<string, unknown> {
  return tokens && typeof tokens === "object" && !Array.isArray(tokens)
    ? { ...(tokens as Record<string, unknown>) }
    : {};
}

function initialState(pattern: DocumentCodePattern | null) {
  const tokenRecord = asTokenRecord(pattern?.tokens);
  const customToken =
    typeof tokenRecord.custom === "string" ? tokenRecord.custom : "";
  const builderMode =
    tokenRecord.builder_mode === "advanced" ? "advanced" : "visual";
  return {
    name: pattern?.name ?? "",
    description: pattern?.description ?? "",
    is_active: pattern?.is_active ?? true,
    is_default: pattern?.is_default ?? false,
    priority: String(pattern?.priority ?? 100),
    pattern_scope: pattern?.pattern_scope ?? ("organization" as const),
    doc_type: pattern?.doc_type ?? "",
    area: pattern?.area ?? "",
    project_id: pattern?.project_id ?? "",
    prefix: pattern?.prefix ?? "TR",
    pattern: pattern?.pattern ?? "{PREFIX}-{AREA}-{TYPE}-{SEQ}",
    separator: pattern?.separator ?? "-",
    sequence_padding: String(pattern?.sequence_padding ?? 4),
    sequence_reset: pattern?.sequence_reset ?? ("never" as const),
    sequence_start: String(pattern?.sequence_start ?? 1),
    include_year:
      pattern?.include_year ?? pattern?.pattern.includes("{YEAR}") ?? false,
    include_month:
      pattern?.include_month ?? pattern?.pattern.includes("{MONTH}") ?? false,
    custom_token: customToken,
    token_metadata: tokenRecord,
    builder_mode: builderMode as "visual" | "advanced",
  };
}

export function DocumentCodePatternForm({
  open,
  onOpenChange,
  pattern,
  projects,
  isSaving,
  submissionError,
  onSubmit,
}: DocumentCodePatternFormProps) {
  const [form, setForm] = useState(() => initialState(pattern));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialState(pattern));
      setFormError(null);
    }
  }, [open, pattern]);

  const selectedProject = projects.find(
    (project) => project.id === form.project_id,
  );
  const builderContext = useMemo<DocumentCodePatternExampleContext>(
    () => ({
      prefix: form.prefix,
      org: "ACME",
      docType: form.doc_type || "ET",
      area: form.area || "ENG",
      project: selectedProject?.code,
      projectId: form.project_id || null,
      custom: form.custom_token,
      sequenceNumber: Number(form.sequence_start) || 1,
      sequencePadding: Number(form.sequence_padding) || 4,
    }),
    [
      form.area,
      form.custom_token,
      form.doc_type,
      form.prefix,
      form.project_id,
      form.sequence_padding,
      form.sequence_start,
      selectedProject?.code,
    ],
  );

  const persistedTokens = useMemo(
    () => ({
      ...form.token_metadata,
      custom: form.custom_token,
      builder_mode: form.builder_mode,
    }),
    [form.builder_mode, form.custom_token, form.token_metadata],
  );

  const previewPattern = useMemo<DocumentCodePattern>(
    () => ({
      id: pattern?.id ?? "preview",
      org_id: pattern?.org_id ?? "preview",
      name: form.name || "Novo padrão",
      description: form.description || null,
      is_active: form.is_active,
      is_default: form.is_default,
      priority: Number(form.priority) || 0,
      pattern_scope: form.pattern_scope,
      doc_type: form.doc_type || null,
      area: form.area || null,
      project_id: form.project_id || null,
      prefix: form.prefix,
      pattern: form.pattern.toUpperCase(),
      separator: form.separator,
      sequence_padding: Number(form.sequence_padding) || 4,
      sequence_reset: form.sequence_reset,
      sequence_start: Number(form.sequence_start) || 0,
      include_year: form.pattern.includes("{YEAR}"),
      include_month: form.pattern.includes("{MONTH}"),
      tokens: persistedTokens,
      example_output: null,
      created_by: pattern?.created_by ?? null,
      created_at: pattern?.created_at ?? "",
      updated_at: pattern?.updated_at ?? "",
    }),
    [form, pattern, persistedTokens],
  );

  const preview = previewLocalDocumentCode(previewPattern, {
    docType: form.doc_type || "ET",
    area: form.area || "ENG",
    projectId: form.project_id || null,
    projectCode: selectedProject?.code,
    orgCode: "ACME",
  });
  const builderValidation = validatePatternExpression(
    form.pattern,
    builderContext,
  );

  function updatePattern(nextPattern: string) {
    setForm((current) => ({
      ...current,
      pattern: nextPattern.toUpperCase(),
      include_year: nextPattern.toUpperCase().includes("{YEAR}"),
      include_month: nextPattern.toUpperCase().includes("{MONTH}"),
    }));
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const priority = Number(form.priority);
    const padding = Number(form.sequence_padding);
    const sequenceStart = Number(form.sequence_start);
    if (form.name.trim().length < 3) {
      setFormError("Informe um nome com pelo menos 3 caracteres.");
      return;
    }
    if (!Number.isInteger(priority) || priority < 0) {
      setFormError("A prioridade deve ser um inteiro maior ou igual a zero.");
      return;
    }
    if (!builderValidation.isValid) {
      setFormError(builderValidation.errors[0]);
      return;
    }

    const validation = validateCodePattern({
      ...previewPattern,
      sequence_padding: padding,
      sequence_start: sequenceStart,
    });
    if (!validation.isValid) {
      setFormError(validation.errors[0]);
      return;
    }

    setFormError(null);
    const success = await onSubmit({
      name: form.name,
      description: form.description,
      is_active: form.is_active,
      is_default: form.is_default,
      priority,
      pattern_scope: form.pattern_scope,
      doc_type: form.doc_type || null,
      area: form.area || null,
      project_id: form.project_id || null,
      prefix: form.prefix,
      pattern: form.pattern,
      separator: form.separator,
      sequence_padding: padding,
      sequence_reset: form.sequence_reset,
      sequence_start: sequenceStart,
      include_year: form.pattern.includes("{YEAR}"),
      include_month: form.pattern.includes("{MONTH}"),
      tokens: persistedTokens,
      example_output: preview.code,
    });
    if (success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {pattern ? "Editar padrão" : "Criar padrão visual"}
            </DialogTitle>
            <DialogDescription>
              Monte um formato compreensível. A expressão técnica compatível com
              o motor P-11 será gerada automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-7 py-5">
            <section className="space-y-4">
              <div>
                <h3 className="font-semibold">1. Identidade do padrão</h3>
                <p className="text-sm text-muted-foreground">
                  Dê um nome operacional para identificar quando este padrão
                  deve ser usado.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code-pattern-name">Nome *</Label>
                  <Input
                    id="code-pattern-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Ex.: Documentos técnicos por projeto"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-pattern-priority">Prioridade</Label>
                  <Input
                    id="code-pattern-priority"
                    type="number"
                    min={0}
                    step={1}
                    value={form.priority}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        priority: event.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Menor número tem preferência quando mais de um padrão se
                    aplica.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="code-pattern-description">Descrição</Label>
                  <Textarea
                    id="code-pattern-description"
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Explique em quais documentos este padrão deve ser usado."
                    rows={2}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="font-semibold">2. Onde se aplica</h3>
                <p className="text-sm text-muted-foreground">
                  Restrinja por projeto, área ou tipo. Campos em branco aceitam
                  qualquer contexto.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Escopo</Label>
                  <Select
                    value={form.pattern_scope}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        pattern_scope: value as DocumentCodePatternScope,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="organization">
                        Organização inteira
                      </SelectItem>
                      <SelectItem value="project">Projeto</SelectItem>
                      <SelectItem value="area">Área</SelectItem>
                      <SelectItem value="type">Tipo documental</SelectItem>
                      <SelectItem value="area_type">Área + tipo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo documental</Label>
                  <Select
                    value={form.doc_type || "any"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        doc_type: value === "any" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer tipo</SelectItem>
                      {DOC_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.value} — {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Área</Label>
                  <Select
                    value={form.area || "any"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        area: value === "any" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer área</SelectItem>
                      {AREAS.map((area) => (
                        <SelectItem key={area.value} value={area.value}>
                          {area.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Projeto opcional</Label>
                  <Select
                    value={form.project_id || "none"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        project_id: value === "none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Sem projeto específico
                      </SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.code} — {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selectedProject && !selectedProject.has_explicit_code && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Este projeto não possui código explícito. O bloco Projeto
                  usará o fallback seguro {selectedProject.code}.
                </p>
              )}
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="font-semibold">3. Valores principais</h3>
                <p className="text-sm text-muted-foreground">
                  Estes valores alimentam os blocos Prefixo e Valor
                  personalizado.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code-pattern-prefix">Prefixo</Label>
                  <Input
                    id="code-pattern-prefix"
                    value={form.prefix}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        prefix: event.target.value.toUpperCase(),
                      }))
                    }
                    maxLength={12}
                    placeholder="TR"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-pattern-custom">
                    Valor personalizado
                  </Label>
                  <Input
                    id="code-pattern-custom"
                    value={form.custom_token}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        custom_token: event.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="Usado quando o bloco personalizado estiver presente"
                    maxLength={24}
                  />
                </div>
              </div>
            </section>

            <DocumentCodePatternBuilder
              value={form.pattern}
              onChange={updatePattern}
              separator={form.separator}
              onSeparatorChange={(separator) =>
                setForm((current) => ({ ...current, separator }))
              }
              context={builderContext}
              initialMode={form.builder_mode}
              onModeChange={(builderMode) =>
                setForm((current) => ({
                  ...current,
                  builder_mode: builderMode,
                }))
              }
            />

            <section className="space-y-4">
              <div>
                <h3 className="font-semibold">4. Controle da sequência</h3>
                <p className="text-sm text-muted-foreground">
                  A sequência é reservada apenas na criação do documento. O
                  preview não reserva número.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="code-pattern-padding">
                    Dígitos da sequência
                  </Label>
                  <Input
                    id="code-pattern-padding"
                    type="number"
                    min={2}
                    max={8}
                    value={form.sequence_padding}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sequence_padding: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reinício da sequência</Label>
                  <Select
                    value={form.sequence_reset}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        sequence_reset: value as DocumentCodeSequenceReset,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Nunca</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="project">Por projeto</SelectItem>
                      <SelectItem value="area">Por área</SelectItem>
                      <SelectItem value="type">Por tipo</SelectItem>
                      <SelectItem value="area_type">Por área + tipo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-pattern-start">Número inicial</Label>
                  <Input
                    id="code-pattern-start"
                    type="number"
                    min={0}
                    step={1}
                    value={form.sequence_start}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sequence_start: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-3 rounded-lg border p-4">
                <h3 className="font-semibold">5. Disponibilidade</h3>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.is_active}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        is_active: checked === true,
                      }))
                    }
                  />
                  Padrão ativo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.is_default}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        is_default: checked === true,
                      }))
                    }
                  />
                  Usar como padrão preferencial
                </label>
              </div>
              <DocumentCodePreviewCard
                preview={preview}
                patternExpression={form.pattern}
                projectUsesFallback={
                  Boolean(selectedProject) &&
                  selectedProject?.has_explicit_code === false
                }
              />
            </section>
          </div>

          {(formError || submissionError) && (
            <p className="mb-4 text-sm text-destructive">
              {formError || submissionError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !builderValidation.isValid}
              title={
                builderValidation.isValid
                  ? undefined
                  : builderValidation.errors[0]
              }
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar padrão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
