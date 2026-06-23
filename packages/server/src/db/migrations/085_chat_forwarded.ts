// =============================================================================
// MIGRATION 079 — Chat Message Forwarding provenance
//
// When a message is forwarded into another conversation we store the ORIGINAL
// sender's display name so the new message can render a "Forwarded from …"
// header. We deliberately snapshot the name (not a FK) so it survives the
// source message/user being deleted or removed.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (await knex.schema.hasColumn("chat_messages", "forwarded_from_name")) return;
  await knex.schema.alterTable("chat_messages", (t) => {
    t.string("forwarded_from_name", 150).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chat_messages"))) return;
  if (!(await knex.schema.hasColumn("chat_messages", "forwarded_from_name"))) return;
  await knex.schema.alterTable("chat_messages", (t) => {
    t.dropColumn("forwarded_from_name");
  });
}
