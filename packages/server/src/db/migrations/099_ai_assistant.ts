import { Knex } from "knex";
import { SYSTEM_ROLE_DEFAULTS } from "@empcloud/shared";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("assistant_conversations"))) {
    await knex.schema.createTable("assistant_conversations", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id").unsigned().notNullable().references("id").inTable("organizations").onDelete("CASCADE");
      t.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
      t.string("title", 255).nullable();
      t.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
      t.dateTime("updated_at").notNullable().defaultTo(knex.fn.now());
      t.dateTime("archived_at").nullable();
      t.index(["organization_id", "user_id", "updated_at"], "idx_assistant_conversation_owner");
    });
  }
  if (!(await knex.schema.hasTable("assistant_messages"))) {
    await knex.schema.createTable("assistant_messages", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id").unsigned().notNullable().references("id").inTable("organizations").onDelete("CASCADE");
      t.bigInteger("conversation_id").unsigned().notNullable().references("id").inTable("assistant_conversations").onDelete("CASCADE");
      t.enum("role", ["user", "assistant"]).notNullable();
      t.text("content").notNullable();
      t.json("tools_used").nullable();
      t.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
      t.index(["organization_id", "conversation_id", "id"], "idx_assistant_message_conversation");
    });
  }

  if (await knex.schema.hasTable("roles")) {
    for (const [name, permissions] of Object.entries(SYSTEM_ROLE_DEFAULTS)) {
      await knex("roles").whereNull("organization_id").andWhere({ name, type: 0 }).update({
        permissions: JSON.stringify(permissions),
        updated_at: new Date(),
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("assistant_messages");
  await knex.schema.dropTableIfExists("assistant_conversations");
}
