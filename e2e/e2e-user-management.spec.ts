import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// EMP Cloud — User Management E2E Tests
// Tests: user CRUD, invite, org chart, deactivate, privilege escalation prevention
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE = { email: "arjun@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ token: string; userId: number }> {
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
// 1. User List + Get by ID
// =============================================================================

test.describe("User List & Detail", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;
  });

  test("Admin can list users", async ({ request }) => {
    const res = await request.get(`${API}/users`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("Employee can list users (read access)", async ({ request }) => {
    const res = await request.get(`${API}/users`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can get user by ID", async ({ request }) => {
    // Get first user from list
    const listRes = await request.get(`${API}/users`, {
      headers: auth(adminToken),
    });
    const users = (await listRes.json()).data;
    if (users.length > 0) {
      const userId = users[0].id;
      const res = await request.get(`${API}/users/${userId}`, {
        headers: auth(adminToken),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(userId);
    }
  });

  test("Get non-existent user returns 404", async ({ request }) => {
    const res = await request.get(`${API}/users/999999`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(404);
  });
});

// =============================================================================
// 2. User Create + Update + Delete (org_admin only)
// =============================================================================

test.describe("User CRUD (org_admin)", () => {
  let adminToken: string;
  let employeeToken: string;
  let createdUserId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;
  });

  test("Org admin can create a user", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: auth(adminToken),
      data: {
        email: `e2e-user-${RUN}@technova.in`,
        first_name: "E2E",
        last_name: `User ${RUN}`,
        password: process.env.TEST_USER_PASSWORD || "Welcome@123",
        role: "employee",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    createdUserId = body.data.id;
  });

  test("Org admin can update a user", async ({ request }) => {
    const res = await request.put(`${API}/users/${createdUserId}`, {
      headers: auth(adminToken),
      data: { first_name: "Updated" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot create a user (403)", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: auth(employeeToken),
      data: {
        email: `blocked-${RUN}@technova.in`,
        first_name: "Blocked",
        last_name: "User",
        password: process.env.TEST_USER_PASSWORD || "Welcome@123",
        role: "employee",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot update a user (403)", async ({ request }) => {
    const res = await request.put(`${API}/users/${createdUserId}`, {
      headers: auth(employeeToken),
      data: { first_name: "Blocked" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot delete a user (403)", async ({ request }) => {
    const res = await request.delete(`${API}/users/${createdUserId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Org admin can delete a user", async ({ request }) => {
    const res = await request.delete(`${API}/users/${createdUserId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 3. User Invitation
// =============================================================================

test.describe("User Invitation", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;
  });

  test("Org admin can invite a user", async ({ request }) => {
    const res = await request.post(`${API}/users/invite`, {
      headers: auth(adminToken),
      data: {
        email: `invite-${RUN}@technova.in`,
        role: "employee",
        first_name: "Invited",
        last_name: "User",
      },
    });
    // 201 on success, 400 if email already exists/invited
    expect([200, 201, 400]).toContain(res.status());
  });

  test("Admin can list invitations", async ({ request }) => {
    const res = await request.get(`${API}/users/invitations`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot invite a user (403)", async ({ request }) => {
    const res = await request.post(`${API}/users/invite`, {
      headers: auth(employeeToken),
      data: {
        email: `blocked-invite-${RUN}@technova.in`,
        role: "employee",
      },
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 4. Org Chart
// =============================================================================

test.describe("Org Chart", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;
  });

  test("Admin can view org chart", async ({ request }) => {
    const res = await request.get(`${API}/users/org-chart`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can view org chart", async ({ request }) => {
    const res = await request.get(`${API}/users/org-chart`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 5. Privilege Escalation Prevention
// =============================================================================

test.describe("Privilege Escalation Prevention", () => {
  let adminToken: string;
  let employeeToken: string;
  let employeeUserId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;
    employeeUserId = emp.userId;
  });

  test("Employee cannot escalate own role via user update (403)", async ({ request }) => {
    const res = await request.put(`${API}/users/${employeeUserId}`, {
      headers: auth(employeeToken),
      data: { role: "org_admin" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot access invitations list (403)", async ({ request }) => {
    const res = await request.get(`${API}/users/invitations`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 6. Unauthenticated Access Denied
// =============================================================================

test.describe("Unauthenticated Access Denied", () => {
  test("Users endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/users`);
    expect(res.status()).toBe(401);
  });

  test("Org chart endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/users/org-chart`);
    expect(res.status()).toBe(401);
  });
});
