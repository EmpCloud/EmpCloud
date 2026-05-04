// =============================================================================
// EMP CLOUD — Leave Period Helper
//
// Pure functions for fiscal-year and accrual-period math. No DB access.
// Tested against Apr fiscal year (Indian default) and Jan fiscal year
// (calendar). Quarterly = 4 periods, monthly = 12, annual = 1.
//
// Conventions:
//   - "fiscal year" is identified by its START year. FY 2025 with start_month=4
//     covers 2025-04-01 .. 2026-03-31.
//   - "period" is the slice of a fiscal year defined by accrual_type.
//   - period_index is 0-based; period 0 begins on fiscal-year start.
//   - period_key is human-readable: "2025-Q1", "2025-M07", "2025-Y".
// =============================================================================

export type AccrualType = "annual" | "monthly" | "quarterly";

export interface PeriodInfo {
  fiscalYear: number;          // start year of the fiscal year (e.g. 2025)
  fiscalYearLabel: string;     // "2025-26"
  fiscalStart: Date;           // inclusive
  fiscalEnd: Date;             // exclusive (next year's start)
  periodsInYear: number;       // 1 / 4 / 12
  periodIndex: number;         // 0-based
  periodKey: string;           // "2025-Q2"
  periodStart: Date;           // inclusive
  periodEnd: Date;             // exclusive
  periodsElapsed: number;      // current period is counted (1 in Q1, 2 in Q2, ...)
}

const MONTHS_PER_PERIOD: Record<AccrualType, number> = {
  annual: 12,
  monthly: 1,
  quarterly: 3,
};

export function periodsInYear(accrual: AccrualType): number {
  return 12 / MONTHS_PER_PERIOD[accrual];
}

/** Annual quota divided into per-period quota. Quarterly + 12 → 3. */
export function getPeriodQuota(annualQuota: number, accrual: AccrualType): number {
  return annualQuota / periodsInYear(accrual);
}

/** Returns the fiscal year *start* (e.g. 2025 means Apr 2025 – Mar 2026). */
export function getFiscalYear(date: Date, startMonth: number): number {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  return month >= startMonth ? year : year - 1;
}

export function getFiscalYearBounds(
  fiscalYear: number,
  startMonth: number,
): { start: Date; end: Date } {
  const start = new Date(fiscalYear, startMonth - 1, 1);
  const end = new Date(fiscalYear + 1, startMonth - 1, 1);
  return { start, end };
}

export function getFiscalYearLabel(fiscalYear: number, startMonth: number): string {
  if (startMonth === 1) return String(fiscalYear);
  const next = String((fiscalYear + 1) % 100).padStart(2, "0");
  return `${fiscalYear}-${next}`;
}

/**
 * Compute period info for a given date relative to a fiscal year and accrual.
 * `date` may be inside the fiscal year (current period) or outside (returns
 * the period containing the date in *its* fiscal year).
 */
export function getPeriodInfo(
  date: Date,
  startMonth: number,
  accrual: AccrualType,
): PeriodInfo {
  const fiscalYear = getFiscalYear(date, startMonth);
  const { start: fiscalStart, end: fiscalEnd } = getFiscalYearBounds(
    fiscalYear,
    startMonth,
  );
  const total = periodsInYear(accrual);
  const monthsPer = MONTHS_PER_PERIOD[accrual];

  // Months elapsed from fiscal start to the input date's month-of-year.
  const monthsFromStart =
    (date.getFullYear() - fiscalYear) * 12 + (date.getMonth() + 1 - startMonth);

  const periodIndex = Math.min(
    Math.max(0, Math.floor(monthsFromStart / monthsPer)),
    total - 1,
  );
  const periodStart = new Date(
    fiscalYear,
    startMonth - 1 + periodIndex * monthsPer,
    1,
  );
  const periodEnd = new Date(
    fiscalYear,
    startMonth - 1 + (periodIndex + 1) * monthsPer,
    1,
  );

  let periodKey: string;
  if (accrual === "annual") {
    periodKey = `${fiscalYear}-Y`;
  } else if (accrual === "quarterly") {
    periodKey = `${fiscalYear}-Q${periodIndex + 1}`;
  } else {
    // monthly — show actual calendar month for debuggability
    const m = String(periodStart.getMonth() + 1).padStart(2, "0");
    periodKey = `${fiscalYear}-M${m}`;
  }

  return {
    fiscalYear,
    fiscalYearLabel: getFiscalYearLabel(fiscalYear, startMonth),
    fiscalStart,
    fiscalEnd,
    periodsInYear: total,
    periodIndex,
    periodKey,
    periodStart,
    periodEnd,
    periodsElapsed: periodIndex + 1,
  };
}

/**
 * Days accrued from fiscal start through `date`, inclusive of the current
 * period. For Quarterly + 12 days/year:
 *   Apr-Jun → 3, Jul-Sep → 6, Oct-Dec → 9, Jan-Mar → 12.
 *
 * Used for *carry-forward* policies where unused days roll across periods.
 */
export function getAccruedToDate(
  annualQuota: number,
  accrual: AccrualType,
  date: Date,
  startMonth: number,
): number {
  const info = getPeriodInfo(date, startMonth, accrual);
  return getPeriodQuota(annualQuota, accrual) * info.periodsElapsed;
}

/**
 * Pro-rate the *first* period for an employee who joined mid-period.
 * Returns the quota they should get for the period containing their join date.
 *
 * Example: Quarterly + 12 days. Employee joins on May 15 (mid-Q1 of Apr-Jun).
 *   Q1 has 3 days. May 15 is at ~50% of the quarter → ~1.5 days.
 *
 * Subsequent periods get the full per-period quota.
 */
export function getProRatedJoiningQuota(
  annualQuota: number,
  accrual: AccrualType,
  joinDate: Date,
  startMonth: number,
): number {
  const info = getPeriodInfo(joinDate, startMonth, accrual);
  const periodQuota = getPeriodQuota(annualQuota, accrual);
  const periodMs = info.periodEnd.getTime() - info.periodStart.getTime();
  const remainingMs = info.periodEnd.getTime() - joinDate.getTime();
  const fraction = Math.max(0, Math.min(1, remainingMs / periodMs));
  // Round to 0.5 — matches emp-monitor's calculation() helper
  return roundToHalf(periodQuota * fraction);
}

/** Round to nearest 0.5 (matches emp-monitor convention). */
export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Days warning before a period boundary. Returns the period's end date if
 * `date` is within `daysAhead` of it, otherwise null.
 */
export function getPeriodBoundaryWarning(
  date: Date,
  startMonth: number,
  accrual: AccrualType,
  daysAhead = 7,
): { periodEnd: Date; daysUntil: number } | null {
  const info = getPeriodInfo(date, startMonth, accrual);
  const msUntil = info.periodEnd.getTime() - date.getTime();
  const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24));
  if (daysUntil > 0 && daysUntil <= daysAhead) {
    return { periodEnd: info.periodEnd, daysUntil };
  }
  return null;
}
