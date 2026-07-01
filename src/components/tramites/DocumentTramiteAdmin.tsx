import { useMemo, useState } from "react";
import {
  GitBranch,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentTramiteModeler } from "@/components/tramites/DocumentTramiteModeler";
import { DocumentTramiteTemplateCard } from "@/components/tramites/DocumentTramiteTemplateCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useDocumentTramiteTemplates } from "@/hooks/useDocumentTramiteTemplates";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { DOC_TYPES } from "@/lib/constants";
import {
  generateTramiteCode,
  type DocumentTramiteTemplateScope,
  type DocumentTramiteTemplateStatus,
} from "@/lib/documentTramiteModel";
import {
  DOCUMENT_TRAMITE_PRESETS,
  getDocumentTramitePreset,
} from "@/lib/documentTramitePresets";
import { validateTramiteGraph } from "@/lib/documentTramiteValidation";

const AREAS = ["SGI", "ENG", "OPS", "MNT", "SST", "MA", "QUA", "ADM"];

const EMPTY_FORM = {
  name: "",
  code: "",
  description: "",
  presetId: "technical-review",
  scope: "organization" as DocumentTramiteTemplateScope,
  docType: "",
  area: "",
  projectId: "",
};

export function DocumentTramiteAdmin() {
  const catalog = useDocumentTramiteTemplates();
  const projects = useProjectOptions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | DocumentTramiteTemplateStatus>(
    "all",
  );
  const [scope, setScope] = useState<"all" | DocumentTramiteTemplateScope>(
    "all",
  );
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");

  const selectedTemplate =
    catalog.templates.find((template) => template.id === selectedId) ?? null;
  const filtered = useMemo(
    () =>
      catalog.templates.filter((template) => {
        if (status !== "all" && template.status !== status) return false;
        if (scope !== "all" && template.template_scope !== scope) return false;
        if (docTypeFilter !== "all" && template.doc_type !== docTypeFilter) {
          return false;
        }
        if (areaFilter !== "all" && template.area !== areaFilter) return false;
        if (projectFilter !== "all" && template.project_id !== projectFilter) {
          return false;
        }
        const search =
          `${template.name} ${template.code} ${template.description ?? ""}`.toLowerCase();
        return search.includes(query.trim().toLowerCase());
      }),
    [
      areaFilter,
      catalog.templates,
      docTypeFilter,
      projectFilter,
      query,
      scope,
      status,
    ],
  );

  if (selectedTemplate) {
    return (
      <DocumentTramiteModeler
        template={selectedTemplate}
        catalog={catalog}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  async function createTemplate() {
    const preset = getDocumentTramitePreset(form.presetId);
    if (!form.name.trim() || !preset) {
      toast.error("Informe o nome e escolha um ponto de partida.");
      return;
    }
    const id = await catalog.createTemplate({
      name: form.name,
      code: form.code || generateTramiteCode(form.name),
      description: form.description,
      template_scope: form.scope,
      doc_type: form.docType || null,
      area: form.area || null,
      project_id: form.projectId || null,
      graph: structuredClone(preset.graph),
    });
    if (id) {
      toast.success("Trâmite criado como rascunho.");
      setForm(EMPTY_FORM);
      setNewOpen(false);
      setSelectedId(id);
    } else {
      toast.error(catalog.error || "Não foi possível criar o trâmite.");
    }
  }

  async function publishFromCard(templateId: string) {
    const template = catalog.templates.find((item) => item.id === templateId);
    const validation = validateTramiteGraph(
      template?.current_version?.graph ?? { nodes: [], edges: [] },
    );
    if (!validation.isPublishable) {
      toast.error(validation.summary);
      setSelectedId(templateId);
      return;
    }
    if (await catalog.publishTemplate(templateId)) {
      toast.success("Modelo publicado.");
    } else {
      toast.error(catalog.error || "Não foi possível publicar.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Badge variant="outline" className="mb-3">
            Governança de trâmites
          </Badge>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3">
              <GitBranch className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Trâmites Documentais
              </h1>
              <p className="mt-1 max-w-3xl text-muted-foreground">
                Modele o caminho que um documento percorre até estar válido.
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={catalog.isLoading}
            onClick={() => void catalog.refresh()}
          >
            <RefreshCw
              className={`h-4 w-4 ${catalog.isLoading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
          <Button
            type="button"
            onClick={() => setNewOpen(true)}
            disabled={
              !catalog.canManage ||
              !["ready", "empty"].includes(catalog.schemaStatus)
            }
          >
            <Plus className="h-4 w-4" />
            Novo trâmite
          </Button>
        </div>
      </div>

      <Card className="border-primary/15 bg-primary/[0.025]">
        <CardContent className="grid gap-4 p-5 md:grid-cols-3">
          <div className="flex gap-3">
            <Layers3 className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Modelo versionado</p>
              <p className="text-sm text-muted-foreground">
                Rascunhos podem evoluir sem alterar modelos já publicados.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <GitBranch className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Caminho documental</p>
              <p className="text-sm text-muted-foreground">
                Responsáveis, prazos, evidências, correções e publicação.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Execução segura</p>
              <p className="text-sm text-muted-foreground">
                Esta fase modela e simula; não cria tarefas reais.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!["ready", "empty"].includes(catalog.schemaStatus) && (
        <Alert
          variant={
            catalog.schemaStatus === "restricted" ||
            catalog.schemaStatus === "error"
              ? "destructive"
              : "default"
          }
        >
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>
            {catalog.schemaStatus === "not_installed"
              ? "Ciclo P-12 não instalado"
              : catalog.schemaStatus === "partial"
                ? "Schema P-12 parcial"
                : "Modelador indisponível"}
          </AlertTitle>
          <AlertDescription>
            {catalog.error ||
              "Aplique a migration P-12 manualmente e atualize a página."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Modelos", catalog.templates.length],
          [
            "Publicados",
            catalog.templates.filter((item) => item.status === "published")
              .length,
          ],
          [
            "Rascunhos",
            catalog.templates.filter((item) => item.status === "draft").length,
          ],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
          <Input
            className="md:col-span-2 xl:col-span-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, código ou descrição"
          />
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as typeof status)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="draft">Rascunhos</SelectItem>
              <SelectItem value="published">Publicados</SelectItem>
              <SelectItem value="archived">Arquivados</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={scope}
            onValueChange={(value) => setScope(value as typeof scope)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os escopos</SelectItem>
              <SelectItem value="organization">Organização</SelectItem>
              <SelectItem value="project">Projeto</SelectItem>
              <SelectItem value="area">Área</SelectItem>
              <SelectItem value="type">Tipo</SelectItem>
              <SelectItem value="area_type">Área + tipo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {DOC_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Área" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as áreas</SelectItem>
              {AREAS.map((area) => (
                <SelectItem key={area} value={area}>
                  {area}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {projects.projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {catalog.isLoading ? (
        <Card>
          <CardContent className="flex min-h-56 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando modelos…
          </CardContent>
        </Card>
      ) : catalog.schemaStatus === "empty" ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum trâmite modelado</CardTitle>
            <CardDescription>
              Comece com um preset e ajuste responsáveis, prazos, evidências e
              caminhos no canvas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              Criar primeiro trâmite
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum modelo encontrado para os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((template) => (
            <DocumentTramiteTemplateCard
              key={template.id}
              template={template}
              onEdit={() => setSelectedId(template.id)}
              onDuplicate={() =>
                void catalog.duplicateTemplate(template).then((id) => {
                  if (id) toast.success("Modelo duplicado como rascunho.");
                })
              }
              onPublish={() => void publishFromCard(template.id)}
              onArchive={() =>
                void catalog.archiveTemplate(template.id).then((success) => {
                  if (success) toast.success("Modelo arquivado.");
                })
              }
            />
          ))}
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo trâmite documental</DialogTitle>
            <DialogDescription>
              Escolha um ponto de partida. O modelo nasce como rascunho e não
              executa ações em documentos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tramite-name">Nome *</Label>
              <Input
                id="tramite-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                    code:
                      current.code === generateTramiteCode(current.name)
                        ? generateTramiteCode(event.target.value)
                        : current.code,
                  }))
                }
                placeholder="Ex.: Revisão técnica padrão"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tramite-code">Código</Label>
              <Input
                id="tramite-code"
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: generateTramiteCode(event.target.value),
                  }))
                }
                placeholder={generateTramiteCode(form.name)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tramite-description">Descrição</Label>
              <Textarea
                id="tramite-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Explique quando este modelo deve ser usado."
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Ponto de partida</Label>
              <div className="grid gap-2 md:grid-cols-2">
                {DOCUMENT_TRAMITE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      form.presetId === preset.id
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50"
                    }`}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        presetId: preset.id,
                      }))
                    }
                  >
                    <span className="block text-sm font-medium">
                      {preset.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {preset.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Escopo</Label>
              <Select
                value={form.scope}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    scope: value as DocumentTramiteTemplateScope,
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
                  <SelectItem value="type">Tipo</SelectItem>
                  <SelectItem value="area_type">Área + tipo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Projeto opcional</Label>
              <Select
                value={form.projectId || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    projectId: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Qualquer projeto</SelectItem>
                  {projects.projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.code} — {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo documental</Label>
              <Select
                value={form.docType || "any"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    docType: value === "any" ? "" : value,
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
                    <SelectItem key={area} value={area}>
                      {area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!form.name.trim() || catalog.isSaving}
              onClick={() => void createTemplate()}
            >
              {catalog.isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
