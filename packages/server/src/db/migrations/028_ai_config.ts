// =============================================================================
// MIGRATION 028 — AI Configuration
// Platform-level AI provider settings stored in the database.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("ai_config"))) {
    await knex.schema.createTable("ai_config", (t) => {
      t.increments("id").primary();
      t.string("config_key", 50).notNullable().unique();
      t.text("config_value").nullable();
      t.boolean("is_active").notNullable().defaultTo(false);
      t.integer("updated_by").unsigned().nullable();
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });

    // Seed default config rows
    await knex("ai_config").insert([
      { config_key: "active_provider", config_value: "none", is_active: true },
      { config_key: "anthropic_api_key", config_value: null, is_active: false },
      { config_key: "openai_api_key", config_value: null, is_active: false },
      { config_key: "openai_base_url", config_value: null, is_active: false },
      { config_key: "gemini_api_key", config_value: null, is_active: false },
      { config_key: "ai_model", config_value: "claude-sonnet-4-20250514", is_active: true },
      { config_key: "ai_max_tokens", config_value: "4096", is_active: true },
    ]);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_config");
}
