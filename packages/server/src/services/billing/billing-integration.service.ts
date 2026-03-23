// =============================================================================
// EMP CLOUD — Billing Integration Service
// Calls EMP Billing APIs to manage clients, subscriptions, invoices, payments.
// All calls are non-blocking and error-tolerant — if Billing is down, Cloud
// logs a warning but continues to operate normally.
// =============================================================================

import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { getDB } from "../../db/connection.js";

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

// ---------------------------------------------------------------------------
// Client provisioning
// ---------------------------------------------------------------------------

export async function autoProvisionClient(
  orgId: number,
  orgName: string,
  orgEmail: string
): Promise<string | null> {
  const result = await billingFetch<{ id: string }>("POST", "/clients/auto-provision", {
    name: orgName,
    email: orgEmail,
    currency: "INR",
  });

  if (!result?.id) return null;

  const db = getDB();
  // Upsert the mapping
  const existing = await db("billing_client_mappings")
    .where({ organization_id: orgId })
    .first();

  if (!existing) {
    await db("billing_client_mappings").insert({
      organization_id: orgId,
      billing_client_id: result.id,
      created_at: new Date(),
    });
  }

  logger.info(`Billing client provisioned for org ${orgId}: ${result.id}`);
  return result.id;
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

  // Get the org owner's email
  const owner = await db("users")
    .where({ organization_id: orgId, role: "owner" })
    .first();
  const email = owner?.email || org.contact_email || "billing@empcloud.com";

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
  billingCycle: string
): Promise<string | null> {
  const result = await billingFetch<{ id: string }>("POST", "/subscriptions/plans", {
    name: `${moduleName} - ${priceTier}`,
    price: pricePerSeat,
    billingInterval: billingCycle,
    currency: "INR",
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

  const result = await billingFetch<{ id: string }>("POST", "/invoices", {
    clientId,
    items,
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
  const clientId = await getOrCreateBillingClientId(orgId);
  if (!clientId) return { invoices: [], total: 0 };

  const query = new URLSearchParams({ clientId });
  if (params?.page) query.set("page", String(params.page));
  if (params?.perPage) query.set("perPage", String(params.perPage));

  const result = await billingFetch("GET", `/invoices?${query.toString()}`);
  return result ?? { invoices: [], total: 0 };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function getPayments(
  orgId: number,
  params?: { page?: number; perPage?: number }
): Promise<any> {
  const clientId = await getOrCreateBillingClientId(orgId);
  if (!clientId) return { payments: [], total: 0 };

  const query = new URLSearchParams({ clientId });
  if (params?.page) query.set("page", String(params.page));
  if (params?.perPage) query.set("perPage", String(params.perPage));

  const result = await billingFetch("GET", `/payments?${query.toString()}`);
  return result ?? { payments: [], total: 0 };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export async function getBillingSummary(orgId: number): Promise<object> {
  const [invoices, payments] = await Promise.all([
    getInvoices(orgId, { page: 1, perPage: 5 }),
    getPayments(orgId, { page: 1, perPage: 5 }),
  ]);

  // Calculate outstanding from invoices
  const invoiceList = Array.isArray(invoices?.invoices)
    ? invoices.invoices
    : Array.isArray(invoices) ? invoices : [];

  const outstandingAmount = invoiceList
    .filter((inv: any) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum: number, inv: any) => sum + (Number(inv.totalAmount) || 0), 0);

  return {
    recent_invoices: invoiceList,
    recent_payments: Array.isArray(payments?.payments)
      ? payments.payments
      : Array.isArray(payments) ? payments : [],
    outstanding_amount: outstandingAmount,
    currency: "INR",
  };
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
