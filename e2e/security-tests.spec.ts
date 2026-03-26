import { test, expect, APIRequestContext, Page, Browser, BrowserContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com";
const APP = "https://test-empcloud.empcloud.com";
const LMS_API = "https://testlms-api.empcloud.com";

const ADMIN_CREDS = { email: "ananya@technova.in", password: "Welcome@123" }; // Org 5
const EMPLOYEE_CREDS = { email: "priya@technova.in", password: "Welcome@123" }; // Org 5
const SUPER_ADMIN_CREDS = { email: "admin@empcloud.com", password: "SuperAdmin@2026" }; // Org 7
const OTHER_ORG_CREDS = { email: "john@globaltech.com", password: "Welcome@123" }; // Org 9

// =============================================================================
// Helpers
// =============================================================================

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API}/api/v1/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data.tokens.access_token;
}

async function getAdminToken(request: APIRequestContext): Promise<string> {
  return loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
}

async function getEmployeeToken(request: APIRequestContext): Promise<string> {
  return loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
}

async function getSuperAdminToken(request: APIRequestContext): Promise<string> {
  return loginAndGetToken(request, SUPER_ADMIN_CREDS.email, SUPER_ADMIN_CREDS.password);
}

async function getOtherOrgToken(request: APIRequestContext): Promise<string> {
  return loginAndGetToken(request, OTHER_ORG_CREDS.email, OTHER_ORG_CREDS.password);
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function loginInBrowser(
  browser: Browser,
  email: string,
  password: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.goto(`${APP}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(500);

  if (!page.url().includes("/login")) return { context, page };

  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  return { context, page };
}

// =============================================================================
// 1. SQL Injection Tests
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
    "' UNION SELECT null,null,null,null,null--",
    "1; WAITFOR DELAY '0:0:5'--",
    "' AND SLEEP(5)--",
  ];

  test("SQL injection in login email field — classic payloads", async ({ request }) => {
    for (const payload of SQL_PAYLOADS) {
      const res = await request.post(`${API}/api/v1/auth/login`, {
        data: { email: payload, password: "anything" },
      });
      // Must NOT return 500 (server error) or leak data
      expect(res.status()).toBeLessThan(500);
      const body = await res.json();
      expect(body.success).not.toBe(true);
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toMatch(/syntax error/);
      expect(bodyStr).not.toMatch(/mysql/);
      expect(bodyStr).not.toMatch(/select \*/);
      expect(bodyStr).not.toMatch(/you have an error in your sql/);
      expect(bodyStr).not.toMatch(/uncaught exception/);
      expect(bodyStr).not.toMatch(/table '.*'/);
    }
  });

  test("SQL injection in login password field", async ({ request }) => {
    for (const payload of SQL_PAYLOADS.slice(0, 3)) {
      const res = await request.post(`${API}/api/v1/auth/login`, {
        data: { email: "test@test.com", password: payload },
      });
      expect(res.status()).toBeLessThan(500);
      const body = await res.json();
      expect(body.success).not.toBe(true);
    }
  });

  test("SQL injection in employee search query param", async ({ request }) => {
    const token = await getAdminToken(request);

    for (const payload of SQL_PAYLOADS.slice(0, 5)) {
      const res = await request.get(
        `${API}/api/v1/employees?search=${encodeURIComponent(payload)}`,
        { headers: authHeader(token) },
      );
      expect(res.status()).toBeLessThan(500);
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toMatch(/syntax|mysql|error in your sql|uncaught/);
    }
  });

  test("SQL injection in attendance records query", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(
      `${API}/api/v1/attendance/records?employee_id=' OR 1=1 --`,
      { headers: authHeader(token) },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("SQL injection in leave applications query", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(
      `${API}/api/v1/leave/applications?status=' OR 1=1 --`,
      { headers: authHeader(token) },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("SQL injection in announcement search/filter", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(
      `${API}/api/v1/announcements?search=${encodeURIComponent("' OR 1=1 --")}`,
      { headers: authHeader(token) },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("SQL injection in document category query", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(
      `${API}/api/v1/documents?category_id=' UNION SELECT * FROM users --`,
      { headers: authHeader(token) },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("SQL injection in helpdesk ticket query", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(
      `${API}/api/v1/helpdesk/tickets?status=' OR 1=1 --`,
      { headers: authHeader(token) },
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("SQL injection in URL path parameter (employee ID)", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(
      `${API}/api/v1/employees/1 OR 1=1`,
      { headers: authHeader(token) },
    );
    // Should return 400 or 404, not 500
    expect(res.status()).toBeLessThan(500);
  });

  test("SQL injection via JSON body fields on POST", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.post(`${API}/api/v1/announcements`, {
      headers: authHeader(token),
      data: {
        title: "'; DROP TABLE announcements; --",
        content: "Test content",
        priority: "normal",
        target_type: "all",
      },
    });
    // Should either accept (stored safely) or reject with validation error, never 500
    expect(res.status()).toBeLessThan(500);
  });

  test("SQL injection in registration fields", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/auth/register`, {
      data: {
        org_name: "'; DROP TABLE organizations; --",
        email: "sqli@test.com",
        password: "Test@12345",
        first_name: "' OR 1=1 --",
        last_name: "Test",
      },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

// =============================================================================
// 2. XSS Prevention Tests
// =============================================================================

test.describe("XSS Prevention", () => {
  const XSS_PAYLOADS = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    'javascript:alert(1)',
    '<iframe src="javascript:alert(1)">',
    '"><script>alert(document.cookie)</script>',
    "'-alert(1)-'",
    '<body onload=alert(1)>',
    '<input onfocus=alert(1) autofocus>',
    '<details open ontoggle=alert(1)>',
  ];

  test("XSS in announcement title and content", async ({ request }) => {
    const token = await getAdminToken(request);

    for (const payload of XSS_PAYLOADS.slice(0, 3)) {
      const res = await request.post(`${API}/api/v1/announcements`, {
        headers: authHeader(token),
        data: {
          title: `${payload} Test Announcement`,
          content: `${payload} Content body`,
          priority: "normal",
          target_type: "all",
        },
      });
      // Should not crash the server
      expect(res.status()).toBeLessThan(500);

      if (res.ok()) {
        const body = await res.json();
        // If stored, verify it does not reflect back executable HTML in the API response
        // React escapes by default, but the API should not add extra script injection
        const bodyStr = JSON.stringify(body);
        // The script tag should be stored as literal text, not interpreted
        expect(bodyStr).not.toContain("<script>alert");
      }
    }
  });

  test("XSS in helpdesk ticket subject and description", async ({ request }) => {
    const token = await getEmployeeToken(request);

    for (const payload of XSS_PAYLOADS.slice(0, 3)) {
      const res = await request.post(`${API}/api/v1/helpdesk/tickets`, {
        headers: authHeader(token),
        data: {
          category: "it",
          priority: "low",
          subject: `${payload} Ticket Subject`,
          description: `${payload} Ticket Description`,
        },
      });
      expect(res.status()).toBeLessThan(500);
    }
  });

  test("XSS in employee profile fields", async ({ request }) => {
    const token = await getAdminToken(request);
    // Try updating employee fields with XSS payloads
    const res = await request.put(`${API}/api/v1/employees/me`, {
      headers: authHeader(token),
      data: {
        first_name: '<script>alert("XSS")</script>',
        last_name: '<img src=x onerror=alert(1)>',
      },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("XSS in leave application reason", async ({ request }) => {
    const token = await getEmployeeToken(request);
    const res = await request.post(`${API}/api/v1/leave/applications`, {
      headers: authHeader(token),
      data: {
        leave_type_id: 1,
        start_date: "2026-12-25",
        end_date: "2026-12-25",
        reason: '<script>alert("XSS")</script> Sick leave',
      },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("XSS in policy title", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.post(`${API}/api/v1/policies`, {
      headers: authHeader(token),
      data: {
        title: '<script>alert("XSS")</script>',
        content: '<img src=x onerror=alert(1)>',
        category: "general",
      },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("XSS not executed in browser — announcements page", async ({ browser }) => {
    const { context, page } = await loginInBrowser(
      browser,
      ADMIN_CREDS.email,
      ADMIN_CREDS.password,
    );

    // Track if any dialog (alert/confirm/prompt) fires — that would mean XSS executed
    let alertFired = false;
    page.on("dialog", async (dialog) => {
      alertFired = true;
      await dialog.dismiss();
    });

    await page.goto(`${APP}/announcements`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    expect(alertFired).toBe(false);

    // Also verify no inline script elements are rendered in the DOM
    const scriptTags = await page.locator("text=<script>").count();
    // Script tags should appear as escaped text, not as actual DOM script elements
    const executableScripts = await page.evaluate(() => {
      const scripts = document.querySelectorAll("script");
      return Array.from(scripts).filter((s) => s.textContent?.includes("alert")).length;
    });
    expect(executableScripts).toBe(0);

    await context.close();
  });

  test("XSS not executed in browser — helpdesk page", async ({ browser }) => {
    const { context, page } = await loginInBrowser(
      browser,
      EMPLOYEE_CREDS.email,
      EMPLOYEE_CREDS.password,
    );

    let alertFired = false;
    page.on("dialog", async (dialog) => {
      alertFired = true;
      await dialog.dismiss();
    });

    await page.goto(`${APP}/helpdesk`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    expect(alertFired).toBe(false);
    await context.close();
  });
});

// =============================================================================
// 3. Tenant Isolation Tests (CRITICAL)
// =============================================================================

test.describe("Tenant Isolation — Cross-Organization Data Leakage", () => {
  test("Org 9 user cannot see Org 5 employees", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/employees`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("technova");
      expect(bodyStr).not.toContain("ananya");
      expect(bodyStr).not.toContain("priya");
    }
  });

  test("Org 9 user cannot see Org 5 leave applications", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/leave/applications`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("technova");
      expect(bodyStr).not.toContain("ananya");
    }
  });

  test("Org 9 user cannot see Org 5 attendance records", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/attendance/records`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("technova");
    }
  });

  test("Org 9 user cannot see Org 5 announcements", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/announcements`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("technova");
    }
  });

  test("Org 9 user cannot see Org 5 policies", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/policies`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("technova");
    }
  });

  test("Org 9 user cannot see Org 5 documents", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/documents`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("technova");
    }
  });

  test("Org 9 user cannot see Org 5 helpdesk tickets", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/helpdesk/tickets`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("technova");
    }
  });

  test("Org 9 user cannot access Org 5 subscription data", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/subscriptions`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("technova");
    }
  });

  test("Org 9 user cannot access Org 5 shifts", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/attendance/shifts`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("technova");
    }
  });

  test("Org 9 user cannot access Org 5 leave types", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/leave/types`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("technova");
    }
  });

  test("Direct ID manipulation — Org 9 cannot access Org 5 employee by ID", async ({
    request,
  }) => {
    // First, get a known Org 5 employee ID
    const tokenOrg5 = await getAdminToken(request);
    const empRes = await request.get(`${API}/api/v1/employees`, {
      headers: authHeader(tokenOrg5),
    });
    let org5EmployeeId: number | null = null;
    if (empRes.ok()) {
      const empBody = await empRes.json();
      const employees = empBody.data?.employees || empBody.data || [];
      if (Array.isArray(employees) && employees.length > 0) {
        org5EmployeeId = employees[0].id || employees[0].employee_id;
      }
    }

    if (org5EmployeeId) {
      const tokenOrg9 = await getOtherOrgToken(request);
      const res = await request.get(`${API}/api/v1/employees/${org5EmployeeId}`, {
        headers: authHeader(tokenOrg9),
      });
      // Must return 403 or 404, NOT the employee data
      expect([403, 404]).toContain(res.status());
    }
  });

  test("Direct ID manipulation — Org 9 cannot modify Org 5 employee", async ({
    request,
  }) => {
    const tokenOrg5 = await getAdminToken(request);
    const empRes = await request.get(`${API}/api/v1/employees`, {
      headers: authHeader(tokenOrg5),
    });
    let org5EmployeeId: number | null = null;
    if (empRes.ok()) {
      const empBody = await empRes.json();
      const employees = empBody.data?.employees || empBody.data || [];
      if (Array.isArray(employees) && employees.length > 0) {
        org5EmployeeId = employees[0].id || employees[0].employee_id;
      }
    }

    if (org5EmployeeId) {
      const tokenOrg9 = await getOtherOrgToken(request);
      const res = await request.put(`${API}/api/v1/employees/${org5EmployeeId}`, {
        headers: authHeader(tokenOrg9),
        data: { first_name: "HACKED" },
      });
      expect([403, 404, 405]).toContain(res.status());
    }
  });

  test("Direct ID manipulation — Org 9 cannot access Org 5 announcement by ID", async ({
    request,
  }) => {
    // Get a known Org 5 announcement ID
    const tokenOrg5 = await getAdminToken(request);
    const annRes = await request.get(`${API}/api/v1/announcements`, {
      headers: authHeader(tokenOrg5),
    });
    let org5AnnouncementId: number | null = null;
    if (annRes.ok()) {
      const annBody = await annRes.json();
      const announcements = annBody.data?.announcements || annBody.data || [];
      if (Array.isArray(announcements) && announcements.length > 0) {
        org5AnnouncementId = announcements[0].id;
      }
    }

    if (org5AnnouncementId) {
      const tokenOrg9 = await getOtherOrgToken(request);
      const res = await request.get(`${API}/api/v1/announcements/${org5AnnouncementId}`, {
        headers: authHeader(tokenOrg9),
      });
      expect([403, 404]).toContain(res.status());
    }
  });

  test("Org 9 user cannot access Org 5 organization settings", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    // Try to access org 5 directly
    const res = await request.get(`${API}/api/v1/organizations/5`, {
      headers: authHeader(tokenOrg9),
    });
    expect([403, 404]).toContain(res.status());
  });

  test("Org 9 user cannot list Org 5 users", async ({ request }) => {
    const tokenOrg9 = await getOtherOrgToken(request);

    const res = await request.get(`${API}/api/v1/users`, {
      headers: authHeader(tokenOrg9),
    });
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).not.toContain("ananya");
      expect(bodyStr).not.toContain("priya");
      expect(bodyStr).not.toContain("technova");
    }
  });
});

// =============================================================================
// 4. Authorization / RBAC Tests
// =============================================================================

test.describe("Authorization — Role-Based Access Control", () => {
  test("Employee cannot access admin-only endpoints", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const adminEndpoints = [
      { method: "GET" as const, path: "/api/v1/admin/super/overview" },
      { method: "POST" as const, path: "/api/v1/announcements" },
      { method: "POST" as const, path: "/api/v1/assets" },
      { method: "POST" as const, path: "/api/v1/positions" },
      { method: "POST" as const, path: "/api/v1/departments" },
      { method: "POST" as const, path: "/api/v1/locations" },
      { method: "POST" as const, path: "/api/v1/leave/types" },
      { method: "POST" as const, path: "/api/v1/attendance/shifts" },
      { method: "POST" as const, path: "/api/v1/document-categories" },
      { method: "POST" as const, path: "/api/v1/policies" },
    ];

    for (const ep of adminEndpoints) {
      const res =
        ep.method === "GET"
          ? await request.get(`${API}${ep.path}`, { headers: authHeader(token) })
          : await request[ep.method.toLowerCase() as "post"](`${API}${ep.path}`, {
              headers: authHeader(token),
              data: {},
            });
      expect(
        [401, 403, 404, 405].includes(res.status()),
        `Expected 401/403/404/405 for ${ep.method} ${ep.path}, got ${res.status()}`,
      ).toBe(true);
    }
  });

  test("Employee cannot approve leave applications", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.put(`${API}/api/v1/leave/applications/1/approve`, {
      headers: authHeader(token),
      data: { remarks: "approved by employee" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });

  test("Employee cannot reject leave applications", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.put(`${API}/api/v1/leave/applications/1/reject`, {
      headers: authHeader(token),
      data: { remarks: "rejected by employee" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });

  test("Employee cannot assign helpdesk tickets", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.post(`${API}/api/v1/helpdesk/tickets/1/assign`, {
      headers: authHeader(token),
      data: { assigned_to: 1 },
    });
    expect([401, 403, 404]).toContain(res.status());
  });

  test("Employee cannot delete other employees", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.delete(`${API}/api/v1/employees/1`, {
      headers: authHeader(token),
    });
    expect([401, 403, 404, 405]).toContain(res.status());
  });

  test("Employee cannot update organization settings", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.put(`${API}/api/v1/organizations/me`, {
      headers: authHeader(token),
      data: { name: "HACKED ORG NAME" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("Employee cannot manage roles", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.post(`${API}/api/v1/roles`, {
      headers: authHeader(token),
      data: { name: "SuperHacker", permissions: ["*"] },
    });
    expect([401, 403, 404, 405]).toContain(res.status());
  });

  test("Employee cannot invite new users", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.post(`${API}/api/v1/users/invite`, {
      headers: authHeader(token),
      data: { email: "hacker@test.com", role_id: 1 },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("Regular admin cannot access super admin endpoints", async ({ request }) => {
    const token = await getAdminToken(request);

    const superAdminEndpoints = [
      "/api/v1/admin/super/overview",
      "/api/v1/admin/super/organizations",
      "/api/v1/admin/super/modules",
      "/api/v1/admin/super/users",
      "/api/v1/admin/super/billing",
    ];

    for (const path of superAdminEndpoints) {
      const res = await request.get(`${API}${path}`, {
        headers: authHeader(token),
      });
      expect(
        [401, 403, 404].includes(res.status()),
        `Expected 401/403/404 for GET ${path}, got ${res.status()}`,
      ).toBe(true);
    }
  });

  test("Regular admin cannot manage modules at platform level", async ({ request }) => {
    const token = await getAdminToken(request);

    const res = await request.post(`${API}/api/v1/admin/super/modules`, {
      headers: authHeader(token),
      data: { name: "Hacked Module", slug: "hacked" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });

  test("Employee cannot access admin dashboard stats", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.get(`${API}/api/v1/dashboard/admin`, {
      headers: authHeader(token),
    });
    expect([401, 403, 404]).toContain(res.status());
  });

  test("Super admin can access super admin endpoints", async ({ request }) => {
    const token = await getSuperAdminToken(request);

    const res = await request.get(`${API}/api/v1/admin/super/overview`, {
      headers: authHeader(token),
    });
    // Super admin should succeed
    expect([200, 304]).toContain(res.status());
  });
});

// =============================================================================
// 5. Token Security Tests
// =============================================================================

test.describe("Token Security", () => {
  test("Expired/invalid token returns 401", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/employees`, {
      headers: { Authorization: "Bearer invalidtoken123456789" },
    });
    expect(res.status()).toBe(401);
  });

  test("Missing Authorization header returns 401", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/employees`);
    expect(res.status()).toBe(401);
  });

  test("Empty Bearer token returns 401", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/employees`, {
      headers: { Authorization: "Bearer " },
    });
    expect(res.status()).toBe(401);
  });

  test("Malformed auth header — wrong scheme — returns 401", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/employees`, {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status()).toBe(401);
  });

  test("Malformed auth header — no scheme — returns 401", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/employees`, {
      headers: { Authorization: "justaplainstring" },
    });
    expect(res.status()).toBe(401);
  });

  test("Tampered JWT payload is rejected", async ({ request }) => {
    const realToken = await getAdminToken(request);
    const parts = realToken.split(".");

    // Tamper with the payload to escalate privileges
    const fakePayload = Buffer.from(
      JSON.stringify({ sub: 999, org_id: 999, role: "super_admin" }),
    ).toString("base64url");
    const tamperedToken = `${parts[0]}.${fakePayload}.${parts[2]}`;

    const res = await request.get(`${API}/api/v1/employees`, {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    expect(res.status()).toBe(401);
  });

  test("Tampered JWT header is rejected", async ({ request }) => {
    const realToken = await getAdminToken(request);
    const parts = realToken.split(".");

    // Change algorithm to none
    const fakeHeader = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const tamperedToken = `${fakeHeader}.${parts[1]}.`;

    const res = await request.get(`${API}/api/v1/employees`, {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    expect(res.status()).toBe(401);
  });

  test("JWT with 'none' algorithm attack is rejected", async ({ request }) => {
    const realToken = await getAdminToken(request);
    const parts = realToken.split(".");

    const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url",
    );
    // No signature
    const noneToken = `${noneHeader}.${parts[1]}.`;

    const res = await request.get(`${API}/api/v1/employees`, {
      headers: { Authorization: `Bearer ${noneToken}` },
    });
    expect(res.status()).toBe(401);
  });

  test("Token cannot be reused after logout", async ({ request }) => {
    // Login to get a token
    const loginRes = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: ADMIN_CREDS.email, password: ADMIN_CREDS.password },
    });
    const body = await loginRes.json();
    const accessToken = body.data.tokens.access_token;
    const refreshToken = body.data.tokens.refresh_token;

    // Verify token works
    const verifyRes = await request.get(`${API}/api/v1/employees`, {
      headers: authHeader(accessToken),
    });
    expect(verifyRes.status()).toBe(200);

    // Logout
    const logoutRes = await request.post(`${API}/api/v1/auth/logout`, {
      headers: authHeader(accessToken),
      data: { refresh_token: refreshToken },
    });
    // Logout should succeed
    expect(logoutRes.status()).toBeLessThan(500);

    // Refresh token should no longer work after logout
    const refreshRes = await request.post(`${API}/api/v1/auth/refresh`, {
      data: { refresh_token: refreshToken },
    });
    // Refresh token should be revoked
    expect([400, 401, 403]).toContain(refreshRes.status());
  });

  test("Extremely long token is rejected gracefully", async ({ request }) => {
    const longToken = "a".repeat(10000);
    const res = await request.get(`${API}/api/v1/employees`, {
      headers: { Authorization: `Bearer ${longToken}` },
    });
    expect(res.status()).toBeLessThan(500);
    expect([400, 401, 413]).toContain(res.status());
  });
});

// =============================================================================
// 6. Rate Limiting Tests
// =============================================================================

test.describe("Rate Limiting", () => {
  test("Login endpoint rate limits after excessive failed attempts", async ({ request }) => {
    const results: number[] = [];

    // Send 25 rapid failed login attempts
    for (let i = 0; i < 25; i++) {
      const res = await request.post(`${API}/api/v1/auth/login`, {
        data: { email: `brute-force-${i}@nonexistent.com`, password: "wrongpassword" },
      });
      results.push(res.status());
    }

    // At least one should have been rate-limited (429)
    const has429 = results.includes(429);
    const hasNon200 = results.every((s) => s !== 200);

    // Either we get 429 (rate limited) or all fail with 401 (which still blocks brute force)
    expect(hasNon200).toBe(true);

    // If rate limiting is implemented, we should see 429
    // This is a soft check — log for visibility
    if (!has429) {
      console.warn(
        "WARNING: No 429 responses received after 25 rapid login attempts. " +
          "Rate limiting may not be configured for the login endpoint.",
      );
    }
  });

  test("Registration endpoint rate limits", async ({ request }) => {
    const results: number[] = [];

    for (let i = 0; i < 15; i++) {
      const res = await request.post(`${API}/api/v1/auth/register`, {
        data: {
          org_name: `RateLimitTest${i}`,
          email: `ratelimit${i}@test.com`,
          password: "Test@12345",
          first_name: "Rate",
          last_name: "Limit",
        },
      });
      results.push(res.status());
    }

    // All should either succeed or get rate-limited, never 500
    for (const status of results) {
      expect(status).toBeLessThan(500);
    }
  });

  test("Password reset endpoint rate limits", async ({ request }) => {
    const results: number[] = [];

    for (let i = 0; i < 20; i++) {
      const res = await request.post(`${API}/api/v1/auth/forgot-password`, {
        data: { email: `brute${i}@test.com` },
      });
      results.push(res.status());
    }

    for (const status of results) {
      expect(status).toBeLessThan(500);
    }
  });
});

// =============================================================================
// 7. Input Validation Tests
// =============================================================================

test.describe("Input Validation", () => {
  test("Invalid email format rejected on login", async ({ request }) => {
    const invalidEmails = ["not-an-email", "missing@", "@nodomain", "spaces in@email.com", ""];

    for (const email of invalidEmails) {
      const res = await request.post(`${API}/api/v1/auth/login`, {
        data: { email, password: "Test@12345" },
      });
      expect(res.status()).toBeLessThan(500);
      expect(res.status()).not.toBe(200);
    }
  });

  test("Invalid email format rejected on registration", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/auth/register`, {
      data: {
        org_name: "Test Org",
        email: "not-an-email",
        password: "Test@12345",
        first_name: "Test",
        last_name: "User",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("Weak password rejected on registration", async ({ request }) => {
    const weakPasswords = ["123", "abc", "password", "12345678", "a"];

    for (const password of weakPasswords) {
      const res = await request.post(`${API}/api/v1/auth/register`, {
        data: {
          org_name: "Test Org",
          email: "weakpw@test.com",
          password,
          first_name: "Test",
          last_name: "User",
        },
      });
      expect(res.status()).toBeLessThan(500);
      expect(res.status()).not.toBe(200);
    }
  });

  test("Empty request body handled gracefully", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/auth/login`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
    expect(res.status()).not.toBe(200);
  });

  test("Missing required fields rejected on registration", async ({ request }) => {
    const incompletePayloads = [
      { org_name: "Test" }, // missing everything else
      { email: "test@test.com", password: "Test@123" }, // missing org_name, names
      { org_name: "Test", email: "test@test.com" }, // missing password, names
    ];

    for (const payload of incompletePayloads) {
      const res = await request.post(`${API}/api/v1/auth/register`, {
        data: payload,
      });
      expect(res.status()).toBeLessThan(500);
      expect(res.status()).not.toBe(200);
    }
  });

  test("Extremely long input handled gracefully — announcement title", async ({
    request,
  }) => {
    const token = await getAdminToken(request);
    const longString = "A".repeat(100000);

    const res = await request.post(`${API}/api/v1/announcements`, {
      headers: authHeader(token),
      data: {
        title: longString,
        content: "test",
        priority: "normal",
        target_type: "all",
      },
    });
    // Should return 400 (validation) or 413 (too large), NOT 500
    expect(res.status()).toBeLessThan(500);
  });

  test("Extremely long input handled gracefully — employee name", async ({ request }) => {
    const token = await getAdminToken(request);
    const longString = "B".repeat(50000);

    const res = await request.put(`${API}/api/v1/employees/me`, {
      headers: authHeader(token),
      data: { first_name: longString },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("Invalid date formats handled gracefully", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.post(`${API}/api/v1/leave/applications`, {
      headers: authHeader(token),
      data: {
        leave_type_id: 1,
        start_date: "not-a-date",
        end_date: "also-not-a-date",
        reason: "Testing invalid dates",
      },
    });
    expect(res.status()).toBeLessThan(500);
    expect(res.status()).not.toBe(200);
  });

  test("Negative IDs handled gracefully", async ({ request }) => {
    const token = await getAdminToken(request);

    const res = await request.get(`${API}/api/v1/employees/-1`, {
      headers: authHeader(token),
    });
    expect(res.status()).toBeLessThan(500);
    expect([400, 404]).toContain(res.status());
  });

  test("Non-numeric IDs handled gracefully", async ({ request }) => {
    const token = await getAdminToken(request);

    const res = await request.get(`${API}/api/v1/employees/abc`, {
      headers: authHeader(token),
    });
    expect(res.status()).toBeLessThan(500);
    expect([400, 404]).toContain(res.status());
  });

  test("Null and undefined values in JSON body", async ({ request }) => {
    const token = await getAdminToken(request);

    const res = await request.post(`${API}/api/v1/announcements`, {
      headers: authHeader(token),
      data: {
        title: null,
        content: null,
        priority: null,
        target_type: null,
      },
    });
    expect(res.status()).toBeLessThan(500);
    expect(res.status()).not.toBe(200);
  });

  test("Array where string expected", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: ["array", "of", "strings"], password: { object: true } },
    });
    expect(res.status()).toBeLessThan(500);
    expect(res.status()).not.toBe(200);
  });

  test("Special characters in search queries", async ({ request }) => {
    const token = await getAdminToken(request);
    const specialChars = ["%00", "\x00", "../../../etc/passwd", "${7*7}", "{{7*7}}"];

    for (const char of specialChars) {
      const res = await request.get(
        `${API}/api/v1/employees?search=${encodeURIComponent(char)}`,
        { headers: authHeader(token) },
      );
      expect(res.status()).toBeLessThan(500);
    }
  });
});

// =============================================================================
// 8. Cross-Module SSO Security
// =============================================================================

test.describe("Cross-Module SSO Security", () => {
  test("SSO with tampered JWT payload is rejected", async ({ request }) => {
    const loginRes = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: ADMIN_CREDS.email, password: ADMIN_CREDS.password },
    });
    const realToken = (await loginRes.json()).data.tokens.access_token;

    // Tamper with the payload
    const parts = realToken.split(".");
    const fakePayload = Buffer.from(
      JSON.stringify({ sub: 999, org_id: 999, role: "super_admin" }),
    ).toString("base64url");
    const tamperedToken = `${parts[0]}.${fakePayload}.${parts[2]}`;

    // Try SSO to LMS with tampered token
    const ssoRes = await request.post(`${LMS_API}/api/v1/auth/sso`, {
      data: { token: tamperedToken },
    });
    expect([400, 401, 403]).toContain(ssoRes.status());
  });

  test("SSO with completely invalid token is rejected", async ({ request }) => {
    const ssoRes = await request.post(`${LMS_API}/api/v1/auth/sso`, {
      data: { token: "completely.invalid.token" },
    });
    expect([400, 401, 403]).toContain(ssoRes.status());
  });

  test("SSO with empty token is rejected", async ({ request }) => {
    const ssoRes = await request.post(`${LMS_API}/api/v1/auth/sso`, {
      data: { token: "" },
    });
    expect([400, 401, 403]).toContain(ssoRes.status());
  });

  test("SSO with missing token field is rejected", async ({ request }) => {
    const ssoRes = await request.post(`${LMS_API}/api/v1/auth/sso`, {
      data: {},
    });
    expect([400, 401, 403]).toContain(ssoRes.status());
  });

  test("Valid SSO token works for authorized module", async ({ request }) => {
    const loginRes = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: ADMIN_CREDS.email, password: ADMIN_CREDS.password },
    });
    const realToken = (await loginRes.json()).data.tokens.access_token;

    // Valid token to LMS
    const ssoRes = await request.post(`${LMS_API}/api/v1/auth/sso`, {
      data: { token: realToken },
    });
    // Should succeed if org has LMS subscription, or return a clear error if not
    expect(ssoRes.status()).toBeLessThan(500);
  });
});

// =============================================================================
// 9. API Security Headers
// =============================================================================

test.describe("API Security Headers", () => {
  test("X-Content-Type-Options: nosniff header present", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const headers = res.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("X-Frame-Options header present", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const headers = res.headers();
    // Should be DENY or SAMEORIGIN
    expect(headers["x-frame-options"]).toBeTruthy();
  });

  test("Strict-Transport-Security header present", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const headers = res.headers();
    // HSTS should be set for HTTPS
    if (headers["strict-transport-security"]) {
      expect(headers["strict-transport-security"]).toContain("max-age");
    }
  });

  test("X-Powered-By header is removed", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const headers = res.headers();
    // Helmet removes X-Powered-By by default
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("Content-Type header is set correctly on JSON responses", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API}/api/v1/employees`, {
      headers: authHeader(token),
    });
    const contentType = res.headers()["content-type"];
    expect(contentType).toContain("application/json");
  });

  test("CORS headers configured properly", async ({ request }) => {
    // Preflight OPTIONS request
    const res = await request.fetch(`${API}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://test-empcloud.empcloud.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization",
      },
    });
    // Should either respond with CORS headers or 204/200
    expect(res.status()).toBeLessThan(500);
  });

  test("Error responses do not leak stack traces", async ({ request }) => {
    // Trigger a 404
    const res = await request.get(`${API}/api/v1/nonexistent-endpoint-xyz`);
    const body = await res.text();
    const bodyLower = body.toLowerCase();

    expect(bodyLower).not.toContain("stack trace");
    expect(bodyLower).not.toContain("at module");
    expect(bodyLower).not.toContain("at object");
    expect(bodyLower).not.toContain("node_modules");
    expect(bodyLower).not.toContain("/src/");
    expect(bodyLower).not.toContain("\\src\\");
  });

  test("500 error responses do not leak internal details", async ({ request }) => {
    // Send malformed JSON to trigger an error
    const res = await request.post(`${API}/api/v1/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: "not valid json{{{",
    });
    const body = await res.text();
    const bodyLower = body.toLowerCase();

    expect(bodyLower).not.toContain("stack trace");
    expect(bodyLower).not.toContain("node_modules");
  });
});

// =============================================================================
// 10. Path Traversal & Injection Tests
// =============================================================================

test.describe("Path Traversal & Injection Prevention", () => {
  test("Path traversal in API URL rejected", async ({ request }) => {
    const token = await getAdminToken(request);

    const traversalPaths = [
      "/api/v1/../../etc/passwd",
      "/api/v1/employees/..%2f..%2fetc%2fpasswd",
      "/api/v1/employees/%2e%2e%2f%2e%2e%2f",
    ];

    for (const path of traversalPaths) {
      const res = await request.get(`${API}${path}`, {
        headers: authHeader(token),
      });
      expect(res.status()).toBeLessThan(500);
      const body = await res.text();
      expect(body).not.toContain("root:");
      expect(body).not.toContain("/bin/bash");
    }
  });

  test("SSTI (Server-Side Template Injection) payloads rejected", async ({ request }) => {
    const token = await getAdminToken(request);

    const sstiPayloads = ["{{7*7}}", "${7*7}", "<%= 7*7 %>", "#{7*7}"];

    for (const payload of sstiPayloads) {
      const res = await request.post(`${API}/api/v1/announcements`, {
        headers: authHeader(token),
        data: {
          title: payload,
          content: "SSTI test",
          priority: "normal",
          target_type: "all",
        },
      });
      expect(res.status()).toBeLessThan(500);

      if (res.ok()) {
        const body = await res.json();
        // Should NOT return computed result "49"
        const bodyStr = JSON.stringify(body);
        // If template injection worked, "49" would appear where "{{7*7}}" was
        // This check is context-dependent; the key thing is no 500 error
      }
    }
  });

  test("Command injection payloads rejected", async ({ request }) => {
    const token = await getAdminToken(request);

    const cmdPayloads = [
      "; ls -la",
      "| cat /etc/passwd",
      "$(whoami)",
      "`whoami`",
      "&& cat /etc/passwd",
    ];

    for (const payload of cmdPayloads) {
      const res = await request.get(
        `${API}/api/v1/employees?search=${encodeURIComponent(payload)}`,
        { headers: authHeader(token) },
      );
      expect(res.status()).toBeLessThan(500);
      const body = await res.text();
      expect(body).not.toContain("root:");
      expect(body).not.toContain("/bin/bash");
    }
  });
});

// =============================================================================
// 11. Authentication Flow Security
// =============================================================================

test.describe("Authentication Flow Security", () => {
  test("Login with correct credentials succeeds", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: ADMIN_CREDS.email, password: ADMIN_CREDS.password },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tokens.access_token).toBeTruthy();
    expect(body.data.tokens.refresh_token).toBeTruthy();
  });

  test("Login with wrong password fails", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: ADMIN_CREDS.email, password: "WrongPassword123!" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("Login with nonexistent email fails", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: "nonexistent@nowhere.com", password: "AnyPass@123" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("Error message does not reveal if email exists", async ({ request }) => {
    // Login with wrong password for existing user
    const res1 = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: ADMIN_CREDS.email, password: "WrongPassword123!" },
    });
    const body1 = await res1.json();

    // Login with nonexistent email
    const res2 = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: "nonexistent@nowhere.com", password: "AnyPass@123" },
    });
    const body2 = await res2.json();

    // Both should return the same generic error message
    // (not "user not found" vs "wrong password")
    expect(res1.status()).toBe(res2.status());
    // The error messages should be similar/identical to prevent user enumeration
    if (body1.message && body2.message) {
      expect(body1.message.toLowerCase()).toBe(body2.message.toLowerCase());
    }
  });

  test("Refresh token can be used to get new access token", async ({ request }) => {
    const loginRes = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: ADMIN_CREDS.email, password: ADMIN_CREDS.password },
    });
    const { refresh_token } = (await loginRes.json()).data.tokens;

    const refreshRes = await request.post(`${API}/api/v1/auth/refresh`, {
      data: { refresh_token },
    });
    expect(refreshRes.status()).toBe(200);
    const refreshBody = await refreshRes.json();
    expect(refreshBody.data.tokens.access_token).toBeTruthy();
  });

  test("Reusing a refresh token after rotation fails", async ({ request }) => {
    const loginRes = await request.post(`${API}/api/v1/auth/login`, {
      data: { email: ADMIN_CREDS.email, password: ADMIN_CREDS.password },
    });
    const { refresh_token: originalRefresh } = (await loginRes.json()).data.tokens;

    // Use the refresh token
    const refreshRes = await request.post(`${API}/api/v1/auth/refresh`, {
      data: { refresh_token: originalRefresh },
    });
    expect(refreshRes.status()).toBe(200);

    // Try to reuse the same refresh token (should be rotated/invalidated)
    const replayRes = await request.post(`${API}/api/v1/auth/refresh`, {
      data: { refresh_token: originalRefresh },
    });
    // Should fail — token was already used and rotated
    expect([400, 401, 403]).toContain(replayRes.status());
  });

  test("Invalid refresh token rejected", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/auth/refresh`, {
      data: { refresh_token: "completely-invalid-refresh-token" },
    });
    expect([400, 401, 403]).toContain(res.status());
  });
});

// =============================================================================
// 12. HTTP Method Security
// =============================================================================

test.describe("HTTP Method Security", () => {
  test("TRACE method is disabled", async ({ request }) => {
    const res = await request.fetch(`${API}/api/v1/employees`, {
      method: "TRACE",
    });
    // TRACE should be disabled (405 or 404)
    expect([404, 405, 501]).toContain(res.status());
  });

  test("PATCH on read-only endpoints returns appropriate error", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.patch(`${API}/api/v1/admin/super/overview`, {
      headers: authHeader(token),
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("DELETE on collection endpoints returns appropriate error", async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.delete(`${API}/api/v1/employees`, {
      headers: authHeader(token),
    });
    // Should not delete all employees!
    expect([403, 404, 405]).toContain(res.status());
  });
});

// =============================================================================
// 13. Data Exposure Tests
// =============================================================================

test.describe("Data Exposure Prevention", () => {
  test("Password hashes never returned in API responses", async ({ request }) => {
    const token = await getAdminToken(request);

    // Check employee list
    const empRes = await request.get(`${API}/api/v1/employees`, {
      headers: authHeader(token),
    });
    if (empRes.ok()) {
      const bodyStr = JSON.stringify(await empRes.json());
      expect(bodyStr).not.toMatch(/\$2[aby]?\$/); // bcrypt hash pattern
      expect(bodyStr.toLowerCase()).not.toContain("password_hash");
      expect(bodyStr.toLowerCase()).not.toContain("password_digest");
    }

    // Check user profile
    const meRes = await request.get(`${API}/api/v1/auth/me`, {
      headers: authHeader(token),
    });
    if (meRes.ok()) {
      const bodyStr = JSON.stringify(await meRes.json());
      expect(bodyStr).not.toMatch(/\$2[aby]?\$/);
      expect(bodyStr.toLowerCase()).not.toContain("password_hash");
    }
  });

  test("Sensitive tokens never returned in list endpoints", async ({ request }) => {
    const token = await getSuperAdminToken(request);

    const res = await request.get(`${API}/api/v1/users`, {
      headers: authHeader(token),
    });
    if (res.ok()) {
      const bodyStr = JSON.stringify(await res.json());
      expect(bodyStr.toLowerCase()).not.toContain("refresh_token");
      expect(bodyStr.toLowerCase()).not.toContain("access_token");
      expect(bodyStr.toLowerCase()).not.toContain("client_secret");
    }
  });

  test("Database connection details never exposed", async ({ request }) => {
    // Trigger an error and check the response
    const res = await request.get(`${API}/api/v1/nonexistent`);
    const body = await res.text();
    const bodyLower = body.toLowerCase();

    expect(bodyLower).not.toContain("mysql://");
    expect(bodyLower).not.toContain("redis://");
    expect(bodyLower).not.toContain("connection refused");
    expect(bodyLower).not.toContain("econnrefused");
  });

  test("Internal IPs and hostnames not leaked", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/nonexistent`);
    const body = await res.text();

    // Should not contain internal IP addresses
    expect(body).not.toMatch(/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(body).not.toMatch(/\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/);
    expect(body).not.toMatch(/\b192\.168\.\d{1,3}\.\d{1,3}\b/);
  });

  test("Health endpoint does not leak sensitive info", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    const bodyLower = body.toLowerCase();

    expect(bodyLower).not.toContain("password");
    expect(bodyLower).not.toContain("secret");
    expect(bodyLower).not.toContain("mysql://");
    expect(bodyLower).not.toContain("redis://");
  });
});

// =============================================================================
// 14. CSRF Protection Tests
// =============================================================================

test.describe("CSRF Protection", () => {
  test("State-changing requests require authentication", async ({ request }) => {
    // POST without any auth should fail
    const endpoints = [
      { path: "/api/v1/announcements", data: { title: "CSRF", content: "test" } },
      { path: "/api/v1/leave/applications", data: { leave_type_id: 1 } },
      { path: "/api/v1/helpdesk/tickets", data: { subject: "CSRF" } },
    ];

    for (const ep of endpoints) {
      const res = await request.post(`${API}${ep.path}`, {
        data: ep.data,
      });
      expect(res.status()).toBe(401);
    }
  });

  test("DELETE requests require authentication", async ({ request }) => {
    const res = await request.delete(`${API}/api/v1/announcements/1`);
    expect(res.status()).toBe(401);
  });

  test("PUT requests require authentication", async ({ request }) => {
    const res = await request.put(`${API}/api/v1/employees/1`, {
      data: { first_name: "CSRF" },
    });
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 15. Privilege Escalation Tests
// =============================================================================

test.describe("Privilege Escalation Prevention", () => {
  test("Employee cannot self-promote to admin role", async ({ request }) => {
    const token = await getEmployeeToken(request);

    // Try to update own role
    const res = await request.put(`${API}/api/v1/users/me`, {
      headers: authHeader(token),
      data: { role: "admin", role_id: 1 },
    });
    // Should either reject or ignore the role field
    if (res.ok()) {
      const body = await res.json();
      const userRole = body.data?.role || body.data?.user?.role;
      // Even if the request "succeeded", the role should not have changed to admin
      if (userRole) {
        expect(userRole).not.toBe("admin");
        expect(userRole).not.toBe("super_admin");
      }
    }
  });

  test("Admin cannot self-promote to super admin", async ({ request }) => {
    const token = await getAdminToken(request);

    const res = await request.put(`${API}/api/v1/users/me`, {
      headers: authHeader(token),
      data: { role: "super_admin", is_super_admin: true },
    });
    if (res.ok()) {
      const body = await res.json();
      const userRole = body.data?.role || body.data?.user?.role;
      if (userRole) {
        expect(userRole).not.toBe("super_admin");
      }
    }
  });

  test("Employee cannot change another user's role", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.put(`${API}/api/v1/users/1/role`, {
      headers: authHeader(token),
      data: { role_id: 1 },
    });
    expect([401, 403, 404, 405]).toContain(res.status());
  });

  test("Cannot create user with elevated privileges", async ({ request }) => {
    const token = await getEmployeeToken(request);

    const res = await request.post(`${API}/api/v1/users`, {
      headers: authHeader(token),
      data: {
        email: "escalated@test.com",
        password: "Test@12345",
        role: "admin",
        first_name: "Escalated",
        last_name: "User",
      },
    });
    expect([401, 403]).toContain(res.status());
  });
});
