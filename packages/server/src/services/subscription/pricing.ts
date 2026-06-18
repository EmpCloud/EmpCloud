// =============================================================================
// Pricing — DB-backed since migration 072.
//
// Source of truth is now the `plan_tiers` + `plan_pricing` tables (managed
// from the Super Admin Pricing page). Lookups are cached for 60s so a
// busy onboarding doesn't hit the DB for every read.
//
// Backward-compat: getPricePerSeat(tier, currency) preserves the original
// signature. The richer lookup (volume bands + scheduled changes) is
// available via getPricePerSeatFor() if a caller has seat count / date.
//
// If the DB query fails (rare DB blip), we fall back to a hardcoded grid
// matching the legacy values so subscription creation never falls over.
// =============================================================================

import { getDB } from "../../db/connection.js";

// ---------------------------------------------------------------------------
// Legacy hardcoded values — kept ONLY as a last-resort fallback for when
// the DB tables can't be reached. The DB seed in migration 072 inserts
// these same numbers, so day-1 behaviour was unchanged.
// ---------------------------------------------------------------------------

const FALLBACK_PRICING: Record<string, Record<string, number>> = {
  INR: { free: 0, basic: 50000, professional: 100000, enterprise: 175000 },
  USD: { free: 0, basic: 500,   professional: 1000,   enterprise: 1750   },
  GBP: { free: 0, basic: 500,   professional: 1000,   enterprise: 1750   },
  EUR: { free: 0, basic: 500,   professional: 1000,   enterprise: 1750   },
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type PricingRow = {
  tier_slug: string;
  currency: string;
  price_per_seat: number;
  min_seats: number;
  max_seats: number | null;
  effective_from: string; // YYYY-MM-DD
};

let cachedPricing: PricingRow[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

async function loadPricing(): Promise<PricingRow[]> {
  const now = Date.now();
  if (cachedPricing && now - cachedAt < CACHE_TTL_MS) return cachedPricing;
  const db = getDB();
  try {
    const rows = await db("plan_pricing as pp")
      .join("plan_tiers as t", "pp.tier_id", "t.id")
      .where("t.is_active", true)
      .select(
        "t.slug as tier_slug",
        "pp.currency",
        "pp.price_per_seat",
        "pp.min_seats",
        "pp.max_seats",
        "pp.effective_from",
      );
    cachedPricing = rows.map((r: any) => ({
      tier_slug: r.tier_slug,
      currency: r.currency,
      price_per_seat: Number(r.price_per_seat) || 0,
      min_seats: Number(r.min_seats) || 1,
      max_seats: r.max_seats == null ? null : Number(r.max_seats),
      effective_from: String(r.effective_from).slice(0, 10),
    }));
    cachedAt = now;
    return cachedPricing;
  } catch {
    return [];
  }
}

/** Invalidate the in-memory cache. Called by the admin save endpoints so
 * an edit takes effect immediately rather than after the 60s TTL. */
export function invalidatePricingCache(): void {
  cachedPricing = null;
  cachedAt = 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the per-seat price for a tier × currency at a given seat count
 * and date. Picks the newest row whose effective_from <= onDate and whose
 * seat band covers seatCount.
 *
 * Falls back to the hardcoded grid when the DB has no matching row OR
 * the DB query failed.
 */
export async function getPricePerSeatFor(
  planTier: string,
  currency: string,
  seatCount: number = 1,
  onDate: string = new Date().toISOString().slice(0, 10),
): Promise<number> {
  const rows = await loadPricing();
  const matches = rows
    .filter(
      (r) =>
        r.tier_slug === planTier &&
        r.currency === currency &&
        r.effective_from <= onDate &&
        seatCount >= r.min_seats &&
        (r.max_seats == null || seatCount <= r.max_seats),
    )
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  if (matches.length > 0) return matches[0].price_per_seat;
  return (
    FALLBACK_PRICING[currency]?.[planTier] ??
    FALLBACK_PRICING["USD"]?.[planTier] ??
    FALLBACK_PRICING[currency]?.["basic"] ??
    500
  );
}

/** Backward-compat wrapper used by the existing subscription / onboarding
 * services. Resolves synchronously-ish (fire-and-forget cache warming)
 * for callers that don't care about volume bands. */
export async function getPricePerSeat(planTier: string, currency: string): Promise<number> {
  return getPricePerSeatFor(planTier, currency, 1);
}

/**
 * Resolve the EFFECTIVE per-seat per-cycle price -- i.e. exactly what the
 * customer was shown on the Subscribe modal. This is the SINGLE source of
 * truth for "what the customer pays per seat per billing cycle"; both the
 * subscription row and the emp-billing handoff must derive from this.
 *
 *   if (cycle has an override matching currency)
 *     -> override_amount_per_seat
 *   else
 *     -> monthly_base × (1 - discount_pct/100) × months_in_cycle
 *
 * Override > 0 only -- a 0 override is treated as "no override" so a stale
 * row can't silently zero the bill. Matches the modal calculation exactly.
 */
export async function getEffectivePricePerSeat(
  planTier: string,
  currency: string,
  billingCycle: string,
  seatCount: number = 1,
  onDate: string = new Date().toISOString().slice(0, 10),
): Promise<number> {
  const monthlyBase = await getPricePerSeatFor(planTier, currency, seatCount, onDate);
  const db = getDB();
  const cycle = await db("billing_cycle_discounts")
    .where({ cycle: String(billingCycle).toLowerCase(), is_active: true })
    .first();
  if (!cycle) {
    // Unknown cycle -- fall back to monthly base. Better than 0.
    return monthlyBase;
  }
  const overrideAmt = Number(cycle.override_amount_per_seat || 0);
  const overrideCur = String(cycle.override_currency || "").toUpperCase();
  if (overrideAmt > 0 && overrideCur === currency.toUpperCase()) {
    return overrideAmt;
  }
  const discountPct = Number(cycle.discount_pct || 0);
  const months = Number(cycle.months_in_cycle || 1);
  return Math.round(monthlyBase * (1 - discountPct / 100) * months);
}

export function getCurrencyForCountry(country: string): string {
  const inrCountries = ["IN", "India"];
  const gbpCountries = ["GB", "UK", "United Kingdom"];
  const eurCountries = [
    "DE", "FR", "IT", "ES", "NL",
    "Germany", "France", "Italy", "Spain",
  ];
  if (inrCountries.includes(country)) return "INR";
  if (gbpCountries.includes(country)) return "GBP";
  if (eurCountries.includes(country)) return "EUR";
  return "USD";
}

export async function getOrgCurrency(orgId: number): Promise<string> {
  const db = getDB();
  const org = await db("organizations")
    .where({ id: orgId })
    .select("currency", "country")
    .first();
  if (!org) return "USD";
  return org.currency || getCurrencyForCountry(org.country || "");
}
