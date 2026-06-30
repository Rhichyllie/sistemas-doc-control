import { useEffect, useState } from "react";
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
import type {
  DocumentRuleMutationInput,
  DocumentRulesProject,
} from "@/hooks/useDocumentTemplatesAndRules";
import { DOC_TYPES } from "@/lib/constants";
import {
  DOCUMENT_RULE_FIELD_KEYS,
  DOCUMENT_RULE_FIELD_LABELS,
  normalizeRuleEffects,
  type DocumentRuleField,
  type DocumentRuleRecord,
  type DocumentRuleSeverity,
  type GovernanceRiskProfile,
} from "@/lib/documentTemplateRules";

const AREAS = ["SGI", "ENG", "OPS", "MNT", "SST", "MA", "QUA", "ADM"];

interface DocumentRuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: DocumentRuleRecord | null;
  projects: DocumentRulesProject[];
  canUseProjects: boolean;
  isSaving: boolean;
  onSubmit: (input: DocumentRuleMutationInput) => Promise<boolean>;
}

function initialState(rule: DocumentRuleRecord | null) {
  const effects = normalizeRuleEffects(rule?.effects);
  return {
    name: rule?.name ?? "",
    description: rule?.description ?? "",
    priority: String(rule?.priority ?? 100),
    severity: rule?.severity ?? "info",
    doc_type:
      typeof rule?.condition.doc_type === "string"
        ? rule.condition.doc_type
        : "",
    area: typeof rule?.condition.area === "string" ? rule.condition.area : "",
    project_id:
      typeof rule?.condition.project_id === "string"
        ? rule.condition.project_id
        : "",
    required_fields: effects.required_fields,
    review_period_months: effects.review_period_months
      ? String(effects.review_period_months)
      : "",
    risk_level: effects.risk_level ?? "",
    recommendations: effects.recommendations.join("\n"),
  };
}

export function DocumentRuleForm({
  open,
  onOpenChange,
  rule,
  projects,
  canUseProjects,
  isSaving,
  onSubmit,
}: DocumentRuleFormProps) {
  const [form, setForm] = useState(() => initialState(rule));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialState(rule));
      setFormError(null);
    }
  }, [open, rule]);

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
    const reviewMonths = form.review_period_months
      ? Number(form.review_period_months)
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
      setFormError("O período obrigatório deve ficar entre 1 e 120 meses.");
      return;
    }

    const condition: Record<string, unknown> = {
      ...(rule?.condition ?? {}),
    };
    const conditionUpdates = {
      doc_type: form.doc_type || undefined,
      area: form.area || undefined,
      project_id: canUseProjects
        ? form.project_id || undefined
        : rule?.condition.project_id,
    };
    for (const [key, value] of Object.entries(conditionUpdates)) {
      if (value === undefined) delete condition[key];
      else condition[key] = value;
    }

    const recommendations = form.recommendations
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const effects: Record<string, unknown> = {
      ...(rule?.effects ?? {}),
    };
    const effectUpdates = {
      required_fields: form.required_fields.length
        ? form.required_fields
        : undefined,
      review_period_months: reviewMonths ?? undefined,
      risk_level: form.risk_level || undefined,
      recommendations: recommendations.length ? recommendations : undefined,
    };
    for (const [key, value] of Object.entries(effectUpdates)) {
      if (value === undefined) delete effects[key];
      else effects[key] = value;
    }

    setFormError(null);
    const success = await onSubmit({
      name: form.name,
      description: form.description,
      priority,
      severity: form.severity,
      condition,
      effects,
      is_active: rule?.is_active ?? true,
    });
    if (success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {rule ? "Editar regra" : "Nova regra documental"}
            </DialogTitle>
            <DialogDescription>
              Configure condições e efeitos por campos guiados.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="rule-name">Nome *</Label>
              <Input
                id="rule-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex.: IT de manutenção"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="rule-description">Descrição</Label>
              <Textarea
                id="rule-description"
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
              <Label htmlFor="rule-priority">Prioridade</Label>
              <Input
                id="rule-priority"
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
            </div>
            <div className="space-y-2">
              <Label>Severidade</Label>
              <Select
                value={form.severity}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    severity: value as DocumentRuleSeverity,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Informativa</SelectItem>
                  <SelectItem value="warning">Alerta</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <p className="text-sm font-semibold">Quando aplicar</p>
              <p className="text-xs text-muted-foreground">
                Condições vazias tornam a regra válida para toda a organização.
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
                    <SelectItem value="none">Qualquer projeto</SelectItem>
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

            <div className="md:col-span-2">
              <p className="text-sm font-semibold">Efeitos da regra</p>
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
            <div className="space-y-2">
              <Label htmlFor="rule-review">Período obrigatório</Label>
              <Input
                id="rule-review"
                type="number"
                min={1}
                max={120}
                value={form.review_period_months}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    review_period_months: event.target.value,
                  }))
                }
                placeholder="Sem imposição"
              />
            </div>
            <div className="space-y-2">
              <Label>Risco mínimo</Label>
              <Select
                value={form.risk_level || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    risk_level:
                      value === "none" ? "" : (value as GovernanceRiskProfile),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem alteração</SelectItem>
                  <SelectItem value="low">Baixo</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="rule-recommendations">
                Recomendações, uma por linha
              </Label>
              <Textarea
                id="rule-recommendations"
                value={form.recommendations}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    recommendations: event.target.value,
                  }))
                }
                rows={4}
              />
            </div>
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
              Salvar regra
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
