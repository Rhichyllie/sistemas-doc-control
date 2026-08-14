import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { getErrorMessage } from "@/lib/errorUtils";
import {
  getDefaultIndicatorFilters,
  isIndicatorsPermissionError,
  isMissingIndicatorsRpc,
  normalizeOperationalIndicators,
  type OperationalIndicatorFilters,
  type OperationalIndicatorsReport,
  type OperationalIndicatorsSource,
} from "@/lib/operationalIndicators";
import { supabase } from "@/lib/supabase";

interface CountResult {
  count: number | null;
  error: unknown;
}

function unwrapCount(result: CountResult) {
  return result.error ? null : (result.count ?? 0);
}

function buildFallbackReport(input: {
  filters: OperationalIndicatorFilters;
  documents: {
    active: number | null;
    drafts: number | null;
    overdue: number | null;
    dueSoon: number | null;
    withoutCode: number | null;
    withoutProject: number | null;
    total: number;
    approved: number | null;
    rejected: number | null;
    cancelled: number | null;
    byType: Array<{ key: string; label: string; count: number }>;
    byArea: Array<{ key: string; label: string; count: number }>;
    byProject: Array<{ key: string; label: string; count: number }>;
    createdCurrent: number;
    createdPrevious: number;
  };
  tramites: {
    activeInstances: number | null;
    activeSteps: number | null;
    overdueSteps: number | null;
    dueSoonSteps: number | null;
    completedStepsCurrent: number;
    completedStepsPrevious: number;
    completedInstancesCurrent: number;
    completedInstancesPrevious: number;
    stalledSteps: number;
    stepsWithoutDue: number;
    pendingEvidence: number;
    byStepType: Array<{ key: string; label: string; count: number }>;
    byResponsibleOverdue: Array<{
      key: string;
      label: string;
      count: number;
      id?: string;
    }>;
    byProjectOverdue: Array<{ key: string; label: string; count: number }>;
    byAreaOverdue: Array<{ key: string; label: string; count: number }>;
    byStepTypeOverdue: Array<{ key: string; label: string; count: number }>;
    longestStalled: Array<{
      key: string;
      label: string;
      count: number;
      id?: string;
      stepType?: string;
      ageHours?: number | null;
    }>;
  };
  notifications: {
    unread: number | null;
    critical: number | null;
  };
  projects: Array<{ id: string; code: string | null; name: string }>;
}) {
  const docActive = input.documents.active ?? 0;
  const docDraft = input.documents.drafts ?? 0;
  const docOverdue = input.documents.overdue ?? 0;
  const docDueSoon = input.documents.dueSoon ?? 0;
  const stepOverdue = input.tramites.overdueSteps ?? 0;
  const stepDueSoon = input.tramites.dueSoonSteps ?? 0;
  const stepActive = input.tramites.activeSteps ?? 0;
  const stepCompletedCurrent = input.tramites.completedStepsCurrent;
  const docCreatedCurrent = input.documents.createdCurrent;
  const instCompletedCurrent = input.tramites.completedInstancesCurrent;
  const stepCompletedPrevious = input.tramites.completedStepsPrevious;
  const docCreatedPrevious = input.documents.createdPrevious;
  const instCompletedPrevious = input.tramites.completedInstancesPrevious;

  const totalDue = docOverdue + docDueSoon + stepOverdue + stepDueSoon;
  const totalOnTime = Math.max(0, (stepActive + docActive) - totalDue);
  const slaTotal = stepActive + docActive;
  const complianceRate = slaTotal
    ? Number(((100 * Math.max(0, slaTotal - stepOverdue - docOverdue)) / slaTotal).toFixed(1))
    : null;

  const topProject = [...input.tramites.byProjectOverdue].sort((a, b) => b.count - a.count)[0];
  const topStepType = [...input.tramites.byStepTypeOverdue].sort((a, b) => b.count - a.count)[0];
  const topResponsible = [...input.tramites.byResponsibleOverdue].sort((a, b) => b.count - a.count)[0];

  const recommendations: Array<{
    id: string;
    severity: "info" | "warning" | "critical";
    title: string;
    explanation: string;
    action_label: string;
    action_url: string;
  }> = [];
  if (stepOverdue >= 2) {
    recommendations.push({
      id: "steps-overdue",
      severity: stepOverdue >= 5 ? "critical" : "warning",
      title: `${stepOverdue} etapa(s) de trâmite vencida(s)`,
      explanation:
        "Priorize a ação nas etapas atrasadas para recuperar o SLA. Use a trilha de auditoria para justificar cada caso.",
      action_label: "Abrir trâmites",
      action_url: "/authenticated/documents/tramites",
    });
  }
  if (docOverdue >= 1) {
    recommendations.push({
      id: "reviews-overdue",
      severity: "warning",
      title: `${docOverdue} revisão(ões) de documento em atraso`,
      explanation:
        "A revisão periódica vencida compromete o compliance do sistema. Recomendamos reagendar e revisar esses documentos.",
      action_label: "Abrir documentos",
      action_url: "/authenticated/documents",
    });
  }
  if ((input.documents.withoutCode ?? 0) >= 1) {
    recommendations.push({
      id: "docs-without-code",
      severity: "info",
      title: `${input.documents.withoutCode} documento(s) sem código atribuído`,
      explanation:
        "Documentos sem código dificultam a busca e a trilha. Use a codificação padrão da biblioteca.",
      action_label: "Abrir codificação",
      action_url: "/authenticated/configuracoes",
    });
  }
  if ((input.documents.withoutProject ?? 0) >= 1 && !input.filters.projectId) {
    recommendations.push({
      id: "docs-without-project",
      severity: "info",
      title: `${input.documents.withoutProject} documento(s) sem contexto de projeto`,
      explanation:
        "Atribua projeto/área aos documentos para que os indicadores reflitam a operação real.",
      action_label: "Abrir documentos",
      action_url: "/authenticated/documents",
    });
  }
  if ((input.notifications.critical ?? 0) >= 1) {
    recommendations.push({
      id: "critical-notifications",
      severity: "critical",
      title: `${input.notifications.critical ?? 0} notificação(ões) crítica(s) não lida(s)`,
      explanation:
        "Notificações críticas não lidas podem indicar escalonamentos pendentes. Revise a central de mensagens.",
      action_label: "Abrir notificações",
      action_url: "/authenticated/notificacoes",
    });
  }
  if (topResponsible) {
    recommendations.push({
      id: "bottleneck-responsible",
      severity: "warning",
      title: `${topResponsible.label} · ${topResponsible.count} etapa(s) vencida(s)`,
      explanation:
        "Concentre esforços em redistribuir ou escalonar as etapas desse responsável para reduzir o gargalo.",
      action_label: "Abrir trâmites",
      action_url: "/authenticated/documents/tramites",
    });
  }
  if (topStepType) {
    recommendations.push({
      id: "bottleneck-step",
      severity: topStepType.count >= 3 ? "warning" : "info",
      title: `Gargalo em "${topStepType.label}" (${topStepType.count})`,
      explanation:
        "Avalie se existe capacidade suficiente para essa etapa ou se é possível automatizar parte do fluxo.",
      action_label: "Abrir indicadores",
      action_url: "/authenticated/indicadores",
    });
  }
  if (topProject) {
    recommendations.push({
      id: "bottleneck-project",
      severity: topProject.count >= 3 ? "warning" : "info",
      title: `Projeto "${topProject.label}" · ${topProject.count} etapa(s) vencida(s)`,
      explanation:
        "Atrasos concentrados em um único projeto podem sinalizar prazo ou capacidade mal dimensionados.",
      action_label: "Abrir projetos",
      action_url: "/authenticated/projetos",
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: "everything-ok",
      severity: "info",
      title: "Saúde operacional estável",
      explanation:
        "Nenhum ponto crítico foi identificado nesta combinação de filtros. Continue acompanhando os trends diários.",
      action_label: "Ir para a home",
      action_url: "/authenticated/organizacao",
    });
  }

  return normalizeOperationalIndicators({
    version: "P-26-fallback-real",
    generated_at: new Date().toISOString(),
    period: {
      from: input.filters.from,
      to: input.filters.to,
    },
    scope: input.filters.scope,
    capabilities: {
      documents: input.documents.active !== null,
      projects: input.projects.length > 0,
      tramites: input.tramites.activeSteps !== null,
      tramite_events: stepCompletedCurrent + stepCompletedPrevious > 0,
      evidence: input.tramites.pendingEvidence >= 0,
      calendar_sla: true,
      notifications: input.notifications.unread !== null,
      availability: false,
      audit_trail: true,
      formal_approvals: true,
      historical_snapshots: false,
      notification_generation_error_history: false,
    },
    summary: {
      active_documents: input.documents.active,
      active_tramite_instances: input.tramites.activeInstances,
      active_steps: input.tramites.activeSteps,
      overdue_steps: stepOverdue,
      due_soon_steps: stepDueSoon,
      overdue_reviews: docOverdue,
      due_soon_reviews: docDueSoon,
      critical_unread_notifications: input.notifications.critical,
      open_escalations: input.notifications.critical,
      pending_evidence_steps: input.tramites.pendingEvidence || 0,
      unavailable_responsibles_with_active_steps: 0,
    },
    documents: {
      active_documents: input.documents.active,
      drafts: docDraft,
      approved_documents: input.documents.approved,
      rejected_documents: input.documents.rejected,
      cancelled_documents: input.documents.cancelled,
      without_code: input.documents.withoutCode,
      without_project: input.documents.withoutProject,
      with_review_overdue: docOverdue,
      with_review_due_soon: docDueSoon,
    },
    tramites: {
      active_instances: input.tramites.activeInstances,
      completed_instances_in_period: instCompletedCurrent,
      failed_instances_in_period: 0,
      completion_rate:
        instCompletedCurrent + instCompletedPrevious
          ? Math.round((100 * instCompletedCurrent) / (instCompletedCurrent + instCompletedPrevious))
          : null,
      completed_steps_in_period: stepCompletedCurrent,
      average_step_cycle_hours: null,
      average_instance_cycle_hours: null,
      active_steps: stepActive,
      overdue_steps: stepOverdue,
      due_soon_steps: stepDueSoon,
      stalled_active_steps: input.tramites.stalledSteps,
      active_steps_without_due_date: input.tramites.stepsWithoutDue,
    },
    notifications: {
      unread: input.notifications.unread,
      critical_unread: input.notifications.critical,
    },
    sla: {
      total_items_with_due_date: totalDue || totalOnTime || null,
      on_time: totalOnTime,
      due_soon: docDueSoon + stepDueSoon,
      overdue: docOverdue + stepOverdue,
      compliance_rate: complianceRate,
      without_sla_policy: input.tramites.stepsWithoutDue + (input.documents.withoutCode ?? 0),
      deadline_mode: "simple_date",
      explanation:
        "SLA calculado com etapas de trâmite e revisões periódicas de documentos (SLA 100% = nenhum item vencido).",
    },
    quality: {
      documents_without_code: input.documents.withoutCode,
      documents_without_context: input.documents.withoutProject,
    },
    delegations: {
      active_count: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
      avg_days_accepted: null,
    },
    bottlenecks: {
      by_project: input.tramites.byProjectOverdue,
      by_area: input.tramites.byAreaOverdue,
      by_doc_type: input.documents.byType.map((i) => ({
        key: i.key,
        label: i.label,
        count: i.count,
      })),
      by_step_type: input.tramites.byStepTypeOverdue,
      by_responsible: input.tramites.byResponsibleOverdue,
      evidence_pending: [],
      longest_stalled_steps: input.tramites.longestStalled,
    },
    trends: {
      documents_created_current: docCreatedCurrent,
      documents_created_previous: docCreatedPrevious,
      steps_completed_current: stepCompletedCurrent,
      steps_completed_previous: stepCompletedPrevious,
      instances_completed_current: instCompletedCurrent,
      instances_completed_previous: instCompletedPrevious,
    },
    dimensions: {
      projects: [
        { value: "", label: "Todos" },
        ...input.documents.byProject.map((i) => ({ value: i.key, label: i.label })),
      ],
      areas: [
        { value: "", label: "Todas" },
        ...input.documents.byArea.map((i) => ({ value: i.key, label: i.label })),
      ],
      doc_types: [
        { value: "", label: "Todos" },
        ...input.documents.byType.map((i) => ({ value: i.key, label: i.label })),
      ],
      responsibles: [
        { value: "", label: "Todos" },
        ...input.tramites.byResponsibleOverdue.map((i) => ({ value: i.key, label: i.label })),
      ],
      statuses: [
        { value: "",                label: "Todos" },
        { value: "draft",           label: "Rascunho" },
        { value: "in_review",       label: "Em análise" },
        { value: "pending_approval", label: "Em aprovação" },
        { value: "approved",        label: "Aprovado" },
        { value: "rejected",        label: "Reprovado" },
        { value: "cancelled",       label: "Cancelado" },
        { value: "published",       label: "Publicado" },
        { value: "obsolete",        label: "Obsoleto" },
      ],
    },
    recommendations,
    limitations: [],
  });
}

export function useOperationalIndicators() {
  const { profile } = useAuthContext();
  const canViewOrganization =
    profile?.role === "admin" || profile?.role === "manager";
  const projectsState = useProjectOptions({
    enabled: Boolean(profile?.org_id),
  });
  const [filters, setFilters] = useState<OperationalIndicatorFilters>(() =>
    getDefaultIndicatorFilters(canViewOrganization),
  );
  const [report, setReport] = useState<OperationalIndicatorsReport | null>(
    null,
  );
  const [source, setSource] =
    useState<OperationalIndicatorsSource>("not_installed");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewOrganization && filters.scope === "org") {
      setFilters((current) => ({ ...current, scope: "mine" }));
    }
  }, [canViewOrganization, filters.scope]);

  const loadFallback = useCallback(
    async (current: OperationalIndicatorFilters) => {
      const currentProfile = profile;
      if (!currentProfile?.org_id) return null;
      const orgId = currentProfile.org_id;
      const actorId = currentProfile.id;
      const today = new Date().toISOString().slice(0, 10);
      const dueSoon = new Date();
      dueSoon.setDate(dueSoon.getDate() + 3);
      const dueSoonDate = dueSoon.toISOString().slice(0, 10);

      const fromRaw = current.from ? new Date(current.from) : null;
      const toRaw = current.to ? new Date(current.to) : null;

      const documentCountQuery = () =>
        supabase.from("documents").select("id", { count: "exact", head: true });
      type DocumentCountQuery = ReturnType<typeof documentCountQuery>;

      function documentsCount(
        configure: (query: DocumentCountQuery) => DocumentCountQuery,
      ) {
        let query = supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId);
        if (current.scope === "mine") query = query.eq("author_id", actorId);
        if (current.projectId)
          query = query.eq("project_id", current.projectId);
        if (current.docType) query = query.eq("doc_type", current.docType);
        if (current.area) query = query.eq("area", current.area);
        if (current.status) query = query.eq("status", current.status);
        return configure(query) as unknown as Promise<CountResult>;
      }

      function stepsQuery() {
        return supabase
          .from("document_tramite_instance_steps")
          .select("*")
          .eq("org_id", orgId) as unknown as any;
      }

      const fromIso = fromRaw?.toISOString() ?? null;
      const toIso = toRaw?.toISOString() ?? null;
      const previousFromIso =
        fromRaw && toRaw
          ? new Date(fromRaw.getTime() - (toRaw.getTime() - fromRaw.getTime())).toISOString()
          : null;
      const applyRange = <Q extends { gte: (c: string, v: string) => Q; lte: (c: string, v: string) => Q }>(
        query: Q,
        column: string,
        start: string | null,
        end: string | null,
      ): Q => {
        let q = query;
        if (start) q = q.gte(column, start);
        if (end) q = q.lte(column, end);
        return q;
      };
      const safeCount = async (
        query: Promise<CountResult> | any,
      ): Promise<CountResult> => {
        try {
          return (await Promise.resolve(query)) as CountResult;
        } catch {
          return { count: null, error: null } as unknown as CountResult;
        }
      };
      const safeRows = async <T,>(query: any): Promise<{ data: T | null; error: unknown }> => {
        try {
          const res = await Promise.resolve(query);
          return { data: (res?.data ?? null) as T | null, error: res?.error ?? null };
        } catch (err) {
          return { data: null, error: err };
        }
      };

      const contextFiltered = Boolean(
        current.projectId || current.docType || current.area || current.status,
      );
      const responsible =
        current.responsibleUserId || (current.scope === "mine" ? actorId : "");

      const baseDocumentRows = (() => {
        let q = supabase
          .from("documents")
          .select(
            "id,code,title,doc_type,area,project_id,status,next_review_at,created_at,author_id",
            { count: "exact" },
          )
          .eq("org_id", orgId)
          .limit(1200);
        if (current.scope === "mine") q = q.eq("author_id", actorId);
        if (current.projectId) q = q.eq("project_id", current.projectId);
        if (current.docType) q = q.eq("doc_type", current.docType);
        if (current.area) q = q.eq("area", current.area);
        if (current.status) q = q.eq("status", current.status);
        return q;
      })();

      const baseStepsRows = contextFiltered
        ? Promise.resolve({ data: null, error: null, count: null })
        : (() => {
            let q = stepsQuery()
              .select(
                "id,instance_id,node_type,status,due_at,assignee_user_id,created_at,updated_at,completed_at",
                { count: "exact" },
              )
              .limit(3000);
            if (responsible) q = q.eq("assignee_user_id", responsible);
            return q;
          })();

      const projectsQ = supabase
        .from("projects")
        .select("id,code,name")
        .eq("org_id", orgId)
        .limit(500);

      const [
        activeDocuments,
        draftDocs,
        approvedDocs,
        rejectedDocs,
        cancelledDocs,
        overdueReviews,
        dueSoonReviews,
        withoutCode,
        withoutProject,
        activeInstances,
        activeSteps,
        overdueSteps,
        dueSoonSteps,
        unreadNotifications,
        criticalNotifications,
        docsRowsRaw,
        stepsRowsRaw,
        projectsRaw,
        completedStepsCurrent,
        completedStepsPrevious,
        completedInstancesCurrent,
        completedInstancesPrevious,
        docsCreatedCurrent,
        docsCreatedPrevious,
        pendingEvidence,
      ] = await Promise.all([
        documentsCount((query) => query.neq("status", "obsolete")),
        documentsCount((query) => query.eq("status", "draft")),
        documentsCount((query) => query.eq("status", "approved")),
        documentsCount((query) => query.eq("status", "rejected")),
        documentsCount((query) => query.eq("status", "cancelled")),
        documentsCount((query) =>
          query.eq("status", "published").lt("next_review_at", today),
        ),
        documentsCount((query) =>
          query
            .eq("status", "published")
            .gte("next_review_at", today)
            .lte("next_review_at", dueSoonDate),
        ),
        documentsCount((query) => query.is("code", null)),
        documentsCount((query) => query.is("project_id", null)),
        contextFiltered
          ? Promise.resolve({ count: null, error: null })
          : (() => {
              let query = supabase
                .from("document_tramite_instances")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("status", "active");
              if (current.scope === "mine")
                query = query.eq("started_by", actorId);
              return query;
            })(),
        contextFiltered
          ? Promise.resolve({ count: null, error: null })
          : (() => {
              let query = stepsQuery()
                .select("id", { count: "exact", head: true })
                .eq("status", "active");
              if (responsible)
                query = query.eq("assignee_user_id", responsible);
              return query;
            })(),
        contextFiltered
          ? Promise.resolve({ count: null, error: null })
          : (() => {
              let query = stepsQuery()
                .select("id", { count: "exact", head: true })
                .eq("status", "active")
                .lt("due_at", new Date().toISOString());
              if (responsible)
                query = query.eq("assignee_user_id", responsible);
              return query;
            })(),
        contextFiltered
          ? Promise.resolve({ count: null, error: null })
          : (() => {
              let query = stepsQuery()
                .select("id", { count: "exact", head: true })
                .eq("status", "active")
                .gte("due_at", new Date().toISOString())
                .lte("due_at", dueSoon.toISOString());
              if (responsible)
                query = query.eq("assignee_user_id", responsible);
              return query;
            })(),
        (() => {
          let query = supabase
            .from("internal_notifications")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .is("read_at", null)
            .is("dismissed_at", null);
          if (current.scope === "mine")
            query = query.eq("recipient_user_id", actorId);
          return query;
        })(),
        (() => {
          let query = supabase
            .from("internal_notifications")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .is("read_at", null)
            .is("dismissed_at", null)
            .in("severity", ["danger", "critical"]);
          if (current.scope === "mine")
            query = query.eq("recipient_user_id", actorId);
          return query;
        })(),
        baseDocumentRows,
        baseStepsRows,
        projectsQ,
        contextFiltered
          ? Promise.resolve({ count: null, error: null })
          : safeCount(applyRange(
              stepsQuery()
                .select("id", { count: "exact", head: true })
                .eq("status", "completed"),
              "completed_at",
              fromIso,
              toIso,
            )),
        contextFiltered
          ? Promise.resolve({ count: null, error: null })
          : safeCount(applyRange(
              stepsQuery()
                .select("id", { count: "exact", head: true })
                .eq("status", "completed"),
              "completed_at",
              previousFromIso,
              fromIso,
            )),
        contextFiltered
          ? Promise.resolve({ count: null, error: null })
          : (() => {
              let q: any = supabase
                .from("document_tramite_instances")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .in("status", ["completed", "cancelled", "failed"]);
              q = applyRange(q, "finished_at", fromIso, toIso);
              if (current.scope === "mine") q = q.eq("started_by", actorId);
              return safeCount(q);
            })(),
        contextFiltered
          ? Promise.resolve({ count: null, error: null })
          : (() => {
              let q: any = supabase
                .from("document_tramite_instances")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .in("status", ["completed", "cancelled", "failed"]);
              q = applyRange(q, "finished_at", previousFromIso, fromIso);
              if (current.scope === "mine") q = q.eq("started_by", actorId);
              return safeCount(q);
            })(),
        (() => {
          let q: any = supabase
            .from("documents")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId);
          q = applyRange(q, "created_at", fromIso, toIso);
          if (current.scope === "mine") q = q.eq("author_id", actorId);
          if (current.projectId) q = q.eq("project_id", current.projectId);
          if (current.docType) q = q.eq("doc_type", current.docType);
          if (current.area) q = q.eq("area", current.area);
          return safeCount(q);
        })(),
        (() => {
          let q: any = supabase
            .from("documents")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId);
          q = applyRange(q, "created_at", previousFromIso, fromIso);
          if (current.scope === "mine") q = q.eq("author_id", actorId);
          if (current.projectId) q = q.eq("project_id", current.projectId);
          if (current.docType) q = q.eq("doc_type", current.docType);
          if (current.area) q = q.eq("area", current.area);
          return safeCount(q);
        })(),
        contextFiltered
          ? Promise.resolve({ count: null, error: null })
          : (() => {
              let q: any = supabase
                .from("document_tramite_instance_steps")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("status", "active");
              try {
                q = q.gte("required_evidence_count", 1);
              } catch {
                /* ignore if column missing */
              }
              if (responsible) q = q.eq("assignee_user_id", responsible);
              return safeCount(q);
            })(),
      ]);

      const projectMap = new Map<string, { code: string | null; name: string }>();
      const projectsList = Array.isArray(projectsRaw.data)
        ? (projectsRaw.data as unknown as Array<{ id: string; code: string | null; name: string }>)
        : [];
      projectsList.forEach((p) => projectMap.set(p.id, { code: p.code, name: p.name }));

      const docsRows = Array.isArray(docsRowsRaw.data)
        ? (docsRowsRaw.data as unknown as Array<{
            id: string;
            doc_type?: string | null;
            area?: string | null;
            project_id?: string | null;
            status?: string | null;
            next_review_at?: string | null;
            created_at?: string | null;
          }>)
        : [];

      const byType = new Map<string, number>();
      const byArea = new Map<string, number>();
      const byProject = new Map<string, number>();
      for (const d of docsRows) {
        if (d.doc_type) byType.set(d.doc_type, (byType.get(d.doc_type) ?? 0) + 1);
        if (d.area) byArea.set(d.area, (byArea.get(d.area) ?? 0) + 1);
        if (d.project_id)
          byProject.set(d.project_id, (byProject.get(d.project_id) ?? 0) + 1);
      }
      const projectLabel = (id: string) => {
        const p = projectMap.get(id);
        return p ? (p.code ? `${p.code} - ${p.name}` : p.name) : id;
      };
      const documentsByType = [...byType.entries()]
        .map(([key, count]) => ({ key, label: key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 40);
      const documentsByArea = [...byArea.entries()]
        .map(([key, count]) => ({ key, label: key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 40);
      const documentsByProject = [...byProject.entries()]
        .map(([key, count]) => ({ key, label: projectLabel(key), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 40);

      const stepsRows = Array.isArray(stepsRowsRaw.data)
        ? (stepsRowsRaw.data as unknown as Array<{
            id: string;
            instance_id?: string | null;
            node_type?: string | null;
            status?: string | null;
            due_at?: string | null;
            assignee_user_id?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
          }>)
        : [];

      const byStepType = new Map<string, number>();
      const byStepTypeOverdue = new Map<string, number>();
      const byProjectOverdue = new Map<string, number>();
      const byAreaOverdue = new Map<string, number>();
      const byResponsibleOverdue = new Map<string, { count: number; id?: string }>();

      let stalledCount = 0;
      let stepsWithoutDue = 0;
      const now = Date.now();
      const longestStalled: Array<{
        key: string;
        label: string;
        count: number;
        id?: string;
        stepType?: string;
        ageHours?: number | null;
      }> = [];

      for (const s of stepsRows) {
        if (s.node_type) byStepType.set(s.node_type, (byStepType.get(s.node_type) ?? 0) + 1);
        const isOverdue =
          s.status === "active" &&
          !!s.due_at &&
          new Date(s.due_at).getTime() < now;
        if (s.status === "active" && !s.due_at) stepsWithoutDue += 1;
        if (s.status === "active") {
          const age =
            s.updated_at || s.created_at
              ? (now - new Date((s.updated_at as string) || (s.created_at as string)).getTime()) /
                3_600_000
              : null;
          if (age !== null && age >= 72) stalledCount += 1;
          if (age !== null && age >= 48) {
            longestStalled.push({
              key: s.id,
              label: s.node_type || "Etapa",
              count: 1,
              id: s.id,
              stepType: s.node_type || undefined,
              ageHours: Number(age.toFixed(0)),
            });
          }
        }
        if (!isOverdue) continue;
        if (s.node_type)
          byStepTypeOverdue.set(s.node_type, (byStepTypeOverdue.get(s.node_type) ?? 0) + 1);
        if (s.assignee_user_id) {
          const prev = byResponsibleOverdue.get(s.assignee_user_id) ?? { count: 0 };
          prev.count += 1;
          prev.id = s.assignee_user_id;
          byResponsibleOverdue.set(s.assignee_user_id, prev);
        }
      }

      const instanceIdsToQuery = [...new Set(
        stepsRows
          .filter((s) => s.status === "active" && (s.node_type === "approval" || s.node_type === "review"))
          .map((s) => s.instance_id)
          .filter((v): v is string => !!v),
      )].slice(0, 600);

      const instanceRows = await (instanceIdsToQuery.length
        ? safeRows<Array<{ id: string; project_id?: string | null; document_id?: string | null }>>(
            supabase
              .from("document_tramite_instances")
              .select("id,project_id,document_id")
              .eq("org_id", orgId)
              .in("id", instanceIdsToQuery)
              .limit(1200),
          )
        : Promise.resolve({ data: null, error: null }));

      const docIdsToQuery = [...new Set(
        Array.isArray(instanceRows.data)
          ? instanceRows.data
              .map((i) => i.document_id)
              .filter((v): v is string => !!v)
          : [],
      )].slice(0, 1200);

      const docContextRows = await (docIdsToQuery.length
        ? safeRows<Array<{ id: string; project_id?: string | null; area?: string | null; doc_type?: string | null }>>(
            supabase
              .from("documents")
              .select("id,project_id,area,doc_type")
              .in("id", docIdsToQuery)
              .limit(1200),
          )
        : Promise.resolve({ data: null, error: null }));

      const instanceProject = new Map<string, string | null>();
      Array.isArray(instanceRows.data) &&
        instanceRows.data.forEach(
          (i) => instanceProject.set(i.id, i.project_id ?? null),
        );
      const docInfo = new Map<string, { project_id?: string | null; area?: string | null; doc_type?: string | null }>();
      Array.isArray(docContextRows.data) &&
        docContextRows.data.forEach(
          (d) => docInfo.set(d.id, d),
        );

      for (const s of stepsRows) {
        const isOverdue =
          s.status === "active" &&
          !!s.due_at &&
          new Date(s.due_at).getTime() < now;
        if (!isOverdue) continue;
        const iid = s.instance_id;
        if (iid) {
          const iProject = instanceProject.get(iid);
          if (iProject) {
            byProjectOverdue.set(iProject, (byProjectOverdue.get(iProject) ?? 0) + 1);
          }
        }
      }

      for (const s of stepsRows) {
        const isOverdue =
          s.status === "active" &&
          !!s.due_at &&
          new Date(s.due_at).getTime() < now;
        if (!isOverdue) continue;
        const iid = s.instance_id;
        if (!iid) continue;
        const docId = (() => {
          for (const doc of (Array.isArray(instanceRows.data) ? instanceRows.data : [])) {
            if (doc.id === iid) return doc.document_id ?? null;
          }
          return null;
        })();
        if (docId) {
          const di = docInfo.get(docId);
          if (di?.area) byAreaOverdue.set(di.area, (byAreaOverdue.get(di.area) ?? 0) + 1);
          if (di?.project_id) byProjectOverdue.set(di.project_id, (byProjectOverdue.get(di.project_id) ?? 0) + 1);
        }
      }

      const userIds = [...byResponsibleOverdue.keys()];
      const userRows = await (userIds.length
        ? safeRows<Array<{ id: string; full_name?: string | null }>>(
            supabase
              .from("profiles")
              .select("id,full_name")
              .in("id", userIds)
              .limit(600),
          )
        : Promise.resolve({ data: null, error: null }));
      const userNames = new Map<string, string>();
      Array.isArray(userRows.data) &&
        userRows.data.forEach(
          (u) => userNames.set(u.id, u.full_name || u.id),
        );

      const stepLabels: Record<string, string> = {
        start: "Início",
        end: "Fim",
        draft: "Elaboração",
        review: "Revisão técnica",
        approval: "Aprovação",
        correction: "Correção",
        evidence: "Evidência obrigatória",
        mandatory_reading: "Ciência obrigatória",
        publication: "Publicação",
        decision: "Decisão",
        custom: "Etapa personalizada",
      };
      const labelStep = (k: string) => stepLabels[k] || k;
      const labelArea = (k: string) => k;
      const labelDocType = (k: string) => k;

      const longestStalledSorted = longestStalled
        .sort((a, b) => (b.ageHours ?? 0) - (a.ageHours ?? 0))
        .slice(0, 12);

      return buildFallbackReport({
        filters: current,
        documents: {
          active: unwrapCount(activeDocuments),
          drafts: unwrapCount(draftDocs),
          approved: unwrapCount(approvedDocs),
          rejected: unwrapCount(rejectedDocs),
          cancelled: unwrapCount(cancelledDocs),
          overdue: unwrapCount(overdueReviews),
          dueSoon: unwrapCount(dueSoonReviews),
          withoutCode: unwrapCount(withoutCode),
          withoutProject: unwrapCount(withoutProject),
          total: unwrapCount(activeDocuments) ?? docsRows.length,
          byType: documentsByType.map((i) => ({
            key: i.key,
            label: labelDocType(i.label),
            count: i.count,
          })),
          byArea: documentsByArea.map((i) => ({
            key: i.key,
            label: labelArea(i.label),
            count: i.count,
          })),
          byProject: documentsByProject,
          createdCurrent: unwrapCount(docsCreatedCurrent) ?? 0,
          createdPrevious: unwrapCount(docsCreatedPrevious) ?? 0,
        },
        tramites: {
          activeInstances: unwrapCount(activeInstances),
          activeSteps: unwrapCount(activeSteps),
          overdueSteps: unwrapCount(overdueSteps),
          dueSoonSteps: unwrapCount(dueSoonSteps),
          completedStepsCurrent: unwrapCount(completedStepsCurrent) ?? 0,
          completedStepsPrevious: unwrapCount(completedStepsPrevious) ?? 0,
          completedInstancesCurrent: unwrapCount(completedInstancesCurrent) ?? 0,
          completedInstancesPrevious: unwrapCount(completedInstancesPrevious) ?? 0,
          stalledSteps: stalledCount,
          stepsWithoutDue: stepsWithoutDue,
          pendingEvidence: unwrapCount(pendingEvidence) ?? 0,
          byStepType: [...byStepType.entries()]
            .map(([key, count]) => ({ key, label: labelStep(key), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20),
          byResponsibleOverdue: [...byResponsibleOverdue.entries()]
            .map(([uid, info]) => ({
              key: uid,
              label: userNames.get(uid) || "Usuário",
              count: info.count,
              id: info.id,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 30),
          byProjectOverdue: [...byProjectOverdue.entries()]
            .map(([pid, count]) => ({ key: pid, label: projectLabel(pid), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 25),
          byAreaOverdue: [...byAreaOverdue.entries()]
            .map(([a, count]) => ({ key: a, label: labelArea(a), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 25),
          byStepTypeOverdue: [...byStepTypeOverdue.entries()]
            .map(([k, count]) => ({ key: k, label: labelStep(k), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 25),
          longestStalled: longestStalledSorted,
        },
        notifications: {
          unread: unwrapCount(unreadNotifications),
          critical: unwrapCount(criticalNotifications),
        },
        projects: projectsList,
      });
    },
    [profile],
  );

  const refresh = useCallback(async () => {
    if (!profile?.org_id) {
      setIsLoading(false);
      setSource("restricted");
      setError("Seu perfil não possui uma organização válida.");
      setReport(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setWarning(null);

    const { data, error: rpcError } = await supabase.rpc(
      "get_operational_indicators",
      {
        p_from: filters.from,
        p_to: filters.to,
        p_scope: filters.scope,
        p_project_id: filters.projectId || null,
        p_doc_type: filters.docType || null,
        p_area: filters.area || null,
        p_responsible_user_id: filters.responsibleUserId || null,
        p_severity: filters.severity || null,
        p_status: filters.status || null,
      },
    );

    if (!rpcError) {
      const normalized = normalizeOperationalIndicators(data);
      setReport(normalized);
      setSource("rpc");
      setIsLoading(false);
      return;
    }

    if (isIndicatorsPermissionError(rpcError)) {
      setSource("restricted");
      setError(
        "Seu perfil não possui permissão para os indicadores da organização. Use o escopo pessoal.",
      );
      setReport(null);
      setIsLoading(false);
      return;
    }

    if (isMissingIndicatorsRpc(rpcError)) {
      try {
        const fallback = await loadFallback(filters);
        setReport(fallback);
        setSource(fallback ? "fallback" : "not_installed");
        setWarning(null);
      } catch (fallbackError) {
        setReport(null);
        setSource("not_installed");
        setWarning(
          "Não foi possível calcular os indicadores no momento.",
        );
        setError(getErrorMessage(fallbackError, "Falha no resumo local."));
      }
      setIsLoading(false);
      return;
    }

    setReport(null);
    setSource("error");
    setError(
      getErrorMessage(rpcError, "Não foi possível carregar os indicadores."),
    );
    setIsLoading(false);
  }, [filters, loadFallback, profile?.org_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const projectOptions = useMemo(
    () =>
      projectsState.projects.map((project) => ({
        value: project.id,
        label: project.code
          ? `${project.code} — ${project.name}`
          : project.name,
      })),
    [projectsState.projects],
  );

  const dimensions = useMemo(
    () => ({
      projects:
        projectOptions.length > 0
          ? projectOptions
          : (report?.dimensions.projects ?? []),
      areas: report?.dimensions.areas ?? [],
      docTypes: report?.dimensions.docTypes ?? [],
      responsibles: report?.dimensions.responsibles ?? [],
      statuses: report?.dimensions.statuses ?? [],
    }),
    [projectOptions, report?.dimensions],
  );

  return {
    report,
    filters,
    setFilters,
    source,
    isLoading,
    error,
    warning,
    canViewOrganization,
    dimensions,
    refresh,
  };
}
