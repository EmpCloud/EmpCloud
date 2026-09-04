// =============================================================================
// EMP CLOUD — Admin Billing Service
//
// Super-admin-only operations that proxy to emp-billing AND enrich with
// EmpCloud-side org context (so the admin sees "Globussoft" instead of
// "billing client 60df0...").
//
//   - listInvoices()       — every invoice across every org, with filters
//   - markInvoicePaid()    — record a full payment against the invoice
//   - sendInvoiceEmail()   — kick emp-billing's email sender
//   - getInvoicePdf()      — proxy the PDF stream
//   - subscribeOnBehalf()  — create org_subscriptions row for ANY org; the
//                            existing webhook emitter then fires
//                            subscription.created to emp-billing, which
//                            provisions client+plan+sub+invoice end-to-end
// =============================================================================

import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { billingFetchRaw } from "../billing/billing-integration.service.js";
import { createSubscription } from "../subscription/subscription.service.js";
import type { OrganizationPaymentSummary } from "./organization-analytics.js";

interface NormalizedInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  issue_date: string | null;
  due_date: string | null;
  client_id: string | null;
  org_id: string | null;
  notes: string;
}

function normalizeInvoice(inv: any): NormalizedInvoice {
  return {
    id: String(inv.id),
    invoice_number: inv.invoice_number ?? inv.invoiceNumber ?? "",
    status: inv.status ?? "draft",
    total: Number(inv.total ?? 0),
    amount_paid: Number(inv.amount_paid ?? inv.amountPaid ?? 0),
    amount_due: Number(inv.amount_due ?? inv.amountDue ?? 0),
    currency: inv.currency ?? "INR",
    issue_date: inv.issue_date ?? inv.issueDate ?? null,
    due_date: inv.due_date ?? inv.dueDate ?? null,
    client_id: inv.client_id ?? inv.clientId ?? null,
    org_id: inv.org_id ?? inv.orgId ?? null,
    notes: inv.notes ?? "",
  };
}

function readEmpCloudOrganizationId(client: any): number | null {
  let customFields = client?.customFields ?? client?.custom_fields;
  if (typeof customFields === "string") {
    try {
      customFields = JSON.parse(customFields);
    } catch {
      return null;
    }
  }

  const organizationId = Number(customFields?.empcloud_org_id);
  return Number.isInteger(organizationId) && organizationId > 0
    ? organizationId
    : null;
}

// ---------------------------------------------------------------------------
// List invoices across ALL orgs
// ---------------------------------------------------------------------------

export async function listInvoices(params?: {
  status?: string;
  client_id?: string;
  organization_id?: number;
  q?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Number(params?.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(params?.limit) || 25));

  // Build the emp-billing query. No clientId filter → returns everything
  // in emp-billing's billing org (which IS the EmpCloud-system org by
  // design -- every EmpCloud customer's invoices live under it).
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.client_id) qs.set("clientId", params.client_id);
  qs.set("page", String(page));
  qs.set("limit", String(limit));
  if (params?.q) qs.set("search", params.q);

  const result = await billingFetchRaw("GET", `/invoices?${qs.toString()}`);
  if (!result) {
    return { data: [], total: 0, page, limit, totalPages: 1 };
  }

  // emp-billing returns camelCase (clientId, invoiceNumber, amountDue,
  // issueDate, dueDate). EmpCloud's UI + the rest of this codebase use
  // snake_case. Normalise here so the rest of the file doesn't have to
  // know about the boundary. Accept either form on read (defensive
  // against schema drift between emp-billing versions).
  const rawInvoices = Array.isArray(result.data) ? result.data : [];
  const invoices = rawInvoices.map(normalizeInvoice);

  // Enrich each invoice with the EmpCloud org name/email via the
  // billing_client_mappings bridge. emp-billing's clientId → EmpCloud's
  // organization_id → name. If no mapping exists (legacy / orphan client)
  // the org_id stays null and the UI shows a truncated client id.
  const db = getDB();
  const clientIds = Array.from(
    new Set(invoices.map((i: any) => i.client_id).filter(Boolean)),
  ) as string[];
  const mappings = clientIds.length
    ? await db("billing_client_mappings as bcm")
        .leftJoin("organizations as o", "bcm.organization_id", "o.id")
        .whereIn("bcm.billing_client_id", clientIds)
        .select(
          "bcm.billing_client_id",
          "bcm.organization_id",
          "o.name as organization_name",
          "o.email as organization_email",
        )
    : [];
  const byClient: Record<string, any> = {};
  for (const m of mappings) byClient[String(m.billing_client_id)] = m;

  // A Billing organization can contain legacy duplicate clients for the same
  // EmpCloud organization. Resolve unmapped invoice clients through the stable
  // organization id stored in Billing client metadata, without mutating data.
  const unmappedClientIds = clientIds.filter((clientId) => !byClient[clientId]);
  const metadataMappings = await Promise.all(
    unmappedClientIds.map(async (clientId) => {
      const result = await billingFetchRaw(
        "GET",
        `/clients/${encodeURIComponent(clientId)}`,
      );
      const organizationId = readEmpCloudOrganizationId(result?.data ?? result);
      return organizationId ? { clientId, organizationId } : null;
    }),
  );
  const fallbackOrganizationIds = Array.from(
    new Set(
      metadataMappings
        .map((mapping) => mapping?.organizationId)
        .filter((id): id is number => Boolean(id)),
    ),
  );
  const fallbackOrganizations = fallbackOrganizationIds.length
    ? await db("organizations")
        .whereIn("id", fallbackOrganizationIds)
        .select("id", "name", "email")
    : [];
  const fallbackOrganizationById = new Map(
    fallbackOrganizations.map((organization: any) => [Number(organization.id), organization]),
  );
  for (const mapping of metadataMappings) {
    if (!mapping) continue;
    const organization = fallbackOrganizationById.get(mapping.organizationId);
    if (!organization) continue;
    byClient[mapping.clientId] = {
      billing_client_id: mapping.clientId,
      organization_id: mapping.organizationId,
      organization_name: organization.name,
      organization_email: organization.email,
    };
  }

  const organizationIds = Array.from(
    new Set(
      Object.values(byClient)
        .map((mapping: any) => Number(mapping.organization_id))
        .filter(Boolean),
    ),
  );
  const subscriptionRows = organizationIds.length
    ? await db("org_subscriptions as os")
        .leftJoin("modules as m", "os.module_id", "m.id")
        .whereIn("os.organization_id", organizationIds)
        .orderBy("m.name", "asc")
        .select(
          "os.id",
          "os.organization_id",
          "os.plan_tier",
          "os.status",
          "os.internal_notes",
          "m.name as module_name",
        )
    : [];
  const plansByOrganization = new Map<number, Array<{
    id: number;
    plan_tier: string;
    status: string;
    module_name: string;
    internal_notes: string | null;
  }>>();
  for (const subscription of subscriptionRows) {
    const organizationId = Number(subscription.organization_id);
    const plans = plansByOrganization.get(organizationId) ?? [];
    plans.push({
      id: Number(subscription.id),
      plan_tier: String(subscription.plan_tier),
      status: String(subscription.status),
      module_name: String(subscription.module_name ?? "Module"),
      internal_notes: subscription.internal_notes == null
        ? null
        : String(subscription.internal_notes),
    });
    plansByOrganization.set(organizationId, plans);
  }

  let enriched = invoices.map((inv: any) => {
    const m = inv.client_id ? byClient[inv.client_id] || {} : {};
    const organizationId = m.organization_id ? Number(m.organization_id) : null;
    return {
      ...inv,
      empcloud_organization_id: organizationId,
      empcloud_organization_name: m.organization_name ?? null,
      empcloud_organization_email: m.organization_email ?? null,
      empcloud_plans: organizationId ? plansByOrganization.get(organizationId) ?? [] : [],
    };
  });
  if (params?.organization_id) {
    enriched = enriched.filter(
      (i: any) => Number(i.empcloud_organization_id) === Number(params.organization_id),
    );
  }

  const meta = result.meta ?? {};
  return {
    data: enriched,
    total: meta.total ?? enriched.length,
    page: meta.page ?? page,
    limit: meta.limit ?? limit,
    totalPages: meta.totalPages ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Organization list payment summaries
// ---------------------------------------------------------------------------

/**
 * Load one compact payment summary for each organization displayed on the
 * Super Admin organization page. Billing is queried by mapped client id, so
 * no invoice can leak from another customer. A failed Billing request is
 * represented as "unavailable" rather than the much more damaging "unpaid".
 */
export async function getOrganizationPaymentSummaries(
  organizationIds: number[],
): Promise<Map<number, OrganizationPaymentSummary>> {
  const orgIds = Array.from(new Set(organizationIds.map(Number).filter((id) => id > 0)));
  const summaries = new Map<number, OrganizationPaymentSummary>();

  for (const orgId of orgIds) {
    summaries.set(orgId, {
      status: "not_configured",
      outstanding_by_currency: [],
      overdue_invoice_count: 0,
      unpaid_invoice_count: 0,
      latest_invoice: null,
    });
  }
  if (orgIds.length === 0) return summaries;

  const mappings = await getDB()("billing_client_mappings")
    .whereIn("organization_id", orgIds)
    .select("organization_id", "billing_client_id");

  const orgIdByClientId = new Map<string, number>();
  for (const mapping of mappings) {
    const orgId = Number(mapping.organization_id);
    const clientId = String(mapping.billing_client_id);
    orgIdByClientId.set(clientId, orgId);
    summaries.set(orgId, {
      status: "unavailable",
      outstanding_by_currency: [],
      overdue_invoice_count: 0,
      unpaid_invoice_count: 0,
      latest_invoice: null,
    });
  }

  const clientIds = Array.from(orgIdByClientId.keys());
  const batches: string[][] = [];
  for (let index = 0; index < clientIds.length; index += 100) {
    batches.push(clientIds.slice(index, index + 100));
  }

  const responses = await Promise.all(
    batches.map((batch) =>
      billingFetchRaw("POST", "/clients/payment-summaries", { clientIds: batch }, 5_000),
    ),
  );
  const validStatuses = new Set(["paid", "unpaid", "overdue", "no_invoice"]);

  for (const response of responses) {
    if (!response || !Array.isArray(response.data)) continue;
    for (const item of response.data) {
      const orgId = orgIdByClientId.get(String(item.clientId));
      if (!orgId) continue;
      summaries.set(orgId, {
        status: validStatuses.has(item.status) ? item.status : "unavailable",
        outstanding_by_currency: Array.isArray(item.outstandingByCurrency)
          ? item.outstandingByCurrency.map((amount: any) => ({
              currency: String(amount.currency || "INR").toUpperCase(),
              amount: Number(amount.amount) || 0,
            }))
          : [],
        overdue_invoice_count: Number(item.overdueInvoiceCount) || 0,
        unpaid_invoice_count: Number(item.unpaidInvoiceCount) || 0,
        latest_invoice: item.latestInvoice
          ? {
              id: String(item.latestInvoice.id),
              invoice_number: item.latestInvoice.invoiceNumber ?? "",
              status: item.latestInvoice.status ?? "draft",
              amount_due: Number(item.latestInvoice.amountDue) || 0,
              total: Number(item.latestInvoice.total) || 0,
              currency: item.latestInvoice.currency ?? "INR",
              issue_date: item.latestInvoice.issueDate ?? null,
              due_date: item.latestInvoice.dueDate ?? null,
            }
          : null,
      });
    }
  }

  return summaries;
}

// ---------------------------------------------------------------------------
// Mark invoice as paid
// ---------------------------------------------------------------------------

export async function markInvoicePaid(
  invoiceId: string,
  params: {
    payment_method?: string;
    reference?: string;
    notes?: string;
  },
  recordedByUserId: number,
) {
  if (!invoiceId) throw new ValidationError("invoice id required");

  // Fetch the invoice to know the amount due. emp-billing returns
  // camelCase; accept either shape on read.
  const inv = await billingFetchRaw("GET", `/invoices/${invoiceId}`);
  if (!inv || !inv.data) throw new NotFoundError("Invoice");
  const invoice = inv.data;
  const amountDue = Number(
    invoice.amount_due ?? invoice.amountDue ?? invoice.total ?? 0,
  );
  const invoiceNumber = invoice.invoice_number ?? invoice.invoiceNumber ?? invoiceId;
  const clientId = invoice.client_id ?? invoice.clientId ?? null;
  if (amountDue <= 0) {
    throw new ValidationError(
      `Invoice ${invoiceNumber} has nothing due (already paid or written off).`,
    );
  }

  // Record a full payment via emp-billing. This:
  //   - inserts payments row
  //   - inserts payment_allocations row linking to the invoice
  //   - updates invoice.amount_paid / amount_due
  //   - flips invoice.status to 'paid' when amount_due reaches 0
  //   - fires the payment.received event in emp-billing
  //
  // emp-billing's CreatePaymentSchema requires:
  //   - clientId (uuid), invoiceId (uuid optional but always sent here)
  //   - date (Date / parseable string) — NOT `paymentDate`
  //   - amount (positive int, in smallest currency unit)
  //   - method (PaymentMethod enum: cash | bank_transfer | cheque | upi |
  //     card | gateway_stripe | gateway_razorpay | gateway_paypal | other)
  // Map the EmpCloud admin's free-text "method" into the closest enum;
  // anything we don't recognise lands on "other" rather than failing the
  // payload validation.
  const METHOD_MAP: Record<string, string> = {
    manual: "cash",
    cash: "cash",
    bank: "bank_transfer",
    bank_transfer: "bank_transfer",
    cheque: "cheque",
    check: "cheque",
    upi: "upi",
    card: "card",
    stripe: "gateway_stripe",
    razorpay: "gateway_razorpay",
    paypal: "gateway_paypal",
    other: "other",
  };
  const rawMethod = String(params.payment_method || "manual").toLowerCase();
  const method = METHOD_MAP[rawMethod] || "other";

  const payload = {
    invoiceId,
    amount: amountDue,
    method,
    reference:
      params.reference || `marked-paid-by-super-admin-${recordedByUserId}`,
    notes:
      params.notes ||
      `Marked paid from EmpCloud Super Admin by user ${recordedByUserId}`,
    date: new Date().toISOString().slice(0, 10),
    clientId,
  };

  // Direct fetch (not via billingFetchRaw which swallows errors with a
  // generic null) so we can echo emp-billing's actual validation message
  // back to the EmpCloud admin instead of "did not accept the payment".
  const billingBase = process.env.BILLING_MODULE_URL || "";
  const apiKey = process.env.BILLING_API_KEY || "";
  if (!billingBase || !apiKey) {
    throw new ValidationError(
      "emp-billing is not configured (BILLING_MODULE_URL or BILLING_API_KEY missing).",
    );
  }
  let billingResponse: Response;
  try {
    billingResponse = await fetch(`${billingBase}/api/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    throw new ValidationError(
      `emp-billing unreachable at ${billingBase}: ${err?.message || err}`,
    );
  }
  if (!billingResponse.ok) {
    const text = await billingResponse.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      // zod errors come back as { error: { message, issues: [...] } }
      detail =
        parsed?.error?.message ||
        parsed?.message ||
        (Array.isArray(parsed?.error?.issues)
          ? parsed.error.issues
              .map((i: any) => `${i.path?.join(".") || "?"}: ${i.message}`)
              .join("; ")
          : text);
    } catch {
      /* not JSON — leave detail as the raw body */
    }
    logger.warn(
      `markInvoicePaid: emp-billing ${billingResponse.status} ${detail.slice(0, 300)}`,
    );
    throw new ValidationError(
      `emp-billing rejected the payment (HTTP ${billingResponse.status}): ${detail.slice(0, 300)}`,
    );
  }
  const result = (await billingResponse.json()) as any;

  logger.info(
    `Marked invoice ${invoiceNumber} as paid by user ${recordedByUserId} (method=${method})`,
  );
  return result.data ?? result;
}

// ---------------------------------------------------------------------------
// Send invoice email
// ---------------------------------------------------------------------------

export async function sendInvoiceEmail(invoiceId: string, sentByUserId: number) {
  if (!invoiceId) throw new ValidationError("invoice id required");
  const result = await billingFetchRaw("POST", `/invoices/${invoiceId}/send`, {
    sent_by: sentByUserId,
  });
  if (!result) {
    throw new ValidationError("emp-billing did not accept the send request.");
  }
  logger.info(`Sent invoice ${invoiceId} via emp-billing (requested by user ${sentByUserId})`);
  return result.data ?? result;
}

// ---------------------------------------------------------------------------
// Subscribe on behalf of an org
// ---------------------------------------------------------------------------

export async function subscribeOnBehalf(
  data: {
    organization_id: number;
    module_id: number;
    plan_tier: string;
    total_seats: number;
    billing_cycle?: string;
    trial_days?: number;
  },
  actingUserId: number,
) {
  // Validate the org actually exists. The sentinel id=0 is reserved.
  const db = getDB();
  const org = await db("organizations").where({ id: data.organization_id }).first();
  if (!org || data.organization_id <= 0) {
    throw new NotFoundError("Organization");
  }

  // Use the existing per-org createSubscription so all the normal flow
  // runs: effective price resolution, audit logging, AND the webhook to
  // emp-billing that provisions client + plan + subscription + first
  // invoice. The webhook fires automatically; the new invoice will
  // appear in our admin invoice list within a second of this call
  // returning.
  const sub = await createSubscription(data.organization_id, {
    module_id: data.module_id,
    plan_tier: data.plan_tier,
    total_seats: data.total_seats,
    billing_cycle: data.billing_cycle || "monthly",
    trial_days: data.trial_days ?? 0,
  } as any);

  logger.info(
    `Super admin user ${actingUserId} subscribed org ${data.organization_id} to module ${data.module_id} (${data.plan_tier})`,
  );

  return {
    subscription: sub,
    note: "emp-billing webhook fired; invoice + client provisioned asynchronously and will appear in the admin invoice list shortly.",
  };
}

// ---------------------------------------------------------------------------
// Get invoice PDF (pass-through stream metadata so the route can pipe)
// ---------------------------------------------------------------------------

export async function getInvoicePdfUrl(invoiceId: string): Promise<string | null> {
  // emp-billing serves the PDF directly at GET /invoices/:id/pdf. The
  // EmpCloud route returns a redirect (or pipes) to this URL.
  return `/invoices/${invoiceId}/pdf`;
}
