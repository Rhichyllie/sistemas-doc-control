export type OperationalHealthStatus = "stable" | "attention" | "critical";

export type OperationalCapabilityStatus =
  | "available"
  | "configure"
  | "not_installed"
  | "attention";

export type OperationalTarget =
  | "/authenticated/documents"
  | "/authenticated/documentos/central"
  | "/authenticated/documentos/codificacao"
  | "/authenticated/documentos/regras"
  | "/authenticated/documentos/tramites"
  | "/authenticated/configuracoes/projetos"
  | "/authenticated/configuracoes/calendario"
  | "/authenticated/equipe"
  | "/authenticated/notificacoes"
  | "/authenticated/indicadores"
  | "/authenticated/fluxo-de-aprovacao";

export interface OperationalHealthCard {
  id:
    | "active_documents"
    | "critical_pending"
    | "active_tramites"
    | "upcoming_reviews"
    | "drafts"
    | "without_next_step";
  label: string;
  value: number;
  description: string;
  status: OperationalHealthStatus;
  target: OperationalTarget;
}

export interface OperationalRisk {
  id: string;
  title: string;
  description: string;
  count: number;
  severity: "critical" | "warning" | "info";
  target: OperationalTarget;
}

export interface OperationalCapability {
  id:
    | "creation"
    | "coding"
    | "projects"
    | "policies"
    | "tramite_modeling"
    | "tramite_execution"
    | "calendar_sla"
    | "team_availability"
    | "notifications"
    | "operational_indicators"
    | "work_center";
  label: string;
  description: string;
  status: OperationalCapabilityStatus;
  target: OperationalTarget;
}

export interface OperationalRecommendation {
  title: string;
  description: string;
  actionLabel: string;
  target: OperationalTarget;
  severity: "critical" | "warning" | "stable";
}

export interface OperationalHomeSummary {
  status: OperationalHealthStatus;
  healthCards: OperationalHealthCard[];
  risks: OperationalRisk[];
  capabilities: OperationalCapability[];
  recommendation: OperationalRecommendation;
  maturityPercent: number;
}

export interface OperationalHomeMetrics {
  activeDocuments: number;
  criticalPending: number;
  activeTramites: number;
  upcomingReviews: number;
  drafts: number;
  withoutNextStep: number;
  overdueReviews: number;
  overdueTramiteSteps: number;
  nearDueTramiteSteps: number;
  documentsWithoutSlaPolicy: number;
  documentsWithoutCode: number;
  legacyCodes: number;
  suggestedNotStarted: number;
  stalledApprovals: number;
  documentsWithoutProject: number;
  codingInstalled: boolean;
  codingAttention: boolean;
  codePatterns: number;
  projectsInstalled: boolean;
  projectsAttention: boolean;
  projects: number;
  policiesInstalled: boolean;
  policiesAttention: boolean;
  policies: number;
  tramiteModelingInstalled: boolean;
  tramiteModelingAttention: boolean;
  publishedTramiteTemplates: number;
  tramiteExecutionInstalled: boolean;
  tramiteExecutionAttention: boolean;
  calendarInstalled: boolean;
  calendarAttention: boolean;
  availabilityInstalled: boolean;
  availabilityAttention: boolean;
  absentWithoutSubstitute: number;
  activeSubstitutions: number;
  deadlinesWithAbsentAssignee: number;
  criticalUnreadNotifications: number;
  openEscalations: number;
  notificationsInstalled: boolean;
  notificationsAttention: boolean;
  indicatorsInstalled: boolean;
  indicatorsAttention: boolean;
  indicatorsHaveData: boolean;
}

export function calculateOperationalHealth(
  metrics: OperationalHomeMetrics,
): OperationalHealthStatus {
  if (
    metrics.criticalPending > 0 ||
    metrics.overdueTramiteSteps > 0 ||
    metrics.overdueReviews > 0 ||
    metrics.criticalUnreadNotifications > 0 ||
    metrics.openEscalations > 0
  ) {
    return "critical";
  }
  if (
    metrics.drafts > 0 ||
    metrics.withoutNextStep > 0 ||
    metrics.documentsWithoutCode > 0
  ) {
    return "attention";
  }
  return "stable";
}

function healthCards(metrics: OperationalHomeMetrics): OperationalHealthCard[] {
  return [
    {
      id: "active_documents",
      label: "Documentos ativos",
      value: metrics.activeDocuments,
      description: "Documentos vigentes ou em elaboração.",
      status: "stable",
      target: "/authenticated/documents",
    },
    {
      id: "critical_pending",
      label: "Pendências críticas",
      value: metrics.criticalPending,
      description: "Itens atrasados que exigem decisão.",
      status: metrics.criticalPending ? "critical" : "stable",
      target: "/authenticated/documentos/central",
    },
    {
      id: "active_tramites",
      label: "Trâmites em andamento",
      value: metrics.activeTramites,
      description: "Execuções documentais ativas.",
      status: metrics.overdueTramiteSteps ? "critical" : "stable",
      target: "/authenticated/documentos/central",
    },
    {
      id: "upcoming_reviews",
      label: "Revisões próximas",
      value: metrics.upcomingReviews,
      description: "Revisões previstas em até 30 dias.",
      status: metrics.overdueReviews ? "critical" : "stable",
      target: "/authenticated/documentos/central",
    },
    {
      id: "drafts",
      label: "Rascunhos aguardando avanço",
      value: metrics.drafts,
      description: "Documentos ainda sem submissão.",
      status: metrics.drafts ? "attention" : "stable",
      target: "/authenticated/documentos/central",
    },
    {
      id: "without_next_step",
      label: "Itens sem próximo passo",
      value: metrics.withoutNextStep,
      description: "Sugestões ou revisões aguardando decisão.",
      status: metrics.withoutNextStep ? "attention" : "stable",
      target: "/authenticated/documentos/central",
    },
  ];
}

function risks(metrics: OperationalHomeMetrics): OperationalRisk[] {
  return [
    {
      id: "critical-notifications",
      title: "Notificações críticas não lidas",
      description: "Alertas internos críticos ainda aguardam leitura.",
      count: metrics.criticalUnreadNotifications,
      severity: "critical" as const,
      target: "/authenticated/notificacoes" as const,
    },
    {
      id: "open-escalations",
      title: "Escalonamentos abertos",
      description: "Escalonamentos operacionais ainda não foram lidos.",
      count: metrics.openEscalations,
      severity: "critical" as const,
      target: "/authenticated/notificacoes" as const,
    },
    {
      id: "overdue-tramite",
      title: "Etapas de trâmite atrasadas",
      description: "Execuções possuem etapas ativas fora do prazo.",
      count: metrics.overdueTramiteSteps,
      severity: "critical" as const,
      target: "/authenticated/documentos/central" as const,
    },
    {
      id: "overdue-review",
      title: "Revisões documentais atrasadas",
      description: "Documentos publicados ultrapassaram a revisão planejada.",
      count: metrics.overdueReviews,
      severity: "critical" as const,
      target: "/authenticated/documentos/central" as const,
    },
    {
      id: "near-due-tramite",
      title: "Etapas próximas do vencimento",
      description:
        "Etapas ativas estão dentro da janela de alerta da operação.",
      count: metrics.nearDueTramiteSteps,
      severity: "warning" as const,
      target: "/authenticated/documentos/central" as const,
    },
    {
      id: "absent-assignee-deadline",
      title: "Prazo com responsável ausente",
      description:
        "Etapas com prazo possuem responsável temporariamente indisponível.",
      count: metrics.deadlinesWithAbsentAssignee,
      severity: "critical" as const,
      target: "/authenticated/documentos/central" as const,
    },
    {
      id: "absence-without-substitute",
      title: "Ausências sem substituto",
      description:
        "Pessoas indisponíveis não possuem substituto válido configurado.",
      count: metrics.absentWithoutSubstitute,
      severity: "warning" as const,
      target: "/authenticated/equipe" as const,
    },
    {
      id: "sla-policy-gap",
      title: "Documentos sem política de revisão",
      description:
        "Documentos publicados não encontram política SLA aplicável.",
      count: metrics.documentsWithoutSlaPolicy,
      severity: "info" as const,
      target: "/authenticated/configuracoes/calendario" as const,
    },
    {
      id: "stalled-approvals",
      title: "Aprovações formais paradas",
      description: "Etapas de aprovação estão vencidas.",
      count: metrics.stalledApprovals,
      severity: "critical" as const,
      target: "/authenticated/fluxo-de-aprovacao" as const,
    },
    {
      id: "coding-attention",
      title: "Codificação precisa de atenção",
      description: "Documentos estão sem código ou ainda usam modo legado.",
      count: metrics.documentsWithoutCode + metrics.legacyCodes,
      severity: "warning" as const,
      target: "/authenticated/documentos/codificacao" as const,
    },
    {
      id: "suggested-tramite",
      title: "Trâmites sugeridos não iniciados",
      description: "Há documentos com modelo aplicável aguardando decisão.",
      count: metrics.suggestedNotStarted,
      severity: "warning" as const,
      target: "/authenticated/documentos/central" as const,
    },
  ]
    .filter((risk) => risk.count > 0)
    .sort((left, right) => {
      const severity = { critical: 0, warning: 1, info: 2 };
      return (
        severity[left.severity] - severity[right.severity] ||
        right.count - left.count
      );
    })
    .slice(0, 5);
}

function capabilities(
  metrics: OperationalHomeMetrics,
): OperationalCapability[] {
  return [
    {
      id: "creation",
      label: "Criação documental",
      description: "Criação comum e inteligente disponíveis.",
      status: "available",
      target: "/authenticated/documents",
    },
    {
      id: "coding",
      label: "Codificação",
      description: metrics.codingInstalled
        ? metrics.codePatterns
          ? `${metrics.codePatterns} padrão(ões) ativo(s).`
          : "Motor instalado; crie o primeiro padrão."
        : "Ciclos de codificação ainda não instalados.",
      status: !metrics.codingInstalled
        ? metrics.codingAttention
          ? "attention"
          : "not_installed"
        : metrics.codePatterns
          ? "available"
          : "configure",
      target: "/authenticated/documentos/codificacao",
    },
    {
      id: "projects",
      label: "Projetos e contexto",
      description: metrics.projectsInstalled
        ? metrics.projects
          ? `${metrics.projects} contexto(s) selecionável(is).`
          : "Catálogo disponível; cadastre um contexto."
        : "Projetos indisponíveis neste ambiente.",
      status: !metrics.projectsInstalled
        ? metrics.projectsAttention
          ? "attention"
          : "not_installed"
        : metrics.projects
          ? "available"
          : "configure",
      target: "/authenticated/configuracoes/projetos",
    },
    {
      id: "policies",
      label: "Regras e políticas",
      description: metrics.policiesInstalled
        ? metrics.policies
          ? `${metrics.policies} configuração(ões) ativa(s).`
          : "Governança instalada; configure uma política."
        : "Ciclo de regras documentais não instalado.",
      status: !metrics.policiesInstalled
        ? metrics.policiesAttention
          ? "attention"
          : "not_installed"
        : metrics.policies
          ? "available"
          : "configure",
      target: "/authenticated/documentos/regras",
    },
    {
      id: "tramite_modeling",
      label: "Trâmites modelados",
      description: metrics.tramiteModelingInstalled
        ? metrics.publishedTramiteTemplates
          ? `${metrics.publishedTramiteTemplates} modelo(s) publicado(s).`
          : "Modelador instalado; publique um modelo."
        : "Modelador de trâmites não instalado.",
      status: !metrics.tramiteModelingInstalled
        ? metrics.tramiteModelingAttention
          ? "attention"
          : "not_installed"
        : metrics.publishedTramiteTemplates
          ? "available"
          : "configure",
      target: "/authenticated/documentos/tramites",
    },
    {
      id: "tramite_execution",
      label: "Execução de trâmites",
      description: metrics.tramiteExecutionInstalled
        ? `${metrics.activeTramites} execução(ões) ativa(s).`
        : "Execução de trâmites ainda não instalada.",
      status: metrics.tramiteExecutionInstalled
        ? "available"
        : metrics.tramiteExecutionAttention
          ? "attention"
          : "not_installed",
      target: "/authenticated/documentos/central",
    },
    {
      id: "calendar_sla",
      label: "Calendário e SLA",
      description: metrics.calendarInstalled
        ? "Dias úteis, feriados e políticas de prazo disponíveis."
        : "Calendário operacional ainda não instalado.",
      status: metrics.calendarInstalled
        ? "available"
        : metrics.calendarAttention
          ? "attention"
          : "not_installed",
      target: "/authenticated/configuracoes/calendario",
    },
    {
      id: "team_availability",
      label: "Disponibilidade da equipe",
      description: metrics.availabilityInstalled
        ? `${metrics.activeSubstitutions} substituição(ões) ativa(s).`
        : "Ausências e substituições ainda não instaladas.",
      status: metrics.availabilityInstalled
        ? metrics.absentWithoutSubstitute
          ? "attention"
          : "available"
        : metrics.availabilityAttention
          ? "attention"
          : "not_installed",
      target: "/authenticated/equipe",
    },
    {
      id: "notifications",
      label: "Notificações e escalonamento",
      description: metrics.notificationsInstalled
        ? `${metrics.criticalUnreadNotifications} crítica(s) não lida(s).`
        : "Ciclo de notificações ainda não instalado.",
      status: metrics.notificationsInstalled
        ? metrics.criticalUnreadNotifications || metrics.openEscalations
          ? "attention"
          : "available"
        : metrics.notificationsAttention
          ? "attention"
          : "not_installed",
      target: "/authenticated/notificacoes",
    },
    {
      id: "operational_indicators",
      label: "Indicadores Operacionais",
      description: metrics.indicatorsInstalled
        ? metrics.indicatorsHaveData
          ? "Análise de SLA e gargalos disponível."
          : "Camada instalada; ainda sem dados no recorte."
        : "Ciclo analítico 25 ainda não instalado.",
      status: metrics.indicatorsInstalled
        ? metrics.indicatorsAttention
          ? "attention"
          : metrics.indicatorsHaveData
            ? "available"
            : "configure"
        : metrics.indicatorsAttention
          ? "attention"
          : "not_installed",
      target: "/authenticated/indicadores",
    },
    {
      id: "work_center",
      label: "Central operacional",
      description: "Cockpit de pendências e próximos passos disponível.",
      status: "available",
      target: "/authenticated/documentos/central",
    },
  ];
}

export function buildOperationalRecommendation(
  metrics: OperationalHomeMetrics,
): OperationalRecommendation {
  if (metrics.criticalUnreadNotifications > 0) {
    return {
      title: "Revise as notificações críticas",
      description: `${metrics.criticalUnreadNotifications} alerta(s) crítico(s) ainda não foram lidos.`,
      actionLabel: "Abrir Notificações",
      target: "/authenticated/notificacoes",
      severity: "critical",
    };
  }
  if (metrics.openEscalations > 0) {
    return {
      title: "Trate os escalonamentos operacionais",
      description: `${metrics.openEscalations} escalonamento(s) estão abertos.`,
      actionLabel: "Abrir Notificações",
      target: "/authenticated/notificacoes",
      severity: "critical",
    };
  }
  if (metrics.overdueTramiteSteps > 0) {
    return {
      title: "Priorize as etapas de trâmite atrasadas",
      description: `${metrics.overdueTramiteSteps} etapa(s) ativa(s) estão fora do prazo.`,
      actionLabel: "Abrir Central Documental",
      target: "/authenticated/documentos/central",
      severity: "critical",
    };
  }
  if (metrics.overdueReviews > 0) {
    return {
      title: "Regularize as revisões vencidas",
      description: `${metrics.overdueReviews} documento(s) ultrapassaram a data de revisão.`,
      actionLabel: "Ver revisões",
      target: "/authenticated/documentos/central",
      severity: "critical",
    };
  }
  if (metrics.deadlinesWithAbsentAssignee > 0) {
    return {
      title: "Revise prazos com responsável ausente",
      description: `${metrics.deadlinesWithAbsentAssignee} etapa(s) possuem prazo e responsável indisponível.`,
      actionLabel: "Abrir Central Documental",
      target: "/authenticated/documentos/central",
      severity: "critical",
    };
  }
  if (metrics.absentWithoutSubstitute > 0) {
    return {
      title: "Defina substitutos para ausências ativas",
      description: `${metrics.absentWithoutSubstitute} ausência(s) não possuem substituto válido.`,
      actionLabel: "Abrir Equipe",
      target: "/authenticated/equipe",
      severity: "warning",
    };
  }
  if (metrics.stalledApprovals > 0) {
    return {
      title: "Destrave as aprovações formais vencidas",
      description: `${metrics.stalledApprovals} etapa(s) de aprovação precisam de atenção.`,
      actionLabel: "Abrir fila de aprovação",
      target: "/authenticated/fluxo-de-aprovacao",
      severity: "critical",
    };
  }
  if (metrics.nearDueTramiteSteps > 0) {
    return {
      title: "Antecipe as etapas próximas do vencimento",
      description: `${metrics.nearDueTramiteSteps} etapa(s) estão dentro da janela de atenção do SLA.`,
      actionLabel: "Abrir Central Documental",
      target: "/authenticated/documentos/central",
      severity: "warning",
    };
  }
  if (metrics.suggestedNotStarted > 0) {
    return {
      title: "Confirme os próximos trâmites",
      description: `${metrics.suggestedNotStarted} documento(s) possuem modelo sugerido ainda não iniciado.`,
      actionLabel: "Revisar sugestões",
      target: "/authenticated/documentos/central",
      severity: "warning",
    };
  }
  if (metrics.codingInstalled && metrics.codePatterns === 0) {
    return {
      title: "Configure o primeiro padrão de codificação",
      description:
        "O motor está disponível, mas ainda não há padrão ativo para orientar novos documentos.",
      actionLabel: "Configurar codificação",
      target: "/authenticated/documentos/codificacao",
      severity: "warning",
    };
  }
  if (metrics.projectsInstalled && metrics.documentsWithoutProject > 0) {
    return {
      title: "Revise documentos sem contexto operacional",
      description: `${metrics.documentsWithoutProject} documento(s) não estão vinculados a projeto, obra ou contrato.`,
      actionLabel: "Abrir documentos",
      target: "/authenticated/documents",
      severity: "warning",
    };
  }
  return {
    title: "A operação documental está estável",
    description:
      "Não há risco crítico consolidado. Revise indicadores ou evolua modelos e políticas.",
    actionLabel: "Abrir indicadores",
    target: "/authenticated/indicadores",
    severity: "stable",
  };
}

export function mapWorkCenterToHomeSummary(
  metrics: OperationalHomeMetrics,
): OperationalHomeSummary {
  const capabilityItems = capabilities(metrics);
  const maturityPoints = capabilityItems.reduce((total, capability) => {
    if (capability.status === "available") return total + 1;
    if (capability.status === "configure") return total + 0.5;
    return total;
  }, 0);
  return {
    status: calculateOperationalHealth(metrics),
    healthCards: healthCards(metrics),
    risks: risks(metrics),
    capabilities: capabilityItems,
    recommendation: buildOperationalRecommendation(metrics),
    maturityPercent: Math.round(
      (maturityPoints / capabilityItems.length) * 100,
    ),
  };
}
