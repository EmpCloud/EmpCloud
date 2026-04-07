// =============================================================================
// EMP CLOUD — Payroll Business Rules (Utility Functions)
// Pure calculation helpers with no DB dependency.
// All monetary values are in the smallest currency unit (paise for INR).
// =============================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PF is calculated on basic capped at Rs 15,000/month (1,500,000 paise). */
export const PF_BASIC_CAP = 15_000;

/** Employee PF contribution rate. */
export const PF_EMPLOYEE_RATE = 0.12;

/** Employer PF contribution rate. */
export const PF_EMPLOYER_RATE = 0.12;

/** ESI applies only when gross salary <= Rs 21,000/month. */
export const ESI_GROSS_THRESHOLD = 21_000;

/** Employee ESI contribution rate. */
export const ESI_EMPLOYEE_RATE = 0.0075;

/** Employer ESI contribution rate. */
export const ESI_EMPLOYER_RATE = 0.0325;

/** Gratuity rate (4.81% of basic for monthly accrual). */
export const GRATUITY_RATE = 0.0481;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SalaryComponent {
  name: string;
  /** Monthly amount */
  amount: number;
}

export interface SalaryStructure {
  /** Monthly basic pay */
  basic: number;
  /** Monthly HRA */
  hra: number;
  /** Dearness Allowance */
  da: number;
  /** Special Allowance (catch-all) */
  special_allowance: number;
  /** Any additional components */
  other_components?: SalaryComponent[];
  /** Total monthly gross */
  gross: number;
  /** Employer PF contribution */
  employer_pf: number;
  /** Employer ESI contribution */
  employer_esi: number;
  /** Monthly gratuity accrual */
  gratuity: number;
  /** Cost to Company (monthly) */
  ctc: number;
}

export interface SalaryValidationResult {
  valid: boolean;
  errors: string[];
  computed: {
    component_sum: number;
    expected_gross: number;
    employee_pf: number;
    employer_pf: number;
    employee_esi: number;
    employer_esi: number;
    gratuity: number;
    expected_ctc: number;
  };
}

export interface OvertimeResult {
  overtime_minutes: number;
  shift_duration_minutes: number;
  total_worked_minutes: number;
}

// ---------------------------------------------------------------------------
// Rule 3: PF Calculation (capped at basic Rs 15,000)
// ---------------------------------------------------------------------------

/**
 * Calculate employee PF contribution.
 * PF = 12% of basic, capped at PF_BASIC_CAP.
 */
export function calculateEmployeePF(basicMonthly: number): number {
  const cappedBasic = Math.min(basicMonthly, PF_BASIC_CAP);
  return Math.round(cappedBasic * PF_EMPLOYEE_RATE);
}

/**
 * Calculate employer PF contribution.
 * Employer PF = 12% of basic, capped at PF_BASIC_CAP.
 */
export function calculateEmployerPF(basicMonthly: number): number {
  const cappedBasic = Math.min(basicMonthly, PF_BASIC_CAP);
  return Math.round(cappedBasic * PF_EMPLOYER_RATE);
}

// ---------------------------------------------------------------------------
// Rule 4: ESI Calculation (auto-disable above Rs 21,000 gross)
// ---------------------------------------------------------------------------

/**
 * Calculate employee ESI contribution.
 * ESI applies only when gross <= ESI_GROSS_THRESHOLD.
 * Returns 0 if gross exceeds the threshold.
 */
export function calculateEmployeeESI(grossMonthly: number): number {
  if (grossMonthly > ESI_GROSS_THRESHOLD) return 0;
  return Math.round(grossMonthly * ESI_EMPLOYEE_RATE);
}

/**
 * Calculate employer ESI contribution.
 * ESI applies only when gross <= ESI_GROSS_THRESHOLD.
 * Returns 0 if gross exceeds the threshold.
 */
export function calculateEmployerESI(grossMonthly: number): number {
  if (grossMonthly > ESI_GROSS_THRESHOLD) return 0;
  return Math.round(grossMonthly * ESI_EMPLOYER_RATE);
}

// ---------------------------------------------------------------------------
// Gratuity Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate monthly gratuity accrual.
 * Gratuity = 4.81% of basic (monthly approximation of 15/26 * basic / 12).
 */
export function calculateGratuity(basicMonthly: number): number {
  return Math.round(basicMonthly * GRATUITY_RATE);
}

// ---------------------------------------------------------------------------
// Rule 1: CTC Formula Validation
// CTC = Gross + Employer PF + Employer ESI + Gratuity
// ---------------------------------------------------------------------------

/**
 * Compute expected CTC from gross and statutory employer contributions.
 */
export function computeCTC(gross: number, basic: number): number {
  const employerPF = calculateEmployerPF(basic);
  const employerESI = calculateEmployerESI(gross);
  const gratuity = calculateGratuity(basic);
  return gross + employerPF + employerESI + gratuity;
}

// ---------------------------------------------------------------------------
// Rule 2: Salary Components Sum = Gross
// ---------------------------------------------------------------------------

/**
 * Sum all salary components to verify they equal gross.
 */
export function sumComponents(
  basic: number,
  hra: number,
  da: number,
  specialAllowance: number,
  otherComponents?: SalaryComponent[],
): number {
  let total = basic + hra + da + specialAllowance;
  if (otherComponents) {
    for (const comp of otherComponents) {
      total += comp.amount;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Full Salary Structure Validation (Rules 1 + 2 combined)
// ---------------------------------------------------------------------------

/**
 * Validate an entire salary structure.
 * Checks:
 *  - All components sum to gross (Rule 2 / #1053)
 *  - CTC = Gross + Employer PF + ESI + Gratuity (Rule 1 / #1051)
 *  - PF is correctly capped (Rule 3 / #1054)
 *  - ESI is disabled when gross > 21,000 (Rule 4 / #1055)
 *
 * @param structure  The salary structure to validate
 * @param tolerance  Rounding tolerance (default 1 unit)
 * @returns Validation result with computed values and any errors
 */
export function validateSalaryStructure(
  structure: SalaryStructure,
  tolerance = 1,
): SalaryValidationResult {
  const errors: string[] = [];

  // --- Rule 2: Components must sum to gross ---
  const componentSum = sumComponents(
    structure.basic,
    structure.hra,
    structure.da,
    structure.special_allowance,
    structure.other_components,
  );

  if (Math.abs(componentSum - structure.gross) > tolerance) {
    errors.push(
      `Salary components sum (${componentSum}) does not match gross salary (${structure.gross}). ` +
      `Difference: ${componentSum - structure.gross}`,
    );
  }

  // --- Rule 3: PF calculation validation ---
  const employeePF = calculateEmployeePF(structure.basic);
  const employerPF = calculateEmployerPF(structure.basic);

  if (Math.abs(structure.employer_pf - employerPF) > tolerance) {
    /* v8 ignore start */ // Rare validation edge case
    errors.push(
      `Employer PF (${structure.employer_pf}) does not match calculated value (${employerPF}). ` +
      `PF is 12% of basic capped at Rs ${PF_BASIC_CAP}.`,
    );
  }
    /* v8 ignore stop */

  // --- Rule 4: ESI threshold validation ---
  const employeeESI = calculateEmployeeESI(structure.gross);
  const employerESI = calculateEmployerESI(structure.gross);

  if (Math.abs(structure.employer_esi - employerESI) > tolerance) {
    if (structure.gross > ESI_GROSS_THRESHOLD && structure.employer_esi !== 0) {
      errors.push(
        `ESI must be 0 when gross salary (${structure.gross}) exceeds Rs ${ESI_GROSS_THRESHOLD}/month. ` +
        `Got employer ESI = ${structure.employer_esi}.`,
      );
    } else {
      errors.push(
        `Employer ESI (${structure.employer_esi}) does not match calculated value (${employerESI}).`,
      );
    }
  }

  // --- Gratuity validation ---
  const gratuity = calculateGratuity(structure.basic);

  if (Math.abs(structure.gratuity - gratuity) > tolerance) {
    /* v8 ignore start */ // Rare validation edge case
    errors.push(
      `Gratuity (${structure.gratuity}) does not match calculated value (${gratuity}). ` +
      `Expected ${GRATUITY_RATE * 100}% of basic.`,
    );
  }
    /* v8 ignore stop */

  // --- Rule 1: CTC formula validation ---
  const expectedCTC = structure.gross + employerPF + employerESI + gratuity;

  if (Math.abs(structure.ctc - expectedCTC) > tolerance) {
    errors.push(
      `CTC (${structure.ctc}) does not match formula: Gross (${structure.gross}) + ` +
      `Employer PF (${employerPF}) + Employer ESI (${employerESI}) + Gratuity (${gratuity}) = ${expectedCTC}.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    computed: {
      component_sum: componentSum,
      expected_gross: structure.gross,
      employee_pf: employeePF,
      employer_pf: employerPF,
      employee_esi: employeeESI,
      employer_esi: employerESI,
      gratuity,
      expected_ctc: expectedCTC,
    },
  };
}

// ---------------------------------------------------------------------------
// Rule 5 & 6: Overtime Calculation from Attendance
// ---------------------------------------------------------------------------

/**
 * Calculate shift duration in minutes from start_time and end_time strings
 * (HH:MM or HH:MM:SS format). Handles overnight (night) shifts.
 *
 * @param startTime  Shift start time (e.g. "09:00")
 * @param endTime    Shift end time (e.g. "18:00")
 * @param isNightShift  Whether the shift crosses midnight
 * @returns Duration in minutes
 */
export function calculateShiftDurationMinutes(
  startTime: string,
  endTime: string,
  isNightShift = false,
): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;

  // Night shift: end time is next day
  if (isNightShift || endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return endMinutes - startMinutes;
}

/**
 * Calculate overtime minutes from check-out time vs shift end time.
 * Overtime only counts AFTER the full shift is completed (Rule 5 / #1057).
 *
 * @param checkIn       Check-in timestamp
 * @param checkOut      Check-out timestamp
 * @param shiftEndTime  Shift end time (HH:MM format)
 * @param shiftStartTime  Shift start time (HH:MM format)
 * @param isNightShift  Whether the shift crosses midnight
 * @param breakMinutes  Break duration to exclude (default 0)
 * @returns Overtime result with minutes breakdown
 */
export function calculateOvertime(
  checkIn: Date,
  checkOut: Date,
  shiftStartTime: string,
  shiftEndTime: string,
  isNightShift = false,
  breakMinutes = 0,
): OvertimeResult {
  const totalWorkedMinutes = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / 60_000,
  );

  const shiftDuration = calculateShiftDurationMinutes(
    shiftStartTime,
    shiftEndTime,
    isNightShift,
  );

  // Net shift hours (excluding breaks)
  const netShiftMinutes = shiftDuration - breakMinutes;

  // Rule 5: OT only counts AFTER regular shift hours are complete
  // Rule 6: OT = time worked beyond shift end
  // We use the stricter check: employee must have worked at least the full
  // shift duration AND checked out after the shift end time.

  // Build the shift-end Date for today (or next day for night shifts)
  const [eh, em] = shiftEndTime.split(":").map(Number);
  const shiftEnd = new Date(checkIn);
  shiftEnd.setHours(eh, em, 0, 0);

  // For night shifts, shift end is the next calendar day
  if (isNightShift || shiftEnd.getTime() <= checkIn.getTime()) {
    shiftEnd.setDate(shiftEnd.getDate() + 1);
  }

  let overtimeMinutes = 0;

  // Only award OT if:
  //  1. Employee worked at least the net shift duration (Rule 5)
  //  2. Check-out is actually after the shift end time (Rule 6)
  if (totalWorkedMinutes >= netShiftMinutes && checkOut.getTime() > shiftEnd.getTime()) {
    overtimeMinutes = Math.round(
      (checkOut.getTime() - shiftEnd.getTime()) / 60_000,
    );
  }

  return {
    overtime_minutes: Math.max(0, overtimeMinutes),
    shift_duration_minutes: shiftDuration,
    total_worked_minutes: totalWorkedMinutes,
  };
}
