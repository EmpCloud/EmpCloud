// =============================================================================
// MIGRATION 077 — Email Templates
// Org-scoped, admin-customizable email templates (subject + message body with
// {{placeholders}}). First consumer: the probation-confirmation email sent
// from the Probation Tracking page. Generic by design so future templates
// (offer letters, extension notices, etc.) reuse the same table.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("email_templates")) return;

  await knex.schema.createTable("email_templates", (t) => {
    t.bigIncrements("id").unsigned().primary();
    t.bigInteger("organization_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.string("template_key", 100).notNullable(); // e.g. "probation_confirmation"
    t.string("name", 150).notNullable();
    t.string("subject", 255).notNullable();
    t.text("body").notNullable(); // message text with {{placeholders}}
    t.boolean("is_active").notNullable().defaultTo(true);
    t.bigInteger("updated_by").unsigned().nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
    // One customizable template per (org, key)
    t.unique(["organization_id", "template_key"]);
    t.index(["organization_id", "template_key"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("email_templates");
}
