import type { Knex } from "knex";

// =============================================================================
// MIGRATION 066 — Backfill org_subscriptions.price_per_seat from tiered pricing
// -----------------------------------------------------------------------------
// price_per_seat is captured onto the org_subscriptions row at creation time
// and never back-fills. Every existing row was created under the old flat
// ₹100/seat model (price_per_seat = 10000), but pricing.ts now defines a tiered
// model (basic / professional / enterprise per currency). The Billing UI and
// the invoices read price_per_seat straight off the row, so the stale value
// shows everywhere until the data is aligned with the code.
//
// This migration is the alignment. The values below are a point-in-time
// snapshot of PLAN_PRICING_BY_CURRENCY in
// packages/server/src/services/subscription/pricing.ts — kept literal here on
// purpose: a migration must not import app code that can change after the
// migration has run.
//
// Idempotent: only rows whose price differs from the tier price are touched.
// =============================================================================

const PLAN_PRICING_BY_CURRENCY: Record<string, Record<string, number>> = {
  INR: { free: 0, basic: 50000, professional: 100000, enterprise: 175000 }, // paise
  USD: { free: 0, basic: 500, professional: 1000, enterprise: 1750 },       // cents
  GBP: { free: 0, basic: 500, professional: 1000, enterprise: 1750 },       // pence
  EUR: { free: 0, basic: 500, professional: 1000, enterprise: 1750 },       // cents
};

export async function up(knex: Knex): Promise<void> {
  for (const [currency, tiers] of Object.entries(PLAN_PRICING_BY_CURRENCY)) {
    for (const [planTier, price] of Object.entries(tiers)) {
      await knex("org_subscriptions")
        .where({ currency, plan_tier: planTier })
        .whereNot({ price_per_seat: price })
        .update({ price_per_seat: price, updated_at: new Date() });
    }
  }
}

export async function down(): Promise<void> {
  // No-op. price_per_seat is point-in-time captured data — once corrected to
  // the real tier price there is no meaningful prior value to restore.
}
