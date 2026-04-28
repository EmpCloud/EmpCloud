// =============================================================================
// MIGRATION 053 — Clean up duplicate emp_code values within an org
//
// Issue #1658 — production tenants reported two employees in the same org
// sharing the same emp_code (EM526 used by both "Arjun sharma" and
// "Vikash Yadav"). The follow-up migration 054 adds
// UNIQUE(organization_id, emp_code), which would fail on this dirty
// dataset. This prerequisite cleans things up:
//
//   - For each (organization_id, emp_code) with > 1 row, keep the row
//     with the earliest created_at and suffix the rest's emp_code with
//     "-DUP-<id>" so admins can recognise and re-key them.
//   - Empty / null emp_code is left alone — UNIQUE(_, NULL) allows
//     multiple in MySQL, so missing codes don't conflict.
//
// Idempotent: a second pass against an already-clean dataset matches
// no rows and is a no-op.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;

  // Step 0: empty-string emp_codes are treated as a *value* by a MySQL
  // UNIQUE index (only NULL repeats freely). Normalise blanks/whitespace
  // to NULL so the new constraint doesn't collide on tenants where many
  // users have just never been assigned a code.
  await knex("users")
    .whereNotNull("emp_code")
    .andWhereRaw("TRIM(emp_code) = ''")
    .update({ emp_code: null, updated_at: new Date() });

  // Find every (org_id, emp_code) pair that's used by more than one
  // active user. Limiting to non-null/non-empty emp_codes since NULL is
  // permitted to repeat under the new constraint.
  const dups = (await knex("users")
    .whereNotNull("emp_code")
    .andWhere("emp_code", "!=", "")
    .select("organization_id", "emp_code")
    .count("* as count")
    .groupBy("organization_id", "emp_code")
    .having(knex.raw("COUNT(*) > 1"))) as unknown as Array<{
    organization_id: number;
    emp_code: string;
  }>;

  if (dups.length === 0) return;

  for (const { organization_id, emp_code } of dups) {
    // For this org+code, fetch all the rows ordered by created_at asc.
    // First row keeps the original code; later rows get suffixed.
    const rows = await knex("users")
      .where({ organization_id, emp_code })
      .orderBy("created_at", "asc")
      .select("id");

    for (let i = 1; i < rows.length; i++) {
      const u = rows[i];
      const newCode = `${emp_code}-DUP-${u.id}`;
      await knex("users").where({ id: u.id }).update({
        emp_code: newCode,
        updated_at: new Date(),
      });
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // One-way data fix; restoring duplicates would reintroduce the bug.
}
