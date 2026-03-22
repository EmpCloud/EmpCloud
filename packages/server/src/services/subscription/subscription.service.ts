// =============================================================================
// EMP CLOUD — Subscription & Seat Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ConflictError, ValidationError } from "../../utils/errors.js";
import { getAccessibleFeatures } from "../module/module.service.js";
import type {
  OrgSubscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  ModuleAccessResult,
} from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export async function listSubscriptions(orgId: number): Promise<OrgSubscription[]> {
  const db = getDB();
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

  // Check if already subscribed
  const existing = await db("org_subscriptions")
    .where({ organization_id: orgId, module_id: data.module_id })
    .whereNot({ status: "cancelled" })
    .first();
  if (existing) throw new ConflictError("Organization already has an active subscription for this module");

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

  const [id] = await db("org_subscriptions").insert({
    organization_id: orgId,
    module_id: data.module_id,
    plan_tier: data.plan_tier,
    status: trialEndsAt ? "trial" : "active",
    total_seats: data.total_seats,
    used_seats: 0,
    billing_cycle: data.billing_cycle || "monthly",
    price_per_seat: 0, // set by billing integration
    currency: "USD",
    trial_ends_at: trialEndsAt,
    current_period_start: now,
    current_period_end: periodEnd,
    created_at: now,
    updated_at: now,
  });

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

  await db("org_subscriptions")
    .where({ id: subId })
    .update({ ...data, updated_at: new Date() });

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

  if (sub.used_seats >= sub.total_seats) {
    throw new ValidationError("No available seats. Upgrade your subscription to add more.");
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

  if (!sub) return { has_access: false, seat_assigned: false, features: [] };

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
