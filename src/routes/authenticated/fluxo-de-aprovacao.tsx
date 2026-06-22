import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, FileText, User, Clock, Send, ArrowLeft, RotateCcw, Upload, Download, CheckCircle2, ArrowRight, AlertCircle, XCircle, Trash2, ExternalLink } from "lucide-react";
import { useLocalData } from "@/hooks/use-local-data";
import { useTheme } from "@/contexts/theme-context";
import { toast } from "sonner";
import { ApprovalFlow, ApprovalStep, ApprovalComment, ApprovalHistory, Document } from "@/contexts/local-data-context";

export const Route = createFileRoute("/authenticated/fluxo-de-aprovacao")({
  component: ApprovalFlowPage,
  validateSearch: (search: Record<string, unknown>) => ({
    documentId: typeof search.documentId === "string" ? search.documentId : undefined,
    stepId: typeof search.stepId === "string" ? search.stepId : undefined,
  }),
});

function ApprovalFlowPage() {
  const searchParams = useSearch({ from: "/authenticated/fluxo-de-aprovacao" });
  const { theme } = useTheme();
  const { 
    documents, projects, disciplines, team, isAdmin,
    approvalFlows, setApprovalFlows, 
    approvalSteps, setApprovalSteps, 
    approvalComments, setApprovalComments, 
    approvalHistory, setApprovalHistory,
    cancelFlow, deleteFlow,
    setDocuments, addRecentActivity
  } = useLocalData();

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<ApprovalFlow | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Modais de cancelar/excluir fluxo
  const [openCancelFlowModal, setOpenCancelFlowModal] = useState(false);
  const [openDeleteFlowModal, setOpenDeleteFlowModal] = useState(false);
  const [flowActionReason, setFlowActionReason] = useState("");
  const [flowActionLoading, setFlowActionLoading] = useState(false);

  // Formulário para nova etapa
  const [stepForm, setStepForm] = useState({
    flowType: "multidisciplinary",
    sector: "",
    responsible: "",
    responsibleTeamId: "",
    deadlineDays: 5,
    sequence: 1
  });

  // Formulário para análise
  const [analysisForm, setAnalysisForm] = useState({
    opinion: "approved",
    comment: "",
    attachments: ""
  });

  // Etapa selecionada para análise
  const [selectedStep, setSelectedStep] = useState<ApprovalStep | null>(null);
  const [openAnalysis, setOpenAnalysis] = useState(false);
  
  // Modal para retorno ao projetista
  const [openReturnModal, setOpenReturnModal] = useState(false);
  const [returnForm, setReturnForm] = useState({
    comment: "",
    attachments: ""
  });

  // Quando o documento é selecionado
  function handleSelectDocument(docId: string) {
    setSelectedDocumentId(docId);
    const doc = documents.find(d => d.id === docId);
    if (doc) {
      setSelectedDocument(doc);
      getOrCreateFlow(doc);
    }
  }

  // Auto-selecionar documento quando a página é acessada via link do e-mail
  // (parâmetros documentId/stepId na URL)
  useEffect(() => {
    if (searchParams.documentId && documents.length > 0 && !selectedDocumentId) {
      handleSelectDocument(searchParams.documentId);
    }
  }, [searchParams.documentId, documents]);

  // Função para criar ou obter fluxo para o documento selecionado
  function getOrCreateFlow(doc: Document) {
    let flow = approvalFlows.find(f => f.documentId === doc.id);
    if (!flow) {
      flow = {
        id: "flow-" + Date.now(),
        documentId: doc.id,
        revision: doc.currentRevision,
        status: "pending",
        createdAt: new Date().toISOString()
      };
      setApprovalFlows([...approvalFlows, flow]);
      
      // Adicionar entrada no histórico
      addHistoryEntry("document_received", "Sistema", `Documento ${doc.code} recebido para aprovação`);
    }
    setSelectedFlow(flow);
    setStepForm({ 
      flowType: "multidisciplinary", 
      sector: "", 
      responsible: "", 
      responsibleTeamId: "",
      deadlineDays: 5, 
      sequence: approvalSteps.filter(s => s.flowId === flow!.id).length + 1 
    });
  }

  // Obter nome do projeto
  function getProjectName(projectId: string) {
    return projects.find(p => p.id === projectId)?.name || "—";
  }

  // Obter nome da disciplina
  function getDisciplineName(disciplineId?: string) {
    if (!disciplineId) return "—";
    return disciplines.find(d => d.id === disciplineId)?.name || "—";
  }

  // Adicionar entrada no histórico
  function addHistoryEntry(action: string, user: string, description: string) {
    if (!selectedDocumentId) return;
    const entry: ApprovalHistory = {
      id: "hist-" + Date.now(),
      documentId: selectedDocumentId,
      action,
      user,
      date: new Date().toISOString(),
      description
    };
    setApprovalHistory([...approvalHistory, entry]);
  }

  // Adicionar etapa
  function handleAddStep() {
    if (!selectedFlow) return;
    if (!stepForm.responsibleTeamId) {
      toast.error("Selecione o responsável pela etapa");
      return;
    }
    const newStep: ApprovalStep = {
      id: "step-" + Date.now(),
      flowId: selectedFlow.id,
      sequence: stepForm.sequence,
      sector: stepForm.sector,
      responsible: stepForm.responsible,
      responsibleTeamId: stepForm.responsibleTeamId,
      deadlineDays: stepForm.deadlineDays,
      status: "pending"
    };
    setApprovalSteps([...approvalSteps, newStep]);
    toast.success("Etapa adicionada com sucesso!");
    setStepForm({ 
      ...stepForm, 
      sector: "", 
      responsible: "", 
      responsibleTeamId: "",
      sequence: approvalSteps.filter(s => s.flowId === selectedFlow.id).length + 2 
    });
  }

  // Iniciar análise
  async function startAnalysis(step: ApprovalStep) {
    // Atualizar etapa para em andamento
    const updatedStep: ApprovalStep = { ...step, status: "in_progress", startedAt: new Date().toISOString() };
    const updatedSteps = approvalSteps.map(s => 
      s.id === step.id ? updatedStep : s
    );
    setApprovalSteps(updatedSteps);
    
    setSelectedStep(updatedStep);
    setAnalysisForm({ opinion: "approved", comment: "", attachments: "" });
    setOpenAnalysis(false); // Não abre o dialog
    
    // Adicionar histórico
    addHistoryEntry("analysis_started", step.responsible, `Iniciada análise: ${step.sector}`);

    // Registrar em Atividades Recentes
    addRecentActivity({
      id: "activity-" + Date.now(),
      type: "approval_step_started",
      title: "Análise Iniciada",
      description: `${selectedDocument?.code || ""} — ${step.sector}`,
      icon: "edit",
      color: "blue",
      user: step.responsible,
      createdAt: new Date().toISOString(),
    });
    
    toast.success("Análise iniciada!");

    // Disparar e-mail de notificação ao responsável
    if (step.responsibleTeamId) {
      try {
        const { data, error } = await supabase.functions.invoke("send-approval-email", {
          body: { stepId: step.id, type: "initial" },
        });
        if (error) {
          console.error("Erro ao enviar e-mail de notificação:", error);
          toast.error("Etapa iniciada, mas o e-mail não pôde ser enviado.");
        } else {
          toast.success(`E-mail enviado para ${step.responsible}!`);
        }
      } catch (err) {
        console.error("Erro inesperado ao chamar função de e-mail:", err);
        toast.error("Etapa iniciada, mas o e-mail não pôde ser enviado.");
      }
    } else {
      toast.error("Responsável sem vínculo com a equipe — e-mail não enviado.");
    }
  }

  // Cancelar o fluxo inteiro (soft delete, fica registrado em auditoria)
  async function handleCancelFlow() {
    if (!selectedFlow || !selectedDocument) return;
    setFlowActionLoading(true);
    try {
      await cancelFlow(selectedFlow.id, flowActionReason);

      // Sincronizar o status do documento para "cancelled"
      const updatedDocs = documents.map(d =>
        d.id === selectedDocument.id ? { ...d, status: "cancelled" } : d
      );
      setDocuments(updatedDocs);

      addRecentActivity({
        id: "activity-" + Date.now(),
        type: "flow_cancelled",
        title: "Fluxo de Aprovação Cancelado",
        description: `${selectedDocument.code} — ${flowActionReason}`,
        icon: "edit",
        color: "yellow",
        createdAt: new Date().toISOString(),
      });

      toast.success("Fluxo cancelado com sucesso.");
      setOpenCancelFlowModal(false);
      setFlowActionReason("");
      setSelectedFlow(null);
      setSelectedDocument(null);
      setSelectedDocumentId(null);
    } catch (err) {
      toast.error("Erro ao cancelar o fluxo. Tente novamente.");
    } finally {
      setFlowActionLoading(false);
    }
  }

  // Excluir o fluxo inteiro (remoção física, com snapshot preservado em auditoria)
  async function handleDeleteFlow() {
    if (!selectedFlow || !selectedDocument) return;
    setFlowActionLoading(true);
    try {
      const docCode = selectedDocument.code;
      const reason = flowActionReason;
      await deleteFlow(selectedFlow.id, flowActionReason);

      addRecentActivity({
        id: "activity-" + Date.now(),
        type: "flow_deleted",
        title: "Fluxo de Aprovação Excluído",
        description: `${docCode} — ${reason}`,
        icon: "edit",
        color: "red",
        createdAt: new Date().toISOString(),
      });

      toast.success("Fluxo excluído com sucesso.");
      setOpenDeleteFlowModal(false);
      setFlowActionReason("");
      setSelectedFlow(null);
      setSelectedDocument(null);
      setSelectedDocumentId(null);
    } catch (err) {
      toast.error("Erro ao excluir o fluxo. Tente novamente.");
    } finally {
      setFlowActionLoading(false);
    }
  }

  // Abrir modal de retorno ao projetista
  function handleOpenReturnModal() {
    setReturnForm({ comment: "", attachments: "" });
    setOpenReturnModal(true);
  }
  
  // Retornar ao projetista (salvar)
  function handleSaveReturnToDesigner() {
    if (!selectedStep) return;
    
    // Atualizar etapa
    const updatedSteps = approvalSteps.map(s => 
      s.id === selectedStep.id 
        ? { ...s, status: "pending" as const } 
        : s
    );
    setApprovalSteps(updatedSteps);
    
    // Adicionar comentário
    if (returnForm.comment) {
      const comment: ApprovalComment = {
        id: "comment-" + Date.now(),
        stepId: selectedStep.id,
        comment: returnForm.comment,
        attachments: returnForm.attachments ? returnForm.attachments.split(",").map(a => a.trim()) : undefined,
        createdAt: new Date().toISOString()
      };
      setApprovalComments([...approvalComments, comment]);
    }
    
    // Adicionar histórico
    addHistoryEntry("returned_to_designer", selectedStep.responsible, `Retornado ao projetista: ${selectedStep.sector}`);
    
    toast.info("Retornado ao projetista!");
    setOpenReturnModal(false);
    setSelectedStep(null);
  }

  // Salvar parecer
  function handleSaveOpinion() {
    if (!selectedStep || !selectedFlow || !selectedDocument) return;
    
    // Atualizar etapa
    const updatedSteps = approvalSteps.map(s => 
      s.id === selectedStep.id 
        ? { ...s, status: "completed" as const, completedAt: new Date().toISOString() } 
        : s
    );
    setApprovalSteps(updatedSteps);
    
    // Adicionar comentário
    if (analysisForm.comment) {
      const comment: ApprovalComment = {
        id: "comment-" + Date.now(),
        stepId: selectedStep.id,
        comment: analysisForm.comment,
        attachments: analysisForm.attachments ? analysisForm.attachments.split(",").map(a => a.trim()) : undefined,
        createdAt: new Date().toISOString()
      };
      setApprovalComments([...approvalComments, comment]);
    }
    
    // Adicionar histórico
    addHistoryEntry("analysis_completed", selectedStep.responsible, `Análise concluída: ${analysisForm.opinion}`);

    // Registrar em Atividades Recentes
    addRecentActivity({
      id: "activity-" + Date.now(),
      type: "approval_step_completed",
      title: "Etapa de Aprovação Concluída",
      description: `${selectedDocument.code} — ${selectedStep.sector}: ${analysisForm.opinion}`,
      icon: "check-circle",
      color: analysisForm.opinion === "rejected" ? "red" : "green",
      user: selectedStep.responsible,
      createdAt: new Date().toISOString(),
    });

    // Verificar se esta era a última etapa pendente do fluxo — se sim, sincroniza o status do documento
    const otherPendingSteps = updatedSteps.filter(
      s => s.flowId === selectedFlow.id && s.id !== selectedStep.id && s.status !== "completed"
    );

    if (otherPendingSteps.length === 0) {
      // Esta era a última etapa: definir o status final do documento
      let newDocStatus: string | null = null;
      if (analysisForm.opinion === "approved" || analysisForm.opinion === "approved_with_comments") {
        newDocStatus = analysisForm.opinion;
      } else if (analysisForm.opinion === "rejected") {
        newDocStatus = "rejected";
      }

      if (newDocStatus) {
        const updatedDocs = documents.map(d =>
          d.id === selectedDocument.id
            ? { ...d, status: newDocStatus as string, analysisReturnedAt: new Date().toISOString().slice(0, 10) }
            : d
        );
        setDocuments(updatedDocs);

        addRecentActivity({
          id: "activity-" + (Date.now() + 1),
          type: "document_status_synced",
          title: newDocStatus === "rejected" ? "Documento Reprovado" : "Documento Aprovado",
          description: `${selectedDocument.code} — ${selectedDocument.title}`,
          icon: "check-circle",
          color: newDocStatus === "rejected" ? "red" : "green",
          createdAt: new Date().toISOString(),
        });
      }
    }
    
    toast.success("Parecer salvo com sucesso!");
    setOpenAnalysis(false);
    setSelectedStep(null);
  }

  // Etapas do fluxo selecionado
  const flowSteps = selectedFlow ? approvalSteps.filter(s => s.flowId === selectedFlow.id).sort((a, b) => a.sequence - b.sequence) : [];
  
  // Sincronizar selectedStep com a etapa em progresso
  useEffect(() => {
    if (selectedFlow && !selectedStep) {
      const inProgressStep = flowSteps.find(s => s.status === "in_progress");
      if (inProgressStep) {
        setSelectedStep(inProgressStep);
        setAnalysisForm({ opinion: "approved", comment: "", attachments: "" });
      }
    }
  }, [selectedFlow, flowSteps, selectedStep]);
  
  // Histórico do documento selecionado
  const docHistory = selectedDocumentId ? approvalHistory.filter(h => h.documentId === selectedDocumentId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];
  
  // Stats para dashboard
  const stats = {
    total: flowSteps.length,
    pending: flowSteps.filter(s => s.status === "pending").length,
    completed: flowSteps.filter(s => s.status === "completed").length,
    overdue: flowSteps.filter(s => s.status === "in_progress").length // Simplificado para demo
  };

  const opinionOptions = [
    { value: "approved", label: "Aprovado" },
    { value: "approved_with_comments", label: "Aprovado com Comentários" },
    { value: "review_and_resubmit", label: "Revisar e Reenviar" },
    { value: "rejected", label: "Reprovado" },
    { value: "cancelled", label: "Cancelado" }
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fluxo de Aprovação</h1>
          <p className="text-muted-foreground text-sm">Gerencie o fluxo de aprovação de documentos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm"><RotateCcw className="h-4 w-4 mr-2" />Histórico Completo</Button>
          <Button variant="secondary" size="sm"><Download className="h-4 w-4 mr-2" />Exportar Relatório</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* Seção Principal (Documento + Config + Análise) */}
        <div className="col-span-3 space-y-4">
          {/* Card do Documento */}
          <Card className="shadow-md border-2 border-blue-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">DOCUMENTO</CardTitle>
                    <CardDescription>Selecione um documento para iniciar o fluxo</CardDescription>
                  </div>
                </div>
                <Select value={selectedDocumentId || ""} onValueChange={handleSelectDocument}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Selecione para documento" /></SelectTrigger>
                  <SelectContent>
                    {documents.map(d => <SelectItem key={d.id} value={d.id}>{d.code} - {d.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && selectedFlow && (
                <div className="flex gap-2 justify-end mt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setFlowActionReason(""); setOpenCancelFlowModal(true); }}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Cancelar Fluxo
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setFlowActionReason(""); setOpenDeleteFlowModal(true); }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Excluir Fluxo
                  </Button>
                </div>
              )}
            </CardHeader>

            {selectedDocument && (
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase">Código</Label>
                    <div className="font-mono font-medium">{selectedDocument.code}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase">Projeto</Label>
                    <div className="font-medium">{getProjectName(selectedDocument.projectId)}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase">Revisão</Label>
                    <div className="font-medium">{selectedDocument.currentRevision}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase">Status</Label>
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Planejado</Badge>
                  </div>
<div className="col-span-2">
  <Label className="text-muted-foreground text-xs uppercase">Título</Label>
  <div className="font-medium flex items-center gap-2">
    {selectedDocument.title}
    {selectedDocument.externalLink && (
        <a
      href={selectedDocument.externalLink}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 inline-flex items-center"
        title="Abrir documento"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    )}
</div>
</div>                  <div>
                    <Label className="text-muted-foreground text-xs uppercase">Disciplina</Label>
                    <div className="font-medium">{getDisciplineName(selectedDocument.disciplineId)}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase">Data Recebimento</Label>
                    <div className="font-medium">{selectedDocument.receivedAt ? new Date(selectedDocument.receivedAt).toLocaleDateString("pt-BR") : "15/06/2025 08:30"}</div>
                  </div>
                  </div>
                {/* Stats abaixo do documento */}
                <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t">
                  <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                    <div className="text-xs text-blue-700 uppercase">Etapas</div>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                    <div className="text-xs text-yellow-700 uppercase">Pendentes</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                    <div className="text-xs text-green-700 uppercase">Concluídas</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
                    <div className="text-xs text-red-700 uppercase">Atrasadas</div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {selectedFlow && (
            <>
              {/* Grid de 2 colunas para Config e Análise */}
              <div className="grid grid-cols-2 gap-4">
                {/* Seção 1: Configuração do Fluxo */}
                <Card className="shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">1</span>
                      Configuração do Fluxo de Aprovação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground">Tipo de Fluxo</Label>
                        <Select value={stepForm.flowType} onValueChange={(v) => setStepForm({ ...stepForm, flowType: v })}>
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="simple">Simples</SelectItem>
                            <SelectItem value="multidisciplinary">Multidisciplinar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Prazo (dias)</Label>
                        <Input type="number" className="text-sm" value={stepForm.deadlineDays} onChange={(e) => setStepForm({ ...stepForm, deadlineDays: parseInt(e.target.value) || 5 })} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Ordem</Label>
                        <Input type="number" className="text-sm" value={stepForm.sequence} onChange={(e) => setStepForm({ ...stepForm, sequence: parseInt(e.target.value) || 1 })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Setor / Área</Label>
                        <Input className="text-sm" value={stepForm.sector} onChange={(e) => setStepForm({ ...stepForm, sector: e.target.value })} placeholder="Ex: Infraestrutura" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Responsável</Label>
                        <Select 
                          value={stepForm.responsibleTeamId} 
                          onValueChange={(v) => {
                            const member = team.find(t => t.id === v);
                            setStepForm({ ...stepForm, responsibleTeamId: v, responsible: member?.name || "" });
                          }}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="Selecione o responsável" />
                          </SelectTrigger>
                          <SelectContent>
                            {team.map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}{t.sector ? ` (${t.sector})` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" style={{ backgroundColor: theme.button }} onClick={handleAddStep}>
                        <Plus className="h-4 w-4 mr-1" /> Adicionar Etapa
                      </Button>
                    </div>

                    <Separator />

                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">ETAPAS DE APROVAÇÃO</Label>
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50">
                              <TableHead className="w-12 text-center text-xs">Nº</TableHead>
                              <TableHead className="text-xs">Setor / Área</TableHead>
                              <TableHead className="text-xs">Responsável</TableHead>
                              <TableHead className="text-xs w-24 text-center">Prazo (dias)</TableHead>
                              <TableHead className="text-xs w-24 text-center">Data Limite</TableHead>
                              <TableHead className="text-xs w-28 text-center">Status</TableHead>
                              <TableHead className="w-20 text-center">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {flowSteps.map(step => (
                              <TableRow key={step.id}>
                                <TableCell className="text-center text-sm font-medium">{step.sequence}</TableCell>
                                <TableCell className="text-sm">{step.sector}</TableCell>
                                <TableCell className="text-sm">{step.responsible}</TableCell>
                                <TableCell className="text-center text-sm">{step.deadlineDays}</TableCell>
                                <TableCell className="text-center text-sm text-gray-500">19/06/2025</TableCell>
                                <TableCell className="text-center">
                                  {step.status === "pending" && <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">Pendente</Badge>}
                                  {step.status === "in_progress" && <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Em Análise</Badge>}
                                  {step.status === "completed" && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Concluído</Badge>}
                                </TableCell>
                                <TableCell className="text-center">
                                  {step.status === "pending" && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startAnalysis(step)}>
                                      <ArrowRight className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                            {!flowSteps.length && (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-4 text-sm">
                                  Nenhuma etapa cadastrada
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Seção 2: Registro de Análise (só aparece se houver etapa em andamento) */}
                {selectedStep && selectedStep.status === "in_progress" ? (
                  <Card className="shadow-md">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs flex items-center justify-center">2</span>
                        Registro da Análise ({selectedStep.sector})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Responsável</Label>
                          <div className="text-sm font-medium">{selectedStep.responsible}</div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Data Recebimento</Label>
                          <Input type="date" className="text-sm" value={selectedStep.startedAt ? new Date(selectedStep.startedAt).toISOString().slice(0, 10) : "2025-06-15"} readOnly />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Data Limite</Label>
                          <Input type="date" className="text-sm" value="2025-06-19" readOnly />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Data Resposta</Label>
                          <Input type="date" className="text-sm" value={new Date().toISOString().slice(0, 10)} readOnly />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs text-muted-foreground">Forma de Parecer</Label>
                        <Select value={analysisForm.opinion} onValueChange={(v) => setAnalysisForm({ ...analysisForm, opinion: v })}>
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {opinionOptions.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs text-muted-foreground">Comentários da Análise</Label>
                        <Textarea 
                          className="text-sm"
                          rows={4}
                          value={analysisForm.comment} 
                          onChange={(e) => setAnalysisForm({ ...analysisForm, comment: e.target.value })} 
                          placeholder="Digite seus comentários sobre a análise"
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-muted-foreground">Anexos do Parecer</Label>
                        <div className="border-2 border-dashed rounded-lg p-4 text-center text-sm text-muted-foreground">
                          <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <div>Clique ou solte os arquivos aqui</div>
                          <div className="text-xs">PDF, DWG, DXF (Max 10 arquivos)</div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> O prazo para responder é até às 18h do dia 19/06
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" onClick={handleOpenReturnModal}>
                            <ArrowLeft className="h-4 w-4 mr-1" /> Retornar ao Projetista
                          </Button>
                          <Button size="sm" style={{ backgroundColor: theme.button }} onClick={handleSaveOpinion}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir Análise e Encaminhar
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="shadow-md">
                    <CardContent className="text-center py-8 text-muted-foreground text-sm">
                      <User className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p>Selecione uma etapa pendente para iniciar a análise</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Histórico de Análises */}
              <Card className="shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs flex items-center justify-center">3</span>
                    Histórico de Análises
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {flowSteps.filter(s => s.status === "completed").map(step => (
                    <div key={step.id} className="p-3 border rounded-lg bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-sm">{step.responsible} - {step.sector}</span>
                        </div>
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Aprovado</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Verificação de critérios técnicos de acordo com projeto e normas aplicáveis.
                      </p>
                      <div className="text-xs text-blue-600 flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Comentários_REV00.pdf
                      </div>
                    </div>
                  ))}
                  {!flowSteps.filter(s => s.status === "completed").length && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma análise concluída</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Timeline Lateral */}
        <div className="col-span-1">
          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">4. Timeline do Fluxo</CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              {!selectedDocument ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>Selecione um documento para visualizar o histórico</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />
                  <div className="space-y-6">
                    <div className="relative pl-10">
                      <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center">
                        <FileText className="h-3 w-3 text-white" />
                      </div>
                      <div className="text-sm">
                        <div className="font-medium">Documento Recebido</div>
                        <div className="text-xs text-muted-foreground">15/06/2025</div>
                        <div className="text-xs text-muted-foreground">Ana Magro</div>
                      </div>
                    </div>

                    {flowSteps.map((step, idx) => (
                      <div key={step.id} className="relative pl-10">
                        <div className={`absolute left-0 top-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center ${
                          step.status === "completed" ? "bg-green-500" : step.status === "in_progress" ? "bg-yellow-500" : "bg-gray-200"
                        }`}>
                          {step.status === "completed" && <CheckCircle2 className="h-3 w-3 text-white" />}
                          {step.status === "in_progress" && <User className="h-3 w-3 text-white" />}
                          {step.status === "pending" && <Clock className="h-3 w-3 text-gray-500" />}
                        </div>
                        <div className="text-sm">
                          <div className="font-medium">
                            {step.status === "pending" ? "Aguardando" : step.status === "in_progress" ? "Em Análise" : "Análise Concluída"} - {step.sector}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {step.completedAt ? new Date(step.completedAt).toLocaleDateString("pt-BR") : step.status === "in_progress" ? "15/06/2025" : "—"}
                          </div>
                          {step.status === "pending" && <div className="text-xs text-gray-400">{step.responsible}</div>}
                          {step.status === "in_progress" && <div className="text-xs text-blue-600">{step.responsible}</div>}
                          {step.status === "completed" && <div className="text-xs text-green-700">{step.responsible}</div>}
                        </div>
                        {idx < flowSteps.length - 1 && <div className="absolute left-3 top-7 h-8 w-0.5 bg-gray-200" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog para Retorno ao Projetista */}
      <Dialog open={openReturnModal} onOpenChange={setOpenReturnModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Retornar Documento ao Projetista</DialogTitle>
            <DialogDescription>
              Registre os detalhes do retorno ao projetista
            </DialogDescription>
          </DialogHeader>
          {selectedStep && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Analista</Label><div className="font-medium">{selectedStep.responsible}</div></div>
                <div><Label>Setor</Label><div className="font-medium">{selectedStep.sector}</div></div>
              </div>
              <div>
                <Label>Justificativa do Retorno</Label>
                <Textarea
                  value={returnForm.comment}
                  onChange={(e) => setReturnForm({ ...returnForm, comment: e.target.value })}
                  rows={4}
                  placeholder="Descreva o motivo do retorno e o que precisa ser ajustado"
                />
              </div>
              <div>
                <Label>Anexos (links separados por vírgula)</Label>
                <Input
                  value={returnForm.attachments}
                  onChange={(e) => setReturnForm({ ...returnForm, attachments: e.target.value })}
                  placeholder="https://exemplo.com/arquivo1.pdf, https://exemplo.com/arquivo2.pdf"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpenReturnModal(false)}><ArrowLeft className="h-4 w-4 mr-2" />Cancelar</Button>
            <Button style={{ backgroundColor: theme.button }} onClick={handleSaveReturnToDesigner}><Send className="h-4 w-4 mr-2" />Confirmar Retorno</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Análise (mantido como backup) */}
      <Dialog open={openAnalysis} onOpenChange={setOpenAnalysis}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registro da Análise</DialogTitle>
            <DialogDescription>
              Analise o documento e registre seu parecer
            </DialogDescription>
          </DialogHeader>
          {selectedStep && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Analista</Label><div className="font-medium">{selectedStep.responsible}</div></div>
                <div><Label>Setor</Label><div className="font-medium">{selectedStep.sector}</div></div>
              </div>
              <div><Label>Parecer</Label>
                <Select value={analysisForm.opinion} onValueChange={(v) => setAnalysisForm({ ...analysisForm, opinion: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{opinionOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Comentários</Label><Textarea value={analysisForm.comment} onChange={(e) => setAnalysisForm({ ...analysisForm, comment: e.target.value })} rows={4} /></div>
              <div><Label>Anexos</Label><Input value={analysisForm.attachments} onChange={(e) => setAnalysisForm({ ...analysisForm, attachments: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpenAnalysis(false)}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
            <Button variant="secondary" onClick={() => { toast.info("Retornado ao projetista"); setOpenAnalysis(false); }}><Send className="h-4 w-4 mr-2" />Retornar Projetista</Button>
            <Button style={{ backgroundColor: theme.button }} onClick={handleSaveOpinion}>Salvar Parecer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Cancelar Fluxo */}
      <Dialog open={openCancelFlowModal} onOpenChange={setOpenCancelFlowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancelar Fluxo de Aprovação</DialogTitle>
            <DialogDescription>
              O fluxo ficará marcado como cancelado e permanecerá disponível para consulta e auditoria. Esta ação não exclui os dados.
            </DialogDescription>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><Label className="text-xs text-muted-foreground">Documento</Label><div className="font-medium">{selectedDocument.code}</div></div>
                <div><Label className="text-xs text-muted-foreground">Título</Label><div className="font-medium">{selectedDocument.title}</div></div>
              </div>
              <div>
                <Label>Motivo do cancelamento *</Label>
                <Textarea
                  value={flowActionReason}
                  onChange={(e) => setFlowActionReason(e.target.value)}
                  rows={3}
                  placeholder="Descreva o motivo do cancelamento deste fluxo"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpenCancelFlowModal(false)} disabled={flowActionLoading}>Voltar</Button>
            <Button
              variant="destructive"
              onClick={handleCancelFlow}
              disabled={!flowActionReason.trim() || flowActionLoading}
            >
              <XCircle className="h-4 w-4 mr-2" />
              {flowActionLoading ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Excluir Fluxo */}
      <Dialog open={openDeleteFlowModal} onOpenChange={setOpenDeleteFlowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Excluir Fluxo de Aprovação</DialogTitle>
            <DialogDescription>
              Esta ação remove permanentemente o fluxo e suas etapas do sistema. Um registro de auditoria com todos os dados será preservado. Esta ação é irreversível.
            </DialogDescription>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><Label className="text-xs text-muted-foreground">Documento</Label><div className="font-medium">{selectedDocument.code}</div></div>
                <div><Label className="text-xs text-muted-foreground">Título</Label><div className="font-medium">{selectedDocument.title}</div></div>
              </div>
              <div>
                <Label>Motivo da exclusão *</Label>
                <Textarea
                  value={flowActionReason}
                  onChange={(e) => setFlowActionReason(e.target.value)}
                  rows={3}
                  placeholder="Descreva o motivo da exclusão deste fluxo"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpenDeleteFlowModal(false)} disabled={flowActionLoading}>Voltar</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFlow}
              disabled={!flowActionReason.trim() || flowActionLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {flowActionLoading ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
