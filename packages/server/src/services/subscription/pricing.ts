// =============================================================================
// Pricing Configuration
// TODO: Move to EMP Billing module — pricing should be owned by Billing,
// not EmpCloud. EmpCloud should query Billing API for current prices.
// =============================================================================

import { getDB } from "../../db/connection.js";

// ---------------------------------------------------------------------------
// Multi-currency pricing helpers
// ---------------------------------------------------------------------------

/** Plan pricing in smallest currency unit, keyed by currency then plan tier. */
export const PLAN_PRICING_BY_CURRENCY: Record<string, Record<string, number>> = {
  INR: { free: 0, basic: 50000, professional: 100000, enterprise: 175000 },   // paise
  USD: { free: 0, basic: 500,   professional: 1000,   enterprise: 1750   },   // cents
  GBP: { free: 0, basic: 500,   professional: 1000,   enterprise: 1750   },   // pence
  EUR: { free: 0, basic: 500,   professional: 1000,   enterprise: 1750   },   // cents
};

export function getPricePerSeat(planTier: string, currency: string): number {
  const tierPricing = PLAN_PRICING_BY_CURRENCY[currency] ?? PLAN_PRICING_BY_CURRENCY["USD"];
  return tierPricing[planTier] ?? tierPricing["basic"] ?? 500;
}

export function getCurrencyForCountry(country: string): string {
  const inrCountries = ["IN", "India"];
  const gbpCountries = ["GB", "UK", "United Kingdom"];
  const eurCountries = ["DE", "FR", "IT", "ES", "NL", "Germany", "France", "Italy", "Spain"];

  if (inrCountries.includes(country)) return "INR";
  if (gbpCountries.includes(country)) return "GBP";
  if (eurCountries.includes(country)) return "EUR";
  return "USD"; // Default for US and everywhere else
}

/** Resolve the billing currency for an organization. */
export async function getOrgCurrency(orgId: number): Promise<string> {
  const db = getDB();
  const org = await db("organizations")
    .where({ id: orgId })
    .select("currency", "country")
    .first();
  if (!org) return "USD";
  return org.currency || getCurrencyForCountry(org.country || "");
}
