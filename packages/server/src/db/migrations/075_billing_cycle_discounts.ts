// =============================================================================
// MIGRATION 074 — Editable billing-cycle discounts
//
// The customer Subscribe modal showed "Save 5%" for quarterly and "Save 20%"
// for annual, hardcoded into the React component. This table lets the super
// admin tune those numbers (or add new cycles) without a redeploy.
//
// One row per billing cycle (monthly, quarterly, annual). discount_pct is a
// decimal percentage applied to the per-seat monthly price BEFORE multiplying
// by the months-in-cycle. label is what shows under each cycle button on the
// modal -- blank means "no badge".
// =============================================================================

import { Knex } from "knex";

const DEFAULT_CYCLES = [
  { cycle: "monthly",   label: "Monthly",   discount_pct: 0,  months_in_cycle: 1,  sort_order: 0 },
  { cycle: "quarterly", label: "Quarterly", discount_pct: 5,  months_in_cycle: 3,  sort_order: 1 },
  { cycle: "annual",    label: "Annual",    discount_pct: 20, months_in_cycle: 12, sort_order: 2 },
];

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("billing_cycle_discounts"))) {
    await knex.schema.createTable("billing_cycle_discounts", (t) => {
      t.bigIncrements("id").primary();
      t.string("cycle", 30).notNullable().unique();
      t.string("label", 100).notNullable();
      // Decimal pct (5 = "save 5%", 20 = "save 20%"). Stored as decimal to
      // allow fractional values (e.g. 7.5% Black-Friday promo).
      t.decimal("discount_pct", 5, 2).notNullable().defaultTo(0);
      // How many months one billing cycle is. Modal multiplies the monthly
      // per-seat by this for the cycle-total. Editable so future cycles
      // (semi-annual = 6, biennial = 24, custom = ?) work without code.
      t.integer("months_in_cycle").notNullable().defaultTo(1);
      t.integer("sort_order").notNullable().defaultTo(0);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }
  for (const c of DEFAULT_CYCLES) {
    const existing = await knex("billing_cycle_discounts").where({ cycle: c.cycle }).first();
    if (!existing) await knex("billing_cycle_discounts").insert(c);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("billing_cycle_discounts")) {
    await knex.schema.dropTable("billing_cycle_discounts");
  }
}
