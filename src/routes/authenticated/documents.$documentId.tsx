import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Download } from "lucide-react";
import { DOC_STATUS, DOC_TYPES, USER_ROLES } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import { useApprovalFlow } from "@/hooks/useApprovalFlow";
import { ApprovalStep, useDocument } from "@/hooks/useDocument";
import { toast } from "sonner";

export const Route = createFileRoute("/authenticated/documents/$documentId")({
  component: DocumentDetailPage,
});

interface ProfileOption {
  id: string;
  full_name: string;
  role: string;
}

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
  if (status === "skipped") return "bg-muted text-muted-foreground";
  return "bg-slate-200 text-slate-700";
}

function stepMatchesDocumentStatus(step: ApprovalStep, documentStatus: string) {
  if (step.step === 1) return documentStatus === "in_review";
  if (step.step === 2) return documentStatus === "pending_approval";
  return true;
}

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const { profile } = useAuthContext();
  const { document, loading, error, refetch } = useDocument(documentId);
  const { submitForReview, actOnStep, obsoleteDocument, loading: actionLoading, error: actionError } = useApprovalFlow();
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [obsoleteDialogOpen, setObsoleteDialogOpen] = useState(false);
  const [selectedReviewer, setSelectedReviewer] = useState("any");
  const [selectedApprover, setSelectedApprover] = useState("any");
  const [profileOptions, setProfileOptions] = useState<ProfileOption[]>([]);
  const [stepAction, setStepAction] = useState<{ step: ApprovalStep; action: "approve" | "reject" } | null>(null);
  const [stepComment, setStepComment] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfileOptions() {
      if (!profile) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("org_id", profile.org_id)
        .eq("active", true)
        .in("role", ["reviewer", "approver"])
        .order("full_name", { ascending: true });

      setProfileOptions((data ?? []) as ProfileOption[]);
    }

    fetchProfileOptions();
  }, [profile]);

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
      reviewerId: selectedReviewer === "any" ? undefined : selectedReviewer,
      approverId: selectedApprover === "any" ? undefined : selectedApprover,
    });

    if (success) {
      toast.success("Documento enviado para revisão");
      setSubmitDialogOpen(false);
      await refetch();
    }
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
  const reviewerOptions = profileOptions.filter((option) => option.role === "reviewer");
  const approverOptions = profileOptions.filter((option) => option.role === "approver");

  function canActOnStep(step: ApprovalStep) {
    if (!profile) return false;
    const assignedToUser = step.assignee_id === profile.id;
    const unassignedMatchingRole = !step.assignee_id && step.required_role === profile.role;
    return step.status === "pending" && stepMatchesDocumentStatus(step, document.status) && (assignedToUser || unassignedMatchingRole || isManager);
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
          {document.approval_steps.map((step) => (
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
          ))}
          {!document.approval_steps.length && <p className="text-muted-foreground">Nenhuma etapa de aprovação registrada.</p>}
        </CardContent>
      </Card>

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para Revisão</DialogTitle>
            <DialogDescription>{document.code ?? "Gerando..."} — {document.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-2">Revisor</div>
              <Select value={selectedReviewer} onValueChange={setSelectedReviewer}>
                <SelectTrigger><SelectValue placeholder="Qualquer revisor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer revisor</SelectItem>
                  {reviewerOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Aprovador</div>
              <Select value={selectedApprover} onValueChange={setSelectedApprover}>
                <SelectTrigger><SelectValue placeholder="Qualquer aprovador" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer aprovador</SelectItem>
                  {approverOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSubmitDialogOpen(false)}>Cancelar</Button>
            <Button disabled={actionLoading} onClick={handleSubmitForReview}>{actionLoading ? "Enviando..." : "Confirmar envio"}</Button>
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
