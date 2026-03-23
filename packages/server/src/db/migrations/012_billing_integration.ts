// =============================================================================
// MIGRATION 012 — Billing Integration Mappings
// Maps EMP Cloud organizations/subscriptions to EMP Billing client/subscription IDs.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("billing_client_mappings"))) {
    await knex.schema.createTable("billing_client_mappings", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("billing_client_id", 255).notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.unique(["organization_id"]);
    });
  }

  if (!(await knex.schema.hasTable("billing_subscription_mappings"))) {
    await knex.schema.createTable("billing_subscription_mappings", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("cloud_subscription_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("org_subscriptions")
        .onDelete("CASCADE");
      t.string("billing_subscription_id", 255).notNullable();
      t.string("billing_plan_id", 255).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.unique(["cloud_subscription_id"]);
      t.index(["organization_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("billing_subscription_mappings");
  await knex.schema.dropTableIfExists("billing_client_mappings");
}
