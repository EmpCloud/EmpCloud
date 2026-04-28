// =============================================================================
// MIGRATION 050 — Add uan_number to employee_profiles
//
// Issue emp-payroll#251 reported that PAN and UAN entered on EmpCloud weren't
// reflecting on the payroll-side My Profile (Statutory Details). PR #254 on
// payroll fixed PAN by reading employee_profiles.pan_number; UAN was untouched
// because the column didn't exist on EmpCloud at all.
//
// Add the column. UAN (Universal Account Number, EPFO) is always 12 digits,
// so VARCHAR(12) NULL matches the shape of aadhar_number. Idempotent.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("employee_profiles"))) return;
  if (await knex.schema.hasColumn("employee_profiles", "uan_number")) return;
  await knex.schema.alterTable("employee_profiles", (t) => {
    t.string("uan_number", 12).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("employee_profiles"))) return;
  if (!(await knex.schema.hasColumn("employee_profiles", "uan_number"))) return;
  await knex.schema.alterTable("employee_profiles", (t) => {
    t.dropColumn("uan_number");
  });
}
