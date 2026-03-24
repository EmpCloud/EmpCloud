// =============================================================================
// MIGRATION 024 — Social Intranet / Discussion Forums
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Forum Categories ----
  if (!(await knex.schema.hasTable("forum_categories"))) {
    await knex.schema.createTable("forum_categories", (t) => {
      t.increments("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("name", 100).notNullable();
      t.text("description").nullable();
      t.string("icon", 50).nullable();
      t.integer("sort_order").defaultTo(0);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.integer("post_count").unsigned().defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "is_active"]);
    });
  }

  // ---- Forum Posts ----
  if (!(await knex.schema.hasTable("forum_posts"))) {
    await knex.schema.createTable("forum_posts", (t) => {
      t.increments("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.integer("category_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("forum_categories")
        .onDelete("CASCADE");
      t.bigInteger("author_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("title", 255).notNullable();
      t.text("content").notNullable();
      t.enum("post_type", ["discussion", "question", "idea", "poll"])
        .notNullable()
        .defaultTo("discussion");
      t.boolean("is_pinned").notNullable().defaultTo(false);
      t.boolean("is_locked").notNullable().defaultTo(false);
      t.integer("view_count").unsigned().defaultTo(0);
      t.integer("like_count").unsigned().defaultTo(0);
      t.integer("reply_count").unsigned().defaultTo(0);
      t.json("tags").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "category_id", "created_at"]);
      t.index(["organization_id", "author_id"]);
    });
  }

  // ---- Forum Replies ----
  if (!(await knex.schema.hasTable("forum_replies"))) {
    await knex.schema.createTable("forum_replies", (t) => {
      t.increments("id").unsigned().primary();
      t.integer("post_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("forum_posts")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("author_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.text("content").notNullable();
      t.integer("parent_reply_id").unsigned().nullable();
      t.integer("like_count").unsigned().defaultTo(0);
      t.boolean("is_accepted").notNullable().defaultTo(false);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["post_id", "created_at"]);
    });
  }

  // ---- Forum Likes ----
  if (!(await knex.schema.hasTable("forum_likes"))) {
    await knex.schema.createTable("forum_likes", (t) => {
      t.increments("id").unsigned().primary();
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
      t.enum("target_type", ["post", "reply"]).notNullable();
      t.integer("target_id").unsigned().notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.unique(["user_id", "target_type", "target_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("forum_likes");
  await knex.schema.dropTableIfExists("forum_replies");
  await knex.schema.dropTableIfExists("forum_posts");
  await knex.schema.dropTableIfExists("forum_categories");
}
