import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";
import * as billingEmitter from "../billing/empcloud-webhook-emitter.js";

interface ExpiredTrialResult {
  scanned: number;
  expired: number;
  failed: number;
}

/**
 * Scans org_subscriptions for rows where status='trial' AND trial_ends_at has
 * passed, flips them to status='active', resets the billing period to start
 * from now, and notifies emp-billing so the renewal worker can generate the
 * first real invoice on the new current_period_end.
 *
 * Pre-fix, nothing in the codebase ever checked trial_ends_at — it was set
 * during onboarding and then never read, so trials silently extended past
 * day 14 until current_period_end was reached on day ~30 and the overdue
 * enforcement chain kicked in. Customers got ~30 days free instead of 14.
 *
 * Idempotent: re-running picks up only rows that haven't been flipped yet.
 * Safe to call from a periodic interval, an admin tool, or at server boot.
 */
export async function expireTrials(): Promise<ExpiredTrialResult> {
  const db = getDB();
  const now = new Date();

  const expired = await db("org_subscriptions")
    .where({ status: "trial" })
    .where("trial_ends_at", "<", now)
    .select("id", "organization_id", "module_id", "billing_cycle");

  if (expired.length === 0) {
    return { scanned: 0, expired: 0, failed: 0 };
  }

  logger.info(`Trial expiration: found ${expired.length} subscription(s) to convert from trial to active`);

  let succeeded = 0;
  let failed = 0;

  for (const sub of expired) {
    try {
      const periodEnd = computePeriodEnd(now, sub.billing_cycle || "monthly");

      await db("org_subscriptions")
        .where({ id: sub.id })
        .update({
          status: "active",
          current_period_start: now,
          current_period_end: periodEnd,
          updated_at: now,
        });

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
