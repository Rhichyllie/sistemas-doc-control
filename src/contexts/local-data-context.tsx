import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface Discipline {
  id: string;
  name: string;
  code: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface DocumentRevision {
  id: string;
  revision: string;
  status: string;
  receivedAt: string;
  comments?: string;
  fileUrl?: string;
  createdAt: string;
}

export interface Document {
  id: string;
  code: string;
  title: string;
  projectId: string;
  disciplineId?: string;
  docType?: string;
  currentRevision: string;
  origin: string;
  originId?: string;
  status: string;
  receivedAt?: string;
  analysisDays?: string;
  analysisDeadline?: string;
  analysisReturnedAt?: string;
  sentToProjetistaAt?: string;
  projetistaDays?: string;
  projetistaDeadline?: string;
  responsibleName?: string;
  responsibleSector?: string;
  externalLink?: string;
  revisions: DocumentRevision[];
}

export interface Projetista {
  id: string;
  name: string;
  company?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  sector: string;
  email: string;
}

export interface AppNotification {
  id: string;
  type: "overdue" | "status_change" | "reminder" | "info";
  title: string;
  message: string;
  documentId?: string;
  documentTitle?: string;
  read: boolean;
  createdAt: string;
}

export interface ApprovalFlow {
  id: string;
  documentId: string;
  revision: string;
  status: string;
  createdAt: string;
}

export interface ApprovalStep {
  id: string;
  flowId: string;
  sequence: number;
  sector: string;
  responsible: string;
  responsibleTeamId?: string;
  deadlineDays: number;
  status: "pending" | "in_progress" | "completed";
  startedAt?: string;
  completedAt?: string;
}

export interface ApprovalComment {
  id: string;
  stepId: string;
  comment: string;
  attachments?: string[];
  createdAt: string;
}

export interface ApprovalHistory {
  id: string;
  documentId: string;
  action: string;
  user: string;
  date: string;
  description: string;
}

// Mappers: banco (snake_case) → app (camelCase)
function mapProject(row: any): Project {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    client: row.client ?? "",
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    status: row.status,
  };
}

function mapDiscipline(row: any): Discipline {
  return { id: row.id, code: row.code, name: row.name };
}

function mapProjetista(row: any): Projetista {
  return { id: row.id, name: row.name, company: row.company };
}

function mapDocument(row: any, revisions: DocumentRevision[]): Document {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    projectId: row.project_id ?? "",
    disciplineId: row.discipline_id,
    docType: row.doc_type,
    currentRevision: row.current_revision,
    origin: row.origin,
    originId: row.origin_id,
    status: row.status,
    receivedAt: row.received_at,
    analysisDays: row.analysis_days,
    analysisDeadline: row.analysis_deadline,
    analysisReturnedAt: row.analysis_returned_at,
    sentToProjetistaAt: row.sent_to_projetista_at,
    projetistaDays: row.projetista_days,
    projetistaDeadline: row.projetista_deadline,
    responsibleName: row.responsible_name,
    responsibleSector: row.responsible_sector,
    externalLink: row.external_link,
    revisions,
  };
}

function mapNotification(row: any): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    documentId: row.document_id,
    documentTitle: row.document_title,
    read: row.read,
    createdAt: row.created_at,
  };
}

interface LocalDataContextType {
  disciplines: Discipline[];
  projects: Project[];
  documents: Document[];
  projetistas: Projetista[];
  team: TeamMember[];
  notifications: AppNotification[];
  approvalFlows: ApprovalFlow[];
  approvalSteps: ApprovalStep[];
  approvalComments: ApprovalComment[];
  approvalHistory: ApprovalHistory[];
  recentActivities: any[];
  loading: boolean;
  approvalLoaded: boolean;
  isAdmin: boolean;
  setDisciplines: (items: Discipline[]) => Promise<void>;
  setProjects: (items: Project[]) => Promise<void>;
  setDocuments: (items: Document[]) => Promise<void>;
  setProjetistas: (items: Projetista[]) => Promise<void>;
  setTeam: (items: TeamMember[]) => Promise<void>;
  createTeamMember: (member: Omit<TeamMember, "id">) => Promise<void>;
  updateTeamMember: (id: string, member: Omit<TeamMember, "id">) => Promise<void>;
  deleteTeamMember: (id: string) => Promise<void>;
  setNotifications: (items: AppNotification[]) => Promise<void>;
  setApprovalFlows: (items: ApprovalFlow[]) => Promise<void>;
  setApprovalSteps: (items: ApprovalStep[]) => Promise<void>;
  setApprovalComments: (items: ApprovalComment[]) => Promise<void>;
  setApprovalHistory: (items: ApprovalHistory[]) => Promise<void>;
  setRecentActivities: (items: any[]) => void;
  addRecentActivity: (activity: any) => Promise<void>;
  cancelFlow: (flowId: string, reason: string) => Promise<void>;
  deleteFlow: (flowId: string, reason: string) => Promise<void>;
  exportData: () => void;
  importData: (data: any) => Promise<void>;
}

const LocalDataContext = createContext<LocalDataContextType | undefined>(undefined);

export function LocalDataProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [disciplines, setDisciplinesState] = useState<Discipline[]>([]);
  const [projects, setProjectsState] = useState<Project[]>([]);
  const [documents, setDocumentsState] = useState<Document[]>([]);
  const [projetistas, setProjetistasState] = useState<Projetista[]>([]);
  const [team, setTeamState] = useState<TeamMember[]>([]);
  const [notifications, setNotificationsState] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvalFlows, setApprovalFlowsState] = useState<ApprovalFlow[]>([]);
  const [approvalSteps, setApprovalStepsState] = useState<ApprovalStep[]>([]);
  const [approvalComments, setApprovalCommentsState] = useState<ApprovalComment[]>([]);
  const [approvalHistory, setApprovalHistoryState] = useState<ApprovalHistory[]>([]);
  const [recentActivities, setRecentActivitiesState] = useState<any[]>([]);
  const [approvalLoaded, setApprovalLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Carregar todos os dados do Supabase
  const loadAll = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      // Verificar se o usuário atual é admin
      if (user) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        setIsAdmin(!!roleData);
      }

      const [discRes, projRes, projetRes, teamRes, docRes, revRes, notifRes, activitiesRes] = await Promise.all([
        supabase.from("disciplines").select("*").order("name"),
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("projetistas").select("*").order("name"),
        supabase.from("team").select("*").order("name"),
        supabase.from("documents").select("*").order("created_at", { ascending: false }),
        supabase.from("document_revisions").select("*").order("created_at"),
        supabase.from("notifications").select("*").order("created_at", { ascending: false }),
        supabase.from("recent_activities").select("*").order("created_at", { ascending: false }).limit(10),
      ]);

      setDisciplinesState((discRes.data ?? []).map(mapDiscipline));
      setProjectsState((projRes.data ?? []).map(mapProject));
      setProjetistasState((projetRes.data ?? []).map(mapProjetista));
      setTeamState((teamRes.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        sector: row.sector,
        email: row.email
      })));

      const revsByDoc: Record<string, DocumentRevision[]> = {};
      for (const rev of revRes.data ?? []) {
        if (!revsByDoc[rev.document_id]) revsByDoc[rev.document_id] = [];
revsByDoc[rev.document_id].push({
        id: rev.id,
        revision: rev.revision,
        status: rev.status as string,
        receivedAt: rev.received_at ?? "",
        comments: rev.comments ?? undefined,
        fileUrl: rev.file_url ?? undefined,
        createdAt: rev.created_at,
      });
          }
      setDocumentsState((docRes.data ?? []).map(d => mapDocument(d, revsByDoc[d.id] ?? [])));
      setNotificationsState((notifRes.data ?? []).map(mapNotification));
      setRecentActivitiesState((activitiesRes.data ?? []).map((r: any) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        description: r.description,
        icon: r.icon,
        color: r.color,
        user: r.user_name,
        createdAt: r.created_at,
      })));

      // Carregar tabelas de aprovação
      const [flowsRes, stepsRes, commentsRes, historyRes] = await Promise.all([
        supabase.from("approval_flows").select("*").order("created_at"),
        supabase.from("approval_steps").select("*").order("sequence"),
        supabase.from("approval_comments").select("*").order("created_at"),
        supabase.from("approval_history").select("*").order("date", { ascending: false }),
      ]);

      setApprovalFlowsState((flowsRes.data ?? []).map((r: any) => ({
        id: r.id,
        documentId: r.document_id,
        revision: r.revision,
        status: r.status,
        createdAt: r.created_at,
      })));

      setApprovalStepsState((stepsRes.data ?? []).map((r: any) => ({
        id: r.id,
        flowId: r.flow_id,
        sequence: r.sequence,
        sector: r.sector,
        responsible: r.responsible,
        responsibleTeamId: r.responsible_team_id,
        deadlineDays: r.deadline_days,
        status: r.status,
        startedAt: r.started_at,
        completedAt: r.completed_at,
      })));

      setApprovalCommentsState((commentsRes.data ?? []).map((r: any) => ({
        id: r.id,
        stepId: r.step_id,
        comment: r.comment,
        attachments: r.attachments,
        createdAt: r.created_at,
      })));

      setApprovalHistoryState((historyRes.data ?? []).map((r: any) => ({
        id: r.id,
        documentId: r.document_id,
        action: r.action,
        user: r.user,
        date: r.date,
        description: r.description,
      })));

      setApprovalLoaded(true);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    console.log("Setting up realtime subscriptions...");

    // Real-time subscriptions
    const channels = [
      // Disciplines
      supabase
        .channel("disciplines_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "disciplines" },
          (payload) => {
            console.log("Disciplines change received:", payload);
            loadAll();
          }
        )
        .subscribe((status) => console.log("Disciplines channel status:", status)),
      
      // Projects
      supabase
        .channel("projects_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "projects" },
          (payload) => {
            console.log("Projects change received:", payload);
            loadAll();
          }
        )
        .subscribe((status) => console.log("Projects channel status:", status)),

      // Projetistas
      supabase
        .channel("projetistas_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "projetistas" },
          (payload) => {
            console.log("Projetistas change received:", payload);
            loadAll();
          }
        )
        .subscribe((status) => console.log("Projetistas channel status:", status)),

      // Documents
      supabase
        .channel("documents_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "documents" },
          (payload) => {
            console.log("Documents change received:", payload);
            loadAll();
          }
        )
        .subscribe((status) => console.log("Documents channel status:", status)),

      // Document Revisions
      supabase
        .channel("document_revisions_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "document_revisions" },
          (payload) => {
            console.log("Document revisions change received:", payload);
            loadAll();
          }
        )
        .subscribe((status) => console.log("Document revisions channel status:", status)),

      // Notifications
      supabase
        .channel("notifications_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications" },
          (payload) => {
            console.log("Notifications change received:", payload);
            loadAll();
          }
        )
        .subscribe((status) => console.log("Notifications channel status:", status)),

      // Team
      supabase
        .channel("team_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "team" },
          (payload) => {
            console.log("Team change received:", payload);
            loadAll();
          }
        )
        .subscribe((status) => console.log("Team channel status:", status)),

      // Approval Steps (necessário para refletir em tempo real quando uma análise é iniciada/concluída)
      supabase
        .channel("approval_steps_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "approval_steps" },
          (payload) => {
            console.log("Approval steps change received:", payload);
            loadAll();
          }
        )
        .subscribe((status) => console.log("Approval steps channel status:", status)),
    ];

    loadAll();

    // Cleanup subscriptions
    return () => {
      console.log("Removing realtime subscriptions...");
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [isAuthenticated, loadAll]);

  // SETTERS — detectam diferenças e salvam no Supabase
  // IMPORTANTE: usamos uma leitura fresca do banco (não o estado do closure) para
  // decidir create/update/delete, evitando race conditions quando o realtime
  // atualiza o estado de forma assíncrona entre uma chamada e outra.
const setProjects = async (items: Project[]) => {
  setProjectsState(items);
  const { data: currentRows } = await supabase.from("projects").select("*");
  const current = (currentRows ?? []).map(mapProject);

  const newItem = items.find(i => !current.some(p => p.id === i.id));
  const updatedItem = items.find(i => {
    const old = current.find(p => p.id === i.id);
    return old && JSON.stringify(old) !== JSON.stringify(i);
  });
  const deletedItem = current.find(p => !items.some(i => i.id === p.id));

  if (newItem) {
    const { data: inserted, error } = await supabase.from("projects").insert({
      code: newItem.code, name: newItem.name,
      client: newItem.client, start_date: newItem.startDate,
      end_date: newItem.endDate, status: newItem.status,
    } as any).select().single() as any;

    if (error) {
      console.error("Erro ao salvar projeto:", error);
    } else if (inserted) {
      await loadAll();
    }
  } else if (updatedItem) {
    await supabase.from("projects").update({
      code: updatedItem.code, name: updatedItem.name,
      client: updatedItem.client, start_date: updatedItem.startDate,
      end_date: updatedItem.endDate, status: updatedItem.status,
    } as any).eq("id", updatedItem.id);
    await loadAll();
  } else if (deletedItem) {
    await supabase.from("projects").delete().eq("id", deletedItem.id);
    await loadAll();
  }
};

const setDisciplines = async (items: Discipline[]) => {
  setDisciplinesState(items);
  const { data: currentRows } = await supabase.from("disciplines").select("*");
  const current = (currentRows ?? []).map(mapDiscipline);

  const newItem = items.find(i => !current.some(d => d.id === i.id));
  const updatedItem = items.find(i => {
    const old = current.find(d => d.id === i.id);
    return old && JSON.stringify(old) !== JSON.stringify(i);
  });
  const deletedItem = current.find(d => !items.some(i => i.id === d.id));

  if (newItem) {
    const { data: inserted, error } = await supabase.from("disciplines")
      .insert({ code: newItem.code, name: newItem.name } as any)
      .select().single() as any;
    if (error) console.error("Erro ao salvar disciplina:", error);
    else if (inserted) await loadAll();
  } else if (updatedItem) {
    await supabase.from("disciplines").update({ code: updatedItem.code, name: updatedItem.name } as any).eq("id", updatedItem.id);
    await loadAll();
  } else if (deletedItem) {
    await supabase.from("disciplines").delete().eq("id", deletedItem.id);
    await loadAll();
  }
};

const setProjetistas = async (items: Projetista[]) => {
  setProjetistasState(items);
  const { data: currentRows } = await supabase.from("projetistas").select("*");
  const current = (currentRows ?? []).map(mapProjetista);

  const newItem = items.find(i => !current.some(p => p.id === i.id));
  const updatedItem = items.find(i => {
    const old = current.find(p => p.id === i.id);
    return old && JSON.stringify(old) !== JSON.stringify(i);
  });
  const deletedItem = current.find(p => !items.some(i => i.id === p.id));

  if (newItem) {
    const { data: inserted, error } = await supabase.from("projetistas")
      .insert({ name: newItem.name, company: newItem.company } as any)
      .select().single() as any;
    if (error) console.error("Erro ao salvar projetista:", error);
    else if (inserted) {
      await loadAll();
    }
  } else if (updatedItem) {
    await supabase.from("projetistas").update({ name: updatedItem.name, company: updatedItem.company } as any).eq("id", updatedItem.id);
    await loadAll();
  } else if (deletedItem) {
    await supabase.from("projetistas").delete().eq("id", deletedItem.id);
    await loadAll();
  }
};

const setTeam = async (items: TeamMember[]) => {
  setTeamState(items);
  const { data: currentRows } = await supabase.from("team").select("*");
  const current = (currentRows ?? []).map((row: any) => ({
    id: row.id, name: row.name, sector: row.sector, email: row.email
  }));

  const newItem = items.find(i => !current.some(p => p.id === i.id));
  const updatedItem = items.find(i => {
    const old = current.find(p => p.id === i.id);
    return old && JSON.stringify(old) !== JSON.stringify(i);
  });
  const deletedItem = current.find(p => !items.some(i => i.id === p.id));

  if (newItem) {
    const { data: inserted, error } = await supabase.from("team")
      .insert({ name: newItem.name, sector: newItem.sector, email: newItem.email } as any)
      .select().single() as any;
    if (error) console.error("Erro ao salvar membro da equipe:", error);
    else if (inserted) {
      await loadAll();
    }
  } else if (updatedItem) {
    await supabase.from("team").update({ 
      name: updatedItem.name, 
      sector: updatedItem.sector, 
      email: updatedItem.email 
    } as any).eq("id", updatedItem.id);
    await loadAll();
  } else if (deletedItem) {
    await supabase.from("team").delete().eq("id", deletedItem.id);
    await loadAll();
  }
};

// Funções explícitas para Equipe — sem comparação/adivinhação de listas,
// elimina de vez a race condition com o realtime.
const createTeamMember = async (member: Omit<TeamMember, "id">) => {
  const { error } = await supabase.from("team").insert({
    name: member.name,
    sector: member.sector,
    email: member.email,
  } as any);
  if (error) {
    console.error("Erro ao criar membro da equipe:", error);
    throw error;
  }
  await loadAll();
};

const updateTeamMember = async (id: string, member: Omit<TeamMember, "id">) => {
  const { error } = await supabase.from("team").update({
    name: member.name,
    sector: member.sector,
    email: member.email,
  } as any).eq("id", id);
  if (error) {
    console.error("Erro ao atualizar membro da equipe:", error);
    throw error;
  }
  await loadAll();
};

const deleteTeamMember = async (id: string) => {
  const { error } = await supabase.from("team").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir membro da equipe:", error);
    // Violação de chave estrangeira: o membro está vinculado a uma etapa do Fluxo de Aprovação
    if (error.code === "23503") {
      throw new Error("Este membro está vinculado a uma ou mais etapas do Fluxo de Aprovação e não pode ser excluído. Remova ou reatribua essas etapas antes de excluir o membro.");
    }
    throw new Error("Não foi possível excluir o membro da equipe. Tente novamente.");
  }
  await loadAll();
};

const setDocuments = async (items: Document[]) => {
  console.log("setDocuments called with items:", items);
  setDocumentsState(items);
  const { data: currentRows } = await supabase.from("documents").select("*");
  const current = (currentRows ?? []).map((row: any) => mapDocument(row, []));

  const newItem = items.find(i => !current.some(d => d.id === i.id));
  const updatedItem = items.find(i => {
    const old = current.find(d => d.id === i.id);
    // Compara apenas os campos próprios do documento (não revisions, que são geridas separadamente)
    if (!old) return false;
    const { revisions: _r1, ...oldRest } = old;
    const { revisions: _r2, ...newRest } = i;
    return JSON.stringify(oldRest) !== JSON.stringify(newRest);
  });
  const deletedItem = current.find(d => !items.some(i => i.id === d.id));

  console.log("setDocuments - newItem:", newItem, "updatedItem:", updatedItem, "deletedItem:", deletedItem);

  if (newItem) {
    console.log("Inserting new document into Supabase:", newItem);
    const { data: inserted, error } = await supabase.from("documents").insert({
      code: newItem.code, title: newItem.title,
      project_id: newItem.projectId || null,
      discipline_id: newItem.disciplineId || null,
      doc_type: newItem.docType,
      current_revision: newItem.currentRevision,
      origin: newItem.origin,
      origin_id: newItem.originId || null,
      status: newItem.status,
      received_at: newItem.receivedAt,
      analysis_days: newItem.analysisDays,
      analysis_deadline: newItem.analysisDeadline,
      analysis_returned_at: newItem.analysisReturnedAt,
      sent_to_projetista_at: newItem.sentToProjetistaAt,
      projetista_days: newItem.projetistaDays,
      projetista_deadline: newItem.projetistaDeadline,
      responsible_name: newItem.responsibleName,
      responsible_sector: newItem.responsibleSector,
      external_link: newItem.externalLink || null,
    } as any).select().single() as any;

    if (error) {
      console.error("Erro ao salvar documento no Supabase:", error);
    } else {
      console.log("Document inserted successfully into Supabase:", inserted);
      if (newItem.revisions?.length > 0) {
        console.log("Inserting document revisions:", newItem.revisions);
        const { error: revError } = await supabase.from("document_revisions").insert(
          newItem.revisions.map(r => ({
            document_id: inserted.id,
            revision: r.revision,
            status: r.status,
            received_at: r.receivedAt,
            comments: r.comments,
            file_url: r.fileUrl,
          })) as any[]
        );
        if (revError) console.error("Erro ao salvar revisões do documento:", revError);
      }
      await loadAll();
    }
  } else if (updatedItem) {
    console.log("Updating document in Supabase:", updatedItem);
    await supabase.from("documents").update({
      code: updatedItem.code, title: updatedItem.title,
      project_id: updatedItem.projectId || null,
      discipline_id: updatedItem.disciplineId || null,
      doc_type: updatedItem.docType,
      current_revision: updatedItem.currentRevision,
      origin: updatedItem.origin,
      origin_id: updatedItem.originId || null,
      status: updatedItem.status,
      received_at: updatedItem.receivedAt,
      analysis_days: updatedItem.analysisDays,
      analysis_deadline: updatedItem.analysisDeadline,
      analysis_returned_at: updatedItem.analysisReturnedAt,
      sent_to_projetista_at: updatedItem.sentToProjetistaAt,
      projetista_days: updatedItem.projetistaDays,
      projetista_deadline: updatedItem.projetistaDeadline,
      responsible_name: updatedItem.responsibleName,
      responsible_sector: updatedItem.responsibleSector,
      external_link: updatedItem.externalLink || null,
    } as any).eq("id", updatedItem.id);
    await loadAll();
  } else if (deletedItem) {
    console.log("Deleting document from Supabase:", deletedItem);
    await supabase.from("documents").delete().eq("id", deletedItem.id);
    await loadAll();
  }
};

const setNotifications = async (items: AppNotification[]) => {
  setNotificationsState(items);
  if (!user) return;

  const newItem = items.find(i => !notifications.some(n => n.id === i.id));
  const deletedItem = notifications.find(n => !items.some(i => i.id === n.id));
  const updatedItem = items.find(i => {
    const old = notifications.find(n => n.id === i.id);
    return old && old.read !== i.read;
  });

  if (newItem) {
    await supabase.from("notifications").insert({
      user_id: user.id,
      type: newItem.type,
      title: newItem.title,
      message: newItem.message,
      document_id: newItem.documentId || null,
      document_title: newItem.documentTitle,
      read: newItem.read,
    } as any);
  } else if (updatedItem) {
    await supabase.from("notifications").update({ read: updatedItem.read }).eq("id", updatedItem.id);
  } else if (deletedItem) {
    await supabase.from("notifications").delete().eq("id", deletedItem.id);
  } else if (items.length === 0 && notifications.length > 0) {
    await supabase.from("notifications").delete().eq("user_id", user.id);
  } else {
    const allRead = items.every(i => i.read);
    if (allRead && notifications.some(n => !n.read)) {
      await supabase.from("notifications").update({ read: true }).eq("user_id", user.id);
    }
  }
};

  const setApprovalFlows = async (items: ApprovalFlow[]) => {
    setApprovalFlowsState(items);
    const { data: currentRows } = await supabase.from("approval_flows").select("*");
    const current = (currentRows ?? []).map((r: any) => ({
      id: r.id, documentId: r.document_id, revision: r.revision,
      status: r.status, createdAt: r.created_at,
    }));

    const newItem = items.find((i) => !current.some((f) => f.id === i.id));
    const updatedItem = items.find((i) => {
      const old = current.find((f) => f.id === i.id);
      return old && JSON.stringify(old) !== JSON.stringify(i);
    });
    const deletedItem = current.find((f) => !items.some((i) => i.id === f.id));
    if (newItem) {
      await supabase.from("approval_flows").insert({
        id: newItem.id, document_id: newItem.documentId,
        revision: newItem.revision, status: newItem.status,
      });
    } else if (updatedItem) {
      await supabase.from("approval_flows").update({ status: updatedItem.status }).eq("id", updatedItem.id);
    } else if (deletedItem) {
      await supabase.from("approval_flows").delete().eq("id", deletedItem.id);
    }
  };

  const setApprovalSteps = async (items: ApprovalStep[]) => {
    setApprovalStepsState(items);
    const { data: currentRows } = await supabase.from("approval_steps").select("*");
    const current = (currentRows ?? []).map((r: any) => ({
      id: r.id, flowId: r.flow_id, sequence: r.sequence, sector: r.sector,
      responsible: r.responsible, responsibleTeamId: r.responsible_team_id,
      deadlineDays: r.deadline_days, status: r.status,
      startedAt: r.started_at, completedAt: r.completed_at,
    }));

    const newItem = items.find((i) => !current.some((s) => s.id === i.id));
    const updatedItem = items.find((i) => {
      const old = current.find((s) => s.id === i.id);
      return old && JSON.stringify(old) !== JSON.stringify(i);
    });
    const deletedItem = current.find((s) => !items.some((i) => i.id === s.id));
    if (newItem) {
      const { error } = await supabase.from("approval_steps").insert({
        id: newItem.id, flow_id: newItem.flowId,
        sequence: newItem.sequence, sector: newItem.sector,
        responsible: newItem.responsible,
        responsible_team_id: newItem.responsibleTeamId || null,
        deadline_days: newItem.deadlineDays,
        status: newItem.status,
      });
      if (error) console.error("Erro ao salvar etapa de aprovação:", error);
    } else if (updatedItem) {
      const { error } = await supabase.from("approval_steps").update({
        sector: updatedItem.sector,
        responsible: updatedItem.responsible,
        responsible_team_id: updatedItem.responsibleTeamId || null,
        deadline_days: updatedItem.deadlineDays,
        status: updatedItem.status,
        started_at: updatedItem.startedAt || null,
        completed_at: updatedItem.completedAt || null,
      }).eq("id", updatedItem.id);
      if (error) console.error("Erro ao atualizar etapa de aprovação:", error);
    } else if (deletedItem) {
      await supabase.from("approval_steps").delete().eq("id", deletedItem.id);
    }
  };

  const setApprovalComments = async (items: ApprovalComment[]) => {
    setApprovalCommentsState(items);
    const newItem = items.find((i) => !approvalComments.some((c) => c.id === i.id));
    if (newItem) {
      await supabase.from("approval_comments").insert({
        id: newItem.id, step_id: newItem.stepId,
        comment: newItem.comment, attachments: newItem.attachments || null,
      });
    }
  };

  const setApprovalHistory = async (items: ApprovalHistory[]) => {
    setApprovalHistoryState(items);
    const newItem = items.find((i) => !approvalHistory.some((h) => h.id === i.id));
    if (newItem) {
      await supabase.from("approval_history").insert({
        id: newItem.id, document_id: newItem.documentId,
        action: newItem.action, user: newItem.user,
        date: newItem.date, description: newItem.description,
      });
    }
  };

  // Cancelar fluxo: soft delete (status -> "cancelled"), registrado em auditoria
  const cancelFlow = async (flowId: string, reason: string) => {
    const flow = approvalFlows.find(f => f.id === flowId);
    if (!flow) return;
    const stepsOfFlow = approvalSteps.filter(s => s.flowId === flowId);

    const { error } = await supabase
      .from("approval_flows")
      .update({ status: "cancelled" })
      .eq("id", flowId);

    if (error) {
      console.error("Erro ao cancelar fluxo:", error);
      throw error;
    }

    const { error: auditError } = await supabase.from("flow_audit_log").insert({
      flow_id: flowId,
      document_id: flow.documentId,
      action: "cancelled",
      performed_by: user?.email || "desconhecido",
      reason: reason || null,
      snapshot: JSON.parse(JSON.stringify({ flow, steps: stepsOfFlow })),
    });
    if (auditError) console.error("Erro ao registrar auditoria de cancelamento:", auditError);

    await loadAll();
  };

  // Excluir fluxo: remoção física do fluxo + etapas, com snapshot preservado em auditoria
  const deleteFlow = async (flowId: string, reason: string) => {
    const flow = approvalFlows.find(f => f.id === flowId);
    if (!flow) return;
    const stepsOfFlow = approvalSteps.filter(s => s.flowId === flowId);

    // Grava a auditoria ANTES de excluir, para garantir que o snapshot é capturado
    const { error: auditError } = await supabase.from("flow_audit_log").insert({
      flow_id: flowId,
      document_id: flow.documentId,
      action: "deleted",
      performed_by: user?.email || "desconhecido",
      reason: reason || null,
      snapshot: JSON.parse(JSON.stringify({ flow, steps: stepsOfFlow })),
    });
    if (auditError) {
      console.error("Erro ao registrar auditoria de exclusão:", auditError);
      throw auditError;
    }

    // Exclui as etapas primeiro (evita problemas de referência), depois o fluxo
    await supabase.from("approval_steps").delete().eq("flow_id", flowId);
    const { error } = await supabase.from("approval_flows").delete().eq("id", flowId);

    if (error) {
      console.error("Erro ao excluir fluxo:", error);
      throw error;
    }

    await loadAll();
  };

  const addRecentActivity = async (activity: any) => {
    // Atualiza o estado local imediatamente (resposta visual rápida)
    setRecentActivitiesState(prev => [activity, ...prev].slice(0, 10));

    // Persiste no Supabase
    const { error } = await supabase.from("recent_activities").insert({
      type: activity.type,
      title: activity.title,
      description: activity.description || null,
      icon: activity.icon || null,
      color: activity.color || null,
      user_name: activity.user || null,
    });

    if (error) {
      console.error("Erro ao salvar atividade recente:", error);
    }
  };

  // Export/Import mantidos para backup manual
  function exportData() {
    const backup = {
      version: "2.0.0",
      timestamp: new Date().toISOString(),
      disciplines, projects, documents, projetistas, notifications,
    };
    const dataStr = JSON.stringify(backup, null, 2);
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    const link = document.createElement("a");
    link.setAttribute("href", dataUri);
    link.setAttribute("download", `backup_doccontrol_${new Date().toISOString().slice(0, 10)}.json`);
    link.click();
  }

  async function importData(data: any) {
    if (data.disciplines) await Promise.all(data.disciplines.map((d: Discipline) =>
      supabase.from("disciplines").upsert({ id: d.id, code: d.code, name: d.name })
    ));
    if (data.projects) await Promise.all(data.projects.map((p: Project) =>
supabase.from("projects").upsert({
  id: p.id, code: p.code, name: p.name, client: p.client,
  start_date: p.startDate, end_date: p.endDate, status: p.status,
} as any)
    ));
    if (data.projetistas) await Promise.all(data.projetistas.map((p: Projetista) =>
      supabase.from("projetistas").upsert({ id: p.id, name: p.name, company: p.company })
    ));
    await loadAll();
  }

  return (
    <LocalDataContext.Provider value={{
      disciplines, projects, documents, projetistas, team, notifications,
      approvalFlows, approvalSteps, approvalComments, approvalHistory, recentActivities,
      loading, approvalLoaded, isAdmin,
      setDisciplines, setProjects, setDocuments, setProjetistas, setTeam, setNotifications,
      createTeamMember, updateTeamMember, deleteTeamMember,
setApprovalFlows, setApprovalSteps, setApprovalComments, setApprovalHistory, setRecentActivities: setRecentActivitiesState,      addRecentActivity,
      cancelFlow,
      deleteFlow,
      exportData,
      importData,
    }}>
      {children}
    </LocalDataContext.Provider>
  );
}

export function useLocalData() {
  const context = useContext(LocalDataContext);
  if (context === undefined) throw new Error("useLocalData must be used within a LocalDataProvider");
  return context;
}