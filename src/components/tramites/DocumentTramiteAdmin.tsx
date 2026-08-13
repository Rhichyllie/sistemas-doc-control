import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Eye,
  Filter,
  GitBranch,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { DocumentTramiteModeler } from "@/components/tramites/DocumentTramiteModeler";
import { TramiteCancelDialog } from "@/components/tramite-execution/TramiteCancelDialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDocuments, type Document } from "@/hooks/useDocuments";
import { useDocumentTramiteInstances } from "@/hooks/useDocumentTramiteInstances";
import { useDocumentTramiteTemplates } from "@/hooks/useDocumentTramiteTemplates";
import { useApprovalFlow } from "@/hooks/useApprovalFlow";
import { useDocumentTramiteExecution } from "@/hooks/useDocumentTramiteExecution";
import { useLocalData } from "@/hooks/use-local-data";
import { useNotifications } from "@/hooks/useNotifications";
import { useOperationalCalendar } from "@/hooks/useOperationalCalendar";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { useTeamAvailability } from "@/hooks/useTeamAvailability";
import { useWorkflowActors } from "@/hooks/useWorkflowActors";
import { DOC_TYPES } from "@/lib/constants";
import type {
  DocumentTramiteAssignmentType,
  DocumentTramiteNode,
  DocumentTramiteNodeType,
} from "@/lib/documentTramiteModel";
import {
  getStepDecisionOptions,
  stripTramiteUuid,
  type DocumentTramiteInstanceStep,
} from "@/lib/documentTramiteExecution";
import { addBusinessDaysLocal } from "@/lib/operationalCalendar";
import {
  createEmptyTramiteGraph,
  createTramiteEdge,
  createTramiteNode,
  generateTramiteCode,
  type DocumentTramiteTemplate,
  type DocumentTramiteTemplateStatus,
} from "@/lib/documentTramiteModel";

const AREAS = ["SGI", "ENG", "OPS", "MNT", "SST", "MA", "QUA", "ADM"];

type ApprovalFlowType = "simple" | "multidisciplinary";
type FlowCreationMode = "manual" | "template";
type ProcessStateFilter =
  | "all"
  | "active"
  | "my_action"
  | "waiting_others"
  | "completed"
  | "cancelled";
type ProcessOwnershipFilter = "all" | "mine" | "others";

interface ApprovalStageDraft {
  id: string;
  areaLabel: string;
  dueDays: number;
  assignmentType: "user" | "group";
  assigneeId: string;
  assigneeLabel: string;
}

interface ProcessRow {
  id: string;
  rowType: "instance" | "template";
  instanceId: string | null;
  templateId: string | null;
  documentId: string;
  documentCode: string | null;
  documentTitle: string;
  templateName: string;
  projectName: string;
  projectId: string | null;
  docType: string | null;
  area: string | null;
  currentStepId: string | null;
  currentStepNodeType: DocumentTramiteNodeType | null;
  currentStepAssignmentType: DocumentTramiteAssignmentType | null;
  currentStepLabel: string;
  responsibleName: string;
  statusBucket: Exclude<ProcessStateFilter, "all">;
  statusLabel: string;
  isMine: boolean;
  canDelegate: boolean;
  progress: number;
  totalSteps: number;
  completedSteps: number;
  dueAt: string | null;
  startedAt: string;
}

interface ProcessStepItem {
  id: string;
  label: string;
  description: string | null;
  responsibleName: string;
  statusLabel: string;
  dueAt: string | null;
  completedAt: string | null;
  decisionLabel: string | null;
}

interface SelectedProcessDetail {
  row: ProcessRow;
  documentSummary: PreviewDocumentSummary | null;
  completedSteps: ProcessStepItem[];
  upcomingSteps: ProcessStepItem[];
  flowSteps: ProcessStepItem[];
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getProcessStatusMeta(status: ProcessRow["statusBucket"]) {
  switch (status) {
    case "active":
      return {
        label: "Em andamento",
        badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
        accentClass: "bg-sky-500",
      };
    case "my_action":
      return {
        label: "Aguardando minha ação",
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        accentClass: "bg-amber-500",
      };
    case "waiting_others":
      return {
        label: "Aguardando outros",
        badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
        accentClass: "bg-violet-500",
      };
    case "completed":
      return {
        label: "Concluído",
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        accentClass: "bg-emerald-500",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
        accentClass: "bg-rose-500",
      };
  }
}

function getTemplateStatusLabel(status: DocumentTramiteTemplateStatus) {
  switch (status) {
    case "draft":
      return "Rascunho";
    case "published":
      return "Publicado";
    case "archived":
      return "Arquivado";
  }
}

function getDecisionLabel(value: string | null | undefined) {
  switch (value) {
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Rejeitado";
    case "needs_correction":
      return "Correção solicitada";
    case "completed":
      return "Concluída";
    case "acknowledged":
      return "Ciência registrada";
    case "attached":
      return "Evidência anexada";
    case "skipped":
      return "Ignorada";
    default:
      return null;
  }
}

function getExecutionStepStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "Em andamento";
    case "pending":
      return "Aguardando";
    case "completed":
      return "Concluída";
    case "skipped":
      return "Ignorada";
    case "blocked":
      return "Bloqueada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

function resolveFlowResponsibleName(
  node: {
    assignment_type?: string | null;
    assignee_user_id?: string | null;
    assignee_group_id?: string | null;
    required_role?: string | null;
    instructions?: string | null;
    metadata?: Record<string, unknown>;
  },
  usersById: Map<string, string>,
  groupsById: Map<string, string>,
  authorName?: string | null,
) {
  if (node.assignment_type === "specific_user") {
    const rawUserIds = node.metadata?.assignee_user_ids;
    const analystIds = Array.isArray(rawUserIds)
      ? rawUserIds.filter((value): value is string => typeof value === "string")
      : [];
    if (analystIds.length > 1) {
      return analystIds
        .map((id) => usersById.get(id) ?? "Analista")
        .join(", ");
    }
    return usersById.get(node.assignee_user_id ?? "") ?? "Usuário atribuído";
  }
  if (node.assignment_type === "approval_group") {
    return groupsById.get(node.assignee_group_id ?? "") ?? "Grupo atribuído";
  }
  if (node.assignment_type === "role") {
    return `Papel: ${node.required_role ?? "workflow"}`;
  }
  if (
    node.assignment_type === "author" ||
    node.assignment_type === "document_owner"
  ) {
    return authorName ?? "Autor do documento";
  }
  if (node.instructions?.trim()) {
    return node.instructions.trim();
  }
  return "Aguardando definição";
}

function sortFlowNodes<T extends { position?: { x: number; y: number } | null }>(
  nodes: T[],
) {
  return [...nodes].sort((left, right) => {
    const xDiff = (left.position?.x ?? 0) - (right.position?.x ?? 0);
    if (xDiff !== 0) return xDiff;
    return (left.position?.y ?? 0) - (right.position?.y ?? 0);
  });
}

interface PreviewDocumentSummary {
  id: string;
  title: string;
  code: string | null;
  project_id: string | null;
  project_name: string | null;
  discipline_id: string | null;
  discipline_name: string | null;
  register_revision: string | null;
  register_status: string | null;
  received_at: string | null;
  analysis_deadline: string | null;
  analysis_days: number | null;
  doc_type: string | null;
  area: string | null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readMetadataString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const field = value[key];
  return typeof field === "string" && field.trim().length > 0 ? field : null;
}

function mapDocumentToPreviewSummary(
  document: Document,
  disciplines: Array<{ id: string; name: string }>,
  projects: Array<{ id: string; name: string }>,
): PreviewDocumentSummary {
  return {
    id: document.id,
    title: document.title,
    code: document.code,
    project_id: document.project_id ?? null,
    project_name:
      document.project?.name ??
      projects.find((project) => project.id === document.project_id)?.name ??
      null,
    discipline_id: document.discipline_id ?? null,
    discipline_name:
      disciplines.find((discipline) => discipline.id === document.discipline_id)
        ?.name ?? null,
    register_revision: getRevisionLabel(
      document.register_revision,
      document.revision,
    ),
    register_status: document.register_status ?? document.status ?? null,
    received_at: document.received_at ?? null,
    analysis_deadline: document.analysis_deadline ?? null,
    analysis_days: document.analysis_days ?? null,
    doc_type: document.doc_type ?? null,
    area: document.area ?? null,
  };
}

function getSourceDocumentSummary(
  template: DocumentTramiteTemplate,
  documents: Document[],
  disciplines: Array<{ id: string; name: string }>,
  projects: Array<{ id: string; name: string }>,
): PreviewDocumentSummary | null {
  if (!isObjectRecord(template.metadata)) return null;
  const source = template.metadata.source_document;
  if (!isObjectRecord(source)) return null;

  const sourceId = readMetadataString(source, "id");
  const sourceCode = readMetadataString(source, "code");
  const sourceTitle = readMetadataString(source, "title");

  let liveDocument: Document | null = null;
  const sourceIdClean = stripTramiteUuid(sourceId);
  if (sourceIdClean) {
    liveDocument = documents.find((document) => document.id === sourceIdClean) ?? null;
  }
  if (!liveDocument && sourceCode) {
    const normalizedCode = String(sourceCode).trim().toUpperCase();
    liveDocument = documents.find(
      (document) => String(document.code ?? "").trim().toUpperCase() === normalizedCode,
    ) ?? null;
  }
  if (!liveDocument && sourceTitle) {
    const normalizedTitle = String(sourceTitle).trim().toLowerCase();
    liveDocument = documents.find(
      (document) => String(document.title ?? "").trim().toLowerCase() === normalizedTitle,
    ) ?? null;
  }
  if (liveDocument) {
    return mapDocumentToPreviewSummary(liveDocument, disciplines, projects);
  }
  return null;
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
  const publication = createTramiteNode(
    "publication",
    { x: 260 + stages.length * 360, y: 160 },
    {
      label: "Publicação",
      description:
        "Disponibiliza o documento somente após todas as decisões aprovadas.",
    },
  );
  const end = createTramiteNode(
    "end",
    { x: 460 + stages.length * 360, y: 160 },
    {
      description: "Encerra o fluxo, com ou sem publicação, conforme a decisão.",
    },
  );
  const nodes = [start];
  const edges = [];
  let previousNodeId = start.id;

  stages.forEach((stage, index) => {
    const stageBaseX = 260 + index * 360;
    const reviewNode = createTramiteNode(
      "review",
      { x: stageBaseX, y: 160 },
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
        instructions: `Análise técnica por ${stage.assigneeLabel}.`,
        metadata: {
          configured_area: stage.areaLabel,
          configured_order: index + 1,
          assignee_user_ids:
            stage.assignmentType === "user" ? [stage.assigneeId] : [],
        },
      },
    );
    const decisionNode = createTramiteNode(
      "decision",
      { x: stageBaseX + 170, y: 160 },
      {
        label:
          flowType === "multidisciplinary"
            ? `Decisão ${stage.areaLabel}`
            : "Decisão da análise",
        description:
          "Aprovado segue para a próxima revisão técnica ou publicação. Reprovado encerra o fluxo sem publicar. Necessita correção encerra o fluxo para o autor emitir nova revisão.",
        instructions:
          "Defina se o documento foi aprovado para seguir no fluxo, reprovado para encerramento sem publicação, ou se necessita correção do autor. Comentário obrigatório em qualquer decisão.",
        // Exige comentário em toda decisão tomada aqui — é o que garante,
        // no banco, que "necessita correção" sempre venha acompanhada do
        // que precisa ser ajustado (o RPC bloqueia sem isso quando
        // require_comment é true).
        require_comment: true,
        metadata: {
          configured_area: stage.areaLabel,
          configured_order: index + 1,
          decision_for_stage: reviewNode.id,
          approved_outcome:
            index === stages.length - 1
              ? "seguir para publicação"
              : "seguir para análise de revisão técnica",
          rejected_outcome: "encerrar fluxo sem publicação",
          needs_correction_outcome: "encerrar fluxo para o autor emitir nova revisão",
        },
      },
    );

    nodes.push(reviewNode, decisionNode);
    edges.push(
      createTramiteEdge(
        previousNodeId,
        reviewNode.id,
        previousNodeId === start.id ? "always" : "approved",
        previousNodeId === start.id ? {} : { priority: 5 },
      ),
    );
    edges.push(createTramiteEdge(reviewNode.id, decisionNode.id));
    edges.push(
      createTramiteEdge(decisionNode.id, end.id, "rejected", {
        priority: 10,
      }),
    );
    // CORREÇÃO: faltava o caminho de saída para "needs_correction" — sem
    // ele, qualquer decisão de "necessita correção" tomada aqui derruba a
    // instância inteira com status "failed" (0 edges aplicáveis), do
    // mesmo jeito que aconteceu nos modelos antigos corrigidos manualmente.
    edges.push(
      createTramiteEdge(decisionNode.id, end.id, "needs_correction", {
        priority: 7,
      }),
    );
    previousNodeId = decisionNode.id;
  });

  nodes.push(publication, end);
  edges.push(
    createTramiteEdge(previousNodeId, publication.id, "approved", {
      priority: 5,
    }),
  );
  edges.push(createTramiteEdge(publication.id, end.id));

  return { nodes, edges };
}

export function DocumentTramiteAdmin() {
  const { profile } = useAuthContext();
  const catalog = useDocumentTramiteTemplates();
  const projects = useProjectOptions();
  const documentsState = useDocuments();
  const executions = useDocumentTramiteInstances({
    loadAllSteps: true,
    recentLimit: 500,
  });
  const { disciplines } = useLocalData();
  const actors = useWorkflowActors();
  const operationalCalendar = useOperationalCalendar();
  const availabilityState = useTeamAvailability();
  const notificationState = useNotifications();
  const { actOnStep, loading: approvalActionLoading } = useApprovalFlow();
  const execution = useDocumentTramiteExecution(executions.refresh);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [creationMode, setCreationMode] = useState<FlowCreationMode>("manual");
  const [selectedSourceTemplateId, setSelectedSourceTemplateId] = useState("");
  const [newModelOpen, setNewModelOpen] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelDescription, setNewModelDescription] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [processStateFilter, setProcessStateFilter] =
    useState<ProcessStateFilter>("all");
  const [processOwnershipFilter, setProcessOwnershipFilter] =
    useState<ProcessOwnershipFilter>("all");
  const [selectedProcessRowId, setSelectedProcessRowId] = useState<string | null>(
    null,
  );
  const [selectedProcessForAction, setSelectedProcessForAction] = useState<ProcessRow | null>(null)
  const [processAction, setProcessAction] = useState<'approve' | 'reject' | null>(null)
  const [processActionComment, setProcessActionComment] = useState('')
  const [processActionError, setProcessActionError] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<ProcessRow | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ProcessRow | null>(null)
  const profileGroupIds = useMemo(
    () =>
      new Set(
        actors.groupMembers
          .filter((member) => member.user_id === profile?.id && member.is_active)
          .map((member) => member.group_id),
      ),
    [actors.groupMembers, profile?.id],
  );
  const isManager = useMemo(
    () => profile?.role === 'admin' || profile?.role === 'manager',
    [profile?.role],
  );
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
  const sourceDocumentMetadata = selectedDocument
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
    : null;
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

  const editingTemplate =
    catalog.templates.find((template) => template.id === editingId) ?? null;
  const availableSourceTemplates = useMemo(
    () =>
      catalog.templates
        .filter(
          (template) =>
            template.is_active &&
            template.status !== "archived" &&
            Boolean(template.current_version),
        )
        .sort((left, right) => {
          if (left.status === right.status) {
            return (
              new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
            );
          }
          return left.status === "published" ? -1 : 1;
        }),
    [catalog.templates],
  );
  const selectedSourceTemplate =
    availableSourceTemplates.find((template) => template.id === selectedSourceTemplateId) ??
    null;
  const usersById = useMemo(
    () => new Map(actors.users.map((user) => [user.id, user.full_name])),
    [actors.users],
  );
  const groupsById = useMemo(
    () => new Map(actors.groups.map((group) => [group.id, group.name])),
    [actors.groups],
  );
  const documentsById = useMemo(() => {
    const map = new Map<string, Document>();
    for (const document of documentsState.documents) {
      const safeId = stripTramiteUuid(document.id) ?? document.id;
      if (safeId) {
        map.set(safeId, document);
        if (safeId !== document.id) map.set(document.id, document);
      }
    }
    return map;
  }, [documentsState.documents]);
  const templatesById = useMemo(() => {
    const map = new Map<string, DocumentTramiteTemplate>();
    for (const template of catalog.templates) {
      const safeId = stripTramiteUuid(template.id) ?? template.id;
      if (safeId) {
        map.set(safeId, template);
        if (safeId !== template.id) map.set(template.id, template);
      }
    }
    return map;
  }, [catalog.templates]);
  const projectsById = useMemo(
    () => new Map(projects.projects.map((project) => [project.id, project])),
    [projects.projects],
  );
  const stepsByInstanceId = useMemo(() => {
    const grouped = new Map<string, typeof executions.steps>();
    for (const step of executions.steps) {
      const safeInstanceId = stripTramiteUuid(step.instance_id) ?? step.instance_id;
      const keys = [step.instance_id, safeInstanceId].filter((value) => Boolean(value)) as string[];
      for (const key of keys) {
        const current = grouped.get(key);
        if (current) {
          current.push(step);
        } else {
          grouped.set(key, [step]);
        }
      }
    }
    return grouped;
  }, [executions.steps]);
  const processRows = useMemo(() => {
    function isStepAssignedToProfile(
      step: DocumentTramiteInstanceStep,
      document: Document | undefined | null,
      currentProfile: { id: string; role: string } | null,
      groupIds: Set<string>,
    ) {
      if (!currentProfile) return false;
      const assignment = (step.assignment_type ?? "none") as DocumentTramiteAssignmentType;
      if (
        assignment === "none" ||
        assignment === "author" ||
        assignment === "document_owner"
      ) {
        return document?.author_id === currentProfile.id;
      }
      if (assignment === "specific_user") {
        return step.assignee_user_id === currentProfile.id;
      }
      if (assignment === "approval_group") {
        return Boolean(
          step.assignee_group_id && groupIds.has(step.assignee_group_id),
        );
      }
      return assignment === "role" && step.required_role === currentProfile.role;
    }

    return executions.instances.map((instance) => {
      const safeInstanceId = stripTramiteUuid(instance.id) ?? instance.id;
      const safeDocumentId = stripTramiteUuid(instance.document_id) ?? instance.document_id;
      const safeTemplateId = stripTramiteUuid(instance.template_id) ?? instance.template_id;
      const document = documentsById.get(safeDocumentId ?? '') ?? documentsById.get(instance.document_id) ?? null;
      const template = templatesById.get(safeTemplateId ?? '') ?? templatesById.get(instance.template_id ?? '') ?? null;
      const steps =
        stepsByInstanceId.get(instance.id) ??
        stepsByInstanceId.get(safeInstanceId ?? '') ??
        [];
      const actionableSteps = steps.filter(
        (step) => step.node_type !== "start" && step.node_type !== "end",
      );
      const completedSteps = actionableSteps.filter(
        (step) => step.status === "completed" || step.status === "skipped",
      ).length;
      const currentStep =
        actionableSteps.find((step) => step.status === "active") ??
        actionableSteps.find((step) => step.status === "pending") ??
        null;

      const isStepMine =
        currentStep !== null &&
        isStepAssignedToProfile(
          currentStep,
          document,
          profile ? { id: profile.id, role: profile.role } : null,
          profileGroupIds,
        );

      const assigneeAvailability =
        currentStep?.assignee_user_id
          ? availabilityState.getAvailability(currentStep.assignee_user_id, {
              projectId: document?.project_id ?? null,
              docType: document?.doc_type ?? null,
              area: document?.area ?? null,
              stepType: currentStep.node_type,
            })
          : null;
      const canDelegate = Boolean(
        profile?.id &&
          currentStep &&
          notificationState.schemaStatus === "enterprise" &&
          profile.role !== "admin" &&
          profile.role !== "manager" &&
          currentStep.assignment_type === "specific_user" &&
          assigneeAvailability?.substituteUserId === profile.id &&
          currentStep.assignee_user_id !== profile.id,
      );

      const statusBucket: Exclude<ProcessStateFilter, "all"> =
        instance.status === "completed"
          ? "completed"
          : instance.status === "cancelled" || instance.status === "failed"
            ? "cancelled"
            : isStepMine || canDelegate
              ? "my_action"
              : instance.status === "active"
                ? "waiting_others"
                : "active";

      const projectName =
        document?.project?.name ??
        (document?.project_id
          ? projectsById.get(document.project_id)?.name ?? "Sem projeto"
          : "Sem projeto");
      const responsibleName =
        currentStep?.assignment_type === "specific_user"
          ? usersById.get(currentStep.assignee_user_id ?? "") ?? "Usuário atribuído"
          : currentStep?.assignment_type === "approval_group"
            ? groupsById.get(currentStep.assignee_group_id ?? "") ??
              "Grupo atribuído"
            : currentStep?.assignment_type === "role"
              ? `Papel: ${currentStep.required_role ?? "workflow"}`
              : currentStep?.assignment_type === "author" ||
                  currentStep?.assignment_type === "document_owner" ||
                  !currentStep?.assignment_type ||
                  (currentStep.assignment_type as DocumentTramiteAssignmentType) === "none"
                ? document?.author?.full_name ?? "Autor do documento"
                : "Aguardando definição";
      const totalSteps = actionableSteps.length;

      return {
        id: instance.id,
        rowType: "instance",
        instanceId: instance.id,
        templateId: template?.id ?? null,
        documentId: instance.document_id,
        documentCode: document?.code ?? template?.name ?? instance.id,
        documentTitle: document?.title ?? template?.description ?? instance.id,
        templateName: template?.name ?? "Fluxo manual",
        projectName,
        projectId: document?.project_id ?? instance.project_id ?? null,
        docType: document?.doc_type ?? template?.doc_type ?? null,
        area: document?.area ?? template?.area ?? null,
        currentStepId: currentStep?.id ?? null,
        currentStepNodeType: currentStep?.node_type ?? null,
        currentStepAssignmentType: currentStep?.assignment_type ?? null,
        currentStepLabel: currentStep?.label ?? "Sem etapa ativa",
        responsibleName,
        statusBucket,
        statusLabel:
          instance.status === "completed"
            ? "Concluído"
            : instance.status === "cancelled"
              ? "Cancelado"
              : instance.status === "failed"
                ? "Falha"
                : instance.status === "active"
                  ? "Em andamento"
                  : "Ativo",
        isMine: isStepMine,
        canDelegate,
        progress: totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0,
        totalSteps,
        completedSteps,
        dueAt: currentStep?.due_at ?? instance.updated_at,
        startedAt: instance.started_at ?? instance.created_at,
      } satisfies ProcessRow;
    });
  }, [
    availabilityState,
    documentsById,
    executions.instances,
    groupsById,
    notificationState.schemaStatus,
    profile,
    profileGroupIds,
    projectsById,
    stepsByInstanceId,
    templatesById,
    usersById,
  ]);

  const plannedProcessRows = useMemo(() => {
    const templatesWithExecution = new Set(
      executions.instances
        .map((instance) => stripTramiteUuid(instance.template_id) ?? instance.template_id)
        .filter((value): value is string => Boolean(value)),
    );
    const docsWithAnyInstance = new Set(
      executions.instances
        .map((instance) => stripTramiteUuid(instance.document_id) ?? instance.document_id)
        .filter((value): value is string => Boolean(value)),
    );
    const rows: ProcessRow[] = [];
    const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    function isNodeAssignedToProfile(
      node: DocumentTramiteNode,
      document: Document | undefined | null,
      currentProfile: { id: string; role: string } | null,
      groupIds: Set<string>,
    ) {
      if (!currentProfile) return false;
      const assignment = (node.assignment_type ?? "none") as DocumentTramiteAssignmentType;
      if (
        assignment === "none" ||
        assignment === "author" ||
        assignment === "document_owner"
      ) {
        return document?.author_id === currentProfile.id;
      }
      if (assignment === "specific_user") {
        return node.assignee_user_id === currentProfile.id;
      }
      if (assignment === "approval_group") {
        return Boolean(
          node.assignee_group_id && groupIds.has(node.assignee_group_id),
        );
      }
      return assignment === "role" && node.required_role === currentProfile.role;
    }

    for (const template of catalog.templates) {
      const safeTemplateId = stripTramiteUuid(template.id) ?? template.id;
      if (safeTemplateId && templatesWithExecution.has(safeTemplateId)) continue;

      const sourceDocument = getSourceDocumentSummary(
        template,
        documentsState.documents,
        disciplines,
        projects.projects,
      );
      if (!sourceDocument) continue;
      const safeDocumentId = stripTramiteUuid(sourceDocument.id) ?? sourceDocument.id;
      if (!safeDocumentId || !UUID_ANY.test(String(safeDocumentId))) continue;
      if (!documentsById.has(safeDocumentId)) continue;
      if (docsWithAnyInstance.has(safeDocumentId)) continue;

      const actionableNodes = sortFlowNodes(
        (template.current_version?.graph.nodes ?? []).filter(
          (node) => node.node_type !== "start" && node.node_type !== "end",
        ),
      );
      const firstNode = actionableNodes[0] ?? null;
      const statusBucket: Exclude<ProcessStateFilter, "all"> =
        template.status === "archived" ? "cancelled" : "active";
      const documentFull = documentsState.documents.find(
        (d) => d.id === sourceDocument.id,
      );
      const firstNodeIsMine = Boolean(
        firstNode &&
          isNodeAssignedToProfile(
            firstNode,
            documentFull,
            profile ? { id: profile.id, role: profile.role } : null,
            profileGroupIds,
          ),
      );

      rows.push({
        id: `template-${template.id}`,
        rowType: "template",
        instanceId: null,
        templateId: template.id,
        documentId: sourceDocument.id,
        documentCode: sourceDocument.code,
        documentTitle: sourceDocument.title,
        templateName: template.name,
        projectName:
          sourceDocument.project_name ??
          (template.project_id
            ? projectsById.get(template.project_id)?.name ?? "Sem projeto"
            : "Sem projeto"),
        projectId: sourceDocument.project_id ?? template.project_id ?? null,
        docType: sourceDocument.doc_type ?? template.doc_type ?? null,
        area: sourceDocument.area ?? template.area ?? null,
        currentStepId: null,
        currentStepNodeType: firstNode?.node_type ?? null,
        currentStepAssignmentType: firstNode?.assignment_type ?? null,
        currentStepLabel: firstNode?.label ?? "Fluxo modelado",
        responsibleName: firstNode
          ? resolveFlowResponsibleName(firstNode, usersById, groupsById, null)
          : "Aguardando definição",
        statusBucket,
        statusLabel: getTemplateStatusLabel(template.status),
        isMine: firstNodeIsMine,
        canDelegate: false,
        progress: 0,
        totalSteps: actionableNodes.length,
        completedSteps: 0,
        dueAt: null,
        startedAt: template.updated_at,
      });
    }

    return rows;
  }, [
    catalog.templates,
    disciplines,
    documentsState.documents,
    executions.instances,
    groupsById,
    profile,
    profileGroupIds,
    projects.projects,
    projectsById,
    usersById,
  ]);
  const tableProcessRows = useMemo(
    () =>
      [...processRows, ...plannedProcessRows].sort(
        (left, right) =>
          new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
      ),
    [plannedProcessRows, processRows],
  );
  const filteredProcessRows = useMemo(
    () =>
      tableProcessRows.filter((row) => {
        const search = query.trim().toLowerCase();
        if (search) {
          const haystack = [
            row.documentCode,
            row.documentTitle,
            row.templateName,
            row.projectName,
            row.currentStepLabel,
            row.responsibleName,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        if (projectFilter !== "all" && row.projectId !== projectFilter) return false;
        if (docTypeFilter !== "all" && row.docType !== docTypeFilter) {
          return false;
        }
        if (areaFilter !== "all" && row.area !== areaFilter) return false;
        if (processStateFilter !== "all" && row.statusBucket !== processStateFilter) {
          return false;
        }
        if (processOwnershipFilter === "mine" && !row.isMine) return false;
        if (processOwnershipFilter === "others" && row.isMine) return false;
        return true;
      }),
    [
      areaFilter,
      docTypeFilter,
      processOwnershipFilter,
      processStateFilter,
      projectFilter,
      query,
      tableProcessRows,
    ],
  );
  const processStats = useMemo(
    () => ({
      all: processRows.length,
      active: processRows.filter((row) => row.statusBucket === "active").length,
      myAction: processRows.filter((row) => row.statusBucket === "my_action")
        .length,
      waitingOthers: processRows.filter(
        (row) => row.statusBucket === "waiting_others",
      ).length,
      completed: processRows.filter((row) => row.statusBucket === "completed")
        .length,
      cancelled: processRows.filter((row) => row.statusBucket === "cancelled")
        .length,
    }),
    [processRows],
  );

  useEffect(() => {
    if (
      selectedProcessRowId &&
      !filteredProcessRows.some((row) => row.id === selectedProcessRowId)
    ) {
      setSelectedProcessRowId(null);
    }
  }, [filteredProcessRows, selectedProcessRowId]);

  useEffect(() => {
    if (!newOpen || selectedSourceTemplateId || availableSourceTemplates.length === 0) {
      return;
    }
    setSelectedSourceTemplateId(availableSourceTemplates[0].id);
  }, [availableSourceTemplates, newOpen, selectedSourceTemplateId]);

  const selectedProcessRow =
    filteredProcessRows.find((row) => row.id === selectedProcessRowId) ?? null;
  const selectedProcessDetail = useMemo<SelectedProcessDetail | null>(() => {
    if (!selectedProcessRow) return null;

    const template = selectedProcessRow.templateId
      ? templatesById.get(selectedProcessRow.templateId) ?? null
      : null;
    const document = documentsById.get(selectedProcessRow.documentId) ?? null;
    const documentSummary = document
      ? mapDocumentToPreviewSummary(document, disciplines, projects.projects)
      : template
        ? getSourceDocumentSummary(
            template,
            documentsState.documents,
            disciplines,
            projects.projects,
          )
        : null;
    const documentAuthorName = document?.author?.full_name ?? null;

    if (selectedProcessRow.rowType === "instance" && selectedProcessRow.instanceId) {
      const steps = (stepsByInstanceId.get(selectedProcessRow.instanceId) ?? []).filter(
        (step) => step.node_type !== "start" && step.node_type !== "end",
      );
      const mappedSteps = steps.map((step) => ({
        id: step.id,
        label: step.label,
        description: step.description ?? null,
        responsibleName: resolveFlowResponsibleName(
          step,
          usersById,
          groupsById,
          documentAuthorName,
        ),
        statusLabel: getExecutionStepStatusLabel(step.status),
        dueAt: step.due_at,
        completedAt: step.completed_at,
        decisionLabel: getDecisionLabel(step.decision),
      }));

      return {
        row: selectedProcessRow,
        documentSummary,
        completedSteps: mappedSteps.filter((step) =>
          ["Concluída", "Ignorada"].includes(step.statusLabel),
        ),
        upcomingSteps: mappedSteps.filter((step) =>
          ["Em andamento", "Aguardando", "Bloqueada", "Cancelada"].includes(
            step.statusLabel,
          ),
        ),
        flowSteps: mappedSteps,
      };
    }

    const plannedSteps = template
      ? sortFlowNodes(
          (template.current_version?.graph.nodes ?? []).filter(
            (node) => node.node_type !== "start" && node.node_type !== "end",
          ),
        ).map((node) => ({
          id: node.id,
          label: node.label,
          description: node.description,
          responsibleName: resolveFlowResponsibleName(
            node,
            usersById,
            groupsById,
            documentAuthorName,
          ),
          statusLabel:
            template.status === "published" ? "Pronta para execução" : "Planejada",
          dueAt:
            typeof node.due_days === "number"
              ? `Em até ${node.due_days} dia(s)`
              : null,
          completedAt: null,
          decisionLabel: null,
        }))
      : [];

    return {
      row: selectedProcessRow,
      documentSummary,
      completedSteps: [],
      upcomingSteps: plannedSteps,
      flowSteps: plannedSteps,
    };
  }, [
    selectedProcessRow,
    templatesById,
    documentsById,
    disciplines,
    projects.projects,
    documentsState.documents,
    stepsByInstanceId,
    usersById,
    groupsById,
  ]);

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
      code: selectedDocument.code ?? undefined,
      description: `Fluxo de aprovação ${flowTypeLabel} vinculado ao documento ${selectedDocument.code ?? selectedDocument.title}.`,
      template_scope: selectedDocument.project_id ? "project" : "area_type",
      doc_type: selectedDocument.doc_type || null,
      area: selectedDocument.area || null,
      project_id: selectedDocument.project_id || null,
      metadata: {
        source_document: sourceDocumentMetadata,
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
      toast.success("Modelo criado. Continue desenhando o fluxo.");
      setForm(EMPTY_FORM);
      setNewOpen(false);
      setEditingId(id);
    } else {
      toast.error(catalog.error || "Não foi possível criar o trâmite.");
    }
  }

  async function createTemplateFromModel() {
    if (!form.documentId) {
      toast.error("Selecione um documento para iniciar o fluxo.");
      return;
    }
    if (!selectedDocument) {
      toast.error("O documento selecionado não foi encontrado.");
      return;
    }
    if (!selectedSourceTemplate?.current_version?.graph) {
      toast.error("Selecione um modelo disponível para continuar.");
      return;
    }

    const sourceGraph = selectedSourceTemplate.current_version.graph;
    const id = await catalog.createTemplate({
      name: `${selectedSourceTemplate.name} · ${selectedDocument.code ?? selectedDocument.title}`,
      code: selectedSourceTemplate.code ? `${selectedSourceTemplate.code}` : undefined,
      description:
        selectedSourceTemplate.description?.trim() ||
        `Fluxo criado a partir do modelo ${selectedSourceTemplate.name}.`,
      template_scope: selectedDocument.project_id ? "project" : "area_type",
      doc_type: selectedDocument.doc_type || selectedSourceTemplate.doc_type || null,
      area: selectedDocument.area || selectedSourceTemplate.area || null,
      project_id: selectedDocument.project_id || null,
      metadata: {
        ...(selectedSourceTemplate.metadata ?? {}),
        source_document: sourceDocumentMetadata,
        source_template: {
          id: selectedSourceTemplate.id,
          code: selectedSourceTemplate.code,
          name: selectedSourceTemplate.name,
          version_number:
            selectedSourceTemplate.current_version?.version_number ?? null,
        },
        creation_mode: "template",
      },
      graph: sourceGraph,
    });

    if (id) {
      toast.success("Fluxo criado a partir do modelo. Continue ajustando no desenho.");
      resetCreationDialog();
      setEditingId(id);
    } else {
      toast.error(catalog.error || "Não foi possível criar o fluxo a partir do modelo.");
    }
  }

  async function createBlankModel() {
    const normalizedName = newModelName.trim();
    if (!normalizedName) {
      toast.error("Informe o nome do novo modelo.");
      return;
    }

    const id = await catalog.createTemplate({
      name: normalizedName,
      description: newModelDescription.trim() || null,
      template_scope: "organization",
      metadata: {
        creation_mode: "blank_model",
      },
      graph: createEmptyTramiteGraph(),
    });

    if (id) {
      toast.success("Modelo criado. Continue desenhando o fluxo.");
      setNewModelOpen(false);
      setNewModelName("");
      setNewModelDescription("");
      setEditingId(id);
    } else {
      toast.error(catalog.error || "Não foi possível criar o novo modelo.");
    }
  }

  function openProcessAction(row: ProcessRow, action: 'approve' | 'reject') {
    setSelectedProcessForAction(row)
    setProcessAction(action)
    setProcessActionComment('')
    setProcessActionError(null)
  }

  function closeProcessActionDialog() {
    setSelectedProcessForAction(null)
    setProcessAction(null)
    setProcessActionComment('')
    setProcessActionError(null)
  }

  async function handleConfirmCancel(reason: string) {
    if (!cancelTarget?.instanceId) return;
    try {
      await execution.cancelInstance({
        instanceId: cancelTarget.instanceId,
        reason,
      });
      toast.success("Trâmite cancelado com sucesso.");
      setCancelTarget(null);
    } catch (error) {
      const message =
      (error as Error)?.message ||
      execution.error ||
      "Não foi possível cancelar o trâmite.";
      toast.error(message);
    }
  }

  async function handleConfirmArchive() {
    if (!archiveTarget?.templateId) return;
    const success = await catalog.archiveTemplate(archiveTarget.templateId);
    if (success) {
      toast.success("Modelo arquivado. Ele não aparecerá mais para novas execuções.");
      setArchiveTarget(null);
    } else {
      toast.error(catalog.error || "Não foi possível arquivar o modelo.");
    }
  }

  async function handleConfirmProcessAction() {
    if (!selectedProcessForAction || !processAction) return
    if (processAction === 'reject' && !processActionComment.trim()) {
      setProcessActionError('Informe o motivo da rejeição.')
      return
    }

    let currentRow: ProcessRow = selectedProcessForAction;
    currentRow = {
      ...currentRow,
      id: stripTramiteUuid(currentRow.id) ?? currentRow.id,
      instanceId: stripTramiteUuid(currentRow.instanceId) ?? currentRow.instanceId,
      templateId: stripTramiteUuid(currentRow.templateId) ?? currentRow.templateId,
      documentId: stripTramiteUuid(currentRow.documentId) ?? currentRow.documentId,
      currentStepId: stripTramiteUuid(currentRow.currentStepId) ?? currentRow.currentStepId,
    } satisfies ProcessRow;

    try {
      if (currentRow.rowType === 'template' && currentRow.templateId && !currentRow.currentStepId) {
        let safeDocumentId = stripTramiteUuid(currentRow.documentId) ?? currentRow.documentId;
        const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const rowCode = String(currentRow.documentCode ?? "").trim().toUpperCase();
        const rowTitle = String(currentRow.documentTitle ?? "").trim().toLowerCase();
        let fallbackDocument: Document | undefined;
        if (rowCode) {
          fallbackDocument = documentsState.documents.find(
            (document) => String(document.code ?? "").trim().toUpperCase() === rowCode,
          );
        }
        if (!fallbackDocument && rowTitle) {
          fallbackDocument = documentsState.documents.find(
            (document) => String(document.title ?? "").trim().toLowerCase() === rowTitle,
          );
        }
        if (fallbackDocument) {
          safeDocumentId = fallbackDocument.id;
        }
        if (!safeDocumentId || !UUID_ANY.test(String(safeDocumentId))) {
          setProcessActionError('O documento original não está mais disponível nesta organização. O fluxo não pode ser iniciado a partir deste modelo.');
          toast.error('Documento original indisponível. Atualize a página.');
          return;
        }
        if (!documentsById.has(safeDocumentId)) {
          setProcessActionError('O documento não foi encontrado na organização. Não é possível iniciar o fluxo automaticamente.');
          toast.error('Documento não encontrado na organização. Atualize a página ou selecione outro documento.');
          return;
        }
        const existingActiveInstance = (executions.instances ?? []).find(
          (inst) =>
            (stripTramiteUuid(inst.document_id) ?? inst.document_id) === safeDocumentId &&
            (inst.status === 'active' || (inst.status as string) === 'pending'),
        );

        // ---------------------------------------------------------------
        // CORREÇÃO (closure obsoleto): antes, o código chamava
        // execution.startInstance(...), esperava executions.refresh(), e
        // em seguida tentava reencontrar a instância lendo
        // executions.instances — mas esse valor ainda reflete o estado de
        // ANTES do refresh terminar de propagar pro React nesta mesma
        // execução da função (mesmo depois do await). O retorno de
        // startInstance() já traz o instance_id certo, e a consulta abaixo
        // busca os dados direto no Supabase (sem depender do estado do
        // hook), então nunca fica "atrasada".
        // ---------------------------------------------------------------
        let startResult: Awaited<ReturnType<typeof execution.startInstance>> | null = null;
        if (!existingActiveInstance) {
          toast.loading('Iniciando o fluxo automaticamente…', { id: 'start-instance-for-action' });
          try {
            startResult = await execution.startInstance({
              documentId: safeDocumentId,
              templateId: currentRow.templateId,
              templateVersionId: templatesById.get(currentRow.templateId ?? '')?.current_version?.id ?? null,
            });
          } finally {
            toast.dismiss('start-instance-for-action');
          }
        }

        const targetInstanceId =
          startResult?.instance_id ?? existingActiveInstance?.id ?? null;

        if (!targetInstanceId) {
          setProcessActionError('Não foi possível iniciar o fluxo (nenhum instance_id retornado). Atualize a página e tente novamente.');
          toast.error('Não foi possível iniciar o fluxo. Tente novamente.');
          return;
        }

        // Busca fresca e direta no banco — não depende do estado do hook.
        const [instanceFetch, stepsFetch] = await Promise.all([
          supabase
            .from('document_tramite_instances')
            .select('*')
            .eq('id', targetInstanceId)
            .maybeSingle(),
          supabase
            .from('document_tramite_instance_steps')
            .select('*')
            .eq('instance_id', targetInstanceId)
            .order('created_at', { ascending: true }),
        ]);

        const matchedInstance = instanceFetch.data ?? null;
        if (!matchedInstance) {
          setProcessActionError('Fluxo iniciado, mas não foi possível recuperar a instância. Atualize a página e tente novamente.');
          toast.error('Fluxo iniciado. Atualize a página para continuar.');
          return;
        }

        const matchedTemplate =
          templatesById.get(stripTramiteUuid(matchedInstance.template_id) ?? matchedInstance.template_id ?? '') ??
          templatesById.get(currentRow.templateId ?? '') ??
          null;
        const liveSteps = (stepsFetch.data ?? []) as DocumentTramiteInstanceStep[];
        const liveDocument =
          documentsById.get(matchedInstance.document_id) ??
          documentsById.get(stripTramiteUuid(matchedInstance.document_id) ?? '') ??
          null;
        const liveActionableSteps = liveSteps.filter(
          (step) => step.node_type !== 'start' && step.node_type !== 'end',
        );
        const liveCurrentStep =
          liveActionableSteps.find((step) => step.status === 'active') ??
          liveActionableSteps.find((step) => step.status === 'pending') ??
          null;

        if (!liveCurrentStep) {
          setProcessActionError('Fluxo iniciado sem etapa ativa detectada. Atualize a página para prosseguir.');
          toast.error('Fluxo iniciado sem etapa ativa. Atualize a página para continuar.');
          return;
        }

        const liveIsMine =
          (() => {
            if (!profile) return false;
            const assignment = (liveCurrentStep.assignment_type ?? 'none') as DocumentTramiteAssignmentType;
            if (
              assignment === 'none' ||
              assignment === 'author' ||
              assignment === 'document_owner'
            ) {
              return liveDocument?.author_id === profile.id;
            }
            if (assignment === 'specific_user') {
              return liveCurrentStep.assignee_user_id === profile.id;
            }
            if (assignment === 'approval_group') {
              return Boolean(
                liveCurrentStep.assignee_group_id && profileGroupIds.has(liveCurrentStep.assignee_group_id),
              );
            }
            return assignment === 'role' && liveCurrentStep.required_role === profile.role;
          })();

        currentRow = {
          id: matchedInstance.id,
          rowType: 'instance',
          instanceId: matchedInstance.id,
          templateId: matchedTemplate?.id ?? null,
          documentId: matchedInstance.document_id,
          documentCode: liveDocument?.code ?? matchedInstance.document_id,
          documentTitle: liveDocument?.title ?? matchedInstance.document_id,
          templateName: matchedTemplate?.name ?? 'Fluxo manual',
          projectName:
            liveDocument?.project?.name ??
            (liveDocument?.project_id
              ? projectsById.get(liveDocument.project_id)?.name ?? 'Sem projeto'
              : 'Sem projeto'),
          projectId: liveDocument?.project_id ?? matchedInstance.project_id ?? null,
          docType: liveDocument?.doc_type ?? matchedTemplate?.doc_type ?? null,
          area: liveDocument?.area ?? matchedTemplate?.area ?? null,
          currentStepId: liveCurrentStep.id,
          currentStepNodeType: liveCurrentStep.node_type ?? null,
          currentStepAssignmentType: liveCurrentStep.assignment_type ?? null,
          currentStepLabel: liveCurrentStep.label ?? 'Sem etapa ativa',
          responsibleName:
            liveCurrentStep.assignment_type === 'specific_user'
              ? usersById.get(liveCurrentStep.assignee_user_id ?? '') ?? 'Usuário atribuído'
              : liveCurrentStep.assignment_type === 'approval_group'
                ? groupsById.get(liveCurrentStep.assignee_group_id ?? '') ?? 'Grupo atribuído'
                : liveCurrentStep.assignment_type === 'role'
                  ? `Papel: ${liveCurrentStep.required_role ?? 'workflow'}`
                  : liveCurrentStep.assignment_type === 'author' ||
                      liveCurrentStep.assignment_type === 'document_owner' ||
                      !liveCurrentStep.assignment_type ||
                      (liveCurrentStep.assignment_type as DocumentTramiteAssignmentType) === 'none'
                    ? liveDocument?.author?.full_name ?? 'Autor do documento'
                    : 'Aguardando definição',
          statusBucket: matchedInstance.status === 'completed'
            ? 'completed'
            : matchedInstance.status === 'cancelled' || matchedInstance.status === 'failed'
              ? 'cancelled'
              : liveIsMine
                ? 'my_action'
                : matchedInstance.status === 'active'
                  ? 'waiting_others'
                  : 'active',
          statusLabel: matchedInstance.status ?? 'Ativo',
          isMine: liveIsMine,
          canDelegate: false,
          progress: liveActionableSteps.length
            ? Math.round(
                (liveActionableSteps.filter(
                  (s) => s.status === 'completed' || s.status === 'skipped',
                ).length /
                  liveActionableSteps.length) *
                  100,
              )
            : 0,
          totalSteps: liveActionableSteps.length,
          completedSteps: liveActionableSteps.filter(
            (s) => s.status === 'completed' || s.status === 'skipped',
          ).length,
          dueAt: liveCurrentStep.due_at ?? matchedInstance.updated_at,
          startedAt: matchedInstance.started_at ?? matchedInstance.created_at,
        } satisfies ProcessRow;
      }

      if (!currentRow.currentStepId) {
        setProcessActionError('Não há etapa ativa para decisão neste fluxo.');
        return;
      }
    } catch (error) {
      toast.dismiss('start-instance-for-action');
      setProcessActionError((error as Error)?.message || 'Erro ao preparar a etapa para decisão.');
      toast.error('Não foi possível iniciar a etapa. Tente novamente.');
      return;
    }

    const decisionOptions =
      currentRow.currentStepNodeType
        ? getStepDecisionOptions(currentRow.currentStepNodeType)
        : null;
    const hasLegacyApprovalRow = !currentRow.currentStepNodeType ||
      (decisionOptions?.some(
        (option) => option.value === 'approved' || option.value === 'rejected',
      ) ?? false);

    let success = false;
    const document = documentsById.get(currentRow.documentId);
    const availability =
      currentRow.currentStepAssignmentType === 'specific_user' &&
        currentRow.canDelegate
        ? currentRow.responsibleName
          ? null
          : null
        : currentRow.currentStepAssignmentType === 'specific_user'
          ? (() => {
              const relatedStep = executions.steps.find(
                (step) => step.id === currentRow.currentStepId,
              );
              return relatedStep?.assignee_user_id
                ? availabilityState.getAvailability(relatedStep.assignee_user_id, {
                    projectId: document?.project_id ?? null,
                    docType: document?.doc_type ?? null,
                    area: document?.area ?? null,
                    stepType: relatedStep.node_type,
                  })
                : null;
            })()
          : null;
    const delegated = Boolean(
      profile?.id &&
        currentRow.canDelegate &&
        notificationState.schemaStatus === 'enterprise' &&
        profile.role !== 'admin' &&
        profile.role !== 'manager' &&
        availability?.substituteUserId === profile.id,
    );

    try {
      if (hasLegacyApprovalRow && !currentRow.rowType ||
        (!currentRow.currentStepNodeType &&
          !executions.steps.some(
            (step) => step.id === currentRow.currentStepId,
          ))) {
        success = await actOnStep({
          documentId: currentRow.documentId,
          stepId: currentRow.currentStepId,
          action: processAction,
          comment: processActionComment.trim() || undefined,
        });
      } else {
        const decision =
          processAction === 'approve'
            ? decisionOptions?.find((option) => option.value === 'approved')
                ?.value ?? 'completed'
            : decisionOptions?.find(
                (option) => option.value === 'needs_correction' || option.value === 'rejected',
              )?.value ?? 'needs_correction';
        const result = await execution.completeStep({
          stepId: currentRow.currentStepId,
          decision,
          comment: processActionComment.trim() || null,
          metadata: {
            source: 'tramite_admin_list',
            delegated_confirmation: delegated,
          },
        });
        success = Boolean(result) && !('error' in (result as { error?: unknown }));
      }
    } catch (error) {
      const root = error instanceof Error ? error.message : null;
      const detailed =
        execution.error ||
        root ||
        'Não foi possível registrar sua decisão. Verifique permissões e tente novamente.';
      setProcessActionError(detailed);
      toast.error(root || 'Não foi possível concluir a etapa.');
      success = false;
    }

    if (success) {
      toast.success(
        processAction === 'approve'
          ? 'Etapa aprovada — fluxo segue para a próxima etapa.'
          : 'Correção solicitada ao autor.',
      )
      closeProcessActionDialog()
    }
  }

  function resetCreationDialog() {
    setForm(EMPTY_FORM);
    setCreationMode("manual");
    setSelectedSourceTemplateId("");
    setNewOpen(false);
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
    <TooltipProvider delayDuration={150}>
      <div className="space-y-8">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div>
            <Badge
              variant="outline"
              className="mb-3 border-slate-200 bg-slate-50 text-slate-600"
            >
              Acompanhamento operacional
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Trâmites dos documentos
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Acompanhe os processos em andamento, filtre pendências e inicie um
              novo trâmite quando necessário.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={catalog.isLoading || executions.isLoading}
              onClick={() => {
                void catalog.refresh();
                void executions.refresh();
              }}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  catalog.isLoading || executions.isLoading ? "animate-spin" : ""
                }`}
              />
              Atualizar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewModelOpen(true)}
              disabled={
                !catalog.canManage ||
                !["ready", "empty"].includes(catalog.schemaStatus)
              }
              className="gap-2 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Layers3 className="h-4 w-4" />
              Novo modelo
            </Button>
            <Button
              type="button"
              onClick={() => setNewOpen(true)}
              disabled={
                !catalog.canManage ||
                !["ready", "empty"].includes(catalog.schemaStatus)
              }
              className="gap-2 rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              Iniciar fluxo
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <ProcessStatCard
            label="Todos os processos"
            value={processStats.all}
            hint="Trâmites rastreados"
            accentClass="bg-sky-500"
          />
          <ProcessStatCard
            label="Em andamento"
            value={processStats.active}
            hint="Execuções ativas"
            accentClass="bg-amber-500"
          />
          <ProcessStatCard
            label="Aguardando minha ação"
            value={processStats.myAction}
            hint="Pendências atribuídas"
            accentClass="bg-rose-500"
          />
          <ProcessStatCard
            label="Aguardando outros"
            value={processStats.waitingOthers}
            hint="Dependem de terceiros"
            accentClass="bg-violet-500"
          />
          <ProcessStatCard
            label="Concluídos"
            value={processStats.completed}
            hint="Encerrados com sucesso"
            accentClass="bg-emerald-500"
          />
          <ProcessStatCard
            label="Cancelados"
            value={processStats.cancelled}
            hint="Interrompidos ou cancelados"
            accentClass="bg-slate-500"
          />
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="border-slate-200 bg-white pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar documento, fluxo, etapa ou responsável..."
            />
          </div>
          <Select
            value={processStateFilter}
            onValueChange={(value) =>
              setProcessStateFilter(value as ProcessStateFilter)
            }
          >
            <SelectTrigger className="w-full border-slate-200 sm:w-[190px]">
              <SelectValue placeholder="Situação do processo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os processos</SelectItem>
              <SelectItem value="active">Em andamento</SelectItem>
              <SelectItem value="my_action">Aguardando minha ação</SelectItem>
              <SelectItem value="waiting_others">Aguardando outros</SelectItem>
              <SelectItem value="completed">Concluídos</SelectItem>
              <SelectItem value="cancelled">Cancelados</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={processOwnershipFilter}
            onValueChange={(value) =>
              setProcessOwnershipFilter(value as ProcessOwnershipFilter)
            }
          >
            <SelectTrigger className="w-full border-slate-200 sm:w-[180px]">
              <SelectValue placeholder="Responsabilidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="mine">Minha ação</SelectItem>
              <SelectItem value="others">Aguardando outros</SelectItem>
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-full border-slate-200 sm:w-[180px]">
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
          <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
            <SelectTrigger className="w-full border-slate-200 sm:w-[180px]">
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
            <SelectTrigger className="w-full border-slate-200 sm:w-[160px]">
              <SelectValue placeholder="Áreas" />
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
          <Button
            type="button"
            variant="outline"
            className="border-slate-200 text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setQuery("");
              setProjectFilter("all");
              setDocTypeFilter("all");
              setAreaFilter("all");
              setProcessStateFilter("all");
              setProcessOwnershipFilter("all");
            }}
          >
            <Filter className="h-4 w-4" />
            Limpar
          </Button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Documento
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Módulo do fluxo
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Etapa atual
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Responsável
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Progresso
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Prazo da etapa
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {executions.isLoading && tableProcessRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10">
                      <div className="flex items-center justify-center gap-2 text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando processos...
                      </div>
                    </td>
                  </tr>
                ) : filteredProcessRows.length > 0 ? (
                  filteredProcessRows.map((row) => {
                    const statusMeta = getProcessStatusMeta(row.statusBucket);
                    const canDecideNow =
                      row.currentStepId !== null
                        ? (row.isMine || isManager)
                        : row.rowType === 'template'
                          ? (row.isMine || isManager) && Boolean(row.currentStepNodeType)
                          : false;
                    let decideDisabledReason: string | null = null;
                    if (row.rowType === 'template' && !row.currentStepNodeType) {
                      decideDisabledReason =
                        "Modelo de trâmite vazio (sem etapas configuradas). Edite o modelo e adicione nós de aprovação/revisão primeiro.";
                    } else if (row.rowType === 'instance' && !row.currentStepId) {
                      decideDisabledReason =
                        "Nenhuma etapa ativa no momento. O fluxo foi concluído, cancelado ou aguarda etapas externas.";
                    } else if (
                      row.rowType === 'instance' &&
                      !row.isMine &&
                      !isManager &&
                      row.currentStepId
                    ) {
                      decideDisabledReason =
                        "Esta etapa está atribuída a outro usuário/grupo. Apenas o responsável pela etapa ou um gestor pode aprovar/reprovar.";
                    } else if (
                      row.rowType === 'template' &&
                      !row.isMine &&
                      !isManager
                    ) {
                      decideDisabledReason =
                        "A primeira etapa deste fluxo não está atribuída a você. Apenas o responsável ou um gestor pode começar o fluxo decidindo diretamente.";
                    }
                    const decideDisabled = decideDisabledReason !== null;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "cursor-pointer hover:bg-slate-50/70",
                          selectedProcessRowId === row.id && "bg-sky-50/70",
                        )}
                        onClick={() =>
                          setSelectedProcessRowId((current) =>
                            current === row.id ? null : row.id,
                          )
                        }
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="min-w-[210px]">
                            <p className="font-semibold text-slate-900">
                              {row.documentCode ?? "Sem código"}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                              {row.documentTitle}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="min-w-[200px]">
                            <p className="font-medium text-slate-800">
                              {row.templateName}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {row.projectName}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="min-w-[170px]">
                            <p className="font-medium text-slate-800">
                              {row.currentStepLabel}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {row.area ?? "Área não informada"}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="min-w-[160px]">
                            <p className="font-medium text-slate-800">
                              {row.responsibleName}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {row.isMine
                                ? row.rowType === 'template'
                                  ? 'Minha ação · inicia o fluxo automaticamente'
                                  : 'Minha ação'
                                : isManager && (row.currentStepId || row.rowType === 'template' && row.currentStepNodeType)
                                  ? row.rowType === 'template'
                                    ? 'Atuação como gestor · inicia o fluxo automaticamente'
                                    : 'Atuação como gestor'
                                  : 'Aguardando outros'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="min-w-[130px]">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>
                                {row.completedSteps}/{row.totalSteps} etapas
                              </span>
                              <span>{row.progress}%</span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-slate-100">
                              <div
                                className={cn(
                                  "h-2 rounded-full",
                                  statusMeta.accentClass,
                                )}
                                style={{ width: `${Math.max(row.progress, 6)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="min-w-[108px] text-sm text-slate-700">
                            {formatDateTime(row.dueAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <div className="inline-flex items-center gap-2 justify-end">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                                    disabled={decideDisabled}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (decideDisabled) {
                                        if (decideDisabledReason) toast.info(decideDisabledReason);
                                        return;
                                      }
                                      openProcessAction(row, 'approve');
                                    }}
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-1" />
                                    Aprovar
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {decideDisabledReason && (
                                <TooltipContent
                                  side="top"
                                  align="end"
                                  className="max-w-[320px] text-xs text-slate-700"
                                >
                                  {decideDisabledReason}
                                </TooltipContent>
                              )}
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    disabled={decideDisabled}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (decideDisabled) {
                                        if (decideDisabledReason) toast.info(decideDisabledReason);
                                        return;
                                      }
                                      openProcessAction(row, 'reject');
                                    }}
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Reprovar
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {decideDisabledReason && (
                                <TooltipContent
                                  side="top"
                                  align="end"
                                  className="max-w-[320px] text-xs text-slate-700"
                                >
                                  {decideDisabledReason}
                                </TooltipContent>
                              )}
                            </Tooltip>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (row.templateId) {
                                  setEditingId(row.templateId);
                                }
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {row.rowType === 'instance' &&
                              row.instanceId &&
                              !['completed', 'cancelled'].includes(row.statusBucket) && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setCancelTarget(row);
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Cancelar
                                </Button>
                              )}
                            {row.rowType === 'template' &&
                              row.templateId &&
                              row.statusBucket !== 'cancelled' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setArchiveTarget(row);
                                  }}
                                >
                                  <Archive className="h-4 w-4 mr-1" />
                                  Arquivar
                                </Button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <div className="space-y-1 text-sm text-slate-500">
                        <p className="font-medium text-slate-700">
                          {executions.schemaStatus === "not_installed"
                            ? "Execução de trâmites ainda não instalada"
                            : "Nenhum processo encontrado"}
                        </p>
                        <p>
                          {executions.error ||
                            "Ajuste os filtros ou inicie um novo trâmite para começar."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedProcessDetail && (
          <ProcessDetailsCard
            detail={selectedProcessDetail}
            onOpenModeler={
              selectedProcessDetail.row.templateId
                ? () => setEditingId(selectedProcessDetail.row.templateId)
                : undefined
            }
          />
        )}
      </div>

      <Dialog
        open={newOpen}
        onOpenChange={(open) => {
          if (open) {
            setNewOpen(true);
            return;
          }
          resetCreationDialog();
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo fluxo de aprovação</DialogTitle>
            <DialogDescription>
              Escolha se deseja configurar o fluxo manualmente ou partir de um
              modelo já definido no sistema.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={creationMode}
            onValueChange={(value) => setCreationMode(value as FlowCreationMode)}
            className="space-y-4 py-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="template">A partir de modelo</TabsTrigger>
            </TabsList>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Documento base</CardTitle>
                <CardDescription>
                  O documento selecionado será vinculado ao fluxo criado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
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
                    <p className="text-xs text-destructive">{documentsState.error}</p>
                  )}
                </div>

                {selectedDocument ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                          Projeto
                        </p>
                        <p className="font-medium">
                          {selectedDocumentProject?.name || "Sem projeto"}
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
                      <div className="sm:col-span-2">
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
                          Tipo e área
                        </p>
                        <p className="font-medium">
                          {selectedDocument.doc_type} · {selectedDocument.area}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-sm text-slate-500">
                    Selecione um documento para liberar a configuração do fluxo.
                  </div>
                )}
              </CardContent>
            </Card>

            <TabsContent value="manual" className="mt-0">
              {selectedDocument ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Configuração manual do fluxo
                    </CardTitle>
                    <CardDescription>
                      Defina o tipo de fluxo e monte as etapas iniciais antes de
                      abrir o modelador.
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
                            {actors.users.length > 0 &&
                              actors.users.map((user) => (
                                <SelectItem
                                  key={`user-${user.id}`}
                                  value={`user:${user.id}`}
                                >
                                  {user.full_name}
                                </SelectItem>
                              ))}
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
              ) : null}
            </TabsContent>

            <TabsContent value="template" className="mt-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Criar a partir de modelo
                  </CardTitle>
                  <CardDescription>
                    Selecione um modelo já definido no sistema. O desenho será
                    copiado e aberto no modelador para você ajustar as etapas em
                    Configurar etapa.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Modelo base *</Label>
                    <Select
                      value={selectedSourceTemplateId || "none"}
                      onValueChange={(value) =>
                        setSelectedSourceTemplateId(value === "none" ? "" : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            availableSourceTemplates.length > 0
                              ? "Selecione um modelo"
                              : "Nenhum modelo disponível"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione um modelo</SelectItem>
                        {availableSourceTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {availableSourceTemplates.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-sm text-slate-500">
                      Ainda não há modelos cadastrados. Use o botão{" "}
                      <span className="font-medium text-slate-700">Novo modelo</span>{" "}
                      para montar o primeiro.
                    </div>
                  ) : selectedSourceTemplate ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Modelo selecionado
                          </p>
                          <p className="font-semibold text-slate-900">
                            {selectedSourceTemplate.name}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {selectedSourceTemplate.description ||
                              "Modelo pronto para reutilização no fluxo do documento."}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Status
                            </p>
                            <Badge
                              variant="outline"
                              className="mt-1 border-slate-200 bg-white text-slate-700"
                            >
                              {getTemplateStatusLabel(selectedSourceTemplate.status)}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Etapas
                            </p>
                            <p className="font-medium">
                              {
                                (selectedSourceTemplate.current_version?.graph.nodes ?? []).filter(
                                  (node) =>
                                    node.node_type !== "start" &&
                                    node.node_type !== "end",
                                ).length
                              }
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Escopo
                            </p>
                            <p className="font-medium">
                              {selectedSourceTemplate.template_scope === "project"
                                ? "Projeto"
                                : selectedSourceTemplate.template_scope === "area_type"
                                  ? "Área/tipo"
                                  : "Organização"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={resetCreationDialog}
              disabled={catalog.isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                creationMode === "manual"
                  ? !form.documentId || form.stages.length === 0 || catalog.isSaving
                  : !form.documentId || !selectedSourceTemplate || catalog.isSaving
              }
              onClick={() =>
                void (
                  creationMode === "manual"
                    ? createTemplate()
                    : createTemplateFromModel()
                )
              }
            >
              {catalog.isSaving && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {creationMode === "manual"
                ? "Criar e continuar"
                : "Usar modelo e continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newModelOpen}
        onOpenChange={(open) => {
          setNewModelOpen(open);
          if (!open) {
            setNewModelName("");
            setNewModelDescription("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo modelo</DialogTitle>
            <DialogDescription>
              Crie um modelo base de fluxo para reutilizar em novos documentos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-model-name">Nome do modelo *</Label>
              <Input
                id="new-model-name"
                value={newModelName}
                onChange={(event) => setNewModelName(event.target.value)}
                placeholder="Ex.: Fluxo Engenharia"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-model-description">Descrição</Label>
              <Input
                id="new-model-description"
                value={newModelDescription}
                onChange={(event) => setNewModelDescription(event.target.value)}
                placeholder="Resumo rápido do objetivo do modelo"
              />
            </div>
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-500">
              Ao criar, o sistema abrirá o modelador com um fluxo inicial para
              você desenhar e publicar depois.
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNewModelOpen(false);
                setNewModelName("");
                setNewModelDescription("");
              }}
              disabled={catalog.isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void createBlankModel()}
              disabled={!newModelName.trim() || catalog.isSaving}
            >
              {catalog.isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedProcessForAction && processAction)}
        onOpenChange={(open) => {
          if (!open) closeProcessActionDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {processAction === 'approve'
                ? 'Aprovar etapa do fluxo'
                : 'Solicitar correção'}
            </DialogTitle>
            <DialogDescription>
              {selectedProcessForAction
                ? `${selectedProcessForAction.documentCode ?? 'Sem código'} — ${selectedProcessForAction.documentTitle}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800">
                  Etapa atual:
                </span>
                <span className="text-slate-700">
                  {selectedProcessForAction?.currentStepLabel ??
                    'Sem etapa ativa'}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500">
                  Responsável: {selectedProcessForAction?.responsibleName ?? '—'}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="process-action-comment">
                {processAction === 'approve'
                  ? 'Análise ou observação (opcional)'
                  : 'Motivo da correção (obrigatório)'}
              </Label>
              <Textarea
                id="process-action-comment"
                rows={4}
                value={processActionComment}
                onChange={(event) => {
                  setProcessActionComment(event.target.value)
                  if (processActionError) setProcessActionError(null)
                }}
                placeholder={
                  processAction === 'approve'
                    ? 'Descreva o parecer da análise (opcional) ou deixe em branco para aprovar direto.'
                    : 'Informe o que precisa ser ajustado pelo autor antes de seguir o fluxo.'
                }
              />
              {processActionError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Atenção</AlertTitle>
                  <AlertDescription>{processActionError}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeProcessActionDialog}
              disabled={approvalActionLoading || execution.isCompleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmProcessAction()}
              disabled={approvalActionLoading || execution.isCompleting}
              variant={processAction === 'approve' ? 'default' : 'destructive'}
            >
              {(approvalActionLoading || execution.isCompleting) && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              {processAction === 'approve'
                ? 'Confirmar aprovação'
                : 'Solicitar correção'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TramiteCancelDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        isCancelling={execution.isCancelling}
        onConfirm={async (reason) => {
          await handleConfirmCancel(reason);
        }}
      />

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivar modelo de fluxo?</DialogTitle>
            <DialogDescription>
              {archiveTarget && (
                <>
                  O modelo <strong className="text-slate-800">{archiveTarget.templateName}</strong>
                  será arquivado. Ele não aparecerá mais para novas execuções, mas todo o histórico
                  de execuções existentes será preservado para auditoria.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchiveTarget(null)}
              disabled={catalog.isSaving}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmArchive()}
              disabled={catalog.isSaving}
              className="bg-slate-700 hover:bg-slate-800"
            >
              {catalog.isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Confirmar arquivamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
}

function ProcessDetailsCard({
  detail,
  onOpenModeler,
}: {
  detail: SelectedProcessDetail;
  onOpenModeler?: () => void;
}) {
  const { row, documentSummary, flowSteps } = detail;
  const getStepVisualState = (statusLabel: string) => {
    if (["Concluída", "Ignorada"].includes(statusLabel)) {
      return {
        dotClass: "bg-sky-600 ring-sky-200",
        badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
        connectorClass: "bg-sky-200",
      };
    }
    if (statusLabel === "Em andamento") {
      return {
        dotClass: "bg-amber-500 ring-amber-200",
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        connectorClass: "bg-amber-200",
      };
    }
    return {
      dotClass: "bg-slate-400 ring-slate-200",
      badgeClass: "border-slate-200 bg-slate-50 text-slate-700",
      connectorClass: "bg-slate-200",
    };
  };
  return (
    <Card className="mt-4 overflow-hidden border-sky-100 shadow-sm">
      <CardHeader className="gap-4 bg-sky-50/60">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-sky-200 bg-white text-sky-700"
              >
                Fluxo do documento
              </Badge>
              <Badge
                variant="outline"
                className="border-slate-200 bg-white text-slate-700"
              >
                {row.statusLabel}
              </Badge>
            </div>
            <CardTitle className="text-xl text-slate-900">
              {row.documentCode ?? "Sem código"} · {row.documentTitle}
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              {row.templateName} {documentSummary?.project_name ? `· ${documentSummary.project_name}` : ""}
            </CardDescription>
          </div>

          {onOpenModeler && (
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={onOpenModeler}
            >
              <Eye className="h-4 w-4" />
              Abrir modelador
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <GitBranch className="h-4 w-4 text-sky-600" />
              Etapa atual
            </div>
            <p className="mt-2 text-base font-semibold text-slate-900">
              {row.currentStepLabel}
            </p>
            <p className="mt-1 text-sm text-slate-500">{row.responsibleName}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Layers3 className="h-4 w-4 text-violet-600" />
              Progresso
            </div>
            <p className="mt-2 text-base font-semibold text-slate-900">
              {row.completedSteps}/{row.totalSteps} etapas
            </p>
            <p className="mt-1 text-sm text-slate-500">{row.progress}% do fluxo</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Documento
            </div>
            <p className="mt-2 text-base font-semibold text-slate-900">
              {documentSummary?.register_status ?? row.statusLabel}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Rev. {documentSummary?.register_revision ?? "—"} ·{" "}
              {documentSummary?.discipline_name ?? row.area ?? "Sem disciplina"}
            </p>
          </div>
        </div>

        <div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Próximas etapas
                </h3>
              </div>
              <Badge
                variant="outline"
                className="border-sky-200 bg-sky-50 text-sky-700"
              >
                {flowSteps.length}
              </Badge>
            </div>

            <div className="pb-2">
              {flowSteps.length > 0 ? (
                <div
                  className="grid items-start gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${flowSteps.length}, minmax(0, 1fr))`,
                  }}
                >
                  {flowSteps.map((step, index) => {
                    const style = getStepVisualState(step.statusLabel);
                    const showConnector = index < flowSteps.length - 1;

                    return (
                      <div key={step.id} className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2 ring-offset-0",
                              style.dotClass,
                            )}
                          />
                          <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-slate-900">
                            {step.label}
                          </p>
                          {showConnector && (
                            <span
                              className={cn(
                                "ml-1 h-[2px] min-w-[10px] flex-1",
                                style.connectorClass,
                              )}
                            />
                          )}
                        </div>

                        <div className="mt-1.5 min-h-[82px] rounded-lg border border-slate-200 bg-white p-2.5">
                          <p className="line-clamp-3 text-[11px] font-medium leading-snug text-slate-700">
                            {step.responsibleName}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "px-1.5 py-0 text-[9px] leading-4",
                                style.badgeClass,
                              )}
                            >
                              {step.statusLabel}
                            </Badge>
                            {step.decisionLabel && (
                              <Badge
                                variant="outline"
                                className="border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[9px] leading-4 text-emerald-700"
                              >
                                {step.decisionLabel}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                  Não há novas etapas previstas para este fluxo.
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyFlowPreview() {
  const demoSteps = [
    { label: "Recebimento", responsible: "Área solicitante", color: "bg-sky-500", ring: "ring-sky-200" },
    { label: "Análise", responsible: "Engenharia", color: "bg-teal-500", ring: "ring-teal-200" },
    { label: "Decisão", responsible: "Analista responsável", color: "bg-emerald-500", ring: "ring-emerald-200" },
    { label: "Correção", responsible: "Autor do documento", color: "bg-blue-600", ring: "ring-blue-200" },
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

function ProcessStatCard({
  label,
  value,
  hint,
  accentClass,
}: {
  label: string;
  value: number;
  hint: string;
  accentClass: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
            {label}
          </p>
          <p className="text-3xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
        <span className={cn("mt-1 h-3 w-3 rounded-full", accentClass)} />
      </div>
    </div>
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
