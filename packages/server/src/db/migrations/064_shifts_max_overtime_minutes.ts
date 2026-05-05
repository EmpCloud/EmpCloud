// =============================================================================
// MIGRATION 064 — Shifts: max_overtime_minutes
//
// Adds a per-shift configurable overtime cap. Used by the attendance service
// to determine how long after a shift's nominal end an open attendance row
// is still considered "active" (so the user sees Check Out, not a phantom
// new Check In on the next calendar day).
//
// Default 0 = no per-shift cap; the resolver falls back to a 12h buffer.
// Idempotent.
// =============================================================================

import { Knex } from "knex";

const TABLE = "shifts";
const COL = "max_overtime_minutes";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TABLE))) return;
  if (await knex.schema.hasColumn(TABLE, COL)) return;
  await knex.schema.alterTable(TABLE, (t) => {
    t.integer(COL).unsigned().notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TABLE))) return;
  if (!(await knex.schema.hasColumn(TABLE, COL))) return;
  await knex.schema.alterTable(TABLE, (t) => {
    t.dropColumn(COL);
  });
}
