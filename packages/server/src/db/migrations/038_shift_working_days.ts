// =============================================================================
// MIGRATION 038 — Add working_days to shifts + currency to organizations
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add working_days and half_days to shifts
  if (!(await knex.schema.hasColumn("shifts", "working_days"))) {
    await knex.schema.alterTable("shifts", (t) => {
      // Comma-separated day numbers: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
      // Default "1,2,3,4,5" = Mon-Fri
      t.string("working_days", 20).notNullable().defaultTo("1,2,3,4,5");
      // Days that are half-day (e.g., "6" for Saturday half day)
      t.string("half_days", 20).notNullable().defaultTo("");
    });
  }

  // Add currency to organizations (used by billing/pricing)
  if (!(await knex.schema.hasColumn("organizations", "currency"))) {
    await knex.schema.alterTable("organizations", (t) => {
      t.string("currency", 3).defaultTo("INR");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn("shifts", "working_days")) {
    await knex.schema.alterTable("shifts", (t) => {
      t.dropColumn("working_days");
      t.dropColumn("half_days");
    });
  }
  if (await knex.schema.hasColumn("organizations", "currency")) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("currency");
    });
  }
}
