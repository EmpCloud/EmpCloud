// =============================================================================
// MIGRATION 078 — Chat Message Reactions
//
// Emoji reactions on messages (👍 ❤️ 😂 …). One row per (message, user, emoji);
// a user can react with several different emoji to the same message but only
// once per emoji (the UNIQUE constraint makes toggling idempotent). Rows CASCADE
// when the message is hard-deleted.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (await knex.schema.hasTable("chat_message_reactions")) return;

  await knex.schema.createTable("chat_message_reactions", (t) => {
    t.bigIncrements("id").unsigned().primary();
    t.bigInteger("message_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("chat_messages")
      .onDelete("CASCADE");
    // Denormalized for fast per-conversation cleanup / queries.
    t.bigInteger("conversation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("conversations")
      .onDelete("CASCADE");
    t.bigInteger("user_id").unsigned().notNullable();
    // The emoji grapheme (e.g. "👍"). Short varchar covers multi-codepoint emoji.
    t.string("emoji", 32).notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    // One reaction per (message, user, emoji) — toggling is idempotent.
    t.unique(["message_id", "user_id", "emoji"]);
    t.index(["message_id"]);
    t.index(["conversation_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("chat_message_reactions");
}
