import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { WorkflowStepRoutingFields } from "@/components/workflow/WorkflowStepRoutingFields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ArrowLeft, Download, Upload } from "lucide-react";
import { DOC_STATUS, DOC_TYPES, USER_ROLES } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import { useApprovalFlow, type WorkflowStepInput } from "@/hooks/useApprovalFlow";
import { useWorkflowActors } from "@/hooks/useWorkflowActors";
import { ApprovalStep, useDocument } from "@/hooks/useDocument";
import { useDocumentCorrection } from "@/hooks/useDocumentCorrection";
import { useAuditTrail } from "@/hooks/useAuditTrail";
import { mapAuditEntriesToRecentActivities } from "@/hooks/useOperationalCockpit";
import { RecentActivityList } from "@/components/operational/RecentActivityList";
import { formatDueLabel, getDueStatus } from "@/lib/workflowDates";
import type { WorkflowAssignmentType } from "@/lib/workflowCompatibility";
import {
  canEditDocumentInCorrection,
  getLatestRejectedStep,
  getStepCorrectionRound,
  isDocumentInCorrection,
} from "@/lib/documentCorrection";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/documents/$documentId")({
  component: DocumentDetailPage,
});

const DEFAULT_WORKFLOW_STEPS: WorkflowStepInput[] = [
  { step: 1, step_label: "Revisão Técnica", required_role: "reviewer", assignment_type: "role", assignee_id: null, assignee_user_id: null, due_mode: "days", due_days: 2, due_at: null, escalation_user_id: null },
  { step: 2, step_label: "Aprovação Final", required_role: "approver", assignment_type: "role", assignee_id: null, assignee_user_id: null, due_mode: "days", due_days: 2, due_at: null, escalation_user_id: null },
];

function getStatusMeta(status: string) {
  return DOC_STATUS.find((item) => item.value === status);
}

function getDocTypeLabel(docType: string) {
  return DOC_TYPES.find((item) => item.value === docType)?.label ?? docType;
}

function getRoleLabel(role: string) {
  return USER_ROLES.find((item) => item.value === role)?.label ?? role;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatFileSize(size: number | null) {
  if (!size) return "—";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isReviewSoon(value: string | null) {
  if (!value) return false;
  const today = new Date();
  const reviewDate = new Date(value);
  const diffDays = Math.ceil((reviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays < 30;
}

function getStepCircleClass(status: string) {
  if (status === "approved") return "bg-emerald-600 text-white";
  if (status === "rejected") return "bg-destructive text-destructive-foreground";
  if (status === "skipped" || status === "cancelled") return "bg-muted text-muted-foreground";
  return "bg-slate-200 text-slate-700";
}

function stepMatchesDocumentStatus(step: ApprovalStep, documentStatus: string) {
  if (!["in_review", "pending_approval"].includes(documentStatus)) return false;
  if (step.started_at) return true;
  if (step.required_role === "approver") return documentStatus === "pending_approval";
  return documentStatus === "in_review";
}

function getStepAssignmentType(step: ApprovalStep): WorkflowAssignmentType {
  if (step.assignment_type === "group" || step.assignee_group_id) return "group";
  if (step.assignment_type === "user" || step.assignee_user_id || step.assignee_id) return "user";
  return "role";
}

function getStepAssignmentLabel(step: ApprovalStep) {
  const assignmentType = getStepAssignmentType(step);
  if (assignmentType === "group") {
    return `Grupo: ${step.assignee_group?.name ?? "não identificado"}`;
  }
  if (assignmentType === "user") {
    return `Usuário: ${step.assignee_user?.full_name ?? step.assignee?.full_name ?? "não identificado"}`;
  }
  return `Papel: ${getRoleLabel(step.required_role)}`;
}

function getAssignmentTypeLabel(step: ApprovalStep) {
  const assignmentType = getStepAssignmentType(step);
  if (assignmentType === "group") return "Grupo";
  if (assignmentType === "user") return "Usuário";
  return "Papel";
}

function workflowStepsForCorrection(steps: ApprovalStep[]): WorkflowStepInput[] {
  const latestRejectedStep = getLatestRejectedStep(steps);
  if (!latestRejectedStep) return DEFAULT_WORKFLOW_STEPS;
  const latestRound = getStepCorrectionRound(latestRejectedStep);
  const roundSteps = steps
    .filter((step) => getStepCorrectionRound(step) === latestRound)
    .sort((left, right) => left.step - right.step);
  const uniqueSteps = new Map<number, ApprovalStep>();
  roundSteps.forEach((step) => uniqueSteps.set(step.step, step));

  if (!uniqueSteps.size) return DEFAULT_WORKFLOW_STEPS;
  return [...uniqueSteps.values()].map((step, index) => {
    const assignmentType = getStepAssignmentType(step);
    return {
      step: index + 1,
      step_label: step.step_label,
      required_role: step.required_role,
      assignment_type: assignmentType,
      assignee_id: assignmentType === "user" ? step.assignee_user_id ?? step.assignee_id : null,
      assignee_user_id: assignmentType === "user" ? step.assignee_user_id ?? step.assignee_id : null,
      assignee_group_id: assignmentType === "group" ? step.assignee_group_id ?? null : null,
      due_mode: "days",
      due_days: step.due_days ?? 2,
      due_at: null,
      instructions: step.instructions ?? null,
      escalation_user_id: step.escalation_user_id,
    };
  });
}

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const { profile } = useAuthContext();
  const { document, loading, error, refetch } = useDocument(documentId);
  const {
    entries: auditEntries,
    loading: auditLoading,
    refetch: refetchAudit,
  } = useAuditTrail({ document_id: documentId });
  const {
    submitForReview,
    resubmitAfterCorrection,
    actOnStep,
    obsoleteDocument,
    loading: actionLoading,
    error: actionError,
    compatibilityMessage: flowCompatibilityMessage,
  } = useApprovalFlow();
  const {
    saveCorrection,
    loading: correctionSaving,
    error: correctionError,
  } = useDocumentCorrection();
  const {
    users: workflowUsers,
    groups: workflowGroups,
    groupMembers: workflowGroupMembers,
    roles: workflowRoles,
    isLoading: actorsLoading,
    error: actorsError,
    canUseGroups,
    compatibilityMessage: actorsCompatibilityMessage,
  } = useWorkflowActors();
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [obsoleteDialogOpen, setObsoleteDialogOpen] = useState(false);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepInput[]>(DEFAULT_WORKFLOW_STEPS);
  const [stepAction, setStepAction] = useState<{ step: ApprovalStep; action: "approve" | "reject" } | null>(null);
  const [stepComment, setStepComment] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [correctionForm, setCorrectionForm] = useState({
    title: "",
    description: "",
    nextReviewAt: "",
    responseComment: "",
    file: null as File | null,
  });

  async function handleDownload(filePath: string | null) {
    if (!filePath) return;
    const { data, error: signedUrlError } = await supabase.storage
      .from("documents")
      .createSignedUrl(filePath, 1800);

    if (signedUrlError || !data?.signedUrl) {
      toast.error(signedUrlError?.message ?? "Não foi possível gerar o link de download");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  async function handleSubmitForReview() {
    if (!document) return;
    const steps = workflowSteps.map((step, index) => {
      const assignmentType = step.assignment_type
        ?? (step.assignee_group_id ? "group" : step.assignee_user_id || step.assignee_id ? "user" : "role");
      const assigneeUserId = assignmentType === "user"
        ? step.assignee_user_id || step.assignee_id || null
        : null;

      return {
        ...step,
        step: index + 1,
        assignment_type: assignmentType,
        assignee_id: assigneeUserId,
        assignee_user_id: assigneeUserId,
        assignee_group_id: assignmentType === "group" ? step.assignee_group_id || null : null,
        escalation_user_id: step.escalation_user_id || null,
        due_days: step.due_days ?? null,
        instructions: step.instructions?.trim() || null,
      };
    });

    if (correctionMode) {
      const rejectedStep = getLatestRejectedStep(document.approval_steps);
      if (!rejectedStep) {
        setValidationError("A rejeição que originou esta correção não foi encontrada.");
        return;
      }

      const saved = await saveCorrection({
        documentId: document.id,
        title: correctionForm.title,
        description: correctionForm.description,
        nextReviewAt: correctionForm.nextReviewAt || null,
        file: correctionForm.file,
      });
      if (!saved) return;

      setCorrectionForm((current) => ({ ...current, file: null }));
      const success = await resubmitAfterCorrection({
        documentId: document.id,
        rejectedStepId: rejectedStep.id,
        responseComment: correctionForm.responseComment,
        steps,
      });

      if (success) {
        toast.success("Documento corrigido e reenviado para aprovação");
        setSubmitDialogOpen(false);
        setCorrectionMode(false);
        setWorkflowSteps(DEFAULT_WORKFLOW_STEPS);
        await Promise.all([refetch(), refetchAudit()]);
      } else {
        await refetch();
      }
      return;
    }

    const success = await submitForReview({ documentId: document.id, steps });

    if (success) {
      toast.success("Documento enviado para revisão");
      setSubmitDialogOpen(false);
      setWorkflowSteps(DEFAULT_WORKFLOW_STEPS);
      await Promise.all([refetch(), refetchAudit()]);
    }
  }

  async function handleSaveCorrection() {
    if (!document) return;
    const success = await saveCorrection({
      documentId: document.id,
      title: correctionForm.title,
      description: correctionForm.description,
      nextReviewAt: correctionForm.nextReviewAt || null,
      file: correctionForm.file,
    });
    if (!success) return;

    toast.success("Correções salvas no mesmo documento");
    setCorrectionForm((current) => ({ ...current, file: null }));
    setSubmitDialogOpen(false);
    await Promise.all([refetch(), refetchAudit()]);
  }

  function openInitialSubmission() {
    setCorrectionMode(false);
    setWorkflowSteps(DEFAULT_WORKFLOW_STEPS);
    setValidationError(null);
    setSubmitDialogOpen(true);
  }

  function openCorrectionDialog() {
    if (!document) return;
    setCorrectionMode(true);
    setWorkflowSteps(workflowStepsForCorrection(document.approval_steps));
    setCorrectionForm({
      title: document.title,
      description: document.description ?? "",
      nextReviewAt: document.next_review_at?.slice(0, 10) ?? "",
      responseComment: "",
      file: null,
    });
    setValidationError(null);
    setSubmitDialogOpen(true);
  }

  function updateWorkflowStep(index: number, updates: Partial<WorkflowStepInput>) {
    setWorkflowSteps((steps) =>
      steps.map((step, currentIndex) => currentIndex === index ? { ...step, ...updates } : step),
    );
  }

  function addWorkflowStep() {
    setWorkflowSteps((steps) => [
      ...steps,
      {
        step: steps.length + 1,
        step_label: `Etapa ${steps.length + 1}`,
        required_role: "reviewer",
        assignment_type: "role",
        assignee_id: null,
        assignee_user_id: null,
        assignee_group_id: null,
        due_mode: "days",
        due_days: 2,
        due_at: null,
        escalation_user_id: null,
      },
    ]);
  }

  function removeWorkflowStep(index: number) {
    setWorkflowSteps((steps) => steps.filter((_, currentIndex) => currentIndex !== index).map((step, nextIndex) => ({ ...step, step: nextIndex + 1 })));
  }

  function moveWorkflowStep(index: number, direction: -1 | 1) {
    setWorkflowSteps((steps) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= steps.length) return steps;
      const next = [...steps];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((step, currentIndex) => ({ ...step, step: currentIndex + 1 }));
    });
  }

  async function handleObsoleteDocument() {
    if (!document) return;
    const success = await obsoleteDocument(document.id);

    if (success) {
      toast.success("Documento tornado obsoleto");
      setObsoleteDialogOpen(false);
      await Promise.all([refetch(), refetchAudit()]);
    }
  }

  async function handleConfirmStepAction() {
    if (!document || !stepAction) return;
    if (stepAction.action === "reject" && !stepComment.trim()) {
      setValidationError("Informe o motivo da rejeição.");
      return;
    }

    const success = await actOnStep({
      documentId: document.id,
      stepId: stepAction.step.id,
      action: stepAction.action,
      comment: stepComment.trim() || undefined,
    });

    if (success) {
      toast.success(stepAction.action === "approve" ? "Documento aprovado" : "Correção solicitada ao autor");
      setStepAction(null);
      setStepComment("");
      await Promise.all([refetch(), refetchAudit()]);
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Carregando documento...</div>;
  if (error) return <div className="p-6 text-destructive">{error}</div>;
  if (!document) return <div className="p-6 text-muted-foreground">Documento não encontrado.</div>;

  const status = getStatusMeta(document.status);
  const isManager = profile?.role === "admin" || profile?.role === "manager";
  const documentInCorrection = isDocumentInCorrection(document);
  const latestRejectedStep = getLatestRejectedStep(document.approval_steps);
  const canCorrectDocument = canEditDocumentInCorrection(document, profile);
  const canSubmitForReview =
    document.status === "draft" &&
    !documentInCorrection &&
    !!profile &&
    (["admin", "manager", "author"].includes(profile.role)) &&
    (profile.id === document.author_id || isManager);
  const canObsolete = document.status === "published" && isManager;
  const orderedApprovalSteps = [...document.approval_steps].sort((left, right) => {
    const roundDifference = getStepCorrectionRound(left) - getStepCorrectionRound(right);
    if (roundDifference !== 0) return roundDifference;
    if (left.step !== right.step) return left.step - right.step;
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
  const currentPendingStep = [...orderedApprovalSteps]
    .filter((step) => step.status === "pending")
    .sort((left, right) => {
      if (Boolean(left.started_at) !== Boolean(right.started_at)) {
        return left.started_at ? -1 : 1;
      }
      const createdDifference = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      if (createdDifference !== 0) return createdDifference;
      return left.step - right.step;
    })[0] ?? null;

  function canActOnStep(step: ApprovalStep) {
    if (!profile) return false;
    const assignmentType = getStepAssignmentType(step);
    const assignedToUser =
      assignmentType === "user" &&
      (step.assignee_user_id ?? step.assignee_id) === profile.id;
    const assignedToGroup =
      assignmentType === "group" &&
      !!step.assignee_group_id &&
      workflowGroupMembers.some(
        (member) =>
          member.group_id === step.assignee_group_id &&
          member.user_id === profile.id &&
          member.is_active,
      );
    const matchingRole = assignmentType === "role" && step.required_role === profile.role;
    const authorFinalApproval = step.required_role === "approver" && document?.author_id === profile.id && !isManager;
    return step.id === currentPendingStep?.id &&
      stepMatchesDocumentStatus(step, document?.status ?? "") &&
      !authorFinalApproval &&
      (assignedToUser || assignedToGroup || matchingRole || isManager);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary">
          <Link to="/authenticated/documents"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Link>
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          {canSubmitForReview && <Button onClick={openInitialSubmission}>Enviar para Revisão</Button>}
          {canCorrectDocument && <Button onClick={openCorrectionDialog}>Corrigir e Reenviar</Button>}
          {canObsolete && <Button variant="destructive" onClick={() => setObsoleteDialogOpen(true)}>Tornar Obsoleto</Button>}
          {documentInCorrection ? (
            <Badge className="border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100">
              Correção Solicitada
            </Badge>
          ) : (
            <Badge style={{ backgroundColor: status?.color, color: "white" }}>{status?.label ?? document.status}</Badge>
          )}
          <Badge variant="outline">Rev. {document.revision}</Badge>
        </div>
      </div>

      {documentInCorrection && latestRejectedStep && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Correção solicitada</AlertTitle>
          <AlertDescription className="space-y-3">
            <div>
              <p><strong>Motivo:</strong> {latestRejectedStep.comment}</p>
              <p className="text-sm">
                Rejeitado por {latestRejectedStep.decider?.full_name ?? "responsável não identificado"}
                {latestRejectedStep.decided_at ? ` em ${formatDateTime(latestRejectedStep.decided_at)}` : ""}.
              </p>
              <p className="mt-1">Corrija o documento e reenvie para aprovação. A rejeição permanecerá no histórico.</p>
            </div>
            {canCorrectDocument && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={openCorrectionDialog}>Editar metadados</Button>
                <Button onClick={openCorrectionDialog}>Corrigir e Reenviar</Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="space-y-2">
            <span className="block text-3xl font-bold">{document.code ?? "Gerando..."}</span>
            <span className="block text-xl font-medium">{document.title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={isReviewSoon(document.next_review_at) ? "text-destructive font-medium" : "text-muted-foreground"}>
            Próxima revisão: {formatDate(document.next_review_at)}
          </p>
        </CardContent>
      </Card>

      {(["in_review", "pending_approval"].includes(document.status) || currentPendingStep) && (
        <Card className="border-primary/25 shadow-md">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Tramitação Atual</CardTitle>
              <Badge style={{ backgroundColor: status?.color, color: "white" }}>
                {status?.label ?? document.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {currentPendingStep ? (
              <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">Etapa atual</div>
                  <div className="font-medium">{currentPendingStep.step}. {currentPendingStep.step_label}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tipo de atribuição</div>
                  <div className="font-medium">{getAssignmentTypeLabel(currentPendingStep)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Responsável atual</div>
                  <div className="font-medium">{getStepAssignmentLabel(currentPendingStep)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Prazo</div>
                  <div className="font-medium">{formatDueLabel(currentPendingStep.due_at)}</div>
                  {getDueStatus(currentPendingStep.due_at) === "overdue" && (
                    <Badge variant="destructive" className="mt-1">Vencido</Badge>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                O documento está em fluxo, mas nenhuma etapa pendente foi encontrada.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-md">
        <CardHeader><CardTitle>Metadados</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Tipo:</span> {getDocTypeLabel(document.doc_type)}</div>
          <div><span className="text-muted-foreground">Área:</span> {document.area}</div>
          <div><span className="text-muted-foreground">Elaborado por:</span> {document.author?.full_name ?? "—"}</div>
          <div><span className="text-muted-foreground">Criado em:</span> {formatDate(document.created_at)}</div>
          <div><span className="text-muted-foreground">Publicado em:</span> {formatDate(document.published_at)}</div>
          <div><span className="text-muted-foreground">Descrição:</span> {document.description ?? "—"}</div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader><CardTitle>Arquivo</CardTitle></CardHeader>
        <CardContent>
          {document.file_path ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{document.file_name ?? document.file_path}</div>
                <div className="text-sm text-muted-foreground">{formatFileSize(document.file_size)}</div>
              </div>
              <Button onClick={() => handleDownload(document.file_path)}>
                <Download className="h-4 w-4 mr-2" /> Download
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground">Nenhum arquivo anexado.</p>
              {canCorrectDocument && (
                <Button variant="outline" onClick={openCorrectionDialog}>
                  <Upload className="mr-2 h-4 w-4" /> Anexar durante a correção
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader><CardTitle>Versões</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Revisão</TableHead><TableHead>Arquivo</TableHead><TableHead>Tamanho</TableHead><TableHead>Enviado por</TableHead><TableHead>Data</TableHead></TableRow></TableHeader>
            <TableBody>
              {document.versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell>Rev. {version.revision}</TableCell>
                  <TableCell>{version.file_name}</TableCell>
                  <TableCell>{formatFileSize(version.file_size)}</TableCell>
                  <TableCell>{version.uploader?.full_name ?? "—"}</TableCell>
                  <TableCell>{formatDate(version.uploaded_at)}</TableCell>
                </TableRow>
              ))}
              {!document.versions.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma versão registrada</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader><CardTitle>Fluxo de Aprovação</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {orderedApprovalSteps.map((step) => {
            const isCurrentStep = step.id === currentPendingStep?.id;
            const overdue = isCurrentStep && getDueStatus(step.due_at) === "overdue";
            const dueMode =
              step.metadata?.due_mode === "date"
                ? "Data manual"
                : step.metadata?.due_mode === "days"
                  ? "Prazo calculado"
                  : "Origem do prazo não informada";

            return (
              <div key={step.id} className={`border rounded-md p-3 flex items-start justify-between gap-4 ${isCurrentStep ? "border-primary/40 bg-primary/[0.02]" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold ${getStepCircleClass(step.status)}`}>
                    {step.step}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{step.step_label}</div>
                      {isCurrentStep && <Badge>Etapa atual</Badge>}
                      <Badge variant="outline">{getAssignmentTypeLabel(step)}</Badge>
                      {getStepCorrectionRound(step) > 0 && (
                        <Badge variant="secondary">Correção {getStepCorrectionRound(step)}</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {getStepAssignmentLabel(step)} · Fallback: {getRoleLabel(step.required_role)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Prazo: {formatDateTime(step.due_at)} · {formatDueLabel(step.due_at)} · {dueMode}
                      {overdue && <Badge variant="destructive" className="ml-2">Atrasado</Badge>}
                    </div>
                    {step.instructions && <p className="text-sm mt-2">{step.instructions}</p>}
                    {typeof step.metadata?.response_comment === "string" && step.metadata.response_comment && (
                      <p className="text-sm mt-2">
                        <strong>Resposta do autor:</strong> {step.metadata.response_comment}
                      </p>
                    )}
                    {step.started_at && <div className="text-xs text-muted-foreground mt-1">Iniciado em {formatDateTime(step.started_at)}</div>}
                    {step.decided_at && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Decidido por {step.decider?.full_name ?? "—"} em {formatDateTime(step.decided_at)}
                      </div>
                    )}
                    {step.comment && <p className="text-sm mt-2">{step.comment}</p>}
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <Badge variant="outline">
                    {step.status === "pending" && !isCurrentStep ? "aguardando" : step.status}
                  </Badge>
                  {canActOnStep(step) && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => { setStepAction({ step, action: "approve" }); setStepComment(""); setValidationError(null); }}>Aprovar</Button>
                      <Button size="sm" variant="destructive" onClick={() => { setStepAction({ step, action: "reject" }); setStepComment(""); setValidationError(null); }}>Rejeitar</Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {!document.approval_steps.length && <p className="text-muted-foreground">Nenhuma etapa de aprovação registrada.</p>}
        </CardContent>
      </Card>

      <RecentActivityList
        activities={mapAuditEntriesToRecentActivities(auditEntries, 20)}
        loading={auditLoading}
        title="Atividades Recentes do Documento"
        description="Movimentações registradas na trilha de auditoria deste documento."
      />

      <Dialog open={submitDialogOpen} onOpenChange={(open) => {
        setSubmitDialogOpen(open);
        if (!open) setCorrectionMode(false);
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {correctionMode ? "Corrigir e Reenviar" : "Configurar Fluxo de Aprovação"}
            </DialogTitle>
            <DialogDescription>{document.code ?? "Gerando..."} — {document.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
            {correctionMode && (
              <div className="space-y-4 rounded-md border border-amber-300 bg-amber-50 p-4">
                <div>
                  <div className="font-medium text-amber-950">Correção no mesmo documento</div>
                  <p className="text-sm text-amber-900">
                    Ajuste os campos permitidos e reenvie. A revisão formal continuará em {document.revision}.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label htmlFor="correction-title">Título</Label>
                    <Input
                      id="correction-title"
                      value={correctionForm.title}
                      onChange={(event) => setCorrectionForm((current) => ({ ...current, title: event.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="correction-description">Descrição</Label>
                    <Textarea
                      id="correction-description"
                      value={correctionForm.description}
                      onChange={(event) => setCorrectionForm((current) => ({ ...current, description: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="correction-review-date">Próxima revisão documental</Label>
                    <Input
                      id="correction-review-date"
                      type="date"
                      value={correctionForm.nextReviewAt}
                      onChange={(event) => setCorrectionForm((current) => ({ ...current, nextReviewAt: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="correction-file">Arquivo</Label>
                    {document.file_path ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Já existe arquivo. A substituição exige versionamento formal e não é feita neste ciclo simples.
                      </p>
                    ) : (
                      <Input
                        id="correction-file"
                        type="file"
                        accept=".pdf,.doc,.docx,.dwg,.xls,.xlsx"
                        onChange={(event) => setCorrectionForm((current) => ({
                          ...current,
                          file: event.target.files?.[0] ?? null,
                        }))}
                      />
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="correction-response">Resposta do autor (opcional)</Label>
                    <Textarea
                      id="correction-response"
                      value={correctionForm.responseComment}
                      onChange={(event) => setCorrectionForm((current) => ({ ...current, responseComment: event.target.value }))}
                      placeholder="Descreva o que foi corrigido para o revisor."
                    />
                  </div>
                </div>
              </div>
            )}
            {(!canUseGroups || actorsError) && (
              <Alert>
                <AlertTitle>Compatibilidade do roteamento</AlertTitle>
                <AlertDescription>
                  {actorsCompatibilityMessage
                    ?? actorsError
                    ?? "Grupos de aprovação ainda não estão disponíveis neste ambiente. Papel e usuário continuam funcionando."}
                </AlertDescription>
              </Alert>
            )}
            {workflowSteps.map((step, index) => (
                <div key={index} className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">Etapa {index + 1}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={index === 0} onClick={() => moveWorkflowStep(index, -1)}>Subir</Button>
                      <Button size="sm" variant="outline" disabled={index === workflowSteps.length - 1} onClick={() => moveWorkflowStep(index, 1)}>Descer</Button>
                      <Button size="sm" variant="destructive" disabled={workflowSteps.length === 1} onClick={() => removeWorkflowStep(index)}>Remover</Button>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-sm font-medium mb-2">Nome da etapa</div>
                      <Input value={step.step_label} onChange={(event) => updateWorkflowStep(index, { step_label: event.target.value })} />
                    </div>
                    <WorkflowStepRoutingFields
                      step={step}
                      users={workflowUsers}
                      groups={workflowGroups}
                      roles={workflowRoles}
                      canUseGroups={canUseGroups}
                      compatibilityMessage={actorsCompatibilityMessage}
                      onChange={(updates) => updateWorkflowStep(index, updates)}
                    />
                    <div className="md:col-span-2">
                      <div className="text-sm font-medium mb-2">Escalonamento opcional</div>
                      <Select value={step.escalation_user_id ?? "none"} onValueChange={(value) => updateWorkflowStep(index, { escalation_user_id: value === "none" ? null : value })}>
                        <SelectTrigger><SelectValue placeholder="Nenhum escalonamento" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum escalonamento</SelectItem>
                          {workflowUsers.map((option) => <SelectItem key={option.id} value={option.id}>{option.full_name} · {getRoleLabel(option.role)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
            ))}
            <Button variant="outline" onClick={addWorkflowStep}>Adicionar etapa</Button>
            {flowCompatibilityMessage && <p className="text-sm text-muted-foreground">{flowCompatibilityMessage}</p>}
            {(validationError || actionError || correctionError) && (
              <p className="text-sm text-destructive">{validationError ?? actionError ?? correctionError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSubmitDialogOpen(false)}>Cancelar</Button>
            {correctionMode && (
              <Button
                variant="outline"
                disabled={actionLoading || correctionSaving}
                onClick={handleSaveCorrection}
              >
                {correctionSaving ? "Salvando..." : "Salvar correções"}
              </Button>
            )}
            <Button
              disabled={actionLoading || correctionSaving || actorsLoading}
              onClick={handleSubmitForReview}
            >
              {actionLoading || correctionSaving
                ? "Processando..."
                : correctionMode
                  ? "Corrigir e Reenviar"
                  : "Enviar para Revisão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={obsoleteDialogOpen} onOpenChange={setObsoleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tornar documento obsoleto?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita. O documento será arquivado.</DialogDescription>
          </DialogHeader>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setObsoleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={actionLoading} onClick={handleObsoleteDocument}>{actionLoading ? "Processando..." : "Tornar obsoleto"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stepAction} onOpenChange={(open) => {
        if (!open) {
          setStepAction(null);
          setStepComment("");
          setValidationError(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stepAction?.action === "approve" ? "Aprovar documento" : "Solicitar correção"}</DialogTitle>
            <DialogDescription>{document.code ?? "Gerando..."} — {document.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={stepComment}
              onChange={(event) => {
                setStepComment(event.target.value);
                setValidationError(null);
              }}
              placeholder={stepAction?.action === "approve" ? "Comentário opcional sobre a aprovação..." : "Informe o que precisa ser corrigido..."}
            />
            {(validationError || actionError) && <p className="text-sm text-destructive">{validationError ?? actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setStepAction(null)}>Cancelar</Button>
            <Button variant={stepAction?.action === "reject" ? "destructive" : "default"} disabled={actionLoading} onClick={handleConfirmStepAction}>
              {actionLoading ? "Processando..." : stepAction?.action === "approve" ? "Confirmar aprovação" : "Solicitar correção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
