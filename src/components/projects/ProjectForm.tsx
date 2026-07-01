import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
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
import type { ProjectResponsibleOption } from "@/hooks/useProjects";
import {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  getProjectStatusLabel,
  getProjectTypeLabel,
  normalizeProjectCode,
  suggestProjectCode,
  validateProjectInput,
  type ProjectInput,
  type ProjectOperationalContext,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/projectOperationalContext";

const AREAS = ["SGI", "ENG", "OPS", "MNT", "SST", "MA", "QUA", "ADM"];

interface ProjectFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectOperationalContext | null;
  existingCodes: string[];
  users: ProjectResponsibleOption[];
  isSaving: boolean;
  submissionError: string | null;
  onSubmit: (input: ProjectInput) => Promise<boolean>;
}

function initialState(project: ProjectOperationalContext | null) {
  return {
    name: project?.name ?? "",
    code: project?.has_explicit_code ? project.code : "",
    description: project?.description ?? "",
    client_name: project?.client_name ?? "",
    contract_number: project?.contract_number ?? "",
    location: project?.location ?? "",
    project_type: project?.project_type ?? ("project" as ProjectType),
    status: project?.status ?? ("active" as ProjectStatus),
    area: project?.area ?? "",
    responsible_id: project?.responsible_id ?? "",
    start_date: project?.start_date ?? "",
    end_date: project?.end_date ?? "",
    is_active: project?.is_active ?? true,
  };
}

export function ProjectForm({
  open,
  onOpenChange,
  project,
  existingCodes,
  users,
  isSaving,
  submissionError,
  onSubmit,
}: ProjectFormProps) {
  const [form, setForm] = useState(() => initialState(project));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialState(project));
      setFormError(null);
    }
  }, [open, project]);

  const suggestedCode = useMemo(
    () =>
      suggestProjectCode(
        form.name,
        existingCodes.filter((code) => code !== project?.code),
      ),
    [existingCodes, form.name, project?.code],
  );
  const effectiveCode =
    normalizeProjectCode(form.code) || "PROJxxxxxx (fallback)";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const input: ProjectInput = {
      ...form,
      code: form.code || null,
      description: form.description || null,
      client_name: form.client_name || null,
      contract_number: form.contract_number || null,
      location: form.location || null,
      area: form.area || null,
      responsible_id: form.responsible_id || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      metadata: project?.metadata ?? {},
    };
    const validation = validateProjectInput(input);
    if (!validation.isValid) {
      setFormError(validation.errors[0]);
      return;
    }

    setFormError(null);
    const success = await onSubmit(input);
    if (success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {project ? "Editar contexto operacional" : "Novo projeto"}
            </DialogTitle>
            <DialogDescription>
              Cadastre o contexto usado por documentos, políticas, códigos e
              auditoria.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="project-name">Nome *</Label>
              <Input
                id="project-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex.: Obra Marina Itajaí"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-code">Código</Label>
              <div className="flex gap-2">
                <Input
                  id="project-code"
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      code: normalizeProjectCode(event.target.value),
                    }))
                  }
                  placeholder={suggestedCode || "Código opcional"}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Aplicar código sugerido"
                  disabled={!suggestedCode}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      code: suggestedCode,
                    }))
                  }
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sugestão: {suggestedCode || "informe o nome primeiro"}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={form.project_type}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    project_type: value as ProjectType,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getProjectTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    status: value as ProjectStatus,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {getProjectStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Área</Label>
              <Select
                value={form.area || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    area: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem área específica</SelectItem>
                  {AREAS.map((area) => (
                    <SelectItem key={area} value={area}>
                      {area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="project-description">Descrição</Label>
              <Textarea
                id="project-description"
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
              <Label htmlFor="project-client">Cliente</Label>
              <Input
                id="project-client"
                value={form.client_name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    client_name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-contract">Contrato</Label>
              <Input
                id="project-contract"
                value={form.contract_number}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    contract_number: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-location">Local</Label>
              <Input
                id="project-location"
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    location: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select
                value={form.responsible_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    responsible_id: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-start">Data de início</Label>
              <Input
                id="project-start"
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    start_date: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-end">Data de término</Label>
              <Input
                id="project-end"
                type="date"
                value={form.end_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    end_date: event.target.value,
                  }))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <Checkbox
                checked={form.is_active}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    is_active: checked === true,
                  }))
                }
              />
              Disponível para novos documentos
            </label>

            <div className="rounded-lg border bg-muted/30 p-4 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Prévia operacional
              </p>
              <p className="mt-2 font-semibold">
                <span className="font-mono">{effectiveCode}</span>
                {" · "}
                {form.name || "Nome do projeto"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {getProjectTypeLabel(form.project_type)} ·{" "}
                {getProjectStatusLabel(form.status)}
                {form.client_name ? ` · ${form.client_name}` : ""}
                {form.contract_number ? ` · ${form.contract_number}` : ""}
              </p>
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
              Salvar projeto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
