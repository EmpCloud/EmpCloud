// =============================================================================
// MIGRATION 072 — Dynamic plan pricing managed from the Super Admin UI
//
// Replaces the hardcoded 4x4 (currency x plan_tier) grid in
// services/subscription/pricing.ts with two DB-driven tables.
//
//   plan_tiers
//     One row per pricing tier. Seeded with the legacy four
//     (free, basic, professional, enterprise) so existing
//     org_subscriptions.plan_tier values keep resolving. Super admins
//     can add custom tiers (e.g. "starter", "growth") later.
//
//   plan_pricing
//     One row per (tier x currency x volume band x effective_from).
//     The fields together allow:
//       - multi-currency per tier
//       - volume discount bands (1-50 seats one price, 51-200 another,
//         201+ a third) via min_seats / max_seats
//       - scheduled price changes via effective_from (the LATEST row
//         whose effective_from <= today and whose seat band covers the
//         requested seat count wins)
//
// Existing org_subscriptions.price_per_seat values are NOT touched -- the
// price is denormalised onto each subscription at creation time, so
// changes here only affect NEW subscriptions / plan upgrades.
//
// Migration is idempotent: it only seeds rows that don't already exist
// (by unique key), so re-running won't clobber UI edits.
// =============================================================================

import { Knex } from "knex";

// Smallest currency unit (paise / cents / pence). Same defaults the old
// hardcoded `PLAN_PRICING_BY_CURRENCY` shipped, so behaviour is unchanged
// on day 1.
const DEFAULT_TIERS = [
  { slug: "free", name: "Free", sort_order: 0, description: "No-cost tier; limited features." },
  { slug: "basic", name: "Basic", sort_order: 10, description: "Entry-level paid plan." },
  { slug: "professional", name: "Professional", sort_order: 20, description: "Standard team plan." },
  { slug: "enterprise", name: "Enterprise", sort_order: 30, description: "Large org / advanced features." },
];

const DEFAULT_PRICING: Array<{
  tier: string;
  currency: string;
  price: number;
}> = [
  // INR (paise)
  { tier: "free",         currency: "INR", price: 0 },
  { tier: "basic",        currency: "INR", price: 50000 },
  { tier: "professional", currency: "INR", price: 100000 },
  { tier: "enterprise",   currency: "INR", price: 175000 },
  // USD (cents)
  { tier: "free",         currency: "USD", price: 0 },
  { tier: "basic",        currency: "USD", price: 500 },
  { tier: "professional", currency: "USD", price: 1000 },
  { tier: "enterprise",   currency: "USD", price: 1750 },
  // GBP (pence)
  { tier: "free",         currency: "GBP", price: 0 },
  { tier: "basic",        currency: "GBP", price: 500 },
  { tier: "professional", currency: "GBP", price: 1000 },
  { tier: "enterprise",   currency: "GBP", price: 1750 },
  // EUR (cents)
  { tier: "free",         currency: "EUR", price: 0 },
  { tier: "basic",        currency: "EUR", price: 500 },
  { tier: "professional", currency: "EUR", price: 1000 },
  { tier: "enterprise",   currency: "EUR", price: 1750 },
];

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("plan_tiers"))) {
    await knex.schema.createTable("plan_tiers", (t) => {
      t.bigIncrements("id").primary();
      t.string("slug", 50).notNullable().unique();
      t.string("name", 100).notNullable();
      t.string("description", 500).nullable();
      // sort_order controls display ordering in the admin UI and on
      // the public pricing page. Lower numbers come first.
      t.integer("sort_order").notNullable().defaultTo(0);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("plan_pricing"))) {
    await knex.schema.createTable("plan_pricing", (t) => {
      t.bigIncrements("id").primary();
      t.bigInteger("tier_id").unsigned().notNullable()
        .references("id").inTable("plan_tiers").onDelete("CASCADE");
      t.string("currency", 3).notNullable();
      // Smallest currency unit (paise / cents / pence). bigInt so a
      // typo can't overflow INT range.
      t.bigInteger("price_per_seat").notNullable().defaultTo(0);
      // Volume bands. min_seats=1 + max_seats=NULL means "applies to
      // any seat count". Multiple rows for the same tier+currency
      // with non-overlapping bands implement step-discount pricing.
      t.integer("min_seats").notNullable().defaultTo(1);
      t.integer("max_seats").nullable(); // NULL = unbounded upper
      // Scheduled changes. The newest row whose effective_from <= today
      // and whose seat band covers the requested seats wins. Default
      // 1970-01-01 means "in effect since the dawn of time" -- the
      // seed rows below all use this so day-1 behaviour matches the
      // hardcoded values.
      t.date("effective_from").notNullable().defaultTo("1970-01-01");
      t.string("notes", 500).nullable();
      t.bigInteger("updated_by").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["tier_id", "currency", "effective_from"], "idx_pricing_lookup");
    });
  }

  // ---- Seed tiers (idempotent — by slug) -----------------------------
  for (const tier of DEFAULT_TIERS) {
    const existing = await knex("plan_tiers").where({ slug: tier.slug }).first();
    if (!existing) {
      await knex("plan_tiers").insert(tier);
    }
  }

  // ---- Seed pricing (idempotent — by tier+currency+effective_from) ---
  // Each tier×currency pair gets one open-ended band (min_seats=1,
  // max_seats=NULL) at the legacy hardcoded price. Admins can then add
  // volume bands or schedule future changes from the UI without ever
  // re-running this migration.
  for (const p of DEFAULT_PRICING) {
    const tierRow = await knex("plan_tiers").where({ slug: p.tier }).first();
    if (!tierRow) continue;
    const existing = await knex("plan_pricing")
      .where({
        tier_id: tierRow.id,
        currency: p.currency,
        min_seats: 1,
        effective_from: "1970-01-01",
      })
      .whereNull("max_seats")
      .first();
    if (!existing) {
      await knex("plan_pricing").insert({
        tier_id: tierRow.id,
        currency: p.currency,
        price_per_seat: p.price,
        min_seats: 1,
        max_seats: null,
        effective_from: "1970-01-01",
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("plan_pricing")) {
    await knex.schema.dropTable("plan_pricing");
  }
  if (await knex.schema.hasTable("plan_tiers")) {
    await knex.schema.dropTable("plan_tiers");
  }
}
