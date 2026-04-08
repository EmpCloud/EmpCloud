// =============================================================================
// MIGRATION 039 — Add half_days to shifts (missed in 038)
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn("shifts", "half_days"))) {
    await knex.schema.alterTable("shifts", (t) => {
      t.string("half_days", 20).notNullable().defaultTo("");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn("shifts", "half_days")) {
    await knex.schema.alterTable("shifts", (t) => {
      t.dropColumn("half_days");
    });
  }
}
