import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  DocumentRulesProject,
  DocumentTemplateMutationInput,
} from "@/hooks/useDocumentTemplatesAndRules";
import { DOC_TYPES } from "@/lib/constants";
import {
  DOCUMENT_RULE_FIELD_KEYS,
  DOCUMENT_RULE_FIELD_LABELS,
  type DocumentRuleField,
  type DocumentTemplateRecord,
  type GovernanceRiskProfile,
} from "@/lib/documentTemplateRules";

const AREAS = ["SGI", "ENG", "OPS", "MNT", "SST", "MA", "QUA", "ADM"];

interface DocumentTemplateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: DocumentTemplateRecord | null;
  projects: DocumentRulesProject[];
  canUseProjects: boolean;
  isSaving: boolean;
  onSubmit: (input: DocumentTemplateMutationInput) => Promise<boolean>;
}

function initialState(template: DocumentTemplateRecord | null) {
  return {
    name: template?.name ?? "",
    description: template?.description ?? "",
    doc_type: template?.doc_type ?? "",
    area: template?.area ?? "",
    project_id: template?.project_id ?? "",
    priority: String(template?.priority ?? 100),
    template_scope: template?.template_scope ?? "organization",
    default_description: template?.default_description ?? "",
    default_review_months: template?.default_review_months
      ? String(template.default_review_months)
      : "",
    required_fields: template?.required_fields ?? [],
    risk_profile: template?.risk_profile ?? "medium",
    is_default: template?.is_default ?? false,
  };
}

export function DocumentTemplateForm({
  open,
  onOpenChange,
  template,
  projects,
  canUseProjects,
  isSaving,
  onSubmit,
}: DocumentTemplateFormProps) {
  const [form, setForm] = useState(() => initialState(template));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialState(template));
      setFormError(null);
    }
  }, [open, template]);

  function toggleRequiredField(field: DocumentRuleField, checked: boolean) {
    setForm((current) => ({
      ...current,
      required_fields: checked
        ? [...new Set([...current.required_fields, field])]
        : current.required_fields.filter((item) => item !== field),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const priority = Number(form.priority);
    const reviewMonths = form.default_review_months
      ? Number(form.default_review_months)
      : null;

    if (form.name.trim().length < 3) {
      setFormError("Informe um nome com pelo menos 3 caracteres.");
      return;
    }
    if (!Number.isInteger(priority) || priority < 0) {
      setFormError(
        "A prioridade deve ser um número inteiro maior ou igual a 0.",
      );
      return;
    }
    if (
      reviewMonths !== null &&
      (!Number.isInteger(reviewMonths) ||
        reviewMonths < 1 ||
        reviewMonths > 120)
    ) {
      setFormError("O período padrão deve ficar entre 1 e 120 meses.");
      return;
    }
    if (form.template_scope === "project" && !form.project_id) {
      setFormError("Selecione um projeto para um template de projeto.");
      return;
    }

    setFormError(null);
    const success = await onSubmit({
      name: form.name,
      description: form.description,
      doc_type: form.doc_type || null,
      area: form.area || null,
      project_id: canUseProjects
        ? form.project_id || null
        : (template?.project_id ?? null),
      priority,
      template_scope: form.template_scope,
      default_description: form.default_description,
      default_review_months: reviewMonths,
      required_fields: form.required_fields,
      risk_profile: form.risk_profile,
      is_active: template?.is_active ?? true,
      is_default: form.is_default,
      default_title_pattern: template?.default_title_pattern ?? null,
      governance_hints: template?.governance_hints ?? {},
      default_metadata: template?.default_metadata ?? {},
      recommended_fields: template?.recommended_fields ?? [],
    });
    if (success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {template ? "Editar template" : "Novo template documental"}
            </DialogTitle>
            <DialogDescription>
              Defina padrões e requisitos sem expor a configuração JSON.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="template-name">Nome *</Label>
              <Input
                id="template-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex.: Procedimento de SST"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="template-description">Descrição</Label>
              <Textarea
                id="template-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Escopo</Label>
              <Select
                value={form.template_scope}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    template_scope:
                      value as DocumentTemplateRecord["template_scope"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Organização</SelectItem>
                  <SelectItem value="type">Tipo documental</SelectItem>
                  <SelectItem value="area">Área</SelectItem>
                  {canUseProjects && (
                    <SelectItem value="project">Projeto</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-priority">Prioridade</Label>
              <Input
                id="template-priority"
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
                Números menores são avaliados primeiro.
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
                      {type.label}
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
                    <SelectItem key={area} value={area}>
                      {area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canUseProjects && (
              <div className="space-y-2 md:col-span-2">
                <Label>Projeto</Label>
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
                        {project.code ? `${project.code} · ` : ""}
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="template-review">Revisão padrão</Label>
              <Input
                id="template-review"
                type="number"
                min={1}
                max={120}
                value={form.default_review_months}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    default_review_months: event.target.value,
                  }))
                }
                placeholder="Usar configuração do tipo"
              />
            </div>
            <div className="space-y-2">
              <Label>Perfil de risco</Label>
              <Select
                value={form.risk_profile}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    risk_profile: value as GovernanceRiskProfile,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixo</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="template-default-description">
                Estrutura sugerida para descrição
              </Label>
              <Textarea
                id="template-default-description"
                value={form.default_description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    default_description: event.target.value,
                  }))
                }
                placeholder="Texto inicial aplicado apenas quando a descrição estiver vazia."
                rows={3}
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <Label>Campos obrigatórios</Label>
              <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 md:grid-cols-3">
                {DOCUMENT_RULE_FIELD_KEYS.map((field) => (
                  <label
                    key={field}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={form.required_fields.includes(field)}
                      onCheckedChange={(checked) =>
                        toggleRequiredField(field, checked === true)
                      }
                    />
                    {DOCUMENT_RULE_FIELD_LABELS[field]}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <Checkbox
                checked={form.is_default}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    is_default: checked === true,
                  }))
                }
              />
              Usar como padrão quando houver empate de prioridade e escopo
            </label>
          </div>

          {formError && (
            <p className="mb-4 text-sm text-destructive">{formError}</p>
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
              Salvar template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
