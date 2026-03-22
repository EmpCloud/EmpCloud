// =============================================================================
// MIGRATION 009 — Announcements & Announcement Reads
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Announcements ----
  if (!(await knex.schema.hasTable("announcements"))) {
    await knex.schema.createTable("announcements", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("title", 255).notNullable();
      t.text("content").notNullable();
      t.string("priority", 10).notNullable().defaultTo("normal");
      t.string("target_type", 20).notNullable().defaultTo("all");
      t.text("target_ids").nullable(); // JSON array of department/role IDs
      t.timestamp("published_at").nullable();
      t.timestamp("expires_at").nullable();
      t.bigInteger("created_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users");
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "is_active", "published_at"]);
      t.index(["organization_id", "priority"]);
      t.index(["created_by"]);
    });
  }

  // ---- Announcement Reads ----
  if (!(await knex.schema.hasTable("announcement_reads"))) {
    await knex.schema.createTable("announcement_reads", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("announcement_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("announcements")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.timestamp("read_at").defaultTo(knex.fn.now());
      t.unique(["announcement_id", "user_id"]);
      t.index(["user_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("announcement_reads");
  await knex.schema.dropTableIfExists("announcements");
}
