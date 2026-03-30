import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

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
// 1. Helpdesk Ticket CRUD + Comments + Status Workflow
// =============================================================================

test.describe("Helpdesk Ticket CRUD", () => {
  let adminToken: string;
  let employeeToken: string;
  let ticketId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Employee can create a helpdesk ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets`, {
      headers: auth(employeeToken),
      data: {
        subject: `E2E Ticket ${RUN}`,
        description: "This is a test helpdesk ticket created by E2E tests.",
        category: "it",
        priority: "medium",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    ticketId = body.data.id;
  });

  test("Employee can view their own tickets via /tickets/my", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets/my`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Employee can view ticket detail", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can add a comment to their ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/comment`, {
      headers: auth(employeeToken),
      data: { comment: `Employee comment ${RUN}` },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can add a comment to the ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/comment`, {
      headers: auth(adminToken),
      data: { comment: `Admin comment ${RUN}`, is_internal: false },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can add an internal comment (HR only)", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/comment`, {
      headers: auth(adminToken),
      data: { comment: `Internal note ${RUN}`, is_internal: true },
    });
    expect(res.status()).toBe(201);
  });

  test("Admin can update a ticket (status/priority)", async ({ request }) => {
    const res = await request.put(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: auth(adminToken),
      data: { priority: "high" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot update a ticket (403)", async ({ request }) => {
    const res = await request.put(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: auth(employeeToken),
      data: { priority: "low" },
    });
    expect(res.status()).toBe(403);
  });

  test("Admin can resolve a ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/resolve`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can close a resolved ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/close`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 2. Employee Sees Only Own Tickets, HR Sees All
// =============================================================================

test.describe("Helpdesk Ticket Visibility", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("HR/Admin can see all tickets via /tickets", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Employee /tickets returns only their own tickets", async ({ request }) => {
    // The employee endpoint /tickets for non-HR falls back to own tickets
    const resAll = await request.get(`${API}/helpdesk/tickets`, {
      headers: auth(employeeToken),
    });
    expect(resAll.status()).toBe(200);
    const bodyAll = await resAll.json();

    const resMy = await request.get(`${API}/helpdesk/tickets/my`, {
      headers: auth(employeeToken),
    });
    expect(resMy.status()).toBe(200);
    const bodyMy = await resMy.json();

    // Both should return the same count for a non-HR user
    expect(bodyAll.meta?.total).toBe(bodyMy.meta?.total);
  });

  test("HR can access helpdesk dashboard", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot access helpdesk dashboard (403)", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/dashboard`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 3. Settings — Organization Info
// =============================================================================

test.describe("Settings — Organization", () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Admin can get organization info", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(body.data).toHaveProperty("name");
  });

  test("Employee can view organization info", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Admin can get organization stats", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/stats`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 4. Settings — Departments CRUD (including get-by-ID and update)
// =============================================================================

test.describe("Settings — Departments CRUD", () => {
  let adminToken: string;
  let employeeToken: string;
  let departmentId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Admin can list departments", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/departments`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Admin can create a department", async ({ request }) => {
    const res = await request.post(`${API}/organizations/me/departments`, {
      headers: auth(adminToken),
      data: { name: `E2E Dept ${RUN}` },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    departmentId = body.data.id;
  });

  test("Admin can get department by ID", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/departments/${departmentId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(departmentId);
  });

  test("Admin can update a department", async ({ request }) => {
    const res = await request.put(`${API}/organizations/me/departments/${departmentId}`, {
      headers: auth(adminToken),
      data: { name: `Updated Dept ${RUN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can list departments (read access)", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/departments`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
  });

  test("Employee cannot create a department (403)", async ({ request }) => {
    const res = await request.post(`${API}/organizations/me/departments`, {
      headers: auth(employeeToken),
      data: { name: "Blocked Dept" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot update a department (403)", async ({ request }) => {
    const res = await request.put(`${API}/organizations/me/departments/${departmentId}`, {
      headers: auth(employeeToken),
      data: { name: "Blocked Update" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot delete a department (403)", async ({ request }) => {
    const res = await request.delete(`${API}/organizations/me/departments/${departmentId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Admin can delete a department", async ({ request }) => {
    const res = await request.delete(`${API}/organizations/me/departments/${departmentId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 5. Settings — Locations CRUD (including get-by-ID and update)
// =============================================================================

test.describe("Settings — Locations CRUD", () => {
  let adminToken: string;
  let employeeToken: string;
  let locationId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    employeeToken = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
  });

  test("Admin can list locations", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/locations`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Admin can create a location", async ({ request }) => {
    const res = await request.post(`${API}/organizations/me/locations`, {
      headers: auth(adminToken),
      data: {
        name: `E2E Location ${RUN}`,
        address: "123 Test Street",
        city: "Test City",
        state: "Test State",
        country: "India",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    locationId = body.data.id;
  });

  test("Admin can get location by ID", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/locations/${locationId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(locationId);
  });

  test("Admin can update a location", async ({ request }) => {
    const res = await request.put(`${API}/organizations/me/locations/${locationId}`, {
      headers: auth(adminToken),
      data: { name: `Updated Location ${RUN}`, city: "Updated City" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can list locations (read access)", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/locations`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
  });

  test("Employee cannot create a location (403)", async ({ request }) => {
    const res = await request.post(`${API}/organizations/me/locations`, {
      headers: auth(employeeToken),
      data: { name: "Blocked Location", address: "N/A", city: "N/A", country: "India" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot update a location (403)", async ({ request }) => {
    const res = await request.put(`${API}/organizations/me/locations/${locationId}`, {
      headers: auth(employeeToken),
      data: { name: "Blocked Update" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot delete a location (403)", async ({ request }) => {
    const res = await request.delete(`${API}/organizations/me/locations/${locationId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("Admin can delete a location", async ({ request }) => {
    const res = await request.delete(`${API}/organizations/me/locations/${locationId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 6. Unauthenticated Access Denied
// =============================================================================

test.describe("Unauthenticated Access Denied", () => {
  test("Helpdesk tickets endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets`);
    expect(res.status()).toBe(401);
  });

  test("Organizations endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me`);
    expect(res.status()).toBe(401);
  });

  test("Departments endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/departments`);
    expect(res.status()).toBe(401);
  });

  test("Locations endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get(`${API}/organizations/me/locations`);
    expect(res.status()).toBe(401);
  });
});
