// =============================================================================
// MIGRATION 075 — Chat @-Mentions
//
// Stores which users were @-mentioned in a message (group chats). The client
// resolves @Name to user ids from the member list and sends them explicitly, so
// the server never has to parse names. Stored as a JSON array of user ids;
// null/empty when the message mentions nobody. A sentinel value of 0 in the
// array means "@everyone" (the whole group).
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (await knex.schema.hasColumn("chat_messages", "mentioned_user_ids")) return;

  await knex.schema.alterTable("chat_messages", (t) => {
    // JSON array of mentioned user ids, e.g. [13, 14]; [0] = @everyone.
    t.json("mentioned_user_ids").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (!(await knex.schema.hasColumn("chat_messages", "mentioned_user_ids"))) return;
  await knex.schema.alterTable("chat_messages", (t) => {
    t.dropColumn("mentioned_user_ids");
  });
}
