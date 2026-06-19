// =============================================================================
// MIGRATION 080 — Chat system messages
//
// Adds an `is_system` flag to chat_messages. System messages narrate group
// events ("X left the group", "Y was removed", "Z created the group") inline in
// the conversation. They have a body but no real author interaction — no ticks,
// reactions, replies, edit/delete, or notifications. `sender_id` records who
// triggered the event (for reference), but the client renders them centered and
// author-less.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (await knex.schema.hasColumn("chat_messages", "is_system")) return;
  await knex.schema.alterTable("chat_messages", (t) => {
    t.boolean("is_system").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (!(await knex.schema.hasColumn("chat_messages", "is_system"))) return;
  await knex.schema.alterTable("chat_messages", (t) => {
    t.dropColumn("is_system");
  });
}
