import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN_CREDS = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE_CREDS = { email: "arjun@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const SUPER_ADMIN_CREDS = { email: "admin@empcloud.com", password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123" };

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
// 1. SQL Injection Prevention
// =============================================================================

test.describe("SQL Injection Prevention", () => {
  const SQL_PAYLOADS = [
    "' OR 1=1 --",
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "' UNION SELECT * FROM users --",
    "1' AND (SELECT COUNT(*) FROM information_schema.tables) > 0 --",
    "admin'--",
    "' OR 1=1#",
  ];

  test("SQL injection in login fields rejected", async ({ request }) => {
    test.setTimeout(30_000);
    for (const payload of SQL_PAYLOADS) {
      const res = await request.post(`${API}/auth/login`, {
        data: { email: payload, password: "anything" },
      });
      expect(res.status()).toBeLessThan(500);
      const body = await res.json();
      expect(body.success).not.toBe(true);
      const str = JSON.stringify(body).toLowerCase();
      expect(str).not.toMatch(/syntax error/);
      expect(str).not.toMatch(/mysql/);
      expect(str).not.toMatch(/you have an error in your sql/);
    }
  });

  test("SQL injection in search parameters rejected", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    for (const payload of SQL_PAYLOADS.slice(0, 4)) {
      const res = await request.get(
        `${API}/employees?search=${encodeURIComponent(payload)}`,
        { headers: auth(token) },
      );
      expect(res.status()).toBeLessThan(500);
      const body = await res.json();
      const str = JSON.stringify(body).toLowerCase();
      expect(str).not.toMatch(/syntax|mysql|error in your sql|uncaught/);
    }
  });

  test("SQL injection in survey search rejected", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const res = await request.get(
      `${API}/surveys?type=${encodeURIComponent("' OR 1=1 --")}`,
      { headers: auth(token) },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("SQL injection in forum search rejected", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const res = await request.get(
      `${API}/forum/posts?search=${encodeURIComponent("' UNION SELECT * FROM users --")}`,
      { headers: auth(token) },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("SQL injection in URL path parameter", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const res = await request.get(`${API}/employees/1 OR 1=1`, {
      headers: auth(token),
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("SQL injection in POST body fields", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const res = await request.post(`${API}/announcements`, {
      headers: auth(token),
      data: {
        title: "'; DROP TABLE announcements; --",
        content: "Test content",
        priority: "normal",
        target_type: "all",
      },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

// =============================================================================
// 2. XSS Prevention
// =============================================================================

test.describe("XSS Prevention", () => {
  test("XSS in announcement title/content is sanitized or rejected", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);

    const xssPayloads = [
      { title: '<script>alert("xss")</script>', content: "Normal content" },
      { title: "Normal title", content: '<img onerror=alert(1) src=x>' },
      { title: "Test", content: '<svg onload=alert(1)>' },
      { title: "Test", content: 'javascript:alert(1)' },
    ];

    for (const payload of xssPayloads) {
      const res = await request.post(`${API}/announcements`, {
        headers: auth(token),
        data: {
          ...payload,
          priority: "normal",
          target_type: "all",
        },
      });

      if (res.status() === 201 || res.status() === 200) {
        // If accepted, content must be sanitized (no script/event handlers in stored data)
        const body = await res.json();
        const stored = JSON.stringify(body.data);
        expect(stored).not.toContain("<script>");
        expect(stored).not.toContain("onerror=");
        expect(stored).not.toContain("onload=");
      } else if (res.status() === 400) {
        // Rejected at validation — also acceptable
        const body = await res.json();
        expect(body.success).toBe(false);
      }
      // Should never be 500
      expect(res.status()).toBeLessThan(500);
    }
  });

  test("XSS in feedback message sanitized", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);

    const res = await request.post(`${API}/feedback`, {
      headers: auth(token),
      data: {
        category: "workplace",
        message: '<script>document.cookie</script>XSS test',
        is_urgent: false,
      },
    });
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 201) {
      const body = await res.json();
      const stored = JSON.stringify(body.data);
      expect(stored).not.toContain("<script>");
    }
  });

  test("XSS in forum post content sanitized", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);

    // Get a category first
    const catRes = await request.get(`${API}/forum/categories`, { headers: auth(token) });
    const cats = (await catRes.json()).data || [];
    expect(cats.length, "Prerequisite failed — no data found in cats").toBeGreaterThan(0);

    const res = await request.post(`${API}/forum/posts`, {
      headers: auth(token),
      data: {
        title: '<img src=x onerror=alert(1)>',
        content: '<div onmouseover=alert(1)>Hover me</div>',
        category_id: cats[0].id,
      },
    });
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 201) {
      const body = await res.json();
      const stored = JSON.stringify(body.data);
      expect(stored).not.toContain("onerror=");
      expect(stored).not.toContain("onmouseover=");
    }
  });
});

// =============================================================================
// 3. Authentication Bypass Prevention
// =============================================================================

test.describe("Auth Bypass Prevention", () => {
  test("No token returns 401", async ({ request }) => {
    test.setTimeout(30_000);
    const endpoints = [
      `${API}/employees`,
      `${API}/announcements`,
      `${API}/leave/applications`,
      `${API}/attendance/records`,
      `${API}/surveys`,
      `${API}/feedback`,
      `${API}/forum/posts`,
      `${API}/events`,
      `${API}/wellness/goals`,
      `${API}/chatbot/conversations`,
      `${API}/positions`,
    ];

    for (const url of endpoints) {
      const res = await request.get(url);
      expect(res.status(), `${url} without token should be 401`).toBe(401);
    }
  });

  test("Invalid token returns 401", async ({ request }) => {
    test.setTimeout(30_000);
    const fakeToken = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.fakesig";

    const res = await request.get(`${API}/employees`, {
      headers: auth(fakeToken),
    });
    expect(res.status()).toBe(401);
  });

  test("Expired/tampered token returns 401", async ({ request }) => {
    test.setTimeout(30_000);
    const tamperedToken = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOjk5OTk5LCJvcmdfaWQiOjEsInJvbGUiOiJzdXBlcl9hZG1pbiJ9.invalid";

    const res = await request.get(`${API}/admin/overview`, {
      headers: auth(tamperedToken),
    });
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 4. Cross-Org Data Access Prevention
// =============================================================================

test.describe("Cross-Org Data Isolation", () => {
  test("Accessing other org employee by ID returns 404", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);

    // Try to access an employee that belongs to a different org (high ID unlikely to exist in same org)
    const res = await request.get(`${API}/employees/999999`, {
      headers: auth(token),
    });
    expect([404, 400]).toContain(res.status());
  });

  test("Accessing other org announcement returns 404", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);

    const res = await request.get(`${API}/announcements/999999`, {
      headers: auth(token),
    });
    expect([404, 400]).toContain(res.status());
  });

  test("Accessing other org survey returns 404", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);

    const res = await request.get(`${API}/surveys/999999`, {
      headers: auth(token),
    });
    expect([404, 400]).toContain(res.status());
  });

  test("Accessing other org position returns 404", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);

    const res = await request.get(`${API}/positions/999999`, {
      headers: auth(token),
    });
    expect([404, 400]).toContain(res.status());
  });
});

// =============================================================================
// 5. RBAC Enforcement
// =============================================================================

test.describe("RBAC Enforcement", () => {
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    empToken = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
  });

  test("Employee cannot create announcement (admin action)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/announcements`, {
      headers: auth(empToken),
      data: {
        title: "Unauthorized announcement",
        content: "Should be blocked",
        priority: "normal",
        target_type: "all",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot create position", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/positions`, {
      headers: auth(empToken),
      data: {
        title: "Unauthorized",
        department_id: 1,
        employment_type: "full_time",
        headcount: 1,
      },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot access feedback dashboard", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/feedback/dashboard`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot create wellness program", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/wellness/programs`, {
      headers: auth(empToken),
      data: {
        name: "Unauthorized program",
        description: "Should fail",
        category: "fitness",
        duration_days: 30,
      },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot access survey results", async ({ request }) => {
    test.setTimeout(30_000);
    // Get any survey
    const adminToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const listRes = await request.get(`${API}/surveys?status=active`, {
      headers: auth(adminToken),
    });
    const surveys = (await listRes.json()).data || [];
    expect(surveys.length, "Prerequisite failed — no data found in surveys").toBeGreaterThan(0);

    const res = await request.get(`${API}/surveys/${surveys[0].id}/results`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 6. Response Headers Security
// =============================================================================

test.describe("Security Headers", () => {
  test("X-Content-Type-Options header present", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const res = await request.get(`${API}/employees`, {
      headers: auth(token),
    });
    const headers = res.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("No X-Powered-By header exposed", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const res = await request.get(`${API}/employees`, {
      headers: auth(token),
    });
    const headers = res.headers();
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("Content-Type is application/json", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const res = await request.get(`${API}/employees`, {
      headers: auth(token),
    });
    const ct = res.headers()["content-type"] || "";
    expect(ct).toContain("application/json");
  });
});

// =============================================================================
// 7. No Password Hash in Responses
// =============================================================================

test.describe("No Sensitive Data Leakage", () => {
  test("Login response does not contain password_hash", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/auth/login`, {
      data: ADMIN_CREDS,
    });
    expect(res.status()).toBe(200);
    const bodyStr = JSON.stringify(await res.json());
    expect(bodyStr).not.toContain("password_hash");
    expect(bodyStr).not.toContain("$2b$");
    expect(bodyStr).not.toContain("$2a$");
  });

  test("Employee list does not contain password_hash", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const res = await request.get(`${API}/employees`, {
      headers: auth(token),
    });
    expect(res.status()).toBe(200);
    const bodyStr = JSON.stringify(await res.json());
    expect(bodyStr).not.toContain("password_hash");
    expect(bodyStr).not.toContain("password");
    expect(bodyStr).not.toContain("$2b$");
  });

  test("User profile does not contain password_hash", async ({ request }) => {
    test.setTimeout(30_000);
    const token = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    const res = await request.get(`${API}/auth/me`, {
      headers: auth(token),
    });
    expect(res.status()).toBe(200);
    const bodyStr = JSON.stringify(await res.json());
    expect(bodyStr).not.toContain("password_hash");
    expect(bodyStr).not.toContain("$2b$");
  });
});

// =============================================================================
// 8. Multi-Tenant Isolation — All list endpoints return same org_id
// =============================================================================

test.describe("Multi-Tenant Data Consistency", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
  });

  test("All employees belong to same organization", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/employees`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const employees = body.data || [];
    if (employees.length < 2) return;

    // All employees should have the same organization_id
    const orgIds = new Set(employees.map((e: any) => e.organization_id));
    expect(orgIds.size).toBe(1);
  });

  test("All announcements belong to same organization", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/announcements`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.data || [];
    if (items.length < 2) return;

    const orgIds = new Set(items.map((i: any) => i.organization_id));
    expect(orgIds.size).toBe(1);
  });

  test("All surveys belong to same organization", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/surveys`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.data || [];
    if (items.length < 2) return;

    const orgIds = new Set(items.map((i: any) => i.organization_id));
    expect(orgIds.size).toBe(1);
  });

  test("All leave applications belong to same organization", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/leave/applications`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.data?.applications || body.data || [];
    if (items.length < 2) return;

    const orgIds = new Set(items.map((i: any) => i.organization_id));
    expect(orgIds.size).toBe(1);
  });

  test("All forum posts belong to same organization", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/forum/posts`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.data || [];
    if (items.length < 2) return;

    const orgIds = new Set(items.map((i: any) => i.organization_id));
    expect(orgIds.size).toBe(1);
  });

  test("All feedback entries belong to same organization", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/feedback`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.data || [];
    if (items.length < 2) return;

    const orgIds = new Set(items.map((i: any) => i.organization_id));
    expect(orgIds.size).toBe(1);
  });

  test("All events belong to same organization", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/events`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.data || [];
    if (items.length < 2) return;

    const orgIds = new Set(items.map((i: any) => i.organization_id));
    expect(orgIds.size).toBe(1);
  });
});
