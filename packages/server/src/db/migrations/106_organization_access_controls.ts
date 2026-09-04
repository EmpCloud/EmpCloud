// =============================================================================
// MIGRATION 106 — Organization access controls
// Super-admin switches for a hard login block and overdue-payment restriction.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasLoginBlocked = await knex.schema.hasColumn("organizations", "login_blocked");
  const hasPaymentBlock = await knex.schema.hasColumn("organizations", "payment_block_enabled");

  if (!hasLoginBlocked || !hasPaymentBlock) {
    await knex.schema.alterTable("organizations", (table) => {
      if (!hasLoginBlocked) {
        table.boolean("login_blocked").notNullable().defaultTo(false).after("is_active");
      }
      if (!hasPaymentBlock) {
        table.boolean("payment_block_enabled").notNullable().defaultTo(false).after("login_blocked");
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasLoginBlocked = await knex.schema.hasColumn("organizations", "login_blocked");
  const hasPaymentBlock = await knex.schema.hasColumn("organizations", "payment_block_enabled");

  if (hasLoginBlocked || hasPaymentBlock) {
    await knex.schema.alterTable("organizations", (table) => {
      if (hasPaymentBlock) table.dropColumn("payment_block_enabled");
      if (hasLoginBlocked) table.dropColumn("login_blocked");
    });
  }
}
