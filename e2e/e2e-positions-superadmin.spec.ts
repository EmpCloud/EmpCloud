import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN_CREDS = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE_CREDS = { email: "arjun@technova.in", password: "Welcome@123" };
const SUPER_ADMIN_CREDS = { email: "admin@empcloud.com", password: "SuperAdmin@123" };

// =============================================================================
// Helpers
// =============================================================================

interface LoginResult {
  token: string;
  userId: number;
}

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return {
    token: body.data.tokens.access_token,
    userId: body.data.user.id,
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// =============================================================================
// 1. Position Management
// =============================================================================

test.describe("Positions", () => {
  let adminToken: string;
  let empToken: string;
  let adminUserId: number;
  let positionId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
    empToken = emp.token;
  });

  test("Create position (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/positions`, {
      headers: auth(adminToken),
      data: {
        title: `E2E Position ${Date.now()}`,
        job_description: "Test position from E2E",
        employment_type: "full_time",
        min_salary: 50000,
        max_salary: 80000,
        headcount_budget: 2,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    positionId = body.data.id;
    expect(positionId).toBeGreaterThan(0);
  });

  test("List positions (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/positions`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Get position by ID", async ({ request }) => {
    test.setTimeout(30_000);
    if (!positionId) {
      test.skip();
      return;
    }
    const res = await request.get(`${API}/positions/${positionId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(positionId);
  });

  test("Update position (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    if (!positionId) {
      test.skip();
      return;
    }
    const res = await request.put(`${API}/positions/${positionId}`, {
      headers: auth(adminToken),
      data: {
        description: "Updated description from E2E",
        max_salary: 90000,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Position hierarchy (FIXED)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/positions/hierarchy`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Assign user to position (FIXED)", async ({ request }) => {
    test.setTimeout(30_000);
    if (!positionId) {
      test.skip();
      return;
    }

    // Get an employee user to assign
    const empRes = await request.get(`${API}/employees?per_page=5`, {
      headers: auth(adminToken),
    });
    const employees = (await empRes.json()).data || [];
    if (employees.length === 0) {
      test.skip();
      return;
    }
    const targetUserId = employees[0].user_id || employees[0].id;

    const res = await request.post(`${API}/positions/${positionId}/assign`, {
      headers: auth(adminToken),
      data: {
        user_id: targetUserId,
        start_date: new Date().toISOString().slice(0, 10),
      },
    });
    // 201 on success, 400 if already assigned or validation error
    expect([201, 400]).toContain(res.status());
  });

  test("Get vacancies", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/positions/vacancies`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Position dashboard", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/positions/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Delete position (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    // Create a fresh position to delete
    const createRes = await request.post(`${API}/positions`, {
      headers: auth(adminToken),
      data: {
        title: `Delete Pos ${Date.now()}`,
        job_description: "To be deleted",
        employment_type: "full_time",
        headcount_budget: 1,
      },
    });
    expect(createRes.status()).toBe(201);
    const pid = (await createRes.json()).data.id;

    const res = await request.delete(`${API}/positions/${pid}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });
});

// =============================================================================
// 2. Super Admin Endpoints
// =============================================================================

test.describe("Super Admin", () => {
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    const sa = await loginAndGetToken(request, SUPER_ADMIN_CREDS.email, SUPER_ADMIN_CREDS.password);
    superToken = sa.token;
  });

  test("Platform overview", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/overview`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("List organizations", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/organizations`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const orgs = body.data || [];
    expect(Array.isArray(orgs)).toBe(true);
    expect(orgs.length).toBeGreaterThan(0);
  });

  test("Module analytics", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/modules`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Revenue analytics", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/revenue`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("User growth metrics", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/growth`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Service health dashboard", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/service-health`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Data sanity check", async ({ request }) => {
    test.setTimeout(60_000);
    const res = await request.get(`${API}/admin/data-sanity`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Platform info", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/platform-info`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.server).toBeDefined();
    expect(body.data.security).toBeDefined();
  });

  test("Audit logs cross-org (FIXED)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/audit`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const logs = body.data || [];
    expect(Array.isArray(logs)).toBe(true);
  });

  test("Audit logs with filters", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/audit?action=LOGIN_SUCCESS&per_page=5`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("AI config", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/ai-config`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("AI config status", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/ai-config/status`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Subscription metrics", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/subscriptions`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Recent platform activity", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/admin/activity?limit=10`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("System notifications CRUD", async ({ request }) => {
    test.setTimeout(30_000);
    // Create
    const createRes = await request.post(`${API}/admin/notifications`, {
      headers: auth(superToken),
      data: {
        title: `E2E Notification ${Date.now()}`,
        message: "Test system notification",
        target_type: "all",
        notification_type: "info",
      },
    });
    expect(createRes.status()).toBe(201);
    const nid = (await createRes.json()).data.id;

    // List
    const listRes = await request.get(`${API}/admin/notifications`, {
      headers: auth(superToken),
    });
    expect(listRes.status()).toBe(200);

    // Deactivate
    const deRes = await request.put(`${API}/admin/notifications/${nid}/deactivate`, {
      headers: auth(superToken),
    });
    expect(deRes.status()).toBe(200);
  });
});

// =============================================================================
// 3. Access Control — org_admin and employee blocked from super admin endpoints
// =============================================================================

test.describe("Access Control", () => {
  let adminToken: string;
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
    empToken = emp.token;
  });

  const superAdminEndpoints = [
    { method: "GET", path: "admin/overview" },
    { method: "GET", path: "admin/organizations" },
    { method: "GET", path: "admin/modules" },
    { method: "GET", path: "admin/revenue" },
    { method: "GET", path: "admin/growth" },
    { method: "GET", path: "admin/service-health" },
    { method: "GET", path: "admin/data-sanity" },
    { method: "GET", path: "admin/platform-info" },
    { method: "GET", path: "admin/audit" },
    { method: "GET", path: "admin/ai-config" },
  ];

  test("Org admin blocked from super admin endpoints (403)", async ({ request }) => {
    test.setTimeout(60_000);
    for (const ep of superAdminEndpoints) {
      const res = await request.get(`${API}/${ep.path}`, {
        headers: auth(adminToken),
      });
      expect(res.status(), `${ep.method} ${ep.path} should be 403 for org_admin`).toBe(403);
    }
  });

  test("Employee blocked from super admin endpoints (403)", async ({ request }) => {
    test.setTimeout(60_000);
    for (const ep of superAdminEndpoints) {
      const res = await request.get(`${API}/${ep.path}`, {
        headers: auth(empToken),
      });
      expect(res.status(), `${ep.method} ${ep.path} should be 403 for employee`).toBe(403);
    }
  });

  test("Employee blocked from HR position management (403)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/positions`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot create survey (403)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/surveys`, {
      headers: auth(empToken),
      data: {
        title: "Should fail",
        description: "Unauthorized",
        type: "general",
        questions: [{ question_text: "Q?", question_type: "text", is_required: true }],
      },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot create event (403)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/events`, {
      headers: auth(empToken),
      data: {
        title: "Should fail",
        description: "Unauthorized",
        event_type: "meeting",
        start_date: new Date().toISOString(),
        end_date: new Date().toISOString(),
      },
    });
    expect(res.status()).toBe(403);
  });
});
