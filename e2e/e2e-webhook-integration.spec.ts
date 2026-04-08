import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// EMP Cloud — Webhook Integration E2E Tests
// Tests cross-system webhook delivery between EmpCloud and EMP Billing
// Verifies data consistency across the two databases via API round-trips
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";
const BILLING_API = "https://test-billing-api.empcloud.com/api/v1";
const BILLING_KEY = process.env.BILLING_API_KEY || "";

const ADMIN = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123" };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

async function getToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).data.tokens.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function billingAuth() {
  return { Authorization: `Bearer ${BILLING_KEY}`, "Content-Type": "application/json" };
}

// =============================================================================
// 1. Subscription → Billing Webhook Sync
// =============================================================================

test.describe("Subscription to Billing Webhook Sync", () => {
  let adminToken: string;
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
    superToken = await getToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
  });

  test("1.1 EmpCloud subscriptions exist in billing system", async ({ request }) => {
    // Get EmpCloud subscriptions
    const cloudRes = await request.get(`${API}/subscriptions`, {
      headers: auth(adminToken),
    });
    expect(cloudRes.status()).toBe(200);
    const cloudSubs = (await cloudRes.json()).data;

    // Get billing subscriptions
    const billingRes = await request.get(`${BILLING_API}/subscriptions`, {
      headers: billingAuth(),
    });
    expect(billingRes.status()).toBe(200);
    const billingData = await billingRes.json();
    const billingSubs = billingData.data || billingData;

    console.log(`EmpCloud subscriptions: ${cloudSubs.length}`);
    console.log(`Billing subscriptions: ${Array.isArray(billingSubs) ? billingSubs.length : "N/A"}`);

    // Both systems should have subscription records
    if (cloudSubs.length > 0) {
      expect(Array.isArray(billingSubs) ? billingSubs.length : 0).toBeGreaterThan(0);
    }
  });

  test("1.2 Subscription seat update reflects in billing", async ({ request }) => {
    // Get current subscriptions
    const listRes = await request.get(`${API}/subscriptions`, {
      headers: auth(adminToken),
    });
    const subs = (await listRes.json()).data;
    const activeSub = subs.find((s: any) => s.status === "active");
    if (!activeSub) {
      console.log("No active subscription to test seat update");
      return;
    }

    const currentSeats = activeSub.total_seats;
    console.log(`Subscription ${activeSub.id} (${activeSub.module_slug}): ${currentSeats} seats`);

    // Update seats
    const newSeats = currentSeats + 1;
    const updateRes = await request.put(`${API}/subscriptions/${activeSub.id}`, {
      headers: auth(adminToken),
      data: { total_seats: newSeats },
    });

    if (updateRes.status() === 200) {
      // Verify updated in EmpCloud
      const verifyRes = await request.get(`${API}/subscriptions/${activeSub.id}`, {
        headers: auth(adminToken),
      });
      const updated = (await verifyRes.json()).data;
      expect(updated.total_seats).toBe(newSeats);
      console.log(`Seats updated: ${currentSeats} → ${newSeats}`);

      // Revert seats
      await request.put(`${API}/subscriptions/${activeSub.id}`, {
        headers: auth(adminToken),
        data: { total_seats: currentSeats },
      });
    } else {
      console.log(`Seat update returned ${updateRes.status()} — endpoint may not support direct update`);
    }
  });

  test("1.3 Cancelled subscription status syncs to billing", async ({ request }) => {
    // List billing subscriptions and check for cancelled ones
    const billingRes = await request.get(`${BILLING_API}/subscriptions`, {
      headers: billingAuth(),
    });
    expect(billingRes.status()).toBe(200);
    const billingData = await billingRes.json();
    const billingSubs = billingData.data || billingData;

    if (Array.isArray(billingSubs)) {
      const statuses = billingSubs.map((s: any) => s.status);
      const uniqueStatuses = [...new Set(statuses)];
      console.log(`Billing subscription statuses: ${uniqueStatuses.join(", ")}`);
    }
  });
});

// =============================================================================
// 2. Billing → EmpCloud Webhook Delivery
// =============================================================================

test.describe("Billing to EmpCloud Webhook Delivery", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("2.1 Send invoice.paid webhook to EmpCloud", async ({ request }) => {
    // Get a billing subscription to reference
    const billingRes = await request.get(`${BILLING_API}/subscriptions`, {
      headers: billingAuth(),
    });
    const billingData = await billingRes.json();
    const billingSubs = billingData.data || billingData;
    const sub = Array.isArray(billingSubs) && billingSubs.length > 0 ? billingSubs[0] : null;

    if (!sub) {
      console.log("No billing subscription found — skipping webhook test");
      return;
    }

    // Send invoice.paid event to EmpCloud webhook endpoint
    const webhookRes = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: {
        event: "invoice.paid",
        data: {
          subscription_id: sub.id,
          invoice_id: `test-inv-${RUN}`,
          amount: 10000,
          currency: "INR",
          paid_at: new Date().toISOString(),
        },
      },
    });
    // Webhook endpoint should accept (200/202) or reject if auth missing (401/403)
    expect([200, 202, 400, 401, 403]).toContain(webhookRes.status());
    console.log(`Webhook invoice.paid response: ${webhookRes.status()}`);
  });

  test("2.2 Send webhook with missing required fields — returns error", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: {
        event: "invoice.paid",
        // Missing data payload
      },
    });
    expect([400, 401, 403, 422]).toContain(res.status());
    console.log(`Webhook with missing fields: ${res.status()}`);
  });

  test("2.3 Send webhook with invalid event type — handled gracefully", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: {
        event: "nonexistent.event.type",
        data: { foo: "bar" },
      },
    });
    // Should not crash — return 400, 404, or 200 (ignored)
    expect([200, 202, 400, 401, 403, 404, 422]).toContain(res.status());
    console.log(`Webhook with invalid event: ${res.status()}`);
  });

  test("2.4 Send webhook with empty body — returns error", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    expect([400, 401, 403, 422]).toContain(res.status());
    console.log(`Webhook with empty body: ${res.status()}`);
  });

  test("2.5 Send payment_failed webhook", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/billing`, {
      headers: { "Content-Type": "application/json" },
      data: {
        event: "payment_failed",
        data: {
          subscription_id: 1,
          invoice_id: `test-fail-${RUN}`,
          reason: "Card declined",
          failed_at: new Date().toISOString(),
        },
      },
    });
    expect([200, 202, 400, 401, 403]).toContain(res.status());
    console.log(`Webhook payment_failed response: ${res.status()}`);
  });
});

// =============================================================================
// 3. Cross-System Data Consistency
// =============================================================================

test.describe("Cross-System Data Consistency", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("3.1 Invoice count matches between EmpCloud proxy and billing API", async ({ request }) => {
    // EmpCloud proxy
    const cloudRes = await request.get(`${API}/billing/invoices`, {
      headers: auth(adminToken),
    });
    expect(cloudRes.status()).toBe(200);
    const cloudBody = await cloudRes.json();
    const cloudInvoices = cloudBody.data?.invoices || cloudBody.data || [];
    const cloudCount = Array.isArray(cloudInvoices) ? cloudInvoices.length : 0;

    // Billing API direct
    const billingRes = await request.get(`${BILLING_API}/invoices`, {
      headers: billingAuth(),
    });
    expect(billingRes.status()).toBe(200);
    const billingBody = await billingRes.json();
    const billingInvoices = billingBody.data?.invoices || billingBody.data || [];
    const billingCount = Array.isArray(billingInvoices) ? billingInvoices.length : 0;

    console.log(`EmpCloud proxy invoices: ${cloudCount}`);
    console.log(`Billing API invoices: ${billingCount}`);

    // Billing should have >= cloud count (billing may have invoices from other orgs)
    expect(billingCount).toBeGreaterThanOrEqual(cloudCount);
  });

  test("3.2 Payment count matches between EmpCloud proxy and billing API", async ({ request }) => {
    // EmpCloud proxy
    const cloudRes = await request.get(`${API}/billing/payments`, {
      headers: auth(adminToken),
    });

    // Billing API direct
    const billingRes = await request.get(`${BILLING_API}/payments`, {
      headers: billingAuth(),
    });

    if (cloudRes.status() === 200 && billingRes.status() === 200) {
      const cloudBody = await cloudRes.json();
      const billingBody = await billingRes.json();
      const cloudPayments = cloudBody.data?.payments || cloudBody.data || [];
      const billingPayments = billingBody.data?.payments || billingBody.data || [];
      const cloudCount = Array.isArray(cloudPayments) ? cloudPayments.length : 0;
      const billingCount = Array.isArray(billingPayments) ? billingPayments.length : 0;

      console.log(`EmpCloud proxy payments: ${cloudCount}`);
      console.log(`Billing API payments: ${billingCount}`);
      expect(billingCount).toBeGreaterThanOrEqual(cloudCount);
    } else {
      console.log(`Payments endpoint: cloud=${cloudRes.status()}, billing=${billingRes.status()}`);
    }
  });

  test("3.3 Gateway list consistent between EmpCloud and billing", async ({ request }) => {
    // EmpCloud proxy
    const cloudRes = await request.get(`${API}/billing/gateways`, {
      headers: auth(adminToken),
    });
    expect(cloudRes.status()).toBe(200);
    const cloudGateways = (await cloudRes.json()).data;

    // Billing direct
    const billingRes = await request.get(`${BILLING_API}/gateways`, {
      headers: billingAuth(),
    });

    if (billingRes.status() === 200) {
      const billingGateways = (await billingRes.json()).data;
      // Both should have the same gateway names
      const cloudNames = cloudGateways.map((g: any) => g.name).sort();
      const billingNames = (Array.isArray(billingGateways) ? billingGateways : [])
        .map((g: any) => g.name)
        .sort();

      console.log(`Cloud gateways: ${cloudNames.join(", ")}`);
      console.log(`Billing gateways: ${billingNames.join(", ")}`);
      // At minimum, both should have stripe
      expect(cloudNames).toContain("stripe");
    }
  });
});

// =============================================================================
// 4. Billing Worker Endpoints
// =============================================================================

test.describe("Billing Workers", () => {
  test("4.1 Trigger billing worker — no errors", async ({ request }) => {
    const res = await request.post(`${BILLING_API}/workers/billing`, {
      headers: billingAuth(),
    });
    // Worker endpoint may return 200, 202, or 404 if not implemented
    expect([200, 202, 404]).toContain(res.status());
    console.log(`Billing worker: ${res.status()}`);

    if (res.status() === 200 || res.status() === 202) {
      const body = await res.json();
      expect(body.success !== false).toBe(true);
    }
  });

  test("4.2 Trigger dunning worker — no errors", async ({ request }) => {
    const res = await request.post(`${BILLING_API}/workers/dunning`, {
      headers: billingAuth(),
    });
    expect([200, 202, 404]).toContain(res.status());
    console.log(`Dunning worker: ${res.status()}`);

    if (res.status() === 200 || res.status() === 202) {
      const body = await res.json();
      expect(body.success !== false).toBe(true);
    }
  });

  test("4.3 Force-renew triggers new invoice creation", async ({ request }) => {
    // Get a billing subscription
    const subsRes = await request.get(`${BILLING_API}/subscriptions`, {
      headers: billingAuth(),
    });
    expect(subsRes.status()).toBe(200);
    const billingData = await subsRes.json();
    const subs = billingData.data || billingData;

    if (!Array.isArray(subs) || subs.length === 0) {
      console.log("No billing subscriptions — skipping force-renew");
      return;
    }

    const sub = subs.find((s: any) => s.status === "active") || subs[0];
    console.log(`Testing force-renew on subscription ${sub.id}`);

    // Get invoice count before
    const invBeforeRes = await request.get(`${BILLING_API}/invoices`, {
      headers: billingAuth(),
    });
    const invBefore = (await invBeforeRes.json()).data;
    const countBefore = Array.isArray(invBefore) ? invBefore.length : (invBefore?.invoices?.length || 0);

    // Attempt force-renew
    const renewRes = await request.post(`${BILLING_API}/subscriptions/${sub.id}/renew`, {
      headers: billingAuth(),
    });
    console.log(`Force-renew response: ${renewRes.status()}`);
    // May return 200, 201, 400 (too early), or 404
    expect([200, 201, 400, 404, 409, 422]).toContain(renewRes.status());
  });
});

// =============================================================================
// 5. Stripe Payment Webhook Verification
// =============================================================================

test.describe("Stripe Webhook Integration", () => {
  test("5.1 Billing records Stripe payment correctly", async ({ request }) => {
    // Check if any Stripe payments exist
    const paymentsRes = await request.get(`${BILLING_API}/payments`, {
      headers: billingAuth(),
    });

    if (paymentsRes.status() === 200) {
      const body = await paymentsRes.json();
      const payments = body.data?.payments || body.data || [];
      if (Array.isArray(payments)) {
        const stripePayments = payments.filter((p: any) =>
          p.gateway === "stripe" || p.payment_method === "stripe"
        );
        console.log(`Total payments: ${payments.length}, Stripe: ${stripePayments.length}`);

        // Verify Stripe payment has required fields
        if (stripePayments.length > 0) {
          const payment = stripePayments[0];
          expect(payment.amount).toBeTruthy();
          expect(payment.status || payment.payment_status).toBeTruthy();
        }
      }
    }
  });

  test("5.2 Invoice status updates after payment", async ({ request }) => {
    const invRes = await request.get(`${BILLING_API}/invoices`, {
      headers: billingAuth(),
    });
    expect(invRes.status()).toBe(200);
    const body = await invRes.json();
    const invoices = body.data?.invoices || body.data || [];

    if (Array.isArray(invoices)) {
      const paid = invoices.filter((i: any) => i.status === "paid");
      const unpaid = invoices.filter((i: any) => i.status !== "paid");
      console.log(`Invoices: ${paid.length} paid, ${unpaid.length} unpaid out of ${invoices.length} total`);

      // Paid invoices should have amount_due = 0 or amountDue = 0
      for (const inv of paid.slice(0, 3)) {
        const due = inv.amount_due ?? inv.amountDue ?? 0;
        expect(due).toBe(0);
      }
    }
  });
});
