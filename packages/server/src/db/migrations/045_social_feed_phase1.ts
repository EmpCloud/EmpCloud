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
  // Idempotency: KnexAdapter re-runs every migration on each server start.
  // Without per-column hasColumn guards each restart would log a noisy
  // "Duplicate column name" warning for every column already added on the
  // first run (caught + warned, never fatal — but pollutes the log).

  // ---- forum_posts ----
  const fpCols = {
    edited_at: await knex.schema.hasColumn("forum_posts", "edited_at"),
    deleted_at: await knex.schema.hasColumn("forum_posts", "deleted_at"),
    media: await knex.schema.hasColumn("forum_posts", "media"),
    comments_disabled: await knex.schema.hasColumn("forum_posts", "comments_disabled"),
    is_flagged: await knex.schema.hasColumn("forum_posts", "is_flagged"),
  };
  if (Object.values(fpCols).some((has) => !has)) {
    await knex.schema.alterTable("forum_posts", (t) => {
      if (!fpCols.edited_at) t.timestamp("edited_at").nullable();
      if (!fpCols.deleted_at) t.timestamp("deleted_at").nullable();
      if (!fpCols.media) t.json("media").nullable();
      if (!fpCols.comments_disabled) t.boolean("comments_disabled").notNullable().defaultTo(false);
      if (!fpCols.is_flagged) t.boolean("is_flagged").notNullable().defaultTo(false);
    });
  }

  // Index for the global feed scan (org scoped, non-deleted, newest first).
  // information_schema lookup is the portable way to ask MySQL "does this
  // index exist" — knex.schema doesn't expose it directly.
  const [idxRows] = await knex.raw(
    "SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'forum_posts' AND index_name = 'forum_posts_feed_idx'",
  );
  const idxExists = Array.isArray(idxRows) ? Number(idxRows[0]?.n ?? 0) > 0 : false;
  if (!idxExists) {
    await knex.raw(
      "CREATE INDEX forum_posts_feed_idx ON forum_posts (organization_id, deleted_at, created_at DESC)",
    );
  }

  // ---- forum_replies ----
  const frCols = {
    edited_at: await knex.schema.hasColumn("forum_replies", "edited_at"),
    deleted_at: await knex.schema.hasColumn("forum_replies", "deleted_at"),
    is_flagged: await knex.schema.hasColumn("forum_replies", "is_flagged"),
  };
  if (Object.values(frCols).some((has) => !has)) {
    await knex.schema.alterTable("forum_replies", (t) => {
      if (!frCols.edited_at) t.timestamp("edited_at").nullable();
      if (!frCols.deleted_at) t.timestamp("deleted_at").nullable();
      if (!frCols.is_flagged) t.boolean("is_flagged").notNullable().defaultTo(false);
    });
  }
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
