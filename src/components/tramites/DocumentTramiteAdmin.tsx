import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  FileText,
  Filter,
  GitBranch,
  Layers3,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { useDocuments } from "@/hooks/useDocuments";
import { useDocumentTramiteTemplates } from "@/hooks/useDocumentTramiteTemplates";
import { useLocalData } from "@/hooks/use-local-data";
import { useOperationalCalendar } from "@/hooks/useOperationalCalendar";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { useWorkflowActors } from "@/hooks/useWorkflowActors";
import { DOC_TYPES } from "@/lib/constants";
import { addBusinessDaysLocal } from "@/lib/operationalCalendar";
import {
  createTramiteEdge,
  createTramiteNode,
  generateTramiteCode,
  type DocumentTramiteTemplate,
  type DocumentTramiteTemplateScope,
  type DocumentTramiteTemplateStatus,
} from "@/lib/documentTramiteModel";
import { validateTramiteGraph } from "@/lib/documentTramiteValidation";

const AREAS = ["SGI", "ENG", "OPS", "MNT", "SST", "MA", "QUA", "ADM"];

type ApprovalFlowType = "simple" | "multidisciplinary";

interface ApprovalStageDraft {
  id: string;
  areaLabel: string;
  dueDays: number;
  assignmentType: "user" | "group";
  assigneeId: string;
  assigneeLabel: string;
}

const EMPTY_FORM = {
  documentId: "",
  approvalFlowType: "simple" as ApprovalFlowType,
  stageAreaLabel: "",
  stageDueDays: "",
  stageAssigneeKey: "",
  stages: [] as ApprovalStageDraft[],
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function getRevisionLabel(value: string | null | undefined, revision: number) {
  return value?.trim() || String(revision).padStart(2, "0");
}

function createStageIdentifier() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseStageAssignmentKey(value: string) {
  if (value.startsWith("user:")) {
    return { type: "user" as const, id: value.slice(5) };
  }
  if (value.startsWith("group:")) {
    return { type: "group" as const, id: value.slice(6) };
  }
  return null;
}

function buildApprovalFlowGraph(
  stages: ApprovalStageDraft[],
  flowType: ApprovalFlowType,
) {
  const start = createTramiteNode("start", { x: 80, y: 180 });
  const publication = createTramiteNode("publication", { x: 280, y: 180 }, {
    label: "Publicação",
  });
  const end = createTramiteNode("end", { x: 480, y: 180 });

  const reviewNodes = stages.map((stage, index) =>
    createTramiteNode(
      "review",
      { x: 280 + index * 220, y: 180 },
      {
        label:
          flowType === "multidisciplinary"
            ? `Análise ${stage.areaLabel}`
            : "Análise do documento",
        description: `Etapa ${index + 1} configurada na abertura do fluxo.`,
        assignment_type:
          stage.assignmentType === "group" ? "approval_group" : "specific_user",
        assignee_group_id:
          stage.assignmentType === "group" ? stage.assigneeId : null,
        assignee_user_id:
          stage.assignmentType === "user" ? stage.assigneeId : null,
        due_days: stage.dueDays,
        instructions: `Responsável inicial: ${stage.assigneeLabel}`,
        metadata: {
          configured_area: stage.areaLabel,
          configured_order: index + 1,
        },
      },
    ),
  );

  const nodes = [start, ...reviewNodes, publication, end];
  const edges = [];
  let previousNodeId = start.id;

  for (const node of reviewNodes) {
    edges.push(createTramiteEdge(previousNodeId, node.id));
    previousNodeId = node.id;
  }

  edges.push(createTramiteEdge(previousNodeId, publication.id));
  edges.push(createTramiteEdge(publication.id, end.id));

  return { nodes, edges };
}

export function DocumentTramiteAdmin() {
  const catalog = useDocumentTramiteTemplates();
  const projects = useProjectOptions();
  const documentsState = useDocuments();
  const { disciplines } = useLocalData();
  const actors = useWorkflowActors();
  const operationalCalendar = useOperationalCalendar();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const selectedDocument =
    documentsState.documents.find((document) => document.id === form.documentId) ??
    null;
  const selectedDocumentProject =
    selectedDocument?.project ??
    projects.projects.find((project) => project.id === selectedDocument?.project_id) ??
    null;
  const selectedDiscipline =
    disciplines.find(
      (discipline) => discipline.id === selectedDocument?.discipline_id,
    ) ?? null;
  const totalAnalysisDays = selectedDocument?.analysis_days ?? null;
  const usedAnalysisDays = form.stages.reduce(
    (total, stage) => total + stage.dueDays,
    0,
  );
  const remainingAnalysisDays =
    totalAnalysisDays === null ? null : Math.max(totalAnalysisDays - usedAnalysisDays, 0);
  const stageSummaries = useMemo(() => {
    const receivedAt = selectedDocument?.received_at ?? null;
    if (!receivedAt) {
      return form.stages.map((stage, index) => ({
        ...stage,
        order: index + 1,
        dueDate: null as string | null,
      }));
    }

    let cumulativeDays = 0;
    return form.stages.map((stage, index) => {
      cumulativeDays += stage.dueDays;
      return {
        ...stage,
        order: index + 1,
        dueDate: addBusinessDaysLocal(
          receivedAt,
          cumulativeDays,
          operationalCalendar.defaultCalendar,
          operationalCalendar.holidays,
        ),
      };
    });
  }, [
    form.stages,
    operationalCalendar.defaultCalendar,
    operationalCalendar.holidays,
    selectedDocument?.received_at,
  ]);

  const previewTemplate =
    catalog.templates.find((template) => template.id === selectedId) ?? null;
  const editingTemplate =
    catalog.templates.find((template) => template.id === editingId) ?? null;
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

  const kpiStats = useMemo(() => {
    let totalStages = 0;
    const userIds = new Set<string>();
    const groupIds = new Set<string>();
    for (const template of catalog.templates) {
      const graph = template.current_version?.graph;
      if (!graph) continue;
      for (const node of graph.nodes) {
        if (node.node_type === "start" || node.node_type === "end") continue;
        totalStages += 1;
        if (node.assignee_user_id) userIds.add(node.assignee_user_id);
        if (node.assignee_group_id) groupIds.add(node.assignee_group_id);
      }
    }
    const uniqueActors =
      userIds.size + groupIds.size > 0
        ? userIds.size + groupIds.size
        : actors.users.length + actors.groups.filter((g) => g.is_active).length;
    return {
      totalTemplates: catalog.templates.length,
      published: catalog.templates.filter((t) => t.status === "published").length,
      drafts: catalog.templates.filter((t) => t.status === "draft").length,
      totalStages,
      uniqueActors,
    };
  }, [catalog.templates, actors.users, actors.groups]);

  if (editingTemplate) {
    return (
      <DocumentTramiteModeler
        template={editingTemplate}
        catalog={catalog}
        onBack={() => setEditingId(null)}
      />
    );
  }

  async function createTemplate() {
    if (!form.documentId) {
      toast.error("Selecione um documento para iniciar o fluxo.");
      return;
    }
    if (!selectedDocument) {
      toast.error("O documento selecionado não foi encontrado.");
      return;
    }
    if (form.stages.length === 0) {
      toast.error("Adicione ao menos uma etapa de aprovação.");
      return;
    }
    if (totalAnalysisDays !== null && usedAnalysisDays > totalAnalysisDays) {
      toast.error("A soma das etapas não pode ultrapassar o prazo total do documento.");
      return;
    }
    const flowTypeLabel =
      form.approvalFlowType === "simple" ? "simples" : "multidisciplinar";
    const graph = buildApprovalFlowGraph(form.stages, form.approvalFlowType);
    const name = `Fluxo ${selectedDocument.code ?? "DOC"} - ${selectedDocument.title}`;
    const id = await catalog.createTemplate({
      name,
      code: generateTramiteCode(
        `${selectedDocument.code ?? selectedDocument.title}-${flowTypeLabel}`,
      ),
      description: `Fluxo de aprovação ${flowTypeLabel} vinculado ao documento ${selectedDocument.code ?? selectedDocument.title}.`,
      template_scope: selectedDocument.project_id ? "project" : "area_type",
      doc_type: selectedDocument.doc_type || null,
      area: selectedDocument.area || null,
      project_id: selectedDocument.project_id || null,
      metadata: {
        source_document: selectedDocument
          ? {
              id: selectedDocument.id,
              code: selectedDocument.code,
              title: selectedDocument.title,
              project_id: selectedDocument.project_id,
              project_name: selectedDocumentProject?.name ?? null,
              register_revision: getRevisionLabel(
                selectedDocument.register_revision,
                selectedDocument.revision,
              ),
              register_status: selectedDocument.register_status ?? null,
              discipline_id: selectedDocument.discipline_id ?? null,
              discipline_name: selectedDiscipline?.name ?? null,
              received_at: selectedDocument.received_at ?? null,
              analysis_deadline: selectedDocument.analysis_deadline ?? null,
            }
          : null,
        approval_configuration: {
          flow_type: form.approvalFlowType,
          total_analysis_days: totalAnalysisDays,
          used_analysis_days: usedAnalysisDays,
          remaining_analysis_days:
            totalAnalysisDays === null ? null : totalAnalysisDays - usedAnalysisDays,
          stages: stageSummaries.map((stage) => ({
            order: stage.order,
            area_label: stage.areaLabel,
            due_days: stage.dueDays,
            due_date: stage.dueDate,
            assignment_type: stage.assignmentType,
            assignee_id: stage.assigneeId,
            assignee_label: stage.assigneeLabel,
          })),
        },
      },
      graph,
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
      toast.warning(`${validation.summary} Publicação manual liberada.`);
    }
    if (await catalog.publishTemplate(templateId)) {
      toast.success("Modelo publicado.");
    } else {
      toast.error(catalog.error || "Não foi possível publicar.");
    }
  }

  function handleDocumentChange(documentId: string) {
    setForm((current) => ({
      ...current,
      documentId,
      stageAreaLabel: "",
      stageDueDays: "",
      stageAssigneeKey: "",
      stages: [],
    }));
  }

  function addApprovalStage() {
    if (!selectedDocument) {
      toast.error("Selecione um documento antes de configurar as etapas.");
      return;
    }
    const normalizedArea = form.stageAreaLabel.trim();
    const dueDays = Number.parseInt(form.stageDueDays, 10);
    const assignment = parseStageAssignmentKey(form.stageAssigneeKey);

    if (!normalizedArea) {
      toast.error("Informe o setor ou a area da etapa.");
      return;
    }
    if (Number.isNaN(dueDays) || dueDays <= 0) {
      toast.error("Informe um prazo valido em dias.");
      return;
    }
    if (!assignment) {
      toast.error("Selecione o responsavel ou grupo da etapa.");
      return;
    }
    if (form.approvalFlowType === "simple" && form.stages.length >= 1) {
      toast.error("Fluxos simples aceitam apenas uma etapa inicial.");
      return;
    }
    if (totalAnalysisDays !== null) {
      if (dueDays > totalAnalysisDays) {
        toast.error("O prazo da etapa nao pode ser maior que o prazo total do documento.");
        return;
      }
      if (usedAnalysisDays + dueDays > totalAnalysisDays) {
        toast.error("A soma das etapas ultrapassa o prazo total de analise do documento.");
        return;
      }
    }

    const assigneeLabel =
      assignment.type === "group"
        ? actors.groups.find((group) => group.id === assignment.id)?.name
        : actors.users.find((user) => user.id === assignment.id)?.full_name;

    if (!assigneeLabel) {
      toast.error("Nao foi possivel identificar o responsavel selecionado.");
      return;
    }

    setForm((current) => ({
      ...current,
      stages: [
        ...current.stages,
        {
          id: createStageIdentifier(),
          areaLabel: normalizedArea,
          dueDays,
          assignmentType: assignment.type,
          assigneeId: assignment.id,
          assigneeLabel,
        },
      ],
      stageAreaLabel: current.approvalFlowType === "simple" ? normalizedArea : "",
      stageDueDays: "",
      stageAssigneeKey: "",
    }));
  }

  function removeApprovalStage(stageId: string) {
    setForm((current) => ({
      ...current,
      stages: current.stages.filter((stage) => stage.id !== stageId),
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <Badge variant="outline" className="mb-3 bg-slate-50 text-slate-600 border-slate-200">
            Governança de trâmites
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Fluxo de aprovação
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Modele o caminho que um documento percorre até estar válido.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={catalog.isLoading}
            onClick={() => void catalog.refresh()}
            className="border-slate-200 text-slate-700 hover:bg-slate-50"
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
            className="text-white shadow-sm"
            style={{
              backgroundImage:
              "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
            }}
          >
            <Plus className="h-4 w-4" />
            Novo trâmite
          </Button>
        </div>
      </div>

      <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid md:grid-cols-3 md:divide-x md:divide-slate-200">
        <div className="flex gap-3 p-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Layers3 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-slate-900">Modelo versionado</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Rascunhos podem evoluir sem alterar modelos já publicados.
            </p>
          </div>
        </div>
        <div className="flex gap-3 p-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-slate-900">Caminho documental</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Responsáveis, prazos, evidências, correções e publicação.
            </p>
          </div>
        </div>
        <div className="flex gap-3 p-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-slate-900">Execução segura</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Esta fase modela e simula; não cria tarefas reais.
            </p>
          </div>
        </div>
      </div>

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Modelos</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
                {kpiStats.totalTemplates}
              </p>
            </div>
          </div>
          <p className="mt-2 pl-14 text-xs text-slate-500">Total de modelos</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Publicados</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
                {kpiStats.published}
              </p>
            </div>
          </div>
          <p className="mt-2 pl-14 text-xs text-slate-500">Em produção</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Pencil className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Rascunhos</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
                {kpiStats.drafts}
              </p>
            </div>
          </div>
          <p className="mt-2 pl-14 text-xs text-slate-500">Em edição</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Etapas</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
                {kpiStats.totalStages}
              </p>
            </div>
          </div>
          <p className="mt-2 pl-14 text-xs text-slate-500">Total de etapas</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2 lg:col-span-1 xl:col-span-1">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-600">
              <Users2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Responsáveis</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
                {kpiStats.uniqueActors}
              </p>
            </div>
          </div>
          <p className="mt-2 pl-14 text-xs text-slate-500">Usuários e grupos</p>
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, código ou descrição..."
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as typeof status)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
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
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Escopo" />
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
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {DOC_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Áreas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {AREAS.map((area) => (
              <SelectItem key={area} value={area}>{area}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Projetos" />
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
        <Button
          type="button"
          variant="outline"
          className="border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <Filter className="h-4 w-4" />
          Filtros
        </Button>
      </div>

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
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-4 lg:col-span-2 md:grid-cols-2">
            {filtered.map((template) => {
              const isSelected = selectedId === template.id;
              return (
                <div
                  key={template.id}
                  className={cn(
                    "w-full",
                    isSelected && "md:col-span-2 col-span-full",
                  )}
                >
                  <DocumentTramiteTemplateCard
                    template={template}
                    selectedId={selectedId}
                    onSelect={() => setSelectedId(template.id)}
                    onEdit={() => setEditingId(template.id)}
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
                </div>
              );
            })}
          </div>

          <aside className="lg:col-span-1">
            <div className="sticky top-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Preview do fluxo
                </h2>
                {!previewTemplate && (
                  <p className="mt-1 text-sm text-slate-500">
                    Selecione um modelo para visualizar os detalhes.
                  </p>
                )}
              </div>

              {previewTemplate ? (
                <FlowPreview template={previewTemplate} />
              ) : (
                <EmptyFlowPreview />
              )}

              {previewTemplate && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2 border-slate-200 text-slate-700 hover:bg-slate-50"
                  onClick={() => setEditingId(previewTemplate.id)}
                >
                  <Eye className="h-4 w-4" />
                  Ver detalhes do fluxo
                </Button>
              )}
            </div>
          </aside>
        </div>
      )}

      <Dialog
        open={newOpen}
        onOpenChange={(open) => {
          setNewOpen(open);
          if (!open) setForm(EMPTY_FORM);
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo fluxo de aprovação</DialogTitle>
            <DialogDescription>
              Selecione um documento cadastrado para iniciar o fluxo e usar seus
              dados como base.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Documento cadastrado *</Label>
              <Select
                value={form.documentId || "none"}
                onValueChange={(value) =>
                  handleDocumentChange(value === "none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      documentsState.loading
                        ? "Carregando documentos..."
                        : "Selecione um documento"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione um documento</SelectItem>
                  {documentsState.documents.map((document) => (
                    <SelectItem key={document.id} value={document.id}>
                      {(document.code ?? "Sem código") + " - " + document.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {documentsState.error && (
                <p className="text-xs text-destructive">
                  {documentsState.error}
                </p>
              )}
            </div>
            {selectedDocument && (
              <Card className="border-primary/40 shadow-sm md:col-span-2">
                <CardContent className="space-y-5 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-[280px] rounded-lg border bg-muted/20 px-4 py-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Código
                          </p>
                          <p className="font-medium">
                            {selectedDocument.code ?? "Gerando..."}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Revisão
                          </p>
                          <p className="font-medium">
                            {getRevisionLabel(
                              selectedDocument.register_revision,
                              selectedDocument.revision,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Status
                          </p>
                          <div className="pt-1">
                            <Badge
                              variant="secondary"
                              className="bg-amber-100 text-amber-900 hover:bg-amber-100"
                            >
                              {selectedDocument.register_status || "—"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Projeto
                      </p>
                      <p className="font-medium">
                        {selectedDocumentProject?.name || "Sem projeto"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Título
                      </p>
                      <p className="font-medium">{selectedDocument.title}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Disciplina
                      </p>
                      <p className="font-medium">
                        {selectedDiscipline?.name || "Sem disciplina"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Data de recebimento
                      </p>
                      <p className="font-medium">
                        {formatDate(selectedDocument.received_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Prazo de análise
                      </p>
                      <p className="font-medium">
                        {formatDate(selectedDocument.analysis_deadline)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Dias para análise
                      </p>
                      <p className="font-medium">
                        {selectedDocument.analysis_days ?? "Não definido"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Tipo e área
                      </p>
                      <p className="font-medium">
                        {selectedDocument.doc_type} · {selectedDocument.area}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {selectedDocument && (
              <Card className="md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Configuração do Fluxo de Aprovação
                  </CardTitle>
                  <CardDescription>
                    Defina o tipo de fluxo e as etapas iniciais de análise antes
                    de abrir o modelador.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Tipo de fluxo</Label>
                      <Select
                        value={form.approvalFlowType}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            approvalFlowType: value as ApprovalFlowType,
                            stages:
                              value === "simple"
                                ? current.stages.slice(0, 1)
                                : current.stages,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simple">Simples</SelectItem>
                          <SelectItem value="multidisciplinary">
                            Multidisciplinar
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Prazo total do documento</Label>
                      <Input
                        value={
                          totalAnalysisDays === null
                            ? "Não definido"
                            : `${totalAnalysisDays} dia(s)`
                        }
                        readOnly
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Saldo disponível</Label>
                      <Input
                        value={
                          remainingAnalysisDays === null
                            ? "Sem limite"
                            : `${remainingAnalysisDays} dia(s)`
                        }
                        readOnly
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-12">
                    <div className="space-y-2 md:col-span-4">
                      <Label htmlFor="approval-stage-area">Setor / Área</Label>
                      <Input
                        id="approval-stage-area"
                        value={form.stageAreaLabel}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            stageAreaLabel: event.target.value,
                          }))
                        }
                        placeholder="Ex.: Infraestrutura"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <Label htmlFor="approval-stage-days">Prazo (dias)</Label>
                      <Input
                        id="approval-stage-days"
                        type="number"
                        min="1"
                        max={totalAnalysisDays ?? undefined}
                        value={form.stageDueDays}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            stageDueDays: event.target.value,
                          }))
                        }
                        placeholder="5"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-5">
                      <Label>Responsável ou grupo</Label>
                      <Select
                        value={form.stageAssigneeKey || "none"}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            stageAssigneeKey: value === "none" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o responsável" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            Selecione o responsável
                          </SelectItem>
                          {actors.users.length > 0 && (
                            <>
                              {actors.users.map((user) => (
                                <SelectItem
                                  key={`user-${user.id}`}
                                  value={`user:${user.id}`}
                                >
                                  {user.full_name}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          {actors.canUseGroups &&
                            actors.groups
                              .filter((group) => group.is_active)
                              .map((group) => (
                                <SelectItem
                                  key={`group-${group.id}`}
                                  value={`group:${group.id}`}
                                >
                                  Grupo: {group.name}
                                </SelectItem>
                              ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <div className="text-sm text-muted-foreground">
                      {totalAnalysisDays === null
                        ? "O documento ainda não tem um prazo total configurado."
                        : `Etapas configuradas: ${usedAnalysisDays} de ${totalAnalysisDays} dia(s).`}
                    </div>
                    <Button type="button" onClick={addApprovalStage}>
                      <Plus className="h-4 w-4" />
                      Adicionar Etapa
                    </Button>
                  </div>

                  {actors.error && (
                    <p className="text-xs text-destructive">{actors.error}</p>
                  )}

                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-left">
                        <tr className="border-b">
                          <th className="px-3 py-2 font-medium">Nº</th>
                          <th className="px-3 py-2 font-medium">Setor / Área</th>
                          <th className="px-3 py-2 font-medium">Responsável</th>
                          <th className="px-3 py-2 font-medium">Prazo</th>
                          <th className="px-3 py-2 font-medium">Data limite</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium text-right">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {stageSummaries.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-3 py-6 text-center text-muted-foreground"
                            >
                              Nenhuma etapa cadastrada.
                            </td>
                          </tr>
                        ) : (
                          stageSummaries.map((stage) => (
                            <tr key={stage.id} className="border-b last:border-b-0">
                              <td className="px-3 py-3">{stage.order}</td>
                              <td className="px-3 py-3">{stage.areaLabel}</td>
                              <td className="px-3 py-3">{stage.assigneeLabel}</td>
                              <td className="px-3 py-3">{stage.dueDays} dia(s)</td>
                              <td className="px-3 py-3">
                                {formatDate(stage.dueDate)}
                              </td>
                              <td className="px-3 py-3">
                                <Badge variant="secondary">Planejada</Badge>
                              </td>
                              <td className="px-3 py-3 text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeApprovalStage(stage.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
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
              disabled={!form.documentId || catalog.isSaving}
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

function EmptyFlowPreview() {
  const demoSteps = [
    { label: "Recebimento", responsible: "Área solicitante", color: "bg-sky-500", ring: "ring-sky-200" },
    { label: "Análise", responsible: "Engenharia", color: "bg-teal-500", ring: "ring-teal-200" },
    { label: "Revisão", responsible: "Coordenação", color: "bg-emerald-500", ring: "ring-emerald-200" },
    { label: "Aprovação", responsible: "Gerência", color: "bg-blue-600", ring: "ring-blue-200" },
    { label: "Publicação", responsible: "Document Control", color: "bg-indigo-500", ring: "ring-indigo-200" },
  ];
  return (
    <ol className="relative ml-2 space-y-4 border-l border-slate-200 pl-6">
      {demoSteps.map((step, index) => (
        <li key={step.label} className="relative">
          <span
            className={cn(
              "absolute -left-[34px] flex h-8 w-8 items-center justify-center rounded-full ring-4",
              step.color,
              step.ring,
              index === 0 ? "bg-sky-600" : ""
            )}
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 hover:bg-slate-50 transition-colors">
            <p className="text-sm font-medium text-slate-900">{step.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Responsável: {step.responsible}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function FlowPreview({
  template,
}: {
  template: DocumentTramiteTemplate;
}) {
  const nodes = template.current_version?.graph.nodes ?? [];
  const steps = nodes.filter(
    (node) => node.node_type !== "start" && node.node_type !== "end",
  );
  if (steps.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
        Este modelo ainda não tem etapas configuradas.
      </p>
    );
  }
  const palette = [
    { color: "bg-sky-600", ring: "ring-sky-200" },
    { color: "bg-teal-600", ring: "ring-teal-200" },
    { color: "bg-emerald-600", ring: "ring-emerald-200" },
    { color: "bg-blue-600", ring: "ring-blue-200" },
    { color: "bg-indigo-600", ring: "ring-indigo-200" },
    { color: "bg-violet-600", ring: "ring-violet-200" },
  ];
  return (
    <ol className="relative ml-2 space-y-4 border-l border-slate-200 pl-6">
      {steps.map((node, index) => {
        const style = palette[index % palette.length];
        const responsible = node.instructions?.trim() ||
          (node.assignee_user_id
            ? "Usuário específico"
            : node.assignee_group_id
              ? "Grupo de aprovação"
              : node.required_role
                ? `Papel: ${node.required_role}`
                : "Não atribuído");
        return (
          <li key={node.id} className="relative">
            <span
              className={cn(
                "absolute -left-[34px] flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-offset-0",
                style.color,
                style.ring,
              )}
            />
            <div className="rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors">
              <p className="text-sm font-medium text-slate-900">{node.label}</p>
              <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                Responsável: {responsible}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
