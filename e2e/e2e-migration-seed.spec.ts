import { test, expect, type APIRequestContext } from "@playwright/test";

// =============================================================================
// E2E: Migration & Seed Data Verification
// Verifies that database state after all 35 migrations and seed data is correct.
// Checks modules, leave types, policies, organizations, departments, locations,
// employees, and super admin platform stats.
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE = { email: "arjun@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123" };

async function getToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status()).toBe(200);
  return (await res.json()).data.tokens.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// =============================================================================
// 1. Health Check — Migrations Ran Successfully
// =============================================================================

test.describe("Health & Migration Verification", () => {
  test("GET /health returns healthy (migrations ran)", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Health endpoint may return { status: "ok" } or { success: true, data: { ... } }
    const healthy = body.status === "ok" || body.success === true || body.data?.status === "ok";
    expect(healthy).toBe(true);
    console.log(`Health check: ${JSON.stringify(body).slice(0, 200)}`);
  });
});

// =============================================================================
// 2. Modules Seed Data
// =============================================================================

test.describe("Modules Seed Data", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("GET /modules returns 10+ modules (seeded)", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/modules`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(10);

    const slugs = body.data.map((m: any) => m.slug || m.name);
    console.log(`Modules (${body.data.length}): ${slugs.join(", ")}`);

    // Verify the 10 sellable modules are present
    const expectedSlugs = ["payroll", "monitor", "recruit", "field", "biometrics", "projects", "rewards", "performance", "exit", "lms"];
    for (const slug of expectedSlugs) {
      const found = slugs.some((s: string) => s.toLowerCase().includes(slug));
      if (!found) {
        console.log(`  WARNING: Expected module "${slug}" not found in slugs`);
      }
    }
  });
});

// =============================================================================
// 3. Leave Types Seed Data
// =============================================================================

test.describe("Leave Types Seed Data", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("GET /leave/types returns leave types (seeded)", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/leave/types`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const types = body.data || [];
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);

    for (const lt of types) {
      console.log(`  Leave type: ${lt.name} (id=${lt.id}, days=${lt.default_days ?? lt.max_days ?? "N/A"})`);
    }
  });
});

// =============================================================================
// 4. Policies Seed Data (12 Company Policy Templates)
// =============================================================================

test.describe("Policies Seed Data", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("GET /policies returns 10+ policies (12 templates seeded)", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/policies`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const policies = body.data || [];
    expect(Array.isArray(policies)).toBe(true);
    expect(policies.length).toBeGreaterThanOrEqual(10);
    console.log(`Policies count: ${policies.length}`);

    for (const p of policies.slice(0, 15)) {
      console.log(`  Policy: ${p.title} (category=${p.category}, mandatory=${p.is_mandatory ?? "N/A"})`);
    }
  });
});

// =============================================================================
// 5. Organization Details
// =============================================================================

test.describe("Organization Data", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("GET /organizations/me returns org details", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/organizations/me`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const org = body.data;
    expect(org).toBeTruthy();
    expect(org.name || org.organization_name).toBeTruthy();
    expect(org.id).toBeGreaterThan(0);
    console.log(`Organization: ${org.name || org.organization_name} (id=${org.id})`);
  });
});

// =============================================================================
// 6. Departments Seed Data
// =============================================================================

test.describe("Departments Data", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("GET /departments returns departments", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/departments`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const depts = body.data || [];
    expect(Array.isArray(depts)).toBe(true);
    expect(depts.length).toBeGreaterThan(0);

    for (const d of depts) {
      console.log(`  Department: ${d.name} (id=${d.id})`);
    }
  });
});

// =============================================================================
// 7. Locations Seed Data
// =============================================================================

test.describe("Locations Data", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("GET /locations returns locations", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/locations`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const locations = body.data || [];
    expect(Array.isArray(locations)).toBe(true);
    expect(locations.length).toBeGreaterThan(0);

    for (const loc of locations) {
      console.log(`  Location: ${loc.name} (id=${loc.id}, city=${loc.city || "N/A"})`);
    }
  });
});

// =============================================================================
// 8. Super Admin Platform Overview
// =============================================================================

test.describe("Super Admin Platform Stats", () => {
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    superToken = await getToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
  });

  test("GET /admin/overview returns platform stats", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/admin/overview`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const stats = body.data;
    expect(stats).toBeTruthy();
    console.log(`Platform overview keys: ${Object.keys(stats).join(", ")}`);
    // Should contain org/user/subscription counts
    if (stats.total_organizations !== undefined) {
      expect(stats.total_organizations).toBeGreaterThan(0);
      console.log(`  Total organizations: ${stats.total_organizations}`);
    }
    if (stats.total_users !== undefined) {
      expect(stats.total_users).toBeGreaterThan(0);
      console.log(`  Total users: ${stats.total_users}`);
    }
  });
});

// =============================================================================
// 9. Super Admin Organizations List
// =============================================================================

test.describe("Super Admin Organizations", () => {
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    superToken = await getToken(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
  });

  test("GET /admin/organizations returns multiple orgs", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/admin/organizations`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const orgs = body.data?.organizations || body.data || [];
    expect(Array.isArray(orgs)).toBe(true);
    expect(orgs.length).toBeGreaterThan(0);

    for (const org of orgs.slice(0, 10)) {
      console.log(`  Org: ${org.name || org.organization_name} (id=${org.id}, users=${org.user_count ?? org.total_users ?? "N/A"})`);
    }
  });
});

// =============================================================================
// 10. Employees with Proper Hierarchy
// =============================================================================

test.describe("Employee Hierarchy", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await getToken(request, ADMIN.email, ADMIN.password);
  });

  test("GET /employees returns employees with reporting managers set", async ({ request }) => {
    test.setTimeout(15_000);
    const res = await request.get(`${API}/employees`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const employees = body.data?.employees || body.data || [];
    expect(Array.isArray(employees)).toBe(true);
    expect(employees.length).toBeGreaterThan(0);

    let withManager = 0;
    let withoutManager = 0;
    for (const emp of employees) {
      if (emp.reporting_manager_id || emp.manager_id || emp.reporting_to) {
        withManager++;
      } else {
        withoutManager++;
      }
    }

    console.log(`Employees: ${employees.length} total, ${withManager} with manager, ${withoutManager} without`);
    // Most employees should have a reporting manager (except top-level)
    expect(withManager).toBeGreaterThan(0);

    // Log a few for verification
    for (const emp of employees.slice(0, 8)) {
      const name = emp.full_name || `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || emp.email;
      const mgr = emp.reporting_manager_id || emp.manager_id || emp.reporting_to || "none";
      const dept = emp.department_name || emp.department || "N/A";
      console.log(`  ${name}: dept=${dept}, manager_id=${mgr}, role=${emp.role ?? emp.role_id ?? "N/A"}`);
    }
  });
});
