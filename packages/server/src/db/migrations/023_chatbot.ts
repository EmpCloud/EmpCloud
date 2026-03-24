// =============================================================================
// MIGRATION 023 — AI HR Chatbot
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("chatbot_conversations"))) {
    await knex.schema.createTable("chatbot_conversations", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("title", 255).nullable();
      t.enum("status", ["active", "archived"]).notNullable().defaultTo("active");
      t.integer("message_count").notNullable().defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "user_id", "status"]);
    });
  }

  if (!(await knex.schema.hasTable("chatbot_messages"))) {
    await knex.schema.createTable("chatbot_messages", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("conversation_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("chatbot_conversations")
        .onDelete("CASCADE");
      t.bigInteger("organization_id").unsigned().notNullable();
      t.enum("role", ["user", "assistant", "system"]).notNullable();
      t.text("content").notNullable();
      t.json("metadata").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.index(["conversation_id", "created_at"]);
      t.index(["organization_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("chatbot_messages");
  await knex.schema.dropTableIfExists("chatbot_conversations");
}
