// =============================================================================
// MIGRATION 003 — OAuth2 / OIDC Tables
// OAuth clients, authorization codes, tokens, signing keys.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- OAuth Clients ----
  if (!(await knex.schema.hasTable("oauth_clients"))) {
    await knex.schema.createTable("oauth_clients", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("client_id", 64).notNullable().unique();
      t.string("client_secret_hash", 512).nullable(); // null for public clients
      t.string("name", 100).notNullable();
      t.bigInteger("module_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("modules")
        .onDelete("SET NULL");
      t.text("redirect_uris").notNullable(); // JSON array
      t.text("allowed_scopes").notNullable(); // JSON array
      t.text("grant_types").notNullable(); // JSON array
      t.boolean("is_confidential").notNullable().defaultTo(true);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["module_id"]);
    });
  }

  // ---- OAuth Authorization Codes ----
  if (!(await knex.schema.hasTable("oauth_authorization_codes"))) {
    await knex.schema.createTable("oauth_authorization_codes", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("code_hash", 128).notNullable().unique();
      t.string("client_id", 64).notNullable();
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("redirect_uri", 500).notNullable();
      t.text("scope").notNullable();
      t.string("code_challenge", 256).nullable();
      t.string("code_challenge_method", 10).nullable();
      t.string("nonce", 256).nullable();
      t.timestamp("expires_at").notNullable();
      t.timestamp("used_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["client_id"]);
      t.index(["expires_at"]);
    });
  }

  // ---- OAuth Access Tokens ----
  if (!(await knex.schema.hasTable("oauth_access_tokens"))) {
    await knex.schema.createTable("oauth_access_tokens", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("jti", 64).notNullable().unique();
      t.string("client_id", 64).notNullable();
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.text("scope").notNullable();
      t.timestamp("expires_at").notNullable();
      t.timestamp("revoked_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["client_id"]);
      t.index(["user_id"]);
      t.index(["expires_at"]);
    });
  }

  // ---- OAuth Refresh Tokens ----
  if (!(await knex.schema.hasTable("oauth_refresh_tokens"))) {
    await knex.schema.createTable("oauth_refresh_tokens", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("token_hash", 128).notNullable().unique();
      t.bigInteger("access_token_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("oauth_access_tokens")
        .onDelete("CASCADE");
      t.string("client_id", 64).notNullable();
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.text("scope").notNullable();
      t.string("family_id", 64).notNullable(); // rotation family
      t.timestamp("expires_at").notNullable();
      t.timestamp("revoked_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["client_id"]);
      t.index(["user_id"]);
      t.index(["family_id"]);
      t.index(["expires_at"]);
    });
  }

  // ---- Signing Keys ----
  if (!(await knex.schema.hasTable("signing_keys"))) {
    await knex.schema.createTable("signing_keys", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("kid", 64).notNullable().unique();
      t.string("algorithm", 10).notNullable().defaultTo("RS256");
      t.text("public_key").notNullable();
      t.text("private_key").notNullable();
      t.boolean("is_current").notNullable().defaultTo(false);
      t.timestamp("expires_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    "signing_keys",
    "oauth_refresh_tokens",
    "oauth_access_tokens",
    "oauth_authorization_codes",
    "oauth_clients",
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
