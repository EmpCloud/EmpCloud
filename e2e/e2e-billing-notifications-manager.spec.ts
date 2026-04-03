import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE = { email: "priya@technova.in", password: "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: "SuperAdmin@123" };

// =============================================================================
// Helpers
// =============================================================================

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  // Retry with backoff to handle rate limiting when multiple spec files run in parallel
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await request.post(`${API}/auth/login`, {
      data: { email, password },
    });
    if (res.status() === 200) {
      const body = await res.json();
      return body.data.tokens.access_token;
    }
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      continue;
    }
    // Final attempt — fail with details including response body
    const errorBody = await res.text().catch(() => "no body");
    throw new Error(`Login failed for ${email} after ${attempt} attempts: status=${res.status()} body=${errorBody}`);
  }
  throw new Error("Login failed after retries");
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// =============================================================================
// Single login, all tests share tokens
// =============================================================================

let adminToken: string;
let employeeToken: string;

test.beforeAll(async ({ request }) => {
  adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
  employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
});

// =============================================================================
// 1. Modules List
// =============================================================================

test.describe("Modules", () => {
  test("Admin can list all modules", async ({ request }) => {
    const res = await request.get(`${API}/modules`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("Employee can list modules (marketplace access)", async ({ request }) => {
    const res = await request.get(`${API}/modules`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Module list does not leak webhook_secret to employee", async ({ request }) => {
    const res = await request.get(`${API}/modules`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const mod of body.data) {
      expect(mod).not.toHaveProperty("webhook_secret");
    }
  });

  test("Can get a single module by ID", async ({ request }) => {
    // First get the list to get a valid ID
    const listRes = await request.get(`${API}/modules`, {
      headers: auth(adminToken),
    });
    const modules = (await listRes.json()).data;
    if (modules.length > 0) {
      const moduleId = modules[0].id;
      const res = await request.get(`${API}/modules/${moduleId}`, {
        headers: auth(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id", moduleId);
    }
  });

  test("Can get module features", async ({ request }) => {
    const listRes = await request.get(`${API}/modules`, {
      headers: auth(adminToken),
    });
    const modules = (await listRes.json()).data;
    if (modules.length > 0) {
      const moduleId = modules[0].id;
      const res = await request.get(`${API}/modules/${moduleId}/features`, {
        headers: auth(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("Unauthenticated request to modules is rejected", async ({ request }) => {
    const res = await request.get(`${API}/modules`);
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 2. Subscriptions (Admin Only)
// =============================================================================

test.describe("Subscriptions", () => {
  test("Admin can list subscriptions", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Admin can get billing summary", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-summary`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can get billing status", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-status`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot list subscriptions (403)", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot get billing summary (403)", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-summary`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 3. Billing Invoices + Gateways
// =============================================================================

test.describe("Billing", () => {
  test("Admin can list invoices", async ({ request }) => {
    const res = await request.get(`${API}/billing/invoices`, {
      headers: auth(adminToken),
    });
    // 200 or 502 if billing service is down
    expect([200, 502]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("Admin can list payments", async ({ request }) => {
    const res = await request.get(`${API}/billing/payments`, {
      headers: auth(adminToken),
    });
    expect([200, 502]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("Admin can get billing summary", async ({ request }) => {
    const res = await request.get(`${API}/billing/summary`, {
      headers: auth(adminToken),
    });
    expect([200, 502]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("Admin can list payment gateways", async ({ request }) => {
    const res = await request.get(`${API}/billing/gateways`, {
      headers: auth(adminToken),
    });
    expect([200, 502]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("Employee cannot list invoices (403)", async ({ request }) => {
    const res = await request.get(`${API}/billing/invoices`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot list payments (403)", async ({ request }) => {
    const res = await request.get(`${API}/billing/payments`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot list gateways (403)", async ({ request }) => {
    const res = await request.get(`${API}/billing/gateways`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 4. Notifications
// =============================================================================

test.describe("Notifications", () => {
  test("Admin can list notifications", async ({ request }) => {
    const res = await request.get(`${API}/notifications`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Employee can list notifications", async ({ request }) => {
    const res = await request.get(`${API}/notifications`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can get unread count", async ({ request }) => {
    const res = await request.get(`${API}/notifications/unread-count`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("count");
    expect(typeof body.data.count).toBe("number");
  });

  test("Employee can get unread count", async ({ request }) => {
    const res = await request.get(`${API}/notifications/unread-count`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("count");
  });

  test("Admin can mark a notification as read", async ({ request }) => {
    // Get notifications first to find one to mark
    const listRes = await request.get(`${API}/notifications`, {
      headers: auth(adminToken),
    });
    const notifications = (await listRes.json()).data;

    if (notifications.length > 0) {
      const notifId = notifications[0].id;
      const res = await request.put(`${API}/notifications/${notifId}/read`, {
        headers: auth(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("Admin can mark all notifications as read", async ({ request }) => {
    const res = await request.put(`${API}/notifications/read-all`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can mark all notifications as read", async ({ request }) => {
    const res = await request.put(`${API}/notifications/read-all`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Unauthenticated request to notifications is rejected", async ({ request }) => {
    const res = await request.get(`${API}/notifications`);
    expect(res.status()).toBe(401);
  });

  test("Unread count returns 0 after marking all read", async ({ request }) => {
    // Mark all as read first
    await request.put(`${API}/notifications/read-all`, {
      headers: auth(adminToken),
    });

    const res = await request.get(`${API}/notifications/unread-count`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.count).toBe(0);
  });
});

// =============================================================================
// 5. Manager Dashboard (Admin -> 200, Employee -> 403)
// =============================================================================

test.describe("Manager Dashboard", () => {
  test("Admin can access manager dashboard", async ({ request }) => {
    const res = await request.get(`${API}/manager/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can access manager team", async ({ request }) => {
    const res = await request.get(`${API}/manager/team`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can access manager attendance view", async ({ request }) => {
    const res = await request.get(`${API}/manager/attendance`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can access manager pending leaves", async ({ request }) => {
    const res = await request.get(`${API}/manager/leaves/pending`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can access manager leave calendar", async ({ request }) => {
    const res = await request.get(`${API}/manager/leaves/calendar`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot access manager dashboard (403)", async ({ request }) => {
    const res = await request.get(`${API}/manager/dashboard`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot access manager team (403)", async ({ request }) => {
    const res = await request.get(`${API}/manager/team`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot access manager attendance (403)", async ({ request }) => {
    const res = await request.get(`${API}/manager/attendance`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot access manager pending leaves (403)", async ({ request }) => {
    const res = await request.get(`${API}/manager/leaves/pending`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Unauthenticated request to manager endpoints is rejected", async ({ request }) => {
    const res = await request.get(`${API}/manager/dashboard`);
    expect(res.status()).toBe(401);
  });
});
