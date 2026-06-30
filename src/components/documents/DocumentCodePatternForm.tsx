import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { DocumentCodePreviewCard } from "@/components/documents/DocumentCodePreviewCard";
import type {
  DocumentCodePatternMutationInput,
  DocumentCodeProject,
} from "@/hooks/useDocumentCodePatterns";
import { DOC_TYPES } from "@/lib/constants";
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

function initialState(pattern: DocumentCodePattern | null) {
  const customToken =
    pattern?.tokens &&
    typeof pattern.tokens === "object" &&
    !Array.isArray(pattern.tokens) &&
    typeof (pattern.tokens as Record<string, unknown>).custom === "string"
      ? String((pattern.tokens as Record<string, unknown>).custom)
      : "";
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
    sequence_padding: String(pattern?.sequence_padding ?? 4),
    sequence_reset: pattern?.sequence_reset ?? ("never" as const),
    sequence_start: String(pattern?.sequence_start ?? 1),
    include_year: pattern?.include_year ?? false,
    include_month: pattern?.include_month ?? false,
    custom_token: customToken,
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
      separator: "-",
      sequence_padding: Number(form.sequence_padding) || 4,
      sequence_reset: form.sequence_reset,
      sequence_start: Number(form.sequence_start) || 0,
      include_year: form.include_year,
      include_month: form.include_month,
      tokens: form.custom_token ? { custom: form.custom_token } : [],
      example_output: null,
      created_by: pattern?.created_by ?? null,
      created_at: pattern?.created_at ?? "",
      updated_at: pattern?.updated_at ?? "",
    }),
    [form, pattern],
  );
  const selectedProject = projects.find(
    (project) => project.id === form.project_id,
  );
  const preview = previewLocalDocumentCode(previewPattern, {
    docType: form.doc_type || "PRO",
    area: form.area || "SST",
    projectId: form.project_id || null,
    projectCode: selectedProject?.code,
    orgCode: "ORG",
  });

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
      separator: "-",
      sequence_padding: padding,
      sequence_reset: form.sequence_reset,
      sequence_start: sequenceStart,
      include_year: form.include_year,
      include_month: form.include_month,
      tokens: form.custom_token ? { custom: form.custom_token } : [],
      example_output: preview.code,
    });
    if (success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {pattern ? "Editar padrão" : "Novo padrão de codificação"}
            </DialogTitle>
            <DialogDescription>
              Configure formato, escopo e sequência sem expor SQL ou JSON.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
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
                  placeholder="Ex.: Padrão PRO/SST"
                />
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
                  rows={2}
                />
              </div>

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
                    <SelectItem value="organization">Organização</SelectItem>
                    <SelectItem value="project">Projeto</SelectItem>
                    <SelectItem value="area">Área</SelectItem>
                    <SelectItem value="type">Tipo documental</SelectItem>
                    <SelectItem value="area_type">Área + tipo</SelectItem>
                  </SelectContent>
                </Select>
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
                  Menor número vence.
                </p>
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
              <div className="space-y-2 md:col-span-2">
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
                    <SelectItem value="none">Sem projeto específico</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.code} — {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code-pattern-custom">Token personalizado</Label>
                <Input
                  id="code-pattern-custom"
                  value={form.custom_token}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      custom_token: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Usado por {CUSTOM}"
                  maxLength={24}
                />
              </div>
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
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="code-pattern-expression">Padrão *</Label>
                <Input
                  id="code-pattern-expression"
                  className="font-mono"
                  value={form.pattern}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pattern: event.target.value.toUpperCase(),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Tokens: {"{PREFIX} {AREA} {TYPE} {PROJECT} {YEAR} {MONTH} "}
                  {"{SEQ} {ORG} {CUSTOM}"}
                </p>
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

            <div className="space-y-3">
              <DocumentCodePreviewCard preview={preview} />
              {validateCodePattern(previewPattern).warnings.map((warning) => (
                <p
                  key={warning}
                  className="text-xs text-amber-700 dark:text-amber-300"
                >
                  {warning}
                </p>
              ))}
            </div>
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
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar padrão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
