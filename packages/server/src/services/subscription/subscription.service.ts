// =============================================================================
// EMP CLOUD — Subscription & Seat Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from "../../utils/errors.js";
import { getAccessibleFeatures } from "../module/module.service.js";
import { logger } from "../../utils/logger.js";
import * as billingIntegration from "../billing/billing-integration.service.js";
import { getPricePerSeat, getOrgCurrency } from "./pricing.js";
import type {
  OrgSubscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  ModuleAccessResult,
} from "@empcloud/shared";

// Re-export getOrgCurrency so existing consumers that import from this file still work
export { getOrgCurrency } from "./pricing.js";

// ---------------------------------------------------------------------------
// Free-tier limits
// ---------------------------------------------------------------------------

const FREE_TIER_MAX_USERS = 5;
const FREE_TIER_MAX_MODULES = 1;

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export async function listSubscriptions(orgId: number): Promise<OrgSubscription[]> {
  const db = getDB();

  // #1191 — Sync used_seats for all active subscriptions before returning
  // This ensures the dashboard always shows correct seat counts
  const activeSubs = await db("org_subscriptions")
    .where({ organization_id: orgId })
    .whereIn("status", ["active", "trial"])
    .select("id", "module_id", "used_seats");

  await Promise.all(
    activeSubs.map((sub) =>
      syncUsedSeats(orgId, sub.module_id).catch((err) => {
        logger.warn(`Failed to sync seat count for org ${orgId} module ${sub.module_id}: ${err.message}`);
      })
    )
  );

  return db("org_subscriptions")
    .where({ organization_id: orgId })
    .orderBy("created_at", "desc");
}

export async function getSubscription(orgId: number, subId: number): Promise<OrgSubscription> {
  const db = getDB();
  const sub = await db("org_subscriptions")
    .where({ id: subId, organization_id: orgId })
    .first();
  if (!sub) throw new NotFoundError("Subscription");
  return sub;
}

export async function createSubscription(
  orgId: number,
  data: CreateSubscriptionInput
): Promise<OrgSubscription> {
  const db = getDB();

  // --- Free-tier module limit ---
  // If the org is subscribing to a free-tier plan, enforce max module count
  if (data.plan_tier === "free") {
    const activeFreeSubs = await db("org_subscriptions")
      .where({ organization_id: orgId, plan_tier: "free" })
      .whereIn("status", ["active", "trial"])
      .count("* as count")
      .first();
    if (Number(activeFreeSubs?.count ?? 0) >= FREE_TIER_MAX_MODULES) {
      throw new ForbiddenError(
        `Free tier is limited to ${FREE_TIER_MAX_MODULES} module(s). Upgrade to a paid plan to add more.`
      );
    }
  }

  // Check if already subscribed (active or trial)
  const existing = await db("org_subscriptions")
    .where({ organization_id: orgId, module_id: data.module_id })
    .first();

  if (existing && existing.status !== "cancelled") {
    throw new ConflictError("Organization already has an active subscription for this module");
  }

  const now = new Date();
  const periodEnd = new Date(now);
  switch (data.billing_cycle || "monthly") {
    case "monthly": periodEnd.setMonth(periodEnd.getMonth() + 1); break;
    case "quarterly": periodEnd.setMonth(periodEnd.getMonth() + 3); break;
    case "annual": periodEnd.setFullYear(periodEnd.getFullYear() + 1); break;
  }

  const trialEndsAt = data.trial_days && data.trial_days > 0
    ? new Date(now.getTime() + data.trial_days * 86400000)
    : null;

  // Determine currency from org settings, then compute price per seat
  const currency = await getOrgCurrency(orgId);
  const pricePerSeat = getPricePerSeat(data.plan_tier, currency);

  // Fetch the module name for the invoice line item
  const mod = await db("modules").where({ id: data.module_id }).first();
  const moduleName = mod?.name ?? `Module #${data.module_id}`;

  let id: number;

  if (existing && existing.status === "cancelled") {
    // Reactivate: update the cancelled row to avoid violating the
    // unique(organization_id, module_id) constraint on org_subscriptions
    id = existing.id;
    await db("org_subscriptions").where({ id }).update({
      plan_tier: data.plan_tier,
      status: trialEndsAt ? "trial" : "active",
      total_seats: data.total_seats,
      used_seats: 0,
      billing_cycle: data.billing_cycle || "monthly",
      price_per_seat: pricePerSeat,
      currency,
      trial_ends_at: trialEndsAt,
      current_period_start: now,
      current_period_end: periodEnd,
      cancelled_at: null,
      updated_at: now,
    });
  } else {
    // Fresh subscription — insert new row
    [id] = await db("org_subscriptions").insert({
      organization_id: orgId,
      module_id: data.module_id,
      plan_tier: data.plan_tier,
      status: trialEndsAt ? "trial" : "active",
      total_seats: data.total_seats,
      used_seats: 0,
      billing_cycle: data.billing_cycle || "monthly",
      price_per_seat: pricePerSeat,
      currency,
      trial_ends_at: trialEndsAt,
      current_period_start: now,
      current_period_end: periodEnd,
      created_at: now,
      updated_at: now,
    });
  }

  // --- Billing integration (non-blocking) ---
  // Create an invoice in EMP Billing for paid, non-trial subscriptions
  if (pricePerSeat > 0 && !trialEndsAt) {
    const totalAmount = pricePerSeat * data.total_seats;
    billingIntegration
      .createInvoice(orgId, [
        {
          description: `${moduleName} — ${data.plan_tier} plan (${data.total_seats} seats × ${data.billing_cycle || "monthly"})`,
          quantity: data.total_seats,
          unitPrice: pricePerSeat,
        },
      ])
      .then((invoiceId) => {
        if (invoiceId) {
          logger.info(`Billing invoice created for subscription ${id}: ${invoiceId}`);
        }
      })
      .catch((err) => {
        logger.warn(`Failed to create billing invoice for subscription ${id}: ${err.message}`);
      });
  }

  return getSubscription(orgId, id);
}

export async function updateSubscription(
  orgId: number,
  subId: number,
  data: UpdateSubscriptionInput
): Promise<OrgSubscription> {
  const db = getDB();
  const sub = await getSubscription(orgId, subId);

  if (data.total_seats !== undefined && data.total_seats < sub.used_seats) {
    throw new ValidationError(
      `Cannot reduce seats below current usage (${sub.used_seats} seats in use)`
    );
  }

  // Recalculate price if plan tier changed
  const updateData: any = { ...data, updated_at: new Date() };
  if (data.plan_tier) {
    const currency = await getOrgCurrency(orgId);
    updateData.price_per_seat = getPricePerSeat(data.plan_tier, currency);
    updateData.currency = currency;
  }

  await db("org_subscriptions")
    .where({ id: subId })
    .update(updateData);

  return getSubscription(orgId, subId);
}

export async function cancelSubscription(orgId: number, subId: number): Promise<OrgSubscription> {
  const db = getDB();
  await getSubscription(orgId, subId); // throws if not found

  await db("org_subscriptions")
    .where({ id: subId, organization_id: orgId })
    .update({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() });

  // Remove all seats
  await db("org_module_seats")
    .where({ subscription_id: subId })
    .delete();

  // Cancel billing subscription if mapped (non-blocking)
  billingIntegration
    .getBillingSubscriptionId(subId)
    .then((billingSubId) => {
      if (billingSubId) return billingIntegration.cancelBillingSubscription(billingSubId);
    })
    .catch((err) => {
      logger.warn(`Failed to cancel billing subscription for sub ${subId}: ${err.message}`);
    });

  return getSubscription(orgId, subId);
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

export async function assignSeat(params: {
  orgId: number;
  moduleId: number;
  userId: number;
  assignedBy: number;
}): Promise<object> {
  const db = getDB();

  // Find active subscription
  const sub = await db("org_subscriptions")
    .where({ organization_id: params.orgId, module_id: params.moduleId })
    .whereIn("status", ["active", "trial"])
    .first();
  if (!sub) throw new NotFoundError("Active subscription for this module");

  // #1461 — Enforce seat limit by COUNTing actual seat rows rather than
  // relying on the cached `used_seats` column, which can drift under
  // concurrent assignment. This is the authoritative check that prevents
  // over-assignment even when two admin requests race.
  const [{ seatCount }] = await db("org_module_seats")
    .where({ subscription_id: sub.id })
    .count("* as seatCount");
  const currentSeats = Number(seatCount);
  if (currentSeats >= sub.total_seats) {
    throw new ConflictError(
      `Seat limit exceeded. Current subscription allows ${sub.total_seats} seats; ${currentSeats} are already assigned. Upgrade your subscription to add more.`
    );
  }

  // Check if already assigned
  const existing = await db("org_module_seats")
    .where({ module_id: params.moduleId, user_id: params.userId })
    .first();
  if (existing) throw new ConflictError("User already has a seat for this module");

  const [id] = await db("org_module_seats").insert({
    subscription_id: sub.id,
    organization_id: params.orgId,
    module_id: params.moduleId,
    user_id: params.userId,
    assigned_by: params.assignedBy,
    assigned_at: new Date(),
  });

  // Increment used_seats
  await db("org_subscriptions")
    .where({ id: sub.id })
    .increment("used_seats", 1);

  return db("org_module_seats").where({ id }).first();
}

export async function revokeSeat(orgId: number, moduleId: number, userId: number): Promise<void> {
  const db = getDB();

  const seat = await db("org_module_seats")
    .where({ organization_id: orgId, module_id: moduleId, user_id: userId })
    .first();
  if (!seat) throw new NotFoundError("Seat assignment");

  await db("org_module_seats").where({ id: seat.id }).delete();

  await db("org_subscriptions")
    .where({ id: seat.subscription_id })
    .decrement("used_seats", 1);
}

export async function listSeats(orgId: number, moduleId: number) {
  const db = getDB();
  return db("org_module_seats as s")
    .join("users as u", "s.user_id", "u.id")
    .where({ "s.organization_id": orgId, "s.module_id": moduleId })
    .select(
      "s.id",
      "s.user_id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.role",
      "s.assigned_at"
    );
}

// ---------------------------------------------------------------------------
// Sync Seat Count (#1191) — Recalculate used_seats from actual org_module_seats rows
// ---------------------------------------------------------------------------

export async function syncUsedSeats(orgId: number, moduleId: number): Promise<void> {
  const db = getDB();

  const sub = await db("org_subscriptions")
    .where({ organization_id: orgId, module_id: moduleId })
    .whereIn("status", ["active", "trial"])
    .first();

  if (!sub) return;

  // Check if this module has explicit seat assignments
  const [{ seatCount }] = await db("org_module_seats")
    .where({ subscription_id: sub.id })
    .count("* as seatCount");

  let actualCount = Number(seatCount);

  // If no explicit seat assignments exist, count active org users instead
  // This handles modules like Monitor where users log in via SSO without
  // explicit seat assignment in EmpCloud
  if (actualCount === 0) {
    const [{ userCount }] = await db("users")
      .where({ organization_id: orgId, status: 1 })
      .whereNot("role", "super_admin")
      .count("* as userCount");
    actualCount = Number(userCount);
  }

  if (sub.used_seats !== actualCount) {
    logger.info(
      `Syncing used_seats for subscription ${sub.id} (org ${orgId}): ${sub.used_seats} -> ${actualCount}`
    );
    await db("org_subscriptions")
      .where({ id: sub.id })
      .update({ used_seats: actualCount, updated_at: new Date() });
  }
}

// ---------------------------------------------------------------------------
// Access Check (called by sub-modules)
// ---------------------------------------------------------------------------

export async function checkModuleAccess(params: {
  userId: number;
  orgId: number;
  moduleSlug: string;
}): Promise<ModuleAccessResult> {
  const db = getDB();

  const mod = await db("modules").where({ slug: params.moduleSlug, is_active: true }).first();
  if (!mod) return { has_access: false, seat_assigned: false, features: [] };

  const sub = await db("org_subscriptions")
    .where({ organization_id: params.orgId, module_id: mod.id })
    .whereIn("status", ["active", "trial"])
    .first();

  // Also deny access if the subscription is suspended or deactivated (overdue invoices)
  if (!sub) {
    // Check if there is a suspended subscription — give a clear reason
    const suspendedSub = await db("org_subscriptions")
      .where({ organization_id: params.orgId, module_id: mod.id })
      .whereIn("status", ["suspended", "deactivated"])
      .first();
    if (suspendedSub) {
      return {
        has_access: false,
        seat_assigned: false,
        features: [],
        subscription: suspendedSub,
      };
    }
    return { has_access: false, seat_assigned: false, features: [] };
  }

  // #1191 — Sync used_seats from actual seat assignments (non-blocking)
  syncUsedSeats(params.orgId, mod.id).catch((err) => {
    logger.warn(`Failed to sync seat count for org ${params.orgId} module ${mod.id}: ${err.message}`);
  });

  const seat = await db("org_module_seats")
    .where({ module_id: mod.id, user_id: params.userId })
    .first();

  const features = await getAccessibleFeatures(mod.id, sub.plan_tier);

  return {
    has_access: !!seat,
    subscription: sub,
    seat_assigned: !!seat,
    features,
  };
}

// =============================================================================
// TODO: MOVE TO EMP BILLING MODULE
// The following dunning/enforcement functions belong in the EMP Billing module,
// not in EMP Cloud. They are kept here temporarily until EMP Billing's
// subscription worker is fully integrated with EmpCloud's subscription lifecycle.
// When migrating:
// 1. Move enforceOverdueInvoices() → billing subscription.worker.ts
// 2. Move processDunning() → billing dunning.service.ts
// 3. Move getGracePeriodDays() → billing config
// 4. Move getBillingStatus() → billing status.service.ts
// 5. EmpCloud should only receive webhook events for status changes
// =============================================================================

// ---------------------------------------------------------------------------
// #983 — Billing Status (overdue/payment warning for org admins)
// ---------------------------------------------------------------------------

export async function getBillingStatus(orgId: number) {
  const db = getDB();
  const now = new Date();

  // Find subscriptions that are overdue or problematic
  const overdueSubs = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.organization_id": orgId })
    .whereIn("s.status", ["past_due", "suspended", "deactivated"])
    .select(
      "s.id",
      "m.name as module_name",
      "s.status",
      "s.current_period_end",
      "s.dunning_stage",
    );

  if (overdueSubs.length === 0) {
    return {
      has_overdue: false,
      days_overdue: 0,
      warning_level: "none" as const,
      overdue_subscriptions: [],
      message: null,
    };
  }

  // Calculate the worst overdue across all subscriptions
  let maxOverdueDays = 0;
  const subs = overdueSubs.map((s: any) => {
    const periodEnd = new Date(s.current_period_end);
    const days = Math.max(
      0,
      Math.floor((now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24)),
    );
    if (days > maxOverdueDays) maxOverdueDays = days;
    return {
      subscription_id: s.id,
      module_name: s.module_name,
      status: s.status,
      current_period_end: s.current_period_end,
      days_overdue: days,
    };
  });

  // Determine warning level based on worst overdue
  let warningLevel: "info" | "warning" | "critical";
  let message: string;

  if (maxOverdueDays >= 30) {
    warningLevel = "critical";
    message = "Your subscription has been deactivated due to non-payment. Please update your payment method immediately to restore access.";
  } else if (maxOverdueDays >= 15) {
    warningLevel = "critical";
    message = "Your subscription has been suspended due to overdue payment. Please pay immediately to avoid losing access.";
  } else if (maxOverdueDays >= 7) {
    warningLevel = "warning";
    message = "Your payment is overdue. Please update your payment method to avoid service interruption.";
  } else {
    warningLevel = "info";
    message = "You have an outstanding invoice. Please complete payment at your earliest convenience.";
  }

  return {
    has_overdue: true,
    days_overdue: maxOverdueDays,
    warning_level: warningLevel,
    overdue_subscriptions: subs,
    message,
  };
}

// ---------------------------------------------------------------------------
// Grace Period Configuration (#981)
// Organizations can be given a grace period (in days) after the billing period
// ends before overdue enforcement kicks in. Default is 0 (no grace).
// ---------------------------------------------------------------------------

/** Default grace period in days. Override per-org via org settings or env. */
const DEFAULT_GRACE_PERIOD_DAYS = parseInt(
  process.env.BILLING_GRACE_PERIOD_DAYS || "0",
  10,
);

/**
 * Get the grace period for a specific organization.
 * Checks org_settings table first, then falls back to the global default.
 */
async function getGracePeriodDays(orgId: number): Promise<number> {
  const db = getDB();
  const setting = await db("organizations")
    .where({ id: orgId })
    .select("grace_period_days")
    .first();

  // If the org has a custom grace period, use it; otherwise use the default
  if (setting && setting.grace_period_days !== null && setting.grace_period_days !== undefined) {
    return Number(setting.grace_period_days);
  }

  return DEFAULT_GRACE_PERIOD_DAYS;
}

// ---------------------------------------------------------------------------
// Overdue Invoice Enforcement (#1016)
// After 15 days overdue (post-grace): suspend subscription.
// After 30 days overdue (post-grace): deactivate subscription.
// Grace period (#981): overdue counting starts AFTER the grace period expires.
// Call this periodically (e.g., daily cron) or on-demand.
// ---------------------------------------------------------------------------

export async function enforceOverdueInvoices(): Promise<{
  suspended: number;
  deactivated: number;
  gracePeriodSkipped: number;
}> {
  const db = getDB();
  const now = new Date();
  let suspended = 0;
  let deactivated = 0;
  let gracePeriodSkipped = 0;

  // Fetch all overdue invoices from the billing module for all orgs.
  // We check every active/past_due subscription that has a billing mapping.
  const mappings = await db("billing_subscription_mappings as bsm")
    .join("org_subscriptions as os", "bsm.cloud_subscription_id", "os.id")
    .whereIn("os.status", ["active", "past_due", "suspended"])
    .select(
      "bsm.organization_id",
      "bsm.cloud_subscription_id",
      "bsm.billing_subscription_id",
      "os.status as current_status",
      "os.current_period_end"
    );

  for (const mapping of mappings) {
    // Check if current_period_end is past (invoice would be overdue)
    const periodEnd = new Date(mapping.current_period_end);
    const rawOverdueDays = (now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24);

    // Apply grace period — overdue counting starts after grace expires
    const graceDays = await getGracePeriodDays(mapping.organization_id);
    const effectiveOverdueDays = rawOverdueDays - graceDays;

    if (effectiveOverdueDays <= 0) {
      // Still within grace period — skip enforcement
      if (rawOverdueDays > 0) {
        gracePeriodSkipped++;
        logger.debug(
          `Subscription ${mapping.cloud_subscription_id} (org ${mapping.organization_id}) ` +
          `is ${Math.floor(rawOverdueDays)} days past period end but within ${graceDays}-day grace period`
        );
      }
      continue;
    }

    if (effectiveOverdueDays >= 30 && mapping.current_status !== "deactivated") {
      // 30+ days overdue (post-grace) -> deactivate
      await db("org_subscriptions")
        .where({ id: mapping.cloud_subscription_id })
        .update({ status: "deactivated", updated_at: now });
      deactivated++;
      logger.warn(
        `Subscription ${mapping.cloud_subscription_id} (org ${mapping.organization_id}) ` +
        `deactivated — ${Math.floor(effectiveOverdueDays)} days overdue (after ${graceDays}-day grace)`
      );
    } else if (effectiveOverdueDays >= 15 && mapping.current_status === "active") {
      // 15-29 days overdue (post-grace) -> suspend (read-only, limited access)
      await db("org_subscriptions")
        .where({ id: mapping.cloud_subscription_id })
        .update({ status: "suspended", updated_at: now });
      suspended++;
      logger.warn(
        `Subscription ${mapping.cloud_subscription_id} (org ${mapping.organization_id}) ` +
        `suspended — ${Math.floor(effectiveOverdueDays)} days overdue (after ${graceDays}-day grace)`
      );
    }
  }

  // Also handle subscriptions without billing mappings: use current_period_end
  // directly for subscriptions that are past_due (set by payment failure webhook).
  const pastDueSubs = await db("org_subscriptions")
    .whereIn("status", ["past_due"])
    .select("id", "organization_id", "current_period_end");

  for (const sub of pastDueSubs) {
    const periodEnd = new Date(sub.current_period_end);
    const rawOverdueDays = (now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24);

    // Apply grace period
    const graceDays = await getGracePeriodDays(sub.organization_id);
    const effectiveOverdueDays = rawOverdueDays - graceDays;

    if (effectiveOverdueDays <= 0) {
      if (rawOverdueDays > 0) gracePeriodSkipped++;
      continue;
    }

    if (effectiveOverdueDays >= 30) {
      await db("org_subscriptions")
        .where({ id: sub.id })
        .update({ status: "deactivated", updated_at: now });
      deactivated++;
      logger.warn(
        `Subscription ${sub.id} (org ${sub.organization_id}) deactivated — past_due for ${Math.floor(effectiveOverdueDays)} days (after ${graceDays}-day grace)`
      );
    } else if (effectiveOverdueDays >= 15) {
      await db("org_subscriptions")
        .where({ id: sub.id })
        .update({ status: "suspended", updated_at: now });
      suspended++;
      logger.warn(
        `Subscription ${sub.id} (org ${sub.organization_id}) suspended — past_due for ${Math.floor(effectiveOverdueDays)} days (after ${graceDays}-day grace)`
      );
    }
  }

  if (suspended > 0 || deactivated > 0 || gracePeriodSkipped > 0) {
    logger.info(
      `Overdue enforcement complete: ${suspended} suspended, ${deactivated} deactivated, ${gracePeriodSkipped} skipped (grace period)`
    );
  }

  return { suspended, deactivated, gracePeriodSkipped };
}

// ---------------------------------------------------------------------------
// Dunning Workflow (#982)
// Progressive collection process for overdue invoices:
//   Day 1  (post-grace) → friendly email reminder
//   Day 7  (post-grace) → warning email (payment required)
//   Day 15 (post-grace) → suspend subscription (read-only access)
//   Day 30 (post-grace) → deactivate subscription (no access)
//
// Each dunning action is logged and tracked via dunning_stage on the
// subscription to avoid sending duplicate notifications.
//
// Call this daily from a cron job (separate from enforceOverdueInvoices).
// ---------------------------------------------------------------------------

export type DunningStage = "current" | "reminder" | "warning" | "suspended" | "deactivated";

export interface DunningAction {
  subscriptionId: number;
  organizationId: number;
  stage: DunningStage;
  overdueDays: number;
  gracePeriodDays: number;
  action: string;
}

export async function processDunning(): Promise<{
  actions: DunningAction[];
  totalProcessed: number;
}> {
  const db = getDB();
  const now = new Date();
  const actions: DunningAction[] = [];

  // Fetch all subscriptions that are active, past_due, or suspended
  // (deactivated ones are already terminal — no further dunning needed)
  const subscriptions = await db("org_subscriptions")
    .whereIn("status", ["active", "past_due", "suspended"])
    .select(
      "id",
      "organization_id",
      "status",
      "current_period_end",
      "dunning_stage"
    );

  for (const sub of subscriptions) {
    const periodEnd = new Date(sub.current_period_end);
    const rawOverdueDays = (now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24);

    // Not yet past the period end — skip
    if (rawOverdueDays <= 0) continue;

    // Apply grace period
    const graceDays = await getGracePeriodDays(sub.organization_id);
    const effectiveOverdueDays = rawOverdueDays - graceDays;

    // Still within grace period — no dunning action
    if (effectiveOverdueDays <= 0) continue;

    const currentStage: DunningStage = sub.dunning_stage || "current";

    // Determine the target dunning stage based on overdue days
    let targetStage: DunningStage;
    let actionDescription: string;

    if (effectiveOverdueDays >= 30) {
      targetStage = "deactivated";
      actionDescription = "Deactivate subscription — 30+ days overdue";
    } else if (effectiveOverdueDays >= 15) {
      targetStage = "suspended";
      actionDescription = "Suspend subscription — 15+ days overdue";
    } else if (effectiveOverdueDays >= 7) {
      targetStage = "warning";
      actionDescription = "Send payment warning email — 7+ days overdue";
    } else {
      // 1-6 days overdue (post-grace)
      targetStage = "reminder";
      actionDescription = "Send friendly payment reminder email — 1+ day overdue";
    }

    // Only act if we're moving to a new (more severe) stage
    const stageOrder: Record<DunningStage, number> = {
      current: 0,
      reminder: 1,
      warning: 2,
      suspended: 3,
      deactivated: 4,
    };

    if (stageOrder[targetStage] <= stageOrder[currentStage]) {
      // Already at or past this stage — no action needed
      continue;
    }

    // Execute the dunning action
    const updateData: Record<string, any> = {
      dunning_stage: targetStage,
      dunning_last_action_at: now,
      updated_at: now,
    };

    if (targetStage === "suspended") {
      updateData.status = "suspended";
    } else if (targetStage === "deactivated") {
      updateData.status = "deactivated";
    } else if (sub.status === "active") {
      // For reminder/warning stages, mark as past_due if still active
      updateData.status = "past_due";
    }

    await db("org_subscriptions")
      .where({ id: sub.id })
      .update(updateData);

    const action: DunningAction = {
      subscriptionId: sub.id,
      organizationId: sub.organization_id,
      stage: targetStage,
      overdueDays: Math.floor(effectiveOverdueDays),
      gracePeriodDays: graceDays,
      action: actionDescription,
    };

    actions.push(action);

    logger.info(
      `Dunning [${targetStage}] for subscription ${sub.id} (org ${sub.organization_id}): ` +
      `${Math.floor(effectiveOverdueDays)} days overdue (${graceDays}-day grace). ` +
      `Action: ${actionDescription}`
    );
  }

  if (actions.length > 0) {
    logger.info(`Dunning complete: ${actions.length} actions taken across ${subscriptions.length} subscriptions`);
  }

  return { actions, totalProcessed: subscriptions.length };
}

// ---------------------------------------------------------------------------
// Free-Tier Limit Check — called by user.service before creating users
// ---------------------------------------------------------------------------

export async function checkFreeTierUserLimit(orgId: number): Promise<void> {
  const db = getDB();

  // Check if org has ONLY free-tier subscriptions (or no paid subscriptions at all)
  const paidSub = await db("org_subscriptions")
    .where({ organization_id: orgId })
    .whereIn("status", ["active", "trial"])
    .whereNot({ plan_tier: "free" })
    .first();

  // If there's at least one paid subscription, no user limit applies
  if (paidSub) return;

  // Check if org has any free subscription (meaning they're on the free tier)
  const freeSub = await db("org_subscriptions")
    .where({ organization_id: orgId, plan_tier: "free" })
    .whereIn("status", ["active", "trial"])
    .first();

  // If no subscriptions at all, check the org's default user count
  // (new orgs get total_allowed_user_count = 10 by default, so only enforce
  // the stricter free-tier limit when there's an explicit free subscription)
  if (!freeSub) return;

  // Count current active users in this org
  const [{ count }] = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .count("* as count");

  if (Number(count) >= FREE_TIER_MAX_USERS) {
    throw new ForbiddenError(
      `Free tier is limited to ${FREE_TIER_MAX_USERS} users. Upgrade to a paid plan to add more.`
    );
  }
}
