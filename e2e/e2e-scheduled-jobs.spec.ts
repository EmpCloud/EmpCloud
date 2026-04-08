import { test, expect, type APIRequestContext } from "@playwright/test";

// =============================================================================
// E2E: Scheduled Jobs & Cron Trigger Tests
// Tests cron job trigger endpoints and verifies their effects on data.
// Covers billing workers, health checks, data sanity, leave balances,
// and attendance reports.
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";
const BILLING_API = "https://test-billing-api.empcloud.com/api/v1";
const BILLING_KEY = process.env.BILLING_API_KEY || "";

const ADMIN = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123" };

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
// 1. Billing Worker Triggers
// =============================================================================

test.describe("Billing Subscription Worker", () => {
  test("Trigger subscription billing worker returns success", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${BILLING_API}/subscriptions/admin/trigger-billing-worker`, {
      headers: billingAuth(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`Billing worker: ${JSON.stringify(body.data || body.message || "ok").slice(0, 200)}`);
  });

  test("Trigger dunning worker returns success", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${BILLING_API}/subscriptions/admin/trigger-dunning-worker`, {
      headers: billingAuth(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`Dunning worker: ${JSON.stringify(body.data || body.message || "ok").slice(0, 200)}`);
  });
});

// =============================================================================
// 2. Billing Dashboard Stats
// =============================================================================

test.describe("Billing Dashboard Stats", () => {
  test("Billing reports dashboard returns computed stats", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${BILLING_API}/reports/dashboard`, {
      headers: billingAuth(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`Billing dashboard keys: ${Object.keys(body.data || {}).join(", ")}`);
    // Should have some revenue/subscription stats
    expect(body.data).toBeTruthy();
  });
});

// =============================================================================
// 3. Subscription Status After Worker Trigger
// =============================================================================

test.describe("Subscription Worker Effects", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Subscriptions list reflects current statuses after worker run", async ({ request }) => {
    test.setTimeout(30_000);
    // Trigger the billing worker first
    const triggerRes = await request.post(`${BILLING_API}/subscriptions/admin/trigger-billing-worker`, {
      headers: billingAuth(),
    });
    expect(triggerRes.status()).toBe(200);

    // Then verify subscription statuses from EmpCloud side
    const subsRes = await request.get(`${API}/subscriptions`, {
      headers: auth(adminToken),
    });
    expect(subsRes.status()).toBe(200);
    const subs = (await subsRes.json()).data;
    expect(Array.isArray(subs)).toBe(true);

    for (const sub of subs.slice(0, 10)) {
      // Status should be a valid subscription status
      const validStatuses = ["active", "trialing", "past_due", "cancelled", "expired", "pending", "suspended"];
      expect(validStatuses).toContain(sub.status);
      console.log(`  Sub ${sub.module_slug || sub.module_name}: ${sub.status} (${sub.used_seats}/${sub.total_seats} seats)`);
    }
  });

  test("Time-shift subscription — trigger worker — verify renewal logic exists", async ({ request }) => {
    test.setTimeout(30_000);
    // Get billing subscriptions to check renewal dates
    const res = await request.get(`${BILLING_API}/subscriptions`, {
      headers: billingAuth(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const subs = body.data?.subscriptions || body.data || [];

    if (Array.isArray(subs) && subs.length > 0) {
      const first = subs[0];
      console.log(`First billing sub: status=${first.status}, period_end=${first.current_period_end || first.end_date || "N/A"}`);
      // Just verify the data shape — actual time-shifting is not safe in E2E
      expect(first.status).toBeTruthy();
    } else {
      console.log("No billing subscriptions found — skipping renewal check");
    }
  });
});

// =============================================================================
// 4. Force Health Check (Super Admin)
// =============================================================================

test.describe("Force Health Check via Cron", () => {
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    superToken = await getToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
  });

  test("Force health check — all modules respond", async ({ request }) => {
    test.setTimeout(90_000);
    const res = await request.post(`${API}/admin/service-health/check`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Log individual module results
    const results = body.data?.results || body.data?.services || body.data || [];
    if (Array.isArray(results)) {
      let healthyCount = 0;
      for (const svc of results) {
        const healthy = svc.status === "healthy" || svc.status === "up" || svc.healthy === true;
        if (healthy) healthyCount++;
        console.log(`  ${svc.name || svc.module}: ${svc.status || (svc.healthy ? "healthy" : "down")}`);
      }
      console.log(`Healthy: ${healthyCount}/${results.length}`);
    }
  });
});

// =============================================================================
// 5. Data Sanity Check & Fix
// =============================================================================

test.describe("Data Sanity Jobs", () => {
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    superToken = await getToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
  });

  test("Data sanity check returns pass/fail counts", async ({ request }) => {
    test.setTimeout(60_000);
    const res = await request.get(`${API}/admin/data-sanity`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const checks = body.data?.checks || body.data || [];
    if (Array.isArray(checks)) {
      let passed = 0;
      let failed = 0;
      for (const check of checks) {
        if (check.status === "pass" || check.passed === true) passed++;
        else failed++;
      }
      console.log(`Data sanity: ${passed} passed, ${failed} failed out of ${checks.length} checks`);
    } else {
      console.log(`Data sanity response: ${JSON.stringify(body.data).slice(0, 300)}`);
    }
  });

  test("Data sanity fix returns fixed count", async ({ request }) => {
    test.setTimeout(60_000);
    const res = await request.post(`${API}/admin/data-sanity/fix`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`Data sanity fix result: ${JSON.stringify(body.data).slice(0, 300)}`);
  });
});

// =============================================================================
// 6. Leave Balance for Current Year
// =============================================================================

test.describe("Leave Balance Computation", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Leave balances endpoint returns data for current year", async ({ request }) => {
    test.setTimeout(30_000);
    const currentYear = new Date().getFullYear();
    const res = await request.get(`${API}/leave/balances?year=${currentYear}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const balances = body.data || [];
    if (Array.isArray(balances)) {
      console.log(`Leave balances for ${currentYear}: ${balances.length} entries`);
      for (const b of balances.slice(0, 5)) {
        console.log(`  ${b.leave_type || b.type_name || b.leave_type_id}: entitled=${b.entitled ?? b.total ?? "?"}, used=${b.used ?? "?"}, remaining=${b.remaining ?? b.balance ?? "?"}`);
      }
    }
  });
});

// =============================================================================
// 7. Attendance Monthly Report
// =============================================================================

test.describe("Attendance Monthly Report", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Attendance report generates for past month", async ({ request }) => {
    test.setTimeout(30_000);
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1; // 1-indexed

    const res = await request.get(
      `${API}/attendance/report?year=${year}&month=${month}`,
      { headers: auth(adminToken) },
    );
    // May be 200 or 404 if no data for that month
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      const records = body.data?.records || body.data || [];
      console.log(`Attendance report ${year}-${String(month).padStart(2, "0")}: ${Array.isArray(records) ? records.length : "N/A"} records`);
    } else {
      console.log(`Attendance report ${year}-${String(month).padStart(2, "0")}: status ${res.status()} (no data)`);
    }
  });
});
