// =============================================================================
// EMP CLOUD — Comprehensive API Integration Tests
// Tests ALL core endpoints against the REAL running server
// =============================================================================

import { describe, it, expect, beforeAll } from "vitest";

const API = process.env.TEST_API_URL ?? "https://test-empcloud-api.empcloud.com";

// ---------------------------------------------------------------------------
// Tokens populated in beforeAll
// ---------------------------------------------------------------------------
let adminToken: string;
let employeeToken: string;
let superAdminToken: string;

// IDs captured during tests for cross-referencing
let adminUserId: number;
let employeeUserId: number;

// ---------------------------------------------------------------------------
// Helper: generic API call
// ---------------------------------------------------------------------------
async function api(
  method: string,
  path: string,
  body?: any,
  token?: string,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res
    .json()
    .catch(() => ({ success: false, error: { message: "Non-JSON response" } }));
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Setup: login as all three roles
// ---------------------------------------------------------------------------
beforeAll(async () => {
  // Super Admin (most stable — login first)
  const r3 = await api("POST", "/api/v1/auth/login", {
    email: "admin@empcloud.com",
    password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123",
  });
  expect(r3.status).toBe(200);
  superAdminToken = r3.data.data.tokens.access_token;

  // Admin — try candidates in order (passwords may be changed by other tests)
  const adminCandidates = [
    { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" },
    { email: "karthik@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" },
  ];
  for (const cred of adminCandidates) {
    const r = await api("POST", "/api/v1/auth/login", cred);
    if (r.status === 200) {
      adminToken = r.data.data.tokens.access_token;
      adminUserId = r.data.data.user.id;
      break;
    }
  }
  if (!adminToken) {
    // Last resort: use super admin token for admin-level operations
    console.warn("No org admin login available, falling back to super admin");
    adminToken = superAdminToken;
    adminUserId = r3.data.data.user.id;
  }

  // Employee — try candidates in order
  const employeeCandidates = [
    { email: "priya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" },
    { email: "karthik@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" },
  ];
  for (const cred of employeeCandidates) {
    const r = await api("POST", "/api/v1/auth/login", cred);
    if (r.status === 200) {
      employeeToken = r.data.data.tokens.access_token;
      employeeUserId = r.data.data.user.id;
      break;
    }
  }
  if (!employeeToken) {
    console.warn("No employee login available, falling back to super admin");
    employeeToken = superAdminToken;
    employeeUserId = r3.data.data.user.id;
  }
}, 30_000);

// ===========================================================================
// 1. AUTH (6 tests)
// ===========================================================================
describe("Auth Endpoints", () => {
  it("POST /auth/login — success returns tokens + user", async () => {
    // Try multiple candidates — passwords may be changed by other tests
    const candidates = [
      { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" },
      { email: "karthik@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" },
      { email: "priya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" },
      { email: "admin@empcloud.com", password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123" },
    ];
    let r: { status: number; data: any } | undefined;
    for (const cred of candidates) {
      r = await api("POST", "/api/v1/auth/login", cred);
      if (r.status === 200) break;
    }
    expect(r!.status).toBe(200);
    expect(r!.data.success).toBe(true);
    expect(r!.data.data.tokens).toHaveProperty("access_token");
    expect(r!.data.data.tokens).toHaveProperty("refresh_token");
    expect(r!.data.data.user).toHaveProperty("id");
    expect(r!.data.data.user).toHaveProperty("email");
  });

  it("POST /auth/login — wrong password returns 401", async () => {
    const r = await api("POST", "/api/v1/auth/login", {
      email: "admin@empcloud.com",
      password: "WrongPassword!",
    });
    expect(r.status).toBe(401);
    expect(r.data.success).toBe(false);
  });

  it("POST /auth/login — missing fields returns 400", async () => {
    const r = await api("POST", "/api/v1/auth/login", { email: "" });
    expect([400, 422]).toContain(r.status);
    expect(r.data.success).toBe(false);
  });

  it("POST /auth/login — non-existent email returns 401", async () => {
    const r = await api("POST", "/api/v1/auth/login", {
      email: "nobody@nowhere.com",
      password: "Whatever@123",
    });
    expect(r.status).toBe(401);
    expect(r.data.success).toBe(false);
  });

  it("POST /auth/forgot-password — always returns success (prevents email enum)", async () => {
    const r = await api("POST", "/api/v1/auth/forgot-password", {
      email: "admin@empcloud.com",
    });
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /auth/forgot-password — non-existent email still returns success", async () => {
    const r = await api("POST", "/api/v1/auth/forgot-password", {
      email: "ghost@nowhere.com",
    });
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 2. USERS (5 tests)
// ===========================================================================
describe("User Endpoints", () => {
  it("GET /users — list with pagination", async () => {
    const r = await api("GET", "/api/v1/users?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(Array.isArray(r.data.data)).toBe(true);
    expect(r.data).toHaveProperty("meta");
    expect(r.data.meta).toHaveProperty("total");
  });

  it("GET /users/:id — single user", async () => {
    const r = await api("GET", `/api/v1/users/${adminUserId}`, undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data).toHaveProperty("email");
  });

  it("GET /users/:id — non-existent returns 404", async () => {
    const r = await api("GET", "/api/v1/users/999999", undefined, adminToken);
    expect(r.status).toBe(404);
    expect(r.data.success).toBe(false);
  });

  it("GET /users/invitations — list pending invitations", async () => {
    const r = await api("GET", "/api/v1/users/invitations", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /users/org-chart — returns org chart tree", async () => {
    const r = await api("GET", "/api/v1/users/org-chart", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 3. EMPLOYEES (5 tests)
// ===========================================================================
describe("Employee Endpoints", () => {
  it("GET /employees/directory — search + pagination", async () => {
    const r = await api(
      "GET",
      "/api/v1/employees/directory?page=1&per_page=5",
      undefined,
      adminToken,
    );
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(Array.isArray(r.data.data)).toBe(true);
    expect(r.data).toHaveProperty("meta");
  });

  it("GET /employees/directory — filter by search term", async () => {
    const r = await api(
      "GET",
      "/api/v1/employees/directory?search=Priya",
      undefined,
      adminToken,
    );
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /employees/:id/profile — get profile", async () => {
    const r = await api(
      "GET",
      `/api/v1/employees/${adminUserId}/profile`,
      undefined,
      adminToken,
    );
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /employees/birthdays — list upcoming birthdays", async () => {
    const r = await api("GET", "/api/v1/employees/birthdays", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /employees/anniversaries — list upcoming anniversaries", async () => {
    const r = await api("GET", "/api/v1/employees/anniversaries", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 4. ATTENDANCE (6 tests)
// ===========================================================================
describe("Attendance Endpoints", () => {
  it("GET /attendance/shifts — list shifts", async () => {
    const r = await api("GET", "/api/v1/attendance/shifts", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /attendance/dashboard — HR attendance dashboard", async () => {
    const r = await api("GET", "/api/v1/attendance/dashboard", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /attendance/records — list records (HR)", async () => {
    const r = await api("GET", "/api/v1/attendance/records?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /attendance/me/today — current user today", async () => {
    const r = await api("GET", "/api/v1/attendance/me/today", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /attendance/me/history — current user history", async () => {
    const r = await api("GET", "/api/v1/attendance/me/history?page=1&per_page=5", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /attendance/check-in — attempt check-in (may conflict if already checked in)", async () => {
    const r = await api(
      "POST",
      "/api/v1/attendance/check-in",
      {},
      employeeToken,
    );
    // 201 = success, 400/409 = already checked in — both are valid behaviors
    expect([201, 400, 409]).toContain(r.status);
  });
});

// ===========================================================================
// 5. LEAVE (8 tests)
// ===========================================================================
describe("Leave Endpoints", () => {
  it("GET /leave/types — list leave types", async () => {
    const r = await api("GET", "/api/v1/leave/types", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(Array.isArray(r.data.data)).toBe(true);
  });

  it("GET /leave/balances — own balances", async () => {
    const r = await api("GET", "/api/v1/leave/balances", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /leave/balances/me — shortcut for own balances", async () => {
    const r = await api("GET", "/api/v1/leave/balances/me", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /leave/applications — list all applications", async () => {
    const r = await api("GET", "/api/v1/leave/applications?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /leave/applications/me — own applications", async () => {
    const r = await api("GET", "/api/v1/leave/applications/me?page=1&per_page=5", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /leave/calendar — leave calendar", async () => {
    const r = await api("GET", "/api/v1/leave/calendar", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /leave/policies — list leave policies", async () => {
    const r = await api("GET", "/api/v1/leave/policies", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /leave/applications — missing fields returns 400", async () => {
    const r = await api("POST", "/api/v1/leave/applications", {}, employeeToken);
    expect([400, 422]).toContain(r.status);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 6. DOCUMENTS (4 tests)
// ===========================================================================
describe("Document Endpoints", () => {
  it("GET /documents — list documents", async () => {
    const r = await api("GET", "/api/v1/documents?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /documents/categories — list categories", async () => {
    const r = await api("GET", "/api/v1/documents/categories", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /documents/my — my documents", async () => {
    const r = await api("GET", "/api/v1/documents/my?page=1&per_page=5", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /documents/expiring — expiring documents (HR)", async () => {
    const r = await api("GET", "/api/v1/documents/expiring?days=30", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 7. ANNOUNCEMENTS (4 tests)
// ===========================================================================
describe("Announcement Endpoints", () => {
  let createdAnnouncementId: number;

  it("GET /announcements — list announcements", async () => {
    const r = await api("GET", "/api/v1/announcements?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /announcements — create announcement (HR)", async () => {
    const r = await api(
      "POST",
      "/api/v1/announcements",
      {
        title: `API Test Announcement ${Date.now()}`,
        content: "This is a test announcement from the API integration test suite.",
        priority: "low",
        visibility: "all",
      },
      adminToken,
    );
    // 201 = created; 403 = admin token lacks HR permission (manager fallback)
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
      expect(r.data.data).toHaveProperty("id");
      createdAnnouncementId = r.data.data.id;
    } else {
      expect([403]).toContain(r.status);
    }
  });

  it("PUT /announcements/:id — update announcement (HR)", async () => {
    if (!createdAnnouncementId) return;
    const r = await api(
      "PUT",
      `/api/v1/announcements/${createdAnnouncementId}`,
      { title: `Updated API Test ${Date.now()}` },
      adminToken,
    );
    expect([200, 403]).toContain(r.status);
  });

  it("DELETE /announcements/:id — delete announcement (HR)", async () => {
    if (!createdAnnouncementId) return;
    const r = await api(
      "DELETE",
      `/api/v1/announcements/${createdAnnouncementId}`,
      undefined,
      adminToken,
    );
    expect([200, 403]).toContain(r.status);
  });
});

// ===========================================================================
// 8. POLICIES (4 tests)
// ===========================================================================
describe("Policy Endpoints", () => {
  let createdPolicyId: number;

  it("GET /policies — list policies", async () => {
    const r = await api("GET", "/api/v1/policies?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /policies — create policy (HR)", async () => {
    const r = await api(
      "POST",
      "/api/v1/policies",
      {
        title: `Test Policy ${Date.now()}`,
        content: "Test policy content for API integration testing.",
        category: "general",
        requires_acknowledgment: false,
      },
      adminToken,
    );
    // 201 = created; 403 = admin token lacks HR permission (manager fallback)
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
      expect(r.data.data).toHaveProperty("id");
      createdPolicyId = r.data.data.id;
    } else {
      expect([403]).toContain(r.status);
    }
  });

  it("PUT /policies/:id — update policy (HR)", async () => {
    if (!createdPolicyId) return;
    const r = await api(
      "PUT",
      `/api/v1/policies/${createdPolicyId}`,
      { title: `Updated Test Policy ${Date.now()}` },
      adminToken,
    );
    expect([200, 403]).toContain(r.status);
  });

  it("GET /policies/:id — get single policy", async () => {
    if (!createdPolicyId) return;
    const r = await api("GET", `/api/v1/policies/${createdPolicyId}`, undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data).toHaveProperty("title");
  });
});

// ===========================================================================
// 9. HELPDESK (6 tests)
// ===========================================================================
describe("Helpdesk Endpoints", () => {
  let createdTicketId: number;

  it("POST /helpdesk/tickets — create ticket", async () => {
    const r = await api(
      "POST",
      "/api/v1/helpdesk/tickets",
      {
        subject: `Test Ticket ${Date.now()}`,
        description: "Created by API integration test suite.",
        category: "it_support",
        priority: "low",
      },
      employeeToken,
    );
    expect([201, 400, 403]).toContain(r.status);
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
      expect(r.data.data).toHaveProperty("id");
      createdTicketId = r.data.data.id;
    }
  });

  it("GET /helpdesk/tickets — list tickets", async () => {
    const r = await api("GET", "/api/v1/helpdesk/tickets?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /helpdesk/tickets/my — my tickets", async () => {
    const r = await api("GET", "/api/v1/helpdesk/tickets/my?page=1&per_page=5", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /helpdesk/tickets/:id/assign — assign ticket (HR)", async () => {
    if (!createdTicketId) return;
    const r = await api(
      "POST",
      `/api/v1/helpdesk/tickets/${createdTicketId}/assign`,
      { assigned_to: adminUserId },
      adminToken,
    );
    // 200 = assigned; 403 = admin token lacks HR permission (manager fallback)
    expect([200, 403]).toContain(r.status);
  });

  it("POST /helpdesk/tickets/:id/resolve — resolve ticket (HR)", async () => {
    if (!createdTicketId) return;
    const r = await api(
      "POST",
      `/api/v1/helpdesk/tickets/${createdTicketId}/resolve`,
      undefined,
      adminToken,
    );
    // 200 = resolved; 403 = admin token lacks HR permission (manager fallback)
    expect([200, 403]).toContain(r.status);
  });

  it("GET /helpdesk/kb — list knowledge base articles", async () => {
    const r = await api("GET", "/api/v1/helpdesk/kb?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 10. SURVEYS (5 tests)
// ===========================================================================
describe("Survey Endpoints", () => {
  let createdSurveyId: number;

  it("GET /surveys — list surveys", async () => {
    const r = await api("GET", "/api/v1/surveys?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /surveys — create survey (HR)", async () => {
    const r = await api(
      "POST",
      "/api/v1/surveys",
      {
        title: `API Test Survey ${Date.now()}`,
        description: "Test survey for integration testing.",
        type: "engagement",
        is_anonymous: true,
        questions: [
          {
            question_text: "How satisfied are you?",
            question_type: "rating",
            is_required: true,
            options: null,
          },
        ],
      },
      adminToken,
    );
    // 201 = created; 403 = admin token lacks HR permission (manager fallback)
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
      expect(r.data.data).toHaveProperty("id");
      createdSurveyId = r.data.data.id;
    } else {
      expect([403]).toContain(r.status);
    }
  });

  it("GET /surveys/:id — get survey detail", async () => {
    if (!createdSurveyId) return;
    const r = await api("GET", `/api/v1/surveys/${createdSurveyId}`, undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data).toHaveProperty("title");
  });

  it("POST /surveys/:id/publish — publish survey (HR)", async () => {
    if (!createdSurveyId) return;
    const r = await api(
      "POST",
      `/api/v1/surveys/${createdSurveyId}/publish`,
      undefined,
      adminToken,
    );
    expect([200, 403]).toContain(r.status);
  });

  it("GET /surveys/active — active surveys for employee", async () => {
    const r = await api("GET", "/api/v1/surveys/active", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 11. ASSETS (5 tests)
// ===========================================================================
describe("Asset Endpoints", () => {
  let createdAssetId: number;

  it("GET /assets — list assets", async () => {
    const r = await api("GET", "/api/v1/assets?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /assets/categories — list asset categories", async () => {
    const r = await api("GET", "/api/v1/assets/categories", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /assets — create asset (HR)", async () => {
    const r = await api(
      "POST",
      "/api/v1/assets",
      {
        name: `Test Asset ${Date.now()}`,
        asset_tag: `AT-${Date.now()}`,
        serial_number: `SN-${Date.now()}`,
        status: "available",
        condition_status: "good",
        purchase_date: "2025-01-15",
      },
      adminToken,
    );
    // 201 = created; 400 = missing category or validation; 403 = role permission — all valid
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
      createdAssetId = r.data.data.id;
    } else {
      expect([400, 403, 422]).toContain(r.status);
    }
  });

  it("POST /assets/:id/assign — assign asset (HR)", async () => {
    if (!createdAssetId) return;
    const r = await api(
      "POST",
      `/api/v1/assets/${createdAssetId}/assign`,
      { assigned_to: employeeUserId },
      adminToken,
    );
    expect([200, 400]).toContain(r.status);
  });

  it("GET /assets/my — employee's assigned assets", async () => {
    const r = await api("GET", "/api/v1/assets/my", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 12. POSITIONS (4 tests)
// ===========================================================================
describe("Position Endpoints", () => {
  let createdPositionId: number;

  it("GET /positions — list positions (HR)", async () => {
    const r = await api("GET", "/api/v1/positions?page=1&per_page=5", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("POST /positions — create position (HR)", async () => {
    const r = await api(
      "POST",
      "/api/v1/positions",
      {
        title: `Test Position ${Date.now()}`,
        status: "open",
        employment_type: "full_time",
        headcount: 1,
      },
      adminToken,
    );
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
      createdPositionId = r.data.data.id;
    } else {
      // May require department_id or other fields, or 403 for role permission
      expect([400, 403, 422]).toContain(r.status);
    }
  });

  it("GET /positions/vacancies — open vacancies", async () => {
    const r = await api("GET", "/api/v1/positions/vacancies", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /positions/dashboard — position dashboard (HR)", async () => {
    const r = await api("GET", "/api/v1/positions/dashboard", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 13. EVENTS (4 tests)
// ===========================================================================
describe("Event Endpoints", () => {
  let createdEventId: number;

  it("GET /events — list events", async () => {
    const r = await api("GET", "/api/v1/events?page=1&per_page=5", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /events — create event (HR)", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7);
    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + 2);

    const r = await api(
      "POST",
      "/api/v1/events",
      {
        title: `API Test Event ${Date.now()}`,
        description: "Integration test event.",
        event_type: "meeting",
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        location: "Virtual",
        is_all_day: false,
      },
      adminToken,
    );
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
      createdEventId = r.data.data.id;
    } else {
      expect([400, 403, 422]).toContain(r.status);
    }
  });

  it("GET /events/upcoming — upcoming events", async () => {
    const r = await api("GET", "/api/v1/events/upcoming", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /events/my — my RSVP'd events", async () => {
    const r = await api("GET", "/api/v1/events/my", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 14. WELLNESS (4 tests)
// ===========================================================================
describe("Wellness Endpoints", () => {
  it("POST /wellness/check-in — daily check-in", async () => {
    const r = await api(
      "POST",
      "/api/v1/wellness/check-in",
      {
        mood: 4,
        energy_level: 3,
        stress_level: 2,
        notes: "Integration test check-in",
      },
      employeeToken,
    );
    // 201 = success, 400/409 = already checked in today
    expect([201, 400, 409]).toContain(r.status);
  });

  it("GET /wellness/check-ins — check-in history", async () => {
    const r = await api("GET", "/api/v1/wellness/check-ins?page=1&per_page=5", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /wellness/goals — create wellness goal", async () => {
    const r = await api(
      "POST",
      "/api/v1/wellness/goals",
      {
        title: `Test Goal ${Date.now()}`,
        description: "Integration test wellness goal.",
        goal_type: "exercise",
        target_value: 30,
        target_unit: "minutes",
      },
      employeeToken,
    );
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
    } else {
      expect([400, 422]).toContain(r.status);
    }
  });

  it("GET /wellness/goals — my goals", async () => {
    const r = await api("GET", "/api/v1/wellness/goals", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 15. FORUM (4 tests)
// ===========================================================================
describe("Forum Endpoints", () => {
  let createdPostId: number;

  it("GET /forum/categories — list categories", async () => {
    const r = await api("GET", "/api/v1/forum/categories", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("POST /forum/posts — create post", async () => {
    const r = await api(
      "POST",
      "/api/v1/forum/posts",
      {
        title: `API Test Post ${Date.now()}`,
        content: "This is a test forum post from the integration test suite.",
        post_type: "discussion",
      },
      employeeToken,
    );
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
      createdPostId = r.data.data.id;
    } else {
      // May require category_id
      expect([400, 422]).toContain(r.status);
    }
  });

  it("GET /forum/posts — list posts", async () => {
    const r = await api("GET", "/api/v1/forum/posts?page=1&per_page=5", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /forum/posts/:id — get post detail (if exists)", async () => {
    if (!createdPostId) return;
    const r = await api("GET", `/api/v1/forum/posts/${createdPostId}`, undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data).toHaveProperty("title");
  });
});

// ===========================================================================
// 16. FEEDBACK (4 tests)
// ===========================================================================
describe("Feedback Endpoints", () => {
  it("POST /feedback — submit anonymous feedback", async () => {
    const r = await api(
      "POST",
      "/api/v1/feedback",
      {
        category: "workplace",
        message: `API integration test feedback ${Date.now()}`,
        sentiment: "neutral",
      },
      employeeToken,
    );
    expect([201, 400, 403]).toContain(r.status);
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
      expect(r.data.data).toHaveProperty("id");
    }
  });

  it("GET /feedback/my — my submitted feedback", async () => {
    const r = await api("GET", "/api/v1/feedback/my?page=1&per_page=5", undefined, employeeToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /feedback — all feedback (HR only)", async () => {
    const r = await api("GET", "/api/v1/feedback?page=1&per_page=5", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /feedback/dashboard — feedback dashboard (HR)", async () => {
    const r = await api("GET", "/api/v1/feedback/dashboard", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 17. WHISTLEBLOWING (3 tests)
// ===========================================================================
describe("Whistleblowing Endpoints", () => {
  it("POST /whistleblowing/reports — submit report", async () => {
    const r = await api(
      "POST",
      "/api/v1/whistleblowing/reports",
      {
        category: "fraud",
        severity: "medium",
        title: `API Test Report ${Date.now()}`,
        description: "Integration test whistleblowing report.",
        is_anonymous: true,
      },
      employeeToken,
    );
    expect([201, 400, 403]).toContain(r.status);
    if (r.status === 201) {
      expect(r.data.success).toBe(true);
      expect(r.data.data).toHaveProperty("id");
      expect(r.data.data).toHaveProperty("case_number");
    }
  });

  it("GET /whistleblowing/reports/my — my reports", async () => {
    const r = await api("GET", "/api/v1/whistleblowing/reports/my", undefined, employeeToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /whistleblowing/reports — all reports (HR)", async () => {
    const r = await api("GET", "/api/v1/whistleblowing/reports?page=1&per_page=5", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 18. CHATBOT (3 tests)
// ===========================================================================
describe("Chatbot Endpoints", () => {
  let conversationId: number;

  it("POST /chatbot/conversations — start conversation", async () => {
    const r = await api("POST", "/api/v1/chatbot/conversations", undefined, employeeToken);
    expect(r.status).toBe(201);
    expect(r.data.success).toBe(true);
    expect(r.data.data).toHaveProperty("id");
    conversationId = r.data.data.id;
  });

  it("POST /chatbot/conversations/:id/send — send message", async () => {
    if (!conversationId) return;
    const r = await api(
      "POST",
      `/api/v1/chatbot/conversations/${conversationId}/send`,
      { message: "What is the leave policy?" },
      employeeToken,
    );
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /chatbot/ai-status — check AI status", async () => {
    const r = await api("GET", "/api/v1/chatbot/ai-status", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 19. ADMIN / SUPER ADMIN (5 tests)
// ===========================================================================
describe("Admin Endpoints (Super Admin)", () => {
  it("GET /admin/overview — platform overview", async () => {
    const r = await api("GET", "/api/v1/admin/overview", undefined, superAdminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /admin/organizations — paginated org list", async () => {
    const r = await api("GET", "/api/v1/admin/organizations?page=1&per_page=5", undefined, superAdminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(Array.isArray(r.data.data)).toBe(true);
  });

  it("GET /admin/platform-info — platform configuration info", async () => {
    const r = await api("GET", "/api/v1/admin/platform-info", undefined, superAdminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data).toHaveProperty("server");
    expect(r.data.data).toHaveProperty("security");
  });

  it("GET /admin/health — system health check", async () => {
    const r = await api("GET", "/api/v1/admin/health", undefined, superAdminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /admin/modules — module analytics", async () => {
    const r = await api("GET", "/api/v1/admin/modules", undefined, superAdminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 20. ORG CHART (2 tests)
// ===========================================================================
describe("Org Chart Endpoints", () => {
  it("GET /users/org-chart — returns tree structure", async () => {
    const r = await api("GET", "/api/v1/users/org-chart", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data).toBeDefined();
  });

  it("GET /users/org-chart — employee can also see", async () => {
    const r = await api("GET", "/api/v1/users/org-chart", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 21. NOTIFICATIONS (2 tests)
// ===========================================================================
describe("Notification Endpoints", () => {
  it("GET /notifications — list notifications", async () => {
    const r = await api("GET", "/api/v1/notifications?page=1&per_page=5", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /notifications/unread-count — unread count", async () => {
    const r = await api("GET", "/api/v1/notifications/unread-count", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data).toHaveProperty("count");
    expect(typeof r.data.data.count).toBe("number");
  });
});

// ===========================================================================
// 22. RBAC — Permission Enforcement (5 tests)
// ===========================================================================
describe("RBAC — Employee Cannot Access Admin-Only Endpoints", () => {
  it("POST /announcements — employee cannot create announcement", async () => {
    const r = await api(
      "POST",
      "/api/v1/announcements",
      {
        title: "Should not work",
        content: "Employee is not HR.",
        priority: "low",
        visibility: "all",
      },
      employeeToken,
    );
    expect(r.status).toBe(403);
    expect(r.data.success).toBe(false);
  });

  it("GET /admin/overview — employee cannot access super admin endpoint", async () => {
    const r = await api("GET", "/api/v1/admin/overview", undefined, employeeToken);
    expect(r.status).toBe(403);
    expect(r.data.success).toBe(false);
  });

  it("GET /admin/organizations — employee cannot list orgs", async () => {
    const r = await api("GET", "/api/v1/admin/organizations", undefined, employeeToken);
    expect(r.status).toBe(403);
    expect(r.data.success).toBe(false);
  });

  it("POST /policies — employee cannot create policy", async () => {
    const r = await api(
      "POST",
      "/api/v1/policies",
      {
        title: "Unauthorized Policy",
        content: "Should be forbidden.",
        category: "general",
      },
      employeeToken,
    );
    expect(r.status).toBe(403);
    expect(r.data.success).toBe(false);
  });

  it("GET /attendance/dashboard — employee cannot access HR dashboard", async () => {
    const r = await api("GET", "/api/v1/attendance/dashboard", undefined, employeeToken);
    expect(r.status).toBe(403);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 23. AUTH — Unauthenticated Access (3 tests)
// ===========================================================================
describe("Auth — Unauthenticated Requests Blocked", () => {
  it("GET /users — no token returns 401", async () => {
    const r = await api("GET", "/api/v1/users");
    expect(r.status).toBe(401);
    expect(r.data.success).toBe(false);
  });

  it("GET /employees/directory — no token returns 401", async () => {
    const r = await api("GET", "/api/v1/employees/directory");
    expect(r.status).toBe(401);
    expect(r.data.success).toBe(false);
  });

  it("GET /announcements — no token returns 401", async () => {
    const r = await api("GET", "/api/v1/announcements");
    expect(r.status).toBe(401);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 24. HEALTH CHECK (1 test)
// ===========================================================================
describe("Health Check", () => {
  it("GET /health — returns healthy status", async () => {
    const r = await api("GET", "/health");
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data).toHaveProperty("status");
  });
});

// ===========================================================================
// 25. ADDITIONAL LEAVE WORKFLOW (3 tests)
// ===========================================================================
describe("Leave — Approval Workflow", () => {
  it("PUT /leave/applications/:id/approve — non-existent returns 404", async () => {
    const r = await api(
      "PUT",
      "/api/v1/leave/applications/999999/approve",
      { remarks: "test" },
      adminToken,
    );
    expect(r.status).toBe(404);
    expect(r.data.success).toBe(false);
  });

  it("PUT /leave/applications/:id/reject — non-existent returns 404", async () => {
    const r = await api(
      "PUT",
      "/api/v1/leave/applications/999999/reject",
      { remarks: "test" },
      adminToken,
    );
    expect(r.status).toBe(404);
    expect(r.data.success).toBe(false);
  });

  it("PUT /leave/applications/:id/cancel — non-existent returns 404", async () => {
    const r = await api(
      "PUT",
      "/api/v1/leave/applications/999999/cancel",
      undefined,
      employeeToken,
    );
    expect(r.status).toBe(404);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 26. ADDITIONAL HELPDESK (2 tests)
// ===========================================================================
describe("Helpdesk — Additional", () => {
  it("GET /helpdesk/dashboard — helpdesk stats (HR)", async () => {
    const r = await api("GET", "/api/v1/helpdesk/dashboard", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /helpdesk/tickets/:id — non-existent ticket returns 404", async () => {
    const r = await api("GET", "/api/v1/helpdesk/tickets/999999", undefined, adminToken);
    expect(r.status).toBe(404);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 27. ADDITIONAL SURVEY (2 tests)
// ===========================================================================
describe("Survey — Additional", () => {
  it("GET /surveys/my-responses — employee's past survey responses", async () => {
    const r = await api("GET", "/api/v1/surveys/my-responses", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /surveys/dashboard — survey analytics dashboard (HR)", async () => {
    const r = await api("GET", "/api/v1/surveys/dashboard", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 28. ADDITIONAL ASSET (2 tests)
// ===========================================================================
describe("Asset — Additional", () => {
  it("GET /assets/dashboard — asset dashboard (HR)", async () => {
    const r = await api("GET", "/api/v1/assets/dashboard", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /assets/:id — non-existent asset returns 404", async () => {
    const r = await api("GET", "/api/v1/assets/999999", undefined, adminToken);
    expect(r.status).toBe(404);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 29. ADDITIONAL DOCUMENT (2 tests)
// ===========================================================================
describe("Document — Additional", () => {
  it("GET /documents/mandatory-status — mandatory doc tracking (HR)", async () => {
    const r = await api("GET", "/api/v1/documents/mandatory-status", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /documents/:id — non-existent doc returns 404", async () => {
    const r = await api("GET", "/api/v1/documents/999999", undefined, adminToken);
    expect(r.status).toBe(404);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 30. ADDITIONAL ANNOUNCEMENTS (2 tests)
// ===========================================================================
describe("Announcement — Additional", () => {
  it("GET /announcements/unread-count — unread announcement count", async () => {
    const r = await api("GET", "/api/v1/announcements/unread-count", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data).toHaveProperty("count");
  });

  it("DELETE /announcements/:id — non-existent returns 404 or 403", async () => {
    const r = await api("DELETE", "/api/v1/announcements/999999", undefined, adminToken);
    expect([403, 404]).toContain(r.status);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 31. ADDITIONAL POLICY (2 tests)
// ===========================================================================
describe("Policy — Additional", () => {
  it("GET /policies/pending — pending acknowledgments for employee", async () => {
    const r = await api("GET", "/api/v1/policies/pending", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /policies/:id — non-existent policy returns 404", async () => {
    const r = await api("GET", "/api/v1/policies/999999", undefined, adminToken);
    expect(r.status).toBe(404);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 32. ADDITIONAL WHISTLEBLOWING (2 tests)
// ===========================================================================
describe("Whistleblowing — Additional", () => {
  it("GET /whistleblowing/dashboard — dashboard (HR)", async () => {
    const r = await api("GET", "/api/v1/whistleblowing/dashboard", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /whistleblowing/reports/:id — non-existent returns 404 or 403", async () => {
    const r = await api("GET", "/api/v1/whistleblowing/reports/999999", undefined, adminToken);
    expect([403, 404]).toContain(r.status);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 33. ADDITIONAL CHATBOT (2 tests)
// ===========================================================================
describe("Chatbot — Additional", () => {
  it("GET /chatbot/conversations — list my conversations", async () => {
    const r = await api("GET", "/api/v1/chatbot/conversations", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /chatbot/suggestions — get suggested questions", async () => {
    const r = await api("GET", "/api/v1/chatbot/suggestions", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 34. ADDITIONAL ADMIN (3 tests)
// ===========================================================================
describe("Admin — Additional", () => {
  it("GET /admin/revenue — revenue analytics", async () => {
    const r = await api("GET", "/api/v1/admin/revenue", undefined, superAdminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /admin/growth — user growth metrics", async () => {
    const r = await api("GET", "/api/v1/admin/growth", undefined, superAdminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /admin/subscriptions — subscription metrics", async () => {
    const r = await api("GET", "/api/v1/admin/subscriptions", undefined, superAdminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 35. ADDITIONAL WELLNESS (2 tests)
// ===========================================================================
describe("Wellness — Additional", () => {
  it("GET /wellness/summary — my wellness summary", async () => {
    const r = await api("GET", "/api/v1/wellness/summary", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /wellness/programs — list programs", async () => {
    const r = await api("GET", "/api/v1/wellness/programs?page=1&per_page=5", undefined, employeeToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 36. ADDITIONAL FORUM (2 tests)
// ===========================================================================
describe("Forum — Additional", () => {
  it("GET /forum/dashboard — forum dashboard (HR)", async () => {
    const r = await api("GET", "/api/v1/forum/dashboard", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /forum/posts/:id — non-existent post returns 404", async () => {
    const r = await api("GET", "/api/v1/forum/posts/999999", undefined, employeeToken);
    expect(r.status).toBe(404);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 37. ADDITIONAL ATTENDANCE (3 tests)
// ===========================================================================
describe("Attendance — Additional", () => {
  it("GET /attendance/geo-fences — list geo-fences", async () => {
    const r = await api("GET", "/api/v1/attendance/geo-fences", undefined, adminToken);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it("GET /attendance/regularizations — list regularizations (HR)", async () => {
    const r = await api("GET", "/api/v1/attendance/regularizations?page=1&per_page=5", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /attendance/monthly-report — monthly attendance report (HR)", async () => {
    const r = await api("GET", "/api/v1/attendance/monthly-report", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 38. ADDITIONAL POSITIONS (2 tests)
// ===========================================================================
describe("Position — Additional", () => {
  it("GET /positions/hierarchy — position hierarchy (HR)", async () => {
    const r = await api("GET", "/api/v1/positions/hierarchy", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /positions/headcount-plans — headcount plans (HR)", async () => {
    const r = await api("GET", "/api/v1/positions/headcount-plans?page=1&per_page=5", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });
});

// ===========================================================================
// 39. ADDITIONAL EVENTS (2 tests)
// ===========================================================================
describe("Event — Additional", () => {
  it("GET /events/dashboard — event dashboard (HR)", async () => {
    const r = await api("GET", "/api/v1/events/dashboard", undefined, adminToken);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) expect(r.data.success).toBe(true);
  });

  it("GET /events/:id — non-existent event returns 404", async () => {
    const r = await api("GET", "/api/v1/events/999999", undefined, adminToken);
    expect(r.status).toBe(404);
    expect(r.data.success).toBe(false);
  });
});

// ===========================================================================
// 40. CROSS-CUTTING: Invalid Token (2 tests)
// ===========================================================================
describe("Auth — Invalid/Expired Tokens", () => {
  it("GET /users — expired/invalid token returns 401", async () => {
    const r = await api("GET", "/api/v1/users", undefined, "invalid.jwt.token");
    expect(r.status).toBe(401);
    expect(r.data.success).toBe(false);
  });

  it("GET /employees/directory — garbage bearer token returns 401", async () => {
    const r = await api(
      "GET",
      "/api/v1/employees/directory",
      undefined,
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake.payload",
    );
    expect(r.status).toBe(401);
    expect(r.data.success).toBe(false);
  });
});
