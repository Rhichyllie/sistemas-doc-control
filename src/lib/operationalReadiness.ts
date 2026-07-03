export type ReadinessStatus =
  | "ok"
  | "attention"
  | "absent"
  | "not_installed"
  | "not_configured"
  | "read_error"
  | "fallback";

export type ReadinessSeverity = "info" | "warning" | "critical";
export type ReadinessOverallStatus = "ready" | "attention" | "blocked";
export type ReadinessReportSource = "database" | "frontend_fallback";

export type OperationalReadinessSectionId =
  | "foundation"
  | "notifications"
  | "delegation"
  | "calendar"
  | "security"
  | "pilot";

export type GoLiveSectionId =
  | "foundation"
  | "documents"
  | "tramites"
  | "calendar"
  | "availability"
  | "notifications"
  | "audit"
  | "security"
  | "training"
  | "pilot";

export type OperationalReadinessRoute =
  | "/authenticated/configuracoes/diagnostico"
  | "/authenticated/schema-doctor"
  | "/authenticated/projetos"
  | "/authenticated/documentos/regras"
  | "/authenticated/documentos/tramites"
  | "/authenticated/configuracoes/calendario"
  | "/authenticated/equipe"
  | "/authenticated/notificacoes"
  | "/authenticated/documentos/central"
  | "/authenticated/trilha-de-auditoria";

export interface OperationalReadinessTableState {
  available: boolean | null;
  rls_enabled: boolean | null;
  policy_count: number | null;
}

export interface OperationalReadinessBackendReport {
  version: string;
  generated_at: string;
  org_id: string | null;
  actor_role: string | null;
  cycles: Record<string, boolean | null>;
  tables: Record<string, OperationalReadinessTableState>;
  functions: Record<string, boolean | null>;
  configuration: Record<string, number | boolean | string | null>;
  security: Record<string, boolean | null>;
}

export interface ReadinessCheck {
  id: string;
  section: OperationalReadinessSectionId;
  goLiveSection: GoLiveSectionId;
  title: string;
  description: string;
  status: ReadinessStatus;
  severity: ReadinessSeverity;
  evidence?: string;
  actionLabel?: string;
  actionRoute?: OperationalReadinessRoute;
}

export interface ReadinessSection {
  id: OperationalReadinessSectionId;
  title: string;
  description: string;
  status: ReadinessStatus;
  checks: ReadinessCheck[];
}

export interface GoLiveSection {
  id: GoLiveSectionId;
  title: string;
  checks: ReadinessCheck[];
}

export interface OperationalReadinessView {
  overallStatus: ReadinessOverallStatus;
  score: number;
  readyCount: number;
  totalCount: number;
  blockingCount: number;
  attentionCount: number;
  generatedAt: string | null;
  source: ReadinessReportSource;
  sections: ReadinessSection[];
  goLiveSections: GoLiveSection[];
  checks: ReadinessCheck[];
}

const SECTION_CONTENT: Record<
  OperationalReadinessSectionId,
  { title: string; description: string }
> = {
  foundation: {
    title: "Schema e ciclos",
    description:
      "Dependências de execução, calendário, disponibilidade e notificações.",
  },
  notifications: {
    title: "Notificações",
    description:
      "Inbox, preferências, eventos, escalonamento e outbox passiva.",
  },
  delegation: {
    title: "Delegação auditável",
    description:
      "Substituição explícita, limitada e registrada sem reatribuição.",
  },
  calendar: {
    title: "Calendário e SLA",
    description: "Calendário padrão, timezone, feriados e políticas de prazo.",
  },
  security: {
    title: "Segurança",
    description:
      "RLS, escrita por RPC e garantias contra automação silenciosa.",
  },
  pilot: {
    title: "Prontidão de piloto",
    description:
      "Configuração mínima e testes que comprovam o fluxo operacional.",
  },
};

const GO_LIVE_TITLES: Record<GoLiveSectionId, string> = {
  foundation: "1. Fundação",
  documents: "2. Documentos e regras",
  tramites: "3. Trâmites",
  calendar: "4. Calendário e SLA",
  availability: "5. Ausências e substituições",
  notifications: "6. Notificações e escalonamento",
  audit: "7. Auditoria",
  security: "8. Segurança",
  training: "9. Treinamento",
  pilot: "10. Piloto",
};

const STATUS_WEIGHT: Record<ReadinessStatus, number> = {
  ok: 100,
  fallback: 70,
  attention: 55,
  not_configured: 40,
  absent: 0,
  not_installed: 0,
  read_error: 0,
};

const STATUS_RANK: Record<ReadinessStatus, number> = {
  ok: 0,
  fallback: 1,
  attention: 2,
  not_configured: 3,
  absent: 4,
  not_installed: 5,
  read_error: 6,
};

const BLOCKING_STATUSES = new Set<ReadinessStatus>([
  "absent",
  "not_installed",
  "read_error",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeTable(value: unknown): OperationalReadinessTableState {
  const row = record(value);
  return {
    available: nullableBoolean(row.available),
    rls_enabled: nullableBoolean(row.rls_enabled),
    policy_count: nullableNumber(row.policy_count),
  };
}

export function normalizeOperationalReadinessReport(
  value: unknown,
): OperationalReadinessBackendReport | null {
  const row = record(value);
  const cyclesRow = record(row.cycles);
  const tablesRow = record(row.tables);
  const functionsRow = record(row.functions);
  const configurationRow = record(row.configuration);
  const securityRow = record(row.security);
  if (typeof row.version !== "string" || typeof row.generated_at !== "string") {
    return null;
  }

  return {
    version: row.version,
    generated_at: row.generated_at,
    org_id: typeof row.org_id === "string" ? row.org_id : null,
    actor_role: typeof row.actor_role === "string" ? row.actor_role : null,
    cycles: Object.fromEntries(
      Object.entries(cyclesRow).map(([key, item]) => [
        key,
        nullableBoolean(item),
      ]),
    ),
    tables: Object.fromEntries(
      Object.entries(tablesRow).map(([key, item]) => [
        key,
        normalizeTable(item),
      ]),
    ),
    functions: Object.fromEntries(
      Object.entries(functionsRow).map(([key, item]) => [
        key,
        nullableBoolean(item),
      ]),
    ),
    configuration: Object.fromEntries(
      Object.entries(configurationRow).map(([key, item]) => [
        key,
        typeof item === "number" ||
        typeof item === "boolean" ||
        typeof item === "string"
          ? item
          : null,
      ]),
    ),
    security: Object.fromEntries(
      Object.entries(securityRow).map(([key, item]) => [
        key,
        nullableBoolean(item),
      ]),
    ),
  };
}

function cycle(report: OperationalReadinessBackendReport, key: string) {
  return report.cycles[key] ?? null;
}

function table(report: OperationalReadinessBackendReport, key: string) {
  return (
    report.tables[key] ?? {
      available: null,
      rls_enabled: null,
      policy_count: null,
    }
  );
}

function rpc(report: OperationalReadinessBackendReport, key: string) {
  return report.functions[key] ?? null;
}

function metric(report: OperationalReadinessBackendReport, key: string) {
  return nullableNumber(report.configuration[key]);
}

function configurationBoolean(
  report: OperationalReadinessBackendReport,
  key: string,
) {
  return nullableBoolean(report.configuration[key]);
}

function security(report: OperationalReadinessBackendReport, key: string) {
  return report.security[key] ?? null;
}

function installationStatus(
  value: boolean | null,
  source: ReadinessReportSource,
): ReadinessStatus {
  if (value === true) return "ok";
  if (value === false) return "not_installed";
  return source === "frontend_fallback" ? "fallback" : "read_error";
}

function availabilityStatus(
  value: boolean | null,
  installed: boolean | null,
  source: ReadinessReportSource,
): ReadinessStatus {
  if (installed === false) return "not_installed";
  if (value === true) return "ok";
  if (value === false) return "absent";
  return source === "frontend_fallback" ? "fallback" : "read_error";
}

function configuredStatus(
  value: number | null,
  installed: boolean | null,
  source: ReadinessReportSource,
): ReadinessStatus {
  if (installed === false) return "not_installed";
  if (value === null) {
    return source === "frontend_fallback" ? "fallback" : "read_error";
  }
  return value > 0 ? "ok" : "not_configured";
}

function check(
  input: Omit<ReadinessCheck, "status"> & { status: ReadinessStatus },
) {
  return input;
}

function countEvidence(value: number | null, unit: string) {
  return value === null ? "Contagem indisponível." : `${value} ${unit}.`;
}

function worstStatus(checks: ReadinessCheck[]) {
  return checks.reduce<ReadinessStatus>(
    (worst, item) =>
      STATUS_RANK[item.status] > STATUS_RANK[worst] ? item.status : worst,
    "ok",
  );
}

export function buildOperationalReadiness(
  report: OperationalReadinessBackendReport,
  source: ReadinessReportSource,
): OperationalReadinessView {
  const cycle18 = cycle(report, "cycle_18_execution");
  const cycle21 = cycle(report, "cycle_21_calendar");
  const cycle22 = cycle(report, "cycle_22_availability");
  const cycle23 = cycle(report, "cycle_23_notifications");
  const notificationTables = [
    "internal_notifications",
    "notification_preferences",
    "notification_events",
    "notification_escalation_rules",
    "notification_delivery_outbox",
  ];
  const notificationFunctions = [
    "create_internal_notification",
    "mark_notification_read",
    "dismiss_notification",
    "generate_operational_notifications",
  ];
  const allNotificationTables = notificationTables.every(
    (name) => table(report, name).available === true,
  );
  const unknownNotificationTables = notificationTables.some(
    (name) => table(report, name).available === null,
  );
  const allNotificationFunctions = notificationFunctions.every(
    (name) => rpc(report, name) === true,
  );
  const unknownNotificationFunctions = notificationFunctions.some(
    (name) => rpc(report, name) === null,
  );
  const defaultCalendars = metric(report, "default_calendars");
  const holidays = metric(report, "holidays");
  const activeSlaPolicies = metric(report, "active_sla_policies");
  const activeEscalationRules = metric(report, "active_escalation_rules");
  const notificationEvents = metric(report, "notification_events");
  const notificationCreatedEvents = metric(
    report,
    "notification_created_events",
  );
  const notificationReadEvents = metric(report, "notification_read_events");
  const notificationDismissedEvents = metric(
    report,
    "notification_dismissed_events",
  );
  const notificationSuppressedEvents = metric(
    report,
    "notification_suppressed_events",
  );
  const escalationEvents = metric(report, "escalation_events");
  const delegatedEvents = metric(report, "delegated_step_events");
  const completedStepEvents = metric(report, "completed_step_events");
  const originalActorCompletions =
    completedStepEvents === null
      ? null
      : Math.max(completedStepEvents - (delegatedEvents ?? 0), 0);
  const specificUserSteps = metric(report, "specific_user_steps");
  const absenceCount = metric(report, "active_or_scheduled_absences");
  const delegationCount = metric(report, "active_delegations");
  const documentConfigurations =
    (metric(report, "document_templates") ?? 0) +
    (metric(report, "document_rules") ?? 0);
  const defaultEscalation = security(report, "default_escalation_available");

  const checks: ReadinessCheck[] = [
    check({
      id: "cycle-18",
      section: "foundation",
      goLiveSection: "foundation",
      title: "Ciclo 18 — execução de trâmites",
      description:
        "Instâncias, etapas e conclusão segura precisam estar disponíveis.",
      status: installationStatus(cycle18, source),
      severity: "critical",
      actionLabel: "Abrir trâmites",
      actionRoute: "/authenticated/documentos/tramites",
    }),
    check({
      id: "cycle-21",
      section: "foundation",
      goLiveSection: "foundation",
      title: "Ciclo 21 — calendário e SLA",
      description:
        "Fornece dias úteis, feriados e políticas operacionais de prazo.",
      status: installationStatus(cycle21, source),
      severity: "critical",
      actionLabel: "Abrir Calendário e SLA",
      actionRoute: "/authenticated/configuracoes/calendario",
    }),
    check({
      id: "cycle-22",
      section: "foundation",
      goLiveSection: "foundation",
      title: "Ciclo 22 — disponibilidade da equipe",
      description:
        "Ausências e delegações são pré-requisito da ação substituta.",
      status: installationStatus(cycle22, source),
      severity: "critical",
      actionLabel: "Abrir Equipe",
      actionRoute: "/authenticated/equipe",
    }),
    check({
      id: "cycle-23",
      section: "foundation",
      goLiveSection: "foundation",
      title: "Ciclo 23 — notificações e escalonamento",
      description:
        "Habilita inbox enterprise, eventos, escalonamento e delegação auditável.",
      status: installationStatus(cycle23, source),
      severity: "critical",
      actionLabel: "Abrir Notificações",
      actionRoute: "/authenticated/notificacoes",
    }),
    check({
      id: "organization-security-foundation",
      section: "foundation",
      goLiveSection: "foundation",
      title: "Identidade e organização",
      description:
        "profiles, organizations, current_user_org_id e is_org_role sustentam o isolamento.",
      status:
        table(report, "profiles").available === true &&
        table(report, "organizations").available === true &&
        rpc(report, "current_user_org_id") === true &&
        rpc(report, "is_org_role") === true
          ? "ok"
          : source === "frontend_fallback"
            ? "fallback"
            : "absent",
      severity: "critical",
      actionLabel: "Abrir Schema Doctor",
      actionRoute: "/authenticated/schema-doctor",
    }),
    check({
      id: "readiness-rpc",
      section: "foundation",
      goLiveSection: "foundation",
      title: "Health check operacional",
      description:
        "A RPC read-only diferencia instalação, configuração e proteção por RLS.",
      status:
        security(report, "readiness_rpc_read_error") === true
          ? "read_error"
          : source === "database" &&
              rpc(report, "get_operational_readiness") === true
            ? "ok"
            : "fallback",
      severity: "warning",
      evidence:
        source === "database"
          ? "Relatório confirmado pelo banco."
          : "Diagnóstico parcial usando consultas frontend seguras.",
      actionLabel: "Comparar com Schema Doctor",
      actionRoute: "/authenticated/schema-doctor",
    }),
    check({
      id: "readiness-sources",
      section: "foundation",
      goLiveSection: "foundation",
      title: "Leitura das fontes operacionais",
      description:
        "O diagnóstico precisa distinguir fonte vazia de erro de permissão ou contrato.",
      status:
        security(report, "frontend_probe_read_error") === true
          ? "read_error"
          : source === "database"
            ? "ok"
            : "fallback",
      severity: "critical",
      evidence:
        source === "database"
          ? "Contagens executadas no banco para a organização autenticada."
          : "Consultas frontend limitadas; confirmação de catálogo indisponível.",
      actionLabel: "Abrir Schema Doctor",
      actionRoute: "/authenticated/schema-doctor",
    }),
    check({
      id: "notification-tables",
      section: "notifications",
      goLiveSection: "notifications",
      title: "Tabelas enterprise de notificações",
      description:
        "Inbox, preferências, eventos, regras e outbox devem existir em conjunto.",
      status:
        cycle23 === false
          ? "not_installed"
          : allNotificationTables
            ? "ok"
            : unknownNotificationTables && source === "frontend_fallback"
              ? "fallback"
              : "absent",
      severity: "critical",
      evidence: `${notificationTables.filter((name) => table(report, name).available === true).length}/${notificationTables.length} tabelas detectadas.`,
      actionLabel: "Abrir Notificações",
      actionRoute: "/authenticated/notificacoes",
    }),
    check({
      id: "notification-rpcs",
      section: "notifications",
      goLiveSection: "notifications",
      title: "RPCs de notificação",
      description:
        "Criação, leitura, dispensa e geração operacional passam por funções controladas.",
      status:
        cycle23 === false
          ? "not_installed"
          : allNotificationFunctions
            ? "ok"
            : unknownNotificationFunctions && source === "frontend_fallback"
              ? "fallback"
              : "absent",
      severity: "critical",
      evidence: `${notificationFunctions.filter((name) => rpc(report, name) === true).length}/${notificationFunctions.length} RPCs confirmadas.`,
    }),
    check({
      id: "inbox-query",
      section: "notifications",
      goLiveSection: "notifications",
      title: "Consulta da inbox",
      description:
        "A contagem de não lidas deve funcionar sem expor notificações de outra pessoa.",
      status:
        cycle23 === false
          ? source === "frontend_fallback"
            ? "fallback"
            : "not_installed"
          : metric(report, "unread_notifications") !== null
            ? "ok"
            : "read_error",
      severity: "critical",
      evidence: countEvidence(
        metric(report, "unread_notifications"),
        "não lida(s) na organização",
      ),
      actionLabel: "Ver inbox",
      actionRoute: "/authenticated/notificacoes",
    }),
    check({
      id: "notification-events",
      section: "notifications",
      goLiveSection: "audit",
      title: "Eventos append-only",
      description:
        "Criação, leitura, dispensa, supressão e escalonamento precisam deixar evento.",
      status: configuredStatus(notificationEvents, cycle23, source),
      severity: "warning",
      evidence:
        notificationCreatedEvents === null
          ? countEvidence(notificationEvents, "evento(s) registrado(s)")
          : `${notificationCreatedEvents} criada(s), ${notificationReadEvents ?? 0} lida(s), ${notificationDismissedEvents ?? 0} dispensada(s), ${notificationSuppressedEvents ?? 0} suprimida(s) e ${escalationEvents ?? 0} escalonada(s).`,
      actionLabel: "Executar teste da inbox",
      actionRoute: "/authenticated/notificacoes",
    }),
    check({
      id: "escalation-rules",
      section: "notifications",
      goLiveSection: "notifications",
      title: "Regra de escalonamento ou fallback padrão",
      description:
        "Sem regra configurada, o gerador mantém escalonamento padrão para gestores.",
      status:
        activeEscalationRules !== null && activeEscalationRules > 0
          ? "ok"
          : defaultEscalation === true
            ? "fallback"
            : configuredStatus(activeEscalationRules, cycle23, source),
      severity: "warning",
      evidence:
        activeEscalationRules !== null && activeEscalationRules > 0
          ? countEvidence(activeEscalationRules, "regra(s) ativa(s)")
          : "Fallback padrão não reatribui etapas; apenas notifica gestores.",
      actionLabel: "Gerar alertas de teste",
      actionRoute: "/authenticated/notificacoes",
    }),
    check({
      id: "outbox-passive",
      section: "notifications",
      goLiveSection: "notifications",
      title: "Outbox passiva",
      description:
        "Registros podem ser preparados para fase futura, sem worker ou envio real.",
      status: availabilityStatus(
        table(report, "notification_delivery_outbox").available,
        cycle23,
        source,
      ),
      severity: "warning",
      evidence: countEvidence(
        metric(report, "pending_email_outbox"),
        "registro(s) pendente(s), sem entrega",
      ),
    }),
    check({
      id: "real-email-disabled",
      section: "notifications",
      goLiveSection: "security",
      title: "Envio externo desativado",
      description:
        "O ciclo 23 não possui worker, cron, WhatsApp, SMS ou chamada de e-mail.",
      status:
        security(report, "external_email_delivery_enabled") === false
          ? "ok"
          : source === "frontend_fallback"
            ? "fallback"
            : "attention",
      severity: "critical",
      evidence: "Outbox é somente preparação; nenhuma entrega é executada.",
    }),
    check({
      id: "substitute-resolver",
      section: "delegation",
      goLiveSection: "availability",
      title: "Resolução de substituto",
      description:
        "A disponibilidade e o substituto precisam ser resolvidos no banco.",
      status:
        rpc(report, "is_user_unavailable") === true &&
        rpc(report, "resolve_user_substitute") === true
          ? "ok"
          : cycle22 === false
            ? "not_installed"
            : source === "frontend_fallback"
              ? "fallback"
              : "absent",
      severity: "critical",
      actionLabel: "Configurar equipe",
      actionRoute: "/authenticated/equipe",
    }),
    check({
      id: "effective-actor",
      section: "delegation",
      goLiveSection: "tramites",
      title: "Ator efetivo do trâmite",
      description:
        "A autorização delegada deve ser confirmada por resolve_effective_tramite_actor.",
      status: availabilityStatus(
        rpc(report, "resolve_effective_tramite_actor"),
        cycle23,
        source,
      ),
      severity: "critical",
    }),
    check({
      id: "delegated-completion",
      section: "delegation",
      goLiveSection: "audit",
      title: "Conclusão delegada auditável",
      description:
        "A função de conclusão registra o ator real e mantém o titular persistido.",
      status:
        security(report, "delegated_completion_contract") === true
          ? "ok"
          : cycle23 === false
            ? "not_installed"
            : source === "frontend_fallback"
              ? "fallback"
              : "absent",
      severity: "critical",
      evidence:
        "Contrato esperado: completed_by = substituto e assignee_user_id = titular.",
      actionLabel: "Abrir Central",
      actionRoute: "/authenticated/documentos/central",
    }),
    check({
      id: "specific-user-boundary",
      section: "delegation",
      goLiveSection: "security",
      title: "Delegação limitada a specific_user",
      description:
        "Grupos, papéis e etapas sem titular específico não recebem delegação automática.",
      status:
        security(report, "delegation_specific_user_only") === true
          ? "ok"
          : source === "frontend_fallback"
            ? "fallback"
            : "attention",
      severity: "critical",
    }),
    check({
      id: "delegated-evidence-disabled",
      section: "delegation",
      goLiveSection: "security",
      title: "Evidência delegada não liberada",
      description:
        "A P-25 delega somente a conclusão; upload de evidência mantém autorização original.",
      status:
        security(report, "delegated_evidence_enabled") === false
          ? "ok"
          : source === "frontend_fallback"
            ? "fallback"
            : "attention",
      severity: "warning",
    }),
    check({
      id: "specific-user-test-step",
      section: "delegation",
      goLiveSection: "training",
      title: "Etapa specific_user para teste",
      description:
        "O roteiro de delegação exige uma etapa atribuída a um titular específico.",
      status: configuredStatus(specificUserSteps, cycle18, source),
      severity: "warning",
      evidence: countEvidence(specificUserSteps, "etapa(s) encontrada(s)"),
      actionLabel: "Abrir trâmites",
      actionRoute: "/authenticated/documentos/tramites",
    }),
    check({
      id: "delegated-event-test",
      section: "delegation",
      goLiveSection: "audit",
      title: "Evento delegado comprovado",
      description:
        "Um teste de piloto deve gerar step_completed com delegated_from_user_id.",
      status: configuredStatus(delegatedEvents, cycle23, source),
      severity: "warning",
      evidence: countEvidence(delegatedEvents, "conclusão(ões) delegada(s)"),
      actionLabel: "Ver trilha de auditoria",
      actionRoute: "/authenticated/trilha-de-auditoria",
    }),
    check({
      id: "original-actor-completion-test",
      section: "delegation",
      goLiveSection: "training",
      title: "Conclusão como titular",
      description:
        "Antes do teste delegado, confirme o fluxo normal com o responsável original.",
      status: configuredStatus(originalActorCompletions, cycle18, source),
      severity: "warning",
      evidence: countEvidence(
        originalActorCompletions,
        "conclusão(ões) sem delegação detectada(s)",
      ),
      actionLabel: "Abrir Central",
      actionRoute: "/authenticated/documentos/central",
    }),
    check({
      id: "default-calendar",
      section: "calendar",
      goLiveSection: "calendar",
      title: "Calendário padrão",
      description:
        "A organização precisa de referência única para dias úteis e prazos.",
      status: configuredStatus(defaultCalendars, cycle21, source),
      severity: "critical",
      evidence: countEvidence(defaultCalendars, "calendário(s) padrão"),
      actionLabel: "Configurar calendário",
      actionRoute: "/authenticated/configuracoes/calendario",
    }),
    check({
      id: "valid-timezone",
      section: "calendar",
      goLiveSection: "calendar",
      title: "Timezone IANA válido",
      description:
        "O calendário padrão deve usar um fuso reconhecido pelo banco.",
      status:
        defaultCalendars === 0
          ? "not_configured"
          : configurationBoolean(report, "default_calendar_timezone_valid") ===
              true
            ? "ok"
            : source === "frontend_fallback"
              ? "fallback"
              : "attention",
      severity: "critical",
      actionLabel: "Revisar timezone",
      actionRoute: "/authenticated/configuracoes/calendario",
    }),
    check({
      id: "holidays",
      section: "calendar",
      goLiveSection: "calendar",
      title: "Feriados cadastrados ou importados",
      description: "O calendário de piloto deve refletir feriados da operação.",
      status: configuredStatus(holidays, cycle21, source),
      severity: "warning",
      evidence: countEvidence(holidays, "feriado(s)"),
      actionLabel: "Importar feriados",
      actionRoute: "/authenticated/configuracoes/calendario",
    }),
    check({
      id: "sla-policies",
      section: "calendar",
      goLiveSection: "calendar",
      title: "Políticas SLA ativas",
      description:
        "Configure ao menos uma política de revisão ou prazo de etapa.",
      status: configuredStatus(activeSlaPolicies, cycle21, source),
      severity: "critical",
      evidence: countEvidence(activeSlaPolicies, "política(s) ativa(s)"),
      actionLabel: "Configurar SLA",
      actionRoute: "/authenticated/configuracoes/calendario",
    }),
    check({
      id: "notification-rls",
      section: "security",
      goLiveSection: "security",
      title: "RLS das notificações",
      description:
        "As cinco tabelas enterprise precisam de RLS e policies explícitas.",
      status:
        security(report, "notification_rls_ready") === true
          ? "ok"
          : source === "frontend_fallback"
            ? "fallback"
            : "absent",
      severity: "critical",
      evidence:
        source === "database"
          ? "RLS verificada diretamente no catálogo PostgreSQL."
          : "Verificação definitiva depende do ciclo 24.",
      actionLabel: "Abrir Schema Doctor",
      actionRoute: "/authenticated/schema-doctor",
    }),
    check({
      id: "operational-rls",
      section: "security",
      goLiveSection: "security",
      title: "RLS das dependências operacionais",
      description:
        "Execução, calendário, SLA, ausências e delegações precisam de RLS e policies.",
      status:
        security(report, "operational_rls_ready") === true
          ? "ok"
          : source === "frontend_fallback"
            ? "fallback"
            : "absent",
      severity: "critical",
      evidence:
        source === "database"
          ? "RLS e presença de policies verificadas no catálogo."
          : "O fallback não possui acesso confiável ao catálogo de policies.",
      actionLabel: "Abrir Schema Doctor",
      actionRoute: "/authenticated/schema-doctor",
    }),
    check({
      id: "notification-write-boundary",
      section: "security",
      goLiveSection: "security",
      title: "Mutações sensíveis via RPC",
      description:
        "Authenticated não deve inserir diretamente notificações ou eventos.",
      status:
        security(report, "direct_notification_insert_blocked") === true &&
        security(report, "direct_notification_update_blocked") === true &&
        security(report, "direct_notification_delete_blocked") === true &&
        security(report, "direct_event_insert_blocked") === true &&
        security(report, "direct_event_update_blocked") === true &&
        security(report, "direct_event_delete_blocked") === true
          ? "ok"
          : source === "frontend_fallback"
            ? "fallback"
            : "absent",
      severity: "critical",
    }),
    check({
      id: "approval-flow-boundary",
      section: "security",
      goLiveSection: "security",
      title: "approval_flows fora das mutações P-25",
      description:
        "O diagnóstico e o gerador podem ler compatibilidade, mas não escrevem no workflow legado.",
      status:
        security(report, "approval_flows_write_enabled") === false
          ? "ok"
          : source === "frontend_fallback"
            ? "fallback"
            : "attention",
      severity: "critical",
    }),
    check({
      id: "central-no-inline",
      section: "security",
      goLiveSection: "security",
      title: "Central sem conclusão inline",
      description:
        "A Central continua cockpit e navegação; a execução acontece no detalhe.",
      status:
        security(report, "work_center_inline_completion_enabled") === false
          ? "ok"
          : source === "frontend_fallback"
            ? "fallback"
            : "attention",
      severity: "warning",
      actionLabel: "Abrir Central",
      actionRoute: "/authenticated/documentos/central",
    }),
    check({
      id: "projects-configured",
      section: "pilot",
      goLiveSection: "documents",
      title: "Projeto operacional",
      description:
        "Cadastre ao menos um projeto, obra ou contrato para o piloto.",
      status: configuredStatus(
        metric(report, "projects"),
        table(report, "projects").available,
        source,
      ),
      severity: "warning",
      evidence: countEvidence(metric(report, "projects"), "projeto(s)"),
      actionLabel: "Abrir Projetos",
      actionRoute: "/authenticated/projetos",
    }),
    check({
      id: "document-policies-configured",
      section: "pilot",
      goLiveSection: "documents",
      title: "Templates ou regras documentais",
      description:
        "O piloto precisa de pelo menos uma política de criação aplicável.",
      status:
        metric(report, "document_templates") === null &&
        metric(report, "document_rules") === null
          ? source === "frontend_fallback"
            ? "fallback"
            : "not_installed"
          : documentConfigurations > 0
            ? "ok"
            : "not_configured",
      severity: "warning",
      evidence: `${documentConfigurations} configuração(ões) ativa(s).`,
      actionLabel: "Abrir Regras Documentais",
      actionRoute: "/authenticated/documentos/regras",
    }),
    check({
      id: "published-tramite",
      section: "pilot",
      goLiveSection: "tramites",
      title: "Modelo de trâmite publicado",
      description:
        "Publique ao menos um modelo antes de testar execução e delegação.",
      status: configuredStatus(
        metric(report, "published_tramite_templates"),
        table(report, "document_tramite_templates").available,
        source,
      ),
      severity: "critical",
      evidence: countEvidence(
        metric(report, "published_tramite_templates"),
        "modelo(s) publicado(s)",
      ),
      actionLabel: "Abrir modelador",
      actionRoute: "/authenticated/documentos/tramites",
    }),
    check({
      id: "availability-test-data",
      section: "pilot",
      goLiveSection: "availability",
      title: "Ausência ou delegação de teste",
      description:
        "Configure titular e substituto para comprovar o contrato antes do go-live.",
      status:
        absenceCount === null && delegationCount === null
          ? source === "frontend_fallback"
            ? "fallback"
            : "not_installed"
          : (absenceCount ?? 0) + (delegationCount ?? 0) > 0
            ? "ok"
            : "not_configured",
      severity: "warning",
      evidence: `${absenceCount ?? 0} ausência(s) e ${delegationCount ?? 0} delegação(ões) ativas/futuras.`,
      actionLabel: "Configurar Equipe",
      actionRoute: "/authenticated/equipe",
    }),
    check({
      id: "generation-test",
      section: "pilot",
      goLiveSection: "pilot",
      title: "Geração operacional testada",
      description:
        "Execute a geração on-demand e confira created, skipped, suppressed e errors.",
      status: configuredStatus(notificationEvents, cycle23, source),
      severity: "warning",
      evidence: countEvidence(notificationEvents, "evento(s) disponível(is)"),
      actionLabel: "Executar geração",
      actionRoute: "/authenticated/notificacoes",
    }),
    check({
      id: "delegation-guided-test",
      section: "pilot",
      goLiveSection: "training",
      title: "Roteiro titular/substituto",
      description:
        "Execute o teste guiado e confirme ator real, titular persistido e metadata delegada.",
      status:
        delegatedEvents !== null && delegatedEvents > 0 ? "ok" : "attention",
      severity: "warning",
      evidence:
        delegatedEvents !== null && delegatedEvents > 0
          ? "Há conclusão delegada registrada."
          : "Teste manual ainda precisa ser comprovado.",
      actionLabel: "Abrir Central",
      actionRoute: "/authenticated/documentos/central",
    }),
  ];

  const sections = (
    Object.keys(SECTION_CONTENT) as OperationalReadinessSectionId[]
  ).map((id) => {
    const sectionChecks = checks.filter((item) => item.section === id);
    return {
      id,
      ...SECTION_CONTENT[id],
      status: worstStatus(sectionChecks),
      checks: sectionChecks,
    };
  });
  const goLiveSections = (Object.keys(GO_LIVE_TITLES) as GoLiveSectionId[])
    .map((id) => ({
      id,
      title: GO_LIVE_TITLES[id],
      checks: checks.filter((item) => item.goLiveSection === id),
    }))
    .filter((item) => item.checks.length > 0);
  const totalWeight = checks.reduce(
    (sum, item) => sum + STATUS_WEIGHT[item.status],
    0,
  );
  const blockingCount = checks.filter(
    (item) =>
      item.severity === "critical" && BLOCKING_STATUSES.has(item.status),
  ).length;
  const attentionCount = checks.filter(
    (item) => !["ok"].includes(item.status),
  ).length;

  return {
    overallStatus:
      blockingCount > 0
        ? "blocked"
        : attentionCount > 0
          ? "attention"
          : "ready",
    score: Math.round(totalWeight / Math.max(checks.length, 1)),
    readyCount: checks.filter((item) => item.status === "ok").length,
    totalCount: checks.length,
    blockingCount,
    attentionCount,
    generatedAt: report.generated_at,
    source,
    sections,
    goLiveSections,
    checks,
  };
}

export function getReadinessStatusLabel(status: ReadinessStatus) {
  const labels: Record<ReadinessStatus, string> = {
    ok: "OK",
    attention: "Atenção",
    absent: "Ausente",
    not_installed: "Não instalado",
    not_configured: "Não configurado",
    read_error: "Erro de leitura",
    fallback: "Somente fallback",
  };
  return labels[status];
}
