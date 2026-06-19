// =============================================================================
// MIGRATION 073 — Chat Message Attachments
//
// Adds optional file/photo attachments to chat messages. A message may carry a
// body, an attachment, or both. The attachment file lives on disk under
// uploads/chat/{orgId}/{conversationId}/; only the relative path is stored so
// the API can serve it through an authenticated route (never the raw path).
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("chat_messages");
  if (!hasTable) return; // 072 must run first; nothing to alter otherwise.

  const hasCol = await knex.schema.hasColumn("chat_messages", "attachment_path");
  if (hasCol) return;

  await knex.schema.alterTable("chat_messages", (t) => {
    // Relative path on disk, e.g. uploads/chat/{orgId}/{conversationId}/{file}.
    t.string("attachment_path", 500).nullable();
    // Original filename as uploaded (shown to the user / used for downloads).
    t.string("attachment_name", 255).nullable();
    // Size in bytes (for the "1.2 MB" hint).
    t.bigInteger("attachment_size").unsigned().nullable();
    // MIME type — drives image-vs-file rendering and the Content-Type header.
    t.string("attachment_mime", 120).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("chat_messages");
  if (!hasTable) return;
  const hasCol = await knex.schema.hasColumn("chat_messages", "attachment_path");
  if (!hasCol) return;

  await knex.schema.alterTable("chat_messages", (t) => {
    t.dropColumn("attachment_path");
    t.dropColumn("attachment_name");
    t.dropColumn("attachment_size");
    t.dropColumn("attachment_mime");
  });
}
