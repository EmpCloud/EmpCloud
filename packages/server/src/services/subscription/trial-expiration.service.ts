import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";
import * as billingEmitter from "../billing/empcloud-webhook-emitter.js";
import { getPricePerSeat, getOrgCurrency } from "./pricing.js";

interface ExpiredTrialResult {
  scanned: number;
  expired: number;
  failed: number;
}

const TIER_RANK: Record<string, number> = {
  free: 0,
  basic: 1,
  professional: 2,
  enterprise: 3,
};

const CYCLE_RANK: Record<string, number> = {
  monthly: 0,
  quarterly: 1,
  semi_annual: 2,
  annual: 3,
};

export function getTierRank(tier?: string | null): number {
  return TIER_RANK[(tier ?? "basic").toLowerCase()] ?? 0;
}

export function getCycleRank(cycle?: string | null): number {
  return CYCLE_RANK[(cycle ?? "monthly").toLowerCase()] ?? 0;
}

/**
 * Builds the DB update payload that converts a trial subscription into a
 * regular active one. Used by:
 *   - hourly cron (natural expiry on day 14)
 *   - updateSubscription (early upgrade triggered by seat / tier / cycle increase)
 *
 * Both paths produce identical state so emp-billing's invoice flow doesn't
 * have to differentiate. Billing is PREPAID: emp-billing generates the
 * upcoming-period invoice immediately on the trialing → active webhook,
 * not when the period ends.
 *
 * IMPORTANT: pass the EFFECTIVE plan_tier / billing_cycle (the values the
 * subscription is transitioning TO, not the trial's original tier). Trial
 * stores price_per_seat = 0 regardless, so we must recompute from live
 * pricing on every transition.
 */
export async function buildTrialEndPayload(params: {
  orgId: number;
  planTier: string;
  billingCycle: string;
}): Promise<Record<string, unknown>> {
  const now = new Date();
  const currency = await getOrgCurrency(params.orgId);
  return {
    status: "active",
    trial_ends_at: null,
    current_period_start: now,
    current_period_end: computePeriodEnd(now, params.billingCycle),
    price_per_seat: getPricePerSeat(params.planTier, currency),
    currency,
    updated_at: now,
  };
}

/**
 * Scans org_subscriptions for rows where status='trial' AND trial_ends_at
 * has passed, flips them to active, and emits subscription.updated so
 * emp-billing creates the first prepaid invoice.
 *
 * Pre-fix, nothing ever read trial_ends_at — trials silently extended past
 * day 14 indefinitely. Customers got free service for ~30+ days instead
 * of 14.
 *
 * Idempotent: re-running only picks up rows still in trial state.
 */
export async function expireTrials(): Promise<ExpiredTrialResult> {
  const db = getDB();
  const now = new Date();

  const expired = await db("org_subscriptions")
    .where({ status: "trial" })
    .where("trial_ends_at", "<", now)
    .select("id", "organization_id", "module_id", "billing_cycle", "plan_tier");

  if (expired.length === 0) {
    return { scanned: 0, expired: 0, failed: 0 };
  }

  logger.info(`Trial expiration: found ${expired.length} subscription(s) to convert from trial to active`);

  let succeeded = 0;
  let failed = 0;

  for (const sub of expired) {
    try {
      const payload = await buildTrialEndPayload({
        orgId: sub.organization_id,
        planTier: sub.plan_tier,
        billingCycle: sub.billing_cycle || "monthly",
      });

      await db("org_subscriptions").where({ id: sub.id }).update(payload);

      billingEmitter
        .emitSubscriptionUpdated(sub.id)
        .catch((err) => {
          logger.warn(`Trial expiration: emp-billing webhook failed for sub ${sub.id}: ${err?.message}`);
        });

      succeeded++;
      logger.info(`Trial expired for subscription ${sub.id} (org ${sub.organization_id} module ${sub.module_id})`);
    } catch (err) {
      failed++;
      logger.error(`Trial expiration failed for subscription ${sub.id}`, { err });
    }
  }

  logger.info(`Trial expiration complete: ${succeeded} expired, ${failed} failed (scanned ${expired.length})`);
  return { scanned: expired.length, expired: succeeded, failed };
}

function computePeriodEnd(start: Date, cycle: string): Date {
  const d = new Date(start.getTime());
  switch (cycle) {
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "semi_annual":
      d.setMonth(d.getMonth() + 6);
      break;
    case "annual":
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    case "monthly":
    default:
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return d;
}
