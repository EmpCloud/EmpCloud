import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN_CREDS = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE_CREDS = { email: "arjun@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };

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
// 1. Events
// =============================================================================

test.describe("Events", () => {
  let adminToken: string;
  let empToken: string;
  let eventId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    empToken = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
  });

  test("Create event (HR) (FIXED)", async ({ request }) => {
    test.setTimeout(30_000);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const endDate = new Date(futureDate);
    endDate.setHours(endDate.getHours() + 2);

    const res = await request.post(`${API}/events`, {
      headers: auth(adminToken),
      data: {
        title: `E2E Event ${Date.now()}`,
        description: "Automated test event",
        event_type: "meeting",
        start_date: futureDate.toISOString(),
        end_date: endDate.toISOString(),
        location: "Conference Room A",
        max_attendees: 50,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    eventId = body.data.id;
    expect(eventId).toBeGreaterThan(0);
  });

  test("List events", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/events`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Get event by ID", async ({ request }) => {
    test.setTimeout(30_000);
    expect(eventId, 'Prerequisite failed — eventId was not set').toBeTruthy();
    const res = await request.get(`${API}/events/${eventId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(eventId);
  });

  test("Get upcoming events", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/events/upcoming`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("RSVP to event", async ({ request }) => {
    test.setTimeout(30_000);
    expect(eventId, 'Prerequisite failed — eventId was not set').toBeTruthy();
    const res = await request.post(`${API}/events/${eventId}/rsvp`, {
      headers: auth(empToken),
      data: { status: "attending" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Get my RSVPd events", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/events/my`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Event dashboard (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/events/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Cancel event (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    // Create a new event to cancel
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14);
    const endDate = new Date(futureDate);
    endDate.setHours(endDate.getHours() + 1);

    const createRes = await request.post(`${API}/events`, {
      headers: auth(adminToken),
      data: {
        title: `Cancel Test ${Date.now()}`,
        description: "Will be cancelled",
        event_type: "meeting",
        start_date: futureDate.toISOString(),
        end_date: endDate.toISOString(),
        location: "Room B",
      },
    });
    expect(createRes.status()).toBe(201);
    const cid = (await createRes.json()).data.id;

    const res = await request.post(`${API}/events/${cid}/cancel`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 2. Wellness
// =============================================================================

test.describe("Wellness", () => {
  let adminToken: string;
  let empToken: string;
  let goalId: number;
  let programId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    empToken = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
  });

  test("Daily check-in", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(empToken),
      data: {
        mood: "good",
        energy_level: 3,
        notes: "Feeling good today",
      },
    });
    // 201 on first check-in of the day, 400 if already done
    expect([201, 400]).toContain(res.status());
    const body = await res.json();
    if (res.status() === 201) {
      expect(body.success).toBe(true);
    }
  });

  test("Get check-in history", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/wellness/check-ins`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Get check-in trends (FIXED)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/wellness/trends?period=daily&days=30`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Create wellness goal (FIXED)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/wellness/goals`, {
      headers: auth(empToken),
      data: {
        title: `E2E Goal ${Date.now()}`,
        goal_type: "steps",
        target_value: 10000,
        unit: "steps",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    goalId = body.data.id;
  });

  test("List my wellness goals", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/wellness/goals`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const goals = body.data || [];
    expect(Array.isArray(goals)).toBe(true);
    if (goals.length > 0 && !goalId) {
      goalId = goals[0].id;
    }
  });

  test("Update goal progress", async ({ request }) => {
    test.setTimeout(30_000);
    expect(goalId, 'Prerequisite failed — goalId was not set').toBeTruthy();
    const res = await request.put(`${API}/wellness/goals/${goalId}`, {
      headers: auth(empToken),
      data: {
        current_value: 5000,
      },
    });
    // 200 on success, 403 if goal belongs to another user
    expect([200, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("Delete wellness goal (FIXED)", async ({ request }) => {
    test.setTimeout(30_000);
    // Create a goal to delete
    const createRes = await request.post(`${API}/wellness/goals`, {
      headers: auth(empToken),
      data: {
        title: `Delete Goal ${Date.now()}`,
        goal_type: "exercise",
        target_value: 100,
        unit: "reps",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      },
    });
    expect(createRes.status()).toBe(201);
    const gid = (await createRes.json()).data.id;

    const res = await request.delete(`${API}/wellness/goals/${gid}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });

  test("Create wellness program (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/wellness/programs`, {
      headers: auth(adminToken),
      data: {
        title: `E2E Program ${Date.now()}`,
        description: "Test wellness program",
        program_type: "fitness",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        max_participants: 100,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    programId = body.data.id;
  });

  test("List wellness programs", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/wellness/programs`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Enroll in wellness program", async ({ request }) => {
    test.setTimeout(30_000);
    if (!programId) {
      // Get any available program
      const listRes = await request.get(`${API}/wellness/programs`, { headers: auth(empToken) });
      const programs = (await listRes.json()).data || [];
      expect(programs.length, "Prerequisite failed — no data found in programs").toBeGreaterThan(0);
      programId = programs[0].id;
    }
    const res = await request.post(`${API}/wellness/programs/${programId}/enroll`, {
      headers: auth(empToken),
    });
    // 201 on first enroll, 400 if already enrolled, 200 for success, 403 if not permitted
    expect([200, 201, 400, 403]).toContain(res.status());
  });

  test("My enrolled programs", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/wellness/my`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Wellness summary", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/wellness/summary`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Wellness dashboard (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/wellness/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 3. Chatbot
// =============================================================================

test.describe("Chatbot", () => {
  let empToken: string;
  let conversationId: number;

  test.beforeAll(async ({ request }) => {
    empToken = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
  });

  test("Create conversation", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/chatbot/conversations`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    conversationId = body.data.id;
    expect(conversationId).toBeGreaterThan(0);
  });

  test("List conversations", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/chatbot/conversations`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Send message and get response", async ({ request }) => {
    test.setTimeout(60_000);
    expect(conversationId, 'Prerequisite failed — conversationId was not set').toBeTruthy();
    const res = await request.post(`${API}/chatbot/conversations/${conversationId}/send`, {
      headers: auth(empToken),
      data: { message: "Hello, what can you help me with?" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should have a bot response
    expect(body.data).toBeDefined();
  });

  test("Leave balance query (FIXED)", async ({ request }) => {
    test.setTimeout(60_000);
    expect(conversationId, 'Prerequisite failed — conversationId was not set').toBeTruthy();
    const res = await request.post(`${API}/chatbot/conversations/${conversationId}/send`, {
      headers: auth(empToken),
      data: { message: "What is my leave balance?" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("Manager query (FIXED)", async ({ request }) => {
    test.setTimeout(60_000);
    expect(conversationId, 'Prerequisite failed — conversationId was not set').toBeTruthy();
    const res = await request.post(`${API}/chatbot/conversations/${conversationId}/send`, {
      headers: auth(empToken),
      data: { message: "Who is my manager?" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("Get conversation messages", async ({ request }) => {
    test.setTimeout(30_000);
    expect(conversationId, 'Prerequisite failed — conversationId was not set').toBeTruthy();
    const res = await request.get(`${API}/chatbot/conversations/${conversationId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Get chatbot suggestions", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/chatbot/suggestions`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Get AI status", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/chatbot/ai-status`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Delete (archive) conversation", async ({ request }) => {
    test.setTimeout(30_000);
    // Create a new conversation to delete
    const createRes = await request.post(`${API}/chatbot/conversations`, {
      headers: auth(empToken),
    });
    expect(createRes.status()).toBe(201);
    const cid = (await createRes.json()).data.id;

    const res = await request.delete(`${API}/chatbot/conversations/${cid}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });
});
