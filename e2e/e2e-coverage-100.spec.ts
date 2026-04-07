import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN_CREDS = { email: "ananya@technova.in", password: "Welcome@123" };
const EMP_CREDS = { email: "priya@technova.in", password: "Welcome@123" };
const MGR_CREDS = { email: "karthik@technova.in", password: "Welcome@123" };
const SUPER_CREDS = { email: "admin@empcloud.com", password: "SuperAdmin@123" };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

interface LoginResult {
  token: string;
  userId: number;
}

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<LoginResult> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await request.post(`${API}/auth/login`, {
      data: { email, password },
    });
    if (res.status() === 200) {
      const body = await res.json();
      return {
        token: body.data.tokens.access_token,
        userId: body.data.user.id,
      };
    }
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      continue;
    }
    const errorBody = await res.text().catch(() => "no body");
    throw new Error(
      `Login failed for ${email} after ${attempt} attempts: status=${res.status()} body=${errorBody}`,
    );
  }
  throw new Error("Login failed after retries");
}

function auth(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// =============================================================================
// Shared tokens (single login for all tests)
// =============================================================================

let adminToken: string;
let adminUserId: number;
let empToken: string;
let empUserId: number;
let mgrToken: string;
let mgrUserId: number;
let superToken: string;
let superUserId: number;

test.beforeAll(async ({ request }) => {
  const [admin, emp, mgr, sup] = await Promise.all([
    loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password),
    loginAndGetToken(request, EMP_CREDS.email, EMP_CREDS.password),
    loginAndGetToken(request, MGR_CREDS.email, MGR_CREDS.password),
    loginAndGetToken(request, SUPER_CREDS.email, SUPER_CREDS.password),
  ]);
  adminToken = admin.token;
  adminUserId = admin.userId;
  empToken = emp.token;
  empUserId = emp.userId;
  mgrToken = mgr.token;
  mgrUserId = mgr.userId;
  superToken = sup.token;
  superUserId = sup.userId;
});

// =============================================================================
// 1. Manager Endpoints
// =============================================================================

test.describe("Manager — Team & Dashboard", () => {
  test("GET /manager/team — manager can view direct reports", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/team`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /manager/team — employee cannot access (RBAC)", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/team`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("GET /manager/attendance — team attendance today", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/attendance`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /manager/attendance — employee cannot access (RBAC)", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/attendance`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("GET /manager/leaves/pending — pending leave approvals", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/leaves/pending`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /manager/leaves/pending — employee blocked", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/leaves/pending`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("GET /manager/leaves/calendar — with date range", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/manager/leaves/calendar?start_date=2026-01-01&end_date=2026-12-31`,
      { headers: auth(mgrToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /manager/leaves/calendar — defaults to current week", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/leaves/calendar`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /manager/leaves/calendar — employee blocked", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/leaves/calendar`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("GET /manager/dashboard — combined stats", async ({ request }) => {
    const res = await request.get(`${API}/manager/dashboard`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /manager/dashboard — employee blocked", async ({ request }) => {
    const res = await request.get(`${API}/manager/dashboard`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("GET /manager/dashboard — org admin can also access", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/dashboard`, {
      headers: auth(adminToken),
    });
    // org_admin role (80) >= manager role (20), so should be allowed
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /manager/team — unauthenticated returns 401", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/team`);
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 2. Wellness Endpoints — Check-in
// =============================================================================

test.describe("Wellness — Check-in & Trends", () => {
  let checkInId: number;

  test("POST /wellness/check-in — daily mood check-in", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(empToken),
      data: {
        mood: "good",
        energy_level: 4,
        sleep_hours: 7.5,
        exercise_minutes: 30,
        notes: `E2E check-in ${RUN}`,
      },
    });
    // 201 for new check-in, or could be 200 if already checked in today
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(true);
    if (body.data?.id) {
      checkInId = body.data.id;
    }
  });

  test("POST /wellness/check-in — mood=great, energy=5", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(adminToken),
      data: {
        mood: "great",
        energy_level: 5,
        sleep_hours: 8,
        exercise_minutes: 60,
        notes: `Admin check-in ${RUN}`,
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /wellness/check-in — mood=stressed, energy=1", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(mgrToken),
      data: {
        mood: "stressed",
        energy_level: 1,
        sleep_hours: 4,
        exercise_minutes: 0,
        notes: `Manager stressed check-in ${RUN}`,
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /wellness/check-in — invalid mood rejected", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(empToken),
      data: {
        mood: "invalid_mood",
        energy_level: 3,
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("POST /wellness/check-in — energy_level out of range rejected", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(empToken),
      data: {
        mood: "okay",
        energy_level: 10,
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("POST /wellness/check-in — unauthenticated returns 401", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      data: { mood: "good", energy_level: 3 },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /wellness/trends — daily period", async ({ request }) => {
    const res = await request.get(`${API}/wellness/trends?period=daily`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /wellness/trends — weekly period", async ({ request }) => {
    const res = await request.get(
      `${API}/wellness/trends?period=weekly&days=60`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /wellness/trends — default period", async ({ request }) => {
    const res = await request.get(`${API}/wellness/trends`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /wellness/check-ins — history", async ({ request }) => {
    const res = await request.get(`${API}/wellness/check-ins?page=1&per_page=10`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /wellness/check-ins — with date filter", async ({ request }) => {
    const res = await request.get(
      `${API}/wellness/check-ins?page=1&per_page=5&start_date=2026-01-01&end_date=2026-12-31`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 3. Wellness — Goals CRUD
// =============================================================================

test.describe("Wellness — Goals CRUD", () => {
  let goalId: number;

  test("POST /wellness/goals — create goal", async ({ request }) => {
    const res = await request.post(`${API}/wellness/goals`, {
      headers: auth(empToken),
      data: {
        title: `Steps Goal ${RUN}`,
        goal_type: "steps",
        target_value: 10000,
        unit: "steps",
        frequency: "daily",
        start_date: "2026-04-01",
        end_date: "2026-06-30",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    goalId = body.data.id;
    expect(goalId).toBeGreaterThan(0);
  });

  test("GET /wellness/goals — list my goals", async ({ request }) => {
    const res = await request.get(`${API}/wellness/goals`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("GET /wellness/goals — filter by status", async ({ request }) => {
    const res = await request.get(`${API}/wellness/goals?status=active`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("PUT /wellness/goals/:id — update progress", async ({ request }) => {
    test.skip(!goalId, "No goal created");
    const res = await request.put(`${API}/wellness/goals/${goalId}`, {
      headers: auth(empToken),
      data: {
        current_value: 5000,
        title: `Steps Goal Updated ${RUN}`,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("PUT /wellness/goals/:id — mark completed", async ({ request }) => {
    test.skip(!goalId, "No goal created");
    const res = await request.put(`${API}/wellness/goals/${goalId}`, {
      headers: auth(empToken),
      data: {
        current_value: 10000,
        status: "completed",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /wellness/goals — create exercise goal", async ({ request }) => {
    const res = await request.post(`${API}/wellness/goals`, {
      headers: auth(empToken),
      data: {
        title: `Exercise Goal ${RUN}`,
        goal_type: "exercise",
        target_value: 60,
        unit: "minutes",
        frequency: "daily",
        start_date: "2026-04-01",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /wellness/goals — create meditation goal", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/goals`, {
      headers: auth(empToken),
      data: {
        title: `Meditate ${RUN}`,
        goal_type: "meditation",
        target_value: 20,
        unit: "minutes",
        frequency: "daily",
        start_date: "2026-04-07",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("DELETE /wellness/goals/:id — delete own goal", async ({ request }) => {
    // Create a goal to delete
    const createRes = await request.post(`${API}/wellness/goals`, {
      headers: auth(empToken),
      data: {
        title: `Temp Goal ${RUN}`,
        goal_type: "water",
        target_value: 8,
        unit: "glasses",
        frequency: "daily",
        start_date: "2026-04-07",
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const tempGoalId = createBody.data.id;

    const res = await request.delete(`${API}/wellness/goals/${tempGoalId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("DELETE /wellness/goals/999999 — non-existent goal", async ({
    request,
  }) => {
    const res = await request.delete(`${API}/wellness/goals/999999`, {
      headers: auth(empToken),
    });
    expect([404, 403]).toContain(res.status());
  });
});

// =============================================================================
// 4. Wellness — My & Summary
// =============================================================================

test.describe("Wellness — My Programs & Summary", () => {
  test("GET /wellness/my — enrolled programs", async ({ request }) => {
    const res = await request.get(`${API}/wellness/my`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /wellness/summary — personal summary", async ({ request }) => {
    const res = await request.get(`${API}/wellness/summary`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /wellness/summary — manager can see own summary", async ({
    request,
  }) => {
    const res = await request.get(`${API}/wellness/summary`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /wellness/my — unauthenticated returns 401", async ({
    request,
  }) => {
    const res = await request.get(`${API}/wellness/my`);
    expect(res.status()).toBe(401);
  });

  test("GET /wellness/dashboard — HR can view org dashboard", async ({
    request,
  }) => {
    const res = await request.get(`${API}/wellness/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /wellness/dashboard — employee blocked (RBAC)", async ({
    request,
  }) => {
    const res = await request.get(`${API}/wellness/dashboard`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 5. Forum — Categories
// =============================================================================

test.describe("Forum — Categories", () => {
  let categoryId: number;

  test("POST /forum/categories — HR creates category", async ({ request }) => {
    const res = await request.post(`${API}/forum/categories`, {
      headers: auth(adminToken),
      data: {
        name: `E2E Category ${RUN}`,
        description: "Automated test category",
        icon: "chat",
        sort_order: 99,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    categoryId = body.data.id;
    expect(categoryId).toBeGreaterThan(0);
  });

  test("GET /forum/categories — list all categories", async ({ request }) => {
    const res = await request.get(`${API}/forum/categories`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("PUT /forum/categories/:id — HR updates category", async ({
    request,
  }) => {
    test.skip(!categoryId, "No category created");
    const res = await request.put(`${API}/forum/categories/${categoryId}`, {
      headers: auth(adminToken),
      data: {
        name: `E2E Category Updated ${RUN}`,
        description: "Updated description",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /forum/categories — employee blocked (RBAC)", async ({
    request,
  }) => {
    const res = await request.post(`${API}/forum/categories`, {
      headers: auth(empToken),
      data: { name: "Should Fail", description: "Not allowed" },
    });
    expect(res.status()).toBe(403);
  });

  test("PUT /forum/categories/:id — employee blocked", async ({ request }) => {
    test.skip(!categoryId, "No category created");
    const res = await request.put(`${API}/forum/categories/${categoryId}`, {
      headers: auth(empToken),
      data: { name: "Hacked" },
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 6. Forum — Posts CRUD, Pin, Lock
// =============================================================================

test.describe("Forum — Posts", () => {
  let categoryId: number;
  let postId: number;
  let replyId: number;

  test.beforeAll(async ({ request }) => {
    // Ensure we have a category
    const catRes = await request.get(`${API}/forum/categories`, {
      headers: auth(adminToken),
    });
    const cats = (await catRes.json()).data;
    if (cats && cats.length > 0) {
      categoryId = cats[0].id;
    } else {
      const newCat = await request.post(`${API}/forum/categories`, {
        headers: auth(adminToken),
        data: { name: `Forum Cat ${RUN}`, description: "test" },
      });
      categoryId = (await newCat.json()).data.id;
    }
  });

  test("POST /forum/posts — create discussion post", async ({ request }) => {
    const res = await request.post(`${API}/forum/posts`, {
      headers: auth(empToken),
      data: {
        category_id: categoryId,
        title: `E2E Discussion ${RUN}`,
        content: "This is an automated test discussion post.",
        post_type: "discussion",
        tags: ["e2e", "test"],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    postId = body.data.id;
    expect(postId).toBeGreaterThan(0);
  });

  test("POST /forum/posts — create question post", async ({ request }) => {
    const res = await request.post(`${API}/forum/posts`, {
      headers: auth(empToken),
      data: {
        category_id: categoryId,
        title: `E2E Question ${RUN}`,
        content: "How do I reset my password?",
        post_type: "question",
        tags: ["help"],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /forum/posts — create idea post", async ({ request }) => {
    const res = await request.post(`${API}/forum/posts`, {
      headers: auth(mgrToken),
      data: {
        category_id: categoryId,
        title: `E2E Idea ${RUN}`,
        content: "We should add a dark mode option.",
        post_type: "idea",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /forum/posts — list posts", async ({ request }) => {
    const res = await request.get(`${API}/forum/posts?page=1&per_page=10`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("GET /forum/posts — filter by category", async ({ request }) => {
    const res = await request.get(
      `${API}/forum/posts?category_id=${categoryId}&page=1&per_page=10`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /forum/posts — filter by post_type=question", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/forum/posts?post_type=question&page=1&per_page=5`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /forum/posts/:id — get single post", async ({ request }) => {
    test.skip(!postId, "No post created");
    const res = await request.get(`${API}/forum/posts/${postId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(postId);
    expect(body.data).toHaveProperty("title");
    expect(body.data).toHaveProperty("content");
  });

  test("PUT /forum/posts/:id — update own post", async ({ request }) => {
    test.skip(!postId, "No post created");
    const res = await request.put(`${API}/forum/posts/${postId}`, {
      headers: auth(empToken),
      data: {
        title: `E2E Discussion Updated ${RUN}`,
        content: "Updated discussion content.",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /forum/posts/:id/pin — HR pins post", async ({ request }) => {
    test.skip(!postId, "No post created");
    const res = await request.post(`${API}/forum/posts/${postId}/pin`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /forum/posts/:id/pin — employee cannot pin", async ({
    request,
  }) => {
    test.skip(!postId, "No post created");
    const res = await request.post(`${API}/forum/posts/${postId}/pin`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("POST /forum/posts/:id/lock — HR locks post", async ({ request }) => {
    test.skip(!postId, "No post created");
    const res = await request.post(`${API}/forum/posts/${postId}/lock`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /forum/posts/:id/lock — employee cannot lock", async ({
    request,
  }) => {
    test.skip(!postId, "No post created");
    const res = await request.post(`${API}/forum/posts/${postId}/lock`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  // Unlock the post so replies can be added
  test("POST /forum/posts/:id/lock — toggle unlock", async ({ request }) => {
    test.skip(!postId, "No post created");
    const res = await request.post(`${API}/forum/posts/${postId}/lock`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });
});

// =============================================================================
// 7. Forum — Replies, Accept, Delete
// =============================================================================

test.describe("Forum — Replies", () => {
  let categoryId: number;
  let postId: number;
  let replyId: number;

  test.beforeAll(async ({ request }) => {
    // Create a fresh post for reply tests
    const catRes = await request.get(`${API}/forum/categories`, {
      headers: auth(adminToken),
    });
    const cats = (await catRes.json()).data;
    categoryId = cats[0].id;

    const postRes = await request.post(`${API}/forum/posts`, {
      headers: auth(empToken),
      data: {
        category_id: categoryId,
        title: `Reply Test Post ${RUN}`,
        content: "Post for testing replies",
        post_type: "question",
      },
    });
    const postBody = await postRes.json();
    postId = postBody.data.id;
  });

  test("POST /forum/posts/:id/reply — add reply", async ({ request }) => {
    const res = await request.post(`${API}/forum/posts/${postId}/reply`, {
      headers: auth(mgrToken),
      data: {
        content: `E2E Reply ${RUN}`,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    replyId = body.data.id;
    expect(replyId).toBeGreaterThan(0);
  });

  test("POST /forum/posts/:id/reply — second reply", async ({ request }) => {
    const res = await request.post(`${API}/forum/posts/${postId}/reply`, {
      headers: auth(adminToken),
      data: {
        content: `Admin reply ${RUN}`,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /forum/replies/:id/accept — post author accepts reply", async ({
    request,
  }) => {
    test.skip(!replyId, "No reply created");
    const res = await request.post(`${API}/forum/replies/${replyId}/accept`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("DELETE /forum/replies/:id — create and delete own reply", async ({
    request,
  }) => {
    // Create a reply to delete
    const createRes = await request.post(
      `${API}/forum/posts/${postId}/reply`,
      {
        headers: auth(empToken),
        data: { content: `Temp reply to delete ${RUN}` },
      },
    );
    expect(createRes.status()).toBe(201);
    const tempReplyId = (await createRes.json()).data.id;

    const res = await request.delete(`${API}/forum/replies/${tempReplyId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /forum/posts/:id — verify replies in post detail", async ({
    request,
  }) => {
    const res = await request.get(`${API}/forum/posts/${postId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.replies).toBeDefined();
    expect(body.data.replies.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 8. Forum — Likes & Dashboard
// =============================================================================

test.describe("Forum — Likes & Dashboard", () => {
  let postId: number;

  test.beforeAll(async ({ request }) => {
    // Get an existing post to like
    const postsRes = await request.get(
      `${API}/forum/posts?page=1&per_page=1`,
      { headers: auth(empToken) },
    );
    const posts = (await postsRes.json()).data;
    if (posts && posts.length > 0) {
      postId = posts[0].id;
    }
  });

  test("POST /forum/like — like a post (toggle on)", async ({ request }) => {
    test.skip(!postId, "No post available");
    const res = await request.post(`${API}/forum/like`, {
      headers: auth(empToken),
      data: {
        target_type: "post",
        target_id: postId,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /forum/like — toggle like off", async ({ request }) => {
    test.skip(!postId, "No post available");
    const res = await request.post(`${API}/forum/like`, {
      headers: auth(empToken),
      data: {
        target_type: "post",
        target_id: postId,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /forum/like — invalid target_type rejected", async ({
    request,
  }) => {
    const res = await request.post(`${API}/forum/like`, {
      headers: auth(empToken),
      data: {
        target_type: "invalid",
        target_id: 1,
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("GET /forum/dashboard — HR dashboard stats", async ({ request }) => {
    const res = await request.get(`${API}/forum/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /forum/dashboard — employee blocked (RBAC)", async ({
    request,
  }) => {
    const res = await request.get(`${API}/forum/dashboard`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 9. Onboarding Endpoints
// =============================================================================

test.describe("Onboarding", () => {
  test("GET /onboarding/status — get org onboarding status", async ({
    request,
  }) => {
    const res = await request.get(`${API}/onboarding/status`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /onboarding/status — employee can also see status", async ({
    request,
  }) => {
    const res = await request.get(`${API}/onboarding/status`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /onboarding/status — unauthenticated returns 401", async ({
    request,
  }) => {
    const res = await request.get(`${API}/onboarding/status`);
    expect(res.status()).toBe(401);
  });

  test("POST /onboarding/step/1 — complete step 1", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/step/1`, {
      headers: auth(adminToken),
      data: {},
    });
    // May return 200 if already completed or 200 for success
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /onboarding/step/2 — complete step 2", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/step/2`, {
      headers: auth(adminToken),
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /onboarding/step/3 — complete step 3", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/step/3`, {
      headers: auth(adminToken),
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /onboarding/complete — mark onboarding complete", async ({
    request,
  }) => {
    const res = await request.post(`${API}/onboarding/complete`, {
      headers: auth(adminToken),
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /onboarding/skip — skip onboarding", async ({ request }) => {
    const res = await request.post(`${API}/onboarding/skip`, {
      headers: auth(adminToken),
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 10. Dashboard Widgets
// =============================================================================

test.describe("Dashboard Widgets", () => {
  test("GET /dashboard/widgets — admin sees widgets", async ({ request }) => {
    const res = await request.get(`${API}/dashboard/widgets`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /dashboard/widgets — employee sees widgets", async ({
    request,
  }) => {
    const res = await request.get(`${API}/dashboard/widgets`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /dashboard/widgets — manager sees widgets", async ({
    request,
  }) => {
    const res = await request.get(`${API}/dashboard/widgets`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /dashboard/widgets — unauthenticated returns 401", async ({
    request,
  }) => {
    const res = await request.get(`${API}/dashboard/widgets`);
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 11. Admin Logs (Super Admin)
// =============================================================================

test.describe("Admin Logs — Deep Coverage", () => {
  test("GET /admin/logs/summary — super admin", async ({ request }) => {
    const res = await request.get(`${API}/admin/logs/summary`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /admin/logs/overview — super admin", async ({ request }) => {
    const res = await request.get(`${API}/admin/logs/overview`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /admin/logs/errors — with pagination", async ({ request }) => {
    const res = await request.get(
      `${API}/admin/logs/errors?page=1&per_page=5`,
      { headers: auth(superToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /admin/logs/errors — page 2", async ({ request }) => {
    const res = await request.get(
      `${API}/admin/logs/errors?page=2&per_page=5`,
      { headers: auth(superToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /admin/logs/slow-queries — with pagination", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/admin/logs/slow-queries?page=1&per_page=10`,
      { headers: auth(superToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /admin/logs/auth-events — with pagination", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/admin/logs/auth-events?page=1&per_page=10`,
      { headers: auth(superToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // We logged in during beforeAll, so there should be at least one event
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("GET /admin/logs/health — module health", async ({ request }) => {
    const res = await request.get(`${API}/admin/logs/health`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // RBAC: org admin and employee cannot access
  test("GET /admin/logs/summary — org admin blocked", async ({ request }) => {
    const res = await request.get(`${API}/admin/logs/summary`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(403);
  });

  test("GET /admin/logs/overview — employee blocked", async ({ request }) => {
    const res = await request.get(`${API}/admin/logs/overview`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("GET /admin/logs/errors — manager blocked", async ({ request }) => {
    const res = await request.get(`${API}/admin/logs/errors`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(403);
  });

  test("GET /admin/logs/slow-queries — employee blocked", async ({
    request,
  }) => {
    const res = await request.get(`${API}/admin/logs/slow-queries`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("GET /admin/logs/auth-events — employee blocked", async ({
    request,
  }) => {
    const res = await request.get(`${API}/admin/logs/auth-events`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });

  test("GET /admin/logs/health — employee blocked", async ({ request }) => {
    const res = await request.get(`${API}/admin/logs/health`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// 12. Chatbot AI Status
// =============================================================================

test.describe("Chatbot — AI Status & Suggestions", () => {
  test("GET /chatbot/ai-status — check AI engine status", async ({
    request,
  }) => {
    const res = await request.get(`${API}/chatbot/ai-status`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /chatbot/ai-status — manager can check", async ({ request }) => {
    const res = await request.get(`${API}/chatbot/ai-status`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /chatbot/ai-status — admin can check", async ({ request }) => {
    const res = await request.get(`${API}/chatbot/ai-status`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /chatbot/ai-status — unauthenticated returns 401", async ({
    request,
  }) => {
    const res = await request.get(`${API}/chatbot/ai-status`);
    expect(res.status()).toBe(401);
  });

  test("GET /chatbot/suggestions — get suggested questions", async ({
    request,
  }) => {
    const res = await request.get(`${API}/chatbot/suggestions`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("GET /chatbot/suggestions — unauthenticated returns 401", async ({
    request,
  }) => {
    const res = await request.get(`${API}/chatbot/suggestions`);
    expect(res.status()).toBe(401);
  });
});

// =============================================================================
// 13. Chatbot — Conversations CRUD
// =============================================================================

test.describe("Chatbot — Conversations", () => {
  let conversationId: number;

  test("POST /chatbot/conversations — start new conversation", async ({
    request,
  }) => {
    const res = await request.post(`${API}/chatbot/conversations`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    conversationId = body.data.id;
    expect(conversationId).toBeGreaterThan(0);
  });

  test("GET /chatbot/conversations — list my conversations", async ({
    request,
  }) => {
    const res = await request.get(`${API}/chatbot/conversations`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("GET /chatbot/conversations/:id — get messages", async ({
    request,
  }) => {
    test.skip(!conversationId, "No conversation created");
    const res = await request.get(
      `${API}/chatbot/conversations/${conversationId}`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /chatbot/conversations/:id/send — send message", async ({
    request,
  }) => {
    test.skip(!conversationId, "No conversation created");
    test.setTimeout(30_000);
    const res = await request.post(
      `${API}/chatbot/conversations/${conversationId}/send`,
      {
        headers: auth(empToken),
        data: { message: "What is my leave balance?", language: "en" },
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /chatbot/conversations/:id/send — empty message rejected", async ({
    request,
  }) => {
    test.skip(!conversationId, "No conversation created");
    const res = await request.post(
      `${API}/chatbot/conversations/${conversationId}/send`,
      {
        headers: auth(empToken),
        data: { message: "", language: "en" },
      },
    );
    expect([400]).toContain(res.status());
  });

  test("DELETE /chatbot/conversations/:id — archive conversation", async ({
    request,
  }) => {
    test.skip(!conversationId, "No conversation created");
    const res = await request.delete(
      `${API}/chatbot/conversations/${conversationId}`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 14. Wellness Programs — HR CRUD
// =============================================================================

test.describe("Wellness — Programs (HR)", () => {
  let programId: number;

  test("POST /wellness/programs — HR creates program", async ({ request }) => {
    const res = await request.post(`${API}/wellness/programs`, {
      headers: auth(adminToken),
      data: {
        name: `Fitness Challenge ${RUN}`,
        description: "30-day fitness challenge for all employees",
        program_type: "fitness",
        start_date: "2026-05-01",
        end_date: "2026-05-31",
        max_participants: 100,
        is_active: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    programId = body.data.id;
    expect(programId).toBeGreaterThan(0);
  });

  test("GET /wellness/programs — list programs", async ({ request }) => {
    const res = await request.get(
      `${API}/wellness/programs?page=1&per_page=10`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /wellness/programs — filter by type", async ({ request }) => {
    const res = await request.get(
      `${API}/wellness/programs?program_type=fitness&page=1&per_page=5`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /wellness/programs/:id — program detail", async ({ request }) => {
    test.skip(!programId, "No program created");
    const res = await request.get(`${API}/wellness/programs/${programId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("PUT /wellness/programs/:id — HR updates program", async ({
    request,
  }) => {
    test.skip(!programId, "No program created");
    const res = await request.put(`${API}/wellness/programs/${programId}`, {
      headers: auth(adminToken),
      data: {
        name: `Fitness Challenge Updated ${RUN}`,
        description: "Updated description for the fitness challenge",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /wellness/programs — employee blocked (RBAC)", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/programs`, {
      headers: auth(empToken),
      data: {
        name: "Should Fail",
        description: "Not allowed",
        program_type: "yoga",
        start_date: "2026-05-01",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("PUT /wellness/programs/:id — employee blocked", async ({
    request,
  }) => {
    test.skip(!programId, "No program created");
    const res = await request.put(`${API}/wellness/programs/${programId}`, {
      headers: auth(empToken),
      data: { name: "Hacked" },
    });
    expect(res.status()).toBe(403);
  });

  test("POST /wellness/programs/:id/enroll — employee enrolls", async ({
    request,
  }) => {
    test.skip(!programId, "No program created");
    const res = await request.post(
      `${API}/wellness/programs/${programId}/enroll`,
      { headers: auth(empToken) },
    );
    // 201 for new enrollment, or 409/400 if already enrolled
    expect([201, 400, 409]).toContain(res.status());
    const body = await res.json();
    expect(body.success === true || body.success === false).toBe(true);
  });

  test("POST /wellness/programs/:id/complete — employee completes", async ({
    request,
  }) => {
    test.skip(!programId, "No program created");
    const res = await request.post(
      `${API}/wellness/programs/${programId}/complete`,
      { headers: auth(empToken) },
    );
    // May succeed or fail if program not enrolled/already completed
    expect([200, 400, 404]).toContain(res.status());
  });
});

// =============================================================================
// 15. Forum — Delete Post (cleanup)
// =============================================================================

test.describe("Forum — Post Delete", () => {
  let postId: number;

  test.beforeAll(async ({ request }) => {
    const catRes = await request.get(`${API}/forum/categories`, {
      headers: auth(adminToken),
    });
    const cats = (await catRes.json()).data;
    const catId = cats[0].id;

    const postRes = await request.post(`${API}/forum/posts`, {
      headers: auth(empToken),
      data: {
        category_id: catId,
        title: `Delete Test Post ${RUN}`,
        content: "This post will be deleted",
        post_type: "discussion",
      },
    });
    postId = (await postRes.json()).data.id;
  });

  test("DELETE /forum/posts/:id — delete own post", async ({ request }) => {
    const res = await request.delete(`${API}/forum/posts/${postId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /forum/posts/:id — deleted post returns 404", async ({
    request,
  }) => {
    const res = await request.get(`${API}/forum/posts/${postId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(404);
  });

  test("DELETE /forum/posts/999999 — non-existent post", async ({
    request,
  }) => {
    const res = await request.delete(`${API}/forum/posts/999999`, {
      headers: auth(empToken),
    });
    expect([403, 404]).toContain(res.status());
  });
});

// =============================================================================
// 16. Manager — Additional Edge Cases
// =============================================================================

test.describe("Manager — Edge Cases", () => {
  test("GET /manager/leaves/calendar — narrow date range (1 day)", async ({
    request,
  }) => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request.get(
      `${API}/manager/leaves/calendar?start_date=${today}&end_date=${today}`,
      { headers: auth(mgrToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /manager/leaves/calendar — past date range", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/manager/leaves/calendar?start_date=2025-01-01&end_date=2025-01-31`,
      { headers: auth(mgrToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /manager/team — response contains employee info", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/team`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // If manager has team members, verify basic structure
    if (body.data.length > 0) {
      const member = body.data[0];
      expect(member).toHaveProperty("id");
    }
  });

  test("GET /manager/dashboard — response has expected sections", async ({
    request,
  }) => {
    const res = await request.get(`${API}/manager/dashboard`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Dashboard should return an object with dashboard data
    expect(typeof body.data).toBe("object");
  });
});

// =============================================================================
// 17. Wellness — Check-in Edge Cases
// =============================================================================

test.describe("Wellness — Check-in Edge Cases", () => {
  test("POST /wellness/check-in — mood=low with notes", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(adminToken),
      data: {
        mood: "low",
        energy_level: 2,
        sleep_hours: 5,
        notes: "Feeling under the weather",
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /wellness/check-in — mood=okay minimal data", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(mgrToken),
      data: {
        mood: "okay",
        energy_level: 3,
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /wellness/check-in — energy_level=0 rejected (min is 1)", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(empToken),
      data: {
        mood: "good",
        energy_level: 0,
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("POST /wellness/check-in — missing mood rejected", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(empToken),
      data: {
        energy_level: 3,
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("POST /wellness/check-in — missing energy_level rejected", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/check-in`, {
      headers: auth(empToken),
      data: {
        mood: "good",
      },
    });
    expect([400, 422]).toContain(res.status());
  });
});

// =============================================================================
// 18. Cross-Role Access Tests
// =============================================================================

test.describe("Cross-Role Access Verification", () => {
  test("Super admin can access manager dashboard", async ({ request }) => {
    const res = await request.get(`${API}/manager/dashboard`, {
      headers: auth(superToken),
    });
    // super_admin (100) >= manager (20)
    expect(res.status()).toBe(200);
  });

  test("Super admin can access wellness dashboard", async ({ request }) => {
    const res = await request.get(`${API}/wellness/dashboard`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Super admin can access forum dashboard", async ({ request }) => {
    const res = await request.get(`${API}/forum/dashboard`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Manager can access wellness endpoints", async ({ request }) => {
    const res = await request.get(`${API}/wellness/summary`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
  });

  test("Manager can access forum posts", async ({ request }) => {
    const res = await request.get(`${API}/forum/posts?page=1&per_page=5`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
  });

  test("Manager can access chatbot", async ({ request }) => {
    const res = await request.get(`${API}/chatbot/ai-status`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
  });

  test("Manager can access dashboard widgets", async ({ request }) => {
    const res = await request.get(`${API}/dashboard/widgets`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
  });

  test("Manager can access onboarding status", async ({ request }) => {
    const res = await request.get(`${API}/onboarding/status`, {
      headers: auth(mgrToken),
    });
    expect(res.status()).toBe(200);
  });
});

// =============================================================================
// 19. Forum — Search & Pagination
// =============================================================================

test.describe("Forum — Search & Pagination", () => {
  test("GET /forum/posts — search by keyword", async ({ request }) => {
    const res = await request.get(
      `${API}/forum/posts?search=E2E&page=1&per_page=10`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /forum/posts — page 2", async ({ request }) => {
    const res = await request.get(`${API}/forum/posts?page=2&per_page=5`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /forum/posts — filter by idea type", async ({ request }) => {
    const res = await request.get(
      `${API}/forum/posts?post_type=idea&page=1&per_page=5`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("GET /forum/posts — filter by discussion type", async ({ request }) => {
    const res = await request.get(
      `${API}/forum/posts?post_type=discussion&page=1&per_page=5`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 20. Wellness Goals — Additional Scenarios
// =============================================================================

test.describe("Wellness Goals — Sleep & Custom", () => {
  test("POST /wellness/goals — sleep goal", async ({ request }) => {
    const res = await request.post(`${API}/wellness/goals`, {
      headers: auth(mgrToken),
      data: {
        title: `Sleep Goal ${RUN}`,
        goal_type: "sleep",
        target_value: 8,
        unit: "hours",
        frequency: "daily",
        start_date: "2026-04-07",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /wellness/goals — custom goal", async ({ request }) => {
    const res = await request.post(`${API}/wellness/goals`, {
      headers: auth(mgrToken),
      data: {
        title: `Custom Wellness ${RUN}`,
        goal_type: "custom",
        target_value: 5,
        unit: "sessions",
        frequency: "weekly",
        start_date: "2026-04-07",
        end_date: "2026-06-07",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /wellness/goals — invalid goal_type rejected", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/goals`, {
      headers: auth(empToken),
      data: {
        title: "Bad Goal",
        goal_type: "invalid_type",
        target_value: 10,
        unit: "units",
        frequency: "daily",
        start_date: "2026-04-07",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("POST /wellness/goals — missing title rejected", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/goals`, {
      headers: auth(empToken),
      data: {
        goal_type: "steps",
        target_value: 10000,
        unit: "steps",
        frequency: "daily",
        start_date: "2026-04-07",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("POST /wellness/goals — target_value=0 rejected", async ({
    request,
  }) => {
    const res = await request.post(`${API}/wellness/goals`, {
      headers: auth(empToken),
      data: {
        title: "Zero Goal",
        goal_type: "steps",
        target_value: 0,
        unit: "steps",
        frequency: "daily",
        start_date: "2026-04-07",
      },
    });
    expect([400, 422]).toContain(res.status());
  });
});
