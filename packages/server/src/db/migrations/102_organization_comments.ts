// =============================================================================
// MIGRATION 102 — Organization Comments (super-admin notes)
//
// Free-text notes super admins keep against a tenant on the org detail page —
// support context, billing arrangements, churn risk, who to call. Separate from
// audit_logs: those record what the system did, these record what an operator
// wants the next operator to know.
//
// The author is stored twice on purpose: `author_user_id` is the live link
// (nulled if that admin's account is removed) and `author_name` is a snapshot so
// an old note still says who wrote it after the account is gone.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("organization_comments")) return;

  await knex.schema.createTable("organization_comments", (t) => {
    t.bigIncrements("id").unsigned().primary();
    t.bigInteger("organization_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.bigInteger("author_user_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    t.string("author_name", 150).nullable();
    t.text("comment").notNullable();
    // Set the first time a comment is edited, so the UI can show "edited".
    t.timestamp("edited_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
    // Newest-first listing for one org.
    t.index(["organization_id", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("organization_comments");
}
