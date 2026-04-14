// =============================================================================
// MIGRATION 042 — Biometric Legacy Credentials
//
// Shim table that backs the emp-monitor-compatible kiosk API mounted at
// /api/v3/biometric. Existing emp-monitor kiosk devices call that surface
// with finger1/finger2/bio_code identifiers plus a per-user secret_key;
// none of those fields exist on users, face_enrollments, or the modern
// biometrics tables — so we store them here, one row per user, keyed by
// user_id. The legacy routes are the only consumer.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("biometric_legacy_credentials")) return;

  await knex.schema.createTable("biometric_legacy_credentials", (t) => {
    t.bigIncrements("id").unsigned().primary();
    t.bigInteger("user_id")
      .unsigned()
      .notNullable()
      .unique()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    t.bigInteger("organization_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.boolean("is_bio_enabled").notNullable().defaultTo(false);
    t.string("secret_key_hash", 255).nullable();
    t.string("username", 128).nullable();
    t.string("finger1", 255).nullable();
    t.string("finger2", 255).nullable();
    t.string("bio_code", 128).nullable();
    t.string("face_url", 512).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
    t.index(["organization_id"]);
    t.index(["bio_code"]);
    t.index(["finger1"]);
    t.index(["finger2"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("biometric_legacy_credentials");
}
