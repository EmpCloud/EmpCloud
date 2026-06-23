// =============================================================================
// MIGRATION 083 — Archived conversations (per user)
//
// Adds `archived_at` to conversation_participants. When set, the conversation is
// hidden from that user's main list (it still exists; a new message un-archives
// it). NULL = not archived. Per-user, like mute.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("conversation_participants"))) return;
  if (await knex.schema.hasColumn("conversation_participants", "archived_at")) return;
  await knex.schema.alterTable("conversation_participants", (t) => {
    t.timestamp("archived_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("conversation_participants"))) return;
  if (!(await knex.schema.hasColumn("conversation_participants", "archived_at"))) return;
  await knex.schema.alterTable("conversation_participants", (t) => {
    t.dropColumn("archived_at");
  });
}
