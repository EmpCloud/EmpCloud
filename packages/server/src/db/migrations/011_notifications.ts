// =============================================================================
// MIGRATION 011 — Notifications
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("notifications"))) {
    await knex.schema.createTable("notifications", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("type", 50).notNullable();
      t.string("title", 255).notNullable();
      t.text("body").nullable();
      t.string("reference_type", 50).nullable();
      t.string("reference_id", 100).nullable();
      t.boolean("is_read").notNullable().defaultTo(false);
      t.dateTime("read_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "user_id", "is_read", "created_at"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notifications");
}
