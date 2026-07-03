export type OperationalCalendarSchemaStatus =
  | "loading"
  | "ready"
  | "empty"
  | "not_installed"
  | "restricted"
  | "error";

export type DeadlineCalculationMode =
  | "operational_calendar"
  | "simple_date";

export type OperationalWorkweek = Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  boolean
>;

export interface OperationalCalendar {
  id: string;
  org_id: string;
  name: string;
  timezone: string;
  workweek: OperationalWorkweek;
  default_start_time: string;
  default_end_time: string;
  is_default: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperationalHoliday {
  id: string;
  org_id: string;
  calendar_id: string | null;
  holiday_date: string;
  name: string;
  scope: "organization" | "calendar";
  repeats_yearly: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export type DocumentSlaSeverity = "low" | "medium" | "high" | "critical";

export interface DocumentSlaPolicy {
  id: string;
  org_id: string;
  name: string;
  doc_type: string | null;
  area: string | null;
  project_id: string | null;
  step_type: string | null;
  calendar_id: string | null;
  review_due_days: number | null;
  step_due_days: number | null;
  warning_before_days: number;
  severity: DocumentSlaSeverity;
  priority: number;
  active: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlaPolicyContext {
  kind: "document_review" | "tramite_step";
  docType?: string | null;
  area?: string | null;
  projectId?: string | null;
  stepType?: string | null;
}

export interface SuggestedDeadline {
  dueDate: string | null;
  policy: DocumentSlaPolicy | null;
  calendar: OperationalCalendar | null;
  mode: DeadlineCalculationMode;
  warningBeforeDays: number;
}

export const DEFAULT_OPERATIONAL_WORKWEEK: OperationalWorkweek = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: false,
  sun: false,
};

const DAY_KEYS: Array<keyof OperationalWorkweek> = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseDate(value: string | Date) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  }
  const dateOnly = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toOperationalDate(value: string | Date) {
  const date = parseDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeOperationalWorkweek(
  value: unknown,
): OperationalWorkweek {
  const record = asRecord(value);
  return {
    mon: typeof record.mon === "boolean" ? record.mon : true,
    tue: typeof record.tue === "boolean" ? record.tue : true,
    wed: typeof record.wed === "boolean" ? record.wed : true,
    thu: typeof record.thu === "boolean" ? record.thu : true,
    fri: typeof record.fri === "boolean" ? record.fri : true,
    sat: typeof record.sat === "boolean" ? record.sat : false,
    sun: typeof record.sun === "boolean" ? record.sun : false,
  };
}

export function normalizeOperationalCalendar(
  value: unknown,
): OperationalCalendar | null {
  const row = asRecord(value);
  if (!row.id || !row.org_id || !row.name) return null;
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    name: String(row.name),
    timezone: String(row.timezone ?? "America/Sao_Paulo"),
    workweek: normalizeOperationalWorkweek(row.workweek),
    default_start_time: String(row.default_start_time ?? "08:00"),
    default_end_time: String(row.default_end_time ?? "18:00"),
    is_default: row.is_default === true,
    metadata: asRecord(row.metadata),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export function normalizeOperationalHoliday(
  value: unknown,
): OperationalHoliday | null {
  const row = asRecord(value);
  if (!row.id || !row.org_id || !row.holiday_date || !row.name) return null;
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    calendar_id: row.calendar_id ? String(row.calendar_id) : null,
    holiday_date: String(row.holiday_date).slice(0, 10),
    name: String(row.name),
    scope: row.scope === "calendar" ? "calendar" : "organization",
    repeats_yearly: row.repeats_yearly === true,
    metadata: asRecord(row.metadata),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at ?? ""),
  };
}

export function normalizeDocumentSlaPolicy(
  value: unknown,
): DocumentSlaPolicy | null {
  const row = asRecord(value);
  if (!row.id || !row.org_id || !row.name) return null;
  const severity = ["low", "medium", "high", "critical"].includes(
    String(row.severity),
  )
    ? (String(row.severity) as DocumentSlaSeverity)
    : "medium";
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    name: String(row.name),
    doc_type: row.doc_type ? String(row.doc_type).toUpperCase() : null,
    area: row.area ? String(row.area).toUpperCase() : null,
    project_id: row.project_id ? String(row.project_id) : null,
    step_type: row.step_type ? String(row.step_type).toLowerCase() : null,
    calendar_id: row.calendar_id ? String(row.calendar_id) : null,
    review_due_days:
      row.review_due_days === null || row.review_due_days === undefined
        ? null
        : Number(row.review_due_days),
    step_due_days:
      row.step_due_days === null || row.step_due_days === undefined
        ? null
        : Number(row.step_due_days),
    warning_before_days: Math.max(0, Number(row.warning_before_days ?? 3)),
    severity,
    priority: Number(row.priority ?? 100),
    active: row.active !== false,
    metadata: asRecord(row.metadata),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export function isBusinessDayLocal(
  value: string | Date,
  calendar: OperationalCalendar | null,
  holidays: OperationalHoliday[],
) {
  const date = parseDate(value);
  if (!date) return false;
  const dayKey = DAY_KEYS[date.getDay()];
  const workweek = calendar?.workweek ?? DEFAULT_OPERATIONAL_WORKWEEK;
  if (!workweek[dayKey]) return false;

  return !holidays.some((holiday) => {
    if (
      holiday.calendar_id &&
      holiday.calendar_id !== (calendar?.id ?? null)
    ) {
      return false;
    }
    const holidayDate = parseDate(holiday.holiday_date);
    if (!holidayDate) return false;
    if (holiday.repeats_yearly) {
      return (
        holidayDate.getMonth() === date.getMonth() &&
        holidayDate.getDate() === date.getDate()
      );
    }
    return holidayDate.getTime() === date.getTime();
  });
}

export function addBusinessDaysLocal(
  startValue: string | Date,
  days: number,
  calendar: OperationalCalendar | null,
  holidays: OperationalHoliday[],
) {
  const start = parseDate(startValue);
  if (!start || !Number.isInteger(days) || days < 0) return null;
  if (days === 0) return toOperationalDate(start);

  const cursor = new Date(start);
  let added = 0;
  let safety = 0;
  while (added < days && safety < 10000) {
    cursor.setDate(cursor.getDate() + 1);
    safety += 1;
    if (isBusinessDayLocal(cursor, calendar, holidays)) added += 1;
  }
  return added === days ? toOperationalDate(cursor) : null;
}

export function businessDaysUntil(
  targetValue: string,
  calendar: OperationalCalendar | null,
  holidays: OperationalHoliday[],
  now = new Date(),
) {
  const target = parseDate(targetValue);
  const today = parseDate(now);
  if (!target || !today) return null;
  if (target.getTime() === today.getTime()) return 0;

  const direction = target > today ? 1 : -1;
  const cursor = new Date(today);
  let count = 0;
  let safety = 0;
  while (cursor.getTime() !== target.getTime() && safety < 10000) {
    cursor.setDate(cursor.getDate() + direction);
    safety += 1;
    if (isBusinessDayLocal(cursor, calendar, holidays)) {
      count += direction;
    }
  }
  return safety < 10000 ? count : null;
}

function normalizedEquals(left?: string | null, right?: string | null) {
  return (
    String(left ?? "")
      .trim()
      .toUpperCase() ===
    String(right ?? "")
      .trim()
      .toUpperCase()
  );
}

export function selectSlaPolicy(
  policies: DocumentSlaPolicy[],
  context: SlaPolicyContext,
) {
  return (
    policies
      .filter((policy) => {
        if (!policy.active) return false;
        if (
          context.kind === "document_review" &&
          !policy.review_due_days
        ) {
          return false;
        }
        if (context.kind === "tramite_step" && !policy.step_due_days) {
          return false;
        }
        if (
          policy.project_id &&
          policy.project_id !== (context.projectId ?? null)
        ) {
          return false;
        }
        if (policy.doc_type && !normalizedEquals(policy.doc_type, context.docType)) {
          return false;
        }
        if (policy.area && !normalizedEquals(policy.area, context.area)) {
          return false;
        }
        return !(
          policy.step_type &&
          !normalizedEquals(policy.step_type, context.stepType)
        );
      })
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }
        const specificity = (policy: DocumentSlaPolicy) =>
          Number(Boolean(policy.project_id)) * 8 +
          Number(Boolean(policy.step_type)) * 4 +
          Number(Boolean(policy.doc_type)) * 2 +
          Number(Boolean(policy.area));
        const score = specificity(right) - specificity(left);
        if (score !== 0) return score;
        return (
          left.created_at.localeCompare(right.created_at) ||
          left.id.localeCompare(right.id)
        );
      })[0] ?? null
  );
}

export function calculateSuggestedDeadline(input: {
  baseDate: string;
  context: SlaPolicyContext;
  calendars: OperationalCalendar[];
  holidays: OperationalHoliday[];
  policies: DocumentSlaPolicy[];
}): SuggestedDeadline {
  const policy = selectSlaPolicy(input.policies, input.context);
  const calendar =
    (policy?.calendar_id
      ? input.calendars.find((item) => item.id === policy.calendar_id)
      : input.calendars.find((item) => item.is_default)) ??
    input.calendars[0] ??
    null;
  const days =
    input.context.kind === "document_review"
      ? policy?.review_due_days
      : policy?.step_due_days;
  return {
    dueDate:
      policy && days
        ? addBusinessDaysLocal(
            input.baseDate,
            days,
            calendar,
            input.holidays,
          )
        : null,
    policy,
    calendar,
    mode: calendar ? "operational_calendar" : "simple_date",
    warningBeforeDays: policy?.warning_before_days ?? 3,
  };
}

export function getDeadlineModeLabel(mode: DeadlineCalculationMode) {
  return mode === "operational_calendar"
    ? "Prazo calculado por calendário operacional"
    : "Prazo calculado por data simples";
}
