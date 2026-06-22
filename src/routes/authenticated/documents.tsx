import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { docStatusLabels, docStatuses, originLabels, origins } from "@/lib/labels";
import { useLocalData } from "@/hooks/use-local-data";
import { useTheme } from "@/contexts/theme-context";
import { toast } from "sonner";
import { addWorkingDays } from "@/lib/utils";
import { exportDocumentsToExcel, exportDocumentsToPDF, type DocumentData } from "@/lib/export-utils";
import { StatusBadge } from "@/lib/status-utils.tsx";
import { Textarea } from "@/components/ui/textarea";
import { createStatusChangeNotification, checkForNotifications, sendBrowserNotification } from "@/lib/notifications-utils";

export const Route = createFileRoute("/authenticated/documents")({ component: DocumentsPage });

function DocumentsPage() {
  const searchParams = useSearch({ from: "/authenticated/documents" });
  const { theme } = useTheme();
  const { documents, projects, disciplines, projetistas, team, setDocuments, notifications, setNotifications, addRecentActivity } = useLocalData();
  
  // Check for notifications on load and when documents change
  useEffect(() => {
    const newNotifs = checkForNotifications(documents, notifications);
    if (newNotifs.length > 0) {
      setNotifications([...notifications, ...newNotifs]);
      // Enviar notificações push
      newNotifs.forEach(notif => {
        sendBrowserNotification(notif.title, notif.message);
      });
    }
  }, [documents, notifications, setNotifications]);
  const [openNewDoc, setOpenNewDoc] = useState(false);
  const [openDocDetails, setOpenDocDetails] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const today = new Date().toISOString().slice(0, 10);

  // Função para verificar se documento está atrasado
  const isDocumentOverdue = (doc: any): boolean => {
    if (!doc.analysisDeadline || ["approved", "rejected", "cancelled"].includes(doc.status)) return false;
    const deadline = new Date(doc.analysisDeadline);
    const todayDate = new Date();
    // Reset hours to compare dates only
    deadline.setHours(0, 0, 0, 0);
    todayDate.setHours(0, 0, 0, 0);
    return todayDate > deadline;
  };

  // Função para verificar se documento está vencendo em até 3 dias
  const isDocumentDueSoon = (doc: any): boolean => {
    if (!doc.analysisDeadline || ["approved", "rejected", "cancelled"].includes(doc.status)) return false;
    const deadline = new Date(doc.analysisDeadline);
    const todayDate = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(todayDate.getDate() + 3);
    // Reset hours
    deadline.setHours(0, 0, 0, 0);
    todayDate.setHours(0, 0, 0, 0);
    threeDaysFromNow.setHours(0, 0, 0, 0);
    return todayDate <= deadline && deadline <= threeDaysFromNow;
  };

  // Atualizar activeFilter quando searchParams mudar
  useEffect(() => {
    if (Object.keys(searchParams).length > 0) {
      setActiveFilter(searchParams);
    }
  }, [searchParams]);

  // Resetar página atual quando busca ou filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeFilter]);

  // Limpar filtro
  const clearFilter = () => {
    setActiveFilter(null);
  };

  // Obter descrição do filtro ativo
  const getFilterDescription = () => {
    if (!activeFilter) return null;
    if (activeFilter.status === "in_analysis") return "Filtrando: Em Análise";
    if (activeFilter.status === "approved") return "Filtrando: Aprovados";
    if (activeFilter.status === "rejected") return "Filtrando: Reprovados";
    if (activeFilter.overdue === "true") return "Filtrando: Atrasados";
    if (activeFilter.dueSoon === "true") return "Filtrando: Vencendo em Breve";
    return "Filtro ativo";
  };

  const prepareDocumentData = (): DocumentData[] => {
    return documents.map(doc => ({
      id: doc.id,
      code: doc.code,
      title: doc.title,
      projectName: projects.find(p => p.id === doc.projectId)?.name || "-",
      disciplineName: disciplines.find(d => d.id === doc.disciplineId)?.name || "-",
      origin: originLabels[doc.origin] || doc.origin,
      projetistaName: doc.origin === "projetista" && doc.originId 
        ? projetistas.find(p => p.id === doc.originId)?.name || "-" 
        : "-",
      status: docStatusLabels[doc.status] || doc.status,
      receivedAt: doc.receivedAt || "-",
      analysisDeadline: doc.analysisDeadline || "-",
      analysisReturnedAt: doc.analysisReturnedAt || "-",
      sentToProjetistaAt: doc.sentToProjetistaAt || "-",
      projetistaDays: doc.projetistaDays || "-",
      projetistaDeadline: doc.projetistaDeadline || "-",
      responsibleName: doc.responsibleName || "-",
      responsibleSector: doc.responsibleSector || "-"
    }));
  };

  const handleExportExcel = () => {
    const data = prepareDocumentData();
    exportDocumentsToExcel(data);
    toast.success("Planilha exportada com sucesso!");
  };

  const handleExportPDF = () => {
    const data = prepareDocumentData();
    exportDocumentsToPDF(data);
    toast.success("PDF exportado com sucesso!");
  };

  const filteredDocuments = documents.filter((doc: any) => {
    // Aplicar filtro de busca
    const lowerSearchTerm = searchTerm.toLowerCase();
    const matchesSearch = 
      doc.code?.toLowerCase().includes(lowerSearchTerm) ||
      doc.title?.toLowerCase().includes(lowerSearchTerm) ||
      projects.find(p => p.id === doc.projectId)?.name?.toLowerCase().includes(lowerSearchTerm);

    // Aplicar filtros ativos
    let matchesFilter = true;
    
    if (activeFilter) {
      if (activeFilter.status) {
        if (activeFilter.status === "approved") {
          matchesFilter = doc.status === "approved" || doc.status === "approved_with_comments";
        } else {
          matchesFilter = doc.status === activeFilter.status;
        }
      }
      
      if (activeFilter.overdue === "true") {
        matchesFilter = isDocumentOverdue(doc);
      }
      
      if (activeFilter.dueSoon === "true") {
        matchesFilter = isDocumentDueSoon(doc);
      }
    }

    return matchesSearch && matchesFilter;
  });

  // Paginação
  const totalPages = Math.ceil(filteredDocuments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDocuments = filteredDocuments.slice(startIndex, endIndex);
  
  const emptyDoc = { 
    code: "", 
    title: "", 
    projectId: "", 
    disciplineId: "", 
    docType: "", 
    currentRevision: "00", 
    origin: "supplier", 
    originId: "",
    status: "in_analysis", 
    receivedAt: today, 
    analysisDays: "",
    analysisDeadline: "",
    responsibleName: "",
    responsibleSector: "",
    externalLink: ""
  };

  function updateNewDocForm(updates: Partial<typeof emptyDoc>) {
    let newForm = { ...newDocForm, ...updates };
    
    if (newForm.receivedAt && newForm.analysisDays && Number(newForm.analysisDays) > 0) {
      const startDate = new Date(newForm.receivedAt);
      const deadline = addWorkingDays(startDate, Number(newForm.analysisDays));
      newForm.analysisDeadline = deadline.toISOString().slice(0, 10);
    }

    if (updates.responsibleName) {
      const member = team.find(m => m.name === updates.responsibleName);
      if (member) {
        newForm.responsibleSector = member.sector;
      }
    }
    
    setNewDocForm(newForm);
  }

  function updateEditForm(updates: Partial<typeof emptyDoc>) {
    let newForm = { ...editForm, ...updates };
    
    if (newForm.receivedAt && newForm.analysisDays && Number(newForm.analysisDays) > 0) {
      const startDate = new Date(newForm.receivedAt);
      const deadline = addWorkingDays(startDate, Number(newForm.analysisDays));
      newForm.analysisDeadline = deadline.toISOString().slice(0, 10);
    }

    if (updates.responsibleName) {
      const member = team.find(m => m.name === updates.responsibleName);
      if (member) {
        newForm.responsibleSector = member.sector;
      }
    }
    
    setEditForm(newForm);
  }
  
  const [newDocForm, setNewDocForm] = useState(emptyDoc);
  const [editForm, setEditForm] = useState(emptyDoc);
  const [newRevisionForm, setNewRevisionForm] = useState({
    revision: "01",
    status: "in_analysis",
    receivedAt: today,
    comments: "",
    fileUrl: ""
  });

  function handleCreateDocument() {
    const id = "doc-" + Date.now();
    const newDoc = {
      ...newDocForm,
      id,
      revisions: [{
        id: "rev-" + Date.now(),
        revision: newDocForm.currentRevision,
        status: newDocForm.status,
        receivedAt: newDocForm.receivedAt,
        createdAt: new Date().toISOString()
      }]
    };
    setDocuments([...documents, newDoc]);
    
    // Adicionar atividade recente
    addRecentActivity({
      type: 'document_created',
      title: 'Documento Recebido',
      description: `${newDoc.code} - ${newDoc.title}`,
      icon: 'file',
      color: 'blue',
      user: newDoc.responsibleName
    });
    
    toast.success("Documento cadastrado com sucesso!");
    setOpenNewDoc(false);
    setNewDocForm(emptyDoc);
  }

  function handleEditDocument() {
    if (!selectedDoc) return;
    const oldStatus = selectedDoc.status;
    const newStatus = editForm.status;
    
    if (oldStatus !== newStatus) {
      const notification = createStatusChangeNotification(selectedDoc, oldStatus, newStatus);
      setNotifications([...notifications, notification]);
      
      // Adicionar atividade recente baseada no novo status
      let activityType: any = 'document_updated';
      let activityTitle = 'Documento Atualizado';
      let activityColor = 'yellow';
      
      if (newStatus === 'approved' || newStatus === 'approved_with_comments') {
        activityType = 'document_approved';
        activityTitle = 'Análise Concluída';
        activityColor = 'green';
      } else if (newStatus === 'rejected') {
        activityType = 'document_rejected';
        activityTitle = 'Documento Rejeitado';
        activityColor = 'red';
      } else if (newStatus === 'in_analysis') {
        activityTitle = 'Em Análise';
        activityColor = 'blue';
      }
      
      addRecentActivity({
        type: activityType,
        title: activityTitle,
        description: `${editForm.code} - ${editForm.title}`,
        icon: 'check-circle',
        color: activityColor,
        user: editForm.responsibleName
      });
    } else {
      // Apenas atualização sem mudança de status
      addRecentActivity({
        type: 'document_updated',
        title: 'Documento Atualizado',
        description: `${editForm.code} - ${editForm.title}`,
        icon: 'edit',
        color: 'yellow',
        user: editForm.responsibleName
      });
    }
    
    const updatedDocuments = documents.map(d => d.id === selectedDoc.id ? { ...d, ...editForm } : d);
    setDocuments(updatedDocuments);
    toast.success("Documento atualizado com sucesso!");
    setIsEditing(false);
    setSelectedDoc((prev: any) => prev ? { ...prev, ...editForm } : null);
  }

  function handleDeleteDocument() {
    if (!selectedDoc) return;
    const updatedDocuments = documents.filter(d => d.id !== selectedDoc.id);
    setDocuments(updatedDocuments);
    toast.success("Documento excluído com sucesso!");
    setOpenDocDetails(false);
    setOpenDelete(false);
    setSelectedDoc(null);
  }

  function handleAddRevision() {
    if (!selectedDoc) return;
    
    const oldStatus = selectedDoc.status;
    const newStatus = newRevisionForm.status;
    
    if (oldStatus !== newStatus) {
      const notification = createStatusChangeNotification(selectedDoc, oldStatus, newStatus);
      setNotifications([...notifications, notification]);
    }
    
    const updatedDoc = {
      ...selectedDoc,
      currentRevision: newRevisionForm.revision,
      status: newRevisionForm.status,
      receivedAt: newRevisionForm.receivedAt,
      revisions: [
        ...selectedDoc.revisions,
        {
          id: "rev-" + Date.now(),
          revision: newRevisionForm.revision,
          status: newRevisionForm.status,
          receivedAt: newRevisionForm.receivedAt,
          comments: newRevisionForm.comments,
          fileUrl: newRevisionForm.fileUrl,
          createdAt: new Date().toISOString()
        }
      ]
    };
    
    setDocuments(documents.map(d => d.id === selectedDoc.id ? updatedDoc : d));
    setSelectedDoc(updatedDoc);
    toast.success("Revisão adicionada com sucesso!");
    setNewRevisionForm({
      revision: "01",
      status: "in_analysis",
      receivedAt: today,
      comments: "",
      fileUrl: ""
    });
  }

  function openDoc(doc: any) {
    setSelectedDoc(doc);
    setEditForm(doc);
    setIsEditing(false);
    setNewRevisionForm({
      revision: String(Number(doc.currentRevision) + 1).padStart(2, "0"),
      status: doc.status,
      receivedAt: today,
      comments: "",
      fileUrl: ""
    });
    setOpenDocDetails(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Controle de Documentos</h1>
          <p className="text-muted-foreground text-sm">Master Document Register</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleExportExcel}>
            <span className="mr-2">📊</span> Exportar Excel
          </Button>
          <Button variant="secondary" onClick={handleExportPDF}>
            <span className="mr-2">📄</span> Exportar PDF
          </Button>
          <Dialog open={openNewDoc} onOpenChange={setOpenNewDoc}>
            <DialogTrigger asChild><Button style={{ backgroundColor: theme.button, color: theme.text }}><Plus className="h-4 w-4 mr-2" />Novo Documento</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Cadastrar Documento</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Código *</Label><Input value={newDocForm.code} onChange={(e) => updateNewDocForm({ code: e.target.value })} /></div>
                <div><Label>Revisão Inicial</Label><Input value={newDocForm.currentRevision} onChange={(e) => updateNewDocForm({ currentRevision: e.target.value })} /></div>
                <div className="col-span-2"><Label>Título *</Label><Input value={newDocForm.title} onChange={(e) => updateNewDocForm({ title: e.target.value })} /></div>
                <div><Label>Projeto *</Label>
                  <Select value={newDocForm.projectId} onValueChange={(v) => updateNewDocForm({ projectId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Disciplina</Label>
                  <Select value={newDocForm.disciplineId} onValueChange={(v) => updateNewDocForm({ disciplineId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{disciplines.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Tipo</Label><Input value={newDocForm.docType} onChange={(e) => updateNewDocForm({ docType: e.target.value })} placeholder="P&ID, Planta, Memorial..." /></div>
                <div><Label>Origem</Label>
                  <Select value={newDocForm.origin} onValueChange={(v) => updateNewDocForm({ origin: v, originId: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{origins.map((o) => <SelectItem key={o} value={o}>{originLabels[o]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {newDocForm.origin === "projetista" && (
                  <div><Label>Projetista</Label>
                    <Select value={newDocForm.originId} onValueChange={(v) => updateNewDocForm({ originId: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{projetistas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}{p.company ? ` (${p.company})` : ""}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Nome Responsável</Label>
                  <Select value={newDocForm.responsibleName} onValueChange={(v) => updateNewDocForm({ responsibleName: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{team.map((m) => <SelectItem key={m.id} value={m.name}>{m.name} ({m.sector})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Setor Responsável</Label><Input value={newDocForm.responsibleSector} onChange={(e) => updateNewDocForm({ responsibleSector: e.target.value })} /></div>
                <div><Label>Recebido em</Label><Input type="date" value={newDocForm.receivedAt} onChange={(e) => updateNewDocForm({ receivedAt: e.target.value })} /></div>
                <div><Label>Dias para Análise</Label><Input type="number" min="1" value={newDocForm.analysisDays} onChange={(e) => updateNewDocForm({ analysisDays: e.target.value })} placeholder="Ex: 5" /></div>
              <div><Label>Prazo de Análise</Label><Input type="date" value={newDocForm.analysisDeadline} onChange={(e) => updateNewDocForm({ analysisDeadline: e.target.value })} /></div>
              <div className="col-span-2"><Label>Link do Documento (SharePoint, GED, ECM...)</Label><Input value={newDocForm.externalLink} onChange={(e) => updateNewDocForm({ externalLink: e.target.value })} placeholder="https://..." /></div>
              </div>
              <DialogFooter><Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleCreateDocument}>Salvar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Indicador de filtro ativo */}
      {activeFilter && (
        <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2">
          <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            {getFilterDescription()}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
            onClick={clearFilter}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Input 
          placeholder="Pesquisar documento por código, título ou projeto..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
        
        {/* Legenda dos ícones */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            No prazo
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            Vencendo em 3 dias
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            Atrasado
          </div>
        </div>
      </div>
      
      <Card className="shadow-md">
        <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-12" />
            <TableHead>Código</TableHead><TableHead>Título</TableHead><TableHead>Status</TableHead><TableHead>Revisão Atual</TableHead><TableHead className="w-32">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {paginatedDocuments.map((d: any) => {
              let statusIcon;
              if (!d.analysisDeadline || ["approved", "rejected", "cancelled"].includes(d.status)) {
                statusIcon = null;
              } else if (isDocumentOverdue(d)) {
                statusIcon = <div className="w-3 h-3 rounded-full bg-red-500" title="Atrasado" />;
              } else if (isDocumentDueSoon(d)) {
                statusIcon = <div className="w-3 h-3 rounded-full bg-amber-500" title="Vencendo em até 3 dias" />;
              } else {
                statusIcon = <div className="w-3 h-3 rounded-full bg-green-500" title="No prazo" />;
              }
              
              return (
              <TableRow 
                key={d.id} 
                className="cursor-pointer hover:bg-muted/50"
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('button')) openDoc(d);
                }}
              >
                <TableCell className="flex items-center justify-center">
                  {statusIcon}
                </TableCell>
                <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell className="font-medium max-w-xs truncate">
                    {d.title}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={d.status} />
                  </TableCell>
                  <TableCell><Badge variant="outline">{d.currentRevision}</Badge></TableCell>
                  <TableCell className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); openDoc(d); setIsEditing(true); }}><Edit className="h-3 w-3 mr-1" />Editar</Button>
                  <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedDoc(d); setOpenDelete(true); }}><Trash2 className="h-3 w-3 mr-1" />Excluir</Button>
                </TableCell>
              </TableRow>
              );
            })}
            {!filteredDocuments.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
              {searchTerm ? "Nenhum documento encontrado com essa pesquisa" : "Nenhum documento cadastrado"}
            </TableCell></TableRow>}
          </TableBody>
        </Table>
        </CardContent>

        {/* UI de Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Itens por página:</span>
              <Select 
                value={String(itemsPerPage)} 
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="secondary" 
                size="sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Anterior
              </Button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  style={page === currentPage ? { backgroundColor: theme.button, color: theme.text } : undefined}
                >
                  {page}
                </Button>
              ))}

              <Button 
                variant="secondary" 
                size="sm" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Próximo
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              Mostrando {startIndex + 1} a {Math.min(endIndex, filteredDocuments.length)} de {filteredDocuments.length}
            </div>
          </div>
        )}
      </Card>

      <Dialog open={openDocDetails} onOpenChange={setOpenDocDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes do Documento</DialogTitle></DialogHeader>
          
          {selectedDoc && (
            <div className="space-y-6">
              {isEditing ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Código *</Label><Input value={editForm.code} onChange={(e) => updateEditForm({ code: e.target.value })} /></div>
                    <div><Label>Revisão Atual</Label><Input value={editForm.currentRevision} onChange={(e) => updateEditForm({ currentRevision: e.target.value })} /></div>
                    <div className="col-span-2"><Label>Título *</Label><Input value={editForm.title} onChange={(e) => updateEditForm({ title: e.target.value })} /></div>
                    <div><Label>Projeto *</Label>
                      <Select value={editForm.projectId} onValueChange={(v) => updateEditForm({ projectId: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Disciplina</Label>
                      <Select value={editForm.disciplineId} onValueChange={(v) => updateEditForm({ disciplineId: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{disciplines.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Tipo</Label><Input value={editForm.docType} onChange={(e) => updateEditForm({ docType: e.target.value })} placeholder="P&ID, Planta, Memorial..." /></div>
                    <div><Label>Origem</Label>
                      <Select value={editForm.origin} onValueChange={(v) => updateEditForm({ origin: v, originId: "" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{origins.map((o) => <SelectItem key={o} value={o}>{originLabels[o]}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {editForm.origin === "projetista" && (
                      <div><Label>Projetista</Label>
                        <Select value={editForm.originId} onValueChange={(v) => updateEditForm({ originId: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{projetistas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}{p.company ? ` (${p.company})` : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    <div><Label>Status</Label>
                      <Select value={editForm.status} onValueChange={(v) => updateEditForm({ status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{docStatuses.map(s => <SelectItem key={s} value={s}>{docStatusLabels[s]}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Nome Responsável</Label>
                      <Select value={editForm.responsibleName} onValueChange={(v) => updateEditForm({ responsibleName: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{team.map((m) => <SelectItem key={m.id} value={m.name}>{m.name} ({m.sector})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Setor Responsável</Label><Input value={editForm.responsibleSector} onChange={(e) => updateEditForm({ responsibleSector: e.target.value })} /></div>
                    <div><Label>Recebido em</Label><Input type="date" value={editForm.receivedAt} onChange={(e) => updateEditForm({ receivedAt: e.target.value })} /></div>
                    <div><Label>Dias para Análise</Label><Input type="number" min="1" value={editForm.analysisDays} onChange={(e) => updateEditForm({ analysisDays: e.target.value })} placeholder="Ex: 5" /></div>
                <div><Label>Prazo de Análise</Label><Input type="date" value={editForm.analysisDeadline} onChange={(e) => updateEditForm({ analysisDeadline: e.target.value })} /></div>
                <div className="col-span-2"><Label>Link do Documento (SharePoint, GED, ECM...)</Label><Input value={editForm.externalLink} onChange={(e) => updateEditForm({ externalLink: e.target.value })} placeholder="https://..." /></div>
                  </div>

                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Código</Label>
                      <p className="font-mono font-medium">{selectedDoc.code}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Revisão Atual</Label>
                      <p className="font-medium"><Badge variant="outline">{selectedDoc.currentRevision}</Badge></p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Título</Label>
                      <p className="font-medium">{selectedDoc.title}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Projeto</Label>
                      <p>{projects.find((p: any) => p.id === selectedDoc.projectId)?.name || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Disciplina</Label>
                      <p>{disciplines.find((d: any) => d.id === selectedDoc.disciplineId)?.name || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Origem</Label>
                      <p>{originLabels[selectedDoc.origin as keyof typeof originLabels]}</p>
                    </div>
                    {selectedDoc.origin === "projetista" && selectedDoc.originId && (
                      <div>
                        <Label className="text-muted-foreground">Projetista</Label>
                        <p>{(() => { const p = projetistas.find((p: any) => p.id === selectedDoc.originId); return p ? `${p.name}${p.company ? ` (${p.company})` : ""}` : "—" })()}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <p>
                        <StatusBadge status={selectedDoc.status} />
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Nome Responsável</Label>
                      <p>{selectedDoc.responsibleName || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Setor Responsável</Label>
                      <p>{selectedDoc.responsibleSector || "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Link do Documento</Label>
                      <p>
                        {selectedDoc.externalLink ? (
                          <a href={selectedDoc.externalLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                            {selectedDoc.externalLink}
                          </a>
                        ) : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                {isEditing ? (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => { setIsEditing(false); setEditForm(selectedDoc); }}>Cancelar</Button>
                    <Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleEditDocument}>Salvar Alterações</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => { setIsEditing(true); setEditForm(selectedDoc); }}><Edit className="h-4 w-4 mr-2" />Editar Documento</Button>
                    <Button variant="destructive" onClick={() => setOpenDelete(true)}><Trash2 className="h-4 w-4 mr-2" />Excluir Documento</Button>
                  </div>
                )}
              </div>

              {!isEditing && (
                <>
                  {selectedDoc.status !== "approved" && (
                    <div className="border-t pt-4">
                      <h3 className="text-lg font-semibold mb-4">Adicionar Nova Revisão</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Revisão</Label><Input value={newRevisionForm.revision} onChange={(e) => setNewRevisionForm({ ...newRevisionForm, revision: e.target.value })} /></div>
                        <div><Label>Status</Label>
                          <Select value={newRevisionForm.status} onValueChange={(v) => setNewRevisionForm({ ...newRevisionForm, status: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{docStatuses.map(s => <SelectItem key={s} value={s}>{docStatusLabels[s]}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div><Label>Recebido em</Label><Input type="date" value={newRevisionForm.receivedAt} onChange={(e) => setNewRevisionForm({ ...newRevisionForm, receivedAt: e.target.value })} /></div>
                        <div><Label>Arquivo (URL)</Label><Input value={newRevisionForm.fileUrl} onChange={(e) => setNewRevisionForm({ ...newRevisionForm, fileUrl: e.target.value })} placeholder="Link para arquivo" /></div>
                        <div className="col-span-2">
                          <Label>Comentários</Label>
                          <Textarea value={newRevisionForm.comments} onChange={(e) => setNewRevisionForm({ ...newRevisionForm, comments: e.target.value })} placeholder="Comentários sobre a revisão..." />
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button style={{ backgroundColor: theme.button, color: theme.text }} onClick={handleAddRevision}><Plus className="h-4 w-4 mr-2" />Adicionar Revisão</Button>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <h3 className="text-lg font-semibold mb-4">Histórico de Revisões</h3>
                    <Card className="shadow-md">
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>Revisão</TableHead>
                            <TableHead>Data Recebimento</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Comentários</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {selectedDoc.revisions.slice().reverse().map((rev: any) => (
                              <TableRow key={rev.id}>
                                <TableCell className="font-mono text-xs"><Badge variant="outline">{rev.revision}</Badge></TableCell>
                                <TableCell>{rev.receivedAt}</TableCell>
                                <TableCell>
                                  <StatusBadge status={rev.status} />
                                </TableCell>
                                <TableCell className="max-w-xs truncate">{rev.comments || "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Documento</DialogTitle></DialogHeader>
          <p>Você tem certeza que deseja excluir o documento {selectedDoc?.title}? Esta ação é irreversível!</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenDelete(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteDocument}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
