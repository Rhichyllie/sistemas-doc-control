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
  };
  tramites: {
    activeInstances: number | null;
    activeSteps: number | null;
    overdueSteps: number | null;
  };
  notifications: {
    unread: number | null;
    critical: number | null;
  };
}) {
  return normalizeOperationalIndicators({
    version: "P-26-fallback",
    generated_at: new Date().toISOString(),
    period: {
      from: input.filters.from,
      to: input.filters.to,
    },
    scope: input.filters.scope,
    capabilities: {
      documents: input.documents.active !== null,
      projects: false,
      tramites: input.tramites.activeSteps !== null,
      notifications: input.notifications.unread !== null,
    },
    summary: {
      active_documents: input.documents.active,
      active_tramite_instances: input.tramites.activeInstances,
      active_steps: input.tramites.activeSteps,
      overdue_steps: input.tramites.overdueSteps,
      overdue_reviews: input.documents.overdue,
      due_soon_reviews: input.documents.dueSoon,
      critical_unread_notifications: input.notifications.critical,
    },
    documents: {
      active_documents: input.documents.active,
      drafts: input.documents.drafts,
      without_code: input.documents.withoutCode,
      without_project: input.documents.withoutProject,
      with_review_overdue: input.documents.overdue,
      with_review_due_soon: input.documents.dueSoon,
    },
    tramites: {
      active_instances: input.tramites.activeInstances,
      active_steps: input.tramites.activeSteps,
      overdue_steps: input.tramites.overdueSteps,
    },
    notifications: {
      unread: input.notifications.unread,
      critical_unread: input.notifications.critical,
    },
    sla: {
      total_items_with_due_date: null,
      compliance_rate: null,
      deadline_mode: "simple_date",
      explanation:
        "O fallback mostra contagens simples; compliance e gargalos exigem o ciclo 25.",
    },
    quality: {
      documents_without_code: input.documents.withoutCode,
      documents_without_context: input.documents.withoutProject,
    },
    recommendations: [
      {
        id: "install-cycle-25",
        severity: "warning",
        title: "Aplicar o ciclo 25 para análise completa",
        explanation:
          "O resumo local não calcula gargalos, ciclo médio, delegações nem compliance consolidado.",
        action_label: "Abrir Diagnóstico Operacional",
        action_url: "/authenticated/configuracoes/diagnostico",
      },
    ],
    limitations: [
      "Fallback local resumido.",
      "Gargalos e SLA consolidado indisponíveis sem a RPC P-26.",
    ],
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

      const contextFiltered = Boolean(
        current.projectId || current.docType || current.area || current.status,
      );
      const responsible =
        current.responsibleUserId || (current.scope === "mine" ? actorId : "");
      const [
        activeDocuments,
        drafts,
        overdueReviews,
        dueSoonReviews,
        withoutCode,
        withoutProject,
        activeInstances,
        activeSteps,
        overdueSteps,
        unreadNotifications,
        criticalNotifications,
      ] = await Promise.all([
        documentsCount((query) => query.neq("status", "obsolete")),
        documentsCount((query) => query.eq("status", "draft")),
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
              let query = supabase
                .from("document_tramite_instance_steps")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("status", "active");
              if (responsible)
                query = query.eq("assignee_user_id", responsible);
              return query;
            })(),
        contextFiltered
          ? Promise.resolve({ count: null, error: null })
          : (() => {
              let query = supabase
                .from("document_tramite_instance_steps")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("status", "active")
                .lt("due_at", new Date().toISOString());
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
      ]);

      return buildFallbackReport({
        filters: current,
        documents: {
          active: unwrapCount(activeDocuments),
          drafts: unwrapCount(drafts),
          overdue: unwrapCount(overdueReviews),
          dueSoon: unwrapCount(dueSoonReviews),
          withoutCode: unwrapCount(withoutCode),
          withoutProject: unwrapCount(withoutProject),
        },
        tramites: {
          activeInstances: unwrapCount(activeInstances),
          activeSteps: unwrapCount(activeSteps),
          overdueSteps: unwrapCount(overdueSteps),
        },
        notifications: {
          unread: unwrapCount(unreadNotifications),
          critical: unwrapCount(criticalNotifications),
        },
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
        setWarning(
          "Ciclo 25 não instalado. O resumo local não calcula gargalos, delegações ou compliance consolidado.",
        );
      } catch (fallbackError) {
        setReport(null);
        setSource("not_installed");
        setWarning(
          "Ciclo 25 não instalado e o resumo local não pôde ser concluído.",
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
