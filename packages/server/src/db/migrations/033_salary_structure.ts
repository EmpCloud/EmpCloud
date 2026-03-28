// =============================================================================
// MIGRATION 033 — Salary Structure columns on employee_profiles
// Stores monthly salary breakup for payroll rule validation.
// All amounts are in the smallest currency unit (paise for INR).
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasCTC = await knex.schema.hasColumn("employee_profiles", "salary_ctc");
  if (!hasCTC) {
    await knex.schema.alterTable("employee_profiles", (t) => {
      t.bigInteger("salary_ctc").unsigned().nullable().comment("Monthly CTC in paise");
      t.bigInteger("salary_basic").unsigned().nullable().comment("Monthly basic pay in paise");
      t.bigInteger("salary_hra").unsigned().nullable().comment("Monthly HRA in paise");
      t.bigInteger("salary_da").unsigned().nullable().comment("Monthly DA in paise");
      t.bigInteger("salary_special_allowance").unsigned().nullable().comment("Monthly special allowance in paise");
      t.bigInteger("salary_gross").unsigned().nullable().comment("Monthly gross in paise");
      t.bigInteger("salary_employer_pf").unsigned().nullable().comment("Employer PF contribution in paise");
      t.bigInteger("salary_employer_esi").unsigned().nullable().comment("Employer ESI contribution in paise");
      t.bigInteger("salary_gratuity").unsigned().nullable().comment("Monthly gratuity accrual in paise");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const columns = [
    "salary_ctc",
    "salary_basic",
    "salary_hra",
    "salary_da",
    "salary_special_allowance",
    "salary_gross",
    "salary_employer_pf",
    "salary_employer_esi",
    "salary_gratuity",
  ];
  for (const col of columns) {
    const has = await knex.schema.hasColumn("employee_profiles", col);
    if (has) {
      await knex.schema.alterTable("employee_profiles", (t) => {
        t.dropColumn(col);
      });
    }
  }
}
