// =============================================================================
// MIGRATION 014 — Fix subscription pricing for existing rows
// Subscriptions created before the pricing logic was added have
// price_per_seat=0 and currency='USD' on paid tiers. This migration
// back-fills the correct values.
// =============================================================================

import { Knex } from "knex";

const PLAN_PRICING: Record<string, number> = {
  free: 0,
  basic: 50000,         // 500 INR in paise
  professional: 100000, // 1,000 INR in paise
  enterprise: 175000,   // 1,750 INR in paise
};

export async function up(knex: Knex): Promise<void> {
  for (const [tier, price] of Object.entries(PLAN_PRICING)) {
    if (tier === "free") continue; // free tier correctly has 0

    // Fix rows that have wrong price OR wrong currency
    await knex("org_subscriptions")
      .where("plan_tier", tier)
      .where(function () {
        this.where("price_per_seat", "!=", price).orWhere("currency", "!=", "INR");
      })
      .update({
        price_per_seat: price,
        currency: "INR",
        updated_at: knex.fn.now(),
      });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Intentionally not reverting — the old values were incorrect
}
