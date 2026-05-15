// =============================================================================
// MIGRATION 069 — widen attendance_records.status
//
// Until now `attendance_records.status` was VARCHAR(20), which fit the legacy
// vocabulary ("present", "absent", "half_day", "on_leave", "checked_in",
// "weekoff", "holiday"). The new "half_present_half_leave" status used by
// the HPL ("Half Present + Half Leave") attendance code is 23 characters
// long and would silently truncate on MySQL. Widen to VARCHAR(40) which
// leaves headroom for future status codes without forcing another migration.
//
// Purely additive — no data backfill needed, and existing reads/writes that
// only ever stored up to 20 chars keep working unchanged.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("attendance_records"))) return;
  await knex.schema.alterTable("attendance_records", (t) => {
    t.string("status", 40).notNullable().defaultTo("present").alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("attendance_records"))) return;
  // Revert is best-effort: if any rows have stored a status value longer
  // than 20 chars (e.g. "half_present_half_leave"), the alter will fail
  // with a truncation error. That's a feature, not a bug — refusing to
  // silently lose data is the safer rollback.
  await knex.schema.alterTable("attendance_records", (t) => {
    t.string("status", 20).notNullable().defaultTo("present").alter();
  });
}
