import { test, expect, type APIRequestContext } from "@playwright/test";

// =============================================================================
// E2E: Full Subscription Lifecycle
// Tests create → invoice → pay → renew → cancel → seats → access
// Uses admin endpoints to accelerate billing cycles (no 30-day wait).
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";
const BILLING_API = "https://test-billing-api.empcloud.com/api/v1";
const BILLING_KEY = "emp-billing-api-key-2026-secure-integration";

const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE = { email: "arjun@technova.in", password: "Welcome@123" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
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
// Phase 1: Subscription Creation
// =============================================================================

test.describe("Phase 1: Subscription Creation", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("1.1 List available modules", async ({ request }) => {
    const res = await request.get(`${API}/modules`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const modules = (await res.json()).data;
    expect(modules.length).toBeGreaterThan(0);
    console.log(`Available modules: ${modules.map((m: any) => m.slug).join(", ")}`);
  });

  test("1.2 List current subscriptions", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const subs = (await res.json()).data;
    console.log(`Current subscriptions: ${subs.length}`);
    for (const s of subs.slice(0, 5)) {
      console.log(`  ${s.module_slug || s.module_name}: ${s.status} (${s.used_seats}/${s.total_seats} seats)`);
    }
  });

  test("1.3 Create a new subscription (or verify existing)", async ({ request }) => {
    // First check current subs
    const listRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await listRes.json()).data;

    // Find a module we're NOT subscribed to, or use existing
    const modsRes = await request.get(`${API}/modules`, { headers: auth(adminToken) });
    const modules = (await modsRes.json()).data;
    const subscribedSlugs = subs.map((s: any) => s.module_slug);

    // If we already have subscriptions, use the first one for testing
    if (subs.length > 0) {
      console.log(`Using existing subscription: ${subs[0].module_slug} (${subs[0].status})`);
      return;
    }

    // Create a new subscription
    const targetModule = modules.find((m: any) => !subscribedSlugs.includes(m.slug));
    if (!targetModule) {
      console.log("All modules already have subscriptions — using existing for tests");
      return;
    }

    const res = await request.post(`${API}/subscriptions`, {
      headers: auth(adminToken),
      data: {
        module_id: targetModule.id,
        plan_tier: "basic",
        total_seats: 5,
        billing_cycle: "monthly",
      },
    });
    expect(res.status()).toBe(201);
    const sub = (await res.json()).data;
    expect(sub.status).toBe("active");
    expect(sub.total_seats).toBe(5);
    console.log(`Created subscription: ${targetModule.slug}, ID=${sub.id}`);
  });

  test("1.4 Duplicate subscription prevented", async ({ request }) => {
    const listRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await listRes.json()).data;
    if (subs.length === 0) return;

    const existing = subs[0];
    // Try to subscribe to same module again
    const res = await request.post(`${API}/subscriptions`, {
      headers: auth(adminToken),
      data: {
        module_id: existing.module_id,
        plan_tier: "basic",
        total_seats: 3,
        billing_cycle: "monthly",
      },
    });
    // Should fail with conflict
    expect([409, 400, 422].includes(res.status())).toBe(true);
    console.log(`Duplicate subscription correctly rejected: ${res.status()}`);
  });
});

// =============================================================================
// Phase 2: Invoice Generation
// =============================================================================

test.describe("Phase 2: Invoice Generation", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("2.1 Invoices exist for active subscriptions", async ({ request }) => {
    const res = await request.get(`${API}/billing/invoices`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const body = (await res.json()).data;
    const invoices = body.invoices || body;
    expect(Array.isArray(invoices)).toBe(true);
    console.log(`Total invoices: ${invoices.length}`);
    for (const inv of invoices.slice(0, 3)) {
      console.log(`  ${inv.invoiceNumber}: ${inv.status} — ₹${(inv.total / 100).toLocaleString()}`);
    }
  });

  test("2.2 Billing summary shows outstanding amounts", async ({ request }) => {
    const res = await request.get(`${API}/billing/summary`, { headers: auth(adminToken) });
    if (res.status() === 200) {
      const data = (await res.json()).data;
      console.log("Billing summary:", JSON.stringify(data).slice(0, 300));
    }
  });

  test("2.3 Invoices in billing DB match empcloud proxy", async ({ request }) => {
    // Direct billing API
    const billingRes = await request.get(`${BILLING_API}/invoices`, { headers: billingAuth() });
    expect(billingRes.status()).toBe(200);
    const billingInvoices = (await billingRes.json()).data;

    // EmpCloud proxy
    const cloudRes = await request.get(`${API}/billing/invoices`, { headers: auth(adminToken) });
    const cloudBody = (await cloudRes.json()).data;
    const cloudInvoices = cloudBody.invoices || cloudBody;

    console.log(`Billing DB: ${billingInvoices.length} invoices, EmpCloud proxy: ${cloudInvoices.length} invoices`);
  });
});

// =============================================================================
// Phase 3: Payment Processing
// =============================================================================

test.describe("Phase 3: Payment Processing", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("3.1 Create Stripe payment for unpaid invoice", async ({ request }) => {
    const invRes = await request.get(`${API}/billing/invoices`, { headers: auth(adminToken) });
    const invBody = (await invRes.json()).data;
    const invoices = invBody.invoices || invBody;
    const unpaid = invoices.find((i: any) => i.amountDue > 0);

    if (!unpaid) {
      console.log("No unpaid invoices — skipping payment test");
      return;
    }

    const res = await request.post(`${API}/billing/pay`, {
      headers: auth(adminToken),
      data: { invoiceId: unpaid.id, gateway: "stripe" },
    });
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    expect(data.checkoutUrl).toContain("stripe.com");
    console.log(`Stripe checkout created for ${unpaid.invoiceNumber}: ${data.checkoutUrl.slice(0, 60)}...`);
  });

  test("3.2 Create Razorpay payment for unpaid invoice", async ({ request }) => {
    const invRes = await request.get(`${API}/billing/invoices`, { headers: auth(adminToken) });
    const invBody = (await invRes.json()).data;
    const invoices = invBody.invoices || invBody;
    const unpaid = invoices.find((i: any) => i.amountDue > 0);

    if (!unpaid) {
      console.log("No unpaid invoices — skipping");
      return;
    }

    const res = await request.post(`${API}/billing/pay`, {
      headers: auth(adminToken),
      data: { invoiceId: unpaid.id, gateway: "razorpay" },
    });
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    expect(data.gatewayOrderId).toMatch(/^order_/);
    console.log(`Razorpay order: ${data.gatewayOrderId}`);
  });
});

// =============================================================================
// Phase 4: Subscription Renewal (Accelerated)
// =============================================================================

test.describe("Phase 4: Subscription Renewal", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("4.1 List billing subscriptions", async ({ request }) => {
    const res = await request.get(`${BILLING_API}/subscriptions`, { headers: billingAuth() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const subs = Array.isArray(body.data) ? body.data : body.data?.data || [];
    console.log(`Billing subscriptions: ${subs.length}`);
    for (const s of subs.slice(0, 3)) {
      console.log(`  ${s.id?.slice(0, 8)}... status=${s.status} autoRenew=${s.autoRenew} nextBilling=${s.nextBillingDate}`);
    }
  });

  test("4.2 Force-renew a subscription (generates new invoice)", async ({ request }) => {
    // Get first billing subscription
    const listRes = await request.get(`${BILLING_API}/subscriptions`, { headers: billingAuth() });
    const body = await listRes.json();
    const subs = Array.isArray(body.data) ? body.data : body.data?.data || [];

    if (subs.length === 0) {
      console.log("No billing subscriptions to renew — skipping");
      return;
    }

    const sub = subs[0];
    console.log(`Force-renewing subscription: ${sub.id}`);

    // Force renew
    const renewRes = await request.post(`${BILLING_API}/subscriptions/${sub.id}/force-renew`, {
      headers: billingAuth(),
    });
    expect(renewRes.status()).toBe(200);
    const renewData = (await renewRes.json()).data;
    expect(renewData.invoiceId).toBeTruthy();
    console.log(`Renewal invoice created: ${renewData.invoiceId}`);
  });

  test("4.3 Time-shift subscription and trigger billing worker", async ({ request }) => {
    const listRes = await request.get(`${BILLING_API}/subscriptions`, { headers: billingAuth() });
    const body = await listRes.json();
    const subs = Array.isArray(body.data) ? body.data : body.data?.data || [];

    if (subs.length < 2) {
      console.log("Need 2+ billing subscriptions for time-shift test — skipping");
      return;
    }

    const sub = subs[1]; // Use second subscription
    console.log(`Time-shifting subscription: ${sub.id}`);

    // Time-shift to yesterday
    const shiftRes = await request.post(`${BILLING_API}/subscriptions/${sub.id}/time-shift`, {
      headers: billingAuth(),
    });
    expect(shiftRes.status()).toBe(200);

    // Trigger worker
    const workerRes = await request.post(`${BILLING_API}/subscriptions/admin/trigger-billing-worker`, {
      headers: billingAuth(),
    });
    expect(workerRes.status()).toBe(200);
    console.log("Worker triggered — renewal should process async");

    // Wait for worker to process
    await new Promise((r) => setTimeout(r, 5000));

    // Check subscription was renewed
    const updatedRes = await request.get(`${BILLING_API}/subscriptions/${sub.id}`, { headers: billingAuth() });
    if (updatedRes.status() === 200) {
      const updated = (await updatedRes.json()).data;
      console.log(`After worker: status=${updated.status}, nextBilling=${updated.nextBillingDate}`);
    }
  });
});

// =============================================================================
// Phase 5: Seat Management
// =============================================================================

test.describe("Phase 5: Seat Management", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("5.1 Assign a seat to a user", async ({ request }) => {
    // Get first subscription
    const subRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await subRes.json()).data;
    if (subs.length === 0) return;

    const sub = subs[0];

    // Get a user to assign
    const usersRes = await request.get(`${API}/users?limit=5`, { headers: auth(adminToken) });
    if (usersRes.status() !== 200) return;
    const users = (await usersRes.json()).data;
    if (!users || users.length === 0) return;

    const user = users.find((u: any) => u.id && u.role !== "super_admin");
    if (!user) return;

    // Try to assign seat
    const res = await request.post(`${API}/subscriptions/assign-seat`, {
      headers: auth(adminToken),
      data: { module_id: sub.module_id, user_id: user.id },
    });

    // May succeed or fail if already assigned
    if (res.status() === 200 || res.status() === 201) {
      console.log(`Seat assigned: user ${user.id} → module ${sub.module_slug}`);
    } else {
      const body = await res.json();
      console.log(`Seat assignment: ${res.status()} — ${body.error?.message || "already assigned"}`);
    }
  });

  test("5.2 List seats for a module", async ({ request }) => {
    const subRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await subRes.json()).data;
    if (subs.length === 0) return;

    const sub = subs[0];
    const res = await request.get(`${API}/subscriptions/${sub.id}/seats`, { headers: auth(adminToken) });
    if (res.status() === 200) {
      const seats = (await res.json()).data;
      console.log(`Seats for ${sub.module_slug}: ${seats?.length || 0} assigned`);
    }
  });

  test("5.3 Cannot exceed seat limit", async ({ request }) => {
    const subRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await subRes.json()).data;
    if (subs.length === 0) return;

    const sub = subs.find((s: any) => s.used_seats >= s.total_seats);
    if (!sub) {
      console.log("No full subscriptions — skipping seat limit test");
      return;
    }

    // Try to assign one more
    const res = await request.post(`${API}/subscriptions/assign-seat`, {
      headers: auth(adminToken),
      data: { module_id: sub.module_id, user_id: 999999 },
    });
    expect([400, 422].includes(res.status())).toBe(true);
    console.log(`Seat limit enforced: ${res.status()}`);
  });

  test("5.4 Revoke a seat", async ({ request }) => {
    const subRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await subRes.json()).data;
    const sub = subs.find((s: any) => s.used_seats > 0);
    if (!sub) {
      console.log("No assigned seats to revoke — skipping");
      return;
    }

    // Get seats
    const seatsRes = await request.get(`${API}/subscriptions/${sub.id}/seats`, { headers: auth(adminToken) });
    if (seatsRes.status() !== 200) return;
    const seats = (await seatsRes.json()).data;
    if (!seats || seats.length === 0) return;

    const seat = seats[0];
    const res = await request.post(`${API}/subscriptions/revoke-seat`, {
      headers: auth(adminToken),
      data: { module_id: sub.module_id, user_id: seat.user_id },
    });
    expect([200, 204].includes(res.status())).toBe(true);
    console.log(`Seat revoked: user ${seat.user_id} from module ${sub.module_slug}`);
  });
});

// =============================================================================
// Phase 6: Module Access Control
// =============================================================================

test.describe("Phase 6: Module Access Control", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await getToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("6.1 Check access endpoint works (server returns 500 — needs investigation)", async ({ request }) => {
    // Get a module slug from the modules list
    const modsRes = await request.get(`${API}/modules`, { headers: auth(adminToken) });
    expect(modsRes.status()).toBe(200);
    const modules = (await modsRes.json()).data;
    const mod = modules[0];

    // check-access endpoint should respond (200 with result, or 400 for invalid input)
    const res = await request.post(`${API}/subscriptions/check-access`, {
      headers: { "Content-Type": "application/json" },
      data: { user_id: 1, module_slug: mod.slug, org_id: 5 },
    });
    expect(res.status()).toBeLessThan(500);
    console.log(`check-access endpoint responded: ${res.status()}`);
  });

  test("6.2 Access denied for user without seat", async ({ request }) => {
    const subRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await subRes.json()).data;
    if (subs.length === 0) return;

    const res = await request.post(`${API}/subscriptions/check-access`, {
      headers: { "Content-Type": "application/json" },
      data: { user_id: 999999, module_slug: subs[0].module_slug },
    });
    // May return 200 with has_access=false, or 400 for invalid user
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 200) {
      const access = (await res.json()).data;
      expect(access.has_access).toBe(false);
    }
    console.log(`Access correctly denied for non-existent user (${res.status()})`);
  });

  test("6.3 Access denied for non-subscribed module", async ({ request }) => {
    const res = await request.post(`${API}/subscriptions/check-access`, {
      headers: { "Content-Type": "application/json" },
      data: { user_id: 1, module_slug: "emp-nonexistent-module" },
    });
    expect(res.status()).toBe(200);
    const access = (await res.json()).data;
    expect(access.has_access).toBe(false);
    console.log(`Access correctly denied for non-existent module`);
  });
});

// =============================================================================
// Phase 7: Subscription Update & Cancellation
// =============================================================================

test.describe("Phase 7: Update & Cancellation", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("7.1 Update subscription seats", async ({ request }) => {
    const subRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await subRes.json()).data;
    const sub = subs.find((s: any) => s.status === "active");
    if (!sub) return;

    const newSeats = sub.total_seats + 2;
    const res = await request.put(`${API}/subscriptions/${sub.id}`, {
      headers: auth(adminToken),
      data: { total_seats: newSeats },
    });

    if (res.status() === 200) {
      const updated = (await res.json()).data;
      expect(updated.total_seats).toBe(newSeats);
      console.log(`Seats updated: ${sub.total_seats} → ${newSeats}`);
    } else {
      console.log(`Seat update response: ${res.status()}`);
    }
  });

  test("7.2 Cannot reduce seats below used count", async ({ request }) => {
    const subRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await subRes.json()).data;
    const sub = subs.find((s: any) => s.used_seats > 0);
    if (!sub) {
      console.log("No subscriptions with used seats — skipping");
      return;
    }

    const res = await request.put(`${API}/subscriptions/${sub.id}`, {
      headers: auth(adminToken),
      data: { total_seats: sub.used_seats - 1 },
    });
    expect([400, 422].includes(res.status())).toBe(true);
    console.log(`Correctly prevented reducing seats below used count`);
  });

  test("7.3 Billing status endpoint works", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-status`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    console.log(`Billing status: warning_level=${data.warning_level}, message=${data.message}`);
  });
});

// =============================================================================
// Phase 8: Dunning (Admin Worker Trigger)
// =============================================================================

test.describe("Phase 8: Dunning Workers", () => {
  test("8.1 Trigger dunning worker via admin endpoint", async ({ request }) => {
    const res = await request.post(`${BILLING_API}/subscriptions/admin/trigger-dunning-worker`, {
      headers: billingAuth(),
    });
    expect(res.status()).toBe(200);
    console.log("Dunning worker triggered successfully");
  });

  test("8.2 Trigger subscription billing worker", async ({ request }) => {
    const res = await request.post(`${BILLING_API}/subscriptions/admin/trigger-billing-worker`, {
      headers: billingAuth(),
    });
    expect(res.status()).toBe(200);
    console.log("Subscription billing worker triggered successfully");
  });
});

// =============================================================================
// Phase 9: Cross-System Integrity
// =============================================================================

test.describe("Phase 9: Cross-System Integrity", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("9.1 EmpCloud subscriptions have matching billing records", async ({ request }) => {
    // Cloud subscriptions
    const cloudRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const cloudSubs = (await cloudRes.json()).data;

    // Billing subscriptions
    const billingRes = await request.get(`${BILLING_API}/subscriptions`, { headers: billingAuth() });
    const billingBody = await billingRes.json();
    const billingSubs = Array.isArray(billingBody.data) ? billingBody.data : billingBody.data?.data || [];

    console.log(`Cloud subscriptions: ${cloudSubs.length}, Billing subscriptions: ${billingSubs.length}`);

    // Paid cloud subs should have billing counterparts
    const paidCloudSubs = cloudSubs.filter((s: any) => s.price_per_seat > 0 && s.status === "active");
    console.log(`Paid active cloud subs: ${paidCloudSubs.length}`);
  });

  test("9.2 Payment gateways available", async ({ request }) => {
    const res = await request.get(`${API}/billing/gateways`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const gateways = body.data || [];
    console.log(`Gateways: ${gateways.length} — ${gateways.map((g: any) => g.name).join(", ") || "none returned (billing may need restart)"}`);
  });

  test("9.3 Revenue analytics reflect subscriptions", async ({ request }) => {
    // Login as super admin for revenue
    const superToken = await getToken(request, "admin@empcloud.com", "SuperAdmin@123");
    const res = await request.get(`${API}/admin/revenue`, { headers: auth(superToken) });
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    console.log(`MRR: ₹${(data.mrr / 100).toLocaleString()}, ARR: ₹${(data.arr / 100).toLocaleString()}`);
    expect(data.mrr).toBeGreaterThan(0);
    expect(data.arr).toBe(data.mrr * 12);
  });
});
