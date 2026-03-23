// =============================================================================
// MIGRATION 013 — Onboarding Status
// Adds onboarding tracking columns to organizations table.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasCompleted = await knex.schema.hasColumn("organizations", "onboarding_completed");
  if (!hasCompleted) {
    await knex.schema.alterTable("organizations", (t) => {
      t.boolean("onboarding_completed").notNullable().defaultTo(false);
      t.integer("onboarding_step").notNullable().defaultTo(0);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCompleted = await knex.schema.hasColumn("organizations", "onboarding_completed");
  if (hasCompleted) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("onboarding_completed");
      t.dropColumn("onboarding_step");
    });
  }
}
