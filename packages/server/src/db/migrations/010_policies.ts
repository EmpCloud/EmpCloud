// =============================================================================
// MIGRATION 010 — Company Policies & Acknowledgments
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Company Policies ----
  if (!(await knex.schema.hasTable("company_policies"))) {
    await knex.schema.createTable("company_policies", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("title", 255).notNullable();
      t.text("content").notNullable();
      t.integer("version").unsigned().notNullable().defaultTo(1);
      t.string("category", 50).nullable();
      t.date("effective_date").nullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.bigInteger("created_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "is_active"]);
      t.index(["category"]);
    });
  }

  // ---- Policy Acknowledgments ----
  if (!(await knex.schema.hasTable("policy_acknowledgments"))) {
    await knex.schema.createTable("policy_acknowledgments", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("policy_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("company_policies")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.timestamp("acknowledged_at").defaultTo(knex.fn.now());
      t.unique(["policy_id", "user_id"]);
      t.index(["user_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("policy_acknowledgments");
  await knex.schema.dropTableIfExists("company_policies");
}
