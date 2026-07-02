import { useCallback, useMemo } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useDocumentCodePatterns } from "@/hooks/useDocumentCodePatterns";
import { useDocumentTemplatesAndRules } from "@/hooks/useDocumentTemplatesAndRules";
import { useDocumentWorkCenter } from "@/hooks/useDocumentWorkCenter";
import {
  mapWorkCenterToHomeSummary,
  type OperationalHomeMetrics,
} from "@/lib/operationalHome";

export function useOperationalHome() {
  const { profile, org } = useAuthContext();
  const workCenter = useDocumentWorkCenter();
  const coding = useDocumentCodePatterns({
    includeInactive: false,
    requireManagement: false,
    loadProjects: false,
  });
  const policies = useDocumentTemplatesAndRules({
    includeInactive: false,
  });

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
    workCenter.documents,
    workCenter.projects.length,
    workCenter.projectsAvailable,
    workCenter.projectSchemaMode,
    workCenter.publishedTramiteTemplatesCount,
    workCenter.tramiteModelingStatus,
    workCenter.tramiteStatus,
    workCenter.workItems,
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

  const refresh = useCallback(async () => {
    await Promise.all([
      workCenter.refresh(),
      coding.refresh(),
      policies.refresh(),
    ]);
  }, [coding, policies, workCenter]);

  return {
    profile,
    org,
    isLoading: workCenter.isLoading || coding.isLoading || policies.isLoading,
    error: workCenter.error,
    warnings,
    refresh,
    canManage: profile?.role === "admin" || profile?.role === "manager",
    ...summary,
  };
}
