// =============================================================================
// MIGRATION 082 — Pinned messages
//
// Adds `pinned_at` / `pinned_by` to chat_messages. A pinned message is
// highlighted at the top of the conversation for everyone. NULL = not pinned.
// Any participant may pin/unpin (consistent with the chat's flat permissions).
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (await knex.schema.hasColumn("chat_messages", "pinned_at")) return;
  await knex.schema.alterTable("chat_messages", (t) => {
    t.timestamp("pinned_at").nullable();
    t.bigInteger("pinned_by").unsigned().nullable();
    t.index(["conversation_id", "pinned_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (!(await knex.schema.hasColumn("chat_messages", "pinned_at"))) return;
  await knex.schema.alterTable("chat_messages", (t) => {
    t.dropColumn("pinned_at");
    t.dropColumn("pinned_by");
  });
}
