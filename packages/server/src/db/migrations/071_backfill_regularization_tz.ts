// =============================================================================
// MIGRATION 071 — DISABLED (do not run)
//
// This migration originally back-shifted regularization requested times by the
// row's timezone offset, on the assumption that EVERY existing row was raw
// wall-clock. That assumption was WRONG: by the time it ran, prod already held
// a mix of (a) genuinely raw legacy rows AND (b) rows already stored as correct
// UTC instants (created once the timezone-conversion code was live). It shifted
// the already-correct instants by -5:30 too, corrupting them (e.g. a 22:00 IST
// request stored 16:30Z became 11:00Z).
//
// It has therefore been NEUTRALISED to a no-op so it can never modify data
// again — on the already-migrated servers (marker present), on a fresh DB, in a
// new environment, or if the `_migration_state` marker is ever cleared.
//
// The file/number is kept (not deleted) so the migration sequence isn't reused.
// The corrupted prod rows are repaired by a separate, precisely-scoped
// corrective migration, not by re-running anything here.
// =============================================================================

import type { Knex } from "knex";

export async function up(_knex: Knex): Promise<void> {
  // Intentionally does nothing. See header — this migration corrupted data and
  // is permanently disabled.
}

export async function down(_knex: Knex): Promise<void> {
  // No-op.
}
