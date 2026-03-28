// =============================================================================
// EMP CLOUD — Full & Final (F&F) Settlement Calculator
// Pure calculation helpers with no DB dependency.
// All monetary values are in the smallest currency unit (paise for INR).
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FnFRecovery {
  /** Description of the recovery (e.g., "Outstanding Loan", "Salary Advance") */
  description: string;
  /** Amount to recover (positive, in smallest currency unit) */
  amount: number;
}

export interface FnFInput {
  /** Pending salary (unpaid days/months) in smallest currency unit */
  pendingSalary: number;
  /** Number of leave days available for encashment */
  leaveBalance: number;
  /** Rate per leave day in smallest currency unit (e.g., basic_daily_rate) */
  leaveEncashmentRate: number;
  /** Gratuity amount (pre-calculated based on service years and basic) */
  gratuityAmount?: number;
  /** Notice period recovery (if employee didn't serve notice) — deducted */
  noticePeriodRecovery?: number;
  /** Bonus / ex-gratia amount to be paid */
  bonusAmount?: number;
  /** Array of individual recoveries (loans, advances, asset damage, etc.) */
  recoveries?: FnFRecovery[];
}

export interface FnFResult {
  /** Gross salary component (pending salary) */
  pendingSalary: number;
  /** Leave encashment amount */
  leaveEncashment: number;
  /** Gratuity amount */
  gratuity: number;
  /** Bonus / ex-gratia */
  bonus: number;
  /** Total earnings before deductions */
  totalEarnings: number;
  /** Notice period recovery */
  noticePeriodRecovery: number;
  /** Itemized recoveries */
  recoveries: FnFRecovery[];
  /** Total deductions */
  totalDeductions: number;
  /** Net settlement = totalEarnings - totalDeductions */
  netSettlement: number;
}

// ---------------------------------------------------------------------------
// F&F Settlement Calculation (#992)
// Formula: Net = (Pending Salary + Leave Encashment + Gratuity + Bonus)
//              - (Recoveries + Notice Period Recovery)
// ---------------------------------------------------------------------------

/**
 * Calculate Full & Final settlement for an exiting employee.
 *
 * @param input  F&F calculation parameters
 * @returns Detailed F&F breakdown with net settlement amount
 *
 * @example
 * ```ts
 * const result = calculateFnF({
 *   pendingSalary: 5000000,        // Rs 50,000 pending salary
 *   leaveBalance: 12,              // 12 leave days
 *   leaveEncashmentRate: 192300,   // Rs 1,923/day (basic 50k / 26)
 *   gratuityAmount: 288400,        // Rs 2,884 gratuity
 *   recoveries: [
 *     { description: "Salary Advance", amount: 1000000 },  // Rs 10,000
 *     { description: "Laptop Damage",  amount: 500000 },   // Rs 5,000
 *   ],
 * });
 * // result.netSettlement → Rs 50,000 + Rs 23,076 + Rs 2,884 - Rs 15,000
 * //                      = Rs 60,960 (6,096,000 paise)
 * ```
 */
export function calculateFnF(input: FnFInput): FnFResult {
  const {
    pendingSalary,
    leaveBalance,
    leaveEncashmentRate,
    gratuityAmount = 0,
    noticePeriodRecovery = 0,
    bonusAmount = 0,
    recoveries = [],
  } = input;

  // --- Earnings ---
  const leaveEncashment = Math.round(leaveBalance * leaveEncashmentRate);
  const gratuity = Math.round(gratuityAmount);
  const bonus = Math.round(bonusAmount);

  const totalEarnings = pendingSalary + leaveEncashment + gratuity + bonus;

  // --- Deductions ---
  const totalRecoveries = recoveries.reduce((sum, r) => sum + r.amount, 0);
  const totalDeductions = totalRecoveries + noticePeriodRecovery;

  // --- Net settlement (can be negative if deductions exceed earnings) ---
  const netSettlement = totalEarnings - totalDeductions;

  return {
    pendingSalary,
    leaveEncashment,
    gratuity,
    bonus,
    totalEarnings,
    noticePeriodRecovery,
    recoveries,
    totalDeductions,
    netSettlement,
  };
}

// ---------------------------------------------------------------------------
// Gratuity Eligibility & Calculation
// Under the Payment of Gratuity Act, 1972:
//   - Eligible after 5 years of continuous service
//   - Formula: (Last drawn basic × 15 × years of service) / 26
//   - Maximum: Rs 20,00,000 (20 lakh)
// ---------------------------------------------------------------------------

/** Maximum gratuity under the Payment of Gratuity Act (in paise). */
export const GRATUITY_MAX = 20_00_000;

/**
 * Calculate gratuity based on basic salary and years of service.
 *
 * @param basicMonthly      Last drawn monthly basic salary (smallest currency unit)
 * @param yearsOfService    Completed years of continuous service
 * @param minYearsRequired  Minimum years for eligibility (default 5)
 * @returns Gratuity amount (0 if not eligible)
 */
export function calculateGratuityForFnF(
  basicMonthly: number,
  yearsOfService: number,
  minYearsRequired = 5,
): number {
  if (yearsOfService < minYearsRequired) return 0;

  // Gratuity = (basic × 15 × years) / 26
  const gratuity = Math.round((basicMonthly * 15 * yearsOfService) / 26);

  // Cap at statutory maximum
  return Math.min(gratuity, GRATUITY_MAX);
}

// ---------------------------------------------------------------------------
// Leave Encashment Rate Helper
// Typically: basic_monthly / 26 (working days in a month)
// ---------------------------------------------------------------------------

/**
 * Calculate per-day leave encashment rate from monthly basic salary.
 *
 * @param basicMonthly  Monthly basic salary (smallest currency unit)
 * @param workingDaysPerMonth  Working days per month (default 26)
 * @returns Daily encashment rate
 */
export function calculateLeaveEncashmentRate(
  basicMonthly: number,
  workingDaysPerMonth = 26,
): number {
  return Math.round(basicMonthly / workingDaysPerMonth);
}
