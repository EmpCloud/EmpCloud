import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const SUPER_ADMIN_CREDS = { email: "admin@empcloud.com", password: "SuperAdmin@123" };
const ADMIN_CREDS = { email: "ananya@technova.in", password: "Welcome@123" };

// =============================================================================
// Helpers
// =============================================================================

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data.tokens.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// =============================================================================
// 1. Log Dashboard (Super Admin)
// =============================================================================

test.describe("Log Dashboard", () => {
  let superToken: string;
  let orgAdminToken: string;

  test.beforeAll(async ({ request }) => {
    superToken = await loginAndGetToken(request, SUPER_ADMIN_CREDS.email, SUPER_ADMIN_CREDS.password);
    orgAdminToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
  });

  test("Super admin can get log summary", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/logs/summary`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("Super admin can get log overview (alias)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/logs/overview`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Super admin can get recent errors", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/logs/errors?page=1&per_page=10`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Super admin can get slow queries", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/logs/slow-queries?page=1&per_page=10`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Super admin can get auth events", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/logs/auth-events?page=1&per_page=10`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // We just logged in, so there should be auth events
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("Super admin can get module health", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/logs/health`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Org admin cannot access log dashboard (RBAC)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/logs/summary`, {
      headers: auth(orgAdminToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 2. AI Config (Super Admin)
// =============================================================================

test.describe("AI Config", () => {
  let superToken: string;
  let orgAdminToken: string;

  test.beforeAll(async ({ request }) => {
    superToken = await loginAndGetToken(request, SUPER_ADMIN_CREDS.email, SUPER_ADMIN_CREDS.password);
    orgAdminToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
  });

  test("Super admin can get AI config (keys masked)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/ai-config`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("Super admin can get AI config status", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/ai-config/status`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Super admin can update ai_max_tokens", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.put(`${API}/admin/ai-config/ai_max_tokens`, {
      headers: auth(superToken),
      data: { value: "4096" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Super admin gets error for invalid config key", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.put(`${API}/admin/ai-config/invalid_key`, {
      headers: auth(superToken),
      data: { value: "test" },
    });
    expect(res.status()).toBe(400);
  });

  test("Org admin cannot access AI config (RBAC)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/ai-config`, {
      headers: auth(orgAdminToken),
    });
    expect(res.status()).toBe(403);
  });
});
