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
  if (params?.q) qs.set("q", params.q);

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
  const invoices = rawInvoices.map((inv: any) => ({
    id: inv.id,
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
  }));

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

  let enriched = invoices.map((inv: any) => {
    const m = inv.client_id ? byClient[inv.client_id] || {} : {};
    return {
      ...inv,
      empcloud_organization_id: m.organization_id ?? null,
      empcloud_organization_name: m.organization_name ?? null,
      empcloud_organization_email: m.organization_email ?? null,
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
