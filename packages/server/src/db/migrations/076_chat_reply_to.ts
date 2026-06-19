// =============================================================================
// MIGRATION 076 — Chat Reply / Quoted Messages
//
// Adds an optional self-referential FK so a message can quote/reply to an
// earlier message in the same conversation. SET NULL on delete so deleting the
// quoted message doesn't cascade-delete the reply (the quote just goes stale).
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (await knex.schema.hasColumn("chat_messages", "reply_to_message_id")) return;

  await knex.schema.alterTable("chat_messages", (t) => {
    t.bigInteger("reply_to_message_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("chat_messages")
      .onDelete("SET NULL");
    t.index(["reply_to_message_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (!(await knex.schema.hasColumn("chat_messages", "reply_to_message_id"))) return;
  await knex.schema.alterTable("chat_messages", (t) => {
    t.dropForeign(["reply_to_message_id"]);
    t.dropColumn("reply_to_message_id");
  });
}
