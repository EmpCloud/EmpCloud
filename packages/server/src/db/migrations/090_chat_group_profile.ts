// =============================================================================
// MIGRATION 084 — Group avatar + description
//
// Adds `description` and `avatar_path` to conversations so groups can have a
// short description and a photo. Both nullable; only meaningful for type=group.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("conversations"))) return;
  const hasDesc = await knex.schema.hasColumn("conversations", "description");
  const hasAvatar = await knex.schema.hasColumn("conversations", "avatar_path");
  if (hasDesc && hasAvatar) return;
  await knex.schema.alterTable("conversations", (t) => {
    if (!hasDesc) t.string("description", 500).nullable();
    if (!hasAvatar) t.string("avatar_path", 500).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("conversations"))) return;
  const hasDesc = await knex.schema.hasColumn("conversations", "description");
  const hasAvatar = await knex.schema.hasColumn("conversations", "avatar_path");
  await knex.schema.alterTable("conversations", (t) => {
    if (hasDesc) t.dropColumn("description");
    if (hasAvatar) t.dropColumn("avatar_path");
  });
}
