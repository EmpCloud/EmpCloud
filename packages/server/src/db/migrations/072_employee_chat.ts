// =============================================================================
// MIGRATION 072 — Employee Chat / Private Messaging
//
// Adds private 1-on-1 and group messaging between employees in an org:
//   - conversations            : a thread (direct or group), org-scoped
//   - conversation_participants : who is in each conversation (+ per-user read state)
//   - chat_messages            : the messages in a conversation
// Read receipts and unread counts are derived from
// conversation_participants.last_read_message_id.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- conversations ----
  if (!(await knex.schema.hasTable("conversations"))) {
    await knex.schema.createTable("conversations", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      // 'direct' = exactly two people; 'group' = a named group of 3+.
      t.enum("type", ["direct", "group"]).notNullable().defaultTo("direct");
      // Only set for group conversations.
      t.string("name", 150).nullable();
      // For 'direct' conversations we store a stable key "minUserId:maxUserId"
      // so we can find/dedupe the unique conversation between two people.
      t.string("direct_key", 64).nullable();
      t.bigInteger("created_by").unsigned().notNullable();
      t.bigInteger("last_message_id").unsigned().nullable();
      t.timestamp("last_message_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id"]);
      // One direct conversation per pair per org.
      t.unique(["organization_id", "direct_key"]);
    });
  }

  // ---- conversation_participants ----
  if (!(await knex.schema.hasTable("conversation_participants"))) {
    await knex.schema.createTable("conversation_participants", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("conversation_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("conversations")
        .onDelete("CASCADE");
      t.bigInteger("user_id").unsigned().notNullable();
      // The last message this user has read — drives unread counts/receipts.
      t.bigInteger("last_read_message_id").unsigned().nullable();
      // A user can leave a group; keep the row for history but flag it.
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("joined_at").defaultTo(knex.fn.now());
      t.timestamp("last_read_at").nullable();

      t.unique(["conversation_id", "user_id"]);
      t.index(["user_id"]);
    });
  }

  // ---- chat_messages ----
  if (!(await knex.schema.hasTable("chat_messages"))) {
    await knex.schema.createTable("chat_messages", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("conversation_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("conversations")
        .onDelete("CASCADE");
      t.bigInteger("sender_id").unsigned().notNullable();
      t.text("body").notNullable();
      // Soft-delete a message ("This message was deleted").
      t.boolean("is_deleted").notNullable().defaultTo(false);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("edited_at").nullable();

      t.index(["conversation_id", "id"]);
      t.index(["sender_id"]);
    });

    // last_message_id on conversations points at chat_messages — add the FK now
    // that the table exists.
    await knex.schema.alterTable("conversations", (t) => {
      t.foreign("last_message_id")
        .references("id")
        .inTable("chat_messages")
        .onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("chat_messages");
  await knex.schema.dropTableIfExists("conversation_participants");
  await knex.schema.dropTableIfExists("conversations");
}
