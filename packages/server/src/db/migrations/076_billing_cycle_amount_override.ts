// =============================================================================
// MIGRATION 075 — Flat-amount override on billing cycles
//
// Migration 074 gave the super admin a discount_pct knob. Some price lists
// quote the cycle's total directly ("Annual: ₹4,800/seat — flat"). Adding
// an optional flat-amount override so the admin can either:
//   - leave discount_pct alone (current behaviour), or
//   - punch in an absolute per-seat-per-cycle amount that completely
//     replaces the (monthly x (1 - discount%) x months_in_cycle) math.
//
// Override is currency-specific: setting ₹4,800 for annual doesn't apply
// to a USD subscription. If the org's currency doesn't match the
// override, the calc falls back to the discount path.
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn("billing_cycle_discounts", "override_amount_per_seat"))) {
    await knex.schema.alterTable("billing_cycle_discounts", (t) => {
      t.bigInteger("override_amount_per_seat").nullable();
      t.string("override_currency", 3).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const col of ["override_currency", "override_amount_per_seat"]) {
    if (await knex.schema.hasColumn("billing_cycle_discounts", col)) {
      await knex.schema.alterTable("billing_cycle_discounts", (t) => {
        t.dropColumn(col);
      });
    }
  }
}
