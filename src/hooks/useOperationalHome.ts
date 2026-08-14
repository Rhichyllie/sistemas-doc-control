import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useDocumentCodePatterns } from "@/hooks/useDocumentCodePatterns";
import { useDocumentTemplatesAndRules } from "@/hooks/useDocumentTemplatesAndRules";
import { useDocumentWorkCenter } from "@/hooks/useDocumentWorkCenter";
import {
  isIndicatorsPermissionError,
  isMissingIndicatorsRpc,
} from "@/lib/operationalIndicators";
import {
  mapWorkCenterToHomeSummary,
  type OperationalHomeMetrics,
} from "@/lib/operationalHome";
import { supabase } from "@/lib/supabase";

interface IndicatorsProbe {
  installed: boolean;
  attention: boolean;
  hasData: boolean;
  loading: boolean;
}

export function useOperationalHome() {
  const { profile, org } = useAuthContext();

  const codingOptions = useMemo(
    () => ({ includeInactive: false, requireManagement: false, loadProjects: false }),
    [],
  );
  const templatesAndRulesOptions = useMemo(() => ({ includeInactive: false }), []);

  const workCenter = useDocumentWorkCenter();
  const coding = useDocumentCodePatterns(codingOptions);
  const policies = useDocumentTemplatesAndRules(templatesAndRulesOptions);
  const [indicatorsProbe, setIndicatorsProbe] = useState<IndicatorsProbe>({
    installed: false,
    attention: false,
    hasData: false,
    loading: true,
  });

  const refreshIndicatorsProbe = useCallback(async () => {
    if (!profile?.org_id) {
      setIndicatorsProbe({
        installed: false,
        attention: true,
        hasData: false,
        loading: false,
      });
      return;
    }
    setIndicatorsProbe((current) => ({ ...current, loading: true }));
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc("get_operational_indicators", {
      p_from: today,
      p_to: today,
      p_scope: "mine",
      p_project_id: null,
      p_doc_type: null,
      p_area: null,
      p_responsible_user_id: null,
      p_severity: null,
      p_status: null,
    });
    if (!error) {
      const root =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {};
      const summary =
        root.summary &&
        typeof root.summary === "object" &&
        !Array.isArray(root.summary)
          ? (root.summary as Record<string, unknown>)
          : {};
      setIndicatorsProbe({
        installed: true,
        attention: false,
        hasData: Object.values(summary).some(
          (value) => typeof value === "number" && value > 0,
        ),
        loading: false,
      });
      return;
    }
    setIndicatorsProbe({
      installed: !isMissingIndicatorsRpc(error),
      attention:
        !isMissingIndicatorsRpc(error) || isIndicatorsPermissionError(error),
      hasData: false,
      loading: false,
    });
  }, [profile?.org_id]);

  useEffect(() => {
    void refreshIndicatorsProbe();
  }, [refreshIndicatorsProbe]);

  const summary = useMemo(() => {
    const activeDocuments = workCenter.documents.filter(
      (document) => !["obsolete", "archived"].includes(document.status),
    ).length;
    const criticalItems = workCenter.workItems.filter(
      (item) => item.priority === "critical",
    );
    const metrics: OperationalHomeMetrics = {
      activeDocuments,
      criticalPending: criticalItems.length,
      activeTramites: workCenter.activeInstances.length,
      upcomingReviews: workCenter.workItems.filter(
        (item) => item.type === "review_due",
      ).length,
      drafts: workCenter.workItems.filter((item) => item.type === "draft")
        .length,
      withoutNextStep: workCenter.workItems.filter((item) =>
        ["suggested_tramite", "formal_revision"].includes(item.type),
      ).length,
      overdueReviews: workCenter.workItems.filter(
        (item) => item.type === "review_due" && item.priority === "critical",
      ).length,
      overdueTramiteSteps: workCenter.workItems.filter(
        (item) => item.type === "tramite_step" && item.priority === "critical",
      ).length,
      nearDueTramiteSteps: workCenter.workItems.filter(
        (item) =>
          item.type === "tramite_step" &&
          item.priority !== "critical" &&
          item.businessDaysRemaining !== null &&
          item.businessDaysRemaining !== undefined &&
          item.businessDaysRemaining >= 0 &&
          item.businessDaysRemaining <= 3,
      ).length,
      documentsWithoutSlaPolicy: workCenter.documentsWithoutSlaPolicy,
      documentsWithoutCode: workCenter.documents.filter(
        (document) => !document.code,
      ).length,
      legacyCodes:
        workCenter.codingStatus === "ready"
          ? workCenter.documents.filter(
              (document) => document.code_generation_mode === "legacy",
            ).length
          : 0,
      suggestedNotStarted: workCenter.workItems.filter(
        (item) => item.type === "suggested_tramite",
      ).length,
      stalledApprovals: workCenter.workItems.filter(
        (item) => item.type === "approval" && item.priority === "critical",
      ).length,
      documentsWithoutProject: workCenter.documents.filter(
        (document) => !document.project_id,
      ).length,
      codingInstalled: workCenter.codingStatus === "ready",
      codingAttention:
        workCenter.codingStatus === "restricted" || Boolean(coding.error),
      codePatterns: coding.patterns.length,
      projectsInstalled: workCenter.projectsAvailable,
      projectsAttention: ["denied", "error"].includes(
        workCenter.projectSchemaMode,
      ),
      projects: workCenter.projects.length,
      policiesInstalled: policies.canUseTemplates || policies.canUseRules,
      policiesAttention: Boolean(policies.error),
      policies: policies.templates.length + policies.rules.length,
      tramiteModelingInstalled: ["ready", "empty"].includes(
        workCenter.tramiteModelingStatus,
      ),
      tramiteModelingAttention: ["restricted", "partial", "error"].includes(
        workCenter.tramiteModelingStatus,
      ),
      publishedTramiteTemplates: workCenter.publishedTramiteTemplatesCount,
      tramiteExecutionInstalled: ["ready", "empty"].includes(
        workCenter.tramiteStatus,
      ),
      tramiteExecutionAttention: ["restricted", "error"].includes(
        workCenter.tramiteStatus,
      ),
      calendarInstalled: ["ready", "empty"].includes(workCenter.calendarStatus),
      calendarAttention: ["restricted", "error"].includes(
        workCenter.calendarStatus,
      ),
      availabilityInstalled: ["ready", "empty"].includes(
        workCenter.availabilityStatus,
      ),
      availabilityAttention: ["restricted", "error"].includes(
        workCenter.availabilityStatus,
      ),
      absentWithoutSubstitute: workCenter.absentWithoutSubstitute,
      activeSubstitutions: workCenter.activeSubstitutions,
      deadlinesWithAbsentAssignee: workCenter.deadlinesWithAbsentAssignee,
      criticalUnreadNotifications: workCenter.criticalUnreadNotifications,
      openEscalations: workCenter.openEscalations,
      notificationsInstalled: workCenter.notificationStatus === "enterprise",
      notificationsAttention: workCenter.notificationStatus === "unavailable",
      indicatorsInstalled: indicatorsProbe.installed,
      indicatorsAttention: indicatorsProbe.attention,
      indicatorsHaveData: indicatorsProbe.hasData,
    };
    return {
      metrics,
      ...mapWorkCenterToHomeSummary(metrics),
    };
  }, [
    coding.error,
    coding.patterns.length,
    policies.canUseRules,
    policies.canUseTemplates,
    policies.error,
    policies.rules.length,
    policies.templates.length,
    workCenter.activeInstances.length,
    workCenter.codingStatus,
    workCenter.calendarStatus,
    workCenter.availabilityStatus,
    workCenter.absentWithoutSubstitute,
    workCenter.activeSubstitutions,
    workCenter.deadlinesWithAbsentAssignee,
    workCenter.criticalUnreadNotifications,
    workCenter.openEscalations,
    workCenter.notificationStatus,
    workCenter.documents,
    workCenter.documentsWithoutSlaPolicy,
    workCenter.projects.length,
    workCenter.projectsAvailable,
    workCenter.projectSchemaMode,
    workCenter.publishedTramiteTemplatesCount,
    workCenter.tramiteModelingStatus,
    workCenter.tramiteStatus,
    workCenter.workItems,
    indicatorsProbe.attention,
    indicatorsProbe.hasData,
    indicatorsProbe.installed,
  ]);

  const warnings = [
    ...workCenter.warnings,
    coding.compatibilityMessage,
    coding.error ? "Padrões de codificação não puderam ser consultados." : null,
    policies.compatibilityMessage,
    policies.error
      ? "Regras e políticas documentais não puderam ser consultadas."
      : null,
  ].filter(
    (warning, index, values): warning is string =>
      Boolean(warning) && values.indexOf(warning) === index,
  );

  const workCenterRefresh = workCenter.refresh;
  const codingRefresh = coding.refresh;
  const policiesRefresh = policies.refresh;

  const refresh = useCallback(async () => {
    await Promise.all([
      workCenterRefresh(),
      codingRefresh(),
      policiesRefresh(),
      refreshIndicatorsProbe(),
    ]);
  }, [codingRefresh, policiesRefresh, refreshIndicatorsProbe, workCenterRefresh]);

  return {
    profile,
    org,
    isLoading:
      workCenter.isLoading ||
      coding.isLoading ||
      policies.isLoading ||
      indicatorsProbe.loading,
    error: workCenter.error,
    warnings,
    refresh,
    canManage: profile?.role === "admin" || profile?.role === "manager",
    ...summary,
  };
}
