// =============================================================================
// EMP CLOUD — Billing Integration Service
// Interfaces with EMP Billing to auto-generate invoices from subscriptions.
// =============================================================================

import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { getDB } from "../../db/connection.js";
import { getOrgCurrency } from "../subscription/subscription.service.js";

interface BillingEvent {
  event_type: string;
  organization_id: number;
  subscription_id: number;
  module_slug: string;
  module_name: string;
  plan_tier: string;
  total_seats: number;
  price_per_seat: number;
  currency: string;
  billing_cycle: string;
  period_start: string;
  period_end: string;
}

/**
 * Notify EMP Billing about a subscription event.
 * This triggers invoice generation in the billing module.
 */
export async function notifyBilling(event: BillingEvent): Promise<boolean> {
  const billingUrl = config.billing.moduleUrl;
  const apiKey = config.billing.apiKey;

  if (!billingUrl || !apiKey) {
    logger.debug("Billing integration not configured, skipping notification");
    return false;
  }

  try {
    const response = await fetch(`${billingUrl}/api/v1/webhooks/empcloud`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EmpCloud-API-Key": apiKey,
        "X-EmpCloud-Event": event.event_type,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      logger.warn(`Billing notification failed: ${response.status} ${response.statusText}`);
      return false;
    }

    logger.info(`Billing notified: ${event.event_type} for org ${event.organization_id}`);
    return true;
  } catch (err: any) {
    logger.warn(`Billing notification error: ${err.message}`);
    return false;
  }
}

/**
 * Send subscription created event to billing.
 */
export async function onSubscriptionCreated(subscriptionId: number): Promise<void> {
  const db = getDB();
  const sub = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.id": subscriptionId })
    .select("s.*", "m.slug as module_slug", "m.name as module_name")
    .first();

  if (!sub) return;

  await notifyBilling({
    event_type: "subscription.created",
    organization_id: sub.organization_id,
    subscription_id: sub.id,
    module_slug: sub.module_slug,
    module_name: sub.module_name,
    plan_tier: sub.plan_tier,
    total_seats: sub.total_seats,
    price_per_seat: Number(sub.price_per_seat),
    currency: sub.currency,
    billing_cycle: sub.billing_cycle,
    period_start: sub.current_period_start,
    period_end: sub.current_period_end,
  });
}

/**
 * Send subscription updated event to billing (seat change, plan change).
 */
export async function onSubscriptionUpdated(subscriptionId: number): Promise<void> {
  const db = getDB();
  const sub = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.id": subscriptionId })
    .select("s.*", "m.slug as module_slug", "m.name as module_name")
    .first();

  if (!sub) return;

  await notifyBilling({
    event_type: "subscription.updated",
    organization_id: sub.organization_id,
    subscription_id: sub.id,
    module_slug: sub.module_slug,
    module_name: sub.module_name,
    plan_tier: sub.plan_tier,
    total_seats: sub.total_seats,
    price_per_seat: Number(sub.price_per_seat),
    currency: sub.currency,
    billing_cycle: sub.billing_cycle,
    period_start: sub.current_period_start,
    period_end: sub.current_period_end,
  });
}

/**
 * Send subscription cancelled event to billing.
 */
export async function onSubscriptionCancelled(subscriptionId: number): Promise<void> {
  const db = getDB();
  const sub = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.id": subscriptionId })
    .select("s.*", "m.slug as module_slug", "m.name as module_name")
    .first();

  if (!sub) return;

  await notifyBilling({
    event_type: "subscription.cancelled",
    organization_id: sub.organization_id,
    subscription_id: sub.id,
    module_slug: sub.module_slug,
    module_name: sub.module_name,
    plan_tier: sub.plan_tier,
    total_seats: sub.total_seats,
    price_per_seat: Number(sub.price_per_seat),
    currency: sub.currency,
    billing_cycle: sub.billing_cycle,
    period_start: sub.current_period_start,
    period_end: sub.current_period_end,
  });
}

/**
 * Get billing summary for an organization (aggregates subscription costs).
 */
export async function getBillingSummary(orgId: number) {
  const db = getDB();

  const subscriptions = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.organization_id": orgId })
    .whereIn("s.status", ["active", "trial"])
    .select(
      "s.id",
      "m.name as module_name",
      "m.slug as module_slug",
      "s.plan_tier",
      "s.total_seats",
      "s.used_seats",
      "s.price_per_seat",
      "s.currency",
      "s.billing_cycle",
      "s.current_period_end"
    );

  const totalMonthlyCost = subscriptions.reduce((sum, s) => {
    const seatCost = Number(s.price_per_seat) * s.total_seats;
    switch (s.billing_cycle) {
      case "quarterly": return sum + seatCost / 3;
      case "annual": return sum + seatCost / 12;
      default: return sum + seatCost;
    }
  }, 0);

  // Resolve currency: prefer from subscriptions, fall back to org setting
  const currency = subscriptions[0]?.currency || await getOrgCurrency(orgId);

  return {
    subscriptions,
    total_monthly_cost: totalMonthlyCost,
    currency,
  };
}
