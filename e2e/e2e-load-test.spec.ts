import { test, expect, type APIRequestContext } from "@playwright/test";

// =============================================================================
// E2E: Basic Load / Performance Testing
// Verifies API response times under concurrent load.
// Not a full load test (use k6/Artillery for that), but catches regressions.
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";
const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };

async function getToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: ADMIN });
  return (await res.json()).data.tokens.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// =============================================================================
// 1. API Response Time Benchmarks
// =============================================================================

test.describe("API Response Times", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getToken(request);
  });

  const endpoints = [
    { name: "Health check", path: "/auth/me", maxMs: 500 },
    { name: "Employee list", path: "/employees?limit=10", maxMs: 1000 },
    { name: "Leave types", path: "/leave/types", maxMs: 500 },
    { name: "Leave balances", path: "/leave/balances/me", maxMs: 500 },
    { name: "Attendance records", path: "/attendance/records?limit=10", maxMs: 1000 },
    { name: "Modules list", path: "/modules", maxMs: 500 },
    { name: "Subscriptions", path: "/subscriptions", maxMs: 500 },
    { name: "Notifications", path: "/notifications", maxMs: 500 },
    { name: "Announcements", path: "/announcements?limit=5", maxMs: 500 },
    { name: "Policies", path: "/policies?limit=5", maxMs: 500 },
  ];

  for (const ep of endpoints) {
    test(`${ep.name} responds within ${ep.maxMs}ms`, async ({ request }) => {
      const start = Date.now();
      const res = await request.get(`${API}${ep.path}`, { headers: auth(token) });
      const elapsed = Date.now() - start;
      expect(res.status()).toBeLessThan(500);
      console.log(`${ep.name}: ${elapsed}ms (limit: ${ep.maxMs}ms) — HTTP ${res.status()}`);
      expect(elapsed).toBeLessThan(ep.maxMs);
    });
  }
});

// =============================================================================
// 2. Concurrent Request Handling
// =============================================================================

test.describe("Concurrent Requests", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getToken(request);
  });

  test("10 concurrent API calls complete within 3s", async ({ request }) => {
    const start = Date.now();
    const promises = Array.from({ length: 10 }, (_, i) =>
      request.get(`${API}/modules`, { headers: auth(token) })
    );
    const results = await Promise.all(promises);
    const elapsed = Date.now() - start;

    const statuses = results.map((r) => r.status());
    const allOk = statuses.every((s) => s < 500);
    console.log(`10 concurrent: ${elapsed}ms, statuses: ${statuses.join(",")}`);
    expect(allOk).toBe(true);
    expect(elapsed).toBeLessThan(3000);
  });

  test("20 concurrent mixed API calls", async ({ request }) => {
    const paths = [
      "/modules", "/subscriptions", "/employees?limit=5", "/leave/types",
      "/notifications", "/announcements?limit=3", "/policies?limit=3",
      "/attendance/records?limit=5", "/modules", "/subscriptions",
      "/employees?limit=5", "/leave/types", "/notifications",
      "/announcements?limit=3", "/policies?limit=3", "/modules",
      "/subscriptions", "/employees?limit=5", "/leave/types", "/notifications",
    ];

    const start = Date.now();
    const promises = paths.map((p) =>
      request.get(`${API}${p}`, { headers: auth(token) })
    );
    const results = await Promise.all(promises);
    const elapsed = Date.now() - start;

    const errors = results.filter((r) => r.status() >= 500).length;
    console.log(`20 concurrent mixed: ${elapsed}ms, errors: ${errors}/20`);
    expect(errors).toBe(0);
    expect(elapsed).toBeLessThan(5000);
  });

  test("Rapid sequential login attempts (not rate-limited in dev)", async ({ request }) => {
    const start = Date.now();
    const results = [];
    for (let i = 0; i < 5; i++) {
      const res = await request.post(`${API}/auth/login`, { data: ADMIN });
      results.push(res.status());
    }
    const elapsed = Date.now() - start;
    console.log(`5 sequential logins: ${elapsed}ms, statuses: ${results.join(",")}`);
    expect(results.every((s) => s === 200)).toBe(true);
  });
});

// =============================================================================
// 3. Health Check Across Modules
// =============================================================================

test.describe("Module Health Checks", () => {
  const modules = [
    { name: "EMP Cloud", url: "https://test-empcloud-api.empcloud.com/health" },
    { name: "EMP Billing", url: "https://test-billing-api.empcloud.com/health" },
    { name: "EMP Payroll", url: "https://testpayroll-api.empcloud.com/health" },
    { name: "EMP Performance", url: "https://test-performance-api.empcloud.com/health" },
    { name: "EMP Exit", url: "https://test-exit-api.empcloud.com/health" },
    { name: "EMP Recruit", url: "https://test-recruit-api.empcloud.com/health" },
    { name: "EMP Rewards", url: "https://test-rewards-api.empcloud.com/health" },
    { name: "EMP LMS", url: "https://testlms-api.empcloud.com/health" },
    { name: "EMP Field", url: "https://test-field-api.empcloud.com/health" },
  ];

  for (const mod of modules) {
    test(`${mod.name} health check`, async ({ request }) => {
      const start = Date.now();
      const res = await request.get(mod.url);
      const elapsed = Date.now() - start;
      expect(res.status()).toBe(200);
      console.log(`${mod.name}: ${elapsed}ms — healthy`);
    });
  }
});
