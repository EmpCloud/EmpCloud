// =============================================================================
// MIGRATION 030 — Probation Tracking
// Adds probation tracking columns to users table.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("users");
  if (!hasTable) return;

  const hasProbationEndDate = await knex.schema.hasColumn("users", "probation_end_date");
  if (!hasProbationEndDate) {
    await knex.schema.alterTable("users", (t) => {
      t.date("probation_end_date").nullable();
      t.string("probation_status", 20).defaultTo("on_probation");
      t.bigInteger("probation_confirmed_by").unsigned().nullable();
      t.timestamp("probation_confirmed_at").nullable();
      t.text("probation_extension_reason").nullable();
      t.index(["organization_id", "probation_status"]);
    });
  }

  // System notifications table for platform-wide announcements
  if (!(await knex.schema.hasTable("system_notifications"))) {
    await knex.schema.createTable("system_notifications", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.string("title", 255).notNullable();
      t.text("message").notNullable();
      t.string("target_type", 20).notNullable().defaultTo("all"); // 'all' or 'org'
      t.bigInteger("target_org_id").unsigned().nullable();
      t.string("notification_type", 50).notNullable().defaultTo("info"); // info, warning, maintenance, release
      t.bigInteger("created_by").unsigned().nullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("scheduled_at").nullable();
      t.timestamp("expires_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("system_notifications");

  const hasTable = await knex.schema.hasTable("users");
  if (hasTable) {
    const hasProbationEndDate = await knex.schema.hasColumn("users", "probation_end_date");
    if (hasProbationEndDate) {
      await knex.schema.alterTable("users", (t) => {
        t.dropIndex(["organization_id", "probation_status"]);
        t.dropColumn("probation_end_date");
        t.dropColumn("probation_status");
        t.dropColumn("probation_confirmed_by");
        t.dropColumn("probation_confirmed_at");
        t.dropColumn("probation_extension_reason");
      });
    }
  }
}
