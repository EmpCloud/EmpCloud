// =============================================================================
// MIGRATION 092 — API Keys (shared programmatic access tokens)
//
// Org-admin-generated API keys that authenticate against EmpCloud APIs AND
// every module that reads the EmpCloud master DB (e.g. emp-payroll). The key
// is opaque (`empc_live_...`); only its SHA-256 hash is stored. On each request
// the validating service resolves the OWNER user's *current* RBAC permissions,
// so a key mirrors the admin who created it and reflects live role changes.
//
// This table is the single source of truth both services read — no shared JWT
// secret is involved. Revoking a key (revoked_at) or letting it expire
// (expires_at) takes effect immediately for every service.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("api_keys")) return;

  await knex.schema.createTable("api_keys", (t) => {
    t.bigIncrements("id").unsigned().primary();
    t.bigInteger("organization_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    // The user whose RBAC the key mirrors. Deleting the user revokes the key.
    t.bigInteger("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    t.string("name", 150).notNullable(); // human label, e.g. "Attendance export bot"
    t.string("key_hash", 64).notNullable().unique(); // sha256 hex of the raw key
    t.string("key_prefix", 24).notNullable(); // first chars, shown in the UI
    t.timestamp("last_used_at").nullable();
    t.timestamp("expires_at").nullable(); // null = never expires
    t.timestamp("revoked_at").nullable(); // non-null = revoked
    t.bigInteger("created_by").unsigned().nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
    t.index(["organization_id"]);
    t.index(["key_hash"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("api_keys");
}
