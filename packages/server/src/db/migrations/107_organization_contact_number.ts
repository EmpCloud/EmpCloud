// =============================================================================
// MIGRATION 107 — Normalize the organization contact-number column
// Older EmpCloud databases store this value as `organizations.phone`, while
// the current schema and super-admin API use `organizations.contact_number`.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasContactNumber = await knex.schema.hasColumn("organizations", "contact_number");
  if (hasContactNumber) return;

  const hasLegacyPhone = await knex.schema.hasColumn("organizations", "phone");

  await knex.schema.alterTable("organizations", (table) => {
    table
      .string("contact_number", 30)
      .nullable()
      .after(hasLegacyPhone ? "phone" : "email");
  });

  if (hasLegacyPhone) {
    await knex("organizations")
      .whereNull("contact_number")
      .update({ contact_number: knex.ref("phone") });
  }
}

// This compatibility migration may encounter contact_number created by the
// base identity migration. Never drop a core data column during rollback.
export async function down(_knex: Knex): Promise<void> {}
