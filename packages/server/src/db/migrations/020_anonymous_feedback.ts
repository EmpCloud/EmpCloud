// =============================================================================
// MIGRATION 020 — Anonymous Feedback
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("anonymous_feedback"))) {
    await knex.schema.createTable("anonymous_feedback", (t) => {
      t.increments("id").unsigned().primary();
      t.integer("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.enum("category", [
        "workplace",
        "management",
        "process",
        "culture",
        "harassment",
        "safety",
        "suggestion",
        "other",
      ]).notNullable();
      t.string("subject", 255).notNullable();
      t.text("message").notNullable();
      t.enum("sentiment", ["positive", "neutral", "negative"]).nullable();
      t.enum("status", [
        "new",
        "acknowledged",
        "under_review",
        "resolved",
        "archived",
      ])
        .notNullable()
        .defaultTo("new");
      t.text("admin_response").nullable();
      t.integer("responded_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users");
      t.datetime("responded_at").nullable();
      t.boolean("is_urgent").notNullable().defaultTo(false);
      t.string("anonymous_hash", 64).notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "status"]);
      t.index(["organization_id", "category"]);
      t.index(["anonymous_hash"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("anonymous_feedback");
}
