import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// EMP Cloud — Helpdesk Advanced E2E Tests
// Tests: assignment, reopen, rating, KB article CRUD, helpfulness rating
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
// 1. Ticket Assignment (HR only)
// =============================================================================

test.describe("Ticket Assignment", () => {
  let adminToken: string;
  let adminUserId: number;
  let employeeToken: string;
  let ticketId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;

    // Create a ticket as employee
    const ticketRes = await request.post(`${API}/helpdesk/tickets`, {
      headers: auth(employeeToken),
      data: {
        subject: `Assignment Test ${RUN}`,
        description: "Ticket for assignment testing",
        category: "it",
        priority: "medium",
      },
    });
    expect(ticketRes.status()).toBe(201);
    ticketId = (await ticketRes.json()).data.id;
  });

  test("HR can assign a ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/assign`, {
      headers: auth(adminToken),
      data: { assigned_to: adminUserId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot assign a ticket (403)", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/assign`, {
      headers: auth(employeeToken),
      data: { assigned_to: adminUserId },
    });
    expect(res.status()).toBe(403);
  });

  test("Assigned ticket shows assignee in detail", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // The ticket should have an assigned_to field set
    expect(body.data.assigned_to).toBeTruthy();
  });
});

// =============================================================================
// 2. Ticket Reopen Flow
// =============================================================================

test.describe("Ticket Reopen", () => {
  let adminToken: string;
  let employeeToken: string;
  let ticketId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;

    // Create and resolve a ticket
    const ticketRes = await request.post(`${API}/helpdesk/tickets`, {
      headers: auth(employeeToken),
      data: {
        subject: `Reopen Test ${RUN}`,
        description: "Ticket for reopen testing",
        category: "hr",
        priority: "low",
      },
    });
    ticketId = (await ticketRes.json()).data.id;

    // Resolve it
    await request.post(`${API}/helpdesk/tickets/${ticketId}/resolve`, {
      headers: auth(adminToken),
    });
  });

  test("Employee can reopen a resolved ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/reopen`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Reopened ticket status is open", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/tickets/${ticketId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("open");
  });
});

// =============================================================================
// 3. Ticket Rating
// =============================================================================

test.describe("Ticket Rating", () => {
  let adminToken: string;
  let employeeToken: string;
  let ticketId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;

    // Create, resolve, and close a ticket
    const ticketRes = await request.post(`${API}/helpdesk/tickets`, {
      headers: auth(employeeToken),
      data: {
        subject: `Rating Test ${RUN}`,
        description: "Ticket for rating testing",
        category: "it",
        priority: "medium",
      },
    });
    ticketId = (await ticketRes.json()).data.id;

    await request.post(`${API}/helpdesk/tickets/${ticketId}/resolve`, {
      headers: auth(adminToken),
    });
  });

  test("Employee can rate a resolved ticket", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/tickets/${ticketId}/rate`, {
      headers: auth(employeeToken),
      data: { rating: 4, comment: "Good support" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Rating with invalid value fails (400)", async ({ request }) => {
    // Create another resolved ticket for this test
    const tRes = await request.post(`${API}/helpdesk/tickets`, {
      headers: auth(employeeToken),
      data: {
        subject: `Bad Rating ${RUN}`,
        description: "For invalid rating",
        category: "it",
        priority: "low",
      },
    });
    const tId = (await tRes.json()).data.id;
    await request.post(`${API}/helpdesk/tickets/${tId}/resolve`, {
      headers: auth(adminToken),
    });

    const res = await request.post(`${API}/helpdesk/tickets/${tId}/rate`, {
      headers: auth(employeeToken),
      data: { rating: 10 },
    });
    // Should fail validation (rating out of range)
    expect([400, 422]).toContain(res.status());
  });
});

// =============================================================================
// 4. Knowledge Base Article CRUD
// =============================================================================

test.describe("Knowledge Base CRUD", () => {
  let adminToken: string;
  let employeeToken: string;
  let articleId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;
  });

  test("HR can create a KB article", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb`, {
      headers: auth(adminToken),
      data: {
        title: `KB Article ${RUN}`,
        content: "This is a knowledge base article for E2E testing.",
        category: "it",
        is_published: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    articleId = body.data.id;
  });

  test("Any user can list KB articles", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Any user can get a KB article by ID", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb/${articleId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR can update a KB article", async ({ request }) => {
    const res = await request.put(`${API}/helpdesk/kb/${articleId}`, {
      headers: auth(adminToken),
      data: { title: `Updated KB ${RUN}`, content: "Updated content for E2E." },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee cannot create a KB article (403)", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb`, {
      headers: auth(employeeToken),
      data: {
        title: "Should Fail",
        content: "Employee cannot create articles",
        category: "general",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot update a KB article (403)", async ({ request }) => {
    const res = await request.put(`${API}/helpdesk/kb/${articleId}`, {
      headers: auth(employeeToken),
      data: { title: "Blocked Update" },
    });
    expect(res.status()).toBe(403);
  });

  test("Employee cannot delete a KB article (403)", async ({ request }) => {
    const res = await request.delete(`${API}/helpdesk/kb/${articleId}`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(403);
  });

  test("HR can delete (unpublish) a KB article", async ({ request }) => {
    const res = await request.delete(`${API}/helpdesk/kb/${articleId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 5. KB Article Helpfulness Rating
// =============================================================================

test.describe("KB Article Helpfulness", () => {
  let adminToken: string;
  let employeeToken: string;
  let articleId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await loginAndGetToken(request, EMPLOYEE.email, EMPLOYEE.password);
    employeeToken = emp.token;

    // Create a published article
    const artRes = await request.post(`${API}/helpdesk/kb`, {
      headers: auth(adminToken),
      data: {
        title: `Helpfulness Test ${RUN}`,
        content: "Article for helpfulness rating test.",
        category: "general",
        is_published: true,
      },
    });
    articleId = (await artRes.json()).data.id;
  });

  test("Employee can rate an article as helpful", async ({ request }) => {
    const res = await request.post(`${API}/helpdesk/kb/${articleId}/helpful`, {
      headers: auth(employeeToken),
      data: { helpful: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Employee can check their own rating for an article", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/kb/${articleId}/my-rating`, {
      headers: auth(employeeToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (articleId) {
      await request.delete(`${API}/helpdesk/kb/${articleId}`, {
        headers: auth(adminToken),
      });
    }
  });
});
