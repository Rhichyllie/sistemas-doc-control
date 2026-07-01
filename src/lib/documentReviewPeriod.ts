export type DocumentReviewPeriodUnit = "days" | "months" | "years";

export interface DocumentReviewPeriod {
  value: number;
  unit: DocumentReviewPeriodUnit;
}

const UNIT_LIMITS: Record<DocumentReviewPeriodUnit, number> = {
  days: 3600,
  months: 120,
  years: 10,
};

export function validateReviewPeriod(period: DocumentReviewPeriod) {
  if (!Number.isInteger(period.value) || period.value < 1) {
    return "Informe um período inteiro maior que zero.";
  }
  if (period.value > UNIT_LIMITS[period.unit]) {
    return `O limite é ${UNIT_LIMITS[period.unit]} ${getReviewPeriodUnitLabel(period.unit, true)}.`;
  }
  return null;
}

export function reviewPeriodToMonths(period: DocumentReviewPeriod): number {
  if (period.unit === "years") return period.value * 12;
  if (period.unit === "days") return Math.max(1, Math.ceil(period.value / 30));
  return period.value;
}

export function calculateNextReviewDate(
  period: DocumentReviewPeriod,
  referenceDate = new Date(),
): string {
  const date = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    ),
  );

  if (period.unit === "days") {
    date.setUTCDate(date.getUTCDate() + period.value);
  } else if (period.unit === "years") {
    date.setUTCFullYear(date.getUTCFullYear() + period.value);
  } else {
    date.setUTCMonth(date.getUTCMonth() + period.value);
  }

  return date.toISOString().slice(0, 10);
}

export function estimateReviewMonthsFromDate(
  dateInput: string,
  referenceDate = new Date(),
): number | null {
  const target = new Date(`${dateInput}T12:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  const reference = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
      12,
    ),
  );
  const days = Math.ceil(
    (target.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 1) return null;
  return Math.min(120, Math.max(1, Math.ceil(days / 30)));
}

export function getReviewPeriodUnitLabel(
  unit: DocumentReviewPeriodUnit,
  plural = false,
) {
  if (unit === "days") return plural ? "dias" : "dia";
  if (unit === "years") return plural ? "anos" : "ano";
  return plural ? "meses" : "mês";
}

export function formatReviewPeriod(period: DocumentReviewPeriod) {
  return `${period.value} ${getReviewPeriodUnitLabel(period.unit, period.value !== 1)}`;
}

export function readStoredReviewPeriod(
  value: unknown,
  fallbackMonths: number | null,
): DocumentReviewPeriod {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const amount = Number(record.value);
    const unit = record.unit;
    if (
      Number.isInteger(amount) &&
      amount >= 1 &&
      (unit === "days" || unit === "months" || unit === "years")
    ) {
      return { value: amount, unit };
    }
  }

  return { value: fallbackMonths ?? 12, unit: "months" };
}
