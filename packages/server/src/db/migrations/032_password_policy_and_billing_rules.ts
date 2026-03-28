// =============================================================================
// MIGRATION 032 — Password Policy & Billing Enforcement
// Adds password_changed_at to users, password_expiry_days to organizations.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add password_changed_at to users table
  const hasPasswordChangedAt = await knex.schema.hasColumn("users", "password_changed_at");
  if (!hasPasswordChangedAt) {
    await knex.schema.alterTable("users", (t) => {
      t.timestamp("password_changed_at").nullable().after("password");
    });
    // Backfill: set password_changed_at = created_at for existing users with passwords
    await knex("users")
      .whereNotNull("password")
      .whereNull("password_changed_at")
      .update({ password_changed_at: knex.ref("created_at") });
  }

  // Add password_expiry_days to organizations table (0 = no expiry, default)
  const hasPasswordExpiryDays = await knex.schema.hasColumn("organizations", "password_expiry_days");
  if (!hasPasswordExpiryDays) {
    await knex.schema.alterTable("organizations", (t) => {
      t.integer("password_expiry_days").notNullable().defaultTo(0).after("is_active");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPasswordChangedAt = await knex.schema.hasColumn("users", "password_changed_at");
  if (hasPasswordChangedAt) {
    await knex.schema.alterTable("users", (t) => {
      t.dropColumn("password_changed_at");
    });
  }

  const hasPasswordExpiryDays = await knex.schema.hasColumn("organizations", "password_expiry_days");
  if (hasPasswordExpiryDays) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("password_expiry_days");
    });
  }
}
