import { createFileRoute, Link, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LibraryRouteRedirect } from "@/components/libraries/LibraryRouteRedirect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Circle,
  Download,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  FileText,
  FolderKanban,
  Calendar,
  Clock,
  Link2,
  User,
  ChevronRight,
  Lightbulb,
  CheckCircle2,
  FilePlus2,
  Shield,
  Info,
  Archive,
} from "lucide-react";
import { DOC_STATUS, DOC_TYPES } from "@/lib/constants";
import { useDocuments, type Document, type DocumentFilters } from "@/hooks/useDocuments";
import { useCreateDocument } from "@/hooks/useCreateDocument";
import { useDocumentCreationControls, type DocumentCreationCodeMode } from "@/hooks/useDocumentCreationControls";
import { useManageDocuments } from "@/hooks/useManageDocuments";
import { useDocumentTramiteSuggestion } from "@/hooks/useDocumentTramiteSuggestion";
import { useOperationalCalendar } from "@/hooks/useOperationalCalendar";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { useLocalData } from "@/hooks/use-local-data";
import { useDocumentCodeOptions, type DocumentCodeOption } from "@/hooks/useDocumentCodeOptions";
import { DocumentCodingControls } from "@/components/documents/DocumentCodingControls";
import { useLibraryScope } from "@/contexts/library-context";
import { useTheme } from "@/contexts/theme-context";
import { useAuthContext } from "@/contexts/AuthContext";
import { addBusinessDaysLocal } from "@/lib/operationalCalendar";
import { exportDocumentsToExcel } from "@/lib/exportUtils";
import { DOCUMENT_FILE_ACCEPT, validateDocumentFile } from "@/lib/documentCreationValidation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/documents")({ component: DocumentsRedirectPage });

function DocumentsRedirectPage() {
  return <LibraryRouteRedirect target="/authenticated/documents" />;
}

const AREAS = ["SGI", "ENG", "OPS", "MNT", "SST", "MA", "QUA", "ADM"] as const;
const REVIEW_PERIODS = [6, 12, 24, 36] as const;
const REGISTER_STATUS_OPTIONS = [
  "Previsto",
  "Recebido",
  "Em Análise",
  "Aprovado",
  "Aprovado com Comentários",
  "Rejeitado",
  "Aguardando Revisão",
  "Cancelado",
] as const;

type DocumentEditFormState = {
  title: string;
  doc_type: string;
  area: string;
  description: string;
  project_id: string;
  discipline_id: string;
  register_revision: string;
  register_status: string;
  external_link: string;
  received_at: string;
  analysis_days: string;
  analysis_deadline: string;
  review_period_months: string;
  next_review_at: string;
};

type DeadlineSignalTone = "on-time" | "due-soon" | "overdue" | "neutral";

function createEmptyDocumentEditForm(): DocumentEditFormState {
  return {
    title: "",
    doc_type: "",
    area: "",
    description: "",
    project_id: "",
    discipline_id: "",
    register_revision: "00",
    register_status: "Recebido",
    external_link: "",
    received_at: getTodayIsoDate(),
    analysis_days: "",
    analysis_deadline: "",
    review_period_months: "24",
    next_review_at: "",
  };
}

function createEditFormFromDocument(document: Document): DocumentEditFormState {
  return {
    title: document.title,
    doc_type: document.doc_type,
    area: document.area,
    description: document.description ?? "",
    project_id: document.project_id ?? "",
    discipline_id: document.discipline_id ?? "",
    register_revision:
      document.register_revision?.trim() ||
      String(document.revision).padStart(2, "0"),
    register_status: document.register_status?.trim() || "Recebido",
    external_link: document.external_link ?? "",
    received_at: document.received_at ?? getTodayIsoDate(),
    analysis_days:
      document.analysis_days === null || document.analysis_days === undefined
        ? ""
        : String(document.analysis_days),
    analysis_deadline: document.analysis_deadline ?? "",
    review_period_months: "24",
    next_review_at: document.next_review_at ?? "",
  };
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getDocTypeLabel(docType: string) {
  return DOC_TYPES.find((item) => item.value === docType)?.label ?? docType;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function getDeadlineSignal(deadline: string | null) {
  if (!deadline) {
    return {
      tone: "neutral" as DeadlineSignalTone,
      label: "Sem prazo",
      className: "bg-slate-100 text-slate-600 hover:bg-slate-100",
      dotClassName: "text-slate-400",
    };
  }

  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const deadlineDate = new Date(`${deadline}T00:00:00Z`);
  const deadlineUtc = Date.UTC(
    deadlineDate.getUTCFullYear(),
    deadlineDate.getUTCMonth(),
    deadlineDate.getUTCDate(),
  );
  const diffDays = Math.floor((deadlineUtc - todayUtc) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      tone: "overdue" as DeadlineSignalTone,
      label: "Atrasado",
      className: "bg-red-100 text-red-700 hover:bg-red-100",
      dotClassName: "text-red-500",
    };
  }

  if (diffDays <= 3) {
    return {
      tone: "due-soon" as DeadlineSignalTone,
      label: "Vencendo em 3 dias",
      className: "bg-amber-100 text-amber-700 hover:bg-amber-100",
      dotClassName: "text-amber-500",
    };
  }

  return {
    tone: "on-time" as DeadlineSignalTone,
    label: "No prazo",
    className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
    dotClassName: "text-emerald-500",
  };
}

function addMonths(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function normalizeRevisionLabel(value: string) {
  const normalized = value.replace(/[^0-9A-Za-z.-]/g, "").toUpperCase();
  return normalized || "00";
}

function parseRevisionNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  const revision = Number.parseInt(digits, 10);
  return Number.isNaN(revision) ? 0 : revision;
}

function normalizeExternalLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isValidExternalLink(value: string) {
  if (!value.trim()) return true;
  try {
    new URL(normalizeExternalLink(value));
    return true;
  } catch {
    return false;
  }
}

export function DocumentsPage() {
  const location = useLocation();
  const isDocumentsIndexRoute =
    location.pathname === "/authenticated/documents" ||
    /^\/authenticated\/biblioteca\/[^/]+\/documentos$/.test(location.pathname);

  if (!isDocumentsIndexRoute) {
    return <Outlet />;
  }

  return <DocumentsListPage />;
}

function DocumentsListPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { org, profile } = useAuthContext();
  const { libraryId } = useLibraryScope();
  const { disciplines } = useLocalData();
  const codeOptionsConfig = useMemo(() => ({ requireManagement: false }), []);
  const codeOptions = useDocumentCodeOptions(codeOptionsConfig);
  const documentTypeOptions = useMemo(() => {
    if (codeOptions.docTypes.length > 0) {
      return codeOptions.docTypes.map((t: DocumentCodeOption) => ({
        value: t.code,
        label: t.code + (t.label ? ` · ${t.label}` : ""),
      }));
    }
    return DOC_TYPES;
  }, [codeOptions.docTypes]);

  const areaOptions = useMemo(() => {
    if (codeOptions.areas.length > 0) {
      return codeOptions.areas.map((a: DocumentCodeOption) => ({
        value: a.code,
        label: a.code + (a.label ? ` - ${a.label}` : ""),
      }));
    }
    return AREAS.map(a => ({ value: a, label: a }));
  }, [codeOptions.areas]);

  const disciplineOptions = useMemo(() => {
    if (codeOptions.disciplines.length > 0) {
      return codeOptions.disciplines;
    }
    return disciplines;
  }, [codeOptions.disciplines, disciplines]);
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<string>>(new Set());
  const [openNewDoc, setOpenNewDoc] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editForm, setEditForm] = useState<DocumentEditFormState>(
    createEmptyDocumentEditForm(),
  );
  const [documentPendingDelete, setDocumentPendingDelete] =
    useState<Document | null>(null);
  const [form, setForm] = useState({
    title: "",
    doc_type: "",
    area: "",
    description: "",
    project_id: "",
    discipline_id: "",
    register_revision: "00",
    register_status: "Recebido",
    external_link: "",
    received_at: getTodayIsoDate(),
    analysis_days: "",
    analysis_deadline: "",
    review_period_months: "24",
    next_review_at: "",
    file: null as File | null,
  });
  const [codeMode, setCodeMode] = useState<DocumentCreationCodeMode>("automatic");
  const [selectedCodePatternId, setSelectedCodePatternId] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualCodeReason, setManualCodeReason] = useState("");
  const [newDocStep, setNewDocStep] = useState(0);
  const [linkedDocumentIds, setLinkedDocumentIds] = useState<string[]>([]);

  const NEW_DOC_STEPS = [
    {
      number: 1,
      title: "Informações principais",
      description: "Preencha os dados do documento",
    },
    {
      number: 2,
      title: "Contexto e prazos",
      description: "Defina prazos e descrição",
    },
    {
      number: 3,
      title: "Arquivos e vínculo",
      description: "Anexe arquivos e links",
    },
    {
      number: 4,
      title: "Codificação",
      description: "Confirme o código gerado",
    },
  ];

  const { documents, loading, error, refetch } = useDocuments(filters);
  const filteredDocuments = useMemo(() => {
    if (optimisticDeletedIds.size === 0) return documents;
    return documents.filter((doc) => !optimisticDeletedIds.has(doc.id));
  }, [documents, optimisticDeletedIds]);
  const { createDocument, loading: creating, error: createError } = useCreateDocument();
  const {
    updateDocument,
    deleteDocument,
    loading: managingDocument,
    error: manageDocumentError,
  } = useManageDocuments();
  const projectOptions = useProjectOptions();
  const selectedLibraryProject = useMemo(
    () =>
      projectOptions.projects.find((project) => project.library_id === libraryId) ??
      (projectOptions.projects.length === 1 ? projectOptions.projects[0] : null),
    [libraryId, projectOptions.projects],
  );
  const operationalCalendarConfig = useMemo(
    () => ({ enabled: openNewDoc || Boolean(editingDocument) }),
    [openNewDoc, editingDocument],
  );
  const operationalCalendar = useOperationalCalendar(operationalCalendarConfig);
  const selectedProject = projectOptions.projects.find(
    (project) => project.id === form.project_id,
  );
  const selectedDiscipline = disciplineOptions.find(
    (discipline) => discipline.id === form.discipline_id,
  );
  const selectedEditProject = projectOptions.projects.find(
    (project) => project.id === editForm.project_id,
  );
  const creationControlsConfig = useMemo(
    () => ({
      docType: form.doc_type,
      area: form.area,
      discipline: selectedDiscipline?.code || null,
      projectId: form.project_id || null,
      projectCode: selectedProject?.code || null,
      selectedPatternId:
        codeMode === "selected_pattern" ? selectedCodePatternId : null,
    }),
    [
      form.doc_type,
      form.area,
      selectedDiscipline?.code,
      form.project_id,
      selectedProject?.code,
      codeMode,
      selectedCodePatternId,
    ],
  );
  const coding = useDocumentCreationControls(creationControlsConfig);
  const suggestionConfig = useMemo(
    () => ({
      docType: form.doc_type,
      area: form.area,
      projectId: form.project_id || null,
    }),
    [form.doc_type, form.area, form.project_id],
  );
  const tramiteSuggestion = useDocumentTramiteSuggestion(suggestionConfig);

  const statusOptions = useMemo(() => DOC_STATUS, []);
  const editTypeOptions = useMemo(() => {
    if (documentTypeOptions.length > 0 &&
      !documentTypeOptions.every((item) => item.value === item.label && DOC_TYPES.find((d) => d.value === item.value))) {
      return documentTypeOptions;
    }
    return codeOptions.docTypes.length > 0
      ? codeOptions.docTypes.map((t) => ({
          value: t.code,
          label: t.code + (t.label ? ` · ${t.label}` : ""),
        }))
      : DOC_TYPES;
  }, [codeOptions.docTypes, documentTypeOptions]);
  const editAreaOptions = useMemo(() => {
    if (codeOptions.areas.length > 0) {
      return codeOptions.areas.map((a) => ({
        value: a.code,
        label: a.code + (a.label ? ` - ${a.label}` : ""),
      }));
    }
    if (areaOptions.length > 0 &&
      !areaOptions.every((item) => (AREAS as readonly string[]).includes(item.value))) {
      return areaOptions;
    }
    return AREAS.map((a) => ({ value: a, label: a }));
  }, [areaOptions, codeOptions.areas]);
  const editDisciplineOptions = useMemo(() => {
    if (disciplineOptions.length > 0 &&
      codeOptions.disciplines.length > 0 &&
      disciplineOptions[0]?.id &&
      typeof (disciplineOptions[0] as unknown as DocumentCodeOption).code !== "undefined") {
      return codeOptions.disciplines.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.label,
      }));
    }
    if (disciplineOptions.length > 0 && disciplineOptions[0]?.id) {
      return disciplineOptions as unknown as Array<{ id: string; code: string | null; name: string }>;
    }
    return disciplines.map((d) => ({
      id: d.id,
      code: d.code ?? null,
      name: d.name,
    }));
  }, [disciplineOptions, codeOptions.disciplines, disciplines]);
  const typeOptions = useMemo(
    () => editTypeOptions,
    [editTypeOptions],
  );
  const showEditQualityReviewFields =
    editForm.doc_type === "PRO" && editForm.area === "QUA";
  const computedAnalysisDeadline = useMemo(() => {
    const analysisDays = Number.parseInt(form.analysis_days, 10);
    if (!form.received_at || Number.isNaN(analysisDays) || analysisDays < 0) {
      return "";
    }

    return (
      addBusinessDaysLocal(
        form.received_at,
        analysisDays,
        operationalCalendar.defaultCalendar,
        operationalCalendar.holidays,
      ) ?? ""
    );
  }, [
    form.analysis_days,
    form.received_at,
    operationalCalendar.defaultCalendar,
    operationalCalendar.holidays,
  ]);

  useEffect(() => {
    setForm((current) =>
      current.analysis_deadline === computedAnalysisDeadline
        ? current
        : { ...current, analysis_deadline: computedAnalysisDeadline },
    );
  }, [computedAnalysisDeadline]);

  const computedEditAnalysisDeadline = useMemo(() => {
    const analysisDays = Number.parseInt(editForm.analysis_days, 10);
    if (!editForm.received_at || Number.isNaN(analysisDays) || analysisDays < 0) {
      return "";
    }

    return (
      addBusinessDaysLocal(
        editForm.received_at,
        analysisDays,
        operationalCalendar.defaultCalendar,
        operationalCalendar.holidays,
      ) ?? ""
    );
  }, [
    editForm.analysis_days,
    editForm.received_at,
    operationalCalendar.defaultCalendar,
    operationalCalendar.holidays,
  ]);

  useEffect(() => {
    setEditForm((current) =>
      current.analysis_deadline === computedEditAnalysisDeadline
        ? current
        : { ...current, analysis_deadline: computedEditAnalysisDeadline },
    );
  }, [computedEditAnalysisDeadline]);

  useEffect(() => {
    if (!openNewDoc || !selectedLibraryProject?.id) return;
    setForm((current) =>
      current.project_id === selectedLibraryProject.id
        ? current
        : { ...current, project_id: selectedLibraryProject.id },
    );
  }, [openNewDoc, selectedLibraryProject?.id]);

  function openEditDialog(document: Document) {
    setEditingDocument(document);
    setEditForm(createEditFormFromDocument(document));
  }

  function closeEditDialog() {
    setEditingDocument(null);
    setEditForm(createEmptyDocumentEditForm());
  }

  async function handleCreateDocument(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.title.trim() || !form.doc_type || !form.area) {
      toast.error("Preencha título, tipo e área");
      return;
    }

    if (!isValidExternalLink(form.external_link)) {
      toast.error("Informe um link de documento válido.");
      return;
    }

    if (form.analysis_days && !form.received_at) {
      toast.error("Informe a data de recebimento para calcular o prazo de análise.");
      return;
    }

    const reviewPeriod = Number(form.review_period_months) || 24;
    const normalizedLink = normalizeExternalLink(form.external_link);
    const normalizedRevision = normalizeRevisionLabel(form.register_revision);
    const result = await createDocument({
      title: form.title.trim(),
      doc_type: form.doc_type,
      area: form.area,
      description: form.description.trim() || undefined,
      project_id: form.project_id || null,
      discipline_id: form.discipline_id || null,
      revision: parseRevisionNumber(normalizedRevision),
      register_revision: normalizedRevision,
      register_status: form.register_status,
      received_at: form.received_at || null,
      analysis_days: form.analysis_days ? Number.parseInt(form.analysis_days, 10) : null,
      analysis_deadline: form.analysis_deadline || null,
      external_link: normalizedLink || null,
      review_period_months: reviewPeriod,
      next_review_at: form.next_review_at || addMonths(reviewPeriod),
      file: form.file,
      advancedFields: {
        external_reference: normalizedLink || undefined,
        metadata: {
          document_register: {
            discipline_id: form.discipline_id || null,
            register_revision: normalizedRevision,
            register_status: form.register_status,
            received_at: form.received_at || null,
            analysis_days: form.analysis_days
              ? Number.parseInt(form.analysis_days, 10)
              : null,
            analysis_deadline: form.analysis_deadline || null,
            external_link: normalizedLink || null,
          },
          linked_document_ids: linkedDocumentIds.filter(Boolean),
        },
      },
      coding: {
        mode: codeMode,
        patternId:
          codeMode === "selected_pattern" ? selectedCodePatternId : null,
        manualCode: codeMode === "manual" ? manualCode : null,
        manualReason: codeMode === "manual" ? manualCodeReason : null,
      },
      creationContext: {
        mode: "standard",
        requestCodeAllocation: codeMode !== "manual",
        codePreview: coding.codePreview.code,
        codePatternId:
          codeMode === "selected_pattern"
            ? selectedCodePatternId
            : coding.codePreview.patternId,
        codePreviewMode: coding.codePreview.mode,
        projectCode: selectedProject?.code ?? null,
        projectName: selectedProject?.name ?? null,
        projectClient: selectedProject?.client_name ?? null,
        projectContract: selectedProject?.contract_number ?? null,
        suggestedTramiteId:
          tramiteSuggestion.suggestedTramite?.id ?? null,
        suggestedTramiteName:
          tramiteSuggestion.suggestedTramite?.name ?? null,
        suggestedTramiteVersionId:
          tramiteSuggestion.suggestedTramite?.published_version?.id ??
          tramiteSuggestion.suggestedTramite?.current_version?.id ??
          null,
        suggestedTramiteReason: tramiteSuggestion.suggestionReason,
      },
      validationOverrides: {
        allowedDocTypes: codeOptions.docTypes.map((t) => t.code).filter(Boolean),
        allowedAreas: codeOptions.areas.map((a) => a.code).filter(Boolean),
      },
    });

    if (!result) return;

    toast.success(`Documento criado: ${result.code ?? "Gerando..."}`);
    setOpenNewDoc(false);
    setForm({
      title: "",
      doc_type: "",
      area: "",
      description: "",
      project_id: selectedLibraryProject?.id ?? "",
      discipline_id: "",
      register_revision: "00",
      register_status: "Recebido",
      external_link: "",
      received_at: getTodayIsoDate(),
      analysis_days: "",
      analysis_deadline: "",
      review_period_months: "24",
      next_review_at: "",
      file: null,
    });
    setCodeMode("automatic");
    setSelectedCodePatternId("");
    setManualCode("");
    setManualCodeReason("");
    setLinkedDocumentIds([]);
    await refetch();
    navigate({ to: "/authenticated/documents/$documentId", params: { documentId: result.id } });
  }

  async function handleEditDocument(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!editingDocument) return;

    if (!editForm.title.trim() || !editForm.doc_type || !editForm.area) {
      toast.error("Preencha título, tipo e área.");
      return;
    }

    if (!isValidExternalLink(editForm.external_link)) {
      toast.error("Informe um link de documento válido.");
      return;
    }

    if (editForm.analysis_days && !editForm.received_at) {
      toast.error("Informe a data de recebimento para calcular o prazo de análise.");
      return;
    }

    const normalizedRevision = normalizeRevisionLabel(editForm.register_revision);
    const normalizedLink = normalizeExternalLink(editForm.external_link);
    const reviewPeriod = Number(editForm.review_period_months) || 24;

    const result = await updateDocument(editingDocument.id, {
      title: editForm.title.trim(),
      doc_type: editForm.doc_type,
      area: editForm.area,
      description: editForm.description.trim() || null,
      project_id: editForm.project_id || null,
      discipline_id: editForm.discipline_id || null,
      revision: parseRevisionNumber(normalizedRevision),
      register_revision: normalizedRevision,
      register_status: editForm.register_status,
      received_at: editForm.received_at || null,
      analysis_days: editForm.analysis_days
        ? Number.parseInt(editForm.analysis_days, 10)
        : null,
      analysis_deadline: editForm.analysis_deadline || null,
      external_link: normalizedLink || null,
      review_period_months: reviewPeriod,
      next_review_at: editForm.next_review_at || addMonths(reviewPeriod),
    });

    if (!result) return;

    toast.success("Documento atualizado com sucesso.");
    if (result.warning) {
      toast.warning(result.warning);
    }
    closeEditDialog();
    await refetch();
  }

  async function handleDeleteDocument() {
    if (!documentPendingDelete) return;
    const deletingId = documentPendingDelete.id;

    setOptimisticDeletedIds((prev) => {
      const next = new Set(prev);
      next.add(deletingId);
      return next;
    });
    setDocumentPendingDelete(null);

    const result = await deleteDocument(deletingId);
    if (result?.warning) {
      toast.warning(result.warning);
    } else if (result) {
      toast.success("Documento excluído com sucesso.");
    } else {
      // Se retornar null, tivemos erro no hook; então reverter o optimistic
      setOptimisticDeletedIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingId);
        return next;
      });
    }
    await refetch();
    setOptimisticDeletedIds((prev) => {
      const next = new Set(prev);
      next.delete(deletingId);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documentos</h1>
          <p className="text-muted-foreground text-sm">Controle real de documentos técnicos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => exportDocumentsToExcel(filteredDocuments, org?.name ?? "TRAMITA")} disabled={loading || filteredDocuments.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          <Button asChild variant="outline">
            <Link to="/authenticated/documentos/novo-inteligente">
              <Sparkles className="h-4 w-4 mr-2" /> Novo Documento Inteligente
            </Link>
          </Button>
        <Dialog open={openNewDoc} onOpenChange={(open) => {
          setOpenNewDoc(open);
          if (open) {
            setNewDocStep(0);
            setLinkedDocumentIds([]);
            setForm((current) => ({
              ...current,
              project_id: selectedLibraryProject?.id ?? current.project_id,
            }));
          } else {
            setLinkedDocumentIds([]);
          }
        }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: theme.button, color: theme.text }}>
              <Plus className="h-4 w-4 mr-2" /> Novo Documento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto p-0">
            <DialogHeader className="p-6 pb-2 flex-row items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-white shadow-md">
                  <FilePlus2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    Novo Documento
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Preencha as informações para cadastrar o documento e gerar o código oficial.
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="px-6 pb-4">
              <div className="flex items-center justify-between gap-2">
                {NEW_DOC_STEPS.map((step, index) => (
                  <div key={step.title} className="flex items-center flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => { if (index <= newDocStep) setNewDocStep(index); }}
                      className="flex items-center gap-2 min-w-0 flex-1 group"
                    >
                      <div
                        className={cn(
                          "h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all",
                          index === newDocStep
                            ? "bg-sky-500 border-sky-500 text-white shadow-sm"
                            : index < newDocStep
                              ? "bg-emerald-50 border-emerald-400 text-emerald-600"
                              : "bg-white border-gray-200 text-gray-400"
                        )}
                      >
                        {index < newDocStep ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <span>{index + 1}</span>
                        )}
                      </div>
                      <div className="hidden md:block text-left min-w-0">
                        <p
                          className={cn(
                            "text-xs font-semibold truncate",
                            index <= newDocStep ? "text-gray-900" : "text-gray-400"
                          )}
                        >
                          {step.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {step.description}
                        </p>
                      </div>
                    </button>
                    {index < NEW_DOC_STEPS.length - 1 && (
                      <div
                        className={cn(
                          "h-0.5 mx-2 flex-1 rounded-full transition-all",
                          index < newDocStep ? "bg-emerald-400" : "bg-gray-200"
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateDocument}>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.1fr)]">
                <div className="p-6 pt-2 space-y-5 border-r border-gray-100">
                  {newDocStep === 0 && (
                    <div className="space-y-6">
                      <div className="border-l-2 border-sky-500 pl-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-sky-600 flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5" />
                          Informações principais
                        </p>
                      </div>

                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12">
                          <Label htmlFor="doc-title" className="text-sm font-semibold">
                            Título do documento <span className="text-destructive">*</span>
                          </Label>
                          <div className="relative mt-1.5">
                            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500/70" />
                            <Input
                              id="doc-title"
                              value={form.title}
                              onChange={(e) => setForm({ ...form, title: e.target.value })}
                              placeholder="Ex.: Manual de Controle de Documentos Técnicos"
                              className="pl-9"
                              required
                            />
                          </div>
                        </div>
                        <div className="col-span-8">
                          <Label className="text-sm font-semibold">
                            Código (será gerado)
                          </Label>
                          <div className="relative mt-1.5">
                            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-500/70" />
                            <Input
                              value={coding.codePreview.code || "ORG - ??? - ??? - ???"}
                              readOnly
                              className="pl-9 font-mono bg-slate-50"
                            />
                          </div>
                        </div>
                        <div className="col-span-4">
                          <div className="flex items-center justify-between mt-[1.1rem]">
                            <Info className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </div>

                        <div className="col-span-5">
                          <Label className="text-sm font-semibold">
                            Tipo de documento <span className="text-destructive">*</span>
                          </Label>
                          <div className="relative mt-1.5">
                            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/70 z-10" />
                            <Select value={form.doc_type} onValueChange={(value) => setForm({ ...form, doc_type: value })}>
                              <SelectTrigger className="pl-9">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {documentTypeOptions.map((type: { value: string; label: string }) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="col-span-5">
                          <Label className="text-sm font-semibold">
                            Disciplina
                          </Label>
                          <div className="relative mt-1.5">
                            <FolderKanban className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500/70 z-10" />
                            <Select
                              value={form.discipline_id || "none"}
                              onValueChange={(value) =>
                                setForm({
                                  ...form,
                                  discipline_id: value === "none" ? "" : value,
                                })
                              }
                            >
                              <SelectTrigger className="pl-9">
                                <SelectValue placeholder="Sem disciplina" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sem disciplina</SelectItem>
                                {disciplineOptions.map((discipline) => (
                                  <SelectItem key={discipline.id} value={discipline.id}>
                                    {discipline.code ? `${discipline.code} · ` : ""}
                                    {"name" in discipline ? discipline.name : discipline.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <Label className="text-sm font-semibold">
                            Revisão
                          </Label>
                          <Input
                            value={form.register_revision}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                register_revision: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder="0"
                            className="mt-1.5"
                          />
                        </div>

                        <div className="col-span-6">
                          <Label className="text-sm font-semibold">
                            Área <span className="text-destructive">*</span>
                          </Label>
                          <div className="relative mt-1.5">
                            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600/70 z-10" />
                            <Select value={form.area} onValueChange={(value) => setForm({ ...form, area: value })}>
                              <SelectTrigger className="pl-9">
                                <SelectValue placeholder="Selecione a área" />
                              </SelectTrigger>
                              <SelectContent>
                                {areaOptions.map((area) => (
                                  <SelectItem key={area.value} value={area.value}>
                                    {area.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="col-span-6">
                          <Label className="text-sm font-semibold">
                            Projeto <span className="text-destructive">*</span>
                          </Label>
                          <div className="relative mt-1.5">
                            <FolderKanban className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500/70 z-10" />
                            <Select
                              value={form.project_id || "none"}
                              onValueChange={(value) =>
                                setForm({
                                  ...form,
                                  project_id: value === "none" ? "" : value,
                                })
                              }
                              disabled={
                                Boolean(selectedLibraryProject) ||
                                (!projectOptions.canUseProjects &&
                                  projectOptions.projects.length === 0)
                              }
                            >
                              <SelectTrigger className="pl-9">
                                <SelectValue
                                  placeholder={
                                    projectOptions.projects.length > 0
                                      ? "Selecione um projeto"
                                      : "Sem projeto"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sem projeto</SelectItem>
                                {projectOptions.projects.map((project) => (
                                  <SelectItem key={project.id} value={project.id}>
                                    {project.code ? `${project.code} - ` : ""}
                                    {project.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {selectedLibraryProject && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                              Projeto preenchido automaticamente pela biblioteca ativa.
                            </p>
                          )}
                          {projectOptions.compatibilityMessage && (
                            <p className="text-[11px] text-muted-foreground mt-1.5">
                              {projectOptions.compatibilityMessage}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {newDocStep === 1 && (
                    <div className="space-y-6">
                      <div className="border-l-2 border-sky-500 pl-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-sky-600 flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5" />
                          Status e datas
                        </p>
                      </div>

                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-6">
                          <Label className="text-sm font-semibold">
                            Status do cadastro
                          </Label>
                          <div className="relative mt-1.5">
                            <Circle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/70 z-10" />
                            <Select
                              value={form.register_status}
                              onValueChange={(value) =>
                                setForm({ ...form, register_status: value })
                              }
                            >
                              <SelectTrigger className="pl-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {REGISTER_STATUS_OPTIONS.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="col-span-6">
                          <Label className="text-sm font-semibold">
                            Data de recebimento
                          </Label>
                          <div className="relative mt-1.5">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500/70 z-10" />
                            <Input
                              type="date"
                              value={form.received_at}
                              onChange={(e) =>
                                setForm({ ...form, received_at: e.target.value })
                              }
                              className="pl-9"
                            />
                          </div>
                        </div>
                        <div className="col-span-6">
                          <Label className="text-sm font-semibold">
                            Dias para análise
                          </Label>
                          <div className="relative mt-1.5">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500/70 z-10" />
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={form.analysis_days}
                              onChange={(e) =>
                                setForm({ ...form, analysis_days: e.target.value })
                              }
                              placeholder="0"
                              className="pl-9"
                            />
                          </div>
                        </div>
                        <div className="col-span-6">
                          <Label className="text-sm font-semibold">
                            Prazo de análise
                          </Label>
                          <div className="relative mt-1.5">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-500/70 z-10" />
                            <Input type="date" value={form.analysis_deadline} readOnly className="pl-9 bg-slate-50" />
                          </div>
                        </div>
                      </div>

                      <div className="border-l-2 border-violet-500 pl-4 mt-8">
                        <p className="text-xs font-bold uppercase tracking-wider text-violet-600 flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5" />
                          Descrição e contexto
                        </p>
                      </div>

                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12">
                          <Label className="text-sm font-semibold">
                            Descrição
                          </Label>
                          <Textarea
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            placeholder="Descreva o objetivo e o conteúdo do documento..."
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>

                        <div className="col-span-12">
                          <Label className="text-sm font-semibold">
                            Contexto operacional vinculado (opcional)
                          </Label>
                          <div className="relative mt-1.5">
                            <FolderKanban className="absolute left-3 top-3 h-4 w-4 text-amber-500/70 z-10" />
                            <Select value={selectedProject ? "selected" : "none"} disabled>
                              <SelectTrigger className="pl-9 bg-slate-50 opacity-90">
                                <SelectValue
                                  placeholder={
                                    selectedProject
                                      ? `${selectedProject.code ? `${selectedProject.code} - ` : ""}${selectedProject.name}`
                                      : "Ex.: Procedimentos internos, normas aplicáveis, etapas do projeto..."
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sem contexto</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {selectedProject && (
                            <p className="text-[11px] text-muted-foreground mt-1.5 rounded-md border bg-muted/30 p-3">
                              {[
                                selectedProject.client_name
                                  ? `Cliente: ${selectedProject.client_name}`
                                  : null,
                                selectedProject.contract_number
                                  ? `Contrato: ${selectedProject.contract_number}`
                                  : null,
                                selectedProject.location
                                  ? `Local: ${selectedProject.location}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "Contexto operacional vinculado."}
                            </p>
                          )}
                        </div>

                        <div className="col-span-6">
                          <Label className="text-sm font-semibold">
                            Link do documento (opcional)
                          </Label>
                          <div className="relative mt-1.5">
                            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500/70 z-10" />
                            <Input
                              type="url"
                              placeholder="https://..."
                              value={form.external_link}
                              onChange={(e) =>
                                setForm({ ...form, external_link: e.target.value })
                              }
                              className="pl-9"
                            />
                          </div>
                        </div>
                        <div className="col-span-6">
                          <Label className="text-sm font-semibold">
                            Responsável pelo cadastro
                          </Label>
                          <div className="relative mt-1.5">
                            <User className="absolute left-3 top-[11px] h-4 w-4 text-emerald-500/70 z-10" />
                            <Select value={profile?.id || "none"} disabled>
                              <SelectTrigger className="pl-9 bg-slate-50 opacity-90">
                                <SelectValue
                                  placeholder={profile?.full_name || "Usuário atual"}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Usuário atual</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {newDocStep === 2 && (
                    <div className="space-y-6">
                      <div className="border-l-2 border-sky-500 pl-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-sky-600 flex items-center gap-2">
                          <Archive className="h-3.5 w-3.5" />
                          Arquivos e vínculo
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <Label className="text-sm font-semibold">
                            Arquivo (opcional)
                          </Label>
                          <div className="relative mt-1.5">
                            <FilePlus2 className="absolute left-3 top-3 h-4 w-4 text-sky-500/70 z-10" />
                            <Input
                              type="file"
                              accept={DOCUMENT_FILE_ACCEPT}
                              className="pl-9 pt-2"
                              onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                const fileError = validateDocumentFile(file);
                                if (fileError) {
                                  e.currentTarget.value = "";
                                  setForm({ ...form, file: null });
                                  toast.error(fileError);
                                  return;
                                }
                                setForm({ ...form, file });
                              }}
                            />
                          </div>
                          {form.file && (
                            <div className="mt-3 rounded-xl border border-dashed border-sky-200 bg-sky-50/40 p-4 flex items-center justify-between">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-10 w-10 rounded-lg bg-white border border-sky-100 flex items-center justify-center shadow-sm">
                                  <FileText className="h-5 w-5 text-sky-600" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 truncate">
                                    {form.file.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {(form.file.size / 1024 / 1024).toFixed(2)} MB
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setForm({ ...form, file: null })}
                                className="text-destructive hover:text-destructive/90"
                              >
                                Remover
                              </Button>
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <Label className="text-sm font-semibold flex items-center gap-2">
                              <Link2 className="h-4 w-4 text-violet-500" />
                              Vínculos com documentos
                            </Label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setLinkedDocumentIds([...linkedDocumentIds, ""])}
                              className="h-8 gap-1 border-dashed border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Adicionar
                            </Button>
                          </div>

                          {linkedDocumentIds.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 p-6 text-center">
                              <Link2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                              <p className="text-sm text-muted-foreground">
                                Nenhum vínculo adicionado. Clique em <strong>Adicionar</strong> para vincular outros documentos cadastrados.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {linkedDocumentIds.map((docId, index) => {
                                const selectedDoc = documents.find((d) => d.id === docId);
                                return (
                                  <div
                                    key={`link-${index}-${docId || "empty"}`}
                                    className="flex items-stretch gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
                                  >
                                    <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                                      <div className="col-span-4">
                                        <Select
                                          value={docId || "none"}
                                          onValueChange={(value) => {
                                            const next = [...linkedDocumentIds];
                                            next[index] = value === "none" ? "" : value;
                                            setLinkedDocumentIds(next);
                                          }}
                                        >
                                          <SelectTrigger className="h-9 text-xs">
                                            <SelectValue placeholder="Selecione o código" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">Selecione...</SelectItem>
                                            {documents
                                              .filter(
                                                (d) =>
                                                  d.code &&
                                                  !linkedDocumentIds.some(
                                                    (existingId, i) => i !== index && existingId === d.id,
                                                  ),
                                              )
                                              .map((d) => (
                                                <SelectItem key={d.id} value={d.id} className="text-xs">
                                                  {d.code}
                                                </SelectItem>
                                              ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="col-span-7 pl-1 min-w-0">
                                        {selectedDoc ? (
                                          <div className="flex items-center gap-2 min-w-0">
                                            <div className="h-7 w-7 shrink-0 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
                                              <FileText className="h-3.5 w-3.5 text-white" />
                                            </div>
                                            <div className="min-w-0">
                                              <p className="text-xs font-semibold text-slate-800 truncate">
                                                {selectedDoc.title}
                                              </p>
                                              <p className="text-[11px] text-muted-foreground truncate">
                                                {selectedDoc.area} · Rev. {selectedDoc.register_revision || selectedDoc.revision}
                                              </p>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-xs text-muted-foreground italic pl-2">
                                            Selecione um documento para ver os detalhes
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        const next = linkedDocumentIds.filter((_, i) => i !== index);
                                        setLinkedDocumentIds(next);
                                      }}
                                      className="h-9 w-9 p-0 text-slate-400 hover:text-destructive hover:bg-destructive/10"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-3">
                          <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Info className="h-4 w-4 text-sky-500" />
                            Informações importantes
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            O prazo de análise é calculado automaticamente em dias úteis,
                            desconsiderando fins de semana e os feriados cadastrados no
                            calendário operacional.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {newDocStep === 3 && (
                    <div className="space-y-6">
                      <div className="border-l-2 border-sky-500 pl-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-sky-600 flex items-center gap-2">
                          <Shield className="h-3.5 w-3.5" />
                          Codificação
                        </p>
                      </div>

                      <DocumentCodingControls
                        mode={codeMode}
                        onModeChange={(nextMode) => {
                          setCodeMode(nextMode);
                          if (nextMode !== "selected_pattern") {
                            setSelectedCodePatternId("");
                          }
                        }}
                        selectedPatternId={selectedCodePatternId}
                        onSelectedPatternChange={setSelectedCodePatternId}
                        manualCode={manualCode}
                        onManualCodeChange={setManualCode}
                        manualReason={manualCodeReason}
                        onManualReasonChange={setManualCodeReason}
                        patterns={coding.patterns}
                        applicablePatternIds={coding.applicablePatterns.map(
                          (pattern) => pattern.id,
                        )}
                        preview={coding.codePreview}
                        isLoading={coding.isLoading}
                        supportsPatternSelection={coding.supportsPatternSelection}
                        supportsManualCode={coding.supportsManualCode}
                        compatibilityMessage={coding.integrationMessage}
                      />

                      {tramiteSuggestion.suggestedTramite && (
                        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                          <p className="text-sm font-semibold text-violet-800 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Trâmite sugerido
                          </p>
                          <p className="mt-1 text-xs text-violet-700">
                            <strong>{tramiteSuggestion.suggestedTramite.name}</strong> estará
                            disponível após criação. {tramiteSuggestion.suggestionReason}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t pt-5 mt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setOpenNewDoc(false);
                        setLinkedDocumentIds([]);
                      }}
                      className="text-muted-foreground"
                    >
                      Cancelar
                    </Button>
                    <div className="flex items-center gap-2">
                      {newDocStep > 0 && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setNewDocStep((s) => s - 1)}
                        >
                          Voltar
                        </Button>
                      )}
                      {newDocStep < NEW_DOC_STEPS.length - 1 ? (
                        <Button
                          type="button"
                          onClick={() => {
                            if (newDocStep === 0 && (!form.title || !form.doc_type || !form.area)) {
                              toast.error("Preencha título, tipo e área para continuar.");
                              return;
                            }
                            setNewDocStep((s) => s + 1);
                          }}
                          className="bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-600 hover:to-emerald-600 text-white shadow-md"
                        >
                          Continuar
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          disabled={creating}
                          className="bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-600 hover:to-emerald-600 text-white shadow-md"
                        >
                          {creating ? "Salvando..." : "Salvar documento"}
                          <CheckCircle2 className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {createError && (
                    <p className="text-sm text-destructive">{createError}</p>
                  )}
                </div>

                <div className="bg-gradient-to-b from-slate-50/80 to-white p-6 pt-2 space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">
                      Preview da Codificação
                    </p>
                    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                      <p className="text-center text-xl font-bold font-mono tracking-wider text-slate-800">
                        {coding.codePreview.code || "ORG - ??? - ??? - ????"}
                      </p>
                      <div className="grid grid-cols-4 gap-1.5 mt-4">
                        <div className="rounded-lg bg-sky-50 border border-sky-100 p-2 text-center">
                          <p className="text-[10px] font-semibold text-sky-700 uppercase tracking-tight">ORG</p>
                          <p className="text-[9px] text-sky-600/70 mt-0.5">Organização</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-center">
                          <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-tight">
                            {form.area || "???"}
                          </p>
                          <p className="text-[9px] text-emerald-600/70 mt-0.5">Área</p>
                        </div>
                        <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 text-center">
                          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-tight">
                            {form.doc_type || "???"}
                          </p>
                          <p className="text-[9px] text-amber-600/70 mt-0.5">Tipo</p>
                        </div>
                        <div className="rounded-lg bg-slate-100 border border-slate-200 p-2 text-center">
                          <p className="text-[10px] font-semibold text-slate-600">????</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">Sequência</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">
                      O código será confirmado pelo banco durante a criação.
                    </p>
                    <div className="rounded-lg bg-sky-50/50 border border-sky-100 p-2.5 flex items-start gap-2">
                      <Info className="h-3.5 w-3.5 text-sky-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-sky-700 leading-relaxed">
                        Envie para a codificação
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1 flex items-center gap-1.5">
                      <Shield className="h-3 w-3" />
                      Compatibilidade de Codificação
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {coding.integrationMessage ? "Conectado" : "Ciclo configurado"}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {coding.integrationMessage ||
                        "A criação continua com codificação automática; escolha de padrão e código manual estão desativados."}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white shadow-sm p-4 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 px-1 flex items-center gap-1.5">
                      <Lightbulb className="h-3 w-3" />
                      Dicas rápidas
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-emerald-800 leading-relaxed">
                          Preencha corretamente o tipo, área e projeto para garantir a codificação automática.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-emerald-800 leading-relaxed">
                          O código final será confirmado após salvar o documento.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-emerald-800 leading-relaxed">
                          Você poderá editar as informações antes da aprovação.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card className="shadow-md">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por título..."
                value={filters.search ?? ""}
                onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
              />
            </div>
            <Select value={filters.status ?? "all"} onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {statusOptions.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.doc_type ?? "all"} onValueChange={(value) => setFilters({ ...filters, doc_type: value === "all" ? undefined : value })}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {typeOptions.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.area ?? "all"} onValueChange={(value) => setFilters({ ...filters, area: value === "all" ? undefined : value })}>
              <SelectTrigger><SelectValue placeholder="Área" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as áreas</SelectItem>
                {editAreaOptions.map((area) => <SelectItem key={area.value} value={area.value}>{area.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Circle className="h-3 w-3 fill-current text-emerald-500" />
              No prazo
            </span>
            <span className="inline-flex items-center gap-2">
              <Circle className="h-3 w-3 fill-current text-amber-500" />
              Vencendo em 3 dias
            </span>
            <span className="inline-flex items-center gap-2">
              <Circle className="h-3 w-3 fill-current text-red-500" />
              Atrasado
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Código</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Revisão Atual</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead className="w-[180px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center">
                      Carregando documentos...
                    </TableCell>
                  </TableRow>
                )}
                {error && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-destructive"
                    >
                      {error}
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && filteredDocuments.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Nenhum documento encontrado.{" "}
                      <Button variant="link" onClick={() => {
                        setOpenNewDoc(true);
                        setNewDocStep(0);
                        setLinkedDocumentIds([]);
                      }}>
                        Criar documento
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  !error &&
                  filteredDocuments.map((doc) => {
                    const signal = getDeadlineSignal(doc.analysis_deadline ?? null);
                    const displayedStatus = doc.register_status?.trim();
                    const displayedRevision =
                      doc.register_revision?.trim() ||
                      String(doc.revision).padStart(2, "0");

                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <Circle
                            className={`h-3.5 w-3.5 fill-current ${signal.dotClassName}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {doc.code ?? "Gerando..."}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>{doc.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {doc.project?.name || "Sem projeto"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {displayedStatus ? (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              {displayedStatus}
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              {getDocTypeLabel(doc.doc_type)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{displayedRevision}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge className={signal.className}>
                              {signal.label}
                            </Badge>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(doc.analysis_deadline ?? null)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(doc)}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="bg-red-600 text-white hover:bg-red-600/90"
                              onClick={() => setDocumentPendingDelete(doc)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Excluir
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(editingDocument)}
        onOpenChange={(open) => {
          if (!open) {
            closeEditDialog();
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Documento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditDocument} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-12">
                <Label>Título *</Label>
                <Input
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm({ ...editForm, title: e.target.value })
                  }
                  required
                />
              </div>
              <div className="md:col-span-12">
                <Label>Código</Label>
                <Input value={editingDocument?.code ?? "—"} readOnly />
              </div>
              <div className="md:col-span-5">
                <Label>Tipo *</Label>
                <Select
                  value={editForm.doc_type}
                  onValueChange={(value) =>
                    setEditForm({ ...editForm, doc_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-6">
                <Label>Disciplina</Label>
                <Select
                  value={editForm.discipline_id || "none"}
                  onValueChange={(value) =>
                    setEditForm({
                      ...editForm,
                      discipline_id: value === "none" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma disciplina" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem disciplina</SelectItem>
                    {editDisciplineOptions.map((discipline) => (
                      <SelectItem key={discipline.id} value={discipline.id}>
                        {discipline.code ? `${discipline.code} · ` : ""}
                        {discipline.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-1">
                <Label>Revisão</Label>
                <Input
                  value={editForm.register_revision}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      register_revision: e.target.value.toUpperCase(),
                    })
                  }
                />
              </div>
              <div className="md:col-span-6">
                <Label>Área *</Label>
                <Select
                  value={editForm.area}
                  onValueChange={(value) =>
                    setEditForm({ ...editForm, area: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {editAreaOptions.map((area) => (
                      <SelectItem key={area.value} value={area.value}>
                        {area.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-6">
                <Label>Projeto</Label>
                <Select
                  value={editForm.project_id || "none"}
                  onValueChange={(value) =>
                    setEditForm({
                      ...editForm,
                      project_id: value === "none" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem projeto</SelectItem>
                    {projectOptions.projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.code ? `${project.code} · ` : ""}
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projectOptions.compatibilityMessage && (
                  <p className="text-xs text-muted-foreground">
                    {projectOptions.compatibilityMessage}
                  </p>
                )}
              </div>
              <div className="md:col-span-6">
                <Label>Status do cadastro</Label>
                <Select
                  value={editForm.register_status}
                  onValueChange={(value) =>
                    setEditForm({ ...editForm, register_status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGISTER_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-6">
                <Label>Data de Recebimento</Label>
                <Input
                  type="date"
                  value={editForm.received_at}
                  onChange={(e) =>
                    setEditForm({ ...editForm, received_at: e.target.value })
                  }
                />
              </div>
              <div className="md:col-span-6">
                <Label>Dias para Análise</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.analysis_days}
                  onChange={(e) =>
                    setEditForm({ ...editForm, analysis_days: e.target.value })
                  }
                />
              </div>
              <div className="md:col-span-6">
                <Label>Prazo de Análise</Label>
                <Input type="date" value={editForm.analysis_deadline} readOnly />
              </div>
              <div className="md:col-span-12">
                <Label>Descrição</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                />
              </div>
              {selectedEditProject && (
                <div className="md:col-span-12">
                  <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    {[
                      selectedEditProject.client_name
                        ? `Cliente: ${selectedEditProject.client_name}`
                        : null,
                      selectedEditProject.contract_number
                        ? `Contrato: ${selectedEditProject.contract_number}`
                        : null,
                      selectedEditProject.location
                        ? `Local: ${selectedEditProject.location}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Contexto operacional vinculado."}
                  </p>
                </div>
              )}
              <div className="md:col-span-12">
                <Label>Link do documento</Label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={editForm.external_link}
                  onChange={(e) =>
                    setEditForm({ ...editForm, external_link: e.target.value })
                  }
                />
              </div>
              {showEditQualityReviewFields && (
                <>
                  <div className="md:col-span-6">
                    <Label>Período de revisão</Label>
                    <Select
                      value={editForm.review_period_months}
                      onValueChange={(value) =>
                        setEditForm({ ...editForm, review_period_months: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REVIEW_PERIODS.map((period) => (
                          <SelectItem key={period} value={String(period)}>
                            {period} meses
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-6">
                    <Label>Próxima revisão</Label>
                    <Input
                      type="date"
                      value={editForm.next_review_at}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          next_review_at: e.target.value,
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>
            {manageDocumentError && (
              <p className="text-sm text-destructive">{manageDocumentError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeEditDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={managingDocument}
                style={{ backgroundColor: theme.button, color: theme.text }}
              >
                {managingDocument ? "Salvando..." : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(documentPendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setDocumentPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o documento selecionado da lista. Se ele já tiver
              versões ou fluxos vinculados, a exclusão pode ser bloqueada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {documentPendingDelete && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{documentPendingDelete.title}</p>
              <p className="text-xs text-muted-foreground">
                {documentPendingDelete.code ?? "Sem código"}
              </p>
            </div>
          )}
          {manageDocumentError && (
            <p className="text-sm text-destructive">{manageDocumentError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteDocument();
              }}
              className="bg-red-600 text-white hover:bg-red-600/90"
            >
              Excluir documento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
