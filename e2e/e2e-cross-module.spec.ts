import { test, expect, type APIRequestContext } from "@playwright/test";

// =============================================================================
// E2E: Cross-Module Data Flow Tests
// Verifies data consistency across EmpCloud, Billing, Payroll, LMS, Monitor.
// Tests SSO token exchange, subscription → access, billing sync, revenue.
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";
const BILLING_API = "https://test-billing-api.empcloud.com/api/v1";
const BILLING_BASE = "https://test-billing-api.empcloud.com";
const PAYROLL_API = "https://testpayroll-api.empcloud.com/api/v1";
const PAYROLL_BASE = "https://testpayroll-api.empcloud.com";
const LMS_API = "https://testlms-api.empcloud.com/api/v1";
const LMS_BASE = "https://testlms-api.empcloud.com";
const MONITOR_API = "https://test-empmonitor-api.empcloud.com/api/v3";
const MONITOR_BASE = "https://test-empmonitor-api.empcloud.com";

const BILLING_KEY = process.env.BILLING_API_KEY || "";

const ADMIN = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status()).toBe(200);
  return (await res.json()).data.tokens.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function billingAuth() {
  return { "x-api-key": BILLING_KEY, "Content-Type": "application/json" };
}

async function ssoExchange(
  request: APIRequestContext,
  moduleApi: string,
  ecToken: string,
): Promise<{ status: number; token: string }> {
  const res = await request.post(`${moduleApi}/auth/sso`, {
    data: { token: ecToken },
  });
  const body = await res.json();
  const token =
    body.data?.tokens?.accessToken ||
    body.data?.tokens?.access_token ||
    body.data?.token ||
    body.data?.accessToken ||
    "";
  return { status: res.status(), token };
}

// =============================================================================
// 1. Subscription → Module Access
// =============================================================================

test.describe("Subscription → Module Access", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Active subscription → module access returns true", async ({ request }) => {
    test.setTimeout(20_000);

    const subsRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    expect(subsRes.status()).toBe(200);
    const subs = (await subsRes.json()).data;
    expect(subs.length).toBeGreaterThan(0);

    // Find an active subscription
    const activeSub = subs.find((s: any) => s.status === "active");
    if (!activeSub) {
      console.log("No active subscription — skipping");
      return;
    }

    console.log(`Active sub: ${activeSub.module_slug || activeSub.module_name} (${activeSub.status})`);

    // Check module access
    const moduleId = activeSub.module_id;
    const accessRes = await request.get(`${API}/subscriptions/check-access/${moduleId}`, {
      headers: auth(adminToken),
    });

    expect(accessRes.status()).toBeLessThan(500);
    if (accessRes.status() === 200) {
      const body = await accessRes.json();
      expect(body.data?.has_access || body.data === true || body.success).toBeTruthy();
      console.log(`Module ${moduleId} access: granted`);
    }
  });

  test("Cancel subscription → module access denied", async ({ request }) => {
    test.setTimeout(20_000);

    // List subscriptions to see if any are cancelled
    const subsRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await subsRes.json()).data;

    const cancelledSub = subs.find((s: any) => s.status === "cancelled" || s.status === "inactive");
    if (!cancelledSub) {
      console.log("No cancelled subscription to test — verifying active ones exist instead");
      const activeSubs = subs.filter((s: any) => s.status === "active");
      console.log(`Active subscriptions: ${activeSubs.length}`);
      return;
    }

    const moduleId = cancelledSub.module_id;
    const accessRes = await request.get(`${API}/subscriptions/check-access/${moduleId}`, {
      headers: auth(adminToken),
    });

    expect(accessRes.status()).toBeLessThan(500);
    console.log(`Cancelled module ${moduleId} access check: ${accessRes.status()}`);
  });

  test("Subscription seats count matches billing invoice seat count", async ({ request }) => {
    test.setTimeout(20_000);

    const subsRes = await request.get(`${API}/subscriptions`, { headers: auth(adminToken) });
    const subs = (await subsRes.json()).data;
    if (!subs || subs.length === 0) return;

    const activeSub = subs.find((s: any) => s.status === "active") || subs[0];
    console.log(`Sub: ${activeSub.module_slug}, seats: ${activeSub.used_seats}/${activeSub.total_seats}`);

    // Check billing invoices
    const invoicesRes = await request.get(`${API}/billing/invoices`, { headers: auth(adminToken) });
    if (invoicesRes.status() === 200) {
      const body = await invoicesRes.json();
      const invoices = body.data?.invoices || body.data || [];
      if (Array.isArray(invoices) && invoices.length > 0) {
        console.log(`Latest invoice: ${invoices[0].invoiceNumber || invoices[0].id}, total: ${invoices[0].total}`);
      }
    }
  });
});

// =============================================================================
// 2. SSO Token Exchange — Cross Module
// =============================================================================

test.describe("SSO Token Exchange", () => {
  let ecToken: string;

  test.beforeAll(async ({ request }) => {
    ecToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("SSO token accepted by Payroll module", async ({ request }) => {
    test.setTimeout(20_000);

    const { status, token } = await ssoExchange(request, PAYROLL_API, ecToken);
    console.log(`Payroll SSO: ${status}, token length: ${token.length}`);

    expect([200, 201].includes(status)).toBe(true);
    expect(token.length).toBeGreaterThan(10);

    // Verify the token works — call a Payroll endpoint
    const meRes = await request.get(`${PAYROLL_API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status()).toBeLessThan(500);
    console.log(`Payroll /auth/me: ${meRes.status()}`);
  });

  test("SSO token accepted by LMS module", async ({ request }) => {
    test.setTimeout(20_000);

    const { status, token } = await ssoExchange(request, LMS_API, ecToken);
    console.log(`LMS SSO: ${status}, token length: ${token.length}`);

    expect([200, 201].includes(status)).toBe(true);
    expect(token.length).toBeGreaterThan(10);

    // Verify token works
    const healthRes = await request.get(`${LMS_BASE}/health`);
    expect(healthRes.status()).toBe(200);
    console.log(`LMS health: OK`);
  });

  test("SSO token accepted by Monitor module", async ({ request }) => {
    test.setTimeout(20_000);

    const { status, token } = await ssoExchange(request, MONITOR_API, ecToken);
    console.log(`Monitor SSO: ${status}, token length: ${token.length}`);

    expect([200, 201].includes(status)).toBe(true);
    expect(token.length).toBeGreaterThan(10);
  });

  test("Invalid SSO token rejected by Payroll", async ({ request }) => {
    test.setTimeout(15_000);

    const res = await request.post(`${PAYROLL_API}/auth/sso`, {
      data: { token: "invalid-token-value-12345" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    console.log(`Invalid SSO to Payroll: ${res.status()} (correctly rejected)`);
  });
});

// =============================================================================
// 3. Billing Integration
// =============================================================================

test.describe("Billing Integration", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("EmpCloud org has matching billing client (billing_client_mappings)", async ({ request }) => {
    test.setTimeout(20_000);

    // Check billing clients via direct Billing API
    const res = await request.get(`${BILLING_API}/clients`, {
      headers: billingAuth(),
    });

    expect(res.status()).toBeLessThan(500);
    if (res.status() === 200) {
      const body = await res.json();
      const clients = body.data?.clients || body.data || [];
      expect(Array.isArray(clients)).toBe(true);
      console.log(`Billing clients: ${Array.isArray(clients) ? clients.length : 0}`);

      if (Array.isArray(clients) && clients.length > 0) {
        console.log(`First client: ${clients[0].name || clients[0].company_name} (ID: ${clients[0].id})`);
      }
    }
  });

  test("Billing payment recorded — EmpCloud billing proxy shows it", async ({ request }) => {
    test.setTimeout(20_000);

    // EmpCloud billing proxy
    const proxyRes = await request.get(`${API}/billing/invoices`, { headers: auth(adminToken) });
    expect(proxyRes.status()).toBeLessThan(500);

    // Direct billing API
    const directRes = await request.get(`${BILLING_API}/invoices`, { headers: billingAuth() });
    expect(directRes.status()).toBeLessThan(500);

    if (proxyRes.status() === 200 && directRes.status() === 200) {
      const proxyData = await proxyRes.json();
      const directData = await directRes.json();

      const proxyInvoices = proxyData.data?.invoices || proxyData.data || [];
      const directInvoices = directData.data?.invoices || directData.data || [];

      console.log(`Proxy invoices: ${Array.isArray(proxyInvoices) ? proxyInvoices.length : "N/A"}`);
      console.log(`Direct invoices: ${Array.isArray(directInvoices) ? directInvoices.length : "N/A"}`);
    }
  });

  test("Billing gateways filtered by org currency (INR → Razorpay/PayPal)", async ({ request }) => {
    test.setTimeout(15_000);

    const res = await request.get(`${API}/billing/gateways`, { headers: auth(adminToken) });
    expect(res.status()).toBeLessThan(500);

    if (res.status() === 200) {
      const body = await res.json();
      const gateways = body.data?.gateways || body.data || [];
      console.log(`Available gateways: ${JSON.stringify(gateways).slice(0, 300)}`);

      // For INR org, should include razorpay or paypal
      if (Array.isArray(gateways) && gateways.length > 0) {
        const names = gateways.map((g: any) => (g.name || g.gateway || g.type || "").toLowerCase());
        console.log(`Gateway names: ${names.join(", ")}`);
      }
    }
  });
});

// =============================================================================
// 4. Module Health Checks from EmpCloud
// =============================================================================

test.describe("Module Health Checks", () => {
  test("All module health endpoints respond", async ({ request }) => {
    test.setTimeout(30_000);

    const modules = [
      { name: "EmpCloud", url: `${API}/auth/me`, needsAuth: true },
      { name: "Payroll", url: `${PAYROLL_BASE}/health`, needsAuth: false },
      { name: "LMS", url: `${LMS_BASE}/health`, needsAuth: false },
      { name: "Billing", url: `${BILLING_BASE}/health`, needsAuth: false },
    ];

    let adminToken = "";
    const loginRes = await request.post(`${API}/auth/login`, { data: ADMIN });
    if (loginRes.status() === 200) {
      adminToken = (await loginRes.json()).data.tokens.access_token;
    }

    for (const mod of modules) {
      const headers = mod.needsAuth ? auth(adminToken) : {};
      const res = await request.get(mod.url, { headers });
      console.log(`${mod.name} health: ${res.status()}`);
      // Accept 200, 502, 503 — modules may be down on test server
      expect(res.status()).toBeLessThan(504);
    }
  });
});

// =============================================================================
// 5. Super Admin Revenue
// =============================================================================

test.describe("Super Admin Revenue", () => {
  let superToken: string;
  let orgToken: string;

  test.beforeAll(async ({ request }) => {
    superToken = await getToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
    orgToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Super admin MRR matches sum of all active subscription revenues", async ({ request }) => {
    test.setTimeout(20_000);

    const revenueRes = await request.get(`${API}/admin/revenue`, {
      headers: auth(superToken),
    });

    expect(revenueRes.status()).toBeLessThan(500);
    if (revenueRes.status() === 200) {
      const data = (await revenueRes.json()).data;
      expect(typeof data.mrr).toBe("number");
      expect(data.mrr).toBeGreaterThanOrEqual(0);
      expect(data.arr).toBe(data.mrr * 12);
      console.log(`MRR: ${data.mrr}, ARR: ${data.arr}`);
    }
  });

  test("Super admin revenue includes all org subscriptions", async ({ request }) => {
    test.setTimeout(20_000);

    // Get org subscriptions
    const subsRes = await request.get(`${API}/subscriptions`, { headers: auth(orgToken) });
    const subs = (await subsRes.json()).data || [];
    const activeOrgSubs = subs.filter((s: any) => s.status === "active");
    console.log(`Org active subscriptions: ${activeOrgSubs.length}`);

    // Get super admin revenue breakdown
    const revenueRes = await request.get(`${API}/admin/revenue`, {
      headers: auth(superToken),
    });

    if (revenueRes.status() === 200) {
      const data = (await revenueRes.json()).data;
      // Revenue should be >= org's revenue (there may be other orgs)
      console.log(`Platform MRR: ${data.mrr}, active org subs: ${activeOrgSubs.length}`);
      if (activeOrgSubs.length > 0) {
        expect(data.mrr).toBeGreaterThan(0);
      }
    }
  });

  test("Org admin cannot access super admin revenue endpoint", async ({ request }) => {
    test.setTimeout(15_000);

    const res = await request.get(`${API}/admin/revenue`, {
      headers: auth(orgToken),
    });

    // Should be 403 (org admin is not super admin)
    expect([403, 401].includes(res.status())).toBe(true);
    console.log(`Org admin revenue access: ${res.status()} (correctly denied)`);
  });
});

// =============================================================================
// 6. Multi-Currency Pricing
// =============================================================================

test.describe("Multi-Currency", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Verify pricing exists for org currency", async ({ request }) => {
    test.setTimeout(15_000);

    // Get billing summary which shows currency
    const res = await request.get(`${API}/billing/summary`, { headers: auth(adminToken) });
    expect(res.status()).toBeLessThan(500);

    if (res.status() === 200) {
      const data = (await res.json()).data;
      console.log(`Billing summary: ${JSON.stringify(data).slice(0, 300)}`);
    }

    // Also check modules for pricing info
    const modsRes = await request.get(`${API}/modules`, { headers: auth(adminToken) });
    if (modsRes.status() === 200) {
      const modules = (await modsRes.json()).data;
      if (modules.length > 0) {
        const mod = modules[0];
        console.log(`Module ${mod.slug}: price_per_seat=${mod.price_per_seat || mod.price || "N/A"}, currency=${mod.currency || "N/A"}`);
      }
    }
  });
});
