// =============================================================================
// MIGRATION 105 — Leave types: "allowed during probation" flag
//
// The probation gate in leave-application.service used to keyword-match a leave
// type's name/code against ["sick","emergency","sl","eml"] to decide what a
// probationer could apply for. That was brittle (an org whose "Emergency" leave
// is named "Earned Leave" got it wrongly blocked) and not configurable.
//
// Replace it with an explicit per-leave-type flag HR can toggle. Backfill
// preserves TODAY's behaviour exactly: every existing type that the keyword gate
// already allowed (name/code contains sick/emergency/sl/eml) is set allowed; all
// others stay blocked. Default for NEW types is 0 (blocked) so no org's policy
// changes silently — HR opts a type in.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("leave_types"))) return;

  if (!(await knex.schema.hasColumn("leave_types", "allowed_during_probation"))) {
    await knex.schema.alterTable("leave_types", (t) => {
      t.boolean("allowed_during_probation").notNullable().defaultTo(false);
    });
  }

  // Preserve the old keyword gate's allowed set: sick / emergency leaves.
  await knex("leave_types")
    .where(function () {
      const like = (col: string, kw: string) =>
        knex.raw("LOWER(??) LIKE ?", [col, `%${kw}%`]);
      for (const kw of ["sick", "emergency", "sl", "eml"]) {
        this.orWhere(like("name", kw)).orWhere(like("code", kw));
      }
    })
    .update({ allowed_during_probation: true });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn("leave_types", "allowed_during_probation")) {
    await knex.schema.alterTable("leave_types", (t) => {
      t.dropColumn("allowed_during_probation");
    });
  }
}
