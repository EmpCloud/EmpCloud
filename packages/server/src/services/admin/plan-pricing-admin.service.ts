// =============================================================================
// EMP CLOUD — Plan Pricing Admin Service
// CRUD for the dynamic pricing tables (plan_tiers, plan_pricing) driven
// from the Super Admin Pricing page.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { invalidatePricingCache } from "../subscription/pricing.js";

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export async function listTiers() {
  const db = getDB();
  return db("plan_tiers").orderBy("sort_order").orderBy("id");
}

export async function createTier(data: {
  slug: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}) {
  const db = getDB();
  if (!data.slug?.trim()) throw new ValidationError("slug is required");
  if (!data.name?.trim()) throw new ValidationError("name is required");
  const slug = data.slug.trim().toLowerCase();
  const existing = await db("plan_tiers").where({ slug }).first();
  if (existing) throw new ValidationError(`Tier with slug "${slug}" already exists`);
  const [id] = await db("plan_tiers").insert({
    slug,
    name: data.name.trim(),
    description: data.description ?? null,
    sort_order: data.sort_order ?? 0,
    is_active: data.is_active ?? true,
  });
  invalidatePricingCache();
  return db("plan_tiers").where({ id }).first();
}

export async function updateTier(
  id: number,
  data: Partial<{
    name: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
  }>,
) {
  const db = getDB();
  const existing = await db("plan_tiers").where({ id }).first();
  if (!existing) throw new NotFoundError("Tier");
  const updateData: Record<string, any> = { updated_at: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;
  if (data.is_active !== undefined) updateData.is_active = !!data.is_active;
  await db("plan_tiers").where({ id }).update(updateData);
  invalidatePricingCache();
  return db("plan_tiers").where({ id }).first();
}

export async function deleteTier(id: number) {
  const db = getDB();
  // Refuse if any subscription is currently using this tier — would
  // strand orphaned plan_tier strings on org_subscriptions.
  const inUse = await db("plan_tiers as t")
    .join("org_subscriptions as s", "s.plan_tier", "t.slug")
    .where("t.id", id)
    .count<{ n: number }[]>("* as n")
    .first();
  if (inUse && Number(inUse.n) > 0) {
    throw new ValidationError(
      `Cannot delete: ${inUse.n} active subscription(s) still on this tier. Move them to another tier first.`,
    );
  }
  await db("plan_tiers").where({ id }).del();
  invalidatePricingCache();
  return { id, deleted: true };
}

// ---------------------------------------------------------------------------
// Pricing rows
// ---------------------------------------------------------------------------

export async function listPricing(filters?: { tier_id?: number; currency?: string }) {
  const db = getDB();
  const q = db("plan_pricing as pp")
    .join("plan_tiers as t", "pp.tier_id", "t.id")
    .select(
      "pp.id",
      "pp.tier_id",
      "t.slug as tier_slug",
      "t.name as tier_name",
      "pp.currency",
      "pp.price_per_seat",
      "pp.min_seats",
      "pp.max_seats",
      "pp.effective_from",
      "pp.notes",
      "pp.updated_at",
    );
  if (filters?.tier_id) q.where("pp.tier_id", filters.tier_id);
  if (filters?.currency) q.where("pp.currency", filters.currency);
  return q.orderBy("t.sort_order").orderBy("pp.currency").orderBy("pp.effective_from", "desc").orderBy("pp.min_seats");
}

export async function createPricing(data: {
  tier_id: number;
  currency: string;
  price_per_seat: number;
  min_seats?: number;
  max_seats?: number | null;
  effective_from?: string;
  notes?: string | null;
  updated_by?: number;
}) {
  const db = getDB();
  const tier = await db("plan_tiers").where({ id: data.tier_id }).first();
  if (!tier) throw new NotFoundError("Tier");
  if (!data.currency || data.currency.length !== 3) {
    throw new ValidationError("currency must be a 3-letter code (e.g. USD)");
  }
  if (!Number.isFinite(data.price_per_seat) || data.price_per_seat < 0) {
    throw new ValidationError("price_per_seat must be 0 or positive");
  }
  const min_seats = data.min_seats ?? 1;
  const max_seats = data.max_seats ?? null;
  if (min_seats < 1) throw new ValidationError("min_seats must be >= 1");
  if (max_seats != null && max_seats < min_seats) {
    throw new ValidationError("max_seats must be >= min_seats");
  }
  const [id] = await db("plan_pricing").insert({
    tier_id: data.tier_id,
    currency: data.currency.toUpperCase(),
    price_per_seat: Math.round(data.price_per_seat),
    min_seats,
    max_seats,
    effective_from: data.effective_from || "1970-01-01",
    notes: data.notes ?? null,
    updated_by: data.updated_by ?? null,
  });
  invalidatePricingCache();
  return db("plan_pricing").where({ id }).first();
}

export async function updatePricing(
  id: number,
  data: Partial<{
    price_per_seat: number;
    min_seats: number;
    max_seats: number | null;
    effective_from: string;
    notes: string | null;
    updated_by: number;
  }>,
) {
  const db = getDB();
  const existing = await db("plan_pricing").where({ id }).first();
  if (!existing) throw new NotFoundError("Pricing row");
  const updateData: Record<string, any> = { updated_at: new Date() };
  if (data.price_per_seat !== undefined) {
    if (!Number.isFinite(data.price_per_seat) || data.price_per_seat < 0) {
      throw new ValidationError("price_per_seat must be 0 or positive");
    }
    updateData.price_per_seat = Math.round(data.price_per_seat);
  }
  if (data.min_seats !== undefined) {
    if (data.min_seats < 1) throw new ValidationError("min_seats must be >= 1");
    updateData.min_seats = data.min_seats;
  }
  if (data.max_seats !== undefined) updateData.max_seats = data.max_seats;
  if (data.effective_from !== undefined) updateData.effective_from = data.effective_from;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.updated_by !== undefined) updateData.updated_by = data.updated_by;
  await db("plan_pricing").where({ id }).update(updateData);
  invalidatePricingCache();
  return db("plan_pricing").where({ id }).first();
}

export async function deletePricing(id: number) {
  const db = getDB();
  await db("plan_pricing").where({ id }).del();
  invalidatePricingCache();
  return { id, deleted: true };
}

// ---------------------------------------------------------------------------
// Billing cycles (monthly / quarterly / annual etc.) — migration 074
// ---------------------------------------------------------------------------

export async function listBillingCycles() {
  const db = getDB();
  return db("billing_cycle_discounts").orderBy("sort_order").orderBy("id");
}

export async function createBillingCycle(data: {
  cycle: string;
  label: string;
  discount_pct?: number;
  months_in_cycle?: number;
  sort_order?: number;
  is_active?: boolean;
  override_amount_per_seat?: number | null;
  override_currency?: string | null;
}) {
  const db = getDB();
  if (!data.cycle?.trim()) throw new ValidationError("cycle is required");
  if (!data.label?.trim()) throw new ValidationError("label is required");
  const cycle = data.cycle.trim().toLowerCase();
  const existing = await db("billing_cycle_discounts").where({ cycle }).first();
  if (existing) throw new ValidationError(`Billing cycle "${cycle}" already exists`);
  const months = Number(data.months_in_cycle ?? 1);
  if (!Number.isFinite(months) || months < 1) {
    throw new ValidationError("months_in_cycle must be >= 1");
  }
  const discount = Number(data.discount_pct ?? 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    throw new ValidationError("discount_pct must be between 0 and 100");
  }
  const override = sanitiseOverride(data.override_amount_per_seat, data.override_currency);
  const [id] = await db("billing_cycle_discounts").insert({
    cycle,
    label: data.label.trim(),
    discount_pct: discount,
    months_in_cycle: months,
    sort_order: data.sort_order ?? 0,
    is_active: data.is_active ?? true,
    override_amount_per_seat: override.amount,
    override_currency: override.currency,
  });
  return db("billing_cycle_discounts").where({ id }).first();
}

// Helper: an override only makes sense if BOTH amount + currency are
// supplied. Clear both if either is missing OR if amount is zero (a zero
// override silently forces the cycle total to ₹0 -- if the admin wants a
// free cycle they should pick the free tier instead).
function sanitiseOverride(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null || currency == null || String(currency).trim() === "") {
    return { amount: null as number | null, currency: null as string | null };
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) {
    throw new ValidationError("override_amount_per_seat must be 0 or positive");
  }
  if (amt === 0) {
    return { amount: null as number | null, currency: null as string | null };
  }
  if (String(currency).trim().length !== 3) {
    throw new ValidationError("override_currency must be a 3-letter code");
  }
  return { amount: Math.round(amt), currency: String(currency).trim().toUpperCase() };
}

export async function updateBillingCycle(
  id: number,
  data: Partial<{
    label: string;
    discount_pct: number;
    months_in_cycle: number;
    sort_order: number;
    is_active: boolean;
    override_amount_per_seat: number | null;
    override_currency: string | null;
  }>,
) {
  const db = getDB();
  const existing = await db("billing_cycle_discounts").where({ id }).first();
  if (!existing) throw new NotFoundError("Billing cycle");
  const updateData: Record<string, any> = { updated_at: new Date() };
  if (data.label !== undefined) updateData.label = data.label;
  if (data.discount_pct !== undefined) {
    if (!Number.isFinite(data.discount_pct) || data.discount_pct < 0 || data.discount_pct > 100) {
      throw new ValidationError("discount_pct must be between 0 and 100");
    }
    updateData.discount_pct = data.discount_pct;
  }
  if (data.months_in_cycle !== undefined) {
    if (!Number.isFinite(data.months_in_cycle) || data.months_in_cycle < 1) {
      throw new ValidationError("months_in_cycle must be >= 1");
    }
    updateData.months_in_cycle = data.months_in_cycle;
  }
  if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;
  if (data.is_active !== undefined) updateData.is_active = !!data.is_active;
  if (data.override_amount_per_seat !== undefined || data.override_currency !== undefined) {
    const override = sanitiseOverride(
      data.override_amount_per_seat ?? existing.override_amount_per_seat,
      data.override_currency ?? existing.override_currency,
    );
    updateData.override_amount_per_seat = override.amount;
    updateData.override_currency = override.currency;
  }
  await db("billing_cycle_discounts").where({ id }).update(updateData);
  return db("billing_cycle_discounts").where({ id }).first();
}

export async function deleteBillingCycle(id: number) {
  const db = getDB();
  // Refuse if any subscription is on this cycle (would orphan org_subscriptions.billing_cycle).
  const existing = await db("billing_cycle_discounts").where({ id }).first();
  if (!existing) throw new NotFoundError("Billing cycle");
  const inUse = await db("org_subscriptions")
    .where({ billing_cycle: existing.cycle })
    .count<{ n: number }[]>("* as n")
    .first();
  if (inUse && Number(inUse.n) > 0) {
    throw new ValidationError(
      `Cannot delete: ${inUse.n} subscription(s) still on this billing cycle. Move them off first.`,
    );
  }
  await db("billing_cycle_discounts").where({ id }).del();
  return { id, deleted: true };
}

// ---------------------------------------------------------------------------
// Public pricing aggregator — used by the customer Subscribe modal.
// Returns ALL data needed to render the modal: active tiers (with name +
// description), the per-seat price for each tier in the requested
// currency (using the volume band = 1 seat row, or whichever covers seat
// count 1), and the billing cycles with their discounts. Effective date
// defaults to today.
// ---------------------------------------------------------------------------

export async function getPublicPricing(currency: string = "INR", seatCount: number = 1) {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  const tiers = await db("plan_tiers").where({ is_active: true }).orderBy("sort_order").orderBy("id");
  const pricingRows = await db("plan_pricing as pp")
    .join("plan_tiers as t", "pp.tier_id", "t.id")
    .where("t.is_active", true)
    .where("pp.currency", currency.toUpperCase())
    .where("pp.effective_from", "<=", today)
    .select("pp.tier_id", "pp.price_per_seat", "pp.min_seats", "pp.max_seats", "pp.effective_from");

  // For each tier, pick the newest pricing row whose seat band covers
  // seatCount. Same logic as getPricePerSeatFor() but for every tier at
  // once.
  const priceByTierId: Record<number, number | null> = {};
  for (const t of tiers) {
    const matches = pricingRows
      .filter(
        (r: any) =>
          r.tier_id === t.id &&
          seatCount >= r.min_seats &&
          (r.max_seats == null || seatCount <= r.max_seats),
      )
      .sort((a: any, b: any) => (a.effective_from < b.effective_from ? 1 : -1));
    priceByTierId[t.id] = matches.length > 0 ? Number(matches[0].price_per_seat) : null;
  }

  const cycles = await db("billing_cycle_discounts")
    .where({ is_active: true })
    .orderBy("sort_order")
    .orderBy("id");

  return {
    currency: currency.toUpperCase(),
    tiers: tiers.map((t: any) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      price_per_seat: priceByTierId[t.id],
    })),
    cycles: cycles.map((c: any) => ({
      cycle: c.cycle,
      label: c.label,
      discount_pct: Number(c.discount_pct),
      months_in_cycle: c.months_in_cycle,
      // Only surface the override when it matches the requested
      // currency. Otherwise the modal would receive an INR override
      // while pricing a USD subscription and get confused.
      override_amount_per_seat:
        c.override_amount_per_seat != null &&
        String(c.override_currency || "").toUpperCase() === currency.toUpperCase()
          ? Number(c.override_amount_per_seat)
          : null,
    })),
  };
}
