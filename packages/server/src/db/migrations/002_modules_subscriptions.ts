// =============================================================================
// MIGRATION 002 — Module Registry & Subscriptions
// Module marketplace, org subscriptions, and seat assignments.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Modules ----
  if (!(await knex.schema.hasTable("modules"))) {
    await knex.schema.createTable("modules", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("name", 100).notNullable();
      t.string("slug", 50).notNullable().unique();
      t.string("description", 500).nullable();
      t.string("base_url", 255).notNullable();
      t.string("icon", 255).nullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.boolean("has_free_tier").notNullable().defaultTo(false);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  // ---- Module Features ----
  if (!(await knex.schema.hasTable("module_features"))) {
    await knex.schema.createTable("module_features", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("module_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("modules")
        .onDelete("CASCADE");
      t.string("feature_key", 100).notNullable();
      t.string("name", 200).notNullable();
      t.string("description", 500).nullable();
      t.string("min_plan_tier", 20).notNullable().defaultTo("free");
      t.boolean("is_active").notNullable().defaultTo(true);
      t.unique(["module_id", "feature_key"]);
      t.index(["module_id"]);
    });
  }

  // ---- Org Subscriptions ----
  if (!(await knex.schema.hasTable("org_subscriptions"))) {
    await knex.schema.createTable("org_subscriptions", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("module_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("modules")
        .onDelete("CASCADE");
      t.string("plan_tier", 20).notNullable().defaultTo("basic");
      t.string("status", 20).notNullable().defaultTo("active");
      t.integer("total_seats").notNullable().defaultTo(0);
      t.integer("used_seats").notNullable().defaultTo(0);
      t.string("billing_cycle", 20).notNullable().defaultTo("monthly");
      t.bigInteger("price_per_seat").notNullable().defaultTo(0); // smallest currency unit
      t.string("currency", 3).notNullable().defaultTo("USD");
      t.timestamp("trial_ends_at").nullable();
      t.timestamp("current_period_start").notNullable();
      t.timestamp("current_period_end").notNullable();
      t.timestamp("cancelled_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(["organization_id", "module_id"]);
      t.index(["organization_id", "status"]);
    });
  }

  // ---- Org Module Seats ----
  if (!(await knex.schema.hasTable("org_module_seats"))) {
    await knex.schema.createTable("org_module_seats", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("subscription_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("org_subscriptions")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("module_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("modules")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.bigInteger("assigned_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users");
      t.timestamp("assigned_at").defaultTo(knex.fn.now());
      t.unique(["module_id", "user_id"]);
      t.index(["organization_id", "module_id"]);
      t.index(["subscription_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tables = ["org_module_seats", "org_subscriptions", "module_features", "modules"];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
