// =============================================================================
// MIGRATION 073 — Super-admin-controllable fields on org_subscriptions
//
// Adds the knobs the Super Admin UI needs to fully manage a subscription
// outside the automated billing cycle: scheduled renewal toggle, free /
// comp reason, internal HR notes, and a "manually overridden" flag so
// the UI can show a badge + the billing engine knows not to overwrite
// the price on its next sync.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn("org_subscriptions", "auto_renew"))) {
    await knex.schema.alterTable("org_subscriptions", (t) => {
      // Auto-renew is on by default for legacy rows -- previous behaviour.
      t.boolean("auto_renew").notNullable().defaultTo(true);
    });
  }
  if (!(await knex.schema.hasColumn("org_subscriptions", "is_free"))) {
    await knex.schema.alterTable("org_subscriptions", (t) => {
      // Distinguish "tier=free => zero by design" from "comped/promo
      // free => HR explicitly waived the bill". UI shows a clearer
      // badge for the latter.
      t.boolean("is_free").notNullable().defaultTo(false);
      t.string("free_reason", 255).nullable();
    });
  }
  if (!(await knex.schema.hasColumn("org_subscriptions", "manually_overridden"))) {
    await knex.schema.alterTable("org_subscriptions", (t) => {
      t.boolean("manually_overridden").notNullable().defaultTo(false);
    });
  }
  if (!(await knex.schema.hasColumn("org_subscriptions", "internal_notes"))) {
    await knex.schema.alterTable("org_subscriptions", (t) => {
      // Free-text internal memo (deal context, special terms, etc.).
      // Not surfaced to the tenant org.
      t.text("internal_notes").nullable();
    });
  }
  if (!(await knex.schema.hasColumn("org_subscriptions", "updated_by"))) {
    await knex.schema.alterTable("org_subscriptions", (t) => {
      // Who last edited this row from the super admin UI. Used by the
      // change log; NULL for rows created by the automated flows.
      t.bigInteger("updated_by").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const col of [
    "updated_by",
    "internal_notes",
    "manually_overridden",
    "free_reason",
    "is_free",
    "auto_renew",
  ]) {
    if (await knex.schema.hasColumn("org_subscriptions", col)) {
      await knex.schema.alterTable("org_subscriptions", (t) => {
        t.dropColumn(col);
      });
    }
  }
}
