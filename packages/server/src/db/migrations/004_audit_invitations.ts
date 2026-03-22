// =============================================================================
// MIGRATION 004 — Audit Logs & Invitations
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Audit Logs ----
  if (!(await knex.schema.hasTable("audit_logs"))) {
    await knex.schema.createTable("audit_logs", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id").unsigned().nullable().references("id").inTable("organizations").onDelete("SET NULL");
      t.bigInteger("user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
      t.string("action", 50).notNullable();
      t.string("resource_type", 50).nullable();
      t.string("resource_id", 50).nullable();
      t.text("details").nullable(); // JSON
      t.string("ip_address", 45).nullable();
      t.string("user_agent", 500).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "created_at"]);
      t.index(["user_id"]);
      t.index(["action"]);
    });
  }

  // ---- Invitations ----
  if (!(await knex.schema.hasTable("invitations"))) {
    await knex.schema.createTable("invitations", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("email", 128).notNullable();
      t.string("role", 20).notNullable().defaultTo("employee");
      t.string("first_name", 64).nullable();
      t.string("last_name", 64).nullable();
      t.bigInteger("invited_by")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users");
      t.string("token_hash", 128).notNullable().unique();
      t.string("status", 20).notNullable().defaultTo("pending");
      t.timestamp("expires_at").notNullable();
      t.timestamp("accepted_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "status"]);
      t.index(["email"]);
    });
  }

  // ---- Password Reset Tokens ----
  if (!(await knex.schema.hasTable("password_reset_tokens"))) {
    await knex.schema.createTable("password_reset_tokens", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("token_hash", 128).notNullable().unique();
      t.timestamp("expires_at").notNullable();
      t.timestamp("used_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["user_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("password_reset_tokens");
  await knex.schema.dropTableIfExists("invitations");
  await knex.schema.dropTableIfExists("audit_logs");
}
