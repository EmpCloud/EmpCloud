// =============================================================================
// MIGRATION 067 — Shifts: is_weekoff flag
//
// Adds a per-shift flag identifying the sentinel "Week-off" shift used by
// the Shift Schedule UI to mark a specific date (or sub-range) as
// week-off without losing the surrounding shift assignment. The
// Edit Assignment modal renders shifts with is_weekoff=true distinctly
// and the grid renders the cell as an "Off" pill.
//
// One row per organization will be auto-created on first use by
// shift.service.ts:getOrCreateWeekoffShift -- this migration only adds
// the column. Default false so all existing shifts remain "working" shifts.
//
// Idempotent.
// =============================================================================

import { Knex } from "knex";

const TABLE = "shifts";
const COL = "is_weekoff";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TABLE))) return;
  if (await knex.schema.hasColumn(TABLE, COL)) return;
  await knex.schema.alterTable(TABLE, (t) => {
    t.boolean(COL).notNullable().defaultTo(false);
  });
  // Partial index would be ideal but MySQL 5.7/8 doesn't support it
  // portably; a plain index is fine since each org has at most one
  // weekoff sentinel.
  await knex.schema.alterTable(TABLE, (t) => {
    t.index(["organization_id", "is_weekoff"], "shifts_org_weekoff_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TABLE))) return;
  if (await knex.schema.hasColumn(TABLE, COL)) {
    await knex.schema.alterTable(TABLE, (t) => {
      t.dropIndex(["organization_id", "is_weekoff"], "shifts_org_weekoff_idx");
    });
    await knex.schema.alterTable(TABLE, (t) => {
      t.dropColumn(COL);
    });
  }
}
