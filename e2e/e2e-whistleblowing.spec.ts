import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN_CREDS = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE_CREDS = { email: "arjun@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };

const RUN = Date.now().toString().slice(-6);

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
// 1. Whistleblowing — Submit, Lookup, HR Dashboard, Lifecycle
// =============================================================================

test.describe("Whistleblowing", () => {
  let adminToken: string;
  let empToken: string;
  let adminUserId: number;
  let empUserId: number;
  let reportId: number;
  let caseNumber: string;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
    adminUserId = admin.userId;

    const emp = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  test("Employee submits an anonymous report", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/whistleblowing/reports`, {
      headers: auth(empToken),
      data: {
        subject: `E2E Anonymous Report ${RUN}`,
        description: "Witnessed policy violation during office hours. Details follow.",
        category: "fraud",
        severity: "high",
        is_anonymous: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(body.data).toHaveProperty("case_number");
    reportId = body.data.id;
    caseNumber = body.data.case_number;
    expect(caseNumber).toBeTruthy();
  });

  test("Employee submits a named report via alias endpoint", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/whistleblowing`, {
      headers: auth(empToken),
      data: {
        subject: `E2E Named Report ${RUN}`,
        description: "Reporting a safety concern in the warehouse area.",
        category: "safety_violation",
        severity: "medium",
        is_anonymous: false,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
  });

  test("Employee can lookup report by case number", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/whistleblowing/reports/lookup/${caseNumber}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("case_number", caseNumber);
  });

  test("Employee can view their own reports", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/whistleblowing/reports/my`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("HR can view dashboard stats", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/whistleblowing/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Dashboard should have stat fields
    expect(body.data).toBeDefined();
  });

  test("HR can list all reports", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/whistleblowing/reports`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("HR can view report detail", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/whistleblowing/reports/${reportId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id", reportId);
    expect(body.data).toHaveProperty("case_number", caseNumber);
  });

  test("HR can assign investigator", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/whistleblowing/reports/${reportId}/assign`, {
      headers: auth(adminToken),
      data: {
        investigator_id: adminUserId,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can add update to a report", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/whistleblowing/reports/${reportId}/update`, {
      headers: auth(adminToken),
      data: {
        content: `E2E update note ${RUN}: Initial investigation started.`,
        update_type: "note",
        is_visible_to_reporter: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
  });

  test("HR can change report status to under_investigation", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.put(`${API}/whistleblowing/reports/${reportId}/status`, {
      headers: auth(adminToken),
      data: {
        status: "under_investigation",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can escalate a report", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/whistleblowing/reports/${reportId}/escalate`, {
      headers: auth(adminToken),
      data: {
        escalated_to: "Legal Department / External Counsel",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can change report status to resolved", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.put(`${API}/whistleblowing/reports/${reportId}/status`, {
      headers: auth(adminToken),
      data: {
        status: "resolved",
        resolution: "Investigation complete. Corrective measures implemented.",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot access HR reports list (RBAC)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/whistleblowing/reports`, {
      headers: auth(empToken),
    });
    // Should be 403 Forbidden for non-HR
    expect(res.status()).toBe(403);
  });
});
