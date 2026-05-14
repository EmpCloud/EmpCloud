// =============================================================================
// EMP CLOUD — Billing Proxy Service
// This is a THIN PROXY that calls EMP Billing APIs.
// NO billing logic should live here — only HTTP calls to EMP Billing.
//
// Also contains lightweight event notification helpers that push subscription
// lifecycle events (created/updated/cancelled) to EMP Billing's webhook
// endpoint. These are non-blocking and error-tolerant — if Billing is down,
// Cloud logs a warning but continues to operate normally.
// =============================================================================

import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { getDB } from "../../db/connection.js";
import { getOrgCurrency } from "../subscription/pricing.js";

const BILLING_BASE = config.billing.moduleUrl + "/api/v1";

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.billing.apiKey}`,
  };
}

function isBillingConfigured(): boolean {
  if (!config.billing.apiKey) {
    logger.debug("Billing API key not configured, skipping billing call");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// HTTP helper — wraps fetch with error handling
// Returns the full parsed JSON envelope { success, data, meta }
// ---------------------------------------------------------------------------

async function billingFetch<T = any>(
  method: string,
  path: string,
  body?: unknown
): Promise<T | null> {
  if (!isBillingConfigured()) return null;

  const url = `${BILLING_BASE}${path}`;
  try {
    const response = await fetch(url, {
      method,
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn(`Billing API error: ${method} ${path} → ${response.status} ${text}`);
      return null;
    }

    const json = await response.json() as any;
    return (json.data ?? json) as T;
  } catch (err: any) {
    logger.warn(`Billing API unreachable: ${method} ${path} → ${err.message}`);
    return null;
  }
}

// Like billingFetch but returns the full envelope { success, data, meta }
async function billingFetchRaw(
  method: string,
  path: string,
  body?: unknown
): Promise<any | null> {
  if (!isBillingConfigured()) return null;

  const url = `${BILLING_BASE}${path}`;
  try {
    const response = await fetch(url, {
      method,
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn(`Billing API error: ${method} ${path} → ${response.status} ${text}`);
      return null;
    }

    return await response.json();
  } catch (err: any) {
    logger.warn(`Billing API unreachable: ${method} ${path} → ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Client provisioning
// ---------------------------------------------------------------------------

// Short-lived in-memory backoff so a broken emp-billing doesn't get hit on
// every BillingPage load. Cleared on process restart and on first success.
const PROVISION_FAILURE_TTL_MS = 5 * 60 * 1000;
const provisionFailureCache = new Map<number, number>();

function isProvisionRecentlyFailed(orgId: number): boolean {
  const ts = provisionFailureCache.get(orgId);
  if (!ts) return false;
  if (Date.now() - ts > PROVISION_FAILURE_TTL_MS) {
    provisionFailureCache.delete(orgId);
    return false;
  }
  return true;
}

export async function autoProvisionClient(
  orgId: number,
  orgName: string,
  orgEmail: string
): Promise<string | null> {
  if (isProvisionRecentlyFailed(orgId)) return null;

  // Resolve the org's currency
  const currency = await getOrgCurrency(orgId);

  // Send `metadata.empcloud_org_id` so the billing side can look the
  // client up by a stable identifier instead of by email — this is what
  // converges the auto-provision path with the webhook handler's
  // findOrCreateClient on the same client row.
  const result = await billingFetch<{ client?: { id: string }; id?: string }>(
    "POST",
    "/clients/auto-provision",
    {
      name: orgName,
      email: orgEmail,
      currency,
      metadata: { empcloud_org_id: orgId },
    }
  );

  const clientId = result?.client?.id ?? result?.id;
  if (!clientId) {
    provisionFailureCache.set(orgId, Date.now());
    return null;
  }
  provisionFailureCache.delete(orgId);

  const db = getDB();
  // Upsert the mapping
  const existing = await db("billing_client_mappings")
    .where({ organization_id: orgId })
    .first();

  if (!existing) {
    await db("billing_client_mappings").insert({
      organization_id: orgId,
      billing_client_id: clientId,
      created_at: new Date(),
    });
  }

  logger.info(`Billing client provisioned for org ${orgId}: ${clientId}`);
  return clientId;
}

export async function getOrCreateBillingClientId(orgId: number): Promise<string | null> {
  const db = getDB();

  // Check existing mapping
  const mapping = await db("billing_client_mappings")
    .where({ organization_id: orgId })
    .first();

  if (mapping) return mapping.billing_client_id;

  // Need to auto-provision — fetch org details
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) {
    logger.warn(`Cannot provision billing client: org ${orgId} not found`);
    return null;
  }

  // Use the org owner's REAL email — this is what SendGrid sends invoices
  // to. The previous synthetic `org-{N}@empcloud.internal` address made
  // the two provisioning paths (BillingPage + webhook) converge on the
  // same row by lookup-key, but invoices then went to a domain nobody
  // owns. The webhook handler in emp-billing now converges via
  // `customFields.empcloud_org_id` instead, so we're free to use the
  // real address here without re-creating duplicate clients.
  const owner = await db("users")
    .where({ organization_id: orgId, role: "owner" })
    .first();
  const email = owner?.email || org.contact_email || `org-${orgId}@empcloud.internal`;

  return autoProvisionClient(orgId, org.name, email);
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function createBillingPlan(
  moduleSlug: string,
  moduleName: string,
  priceTier: string,
  pricePerSeat: number,
  billingCycle: string,
  currency: string = "INR"
): Promise<string | null> {
  const result = await billingFetch<{ id: string }>("POST", "/subscriptions/plans", {
    name: `${moduleName} - ${priceTier}`,
    price: pricePerSeat,
    billingInterval: billingCycle,
    currency,
  });

  return result?.id ?? null;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export async function createBillingSubscription(
  orgId: number,
  planId: string,
  quantity: number
): Promise<string | null> {
  const clientId = await getOrCreateBillingClientId(orgId);
  if (!clientId) return null;

  const result = await billingFetch<{ id: string }>("POST", "/subscriptions", {
    clientId,
    planId,
    quantity,
    autoRenew: true,
  });

  return result?.id ?? null;
}

export async function cancelBillingSubscription(
  billingSubscriptionId: string
): Promise<boolean> {
  const result = await billingFetch(
    "POST",
    `/subscriptions/${billingSubscriptionId}/cancel`
  );
  return result !== null;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function createInvoice(
  orgId: number,
  items: Array<{ description: string; quantity: number; unitPrice: number }>
): Promise<string | null> {
  const clientId = await getOrCreateBillingClientId(orgId);
  if (!clientId) return null;

  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 30);

  // Map Cloud's item format to Billing's expected format:
  // Billing expects: { name, quantity, rate } (rate in smallest currency unit)
  const billingItems = items.map((item) => ({
    name: item.description,
    description: item.description,
    quantity: item.quantity,
    rate: item.unitPrice,
  }));

  const result = await billingFetch<{ id: string }>("POST", "/invoices", {
    clientId,
    items: billingItems,
    issueDate: now.toISOString().split("T")[0],
    dueDate: dueDate.toISOString().split("T")[0],
    autoSend: true,
  });

  return result?.id ?? null;
}

export async function getInvoices(
  orgId: number,
  params?: { page?: number; perPage?: number }
): Promise<any> {
  // Tenant scoping: emp-billing's auth middleware maps the EmpCloud platform
  // API key to its "first active org" (a single-tenant assumption baked into
  // the webhook handler -- all EmpCloud customers' clients live under one
  // billing org). To return THIS empcloud org's invoices specifically, we
  // resolve the per-org billing client id from `billing_client_mappings`
  // (populated by the empcloud-webhook-emitter when a subscription is
  // provisioned) and pass it as `clientId` so the billing query filters
  // down to the right tenant. Without this, /invoices would return every
  // EmpCloud org's invoices that share the billing org.
  const clientId = await getMappedBillingClientId(orgId);
  const query = new URLSearchParams();
  if (clientId) query.set("clientId", clientId);
  if (params?.page) query.set("page", String(params.page));
  if (params?.perPage) query.set("limit", String(params.perPage));

  const qs = query.toString();
  const result = await billingFetchRaw("GET", `/invoices${qs ? `?${qs}` : ""}`);
  if (!result) return { invoices: [], total: 0 };

  // Billing returns { success, data: [...], meta: { page, limit, total, totalPages } }
  const invoices = Array.isArray(result.data) ? result.data : [];
  const meta = result.meta ?? {};

  return {
    invoices,
    total: meta.total ?? invoices.length,
    page: meta.page ?? 1,
    totalPages: meta.totalPages ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function getPayments(
  orgId: number,
  params?: { page?: number; perPage?: number }
): Promise<any> {
  // Tenant scoping: same rationale as getInvoices(). The historical comment
  // here ("clientId filter caused empty results") referred to the dead
  // /clients/auto-provision path which created duplicate client records;
  // the new empcloud-webhook-emitter writes the SAME client id that owns
  // the payments into billing_client_mappings, so passing clientId now
  // narrows correctly to this org instead of leaking another tenant's data.
  const clientId = await getMappedBillingClientId(orgId);
  const query = new URLSearchParams();
  if (clientId) query.set("clientId", clientId);
  if (params?.page) query.set("page", String(params.page));
  if (params?.perPage) query.set("limit", String(params.perPage));

  const qs = query.toString();
  const result = await billingFetchRaw("GET", `/payments${qs ? `?${qs}` : ""}`);
  if (!result) return { payments: [], total: 0 };

  // Billing returns { success, data: [...], meta: { page, limit, total, totalPages } }
  const payments = Array.isArray(result.data) ? result.data : [];
  const meta = result.meta ?? {};

  return {
    payments,
    total: meta.total ?? payments.length,
    page: meta.page ?? 1,
    totalPages: meta.totalPages ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export async function getBillingSummary(orgId: number): Promise<object> {
  const [invoiceResult, paymentResult] = await Promise.all([
    getInvoices(orgId, { page: 1, perPage: 5 }),
    getPayments(orgId, { page: 1, perPage: 5 }),
  ]);

  const invoiceList = Array.isArray(invoiceResult?.invoices)
    ? invoiceResult.invoices
    : [];

  const outstandingAmount = invoiceList
    .filter((inv: any) => inv.status === "sent" || inv.status === "overdue" || inv.status === "viewed")
    .reduce((sum: number, inv: any) => sum + (Number(inv.amountDue) || Number(inv.total) || 0), 0);

  const currency = await getOrgCurrency(orgId);

  return {
    recent_invoices: invoiceList,
    recent_payments: Array.isArray(paymentResult?.payments)
      ? paymentResult.payments
      : [],
    outstanding_amount: outstandingAmount,
    currency,
  };
}

// ---------------------------------------------------------------------------
// Online Payment — Create gateway checkout session
// ---------------------------------------------------------------------------

export async function createPaymentOrder(
  invoiceId: string,
  gateway: string = "stripe",
  returnUrl?: string,
): Promise<{ checkoutUrl?: string; gatewayOrderId?: string; metadata?: Record<string, unknown> } | null> {
  const result = await billingFetch<{
    checkoutUrl?: string;
    gatewayOrderId?: string;
    clientSecret?: string;
    metadata?: Record<string, unknown>;
  }>("POST", "/payments/online/create-order", {
    invoiceId,
    gateway,
    returnUrl,
  });

  return result;
}

/**
 * Verify a gateway payment after the client-side checkout (Razorpay
 * inline / Stripe redirect) returns. Used by /api/v1/billing/verify-payment
 * so the EmpCloud UI can confirm a Razorpay payment without needing to
 * call emp-billing directly with its API key.
 */
export async function verifyPayment(
  invoiceId: string,
  gateway: string,
  payload: { gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature?: string },
): Promise<{ success: boolean } | null> {
  const result = await billingFetch<{ success: boolean }>(
    "POST",
    "/payments/online/verify",
    {
      invoiceId,
      gateway,
      ...payload,
    },
  );
  return result;
}

export async function listPaymentGateways(orgId?: number): Promise<Array<{ name: string; displayName: string }>> {
  const result = await billingFetch<Array<{ name: string; displayName: string }>>(
    "GET",
    "/payments/online/gateways"
  );
  const allGateways = result ?? [];

  // If no org context, return all gateways
  if (!orgId) return allGateways;

  // Filter gateways based on org currency
  const currency = await getOrgCurrency(orgId);

  // Razorpay only supports INR; Stripe is for international (USD/GBP/EUR)
  const gatewayFilter: Record<string, string[]> = {
    INR: ["razorpay", "paypal"],
    USD: ["stripe", "paypal"],
    GBP: ["stripe", "paypal"],
    EUR: ["stripe", "paypal"],
  };

  const allowed = gatewayFilter[currency] ?? ["stripe", "paypal"];
  const filtered = allGateways.filter((g) =>
    allowed.includes(g.name.toLowerCase())
  );

  // Return filtered list if any match, otherwise return all (graceful fallback)
  return filtered.length > 0 ? filtered : allGateways;
}

// ---------------------------------------------------------------------------
// Subscription mapping helpers
// ---------------------------------------------------------------------------

export async function saveBillingSubscriptionMapping(params: {
  orgId: number;
  cloudSubscriptionId: number;
  billingSubscriptionId: string;
  billingPlanId?: string;
}): Promise<void> {
  const db = getDB();
  const existing = await db("billing_subscription_mappings")
    .where({ cloud_subscription_id: params.cloudSubscriptionId })
    .first();

  if (!existing) {
    await db("billing_subscription_mappings").insert({
      organization_id: params.orgId,
      cloud_subscription_id: params.cloudSubscriptionId,
      billing_subscription_id: params.billingSubscriptionId,
      billing_plan_id: params.billingPlanId ?? null,
      created_at: new Date(),
    });
  }
}

export async function getBillingSubscriptionId(
  cloudSubscriptionId: number
): Promise<string | null> {
  const db = getDB();
  const mapping = await db("billing_subscription_mappings")
    .where({ cloud_subscription_id: cloudSubscriptionId })
    .first();
  return mapping?.billing_subscription_id ?? null;
}

// Short-lived cache so the three reads on the Billing summary page
// (invoices + payments + summary) don't each hit billing's /clients/:id.
const clientExistenceCache = new Map<string, { exists: boolean; ts: number }>();
const CLIENT_EXISTENCE_TTL_MS = 30_000;

async function isBillingClientStillAlive(clientId: string): Promise<boolean> {
  if (!isBillingConfigured()) {
    // Can't verify -- assume alive so we don't churn the mapping when
    // billing is temporarily down.
    return true;
  }
  const cached = clientExistenceCache.get(clientId);
  const now = Date.now();
  if (cached && now - cached.ts < CLIENT_EXISTENCE_TTL_MS) {
    return cached.exists;
  }
  try {
    const url = `${BILLING_BASE}/clients/${clientId}`;
    const response = await fetch(url, { headers: getHeaders() });
    if (response.status === 404) {
      clientExistenceCache.set(clientId, { exists: false, ts: now });
      return false;
    }
    // Any other status (200, 5xx, 401) -- treat as "still alive" so a
    // transient billing failure can't cause us to re-provision and orphan
    // historical invoices.
    clientExistenceCache.set(clientId, { exists: true, ts: now });
    return true;
  } catch {
    return true;
  }
}

/**
 * Resolve the billing-side `clients.id` UUID for an EmpCloud organization.
 * Used by the proxy reads (getInvoices / getPayments) to scope queries to
 * just the calling tenant.
 *
 * Self-heals stale mappings: if the cached client_id no longer exists in
 * billing (because billing was reseeded, the row was manually deleted, or
 * a backup restore wiped it), we auto-re-provision and update the mapping
 * so the next page load isn't broken either. Returns null only when the
 * org has truly never been provisioned and re-provisioning also failed.
 */
export async function getMappedBillingClientId(
  orgId: number
): Promise<string | null> {
  const db = getDB();
  const mapping = await db("billing_client_mappings")
    .where({ organization_id: orgId })
    .first();

  if (!mapping?.billing_client_id) {
    // Org has never been provisioned in billing. Try to do it now so
    // existing organizations that pre-date the auto-provision path still
    // self-heal on first billing page load.
    return getOrCreateBillingClientId(orgId);
  }

  const cachedId: string = mapping.billing_client_id;
  if (await isBillingClientStillAlive(cachedId)) {
    return cachedId;
  }

  // Stale: billing no longer has this client. Re-provision and update the
  // mapping in place so HR isn't stuck staring at "No invoices yet" while
  // the mapping silently points at a wiped UUID.
  logger.warn(
    `Stale billing client mapping for org ${orgId}: ${cachedId} not found in billing. Re-provisioning.`,
  );
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return cachedId;
  const owner = await db("users")
    .where({ organization_id: orgId, role: "owner" })
    .first();
  const email = owner?.email || org.contact_email || "billing@empcloud.com";
  const newId = await autoProvisionClient(orgId, org.name, email);
  if (newId && newId !== cachedId) {
    await db("billing_client_mappings")
      .where({ organization_id: orgId })
      .update({ billing_client_id: newId });
    clientExistenceCache.delete(cachedId);
    return newId;
  }
  return cachedId;
}

// ---------------------------------------------------------------------------
// Invoice PDF proxy helper
// ---------------------------------------------------------------------------

export async function getInvoicePdfStream(
  invoiceId: string
): Promise<Response | null> {
  if (!isBillingConfigured()) return null;

  const url = `${BILLING_BASE}/invoices/${invoiceId}/pdf`;
  try {
    const response = await fetch(url, { headers: getHeaders() });
    if (!response.ok) {
      logger.warn(`Billing PDF fetch failed: ${response.status}`);
      return null;
    }
    return response;
  } catch (err: any) {
    logger.warn(`Billing PDF unreachable: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Subscription event notifications (merged from billing.service.ts)
// Push lifecycle events to EMP Billing's webhook endpoint.
// ---------------------------------------------------------------------------

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

/** Helper to load a subscription with its module info and send a billing event. */
async function sendSubscriptionEvent(subscriptionId: number, eventType: string): Promise<void> {
  const db = getDB();
  const sub = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.id": subscriptionId })
    .select("s.*", "m.slug as module_slug", "m.name as module_name")
    .first();

  if (!sub) return;

  await notifyBilling({
    event_type: eventType,
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
 * Send subscription created event to billing.
 */
export async function onSubscriptionCreated(subscriptionId: number): Promise<void> {
  await sendSubscriptionEvent(subscriptionId, "subscription.created");
}

/**
 * Send subscription updated event to billing (seat change, plan change).
 */
export async function onSubscriptionUpdated(subscriptionId: number): Promise<void> {
  await sendSubscriptionEvent(subscriptionId, "subscription.updated");
}

/**
 * Send subscription cancelled event to billing.
 */
export async function onSubscriptionCancelled(subscriptionId: number): Promise<void> {
  await sendSubscriptionEvent(subscriptionId, "subscription.cancelled");
}

// ---------------------------------------------------------------------------
// Local billing summary (merged from billing.service.ts)
// Aggregates subscription costs from Cloud's own DB — does NOT call Billing API.
// ---------------------------------------------------------------------------

/**
 * Get a local cost-aggregation summary for an organization's subscriptions.
 * This is separate from getBillingSummary() which fetches data from EMP Billing API.
 */
export async function getLocalBillingSummary(orgId: number) {
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
