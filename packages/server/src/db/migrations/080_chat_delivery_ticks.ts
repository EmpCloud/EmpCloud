// =============================================================================
// MIGRATION 074 — Chat Delivery / Read Ticks
//
// Adds WhatsApp-style delivery + read receipts to chat, purely ADDITIVELY:
//   - conversation_participants.last_delivered_message_id : a "delivered" high-
//     water marker that mirrors the existing last_read_message_id "read" marker.
//     Aggregate single/double/blue ticks are computed from these two markers
//     (O(participants)), so the existing unread-count logic is UNTOUCHED.
//   - chat_message_receipts : a per-(message, recipient) ledger, written lazily
//     (only when a real delivered/read event names a message) and read only for
//     the on-demand group "Read by / Delivered to" breakdown panel.
//
// Guarded + reversible, mirroring migration 073.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Layer 1: delivered high-water marker on participants ----
  if (await knex.schema.hasTable("conversation_participants")) {
    const hasCol = await knex.schema.hasColumn(
      "conversation_participants",
      "last_delivered_message_id",
    );
    if (!hasCol) {
      await knex.schema.alterTable("conversation_participants", (t) => {
        // Highest message id this user's device has received (delivered).
        t.bigInteger("last_delivered_message_id").unsigned().nullable();
        // Informational, like last_read_at.
        t.timestamp("last_delivered_at").nullable();
      });
    }
  }

  // ---- Layer 2: per-recipient receipt ledger ----
  if (!(await knex.schema.hasTable("chat_message_receipts"))) {
    await knex.schema.createTable("chat_message_receipts", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("message_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("chat_messages")
        .onDelete("CASCADE");
      // Denormalized for fast conversation rollups + CASCADE cleanup.
      t.bigInteger("conversation_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("conversations")
        .onDelete("CASCADE");
      // The recipient (never the sender).
      t.bigInteger("recipient_id").unsigned().notNullable();
      t.timestamp("delivered_at").nullable();
      t.timestamp("read_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      // Idempotency key — the heart of correctness. One row per (message, recipient).
      t.unique(["message_id", "recipient_id"]);
      t.index(["conversation_id", "message_id"]);
      t.index(["recipient_id", "message_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("chat_message_receipts");
  if (await knex.schema.hasTable("conversation_participants")) {
    const hasCol = await knex.schema.hasColumn(
      "conversation_participants",
      "last_delivered_message_id",
    );
    if (hasCol) {
      await knex.schema.alterTable("conversation_participants", (t) => {
        t.dropColumn("last_delivered_message_id");
        t.dropColumn("last_delivered_at");
      });
    }
  }
}
