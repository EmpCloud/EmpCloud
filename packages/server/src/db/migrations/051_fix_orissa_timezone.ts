// =============================================================================
// MIGRATION 051 — Correct Orissa/Odisha location timezone
//
// Issue #1641: organization_locations rows named Orissa/Odisha were created
// with timezone="Europe/London" (the form's default), producing a 5.5h skew
// on every attendance and shift calculation tied to those locations. The
// timezone column is user-supplied (no auto-mapping in createLocation), so
// this is a data fix, not a schema change.
//
// Idempotent: matches only rows still on Europe/London with an Orissa/Odisha
// name. Rerunning after manual corrections is a no-op.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("organization_locations"))) return;

  await knex("organization_locations")
    .whereRaw("LOWER(TRIM(name)) IN (?, ?)", ["orissa", "odisha"])
    .andWhere({ timezone: "Europe/London" })
    .update({ timezone: "Asia/Kolkata", updated_at: knex.fn.now() });
}

export async function down(_knex: Knex): Promise<void> {
  // Reverting a wrong-to-right correction would reintroduce the bug. No-op.
}
