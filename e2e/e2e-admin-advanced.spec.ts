import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// EMP Cloud — Admin Advanced E2E Tests (super_admin)
// Tests: force health check, data sanity fix, overdue orgs, module toggle,
//        cross-org user management (deactivate, activate, reset password, role)
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const SUPER_ADMIN = { email: "admin@empcloud.com", password: "SuperAdmin@123" };
const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE = { email: "arjun@technova.in", password: "Welcome@123" };

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
// 1. Force Health Check
// =============================================================================

test.describe("Force Health Check", () => {
  let superToken: string;
  let orgAdminToken: string;

  test.beforeAll(async ({ request }) => {
    const sa = await loginAndGetToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
    superToken = sa.token;
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    orgAdminToken = admin.token;
  });

  test("Super admin can force a health check", async ({ request }) => {
    test.setTimeout(60_000);
    const res = await request.post(`${API}/admin/service-health/check`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Org admin cannot force health check (403)", async ({ request }) => {
    const res = await request.post(`${API}/admin/service-health/check`, {
      headers: auth(orgAdminToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 2. Data Sanity Fix
// =============================================================================

test.describe("Data Sanity Fix", () => {
  let superToken: string;
  let orgAdminToken: string;

  test.beforeAll(async ({ request }) => {
    const sa = await loginAndGetToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
    superToken = sa.token;
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    orgAdminToken = admin.token;
  });

  test("Super admin can trigger data sanity fix", async ({ request }) => {
    test.setTimeout(60_000);
    const res = await request.post(`${API}/admin/data-sanity/fix`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Org admin cannot trigger data sanity fix (403)", async ({ request }) => {
    const res = await request.post(`${API}/admin/data-sanity/fix`, {
      headers: auth(orgAdminToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 3. Overdue Organizations
// =============================================================================

test.describe("Overdue Organizations", () => {
  let superToken: string;
  let orgAdminToken: string;

  test.beforeAll(async ({ request }) => {
    const sa = await loginAndGetToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
    superToken = sa.token;
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    orgAdminToken = admin.token;
  });

  test("Super admin can view overdue organizations", async ({ request }) => {
    const res = await request.get(`${API}/admin/overdue-organizations`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Org admin cannot view overdue organizations (403)", async ({ request }) => {
    const res = await request.get(`${API}/admin/overdue-organizations`, {
      headers: auth(orgAdminToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 4. Module Toggle (enable/disable)
// =============================================================================

test.describe("Module Toggle", () => {
  let superToken: string;
  let orgAdminToken: string;
  let moduleId: number;

  test.beforeAll(async ({ request }) => {
    const sa = await loginAndGetToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
    superToken = sa.token;
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    orgAdminToken = admin.token;

    // Get a module ID from the modules list
    const modsRes = await request.get(`${API}/admin/modules`, {
      headers: auth(superToken),
    });
    const modsBody = await modsRes.json();
    const modules = modsBody.data || [];
    if (Array.isArray(modules) && modules.length > 0) {
      moduleId = modules[0].id;
    }
  });

  test("Super admin can toggle a module", async ({ request }) => {
    if (!moduleId) {
      test.skip();
      return;
    }
    // Disable then re-enable to avoid side effects
    const disableRes = await request.put(`${API}/admin/modules/${moduleId}`, {
      headers: auth(superToken),
      data: { is_active: false },
    });
    expect(disableRes.status()).toBe(200);

    const enableRes = await request.put(`${API}/admin/modules/${moduleId}`, {
      headers: auth(superToken),
      data: { is_active: true },
    });
    expect(enableRes.status()).toBe(200);
    const body = await enableRes.json();
    expect(body.success).toBe(true);
  });

  test("Org admin cannot toggle a module (403)", async ({ request }) => {
    if (!moduleId) {
      test.skip();
      return;
    }
    const res = await request.put(`${API}/admin/modules/${moduleId}`, {
      headers: auth(orgAdminToken),
      data: { is_active: false },
    });
    expect(res.status()).toBe(403);
  });

  test("Invalid is_active value returns 400", async ({ request }) => {
    if (!moduleId) {
      test.skip();
      return;
    }
    const res = await request.put(`${API}/admin/modules/${moduleId}`, {
      headers: auth(superToken),
      data: { is_active: "not_a_boolean" },
    });
    expect(res.status()).toBe(400);
  });
});

// =============================================================================
// 5. Cross-Org User Management (super_admin)
// =============================================================================

test.describe("Cross-Org User Management", () => {
  let superToken: string;
  let orgAdminToken: string;
  let orgId: number;
  let targetUserId: number;

  test.beforeAll(async ({ request }) => {
    const sa = await loginAndGetToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
    superToken = sa.token;
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    orgAdminToken = admin.token;

    // Get an org and a user within it
    const orgsRes = await request.get(`${API}/admin/organizations`, {
      headers: auth(superToken),
    });
    const orgsBody = await orgsRes.json();
    const orgs = orgsBody.data || [];
    if (Array.isArray(orgs) && orgs.length > 0) {
      // Find TechNova org or use first
      const techNova = orgs.find((o: any) => o.name && o.name.toLowerCase().includes("technova"));
      orgId = techNova ? techNova.id : orgs[0].id;
    }

    // Create a throwaway user for cross-org management tests
    const createRes = await request.post(`${API}/users`, {
      headers: auth(orgAdminToken),
      data: {
        email: `crossorg-${RUN}@technova.in`,
        first_name: "CrossOrg",
        last_name: `Test ${RUN}`,
        password: "Welcome@123",
        role: "employee",
      },
    });
    if (createRes.status() === 201) {
      targetUserId = (await createRes.json()).data.id;
    }
  });

  test("Super admin can deactivate a user in another org", async ({ request }) => {
    if (!orgId || !targetUserId) {
      test.skip();
      return;
    }
    const res = await request.put(
      `${API}/admin/organizations/${orgId}/users/${targetUserId}/deactivate`,
      { headers: auth(superToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Super admin can activate a user in another org", async ({ request }) => {
    if (!orgId || !targetUserId) {
      test.skip();
      return;
    }
    const res = await request.put(
      `${API}/admin/organizations/${orgId}/users/${targetUserId}/activate`,
      { headers: auth(superToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Super admin can reset a users password", async ({ request }) => {
    if (!orgId || !targetUserId) {
      test.skip();
      return;
    }
    const res = await request.put(
      `${API}/admin/organizations/${orgId}/users/${targetUserId}/reset-password`,
      {
        headers: auth(superToken),
        data: { new_password: "ResetPass@123" },
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Super admin password reset requires 8+ chars", async ({ request }) => {
    if (!orgId || !targetUserId) {
      test.skip();
      return;
    }
    const res = await request.put(
      `${API}/admin/organizations/${orgId}/users/${targetUserId}/reset-password`,
      {
        headers: auth(superToken),
        data: { new_password: "short" },
      },
    );
    expect(res.status()).toBe(400);
  });

  test("Super admin can change a users role", async ({ request }) => {
    if (!orgId || !targetUserId) {
      test.skip();
      return;
    }
    const res = await request.put(
      `${API}/admin/organizations/${orgId}/users/${targetUserId}/role`,
      {
        headers: auth(superToken),
        data: { role: "manager" },
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe("manager");

    // Reset back to employee
    await request.put(
      `${API}/admin/organizations/${orgId}/users/${targetUserId}/role`,
      {
        headers: auth(superToken),
        data: { role: "employee" },
      },
    );
  });

  test("Super admin role change rejects invalid role", async ({ request }) => {
    if (!orgId || !targetUserId) {
      test.skip();
      return;
    }
    const res = await request.put(
      `${API}/admin/organizations/${orgId}/users/${targetUserId}/role`,
      {
        headers: auth(superToken),
        data: { role: "super_admin" },
      },
    );
    expect(res.status()).toBe(400);
  });

  test("Org admin cannot use super admin user management (403)", async ({ request }) => {
    if (!orgId || !targetUserId) {
      test.skip();
      return;
    }
    const res = await request.put(
      `${API}/admin/organizations/${orgId}/users/${targetUserId}/deactivate`,
      { headers: auth(orgAdminToken) },
    );
    expect(res.status()).toBe(403);
  });

  test("Deactivate non-existent user returns 404", async ({ request }) => {
    if (!orgId) {
      test.skip();
      return;
    }
    const res = await request.put(
      `${API}/admin/organizations/${orgId}/users/999999/deactivate`,
      { headers: auth(superToken) },
    );
    expect(res.status()).toBe(404);
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: delete the test user
    if (targetUserId) {
      await request.delete(`${API}/users/${targetUserId}`, {
        headers: auth(orgAdminToken),
      });
    }
  });
});
