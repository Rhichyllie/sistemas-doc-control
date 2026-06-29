import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { WorkflowStepRoutingFields } from "@/components/workflow/WorkflowStepRoutingFields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Download } from "lucide-react";
import { DOC_STATUS, DOC_TYPES, USER_ROLES } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import { useApprovalFlow, type WorkflowStepInput } from "@/hooks/useApprovalFlow";
import { useWorkflowActors } from "@/hooks/useWorkflowActors";
import { ApprovalStep, useDocument } from "@/hooks/useDocument";
import { useAuditTrail } from "@/hooks/useAuditTrail";
import { mapAuditEntriesToRecentActivities } from "@/hooks/useOperationalCockpit";
import { RecentActivityList } from "@/components/operational/RecentActivityList";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/documents/$documentId")({
  component: DocumentDetailPage,
});

const DEFAULT_WORKFLOW_STEPS: WorkflowStepInput[] = [
  { step: 1, step_label: "Revisão Técnica", required_role: "reviewer", assignment_type: "role", assignee_id: null, assignee_user_id: null, due_days: 2, escalation_user_id: null },
  { step: 2, step_label: "Aprovação Final", required_role: "approver", assignment_type: "role", assignee_id: null, assignee_user_id: null, due_days: 2, escalation_user_id: null },
];

const DUE_DAY_OPTIONS = [1, 2, 3, 5, 7, 10, 15];

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

function getDaysUntilDue(value: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
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
  if (status === "skipped") return "bg-muted text-muted-foreground";
  return "bg-slate-200 text-slate-700";
}

function stepMatchesDocumentStatus(step: ApprovalStep, documentStatus: string) {
  if (documentStatus === "published" || documentStatus === "draft" || documentStatus === "obsolete") return true;
  if (step.started_at) return true;
  if (step.required_role === "approver") return documentStatus === "pending_approval";
  return documentStatus === "in_review";
}

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const { profile } = useAuthContext();
  const { document, loading, error, refetch } = useDocument(documentId);
  const { entries: auditEntries, loading: auditLoading } = useAuditTrail({ document_id: documentId });
  const { submitForReview, actOnStep, obsoleteDocument, loading: actionLoading, error: actionError } = useApprovalFlow();
  const {
    users: workflowUsers,
    groups: workflowGroups,
    roles: workflowRoles,
    isLoading: actorsLoading,
    error: actorsError,
    canUseGroups,
    compatibilityMessage: actorsCompatibilityMessage,
  } = useWorkflowActors();
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [obsoleteDialogOpen, setObsoleteDialogOpen] = useState(false);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepInput[]>(DEFAULT_WORKFLOW_STEPS);
  const [stepAction, setStepAction] = useState<{ step: ApprovalStep; action: "approve" | "reject" } | null>(null);
  const [stepComment, setStepComment] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

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
    const success = await submitForReview({
      documentId: document.id,
      steps: workflowSteps.map((step, index) => {
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
      }),
    });

    if (success) {
      toast.success("Documento enviado para revisão");
      setSubmitDialogOpen(false);
      setWorkflowSteps(DEFAULT_WORKFLOW_STEPS);
      await refetch();
    }
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
        due_days: 2,
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
      await refetch();
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
      toast.success(stepAction.action === "approve" ? "Documento aprovado" : "Documento rejeitado e retornado ao elaborador");
      setStepAction(null);
      setStepComment("");
      await refetch();
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Carregando documento...</div>;
  if (error) return <div className="p-6 text-destructive">{error}</div>;
  if (!document) return <div className="p-6 text-muted-foreground">Documento não encontrado.</div>;

  const status = getStatusMeta(document.status);
  const isManager = profile?.role === "admin" || profile?.role === "manager";
  const canSubmitForReview =
    document.status === "draft" &&
    !!profile &&
    (["admin", "manager", "author"].includes(profile.role)) &&
    (profile.id === document.author_id || isManager);
  const canObsolete = document.status === "published" && isManager;

  function canActOnStep(step: ApprovalStep) {
    if (!profile) return false;
    const assignedToUser = step.assignee_id === profile.id;
    const unassignedMatchingRole = !step.assignee_id && step.required_role === profile.role;
    const authorFinalApproval = step.required_role === "approver" && document?.author_id === profile.id && !isManager;
    return step.status === "pending" && stepMatchesDocumentStatus(step, document?.status ?? "") && !authorFinalApproval && (assignedToUser || unassignedMatchingRole || isManager);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary">
          <Link to="/authenticated/documents"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Link>
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          {canSubmitForReview && <Button onClick={() => setSubmitDialogOpen(true)}>Enviar para Revisão</Button>}
          {canObsolete && <Button variant="destructive" onClick={() => setObsoleteDialogOpen(true)}>Tornar Obsoleto</Button>}
          <Badge style={{ backgroundColor: status?.color, color: "white" }}>{status?.label ?? document.status}</Badge>
          <Badge variant="outline">Rev. {document.revision}</Badge>
        </div>
      </div>

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
            <p className="text-muted-foreground">Nenhum arquivo anexado.</p>
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
          {document.approval_steps.map((step) => {
            const daysUntilDue = getDaysUntilDue(step.due_at);
            const overdue = step.status === "pending" && daysUntilDue !== null && daysUntilDue < 0;

            return (
              <div key={step.id} className="border rounded-md p-3 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold ${getStepCircleClass(step.status)}`}>
                    {step.step}
                  </div>
                  <div>
                    <div className="font-medium">{step.step_label}</div>
                    <div className="text-sm text-muted-foreground">
                      Papel: {getRoleLabel(step.required_role)} · Responsável: {step.assignee?.full_name ?? `Qualquer ${getRoleLabel(step.required_role)}`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Prazo: {formatDateTime(step.due_at)} {step.due_days ? `(${step.due_days} dias)` : ""}
                      {overdue && <Badge variant="destructive" className="ml-2">Atrasado</Badge>}
                      {!overdue && daysUntilDue !== null && step.status === "pending" && (
                        <Badge variant="outline" className="ml-2">{daysUntilDue === 0 ? "vence hoje" : `${daysUntilDue} dias`}</Badge>
                      )}
                    </div>
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
                  <Badge variant="outline">{step.status}</Badge>
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

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Configurar Fluxo de Aprovação</DialogTitle>
            <DialogDescription>{document.code ?? "Gerando..."} — {document.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
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
                    <div>
                      <div className="text-sm font-medium mb-2">Prazo da etapa</div>
                      <Select value={String(step.due_days ?? 2)} onValueChange={(value) => updateWorkflowStep(index, { due_days: Number(value) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DUE_DAY_OPTIONS.map((days) => <SelectItem key={days} value={String(days)}>{days} dias</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
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
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSubmitDialogOpen(false)}>Cancelar</Button>
            <Button disabled={actionLoading || actorsLoading} onClick={handleSubmitForReview}>{actionLoading ? "Enviando..." : "Enviar para Revisão"}</Button>
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
            <DialogTitle>{stepAction?.action === "approve" ? "Aprovar documento" : "Rejeitar documento"}</DialogTitle>
            <DialogDescription>{document.code ?? "Gerando..."} — {document.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={stepComment}
              onChange={(event) => {
                setStepComment(event.target.value);
                setValidationError(null);
              }}
              placeholder={stepAction?.action === "approve" ? "Comentário opcional sobre a aprovação..." : "Informe o motivo da rejeição..."}
            />
            {(validationError || actionError) && <p className="text-sm text-destructive">{validationError ?? actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setStepAction(null)}>Cancelar</Button>
            <Button variant={stepAction?.action === "reject" ? "destructive" : "default"} disabled={actionLoading} onClick={handleConfirmStepAction}>
              {actionLoading ? "Processando..." : stepAction?.action === "approve" ? "Confirmar aprovação" : "Confirmar rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
