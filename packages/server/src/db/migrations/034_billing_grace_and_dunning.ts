// =============================================================================
// MIGRATION 034 — Billing Grace Period & Dunning Workflow
// Adds grace_period_days to organizations, dunning tracking to subscriptions.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add grace_period_days to organizations (default 0 = no grace)
  const hasGracePeriod = await knex.schema.hasColumn("organizations", "grace_period_days");
  if (!hasGracePeriod) {
    await knex.schema.alterTable("organizations", (t) => {
      t.integer("grace_period_days")
        .notNullable()
        .defaultTo(0)
        .comment("Days after period end before overdue enforcement begins");
    });
  }

  // Add dunning tracking columns to org_subscriptions
  const hasDunningStage = await knex.schema.hasColumn("org_subscriptions", "dunning_stage");
  if (!hasDunningStage) {
    await knex.schema.alterTable("org_subscriptions", (t) => {
      t.string("dunning_stage", 20)
        .nullable()
        .defaultTo("current")
        .comment("Dunning stage: current, reminder, warning, suspended, deactivated");
      t.timestamp("dunning_last_action_at")
        .nullable()
        .comment("Timestamp of last dunning action taken");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGracePeriod = await knex.schema.hasColumn("organizations", "grace_period_days");
  if (hasGracePeriod) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("grace_period_days");
    });
  }

  const hasDunningStage = await knex.schema.hasColumn("org_subscriptions", "dunning_stage");
  if (hasDunningStage) {
    await knex.schema.alterTable("org_subscriptions", (t) => {
      t.dropColumn("dunning_stage");
      t.dropColumn("dunning_last_action_at");
    });
  }
}
