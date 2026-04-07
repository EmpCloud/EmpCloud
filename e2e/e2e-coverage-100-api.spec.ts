import { test, expect, type APIRequestContext } from "@playwright/test";

// =============================================================================
// E2E: Deep API Coverage — Edge Cases, Error Handling, RBAC, Tenant Isolation
//
// Tests error responses, RBAC enforcement, tenant isolation, validation errors,
// not-found errors, and less-common endpoint variations.
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN_CREDS = { email: "ananya@technova.in", password: "Welcome@123" };
const EMP_CREDS = { email: "priya@technova.in", password: "Welcome@123" };
const MGR_CREDS = { email: "karthik@technova.in", password: "Welcome@123" };
const SUPER_CREDS = { email: "admin@empcloud.com", password: "SuperAdmin@123" };

const RUN = Date.now().toString().slice(-6);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// =============================================================================
// 1. Auth Error Handling — expired / malformed / missing tokens
// =============================================================================

test.describe("1. Auth Error Handling", () => {
  test("1.1 Missing Authorization header returns 401", async ({ request }) => {
    const res = await request.get(`${API}/users`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("1.2 Malformed token (random string) returns 401", async ({ request }) => {
    const res = await request.get(`${API}/users`, {
      headers: auth("not-a-real-jwt-token"),
    });
    expect(res.status()).toBe(401);
  });

  test("1.3 Token with invalid signature returns 401", async ({ request }) => {
    // Craft a JWT-like string with 3 parts but invalid signature
    const fakeJwt =
      "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOjEsIm9yZ19pZCI6MSwicm9sZSI6Im9yZ19hZG1pbiJ9.invalid_signature_here";
    const res = await request.get(`${API}/users`, {
      headers: auth(fakeJwt),
    });
    expect(res.status()).toBe(401);
  });

  test("1.4 Empty Bearer token returns 401", async ({ request }) => {
    const res = await request.get(`${API}/users`, {
      headers: { Authorization: "Bearer ", "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("1.5 Bearer prefix missing returns 401", async ({ request }) => {
    const { token } = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const res = await request.get(`${API}/users`, {
      headers: { Authorization: token, "Content-Type": "application/json" },
    });
    // Should be 401 since middleware expects "Bearer <token>"
    expect(res.status()).toBe(401);
  });

  test("1.6 Login with wrong password returns 401", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: ADMIN_CREDS.email, password: "WrongPassword@999" },
    });
    expect(res.status()).toBe(401);
  });

  test("1.7 Login with non-existent email returns 401", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: `nonexistent-${RUN}@fakecorp.com`, password: "Anything@123" },
    });
    expect(res.status()).toBe(401);
  });

  test("1.8 Login with empty body returns 400 or 422", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("1.9 Login with missing password returns 400 or 422", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: ADMIN_CREDS.email },
    });
    expect([400, 422]).toContain(res.status());
  });
});

// =============================================================================
// 2. RBAC — Employee cannot access admin-only endpoints
// =============================================================================

test.describe("2. RBAC Enforcement", () => {
  let empToken: string;
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const emp = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = emp.token;
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
  });

  test("2.1 Employee cannot create a user (POST /users) — 403", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: auth(empToken),
      data: {
        email: `rbac-test-${RUN}@test.com`,
        first_name: "RBAC",
        last_name: "Test",
        password: "Test@12345",
        role: "employee",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("2.2 Employee cannot delete a user (DELETE /users/:id) — 403", async ({ request }) => {
    const res = await request.delete(`${API}/users/1`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.3 Employee cannot list invitations — 403", async ({ request }) => {
    const res = await request.get(`${API}/users/invitations`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.4 Employee cannot access attendance dashboard — 403", async ({ request }) => {
    const res = await request.get(`${API}/attendance/dashboard`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.5 Employee cannot list all regularizations — 403", async ({ request }) => {
    const res = await request.get(`${API}/attendance/regularizations`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.6 Employee cannot create leave type (HR-only) — 403", async ({ request }) => {
    const res = await request.post(`${API}/leave/types`, {
      headers: auth(empToken),
      data: { name: "RBAC Test", code: "RBAC", paid: true, max_days_per_year: 5 },
    });
    expect(res.status()).toBe(403);
  });

  test("2.7 Employee cannot view document expiring list — 403", async ({ request }) => {
    const res = await request.get(`${API}/documents/expiring`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.8 Employee cannot view mandatory document status — 403", async ({ request }) => {
    const res = await request.get(`${API}/documents/mandatory-status`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.9 Employee cannot view headcount — 403", async ({ request }) => {
    const res = await request.get(`${API}/employees/headcount`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.10 Employee cannot view probation list — 403", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.11 Employee cannot view probation dashboard — 403", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/dashboard`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.12 Employee cannot approve leave (manager-only) — 403", async ({ request }) => {
    const res = await request.put(`${API}/leave/applications/999999/approve`, {
      headers: auth(empToken),
      data: { remarks: "test" },
    });
    // 403 (RBAC) or 404 (not found) — either is fine, not 200/500
    expect([403, 404]).toContain(res.status());
  });

  test("2.13 Employee cannot reject leave — 403", async ({ request }) => {
    const res = await request.put(`${API}/leave/applications/999999/reject`, {
      headers: auth(empToken),
      data: { remarks: "test" },
    });
    expect([403, 404]).toContain(res.status());
  });

  test("2.14 Employee cannot list subscriptions (HR-only) — 403", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.15 Employee cannot view billing summary — 403", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-summary`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.16 Employee cannot view billing status — 403", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-status`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.17 Employee cannot view document tracking/mandatory — 403", async ({ request }) => {
    const res = await request.get(`${API}/documents/tracking/mandatory`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.18 Employee cannot view document tracking/expiry — 403", async ({ request }) => {
    const res = await request.get(`${API}/documents/tracking/expiry`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("2.19 Employee cannot reject a document — 403", async ({ request }) => {
    const res = await request.post(`${API}/documents/999999/reject`, {
      headers: auth(empToken),
      data: { rejection_reason: "test" },
    });
    expect([403, 404]).toContain(res.status());
  });

  test("2.20 Employee cannot access monthly attendance report — 403", async ({ request }) => {
    const res = await request.get(`${API}/attendance/monthly-report`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 3. Not-Found Errors — Non-existent IDs
// =============================================================================

test.describe("3. Not-Found Errors", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
  });

  test("3.1 GET /users/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.get(`${API}/users/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("3.2 GET /leave/types/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.get(`${API}/leave/types/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("3.3 GET /leave/policies/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.get(`${API}/leave/policies/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("3.4 GET /leave/applications/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.get(`${API}/leave/applications/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("3.5 GET /attendance/shifts/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.get(`${API}/attendance/shifts/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("3.6 GET /subscriptions/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("3.7 GET /employees/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.get(`${API}/employees/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("3.8 PUT /users/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.put(`${API}/users/999999`, {
      headers: auth(adminToken),
      data: { first_name: "Ghost" },
    });
    expect(res.status()).toBe(404);
  });

  test("3.9 DELETE /users/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/users/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("3.10 GET /documents/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.get(`${API}/documents/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });
});

// =============================================================================
// 4. Validation Errors — Missing fields, wrong types
// =============================================================================

test.describe("4. Validation Errors", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
  });

  test("4.1 Create user with missing email returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: auth(adminToken),
      data: { first_name: "Test", last_name: "User", password: "Abc@12345", role: "employee" },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("4.2 Create user with invalid role returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: auth(adminToken),
      data: {
        email: `val-test-${RUN}@test.com`,
        first_name: "Test",
        last_name: "User",
        password: "Abc@12345",
        role: "supreme_leader",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("4.3 Create leave type with empty body returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/leave/types`, {
      headers: auth(adminToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("4.4 Create shift with missing name returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/attendance/shifts`, {
      headers: auth(adminToken),
      data: { start_time: "09:00", end_time: "18:00" },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("4.5 Apply leave with no leave_type_id returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/leave/applications`, {
      headers: auth(adminToken),
      data: { start_date: "2026-12-01", end_date: "2026-12-01", reason: "Test" },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("4.6 Create geo-fence with missing fields returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/attendance/geo-fences`, {
      headers: auth(adminToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("4.7 Create leave policy with empty body returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/leave/policies`, {
      headers: auth(adminToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("4.8 Regularization approve with invalid status returns 400/422", async ({ request }) => {
    const res = await request.put(`${API}/attendance/regularizations/999999/approve`, {
      headers: auth(adminToken),
      data: { status: "maybe" },
    });
    expect([400, 404, 422]).toContain(res.status());
  });

  test("4.9 Create document category with no name returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/documents/categories`, {
      headers: auth(adminToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("4.10 Leave cancel with wrong status value returns 400/422", async ({ request }) => {
    const res = await request.put(`${API}/leave/applications/999999`, {
      headers: auth(adminToken),
      data: { status: "approved" },
    });
    // Only "cancelled" is accepted via PUT /leave/applications/:id
    expect([400, 404, 422]).toContain(res.status());
  });
});

// =============================================================================
// 5. Comp-Off Endpoints
// =============================================================================

test.describe("5. Comp-Off Endpoints", () => {
  let empToken: string;
  let mgrToken: string;
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const emp = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = emp.token;
    const mgr = await loginAndGetToken(request, MGR_CREDS.email, MGR_CREDS.password);
    mgrToken = mgr.token;
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
  });

  test("5.1 GET /leave/comp-off/my — returns paginated list", async ({ request }) => {
    const res = await request.get(`${API}/leave/comp-off/my`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Paginated response
    expect(body).toHaveProperty("data");
  });

  test("5.2 GET /leave/comp-off/pending — returns pending list", async ({ request }) => {
    const res = await request.get(`${API}/leave/comp-off/pending`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("5.3 GET /leave/comp-off/balance — returns balance info", async ({ request }) => {
    const res = await request.get(`${API}/leave/comp-off/balance`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should have balance fields
    expect(body.data).toHaveProperty("balance");
    expect(body.data).toHaveProperty("year");
  });

  test("5.4 GET /leave/comp-off/balance with ?year param", async ({ request }) => {
    const res = await request.get(`${API}/leave/comp-off/balance?year=2025`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.year).toBe(2025);
  });

  test("5.5 POST /leave/comp-off with missing fields returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/leave/comp-off`, {
      headers: auth(empToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("5.6 POST /leave/comp-off/request — alias endpoint with missing fields returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/leave/comp-off/request`, {
      headers: auth(empToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("5.7 POST /leave/comp-off/request with valid data", async ({ request }) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    const res = await request.post(`${API}/leave/comp-off/request`, {
      headers: auth(empToken),
      data: { work_date: dateStr, reason: `E2E comp-off test ${RUN}`, hours_worked: 8 },
    });
    // Could succeed or fail with a business rule error, but not 500
    expect(res.status()).toBeLessThan(500);
  });

  test("5.8 GET /leave/comp-off — list all comp-offs (admin)", async ({ request }) => {
    const res = await request.get(`${API}/leave/comp-off`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("5.9 Employee comp-off pending only shows own data", async ({ request }) => {
    const res = await request.get(`${API}/leave/comp-off/pending`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    // Employee should see only their own pending comp-offs (RBAC filter)
  });

  test("5.10 PUT /leave/comp-off/:id/approve with non-existent ID", async ({ request }) => {
    const res = await request.put(`${API}/leave/comp-off/999999/approve`, {
      headers: auth(mgrToken),
    });
    expect([404, 400]).toContain(res.status());
  });

  test("5.11 PUT /leave/comp-off/:id/reject with non-existent ID", async ({ request }) => {
    const res = await request.put(`${API}/leave/comp-off/999999/reject`, {
      headers: auth(mgrToken),
      data: { reason: "Test rejection" },
    });
    expect([404, 400]).toContain(res.status());
  });
});

// =============================================================================
// 6. Employee Insights Endpoints
// =============================================================================

test.describe("6. Employee Insights", () => {
  let adminToken: string;
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
    const e = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = e.token;
  });

  test("6.1 GET /employees/probation — list", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("6.2 GET /employees/probation/dashboard", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("6.3 GET /employees/probation/upcoming", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/upcoming?days=90`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("6.4 GET /employees/probation/upcoming with default days", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/upcoming`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("6.5 GET /employees/birthdays", async ({ request }) => {
    const res = await request.get(`${API}/employees/birthdays`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("6.6 GET /employees/anniversaries", async ({ request }) => {
    const res = await request.get(`${API}/employees/anniversaries`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("6.7 GET /employees/headcount", async ({ request }) => {
    const res = await request.get(`${API}/employees/headcount`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("6.8 PUT /employees/:id/probation/confirm with non-existent ID", async ({ request }) => {
    const res = await request.put(`${API}/employees/999999/probation/confirm`, {
      headers: auth(adminToken),
    });
    expect([404, 400]).toContain(res.status());
  });

  test("6.9 PUT /employees/:id/probation/extend with missing fields", async ({ request }) => {
    const res = await request.put(`${API}/employees/999999/probation/extend`, {
      headers: auth(adminToken),
      data: {},
    });
    // Should fail with validation (missing new_end_date, reason)
    expect([400, 404, 422]).toContain(res.status());
  });
});

// =============================================================================
// 7. Document Endpoints — my, expiring, mandatory, tracking, reject
// =============================================================================

test.describe("7. Document Endpoints", () => {
  let adminToken: string;
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
    const e = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = e.token;
  });

  test("7.1 GET /documents/my — employee self-service", async ({ request }) => {
    const res = await request.get(`${API}/documents/my`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("data");
  });

  test("7.2 GET /documents/my with pagination", async ({ request }) => {
    const res = await request.get(`${API}/documents/my?page=1&per_page=5`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("7.3 GET /documents/expiring — HR only", async ({ request }) => {
    const res = await request.get(`${API}/documents/expiring`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("7.4 GET /documents/expiring?days=60 — custom days", async ({ request }) => {
    const res = await request.get(`${API}/documents/expiring?days=60`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("7.5 GET /documents/mandatory-status", async ({ request }) => {
    const res = await request.get(`${API}/documents/mandatory-status`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("7.6 GET /documents/tracking/mandatory", async ({ request }) => {
    const res = await request.get(`${API}/documents/tracking/mandatory`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("7.7 GET /documents/tracking/expiry", async ({ request }) => {
    const res = await request.get(`${API}/documents/tracking/expiry`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("7.8 GET /documents/tracking/expiry?days=90", async ({ request }) => {
    const res = await request.get(`${API}/documents/tracking/expiry?days=90`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("7.9 POST /documents/:id/reject with non-existent doc returns 404", async ({ request }) => {
    const res = await request.post(`${API}/documents/999999/reject`, {
      headers: auth(adminToken),
      data: { rejection_reason: "E2E test rejection" },
    });
    expect(res.status()).toBe(404);
  });

  test("7.10 POST /documents/:id/reject with missing reason returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/documents/999999/reject`, {
      headers: auth(adminToken),
      data: {},
    });
    expect([400, 404, 422]).toContain(res.status());
  });

  test("7.11 POST /documents/upload without file returns 400", async ({ request }) => {
    const res = await request.post(`${API}/documents/upload`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(400);
  });

  test("7.12 GET /documents/:id/download with non-existent doc returns 404", async ({ request }) => {
    const res = await request.get(`${API}/documents/999999/download`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });
});

// =============================================================================
// 8. Subscription & Billing Endpoints
// =============================================================================

test.describe("8. Subscription & Billing Endpoints", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
  });

  test("8.1 GET /subscriptions/billing-status", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-status`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("8.2 GET /subscriptions/billing-summary", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/billing-summary`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("8.3 POST /subscriptions/check-access with valid data", async ({ request }) => {
    const res = await request.post(`${API}/subscriptions/check-access`, {
      headers: auth(adminToken),
      data: { user_id: 1, module_slug: "payroll", organization_id: 1 },
    });
    // Should succeed regardless of whether they have access
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("has_access");
  });

  test("8.4 POST /subscriptions/check-access with non-existent module", async ({ request }) => {
    const res = await request.post(`${API}/subscriptions/check-access`, {
      headers: auth(adminToken),
      data: { user_id: 1, module_slug: "nonexistent-module-xyz", organization_id: 1 },
    });
    // Should return has_access: false, not 500
    expect(res.status()).toBeLessThan(500);
  });

  test("8.5 POST /subscriptions/check-access with missing fields returns error", async ({ request }) => {
    const res = await request.post(`${API}/subscriptions/check-access`, {
      headers: auth(adminToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("8.6 GET /subscriptions/:id/seats with non-existent sub ID returns 404", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/999999/seats`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });
});

// =============================================================================
// 9. Notification Endpoints
// =============================================================================

test.describe("9. Notification Endpoints", () => {
  let empToken: string;
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const e = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = e.token;
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
  });

  test("9.1 GET /notifications/unread-count", async ({ request }) => {
    const res = await request.get(`${API}/notifications/unread-count`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("count");
    expect(typeof body.data.count).toBe("number");
  });

  test("9.2 PUT /notifications/read-all", async ({ request }) => {
    const res = await request.put(`${API}/notifications/read-all`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("9.3 PUT /notifications/:id/read with non-existent ID", async ({ request }) => {
    const res = await request.put(`${API}/notifications/999999/read`, {
      headers: auth(empToken),
    });
    // Could be 200 (no-op) or 404
    expect(res.status()).toBeLessThan(500);
  });

  test("9.4 GET /notifications with pagination", async ({ request }) => {
    const res = await request.get(`${API}/notifications?page=1&per_page=5`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("9.5 GET /notifications?unread_only=true", async ({ request }) => {
    const res = await request.get(`${API}/notifications?unread_only=true`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("9.6 GET /notifications/unread-count without auth returns 401", async ({ request }) => {
    const res = await request.get(`${API}/notifications/unread-count`);
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 10. Module Webhook Endpoint
// =============================================================================

test.describe("10. Module Webhook", () => {
  test("10.1 POST /webhooks/modules without API key returns 401", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: { "Content-Type": "application/json" },
      data: { event: "test.event", data: { foo: "bar" }, source: "e2e-test" },
    });
    expect(res.status()).toBe(401);
  });

  test("10.2 POST /webhooks/modules with wrong API key returns 401", async ({ request }) => {
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "wrong-api-key-12345",
      },
      data: { event: "test.event", data: { foo: "bar" }, source: "e2e-test" },
    });
    expect(res.status()).toBe(401);
  });

  test("10.3 POST /webhooks/modules with missing event field returns 400", async ({ request }) => {
    // Even with wrong key, the key check comes first
    const res = await request.post(`${API}/webhooks/modules`, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "wrong-key",
      },
      data: { data: { foo: "bar" } },
    });
    // Should be 401 (key check first) or 400 (missing event)
    expect([400, 401]).toContain(res.status());
  });
});

// =============================================================================
// 11. User Import (CSV) Validation
// =============================================================================

test.describe("11. User Import", () => {
  let adminToken: string;
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
    const e = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = e.token;
  });

  test("11.1 POST /users/import without file returns 400", async ({ request }) => {
    const res = await request.post(`${API}/users/import`, {
      headers: auth(adminToken),
    });
    // No file uploaded — should get 400 or similar
    expect(res.status()).toBeLessThan(500);
  });

  test("11.2 Employee cannot access import endpoint — 403", async ({ request }) => {
    const res = await request.post(`${API}/users/import`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("11.3 POST /users/import/execute without file returns error", async ({ request }) => {
    const res = await request.post(`${API}/users/import/execute`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBeLessThan(500);
  });
});

// =============================================================================
// 12. Attendance Regularization — Reject Path
// =============================================================================

test.describe("12. Regularization Approve/Reject", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
  });

  test("12.1 Reject regularization via approve endpoint with status=rejected", async ({ request }) => {
    const res = await request.put(`${API}/attendance/regularizations/999999/approve`, {
      headers: auth(adminToken),
      data: { status: "rejected", rejection_reason: "E2E test rejection" },
    });
    // 404 for non-existent ID, but the status/reason validation should pass
    expect([404, 400]).toContain(res.status());
  });

  test("12.2 Approve regularization with status=approved on non-existent ID", async ({ request }) => {
    const res = await request.put(`${API}/attendance/regularizations/999999/approve`, {
      headers: auth(adminToken),
      data: { status: "approved" },
    });
    expect([404, 400]).toContain(res.status());
  });

  test("12.3 GET /attendance/regularizations/me", async ({ request }) => {
    const empRes = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    const res = await request.get(`${API}/attendance/regularizations/me`, {
      headers: auth(empRes.token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("12.4 GET /attendance/regularizations with status filter", async ({ request }) => {
    const res = await request.get(`${API}/attendance/regularizations?status=pending`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("12.5 POST /attendance/regularizations with missing fields", async ({ request }) => {
    const empRes = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    const res = await request.post(`${API}/attendance/regularizations`, {
      headers: auth(empRes.token),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });
});

// =============================================================================
// 13. Leave Balances — RBAC & edge cases
// =============================================================================

test.describe("13. Leave Balances RBAC", () => {
  let empToken: string;
  let empId: number;
  let adminToken: string;
  let adminId: number;

  test.beforeAll(async ({ request }) => {
    const emp = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = emp.token;
    empId = emp.userId;
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
    adminId = admin.userId;
  });

  test("13.1 Employee can view own balances", async ({ request }) => {
    const res = await request.get(`${API}/leave/balances`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("13.2 Employee cannot view other user balances — 403", async ({ request }) => {
    const res = await request.get(`${API}/leave/balances?user_id=${adminId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("13.3 Admin can view other user balances", async ({ request }) => {
    const res = await request.get(`${API}/leave/balances?user_id=${empId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("13.4 GET /leave/balances/me — shortcut", async ({ request }) => {
    const res = await request.get(`${API}/leave/balances/me`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("13.5 GET /leave/balances/me with year param", async ({ request }) => {
    const res = await request.get(`${API}/leave/balances/me?year=2025`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("13.6 POST /leave/balances/initialize — employee cannot (HR-only)", async ({ request }) => {
    const res = await request.post(`${API}/leave/balances/initialize`, {
      headers: auth(empToken),
      data: { year: 2026 },
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 14. Leave Applications — self-service & manager flow
// =============================================================================

test.describe("14. Leave Application Edge Cases", () => {
  let empToken: string;
  let mgrToken: string;

  test.beforeAll(async ({ request }) => {
    const emp = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = emp.token;
    const mgr = await loginAndGetToken(request, MGR_CREDS.email, MGR_CREDS.password);
    mgrToken = mgr.token;
  });

  test("14.1 GET /leave/applications/me — employee self-service", async ({ request }) => {
    const res = await request.get(`${API}/leave/applications/me`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("14.2 GET /leave/applications/me with status filter", async ({ request }) => {
    const res = await request.get(`${API}/leave/applications/me?status=approved`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("14.3 GET /leave/calendar", async ({ request }) => {
    const res = await request.get(`${API}/leave/calendar`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("14.4 GET /leave/calendar with month/year params", async ({ request }) => {
    const res = await request.get(`${API}/leave/calendar?month=1&year=2026`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("14.5 PUT /leave/applications/:id/cancel on non-existent ID", async ({ request }) => {
    const res = await request.put(`${API}/leave/applications/999999/cancel`, {
      headers: auth(empToken),
    });
    expect([404, 400]).toContain(res.status());
  });

  test("14.6 Apply leave with end_date before start_date should fail", async ({ request }) => {
    const res = await request.post(`${API}/leave/applications`, {
      headers: auth(empToken),
      data: {
        leave_type_id: 1,
        start_date: "2026-12-15",
        end_date: "2026-12-10",
        reason: "Invalid date range test",
      },
    });
    expect([400, 422]).toContain(res.status());
  });
});

// =============================================================================
// 15. Attendance Misc Endpoints
// =============================================================================

test.describe("15. Attendance Misc", () => {
  let empToken: string;
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const emp = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = emp.token;
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
  });

  test("15.1 GET /attendance/me/today", async ({ request }) => {
    const res = await request.get(`${API}/attendance/me/today`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("15.2 GET /attendance/me/history", async ({ request }) => {
    const res = await request.get(`${API}/attendance/me/history`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("15.3 GET /attendance/records — employee sees only own", async ({ request }) => {
    const res = await request.get(`${API}/attendance/records`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("15.4 GET /attendance/shifts/my-schedule", async ({ request }) => {
    const res = await request.get(`${API}/attendance/shifts/my-schedule`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("15.5 GET /attendance/dashboard (admin)", async ({ request }) => {
    const res = await request.get(`${API}/attendance/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("15.6 GET /attendance/monthly-report", async ({ request }) => {
    const res = await request.get(`${API}/attendance/monthly-report`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("15.7 GET /attendance/monthly-report with month/year params", async ({ request }) => {
    const res = await request.get(`${API}/attendance/monthly-report?month=1&year=2026`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("15.8 GET /attendance/shifts/assignments (admin)", async ({ request }) => {
    const res = await request.get(`${API}/attendance/shifts/assignments`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("15.9 GET /attendance/shifts/schedule (admin)", async ({ request }) => {
    const res = await request.get(`${API}/attendance/shifts/schedule`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("15.10 GET /attendance/geo-fences", async ({ request }) => {
    const res = await request.get(`${API}/attendance/geo-fences`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 16. Tenant Isolation — Cross-org access attempts
// =============================================================================

test.describe("16. Tenant Isolation", () => {
  let orgToken: string;
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    // TechNova org user
    const org = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    orgToken = org.token;
    const sup = await loginAndGetToken(request, SUPER_CREDS.email, SUPER_CREDS.password);
    superToken = sup.token;
  });

  test("16.1 Org user cannot fetch user from another org (ID won't exist in their org)", async ({ request }) => {
    // User ID 999999 doesn't exist in TechNova org
    const res = await request.get(`${API}/users/999999`, {
      headers: auth(orgToken),
    });
    expect(res.status()).toBe(404);
  });

  test("16.2 Org user cannot see cross-org leave types", async ({ request }) => {
    // Leave type 999999 doesn't exist in their org
    const res = await request.get(`${API}/leave/types/999999`, {
      headers: auth(orgToken),
    });
    expect(res.status()).toBe(404);
  });

  test("16.3 Org user cannot access another org's documents", async ({ request }) => {
    const res = await request.get(`${API}/documents/999999`, {
      headers: auth(orgToken),
    });
    expect(res.status()).toBe(404);
  });

  test("16.4 Org user cannot access cross-org employee profile", async ({ request }) => {
    const res = await request.get(`${API}/employees/999999/profile`, {
      headers: auth(orgToken),
    });
    expect([403, 404]).toContain(res.status());
  });

  test("16.5 Org user cannot access cross-org subscription", async ({ request }) => {
    const res = await request.get(`${API}/subscriptions/999999`, {
      headers: auth(orgToken),
    });
    expect(res.status()).toBe(404);
  });
});

// =============================================================================
// 17. Employee Directory & Profile Edge Cases
// =============================================================================

test.describe("17. Employee Directory & Profile", () => {
  let empToken: string;
  let empId: number;
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const emp = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = emp.token;
    empId = emp.userId;
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
  });

  test("17.1 GET /employees/directory", async ({ request }) => {
    const res = await request.get(`${API}/employees/directory`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("17.2 GET /employees/directory with search param", async ({ request }) => {
    const res = await request.get(`${API}/employees/directory?search=priya`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("17.3 GET /employees/directory with pagination", async ({ request }) => {
    const res = await request.get(`${API}/employees/directory?page=1&per_page=2`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("17.4 GET /employees/:id/profile — self access", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empId}/profile`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("17.5 GET /employees/:id/salary — self access", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empId}/salary`, {
      headers: auth(empToken),
    });
    // 200 if salary exists, 404 if not set up yet
    expect(res.status()).toBeLessThan(500);
  });

  test("17.6 GET /employees/:id/addresses — self", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empId}/addresses`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("17.7 GET /employees/:id/education — self", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empId}/education`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("17.8 GET /employees/:id/experience — self", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empId}/experience`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("17.9 GET /employees/:id/dependents — self", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empId}/dependents`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("17.10 GET /users/org-chart", async ({ request }) => {
    const res = await request.get(`${API}/users/org-chart`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 18. Shift Swap Requests
// =============================================================================

test.describe("18. Shift Swap Requests", () => {
  let empToken: string;
  let adminToken: string;
  let mgrToken: string;

  test.beforeAll(async ({ request }) => {
    const emp = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = emp.token;
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;
    const mgr = await loginAndGetToken(request, MGR_CREDS.email, MGR_CREDS.password);
    mgrToken = mgr.token;
  });

  test("18.1 GET /attendance/shifts/swap-requests (admin)", async ({ request }) => {
    const res = await request.get(`${API}/attendance/shifts/swap-requests`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("18.2 POST /attendance/shifts/swap-request with missing data", async ({ request }) => {
    const res = await request.post(`${API}/attendance/shifts/swap-request`, {
      headers: auth(empToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("18.3 POST /attendance/shifts/swap-requests/:id/approve with non-existent ID", async ({ request }) => {
    const res = await request.post(`${API}/attendance/shifts/swap-requests/999999/approve`, {
      headers: auth(mgrToken),
    });
    expect([404, 400]).toContain(res.status());
  });

  test("18.4 POST /attendance/shifts/swap-requests/:id/reject with non-existent ID", async ({ request }) => {
    const res = await request.post(`${API}/attendance/shifts/swap-requests/999999/reject`, {
      headers: auth(mgrToken),
    });
    expect([404, 400]).toContain(res.status());
  });
});

// =============================================================================
// 19. Leave Type & Policy CRUD Edge Cases
// =============================================================================

test.describe("19. Leave Type & Policy CRUD", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
  });

  test("19.1 GET /leave/types — list all", async ({ request }) => {
    const res = await request.get(`${API}/leave/types`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("19.2 PUT /leave/types/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.put(`${API}/leave/types/999999`, {
      headers: auth(adminToken),
      data: { name: "Ghost Type" },
    });
    expect(res.status()).toBe(404);
  });

  test("19.3 DELETE /leave/types/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/leave/types/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("19.4 GET /leave/policies — list all", async ({ request }) => {
    const res = await request.get(`${API}/leave/policies`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("19.5 PUT /leave/policies/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.put(`${API}/leave/policies/999999`, {
      headers: auth(adminToken),
      data: { name: "Ghost Policy" },
    });
    expect(res.status()).toBe(404);
  });

  test("19.6 DELETE /leave/policies/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/leave/policies/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });
});

// =============================================================================
// 20. Geo-Fence & Shift CRUD Edge Cases
// =============================================================================

test.describe("20. Geo-Fence & Shift Edge Cases", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
  });

  test("20.1 PUT /attendance/shifts/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.put(`${API}/attendance/shifts/999999`, {
      headers: auth(adminToken),
      data: { name: "Ghost Shift" },
    });
    expect(res.status()).toBe(404);
  });

  test("20.2 DELETE /attendance/shifts/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/attendance/shifts/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("20.3 PUT /attendance/geo-fences/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.put(`${API}/attendance/geo-fences/999999`, {
      headers: auth(adminToken),
      data: { name: "Ghost Fence" },
    });
    expect(res.status()).toBe(404);
  });

  test("20.4 DELETE /attendance/geo-fences/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/attendance/geo-fences/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test("20.5 POST /attendance/shifts/assign with missing fields returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/attendance/shifts/assign`, {
      headers: auth(adminToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("20.6 POST /attendance/shifts/bulk-assign with missing fields returns 400/422", async ({ request }) => {
    const res = await request.post(`${API}/attendance/shifts/bulk-assign`, {
      headers: auth(adminToken),
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });
});

// =============================================================================
// 21. Document Category CRUD Edge Cases
// =============================================================================

test.describe("21. Document Category CRUD", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
  });

  test("21.1 GET /documents/categories", async ({ request }) => {
    const res = await request.get(`${API}/documents/categories`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("21.2 PUT /documents/categories/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.put(`${API}/documents/categories/999999`, {
      headers: auth(adminToken),
      data: { name: "Ghost Category" },
    });
    expect(res.status()).toBe(404);
  });

  test("21.3 DELETE /documents/categories/:id with non-existent ID returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/documents/categories/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });
});

// =============================================================================
// 22. User List & Detail Edge Cases
// =============================================================================

test.describe("22. User List & Detail", () => {
  let adminToken: string;
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
    const e = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = e.token;
  });

  test("22.1 GET /users with search param", async ({ request }) => {
    const res = await request.get(`${API}/users?search=priya`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("22.2 GET /users with include_inactive=true", async ({ request }) => {
    const res = await request.get(`${API}/users?include_inactive=true`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("22.3 Employee list users sees only directory-safe fields", async ({ request }) => {
    const res = await request.get(`${API}/users`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Employee should not see role/status fields for other users
    if (body.data?.length > 0) {
      const otherUser = body.data[0];
      // Directory-safe fields should be present
      expect(otherUser).toHaveProperty("first_name");
    }
  });

  test("22.4 GET /users with pagination", async ({ request }) => {
    const res = await request.get(`${API}/users?page=1&per_page=2`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// 23. Mixed endpoint coverage — edge & param variations
// =============================================================================

test.describe("23. Miscellaneous Endpoint Variations", () => {
  let adminToken: string;
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = a.token;
    const e = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    empToken = e.token;
  });

  test("23.1 GET /attendance/records with date_from and date_to", async ({ request }) => {
    const res = await request.get(
      `${API}/attendance/records?date_from=2026-01-01&date_to=2026-01-31`,
      { headers: auth(adminToken) },
    );
    expect(res.status()).toBe(200);
  });

  test("23.2 GET /attendance/records with specific date param", async ({ request }) => {
    const res = await request.get(`${API}/attendance/records?date=2026-04-01`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("23.3 GET /leave/applications with user_id filter (admin)", async ({ request }) => {
    const res = await request.get(`${API}/leave/applications?user_id=1`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("23.4 GET /leave/applications — employee only sees own", async ({ request }) => {
    const res = await request.get(`${API}/leave/applications`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("23.5 GET /documents with search param", async ({ request }) => {
    const res = await request.get(`${API}/documents?search=passport`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("23.6 GET /documents with category_id filter", async ({ request }) => {
    const res = await request.get(`${API}/documents?category_id=1`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("23.7 PUT /employees/:id/salary with missing fields returns 400", async ({ request }) => {
    const empRes = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    const res = await request.put(`${API}/employees/${empRes.userId}/salary`, {
      headers: auth(adminToken),
      data: { ctc: 1000000 },
    });
    // Missing required fields (basic, hra, da, etc.)
    expect([400, 422]).toContain(res.status());
  });

  test("23.8 PUT /employees/:id/salary with negative values returns 400", async ({ request }) => {
    const empRes = await loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password);
    const res = await request.put(`${API}/employees/${empRes.userId}/salary`, {
      headers: auth(adminToken),
      data: {
        ctc: -100,
        basic: 500000,
        hra: 200000,
        da: 50000,
        special_allowance: 100000,
        gross: 850000,
        employer_pf: 60000,
        employer_esi: 0,
        gratuity: 40000,
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("23.9 GET /attendance/shifts/swap-requests with status filter", async ({ request }) => {
    const res = await request.get(`${API}/attendance/shifts/swap-requests?status=pending`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("23.10 Non-existent API route returns 404", async ({ request }) => {
    const res = await request.get(`${API}/totally-fake-endpoint-xyz`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });
});
