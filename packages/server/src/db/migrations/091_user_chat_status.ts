// =============================================================================
// MIGRATION 085 — User chat status / "About"
//
// Adds `chat_status` to users — a short self-set status line (like WhatsApp's
// "About") shown under a person's name in 1:1 chats. NULL = none.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;
  if (await knex.schema.hasColumn("users", "chat_status")) return;
  await knex.schema.alterTable("users", (t) => {
    t.string("chat_status", 140).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("users"))) return;
  if (!(await knex.schema.hasColumn("users", "chat_status"))) return;
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("chat_status");
  });
}
