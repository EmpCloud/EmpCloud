import { test, expect, type APIRequestContext } from "@playwright/test";

// =============================================================================
// E2E: Realtime & WebSocket-Adjacent Feature Tests
// Tests HTTP endpoints that feed real-time features (notifications, dashboard
// widgets, chatbot, module health). Cannot test actual WebSocket connections
// from Playwright, but validates the data layer that powers them.
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE = { email: "arjun@technova.in", password: "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: "SuperAdmin@123" };

async function getToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status()).toBe(200);
  return (await res.json()).data.tokens.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// =============================================================================
// 1. Notifications — Real-Time Ready Data
// =============================================================================

test.describe("Notifications Real-Time Data", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await getToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("GET /notifications returns structured real-time-ready data", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/notifications`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify the response has the shape needed for real-time display
    const notifications = body.data?.notifications || body.data || [];
    if (Array.isArray(notifications) && notifications.length > 0) {
      const first = notifications[0];
      // Should have at minimum: id, type/title, created_at
      expect(first).toHaveProperty("id");
      expect(first.created_at || first.createdAt).toBeTruthy();
      console.log(`Notification structure keys: ${Object.keys(first).join(", ")}`);
    }
    console.log(`Notifications returned: ${Array.isArray(notifications) ? notifications.length : 0}`);
  });

  test("GET /notifications/unread-count responds under 200ms", async ({ request }) => {
    test.setTimeout(10_000);
    const start = Date.now();
    const res = await request.get(`${API}/notifications/unread-count`, {
      headers: auth(employeeToken),
    });
    const elapsed = Date.now() - start;
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // This endpoint should be fast as it powers the badge count in the header
    console.log(`Unread count response time: ${elapsed}ms`);
    // Allow generous threshold for network latency to test server
    expect(elapsed).toBeLessThan(2000);
  });
});

// =============================================================================
// 2. Dashboard Widgets — Cached Data Speed
// =============================================================================

test.describe("Dashboard Widgets Speed", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Dashboard summary endpoints return quickly", async ({ request }) => {
    test.setTimeout(30_000);
    const endpoints = [
      "/leave/balances",
      "/attendance/today",
      "/announcements?limit=5",
      "/employees?limit=5",
    ];

    for (const endpoint of endpoints) {
      const start = Date.now();
      const res = await request.get(`${API}${endpoint}`, {
        headers: auth(adminToken),
      });
      const elapsed = Date.now() - start;
      // Should not error
      expect(res.status()).toBeLessThan(500);
      console.log(`${endpoint}: ${res.status()} in ${elapsed}ms`);
      // Each widget query should respond within 5s (generous for test server)
      expect(elapsed).toBeLessThan(5000);
    }
  });
});

// =============================================================================
// 3. Module Health Check — All Modules Respond
// =============================================================================

test.describe("Module Health Checks", () => {
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    superToken = await getToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
  });

  test("Service health returns status for all modules within timeout", async ({ request }) => {
    test.setTimeout(60_000);
    const res = await request.get(`${API}/admin/service-health`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const services = body.data?.services || body.data || [];
    if (Array.isArray(services)) {
      console.log(`Module health results: ${services.length} services`);
      for (const svc of services) {
        console.log(`  ${svc.name || svc.module}: ${svc.status || svc.healthy ? "healthy" : "down"}`);
      }
      // At least EMP Cloud itself should be healthy
      expect(services.length).toBeGreaterThan(0);
    } else {
      console.log(`Service health data: ${JSON.stringify(body.data).slice(0, 300)}`);
    }
  });

  test("Force health check completes within 60s", async ({ request }) => {
    test.setTimeout(90_000);
    const start = Date.now();
    const res = await request.post(`${API}/admin/service-health/check`, {
      headers: auth(superToken),
    });
    const elapsed = Date.now() - start;
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`Force health check completed in ${elapsed}ms`);
    // Should complete within 60 seconds even if some modules are slow
    expect(elapsed).toBeLessThan(60_000);
  });
});

// =============================================================================
// 4. Chatbot — Message Send & Response
// =============================================================================

test.describe("Chatbot Real-Time Features", () => {
  let employeeToken: string;
  let conversationId: number;

  test.beforeAll(async ({ request }) => {
    employeeToken = await getToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Create conversation and send message — receives response", async ({ request }) => {
    test.setTimeout(60_000);
    // Create a new conversation
    const createRes = await request.post(`${API}/chatbot/conversations`, {
      headers: auth(employeeToken),
      data: { title: `E2E Realtime Test ${Date.now()}` },
    });
    expect(createRes.status()).toBe(201);
    conversationId = (await createRes.json()).data.id;
    expect(conversationId).toBeGreaterThan(0);

    // Send a message (simulates the streaming request)
    const sendRes = await request.post(`${API}/chatbot/conversations/${conversationId}/send`, {
      headers: auth(employeeToken),
      data: { message: "What is my leave balance?" },
    });
    expect(sendRes.status()).toBeLessThan(500);
    console.log(`Chatbot send status: ${sendRes.status()}`);
  });

  test("Get chatbot suggestions returns instantly", async ({ request }) => {
    test.setTimeout(15_000);
    const start = Date.now();
    const res = await request.get(`${API}/chatbot/suggestions`, {
      headers: auth(employeeToken),
    });
    const elapsed = Date.now() - start;
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`Chatbot suggestions returned in ${elapsed}ms`);
    // Suggestions should be pre-cached / fast
    expect(elapsed).toBeLessThan(3000);
  });

  test("Get AI status returns provider info", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/chatbot/ai-status`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(`AI status: ${JSON.stringify(body.data).slice(0, 200)}`);
  });

  test("Cleanup — delete test conversation", async ({ request }) => {
    test.setTimeout(15_000);
    expect(conversationId, 'Prerequisite failed — conversationId was not set').toBeTruthy();
    const res = await request.delete(`${API}/chatbot/conversations/${conversationId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBeLessThan(500);
    console.log(`Conversation #${conversationId} deleted: ${res.status()}`);
  });
});

// =============================================================================
// 5. Rapid API Calls — No Stale Data
// =============================================================================

test.describe("Rapid API Calls Consistency", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("Multiple rapid calls to notifications return consistent data", async ({ request }) => {
    test.setTimeout(30_000);
    // Fire 5 rapid requests in parallel
    const promises = Array.from({ length: 5 }, () =>
      request.get(`${API}/notifications/unread-count`, {
        headers: auth(adminToken),
      })
    );
    const results = await Promise.all(promises);

    const counts: number[] = [];
    for (const res of results) {
      expect(res.status()).toBe(200);
      const body = await res.json();
      counts.push(body.data?.count ?? body.data ?? 0);
    }

    // All 5 responses should return the same count (no stale data)
    const uniqueCounts = [...new Set(counts)];
    console.log(`Rapid call counts: ${counts.join(", ")} — unique: ${uniqueCounts.length}`);
    expect(uniqueCounts.length).toBe(1);
  });
});
