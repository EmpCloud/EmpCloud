// =============================================================================
// EMP CLOUD — Salary Structure Service
// Read/write salary breakup on employee_profiles, validated via payroll-rules.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import {
  validateSalaryStructure,
  type SalaryStructure,
} from "../../utils/payroll-rules.js";

// Column names used in the employee_profiles table
const SALARY_COLUMNS = [
  "salary_ctc",
  "salary_basic",
  "salary_hra",
  "salary_da",
  "salary_special_allowance",
  "salary_gross",
  "salary_employer_pf",
  "salary_employer_esi",
  "salary_gratuity",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map DB row to a clean SalaryStructure response (strip "salary_" prefix). */
function rowToSalary(row: Record<string, unknown>): SalaryStructure | null {
  // If ctc is null the employee has no salary data yet
  if (row.salary_ctc == null) return null;

  return {
    ctc: Number(row.salary_ctc),
    basic: Number(row.salary_basic),
    hra: Number(row.salary_hra),
    da: Number(row.salary_da),
    special_allowance: Number(row.salary_special_allowance),
    gross: Number(row.salary_gross),
    employer_pf: Number(row.salary_employer_pf),
    employer_esi: Number(row.salary_employer_esi),
    gratuity: Number(row.salary_gratuity),
  };
}

// ---------------------------------------------------------------------------
// Get Salary Structure
// ---------------------------------------------------------------------------

export async function getSalaryStructure(orgId: number, userId: number) {
  const db = getDB();

  // Ensure user + profile exist in this org
  const row = await db("employee_profiles")
    .join("users", function () {
      this.on("users.id", "employee_profiles.user_id").andOn(
        "users.organization_id",
        db.raw("?", [orgId])
      );
    })
    .where({
      "employee_profiles.user_id": userId,
      "employee_profiles.organization_id": orgId,
    })
    .select(SALARY_COLUMNS.map((c) => `employee_profiles.${c}`))
    .first();

  if (!row) {
    // Check if the user exists at all (so we can distinguish 404 user vs no salary)
    const user = await db("users")
      .where({ id: userId, organization_id: orgId })
      .first();
    if (!user) throw new NotFoundError("Employee");

    // User exists but no profile row yet — return null salary
    return { user_id: userId, salary: null };
  }

  return { user_id: userId, salary: rowToSalary(row) };
}

// ---------------------------------------------------------------------------
// Upsert Salary Structure (with payroll-rule validation)
// ---------------------------------------------------------------------------

export interface UpsertSalaryInput {
  ctc: number;
  basic: number;
  hra: number;
  da: number;
  special_allowance: number;
  gross: number;
  employer_pf: number;
  employer_esi: number;
  gratuity: number;
}

export async function upsertSalaryStructure(
  orgId: number,
  userId: number,
  data: UpsertSalaryInput
) {
  const db = getDB();

  // 1. Verify user belongs to org
  const user = await db("users")
    .where({ id: userId, organization_id: orgId })
    .first();
  if (!user) throw new NotFoundError("Employee");

  // 2. Validate against payroll rules
  const structure: SalaryStructure = {
    ctc: data.ctc,
    basic: data.basic,
    hra: data.hra,
    da: data.da,
    special_allowance: data.special_allowance,
    gross: data.gross,
    employer_pf: data.employer_pf,
    employer_esi: data.employer_esi,
    gratuity: data.gratuity,
  };

  const validation = validateSalaryStructure(structure);
  if (!validation.valid) {
    throw new ValidationError(
      "Salary structure validation failed",
      { errors: validation.errors, computed: validation.computed }
    );
  }

  // 3. Map to DB column names
  const salaryData: Record<string, unknown> = {
    salary_ctc: data.ctc,
    salary_basic: data.basic,
    salary_hra: data.hra,
    salary_da: data.da,
    salary_special_allowance: data.special_allowance,
    salary_gross: data.gross,
    salary_employer_pf: data.employer_pf,
    salary_employer_esi: data.employer_esi,
    salary_gratuity: data.gratuity,
    updated_at: new Date(),
  };

  // 4. Upsert into employee_profiles
  const existing = await db("employee_profiles")
    .where({ user_id: userId, organization_id: orgId })
    .first();

  if (existing) {
    await db("employee_profiles")
      .where({ id: existing.id })
      .update(salaryData);
  } else {
    await db("employee_profiles").insert({
      organization_id: orgId,
      user_id: userId,
      ...salaryData,
      created_at: new Date(),
    });
  }

  // 5. Return the saved structure + computed values
  return {
    user_id: userId,
    salary: structure,
    validation: validation.computed,
  };
}
