export type TeamAvailabilitySchemaStatus =
  | "loading"
  | "ready"
  | "empty"
  | "not_installed"
  | "restricted"
  | "error";

export type TeamAbsenceType =
  | "vacation"
  | "sick_leave"
  | "leave"
  | "travel"
  | "training"
  | "unavailable"
  | "other";

export type TeamAbsenceStatus =
  | "scheduled"
  | "active"
  | "cancelled"
  | "completed";

export type TeamDelegationScope =
  | "all"
  | "project"
  | "document_type"
  | "area"
  | "step_type"
  | "custom";

export interface TeamAbsence {
  id: string;
  org_id: string;
  user_id: string;
  absence_type: TeamAbsenceType;
  starts_at: string;
  ends_at: string;
  status: TeamAbsenceStatus;
  reason: string | null;
  substitute_user_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamDelegationRule {
  id: string;
  org_id: string;
  owner_user_id: string;
  substitute_user_id: string;
  scope: TeamDelegationScope;
  project_id: string | null;
  doc_type: string | null;
  area: string | null;
  step_type: string | null;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  active: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamAvailabilityContext {
  projectId?: string | null;
  docType?: string | null;
  area?: string | null;
  stepType?: string | null;
}

export interface ResolvedTeamAvailability {
  userId: string;
  unavailable: boolean;
  absence: TeamAbsence | null;
  substituteUserId: string | null;
  source: "absence" | "delegation_rule" | null;
  delegationRule: TeamDelegationRule | null;
}

const ABSENCE_LABELS: Record<TeamAbsenceType, string> = {
  vacation: "Em férias",
  sick_leave: "Em licença médica",
  leave: "Em licença",
  travel: "Em viagem",
  training: "Em treinamento",
  unavailable: "Indisponível",
  other: "Ausente",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeTeamAbsence(value: unknown): TeamAbsence | null {
  const row = record(value);
  if (
    !row.id ||
    !row.org_id ||
    !row.user_id ||
    !row.starts_at ||
    !row.ends_at
  ) {
    return null;
  }
  const absenceType = [
    "vacation",
    "sick_leave",
    "leave",
    "travel",
    "training",
    "unavailable",
    "other",
  ].includes(String(row.absence_type))
    ? (String(row.absence_type) as TeamAbsenceType)
    : "other";
  const status = ["scheduled", "active", "cancelled", "completed"].includes(
    String(row.status),
  )
    ? (String(row.status) as TeamAbsenceStatus)
    : "scheduled";
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    user_id: String(row.user_id),
    absence_type: absenceType,
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    status,
    reason: row.reason ? String(row.reason) : null,
    substitute_user_id: row.substitute_user_id
      ? String(row.substitute_user_id)
      : null,
    metadata: record(row.metadata),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export function normalizeTeamDelegationRule(
  value: unknown,
): TeamDelegationRule | null {
  const row = record(value);
  if (!row.id || !row.org_id || !row.owner_user_id || !row.substitute_user_id) {
    return null;
  }
  const scope = [
    "all",
    "project",
    "document_type",
    "area",
    "step_type",
    "custom",
  ].includes(String(row.scope))
    ? (String(row.scope) as TeamDelegationScope)
    : "all";
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    owner_user_id: String(row.owner_user_id),
    substitute_user_id: String(row.substitute_user_id),
    scope,
    project_id: row.project_id ? String(row.project_id) : null,
    doc_type: row.doc_type ? String(row.doc_type).toUpperCase() : null,
    area: row.area ? String(row.area).toUpperCase() : null,
    step_type: row.step_type ? String(row.step_type).toLowerCase() : null,
    starts_at: row.starts_at ? String(row.starts_at) : null,
    ends_at: row.ends_at ? String(row.ends_at) : null,
    priority: Number(row.priority ?? 100),
    active: row.active !== false,
    metadata: record(row.metadata),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export function getAbsenceTypeLabel(type: TeamAbsenceType) {
  return ABSENCE_LABELS[type];
}

export function isAbsenceActive(absence: TeamAbsence, at = new Date()) {
  const timestamp = at.getTime();
  return (
    ["scheduled", "active"].includes(absence.status) &&
    new Date(absence.starts_at).getTime() <= timestamp &&
    new Date(absence.ends_at).getTime() > timestamp
  );
}

function matchesDelegation(
  rule: TeamDelegationRule,
  context: TeamAvailabilityContext,
  at: Date,
) {
  if (!rule.active) return false;
  const timestamp = at.getTime();
  if (rule.starts_at && new Date(rule.starts_at).getTime() > timestamp) {
    return false;
  }
  if (rule.ends_at && new Date(rule.ends_at).getTime() <= timestamp) {
    return false;
  }
  if (rule.scope === "all") return true;
  if (rule.scope === "project") {
    return Boolean(rule.project_id && rule.project_id === context.projectId);
  }
  if (rule.scope === "document_type") {
    return (
      Boolean(rule.doc_type) &&
      rule.doc_type === String(context.docType ?? "").toUpperCase()
    );
  }
  if (rule.scope === "area") {
    return (
      Boolean(rule.area) &&
      rule.area === String(context.area ?? "").toUpperCase()
    );
  }
  if (rule.scope === "step_type") {
    return (
      Boolean(rule.step_type) &&
      rule.step_type === String(context.stepType ?? "").toLowerCase()
    );
  }
  return false;
}

function delegationSpecificity(scope: TeamDelegationScope) {
  if (scope === "project") return 0;
  if (scope === "step_type") return 1;
  if (scope === "document_type") return 2;
  if (scope === "area") return 3;
  return 4;
}

export function resolveTeamAvailability(input: {
  userId: string;
  absences: TeamAbsence[];
  delegations: TeamDelegationRule[];
  context?: TeamAvailabilityContext;
  at?: Date;
}): ResolvedTeamAvailability {
  const at = input.at ?? new Date();
  const context = input.context ?? {};
  const absence =
    input.absences
      .filter(
        (item) => item.user_id === input.userId && isAbsenceActive(item, at),
      )
      .sort(
        (left, right) =>
          new Date(right.starts_at).getTime() -
            new Date(left.starts_at).getTime() ||
          left.id.localeCompare(right.id),
      )[0] ?? null;
  const candidateUnavailable = (candidateId: string) =>
    input.absences.some(
      (item) => item.user_id === candidateId && isAbsenceActive(item, at),
    );
  const candidateLoopsBack = (candidateId: string) =>
    input.absences.some(
      (item) =>
        item.user_id === candidateId &&
        item.substitute_user_id === input.userId &&
        isAbsenceActive(item, at),
    ) ||
    input.delegations.some(
      (item) =>
        item.owner_user_id === candidateId &&
        item.substitute_user_id === input.userId &&
        matchesDelegation(item, context, at),
    );

  if (
    absence?.substitute_user_id &&
    absence.substitute_user_id !== input.userId &&
    !candidateUnavailable(absence.substitute_user_id) &&
    !candidateLoopsBack(absence.substitute_user_id)
  ) {
    return {
      userId: input.userId,
      unavailable: true,
      absence,
      substituteUserId: absence.substitute_user_id,
      source: "absence",
      delegationRule: null,
    };
  }

  const delegation =
    input.delegations
      .filter(
        (item) =>
          item.owner_user_id === input.userId &&
          item.substitute_user_id !== input.userId &&
          matchesDelegation(item, context, at) &&
          !candidateUnavailable(item.substitute_user_id) &&
          !candidateLoopsBack(item.substitute_user_id),
      )
      .sort(
        (left, right) =>
          delegationSpecificity(left.scope) -
            delegationSpecificity(right.scope) ||
          left.priority - right.priority ||
          left.created_at.localeCompare(right.created_at) ||
          left.id.localeCompare(right.id),
      )[0] ?? null;

  return {
    userId: input.userId,
    unavailable: Boolean(absence),
    absence,
    substituteUserId: delegation?.substitute_user_id ?? null,
    source: delegation ? "delegation_rule" : null,
    delegationRule: delegation,
  };
}
