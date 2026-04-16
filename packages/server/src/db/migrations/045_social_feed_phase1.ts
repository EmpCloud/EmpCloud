// =============================================================================
// MIGRATION 045 — Social Feed Phase 1
//
// Adds soft-delete, edited_at, media payload, comments_disabled and is_flagged
// columns to forum_posts and forum_replies so the existing forum tables can
// back the new Social Feed module. Also adds an index optimised for the
// cross-category feed query (organization_id, deleted_at, created_at DESC).
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- forum_posts ----
  await knex.schema.alterTable("forum_posts", (t) => {
    t.timestamp("edited_at").nullable();
    t.timestamp("deleted_at").nullable();
    t.json("media").nullable();
    t.boolean("comments_disabled").notNullable().defaultTo(false);
    t.boolean("is_flagged").notNullable().defaultTo(false);
  });

  // Index for the global feed scan (org scoped, non-deleted, newest first)
  await knex.raw(
    "CREATE INDEX forum_posts_feed_idx ON forum_posts (organization_id, deleted_at, created_at DESC)"
  );

  // ---- forum_replies ----
  await knex.schema.alterTable("forum_replies", (t) => {
    t.timestamp("edited_at").nullable();
    t.timestamp("deleted_at").nullable();
    t.boolean("is_flagged").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX forum_posts_feed_idx ON forum_posts");
  await knex.schema.alterTable("forum_posts", (t) => {
    t.dropColumn("edited_at");
    t.dropColumn("deleted_at");
    t.dropColumn("media");
    t.dropColumn("comments_disabled");
    t.dropColumn("is_flagged");
  });
  await knex.schema.alterTable("forum_replies", (t) => {
    t.dropColumn("edited_at");
    t.dropColumn("deleted_at");
    t.dropColumn("is_flagged");
  });
}
