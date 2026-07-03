import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errorUtils";
import {
  buildOperationalReadiness,
  normalizeOperationalReadinessReport,
  type OperationalReadinessBackendReport,
  type OperationalReadinessTableState,
  type OperationalReadinessView,
  type ReadinessReportSource,
} from "@/lib/operationalReadiness";
import { supabase } from "@/lib/supabase";
import { getSupportedTimeZones, isValidTimeZone } from "@/lib/timeZones";

interface Probe {
  available: boolean | null;
  count: number | null;
  restricted: boolean;
  error: string | null;
}

interface ProbeResult {
  count: number | null;
  data?: unknown;
  error: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function classifyError(error: unknown) {
  const row = record(error);
  const code = String(row.code ?? "").toUpperCase();
  const text = [row.message, row.details, row.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (
    ["42P01", "PGRST202", "PGRST205"].includes(code) ||
    text.includes("does not exist") ||
    text.includes("could not find") ||
    text.includes("schema cache")
  ) {
    return "missing" as const;
  }
  if (
    ["42501", "PGRST301"].includes(code) ||
    text.includes("permission denied") ||
    text.includes("row-level security")
  ) {
    return "restricted" as const;
  }
  return "error" as const;
}

function normalizeProbe(result: ProbeResult): Probe {
  if (!result.error) {
    return {
      available: true,
      count: result.count ?? 0,
      restricted: false,
      error: null,
    };
  }
  const classification = classifyError(result.error);
  return {
    available: classification === "missing" ? false : null,
    count: null,
    restricted: classification === "restricted",
    error: getErrorMessage(result.error, "Falha de leitura."),
  };
}

function tableState(probe: Probe): OperationalReadinessTableState {
  return {
    available: probe.available,
    rls_enabled: null,
    policy_count: null,
  };
}

function allAvailable(probes: Probe[]) {
  if (probes.some((probe) => probe.available === false)) return false;
  if (probes.every((probe) => probe.available === true)) return true;
  return null;
}

function countOrNull(probe: Probe) {
  return probe.available === true ? probe.count : null;
}

async function loadFrontendFallback(
  orgId: string,
  actorRole: string,
): Promise<{
  report: OperationalReadinessBackendReport;
  warning: string | null;
}> {
  const now = new Date().toISOString();
  const [
    instancesResult,
    stepsResult,
    instanceEventsResult,
    calendarsResult,
    defaultCalendarResult,
    holidaysResult,
    slaResult,
    importRunsResult,
    absencesResult,
    delegationsResult,
    notificationsResult,
    criticalNotificationsResult,
    preferencesResult,
    notificationEventsResult,
    escalationEventsResult,
    escalationRulesResult,
    outboxResult,
    projectsResult,
    templatesResult,
    rulesResult,
    tramiteTemplatesResult,
    specificStepsResult,
  ] = await Promise.all([
    supabase
      .from("document_tramite_instances")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("document_tramite_instance_steps")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("document_tramite_instance_events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("operational_calendars")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("operational_calendars")
      .select("id, timezone", { count: "exact" })
      .eq("org_id", orgId)
      .eq("is_default", true)
      .limit(1),
    supabase
      .from("operational_holidays")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("document_sla_policies")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("active", true),
    supabase
      .from("operational_holiday_import_runs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("team_absences")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["scheduled", "active"])
      .gt("ends_at", now),
    supabase
      .from("team_delegation_rules")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("active", true),
    supabase
      .from("internal_notifications")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("read_at", null)
      .is("dismissed_at", null),
    supabase
      .from("internal_notifications")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("read_at", null)
      .is("dismissed_at", null)
      .in("severity", ["danger", "critical"]),
    supabase
      .from("notification_preferences")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("event_type", "notification_escalated"),
    supabase
      .from("notification_escalation_rules")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("active", true),
    supabase
      .from("notification_delivery_outbox")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending"),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("document_creation_templates")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("is_active", true),
    supabase
      .from("document_creation_rules")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("is_active", true),
    supabase
      .from("document_tramite_templates")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "published"),
    supabase
      .from("document_tramite_instance_steps")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("assignment_type", "specific_user"),
  ]);

  const probes = {
    instances: normalizeProbe(instancesResult),
    steps: normalizeProbe(stepsResult),
    instanceEvents: normalizeProbe(instanceEventsResult),
    calendars: normalizeProbe(calendarsResult),
    defaultCalendar: normalizeProbe(defaultCalendarResult),
    holidays: normalizeProbe(holidaysResult),
    sla: normalizeProbe(slaResult),
    importRuns: normalizeProbe(importRunsResult),
    absences: normalizeProbe(absencesResult),
    delegations: normalizeProbe(delegationsResult),
    notifications: normalizeProbe(notificationsResult),
    criticalNotifications: normalizeProbe(criticalNotificationsResult),
    preferences: normalizeProbe(preferencesResult),
    notificationEvents: normalizeProbe(notificationEventsResult),
    escalationEvents: normalizeProbe(escalationEventsResult),
    escalationRules: normalizeProbe(escalationRulesResult),
    outbox: normalizeProbe(outboxResult),
    projects: normalizeProbe(projectsResult),
    templates: normalizeProbe(templatesResult),
    rules: normalizeProbe(rulesResult),
    tramiteTemplates: normalizeProbe(tramiteTemplatesResult),
    specificSteps: normalizeProbe(specificStepsResult),
  };
  const errors = Object.values(probes)
    .filter((probe) => probe.restricted || probe.available === null)
    .map((probe) => probe.error)
    .filter((message): message is string => Boolean(message));
  const defaultCalendarRows = Array.isArray(defaultCalendarResult.data)
    ? defaultCalendarResult.data
    : [];
  const savedTimezone =
    typeof defaultCalendarRows[0]?.timezone === "string"
      ? defaultCalendarRows[0].timezone
      : null;
  const timezoneValid = savedTimezone
    ? isValidTimeZone(savedTimezone, getSupportedTimeZones())
    : null;
  const notificationCycle = allAvailable([
    probes.notifications,
    probes.preferences,
    probes.notificationEvents,
    probes.escalationRules,
    probes.outbox,
  ]);

  return {
    report: {
      version: "P-25.1-frontend-fallback",
      generated_at: new Date().toISOString(),
      org_id: orgId,
      actor_role: actorRole,
      cycles: {
        cycle_18_execution: allAvailable([
          probes.instances,
          probes.steps,
          probes.instanceEvents,
        ]),
        cycle_21_calendar: allAvailable([
          probes.calendars,
          probes.holidays,
          probes.sla,
        ]),
        cycle_22_availability: allAvailable([
          probes.absences,
          probes.delegations,
        ]),
        cycle_23_notifications: notificationCycle,
      },
      tables: {
        organizations: {
          available: true,
          rls_enabled: null,
          policy_count: null,
        },
        profiles: {
          available: true,
          rls_enabled: null,
          policy_count: null,
        },
        document_tramite_templates: tableState(probes.tramiteTemplates),
        document_tramite_instances: tableState(probes.instances),
        document_tramite_instance_steps: tableState(probes.steps),
        document_tramite_instance_events: tableState(probes.instanceEvents),
        operational_calendars: tableState(probes.calendars),
        operational_holidays: tableState(probes.holidays),
        document_sla_policies: tableState(probes.sla),
        operational_holiday_import_runs: tableState(probes.importRuns),
        team_absences: tableState(probes.absences),
        team_delegation_rules: tableState(probes.delegations),
        internal_notifications: tableState(probes.notifications),
        notification_preferences: tableState(probes.preferences),
        notification_events: tableState(probes.notificationEvents),
        notification_escalation_rules: tableState(probes.escalationRules),
        notification_delivery_outbox: tableState(probes.outbox),
        projects: tableState(probes.projects),
        document_creation_templates: tableState(probes.templates),
        document_creation_rules: tableState(probes.rules),
      },
      functions: {
        current_user_org_id: null,
        is_org_role: null,
        document_tramite_actor_can_act: null,
        start_document_tramite_instance: null,
        complete_document_tramite_step: null,
        add_document_tramite_evidence: null,
        add_business_days: null,
        is_user_unavailable: null,
        resolve_user_substitute: null,
        create_internal_notification: null,
        mark_notification_read: null,
        dismiss_notification: null,
        generate_operational_notifications: null,
        resolve_effective_tramite_actor: null,
        get_operational_readiness: false,
      },
      configuration: {
        projects: countOrNull(probes.projects),
        document_templates: countOrNull(probes.templates),
        document_rules: countOrNull(probes.rules),
        published_tramite_templates: countOrNull(probes.tramiteTemplates),
        specific_user_steps: countOrNull(probes.specificSteps),
        completed_step_events: null,
        delegated_step_events: null,
        default_calendars: countOrNull(probes.defaultCalendar),
        default_calendar_timezone_valid: timezoneValid,
        holidays: countOrNull(probes.holidays),
        active_sla_policies: countOrNull(probes.sla),
        active_or_scheduled_absences: countOrNull(probes.absences),
        active_delegations: countOrNull(probes.delegations),
        unread_notifications: countOrNull(probes.notifications),
        critical_unread_notifications: countOrNull(
          probes.criticalNotifications,
        ),
        notification_events: countOrNull(probes.notificationEvents),
        notification_created_events: null,
        notification_read_events: null,
        notification_dismissed_events: null,
        notification_generated_events: null,
        notification_suppressed_events: null,
        escalation_events: countOrNull(probes.escalationEvents),
        active_escalation_rules: countOrNull(probes.escalationRules),
        pending_email_outbox: countOrNull(probes.outbox),
      },
      security: {
        operational_rls_ready: null,
        notification_rls_ready: null,
        direct_notification_insert_blocked: null,
        direct_notification_update_blocked: null,
        direct_notification_delete_blocked: null,
        direct_event_insert_blocked: null,
        direct_event_update_blocked: null,
        direct_event_delete_blocked: null,
        delegated_completion_contract: null,
        delegation_specific_user_only: true,
        delegated_evidence_enabled: false,
        external_email_delivery_enabled: false,
        default_escalation_available: true,
        readiness_rpc_read_error: false,
        frontend_probe_read_error: errors.length > 0,
        diagnostic_mutates_data: false,
        approval_flows_write_enabled: false,
        work_center_inline_completion_enabled: false,
      },
    },
    warning:
      errors.length > 0
        ? "Algumas fontes não puderam ser lidas no modo de compatibilidade. Aplique o ciclo 24 e revise RLS."
        : null,
  };
}

function isMissingReadinessRpc(error: unknown) {
  const classification = classifyError(error);
  const text = Object.values(record(error))
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    classification === "missing" &&
    (text.includes("get_operational_readiness") ||
      String(record(error).code ?? "").toUpperCase() === "PGRST202")
  );
}

export function useOperationalReadiness() {
  const { profile } = useAuthContext();
  const canAccess = profile?.role === "admin" || profile?.role === "manager";
  const [report, setReport] =
    useState<OperationalReadinessBackendReport | null>(null);
  const [view, setView] = useState<OperationalReadinessView | null>(null);
  const [source, setSource] =
    useState<ReadinessReportSource>("frontend_fallback");
  const [isLoading, setIsLoading] = useState(Boolean(canAccess));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!canAccess) {
      setReport(null);
      setView(null);
      setError(null);
      setWarning(null);
      setIsLoading(false);
      return;
    }
    if (!profile?.org_id) {
      setReport(null);
      setView(null);
      setError("Seu perfil não possui organização válida.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarning(null);
    const { data, error: rpcError } = await supabase.rpc(
      "get_operational_readiness",
    );

    if (!rpcError) {
      const normalized = normalizeOperationalReadinessReport(data);
      if (!normalized) {
        setError(
          "O health check retornou um contrato inválido. Revise a migration do ciclo 24.",
        );
        setIsLoading(false);
        return;
      }
      setReport(normalized);
      setSource("database");
      setView(buildOperationalReadiness(normalized, "database"));
      setIsLoading(false);
      return;
    }

    try {
      const fallback = await loadFrontendFallback(profile.org_id, profile.role);
      const rpcClassification = classifyError(rpcError);
      fallback.report.security.readiness_rpc_read_error =
        rpcClassification !== "missing";
      setReport(fallback.report);
      setSource("frontend_fallback");
      setView(buildOperationalReadiness(fallback.report, "frontend_fallback"));
      setWarning(
        isMissingReadinessRpc(rpcError)
          ? "O ciclo 24 ainda não está instalado. O diagnóstico usa sinais frontend e não consegue comprovar policies ou funções no catálogo do banco."
          : rpcClassification === "restricted"
            ? "A RPC de diagnóstico foi bloqueada por papel ou organização. O fallback é parcial; revise perfil, RLS e o ciclo 24."
            : (fallback.warning ??
              "A RPC de diagnóstico falhou. Foi usado um fallback parcial e somente leitura."),
      );
    } catch (fallbackError: unknown) {
      setReport(null);
      setView(null);
      setError(
        getErrorMessage(
          fallbackError,
          "Não foi possível executar o diagnóstico operacional.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [canAccess, profile?.org_id, profile?.role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    canAccess,
    report,
    view,
    source,
    isLoading,
    error,
    warning,
    refresh,
  };
}
