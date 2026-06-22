import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { docStatusLabels, docStatuses, originLabels, origins, projectStatusLabels, projectStatuses } from "@/lib/labels";
import { chartColors, StatusBadge } from "@/lib/status-utils";
import { FileStack, FolderKanban, Clock, CheckCircle2, AlertTriangle, XCircle, Layers, UserCheck, ChevronsUpDown, Bell, Download, User, Send, Edit, RefreshCw, FileText } from "lucide-react";
import { useLocalData } from "@/hooks/use-local-data";
import { addWorkingDays } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { exportDashboardToPDF } from "@/lib/export-utils";
import { toast } from "sonner";
import { createStatusChangeNotification, checkForNotifications, checkForCriticalNotifications, requestNotificationPermission, sendBrowserNotification } from "@/lib/notifications-utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie } from "recharts";
import { useTheme } from "@/contexts/theme-context";

export const Route = createFileRoute("/authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { documents, projects, disciplines, projetistas, notifications, recentActivities, setDocuments, setProjects, setDisciplines, setProjetistas, setNotifications, addRecentActivity } = useLocalData();
  const today = new Date().toISOString().slice(0, 10);
  const [openDocDetails, setOpenDocDetails] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
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
    analysisReturnedAt: "",
    sentToProjetistaAt: "",
    projetistaDays: "",
    projetistaDeadline: "",
    responsibleName: "",
    responsibleSector: "",
    analysisComment: ""
  };
  const [editForm, setEditForm] = useState({ ...emptyDoc });

  // Pedir permissão para notificações push ao carregar o dashboard
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const notificationsRef = useRef(notifications);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Verificar notificações periodicamente (a cada 1 minuto)
  useEffect(() => {
    const checkNotifications = () => {
      const currentNotifs = notificationsRef.current;
      const newNotifs = [
        ...checkForNotifications(documents, currentNotifs),
        ...checkForCriticalNotifications(documents, currentNotifs),
      ];
      if (newNotifs.length > 0) {
        setNotifications([...currentNotifs, ...newNotifs]);
        newNotifs.forEach(notif => {
          sendBrowserNotification(notif.title, notif.message);
          toast(notif.title, { description: notif.message });
        });
      }
    };

    checkNotifications();
    const intervalId = setInterval(checkNotifications, 60000);
    return () => clearInterval(intervalId);
  }, [documents]);

  const handleExportDashboardPDF = async () => {
    await exportDashboardToPDF("dashboard-content", "dashboard.pdf");
    toast.success("Dashboard exportado com sucesso!");
  };

  const navigateToDocuments = (filters: any) => {
    navigate({ to: "/authenticated/documents", search: filters });
  };

  const isDocumentOverdue = (doc: any): boolean => {
    if (!doc.analysisDeadline || ["approved", "rejected", "cancelled"].includes(doc.status)) return false;
    const deadline = new Date(doc.analysisDeadline);
    const todayDate = new Date();
    deadline.setHours(0, 0, 0, 0);
    todayDate.setHours(0, 0, 0, 0);
    return todayDate > deadline;
  };

  const isDocumentDueSoon = (doc: any): boolean => {
    if (!doc.analysisDeadline || ["approved", "rejected", "cancelled"].includes(doc.status)) return false;
    const deadline = new Date(doc.analysisDeadline);
    const todayDate = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(todayDate.getDate() + 3);
    deadline.setHours(0, 0, 0, 0);
    todayDate.setHours(0, 0, 0, 0);
    threeDaysFromNow.setHours(0, 0, 0, 0);
    return todayDate <= deadline && deadline <= threeDaysFromNow;
  };

  const overdueDocs = documents.filter(isDocumentOverdue);
  const dueSoonDocs = documents.filter(isDocumentDueSoon);

  // Filters
  const [selectedProject, setSelectedProject] = useState<string[]>(["all"]);
  const [selectedMonth, setSelectedMonth] = useState<string[]>(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));

  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  // New Project Dialog State
  const [openNewProject, setOpenNewProject] = useState(false);
  const emptyProjectForm = { code: "", name: "", client: "", startDate: "", endDate: "", status: "planning" };
  const [newProjectForm, setNewProjectForm] = useState(emptyProjectForm);

  // New Document Dialog State
  const [openNewDocument, setOpenNewDocument] = useState(false);
  const emptyDocForm = {
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
    analysisReturnedAt: "",
    sentToProjetistaAt: "",
    projetistaDays: "",
    projetistaDeadline: "",
    responsibleName: "",
    responsibleSector: ""
  };
  const [newDocForm, setNewDocForm] = useState(emptyDocForm);

  // New Discipline Dialog State
  const [openNewDiscipline, setOpenNewDiscipline] = useState(false);
  const emptyDisciplineForm = { code: "", name: "" };
  const [newDisciplineForm, setNewDisciplineForm] = useState(emptyDisciplineForm);

  // New Projetista Dialog State
  const [openNewProjetista, setOpenNewProjetista] = useState(false);
  const emptyProjetistaForm = { name: "", company: "" };
  const [newProjetistaForm, setNewProjetistaForm] = useState(emptyProjetistaForm);

  function updateDocForm(updates: Partial<typeof emptyDocForm>) {
    const newForm = { ...newDocForm, ...updates };

    if (newForm.receivedAt && newForm.analysisDays && Number(newForm.analysisDays) > 0) {
      const startDate = new Date(newForm.receivedAt);
      const deadline = addWorkingDays(startDate, Number(newForm.analysisDays));
      newForm.analysisDeadline = deadline.toISOString().slice(0, 10);
    }

    setNewDocForm(newForm);
  }

  function updateEditForm(updates: Partial<typeof emptyDoc>) {
    const newForm = { ...editForm, ...updates };

    if (newForm.receivedAt && newForm.analysisDays && Number(newForm.analysisDays) > 0) {
      const startDate = new Date(newForm.receivedAt);
      const deadline = addWorkingDays(startDate, Number(newForm.analysisDays));
      newForm.analysisDeadline = deadline.toISOString().slice(0, 10);
    }

    if (newForm.sentToProjetistaAt && newForm.projetistaDays && Number(newForm.projetistaDays) > 0) {
      const startDate = new Date(newForm.sentToProjetistaAt);
      const deadline = addWorkingDays(startDate, Number(newForm.projetistaDays));
      newForm.projetistaDeadline = deadline.toISOString().slice(0, 10);
    }

    setEditForm(newForm);
  }

  // Filter documents
  const filteredDocs = documents.filter((d: any) => {
    let match = true;
    if (!selectedProject.includes("all")) {
      match = match && selectedProject.includes(d.projectId);
    }
    if (d.receivedAt) {
      const docDate = new Date(d.receivedAt);
      const docMonth = String(docDate.getMonth() + 1);
      if (selectedMonth.length < 12) {
        match = match && selectedMonth.includes(docMonth);
      }
      match = match && docDate.getFullYear() === Number(selectedYear);
    }
    return match;
  });

  const docs = filteredDocs ?? [];
  const projectList = projects ?? [];

  const sectorData = Object.entries(
    docs.reduce<Record<string, number>>((acc, d: any) => {
      const sector = d.responsibleSector || "Sem Setor";
      acc[sector] = (acc[sector] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const disciplineData = Object.entries(
    docs.reduce<Record<string, number>>((acc, d: any) => {
      const discipline = d.disciplineId
        ? (disciplines.find((disc: any) => disc.id === d.disciplineId)?.name || "Sem Disciplina")
        : "Sem Disciplina";
      acc[discipline] = (acc[discipline] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const isProjetistaOverdue = (doc: any): boolean => {
    if (!doc.projetistaDeadline || ["approved", "rejected", "cancelled", "in_analysis"].includes(doc.status)) return false;
    const deadline = new Date(doc.projetistaDeadline);
    const today = new Date();
    deadline.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return today > deadline;
  };

  const projetistaDataObj = docs.reduce<Record<string, { waiting: number; overdue: number }>>((acc, d: any) => {
    let projetistaName = "Sem Projetista";
    if (d.origin === "projetista" && d.originId) {
      const projetista = projetistas.find((p: any) => p.id === d.originId);
      if (projetista) projetistaName = projetista.name;
    }
    if (!acc[projetistaName]) acc[projetistaName] = { waiting: 0, overdue: 0 };
    if (["awaiting_revision", "approved_with_comments", "rejected"].includes(d.status)) acc[projetistaName].waiting++;
    if (isProjetistaOverdue(d)) acc[projetistaName].overdue++;
    return acc;
  }, {});

  const projetistaData = projetistas.map((p: any) => {
    const values = projetistaDataObj[p.name] || { waiting: 0, overdue: 0 };
    return { name: p.name, "Aguardando Retorno": values.waiting, "Atrasados": values.overdue };
  });

  const monthlyData = (() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthName = monthNames[i];
      const monthDocs = docs.filter((d: any) => {
        if (!d.receivedAt) return false;
        const docDate = new Date(d.receivedAt);
        return docDate.getMonth() === i && docDate.getFullYear() === Number(selectedYear);
      });
      const recebidos = monthDocs.length;
      const aprovados = monthDocs.filter((d: any) => ["approved", "approved_with_comments"].includes(d.status)).length;
      const atrasados = monthDocs.filter((d: any) => {
        if (!d.analysisDeadline) return false;
        if (["approved", "rejected", "cancelled"].includes(d.status)) return false;
        const deadline = new Date(d.analysisDeadline);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        deadline.setHours(0, 0, 0, 0);
        return today > deadline;
      }).length;
      return { month: monthName, "Recebidos": recebidos, "Aprovados": aprovados, "Atrasados": atrasados };
    });
  })();

  const todayDate = new Date().toISOString().slice(0, 10);
  const overdue = docs.filter((d: any) => d.analysisDeadline && d.analysisDeadline < todayDate && !["approved", "rejected", "cancelled"].includes(d.status)).length;
  const inAnalysis = docs.filter((d: any) => d.status === "in_analysis").length;
  const approved = docs.filter((d: any) => d.status === "approved" || d.status === "approved_with_comments").length;
  const rejected = docs.filter((d: any) => d.status === "rejected").length;

  const statusData = [
    { name: "Aprovados", value: approved, fill: chartColors.approved || "#10b981" },
    { name: "Em Análise", value: inAnalysis, fill: chartColors.in_analysis || "#3b82f6" },
    { name: "Atrasados", value: overdue, fill: chartColors.atrasados || "#ef4444" },
    { name: "Reprovados", value: rejected, fill: chartColors.rejected || "#991b1b" }
  ].filter(item => item.value > 0);

  const sectorSLAData = sectorData.map(item => {
    const sectorDocs = docs.filter((d: any) => (d.responsibleSector || "Sem Setor") === item.name);
    const completed = sectorDocs.filter((d: any) => ["approved", "approved_with_comments"].includes(d.status));
    const onTime = completed.filter((d: any) => {
      if (!d.analysisDeadline) return true;
      const deadline = new Date(d.analysisDeadline);
      const completionDate = d.analysisReturnedAt ? new Date(d.analysisReturnedAt) : new Date();
      return completionDate <= deadline;
    }).length;
    const late = completed.length - onTime;
    const total = completed.length > 0 ? completed.length : 1;
    return {
      name: item.name,
      "Dentro do Prazo": Math.round((onTime / total) * 100),
      "Fora do Prazo": Math.round((late / total) * 100)
    };
  });

  const totalRevisions = docs.reduce((acc, doc: any) => acc + (doc.revisions ? doc.revisions.length : 0), 0);

  const total = docs.length;
  let percentage = 100;
  if (total > 0) percentage = (approved / total) * 100;

  let semaforoStatus: { label: string; color: string; bgColor: string; icon: any } = {
    label: "Bom", color: "#10b981", bgColor: "#d1fae5", icon: CheckCircle2
  };
  if (percentage < 30) {
    semaforoStatus = { label: "Crítico", color: "#ef4444", bgColor: "#fee2e2", icon: AlertTriangle };
  } else if (percentage >= 30 && percentage <= 55) {
    semaforoStatus = { label: "Atenção", color: "#f59e0b", bgColor: "#fef3c7", icon: Clock };
  }

  const cards = [
    { label: "Total de Documentos", value: docs.length, icon: FileStack, color: "text-info", action: () => navigateToDocuments({}) },
    { label: "Em Análise", value: inAnalysis, icon: Clock, color: "text-warning", action: () => navigateToDocuments({ status: "in_analysis" }) },
    { label: "Aprovados", value: approved, icon: CheckCircle2, color: "text-success", action: () => navigateToDocuments({ status: "approved" }) },
    { label: "Atrasados", value: overdue, icon: AlertTriangle, color: "text-destructive", action: () => navigateToDocuments({ overdue: "true" }) },
    { label: "Reprovados", value: rejected, icon: XCircle, color: "text-destructive", action: () => navigateToDocuments({ status: "rejected" }) },
    { label: "Revisões", value: totalRevisions, icon: Layers, color: "text-purple-500", action: () => navigateToDocuments({}) },
  ];

  function handleSaveProject() {
    const newProject = { id: "proj-" + Date.now(), ...newProjectForm };
    setProjects([...projects, newProject]);
    addRecentActivity({ type: 'project_created', title: 'Projeto Criado', description: `${newProject.code} - ${newProject.name}`, icon: 'folder', color: 'blue' });
    toast.success("Projeto criado com sucesso!");
    setOpenNewProject(false);
    setNewProjectForm(emptyProjectForm);
  }

  function handleSaveDocument() {
    const newDoc = {
      id: "doc-" + Date.now(),
      ...newDocForm,
      revisions: [{ id: "rev-" + Date.now(), revision: newDocForm.currentRevision, status: newDocForm.status, receivedAt: newDocForm.receivedAt, createdAt: new Date().toISOString() }]
    };
    setDocuments([...documents, newDoc]);
    addRecentActivity({ type: 'document_created', title: 'Documento Recebido', description: `${newDoc.code} - ${newDoc.title}`, icon: 'file', color: 'blue', user: newDoc.responsibleName });
    toast.success("Documento cadastrado com sucesso!");
    setOpenNewDocument(false);
    setNewDocForm(emptyDocForm);
  }

  function handleSaveDiscipline() {
    if (!newDisciplineForm.code || !newDisciplineForm.name) { toast.error("Preencha todos os campos"); return; }
    const newDiscipline = { id: "disc-" + Date.now(), ...newDisciplineForm };
    setDisciplines([...disciplines, newDiscipline]);
    addRecentActivity({ type: 'discipline_created', title: 'Disciplina Criada', description: `${newDiscipline.code} - ${newDiscipline.name}`, icon: 'layers', color: 'purple' });
    toast.success("Disciplina criada com sucesso!");
    setOpenNewDiscipline(false);
    setNewDisciplineForm(emptyDisciplineForm);
  }

  function handleSaveProjetista() {
    if (!newProjetistaForm.name) { toast.error("Preencha o nome do projetista"); return; }
    const newProjetista = { id: "proj-" + Date.now(), ...newProjetistaForm };
    setProjetistas([...projetistas, newProjetista]);
    addRecentActivity({ type: 'projetista_created', title: 'Projetista Adicionado', description: newProjetista.name, icon: 'user', color: 'green', user: newProjetista.company });
    toast.success("Projetista criado com sucesso!");
    setOpenNewProjetista(false);
    setNewProjetistaForm(emptyProjetistaForm);
  }

  function handleEditDocument() {
    if (!selectedDoc) return;
    const oldStatus = selectedDoc.status;
    const newStatus = editForm.status;

    if (oldStatus !== newStatus) {
      const notification = createStatusChangeNotification(selectedDoc, oldStatus, newStatus);
      setNotifications([...notifications, notification]);
      let activityType: any = 'document_updated';
      let activityTitle = 'Documento Atualizado';
      let activityColor = 'yellow';
      if (newStatus === 'approved' || newStatus === 'approved_with_comments') { activityType = 'document_approved'; activityTitle = 'Análise Concluída'; activityColor = 'green'; }
      else if (newStatus === 'rejected') { activityType = 'document_rejected'; activityTitle = 'Documento Rejeitado'; activityColor = 'red'; }
      else if (newStatus === 'in_analysis') { activityTitle = 'Em Análise'; activityColor = 'blue'; }
      addRecentActivity({ type: activityType, title: activityTitle, description: `${editForm.code} - ${editForm.title}`, icon: 'check-circle', color: activityColor, user: editForm.responsibleName });
    } else {
      addRecentActivity({ type: 'document_updated', title: 'Documento Atualizado', description: `${editForm.code} - ${editForm.title}`, icon: 'edit', color: 'yellow', user: editForm.responsibleName });
    }

    const updatedDocuments = documents.map(d => d.id === selectedDoc.id ? { ...d, ...editForm } : d);
    setDocuments(updatedDocuments);
    toast.success("Documento atualizado com sucesso!");
    setIsEditing(false);
    setSelectedDoc((prev: any) => prev ? { ...prev, ...editForm } : null);
  }

  const years = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - 5 + i));

  return (
    <TooltipProvider>
      <div className="space-y-8">
        <div className="pt-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Executivo</h1>
            <p className="text-muted-foreground text-sm">Visão geral do controle documental</p>
          </div>
          <div className="flex gap-2 flex-wrap"></div>
        </div>

        <div id="dashboard-content" className="space-y-8">
          {/* Top Bar with Filters and Buttons */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Projeto</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" className="w-[200px] justify-between text-xs">
                    {selectedProject.includes("all") ? "Todos os Projetos" : selectedProject.length > 0 ? `${selectedProject.length} projetos` : "Selecione Projetos"}
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar projeto..." />
                    <CommandList>
                      <CommandEmpty>Nenhum projeto encontrado.</CommandEmpty>
                      <CommandGroup className="max-h-[200px] overflow-y-auto">
                        <CommandItem key="all" onSelect={() => setSelectedProject(prev => prev.includes("all") ? [] : ["all"])}>
                          <Checkbox checked={selectedProject.includes("all")} className="mr-2" />
                          Todos os Projetos
                        </CommandItem>
                        {projects.map((p: any) => (
                          <CommandItem key={p.id} onSelect={() => {
                            setSelectedProject(prev => {
                              let newSelected = prev.includes("all") ? [] : [...prev];
                              newSelected = newSelected.includes(p.id) ? newSelected.filter(id => id !== p.id) : [...newSelected, p.id];
                              return newSelected;
                            });
                          }}>
                            <Checkbox checked={selectedProject.includes(p.id)} className="mr-2" />
                            {p.code} — {p.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs">Período</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" className="w-[150px] justify-between text-xs">
                    {selectedMonth.length === 12 ? "Todos os Meses" : selectedMonth.length > 0 ? `${selectedMonth.length} mês${selectedMonth.length > 1 ? "es" : ""}` : "Selecione Meses"}
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar mês..." />
                    <CommandList>
                      <CommandEmpty>Nenhum mês encontrado.</CommandEmpty>
                      <CommandGroup className="max-h-[200px] overflow-y-auto">
                        <CommandItem key="all" onSelect={() => setSelectedMonth(prev => prev.length === 12 ? [] : ["1","2","3","4","5","6","7","8","9","10","11","12"])}>
                          <Checkbox checked={selectedMonth.length === 12} className="mr-2" />
                          Todos os Meses
                        </CommandItem>
                        {monthNames.map((name, index) => (
                          <CommandItem key={index + 1} onSelect={() => {
                            setSelectedMonth(prev => {
                              const monthNum = String(index + 1);
                              const isAllSelected = prev.length === 12;
                              const newSelected = isAllSelected ? [] : [...prev];
                              return newSelected.includes(monthNum) ? newSelected.filter(m => m !== monthNum) : [...newSelected, monthNum];
                            });
                          }}>
                            <Checkbox checked={selectedMonth.includes(String(index + 1))} className="mr-2" />
                            {name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs">Ano</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 ml-auto">
              <Button variant="default" className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transition-all" onClick={async () => {
                const granted = await requestNotificationPermission();
                if (granted) toast.success("Notificações ativadas!");
                else toast.error("Permissão negada para notificações");
              }}>
                <Bell className="h-4 w-4 mr-2" />Ativar Notificações
              </Button>
              <Button variant="default" className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all" onClick={handleExportDashboardPDF}>
                <Download className="h-4 w-4 mr-2" />Exportar PDF
              </Button>
            </div>
          </div>

          {/* Main KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
            {cards.map((c, i) => {
              const Icon = c.icon;
              const colors = ["bg-blue-100 text-blue-600","bg-yellow-100 text-yellow-600","bg-green-100 text-green-600","bg-orange-100 text-orange-600","bg-red-100 text-red-600","bg-purple-100 text-purple-600"];
              const tooltips = ["Total de documentos cadastrados no sistema","Documentos atualmente em análise","Documentos aprovados","Documentos atrasados","Documentos reprovados","Total de revisões realizadas"];
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <Card className="cursor-pointer shadow-md hover:shadow-lg transition-shadow" onClick={c.action}>
                      <CardContent className="pt-6 pb-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-3xl font-bold">{c.value}</div>
                            <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
                          </div>
                          <div className={`p-3 rounded-full ${colors[i % colors.length]}`}>
                            <Icon className="h-6 w-6" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent><p>{tooltips[i]}</p></TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Second Row: Status Pie, Semaforo, SLA Geral */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Card className="flex flex-col lg:col-span-2 shadow-md">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Status dos Documentos</CardTitle></CardHeader>
              <CardContent className="pb-2">
                <div className="flex flex-col md:flex-row items-center justify-center gap-4 h-52">
                  <div className="w-56 h-56 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <Pie data={statusData} cx="50%" cy="50%" labelLine={false}
                          label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                            const RADIAN = Math.PI / 180;
                            const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                            const x = cx + radius * Math.cos(-midAngle * RADIAN);
                            const y = cy + radius * Math.sin(-midAngle * RADIAN);
                            return <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="14" fontWeight="bold">{value > 0 ? value : ''}</text>;
                          }}
                          innerRadius={55} outerRadius={95} fill="#8884d8" dataKey="value" stroke="white" strokeWidth={5}>
                          {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                        </Pie>
                        <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-bold text-gray-800">{docs.length}</text>
                        <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" className="text-xs text-gray-500">Total</text>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-2">
                    {statusData.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                        <span className="text-xs">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-1 shadow-md flex flex-col">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Semáforo do Projeto</CardTitle></CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex-shrink-0 relative w-36 h-36">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="15" />
                      <circle cx="50" cy="50" r="40" fill="none" stroke={semaforoStatus.color} strokeWidth="15" strokeDasharray={`${percentage * 2.51} 251`} strokeDashoffset="0" strokeLinecap="round" transform="rotate(-90 50 50)" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: semaforoStatus.color + "20" }}>
                        {(() => { const IconComponent = semaforoStatus.icon; return <IconComponent className="h-6 w-6" style={{ color: semaforoStatus.color }} />; })()}
                      </div>
                      <div className={`${semaforoStatus.label === "Atenção" ? "text-sm" : "text-base"} font-semibold mt-2`} style={{ color: semaforoStatus.color }}>{semaforoStatus.label}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 shadow-md flex flex-col">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">SLA Geral (Média)</CardTitle></CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-center">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full border-2 border-gray-400 flex items-center justify-center"><Clock className="w-4 h-4 text-gray-600" /></div>
                    <span className="text-sm">Tempo médio de aprovação</span>
                  </div>
                  <span className="text-lg font-semibold text-blue-600">
                    {docs.length > 0 ? (() => { let totalDays = 0; let count = 0; docs.forEach(d => { if (d.receivedAt && d.analysisReturnedAt) { const diff = Math.abs(new Date(d.analysisReturnedAt).getTime() - new Date(d.receivedAt).getTime()); totalDays += Math.ceil(diff / 86400000); count++; } }); return count > 0 ? Math.round(totalDays / count) : 0; })() : 0} dias
                  </span>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full border-2 border-gray-400 flex items-center justify-center"><Clock className="w-4 h-4 text-gray-600" /></div>
                    <span className="text-sm">Tempo médio de resposta</span>
                  </div>
                  <span className="text-lg font-semibold text-green-600">
                    {docs.length > 0 ? (() => { let totalDays = 0; let count = 0; docs.forEach(d => { if (d.receivedAt && d.analysisDeadline) { const diff = Math.abs(new Date(d.analysisDeadline).getTime() - new Date(d.receivedAt).getTime()); totalDays += Math.ceil(diff / 86400000); count++; } }); return count > 0 ? Math.round(totalDays / count) : 0; })() : 0} dias
                  </span>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full border-2 border-gray-400 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-gray-600" /></div>
                    <span className="text-sm">Primeira aprovação</span>
                  </div>
                  <span className="text-lg font-semibold text-indigo-600">{docs.length > 0 ? Math.round((approved / docs.length) * 100) : 0}%</span>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full border-2 border-gray-400 flex items-center justify-center"><FileText className="w-4 h-4 text-gray-600" /></div>
                    <span className="text-sm">Documentos revisados</span>
                  </div>
                  <span className="text-lg font-semibold text-indigo-600">{totalRevisions}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Third Row: Three charts */}
          <Card className="shadow-md">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              <div className="p-4 border-r border-gray-200">
                <h3 className="text-sm font-semibold mb-3">Documentos por Disciplina</h3>
                <div className="space-y-2">
                  {disciplineData.map((item, index) => {
                    const maxVal = Math.max(...disciplineData.map(d => d.value));
                    const pct = (item.value / maxVal) * 100;
                    const itemPct = docs.length > 0 ? Math.round((item.value / docs.length) * 100) : 0;
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-xs w-28 truncate">{item.name}</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded"><div className="h-full bg-blue-500 rounded" style={{ width: `${pct}%` }} /></div>
                        <span className="text-xs font-semibold text-blue-600 w-12 text-right">{item.value} ({itemPct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-4 border-r border-gray-200">
                <h3 className="text-sm font-semibold mb-3">Desempenho dos Projetistas</h3>
                <div className="space-y-2">
                  {projetistas.slice(0, 5).map((projetista: any, index: number) => {
                    const assignedDocs = docs.filter((d: any) => d.originId === projetista.id);
                    const totalAssigned = assignedDocs.length;
                    const inDeadline = assignedDocs.filter((d: any) => ["approved", "approved_with_comments"].includes(d.status)).length;
                    const pct = totalAssigned > 0 ? Math.round((inDeadline / totalAssigned) * 100) : 0;
                    return (
                      <div key={projetista.id} className="flex items-center gap-2">
                        <span className="text-xs w-2">{index + 1}</span>
                        <span className="text-xs w-24 truncate">{projetista.name}</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded"><div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} /></div>
                        <span className="text-xs font-semibold text-green-600 w-10 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-sm font-semibold mb-3">Desempenho por Setor (SLA)</h3>
                <div className="space-y-2">
                  {sectorSLAData.map((item, index) => {
                    const t = item["Dentro do Prazo"] + item["Fora do Prazo"];
                    const pct = t > 0 ? Math.round((item["Dentro do Prazo"] / t) * 100) : 0;
                    const color = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-xs w-28 truncate">{item.name}</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded"><div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: color }} /></div>
                        <span className="text-xs font-semibold w-10 text-right" style={{ color }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 shadow-md">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Evolução Mensal de Documentos</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <RechartsTooltip />
                    <Legend />
                    <Line type="monotone" dataKey="Recebidos" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="Aprovados" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="Atrasados" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Atividades Recentes</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentActivities.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-xs">Nenhuma atividade recente</div>
                  ) : (
                    recentActivities.slice(0, 4).map((activity: any) => {
                      const colorClasses: Record<string, string> = { blue: 'bg-blue-100 text-blue-600', green: 'bg-green-100 text-green-600', yellow: 'bg-yellow-100 text-yellow-600', red: 'bg-red-100 text-red-600', purple: 'bg-purple-100 text-purple-600' };
                      const IconComponent = (() => { switch (activity.icon) { case 'file': return FileStack; case 'folder': return FolderKanban; case 'user': return User; case 'check-circle': return CheckCircle2; case 'edit': return Edit; case 'layers': return Layers; default: return FileStack; } })();
                      return (
                        <div key={activity.id} className="flex gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${colorClasses[activity.color] || colorClasses.blue}`}>
                            <IconComponent className="h-3 w-3" />
                          </div>
                          <div className="text-[12px]">
                            <div>{activity.title}</div>
                            {activity.description && <div className="text-muted-foreground">{activity.description}</div>}
                            <div className="text-muted-foreground">{new Date(activity.createdAt).toLocaleDateString('pt-BR')}</div>
                            {activity.user && <div className="text-muted-foreground">{activity.user}</div>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Dialog Detalhes do Documento */}
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
                      <div><Label>Nome Responsável</Label><Input value={editForm.responsibleName} onChange={(e) => updateEditForm({ responsibleName: e.target.value })} /></div>
                      <div><Label>Setor Responsável</Label><Input value={editForm.responsibleSector} onChange={(e) => updateEditForm({ responsibleSector: e.target.value })} /></div>
                      <div><Label>Recebido em</Label><Input type="date" value={editForm.receivedAt} onChange={(e) => updateEditForm({ receivedAt: e.target.value })} /></div>
                      <div><Label>Dias para Análise</Label><Input type="number" min="1" value={editForm.analysisDays} onChange={(e) => updateEditForm({ analysisDays: e.target.value })} placeholder="Ex: 5" /></div>
                      <div><Label>Prazo de Análise</Label><Input type="date" value={editForm.analysisDeadline} onChange={(e) => updateEditForm({ analysisDeadline: e.target.value })} /></div>
                    </div>
                    <div className="border-t pt-4">
                      <h3 className="text-lg font-semibold mb-4">Retorno da Análise</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Status Final da Análise</Label>
                          <Select value={editForm.status} onValueChange={(v) => updateEditForm({ status: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{docStatuses.map(s => <SelectItem key={s} value={s}>{docStatusLabels[s]}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div><Label>Data Retorno Análise</Label><Input type="date" value={editForm.analysisReturnedAt} onChange={(e) => updateEditForm({ analysisReturnedAt: e.target.value })} /></div>
                        {editForm.status !== "approved" && (
                          <>
                            <div><Label>Data Envio à Projetista</Label><Input type="date" value={editForm.sentToProjetistaAt} onChange={(e) => updateEditForm({ sentToProjetistaAt: e.target.value })} /></div>
                            <div><Label>Dias Prazo Projetista</Label><Input type="number" min="1" value={editForm.projetistaDays} onChange={(e) => updateEditForm({ projetistaDays: e.target.value })} placeholder="Ex: 10" /></div>
                            <div><Label>Prazo Projetista</Label><Input type="date" value={editForm.projetistaDeadline} onChange={(e) => updateEditForm({ projetistaDeadline: e.target.value })} /></div>
                          </>
                        )}
                        <div className="col-span-2">
                          <Label>Observações da Análise</Label>
                          <Textarea value={editForm.analysisComment} onChange={(e) => updateEditForm({ analysisComment: e.target.value })} placeholder="Adicione observações sobre a análise..." />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label className="text-muted-foreground">Código</Label><p className="font-mono font-medium">{selectedDoc.code}</p></div>
                      <div><Label className="text-muted-foreground">Revisão Atual</Label><p><Badge variant="outline">{selectedDoc.currentRevision}</Badge></p></div>
                      <div className="col-span-2"><Label className="text-muted-foreground">Título</Label><p className="font-medium">{selectedDoc.title}</p></div>
                      <div><Label className="text-muted-foreground">Projeto</Label><p>{projects.find((p: any) => p.id === selectedDoc.projectId)?.name || "—"}</p></div>
                      <div><Label className="text-muted-foreground">Disciplina</Label><p>{disciplines.find((d: any) => d.id === selectedDoc.disciplineId)?.name || "—"}</p></div>
                      <div><Label className="text-muted-foreground">Origem</Label><p>{originLabels[selectedDoc.origin as keyof typeof originLabels]}</p></div>
                      {selectedDoc.origin === "projetista" && selectedDoc.originId && (
                        <div><Label className="text-muted-foreground">Projetista</Label><p>{(() => { const p = projetistas.find((p: any) => p.id === selectedDoc.originId); return p ? `${p.name}${p.company ? ` (${p.company})` : ""}` : "—"; })()}</p></div>
                      )}
                      <div><Label className="text-muted-foreground">Status</Label><p><StatusBadge status={selectedDoc.status} /></p></div>
                      <div><Label className="text-muted-foreground">Nome Responsável</Label><p>{selectedDoc.responsibleName || "—"}</p></div>
                      <div><Label className="text-muted-foreground">Setor Responsável</Label><p>{selectedDoc.responsibleSector || "—"}</p></div>
                    </div>
                    <div className="border-t pt-4">
                      <h3 className="text-lg font-semibold mb-4">Retorno da Análise</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div><Label className="text-muted-foreground">Data Retorno Análise</Label><p>{selectedDoc.analysisReturnedAt || "—"}</p></div>
                        <div><Label className="text-muted-foreground">Data Envio à Projetista</Label><p>{selectedDoc.sentToProjetistaAt || "—"}</p></div>
                        <div><Label className="text-muted-foreground">Dias Prazo Projetista</Label><p>{selectedDoc.projetistaDays || "—"}</p></div>
                        <div><Label className="text-muted-foreground">Prazo Projetista</Label><p>{selectedDoc.projetistaDeadline || "—"}</p></div>
                        <div className="col-span-2"><Label className="text-muted-foreground">Observações da Análise</Label><p>{selectedDoc.analysisComment || "—"}</p></div>
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
                    </div>
                  )}
                </div>

                {!isEditing && selectedDoc.revisions && (
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
                                <TableCell><StatusBadge status={rev.status} /></TableCell>
                                <TableCell className="max-w-xs truncate">{rev.comments || "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
