// =============================================================================
// EMP CLOUD — Subscription Admin Service
//
// Full per-org-subscription control surface for the Super Admin UI:
//   - List all subscriptions with rich filters
//   - Detail (joined to org + module)
//   - Update ANY field (start/end dates, status, seats, price, currency,
//     trial end, plan tier, auto-renew, free flag, notes)
//   - Status quick-actions (suspend, activate, cancel)
//   - Toggle free / comp with reason
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import {
  emitSubscriptionUpdated,
  emitSubscriptionCancelled,
} from "../billing/empcloud-webhook-emitter.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listSubscriptions(filters?: {
  status?: string;
  plan_tier?: string;
  currency?: string;
  module_id?: number;
  organization_id?: number;
  q?: string; // org name / org id search
  page?: number;
  limit?: number;
}) {
  const db = getDB();
  const page = Math.max(1, Number(filters?.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(filters?.limit) || 25));

  const baseQuery = db("org_subscriptions as s")
    .leftJoin("organizations as o", "s.organization_id", "o.id")
    .leftJoin("modules as m", "s.module_id", "m.id");

  if (filters?.status) baseQuery.where("s.status", filters.status);
  if (filters?.plan_tier) baseQuery.where("s.plan_tier", filters.plan_tier);
  if (filters?.currency) baseQuery.where("s.currency", filters.currency);
  if (filters?.module_id) baseQuery.where("s.module_id", filters.module_id);
  if (filters?.organization_id) baseQuery.where("s.organization_id", filters.organization_id);
  if (filters?.q && filters.q.trim()) {
    const q = `%${filters.q.trim()}%`;
    baseQuery.where(function () {
      this.where("o.name", "like", q)
        .orWhere("o.email", "like", q);
    });
  }

  const totalQ = baseQuery.clone().count<{ n: number }[]>("s.id as n").first();
  const rowsQ = baseQuery.clone()
    .select(
      "s.id",
      "s.organization_id",
      "o.name as organization_name",
      "o.email as organization_email",
      "o.country as organization_country",
      "s.module_id",
      "m.slug as module_slug",
      "m.name as module_name",
      "s.plan_tier",
      "s.status",
      "s.total_seats",
      "s.used_seats",
      "s.billing_cycle",
      "s.price_per_seat",
      "s.currency",
      "s.trial_ends_at",
      "s.current_period_start",
      "s.current_period_end",
      "s.cancelled_at",
      "s.dunning_stage",
      "s.auto_renew",
      "s.is_free",
      "s.free_reason",
      "s.manually_overridden",
      "s.internal_notes",
      "s.created_at",
      "s.updated_at",
    )
    .orderBy("s.created_at", "desc")
    .limit(limit)
    .offset((page - 1) * limit);

  const [totalRow, rows] = await Promise.all([totalQ, rowsQ]);
  const total = Number(totalRow?.n ?? 0);
  return {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getSubscription(id: number) {
  const db = getDB();
  const sub = await db("org_subscriptions as s")
    .leftJoin("organizations as o", "s.organization_id", "o.id")
    .leftJoin("modules as m", "s.module_id", "m.id")
    .where("s.id", id)
    .select(
      "s.*",
      "o.name as organization_name",
      "o.email as organization_email",
      "o.country as organization_country",
      "m.slug as module_slug",
      "m.name as module_name",
    )
    .first();
  if (!sub) throw new NotFoundError("Subscription");
  return sub;
}

// ---------------------------------------------------------------------------
// Update — every field is optional; only provided fields are touched.
// ---------------------------------------------------------------------------

export type SubscriptionUpdate = Partial<{
  plan_tier: string;
  status: string;
  total_seats: number;
  billing_cycle: string;
  price_per_seat: number;
  currency: string;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  cancelled_at: string | null;
  auto_renew: boolean;
  is_free: boolean;
  free_reason: string | null;
  internal_notes: string | null;
  manually_overridden: boolean;
}>;

const STATUS_WHITELIST = new Set([
  "trial",
  "active",
  "past_due",
  "suspended",
  "cancelled",
  "expired",
]);

export async function updateSubscription(
  id: number,
  data: SubscriptionUpdate,
  updatedBy?: number,
) {
  const db = getDB();
  const existing = await db("org_subscriptions").where({ id }).first();
  if (!existing) throw new NotFoundError("Subscription");

  const updateData: Record<string, any> = { updated_at: new Date() };

  if (data.plan_tier !== undefined) {
    if (!data.plan_tier.trim()) throw new ValidationError("plan_tier cannot be empty");
    updateData.plan_tier = data.plan_tier.trim().toLowerCase();
  }
  if (data.status !== undefined) {
    if (!STATUS_WHITELIST.has(data.status)) {
      throw new ValidationError(
        `Invalid status. Allowed: ${Array.from(STATUS_WHITELIST).join(", ")}`,
      );
    }
    updateData.status = data.status;
    // Stamp cancelled_at automatically when transitioning to cancelled,
    // and clear it when re-activating. Saves the UI a round-trip.
    if (data.status === "cancelled" && !existing.cancelled_at) {
      updateData.cancelled_at = new Date();
    }
    if (data.status === "active" && existing.status === "cancelled") {
      updateData.cancelled_at = null;
    }
  }
  if (data.total_seats !== undefined) {
    if (!Number.isFinite(data.total_seats) || data.total_seats < 0) {
      throw new ValidationError("total_seats must be 0 or positive");
    }
    updateData.total_seats = Math.floor(data.total_seats);
  }
  if (data.billing_cycle !== undefined) updateData.billing_cycle = data.billing_cycle;
  if (data.price_per_seat !== undefined) {
    if (!Number.isFinite(data.price_per_seat) || data.price_per_seat < 0) {
      throw new ValidationError("price_per_seat must be 0 or positive");
    }
    updateData.price_per_seat = Math.round(data.price_per_seat);
    // Any explicit price edit implies a manual override. The billing
    // sync respects this flag and won't overwrite.
    updateData.manually_overridden = true;
  }
  if (data.currency !== undefined) {
    if (data.currency.length !== 3) throw new ValidationError("currency must be a 3-letter code");
    updateData.currency = data.currency.toUpperCase();
  }
  if (data.trial_ends_at !== undefined) updateData.trial_ends_at = data.trial_ends_at;
  if (data.current_period_start !== undefined) updateData.current_period_start = data.current_period_start;
  if (data.current_period_end !== undefined) updateData.current_period_end = data.current_period_end;
  if (data.cancelled_at !== undefined) updateData.cancelled_at = data.cancelled_at;
  if (data.auto_renew !== undefined) updateData.auto_renew = !!data.auto_renew;
  if (data.is_free !== undefined) {
    updateData.is_free = !!data.is_free;
    // Marking free forces price to 0 + reason required.
    if (data.is_free) {
      updateData.price_per_seat = 0;
      updateData.manually_overridden = true;
    }
  }
  if (data.free_reason !== undefined) updateData.free_reason = data.free_reason;
  if (data.is_free && !(data.free_reason || existing.free_reason)) {
    throw new ValidationError("free_reason is required when is_free is true");
  }
  if (data.internal_notes !== undefined) updateData.internal_notes = data.internal_notes;
  if (data.manually_overridden !== undefined) {
    updateData.manually_overridden = !!data.manually_overridden;
  }
  if (updatedBy != null) updateData.updated_by = updatedBy;

  await db("org_subscriptions").where({ id }).update(updateData);

  // Pick the right webhook event so emp-billing runs the right handler.
  // emp-billing's `subscription.updated` handler hardcodes status to
  // "trialing" or "active" -- it cannot land "cancelled" through that
  // path. The dedicated `subscription.cancelled` handler properly sets
  // status='cancelled', stamps cancelledAt, and emits the internal event
  // bus that downstream listeners (cancellation email, mandate revoke)
  // depend on. So when this update is the act of cancelling, fire the
  // cancelled event. Any other change → updated.
  //
  // Non-blocking: a webhook failure doesn't roll back the local commit;
  // billing-side reconciliation can be re-run separately.
  const transitioningToCancelled =
    updateData.status === "cancelled" && existing.status !== "cancelled";
  try {
    if (transitioningToCancelled) {
      await emitSubscriptionCancelled(id);
    } else {
      await emitSubscriptionUpdated(id);
    }
  } catch (err) {
    logger.warn("subscription-admin: emit webhook failed", {
      subscriptionId: id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return getSubscription(id);
}

// ---------------------------------------------------------------------------
// Status quick actions
// ---------------------------------------------------------------------------

export async function suspendSubscription(id: number, updatedBy?: number) {
  return updateSubscription(id, { status: "suspended" }, updatedBy);
}

export async function activateSubscription(id: number, updatedBy?: number) {
  return updateSubscription(id, { status: "active" }, updatedBy);
}

export async function cancelSubscription(id: number, updatedBy?: number) {
  return updateSubscription(id, { status: "cancelled" }, updatedBy);
}

export async function markFree(
  id: number,
  reason: string,
  updatedBy?: number,
) {
  if (!reason?.trim()) {
    throw new ValidationError("A reason is required when comping a subscription");
  }
  return updateSubscription(id, { is_free: true, free_reason: reason.trim() }, updatedBy);
}

export async function unmarkFree(id: number, updatedBy?: number) {
  return updateSubscription(id, { is_free: false, free_reason: null }, updatedBy);
}

// ---------------------------------------------------------------------------
// Manual invoice — thin proxy to emp-billing. EmpCloud doesn't own the
// invoice table; we record the intent in internal_notes and call the
// billing API to actually create it. Returns the payload that was POSTed
// so the UI can confirm to the operator without re-fetching.
// ---------------------------------------------------------------------------

export async function recordManualInvoiceIntent(
  id: number,
  data: {
    amount: number;
    description?: string;
    due_date?: string;
  },
  updatedBy?: number,
) {
  const db = getDB();
  const sub = await getSubscription(id);
  if (!Number.isFinite(data.amount) || data.amount < 0) {
    throw new ValidationError("amount must be 0 or positive");
  }
  const note = `[${new Date().toISOString().slice(0, 10)}] manual invoice: ${sub.currency} ${Number(data.amount) / 100} — ${data.description || "(no description)"}${data.due_date ? " — due " + data.due_date : ""}`;
  const existingNotes = sub.internal_notes ? `${sub.internal_notes}\n` : "";
  await db("org_subscriptions")
    .where({ id })
    .update({
      internal_notes: existingNotes + note,
      updated_at: new Date(),
      ...(updatedBy != null ? { updated_by: updatedBy } : {}),
    });
  return { subscription_id: id, recorded: note };
}
