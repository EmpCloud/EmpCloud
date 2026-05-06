// =============================================================================
// EMP CLOUD — emp-billing Webhook Emitter
// -----------------------------------------------------------------------------
// One-way notifier from EmpCloud to emp-billing. Replaces the half-built
// `autoProvisionClient` / `createBillingPlan` / `createBillingSubscription`
// chain in `billing-integration.service.ts`, which was never wired into a
// production code path and would have created duplicate billing client
// records anyway (see the comment in `billing-integration.service.ts:260`
// — the old HTTP path's auto-provisioned clients didn't match the records
// emp-billing's webhook handler creates, so payments / invoices for an
// EmpCloud org never showed up under EmpCloud's mapped client id).
//
// emp-billing's `/empcloud-webhook` handler is the single source of truth
// for provisioning: it idempotently creates the client (looking up
// existing by `email = org-{empcloudOrgId}@empcloud.internal`), creates
// the plan (looking up by `name = {moduleSlug}-{planTier}`), creates the
// subscription (looking up by `metadata.empcloud_subscription_id`), and
// generates the first invoice. It now also returns `client_id` and
// `plan_id` so we can persist the EmpCloud-side mapping rows here.
// =============================================================================

import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { getDB } from "../../db/connection.js";

const BILLING_WEBHOOK_URL =
  (config.billing.moduleUrl ?? "") + "/api/v1/empcloud-webhook";

interface SubscriptionRow {
  id: number;
  organization_id: number;
  module_id: number;
  plan_tier: string;
  status: string;
  total_seats: number;
  billing_cycle: string;
  price_per_seat: number;
  currency: string | null;
  current_period_start?: Date | string | null;
  current_period_end?: Date | string | null;
}

interface ModuleRow {
  id: number;
  slug?: string | null;
  name?: string | null;
}

interface WebhookResponse {
  success?: boolean;
  acknowledged?: boolean;
  subscription_id?: string;
  client_id?: string;
  plan_id?: string;
  invoice_id?: string;
  invoice_number?: string;
  warning?: string;
}

function isConfigured(): boolean {
  if (!config.billing.apiKey) {
    logger.debug("emp-billing not configured (BILLING_API_KEY missing); skipping webhook");
    return false;
  }
  if (!config.billing.moduleUrl) {
    logger.debug("emp-billing not configured (BILLING_MODULE_URL missing); skipping webhook");
    return false;
  }
  return true;
}

function toIsoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

async function postWebhook(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<WebhookResponse | null> {
  if (!isConfigured()) return null;
  try {
    const response = await fetch(BILLING_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.billing.apiKey}`,
        "X-EmpCloud-Event": eventType,
      },
      body: JSON.stringify({ event_type: eventType, ...payload }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn(
        `emp-billing webhook ${eventType} failed: ${response.status} ${text.slice(0, 200)}`,
      );
      return null;
    }
    return (await response.json()) as WebhookResponse;
  } catch (err: any) {
    logger.warn(`emp-billing webhook ${eventType} unreachable: ${err?.message}`);
    return null;
  }
}

async function loadModule(moduleId: number): Promise<ModuleRow | null> {
  const db = getDB();
  const row = await db("modules").where({ id: moduleId }).first();
  return (row as ModuleRow) ?? null;
}

function buildSubscriptionPayload(
  sub: SubscriptionRow,
  mod: ModuleRow | null,
): Record<string, unknown> {
  return {
    organization_id: sub.organization_id,
    subscription_id: sub.id,
    module_slug: mod?.slug || `module-${sub.module_id}`,
    module_name: mod?.name || `Module #${sub.module_id}`,
    plan_tier: sub.plan_tier,
    total_seats: sub.total_seats,
    price_per_seat: sub.price_per_seat,
    currency: sub.currency || "INR",
    billing_cycle: sub.billing_cycle,
    period_start: toIsoDate(sub.current_period_start),
    period_end: toIsoDate(sub.current_period_end),
  };
}

async function persistMappings(
  sub: SubscriptionRow,
  response: WebhookResponse,
): Promise<void> {
  const db = getDB();
  const billingClientId = response.client_id;
  const billingSubscriptionId = response.subscription_id;
  const billingPlanId = response.plan_id ?? null;

  if (billingClientId) {
    const existingClient = await db("billing_client_mappings")
      .where({ organization_id: sub.organization_id })
      .first();
    if (!existingClient) {
      await db("billing_client_mappings").insert({
        organization_id: sub.organization_id,
        billing_client_id: billingClientId,
        created_at: new Date(),
      });
    }
  }

  if (billingSubscriptionId) {
    const existingSub = await db("billing_subscription_mappings")
      .where({ cloud_subscription_id: sub.id })
      .first();
    if (!existingSub) {
      await db("billing_subscription_mappings").insert({
        organization_id: sub.organization_id,
        cloud_subscription_id: sub.id,
        billing_subscription_id: billingSubscriptionId,
        billing_plan_id: billingPlanId,
        created_at: new Date(),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Notify emp-billing that a subscription was created (or reactivated). The
 * webhook handler is idempotent — calling this for a subscription that is
 * already provisioned in billing returns the existing ids without
 * generating a duplicate invoice. Safe to call from create flows AND the
 * backfill script.
 *
 * Best-effort by design: returns null (and logs) if billing is unreachable
 * or returns a non-2xx, so subscription creation in EmpCloud isn't blocked
 * by a billing outage.
 */
export async function emitSubscriptionCreated(
  cloudSubscriptionId: number,
): Promise<WebhookResponse | null> {
  const db = getDB();
  const sub = (await db("org_subscriptions")
    .where({ id: cloudSubscriptionId })
    .first()) as SubscriptionRow | undefined;
  if (!sub) {
    logger.warn(`emitSubscriptionCreated: cloud subscription ${cloudSubscriptionId} not found`);
    return null;
  }
  const mod = await loadModule(sub.module_id);
  const payload = buildSubscriptionPayload(sub, mod);
  const result = await postWebhook("subscription.created", payload);
  if (result) {
    await persistMappings(sub, result);
    logger.info(
      `emp-billing subscription.created emitted for cloud_sub=${sub.id} org=${sub.organization_id} module=${mod?.slug}: billing_sub=${result.subscription_id}`,
    );
  }
  return result;
}

export async function emitSubscriptionUpdated(
  cloudSubscriptionId: number,
): Promise<WebhookResponse | null> {
  const db = getDB();
  const sub = (await db("org_subscriptions")
    .where({ id: cloudSubscriptionId })
    .first()) as SubscriptionRow | undefined;
  if (!sub) {
    logger.warn(`emitSubscriptionUpdated: cloud subscription ${cloudSubscriptionId} not found`);
    return null;
  }
  const mod = await loadModule(sub.module_id);
  return postWebhook("subscription.updated", buildSubscriptionPayload(sub, mod));
}

export async function emitSubscriptionCancelled(
  cloudSubscriptionId: number,
): Promise<WebhookResponse | null> {
  const db = getDB();
  const sub = (await db("org_subscriptions")
    .where({ id: cloudSubscriptionId })
    .first()) as SubscriptionRow | undefined;
  if (!sub) return null;
  const mod = await loadModule(sub.module_id);
  return postWebhook("subscription.cancelled", buildSubscriptionPayload(sub, mod));
}

/**
 * Backfill helper — walks every existing org_subscriptions row and emits
 * `subscription.created` for any that aren't yet mapped in
 * `billing_subscription_mappings`. Idempotent at both layers (this helper
 * skips already-mapped rows; the webhook handler also skips duplicate
 * subscriptions via metadata lookup) so it can be re-run safely.
 *
 * Returns counts so the caller can log a summary.
 */
export async function backfillBillingFromExistingSubscriptions(): Promise<{
  scanned: number;
  attempted: number;
  succeeded: number;
  skipped: number;
  failed: number;
}> {
  const db = getDB();
  const subs = await db("org_subscriptions")
    .whereIn("status", ["active", "trial", "past_due", "suspended"])
    .orderBy("organization_id")
    .orderBy("id");
  let attempted = 0;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  for (const sub of subs as SubscriptionRow[]) {
    const existing = await db("billing_subscription_mappings")
      .where({ cloud_subscription_id: sub.id })
      .first();
    if (existing) {
      skipped++;
      continue;
    }
    attempted++;
    const result = await emitSubscriptionCreated(sub.id);
    if (result?.subscription_id) succeeded++;
    else failed++;
  }
  logger.info(
    `Backfill summary — scanned=${subs.length} attempted=${attempted} succeeded=${succeeded} skipped=${skipped} failed=${failed}`,
  );
  return { scanned: subs.length, attempted, succeeded, skipped, failed };
}
