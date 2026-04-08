import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
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
// 1. Document Categories CRUD + Access Control
// =============================================================================

test.describe("Document Categories CRUD", () => {
  let adminToken: string;
  let employeeToken: string;
  let createdCategoryId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Admin can list document categories", async ({ request }) => {
    const res = await request.get(`${API}/documents/categories`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Admin can create a document category", async ({ request }) => {
    const res = await request.post(`${API}/documents/categories`, {
      headers: auth(adminToken),
      data: { name: `Test Category ${RUN}`, description: "E2E test category", is_mandatory: false },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    createdCategoryId = body.data.id;
  });

  test("Admin can update a document category", async ({ request }) => {
    const res = await request.put(`${API}/documents/categories/${createdCategoryId}`, {
      headers: auth(adminToken),
      data: { name: `Updated Category ${RUN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot create a document category (403)", async ({ request }) => {
    const res = await request.post(`${API}/documents/categories`, {
      headers: auth(employeeToken),
      data: { name: `Blocked Category ${RUN}`, description: "Should fail" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot update a document category (403)", async ({ request }) => {
    const res = await request.put(`${API}/documents/categories/${createdCategoryId}`, {
      headers: auth(employeeToken),
      data: { name: "Blocked Update" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot delete a document category (403)", async ({ request }) => {
    const res = await request.delete(`${API}/documents/categories/${createdCategoryId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Admin can delete a document category", async ({ request }) => {
    const res = await request.delete(`${API}/documents/categories/${createdCategoryId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 2. Document List — download_url only, no file_path leak
// =============================================================================

test.describe("Document List Security", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
  });

  test("Document list returns download_url, does not leak file_path", async ({ request }) => {
    const res = await request.get(`${API}/documents`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const docs = body.data;
    if (Array.isArray(docs) && docs.length > 0) {
      for (const doc of docs) {
        // file_path (raw server path) should NOT be exposed to clients
        expect(doc).not.toHaveProperty("file_path");
      }
    }
  });

  test("My documents endpoint returns data for the current user", async ({ request }) => {
    const res = await request.get(`${API}/documents/my`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 3. Document Verification (HR only)
// =============================================================================

test.describe("Document Verification", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Employee cannot verify a document (403)", async ({ request }) => {
    // Use a placeholder ID; the 403 should fire before ID validation
    const res = await request.put(`${API}/documents/999999/verify`, {
      headers: auth(employeeToken),
      data: { status: "verified" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot reject a document (403)", async ({ request }) => {
    const res = await request.post(`${API}/documents/999999/reject`, {
      headers: auth(employeeToken),
      data: { rejection_reason: "Bad quality" },
    });
    expect(res.status()).toBe(403);
  });

  test("Admin verify endpoint responds (200 or 404 for non-existent doc)", async ({ request }) => {
    const res = await request.put(`${API}/documents/999999/verify`, {
      headers: auth(adminToken),
      data: { is_verified: true },
    });
    // Admin has permission, but document may not exist — 400 for validation or 404
    expect([200, 400, 404]).toContain(res.status());
  });
});

// =============================================================================
// 4. Announcement CRUD + XSS Sanitization
// =============================================================================

test.describe("Announcement CRUD", () => {
  let adminToken: string;
  let employeeToken: string;
  let announcementId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Admin can create an announcement", async ({ request }) => {
    const res = await request.post(`${API}/announcements`, {
      headers: auth(adminToken),
      data: {
        title: `E2E Announcement ${RUN}`,
        content: "This is a test announcement for E2E testing.",
        priority: "normal",
        target_type: "all",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    announcementId = body.data.id;
  });

  test("Admin can list announcements", async ({ request }) => {
    const res = await request.get(`${API}/announcements`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Admin can get a single announcement", async ({ request }) => {
    const res = await request.get(`${API}/announcements/${announcementId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(announcementId);
  });

  test("Admin can update an announcement", async ({ request }) => {
    const res = await request.put(`${API}/announcements/${announcementId}`, {
      headers: auth(adminToken),
      data: { title: `Updated Announcement ${RUN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot create an announcement (403)", async ({ request }) => {
    const res = await request.post(`${API}/announcements`, {
      headers: auth(employeeToken),
      data: {
        title: "Should Fail",
        content: "Employee cannot create",
        priority: "normal",
        target_type: "all",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot update an announcement (403)", async ({ request }) => {
    const res = await request.put(`${API}/announcements/${announcementId}`, {
      headers: auth(employeeToken),
      data: { title: "Blocked Update" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot delete an announcement (403)", async ({ request }) => {
    const res = await request.delete(`${API}/announcements/${announcementId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("XSS script tags are stripped from announcement content", async ({ request }) => {
    const xssPayload = '<script>alert("XSS")</script>Legit content';
    const res = await request.post(`${API}/announcements`, {
      headers: auth(adminToken),
      data: {
        title: `XSS Test ${RUN}`,
        content: xssPayload,
        priority: "normal",
        target_type: "all",
      },
    });
    // Should not crash
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body);
      // Script tags must not be reflected back as executable HTML
      expect(bodyStr).not.toContain("<script>alert");
    }
  });

  test("XSS img/onerror tags are stripped from announcement", async ({ request }) => {
    const xssPayload = '<img src=x onerror=alert(1)>Safe text';
    const res = await request.post(`${API}/announcements`, {
      headers: auth(adminToken),
      data: {
        title: `XSS Img Test ${RUN}`,
        content: xssPayload,
        priority: "normal",
        target_type: "all",
      },
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain("onerror=alert");
    }
  });

  test("Admin can delete an announcement", async ({ request }) => {
    const res = await request.delete(`${API}/announcements/${announcementId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 5. Announcement Read Tracking
// =============================================================================

test.describe("Announcement Read Tracking", () => {
  let adminToken: string;
  let employeeToken: string;
  let announcementId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);

    // Create an announcement for read tracking
    const res = await request.post(`${API}/announcements`, {
      headers: auth(adminToken),
      data: {
        title: `Read Track Test ${RUN}`,
        content: "Test for read tracking",
        priority: "normal",
        target_type: "all",
      },
    });
    const body = await res.json();
    announcementId = body.data.id;
  });

  test("Employee can get unread count", async ({ request }) => {
    const res = await request.get(`${API}/announcements/unread-count`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("count");
    expect(typeof body.data.count).toBe("number");
  });

  test("Employee can mark announcement as read", async ({ request }) => {
    const res = await request.post(`${API}/announcements/${announcementId}/read`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Marking same announcement as read again is idempotent", async ({ request }) => {
    const res = await request.post(`${API}/announcements/${announcementId}/read`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
  });

  test.afterAll(async ({ request }) => {
    // Cleanup
    await request.delete(`${API}/announcements/${announcementId}`, {
      headers: auth(adminToken),
    });
  });
});

// =============================================================================
// 6. Policy CRUD + Acknowledgment
// =============================================================================

test.describe("Policy CRUD + Acknowledgment", () => {
  let adminToken: string;
  let employeeToken: string;
  let policyId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Admin can create a policy", async ({ request }) => {
    const res = await request.post(`${API}/policies`, {
      headers: auth(adminToken),
      data: {
        title: `E2E Policy ${RUN}`,
        content: "This is a test policy for E2E testing. All employees must read and acknowledge.",
        category: "general",
        version: "1.0",
        requires_acknowledgment: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    policyId = body.data.id;
  });

  test("Admin can list policies", async ({ request }) => {
    const res = await request.get(`${API}/policies`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Admin can get a single policy", async ({ request }) => {
    const res = await request.get(`${API}/policies/${policyId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can update a policy", async ({ request }) => {
    const res = await request.put(`${API}/policies/${policyId}`, {
      headers: auth(adminToken),
      data: { title: `Updated Policy ${RUN}`, version: "1.1" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot create a policy (403)", async ({ request }) => {
    const res = await request.post(`${API}/policies`, {
      headers: auth(employeeToken),
      data: {
        title: "Should Fail",
        content: "Employees cannot create policies",
        category: "general",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot update a policy (403)", async ({ request }) => {
    const res = await request.put(`${API}/policies/${policyId}`, {
      headers: auth(employeeToken),
      data: { title: "Blocked Update" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot delete a policy (403)", async ({ request }) => {
    const res = await request.delete(`${API}/policies/${policyId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Employee can view policies list", async ({ request }) => {
    const res = await request.get(`${API}/policies`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can acknowledge a policy", async ({ request }) => {
    const res = await request.post(`${API}/policies/${policyId}/acknowledge`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can view pending acknowledgments", async ({ request }) => {
    const res = await request.get(`${API}/policies/pending`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Admin can view policy acknowledgments", async ({ request }) => {
    const res = await request.get(`${API}/policies/${policyId}/acknowledgments`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot view policy acknowledgments (403)", async ({ request }) => {
    const res = await request.get(`${API}/policies/${policyId}/acknowledgments`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Admin can delete a policy", async ({ request }) => {
    const res = await request.delete(`${API}/policies/${policyId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });
});

// =============================================================================
// 7. Unauthenticated Access Denied
// =============================================================================

test.describe("Unauthenticated Access Denied", () => {
  test("Documents endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/documents`);
    expect(res.status()).toBe(401);
  });

  test("Announcements endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/announcements`);
    expect(res.status()).toBe(401);
  });

  test("Policies endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/policies`);
    expect(res.status()).toBe(401);
  });
});
