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
// 1. Survey CRUD, Publish, Respond, Results
// =============================================================================

test.describe("Surveys", () => {
  let adminToken: string;
  let empToken: string;
  let surveyId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    empToken = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
  });

  test("Create a survey (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/surveys`, {
      headers: auth(adminToken),
      data: {
        title: `E2E Survey ${Date.now()}`,
        description: "Automated test survey",
        type: "pulse",
        questions: [
          { question_text: "How satisfied are you?", question_type: "rating_1_5", is_required: true },
          { question_text: "Any comments?", question_type: "text", is_required: false },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    surveyId = body.data.id;
    expect(surveyId).toBeGreaterThan(0);
  });

  test("List surveys (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/surveys`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Get survey by ID", async ({ request }) => {
    test.setTimeout(30_000);
    // Use a known survey or the one we just created
    const listRes = await request.get(`${API}/surveys`, {
      headers: auth(adminToken),
    });
    const listBody = await listRes.json();
    const surveys = listBody.data || [];
    expect(surveys.length, "Prerequisite failed — no data found in surveys").toBeGreaterThan(0);
    const id = surveys[0].id;
    const res = await request.get(`${API}/surveys/${id}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(id);
  });

  test("Update a draft survey", async ({ request }) => {
    test.setTimeout(30_000);
    // Create a fresh draft to update
    const createRes = await request.post(`${API}/surveys`, {
      headers: auth(adminToken),
      data: {
        title: `Draft Update Test ${Date.now()}`,
        description: "To be updated",
        type: "pulse",
        questions: [
          { question_text: "Q1?", question_type: "text", is_required: true },
        ],
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const draftId = createBody.data.id;

    const res = await request.put(`${API}/surveys/${draftId}`, {
      headers: auth(adminToken),
      data: {
        title: `Updated Draft ${Date.now()}`,
        description: "Updated description",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("PUT status change returns 400", async ({ request }) => {
    test.setTimeout(30_000);
    // Create a draft to attempt status change via PUT
    const createRes = await request.post(`${API}/surveys`, {
      headers: auth(adminToken),
      data: {
        title: `Status PUT Test ${Date.now()}`,
        description: "Should fail status change",
        type: "pulse",
        questions: [
          { question_text: "Q?", question_type: "text", is_required: true },
        ],
      },
    });
    expect(createRes.status()).toBe(201);
    const sid = (await createRes.json()).data.id;

    const res = await request.put(`${API}/surveys/${sid}`, {
      headers: auth(adminToken),
      data: { status: "active" },
    });
    // Must reject status change via PUT
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("Publish a survey", async ({ request }) => {
    test.setTimeout(30_000);
    // Create + publish
    const createRes = await request.post(`${API}/surveys`, {
      headers: auth(adminToken),
      data: {
        title: `Publish Test ${Date.now()}`,
        description: "Will be published",
        type: "pulse",
        questions: [
          { question_text: "Rate us", question_type: "rating_1_5", is_required: true },
          { question_text: "Comments?", question_type: "text", is_required: false },
        ],
      },
    });
    expect(createRes.status()).toBe(201);
    const sid = (await createRes.json()).data.id;

    const res = await request.post(`${API}/surveys/${sid}/publish`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Store for response test
    surveyId = sid;
  });

  test("Employee responds to published survey", async ({ request }) => {
    test.setTimeout(30_000);
    // Get active surveys for employee
    const activeRes = await request.get(`${API}/surveys/active`, {
      headers: auth(empToken),
    });
    expect(activeRes.status()).toBe(200);
    const activeBody = await activeRes.json();
    const activeSurveys = activeBody.data || [];

    // Pick one to respond to (preferably the one we published)
    const target = activeSurveys.find((s: any) => s.id === surveyId) || activeSurveys[0];
    expect(target, 'Prerequisite failed — target was not set').toBeTruthy();

    // Get survey detail to know questions
    const detailRes = await request.get(`${API}/surveys/${target.id}`, {
      headers: auth(empToken),
    });
    expect(detailRes.status()).toBe(200);
    const detail = (await detailRes.json()).data;
    const questions = detail.questions || [];

    // Build answers
    const answers = questions.map((q: any) => ({
      question_id: q.id,
      answer_text: q.question_type === "rating" ? "4" : "Great",
    }));

    const res = await request.post(`${API}/surveys/${target.id}/respond`, {
      headers: auth(empToken),
      data: { answers },
    });
    // 201 on first response, 400 if already responded
    expect([201, 400]).toContain(res.status());
  });

  test("Survey results aggregation (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    // List surveys and pick one with responses
    const listRes = await request.get(`${API}/surveys?status=active`, {
      headers: auth(adminToken),
    });
    const surveys = (await listRes.json()).data || [];
    expect(surveys.length, "Prerequisite failed — no data found in surveys").toBeGreaterThan(0);
    const sid = surveyId || surveys[0].id;

    const res = await request.get(`${API}/surveys/${sid}/results`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Results should have some structure
    expect(body.data).toBeDefined();
  });

  test("Survey dashboard (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/surveys/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Delete draft survey", async ({ request }) => {
    test.setTimeout(30_000);
    // Create a draft to delete
    const createRes = await request.post(`${API}/surveys`, {
      headers: auth(adminToken),
      data: {
        title: `Delete Test ${Date.now()}`,
        description: "Will be deleted",
        type: "pulse",
        questions: [
          { question_text: "Q?", question_type: "text", is_required: true },
        ],
      },
    });
    expect(createRes.status()).toBe(201);
    const sid = (await createRes.json()).data.id;

    const res = await request.delete(`${API}/surveys/${sid}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test("Close a survey (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    // Create + publish + close
    const createRes = await request.post(`${API}/surveys`, {
      headers: auth(adminToken),
      data: {
        title: `Close Test ${Date.now()}`,
        description: "Will be closed",
        type: "pulse",
        questions: [
          { question_text: "Q?", question_type: "rating_1_5", is_required: true },
        ],
      },
    });
    const sid = (await createRes.json()).data.id;
    await request.post(`${API}/surveys/${sid}/publish`, { headers: auth(adminToken) });

    const res = await request.post(`${API}/surveys/${sid}/close`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 2. Anonymous Feedback
// =============================================================================

test.describe("Anonymous Feedback", () => {
  let adminToken: string;
  let empToken: string;
  let feedbackId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    empToken = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
  });

  test("Submit anonymous feedback", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/feedback`, {
      headers: auth(empToken),
      data: {
        category: "workplace",
        subject: "E2E Feedback",
        message: `E2E anonymous feedback ${Date.now()}`,
        is_urgent: false,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    feedbackId = body.data.id;
    expect(feedbackId).toBeGreaterThan(0);
  });

  test("Submit anonymous feedback (anonymous flag)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/feedback`, {
      headers: auth(empToken),
      data: {
        category: "management",
        subject: "Anonymous Flag Test",
        message: `Anonymous flag test ${Date.now()}`,
        is_urgent: false,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Feedback should not expose user identity in response
    const str = JSON.stringify(body.data);
    expect(str).not.toContain("arjun@technova.in");
  });

  test("Employee views own feedback by ID (FIXED)", async ({ request }) => {
    test.setTimeout(30_000);
    expect(feedbackId, 'Prerequisite failed — feedbackId was not set').toBeTruthy();
    const res = await request.get(`${API}/feedback/${feedbackId}`, {
      headers: auth(empToken),
    });
    // Owner should be able to view their own feedback
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(feedbackId);
  });

  test("Employee views own feedback list", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/feedback/my`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR lists all feedback", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/feedback`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should be a paginated list
    const items = body.data || [];
    expect(Array.isArray(items)).toBe(true);
  });

  test("HR responds to feedback", async ({ request }) => {
    test.setTimeout(30_000);
    // Get latest feedback
    const listRes = await request.get(`${API}/feedback`, {
      headers: auth(adminToken),
    });
    const items = (await listRes.json()).data || [];
    expect(items.length, "Prerequisite failed — no data found in items").toBeGreaterThan(0);
    const id = feedbackId || items[0].id;

    const res = await request.post(`${API}/feedback/${id}/respond`, {
      headers: auth(adminToken),
      data: {
        admin_response: `HR response at ${Date.now()}`,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("HR updates feedback status", async ({ request }) => {
    test.setTimeout(30_000);
    const listRes = await request.get(`${API}/feedback`, {
      headers: auth(adminToken),
    });
    const items = (await listRes.json()).data || [];
    expect(items.length, "Prerequisite failed — no data found in items").toBeGreaterThan(0);
    const id = feedbackId || items[0].id;

    const res = await request.put(`${API}/feedback/${id}/status`, {
      headers: auth(adminToken),
      data: { status: "under_review" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Feedback dashboard (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/feedback/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 3. Forum / Social Intranet
// =============================================================================

test.describe("Forum", () => {
  let adminToken: string;
  let empToken: string;
  let postId: number;
  let categoryId: number;
  let replyId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    empToken = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
  });

  test("Create forum category (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/forum/categories`, {
      headers: auth(adminToken),
      data: {
        name: `E2E Category ${Date.now()}`,
        description: "Test category",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    categoryId = body.data.id;
  });

  test("List forum categories", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/forum/categories`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const categories = body.data || [];
    expect(Array.isArray(categories)).toBe(true);
    if (categories.length > 0 && !categoryId) {
      categoryId = categories[0].id;
    }
  });

  test("Create forum post", async ({ request }) => {
    test.setTimeout(30_000);
    if (!categoryId) {
      // Fetch a category
      const catRes = await request.get(`${API}/forum/categories`, { headers: auth(empToken) });
      const cats = (await catRes.json()).data || [];
      expect(cats.length, "Prerequisite failed — no data found in cats").toBeGreaterThan(0);
      categoryId = cats[0].id;
    }

    const res = await request.post(`${API}/forum/posts`, {
      headers: auth(empToken),
      data: {
        title: `E2E Forum Post ${Date.now()}`,
        content: "This is a test post from E2E automation",
        category_id: categoryId,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    postId = body.data.id;
    expect(postId).toBeGreaterThan(0);
  });

  test("List forum posts", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/forum/posts`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Get forum post by ID", async ({ request }) => {
    test.setTimeout(30_000);
    expect(postId, 'Prerequisite failed — postId was not set').toBeTruthy();
    const res = await request.get(`${API}/forum/posts/${postId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(postId);
  });

  test("Search forum posts", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/forum/posts?search=E2E`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Filter forum posts by category", async ({ request }) => {
    test.setTimeout(30_000);
    expect(categoryId, 'Prerequisite failed — categoryId was not set').toBeTruthy();
    const res = await request.get(`${API}/forum/posts?category_id=${categoryId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Reply to forum post", async ({ request }) => {
    test.setTimeout(30_000);
    expect(postId, 'Prerequisite failed — postId was not set').toBeTruthy();
    const res = await request.post(`${API}/forum/posts/${postId}/reply`, {
      headers: auth(adminToken),
      data: {
        content: `E2E Reply ${Date.now()}`,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    replyId = body.data.id;
  });

  test("Like a forum post (toggle)", async ({ request }) => {
    test.setTimeout(30_000);
    expect(postId, 'Prerequisite failed — postId was not set').toBeTruthy();
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

  test("Like a reply (toggle)", async ({ request }) => {
    test.setTimeout(30_000);
    expect(replyId, 'Prerequisite failed — replyId was not set').toBeTruthy();
    const res = await request.post(`${API}/forum/like`, {
      headers: auth(empToken),
      data: {
        target_type: "reply",
        target_id: replyId,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Moderation: Pin a post (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    expect(postId, 'Prerequisite failed — postId was not set').toBeTruthy();
    const res = await request.post(`${API}/forum/posts/${postId}/pin`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Moderation: Lock a post (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    expect(postId, 'Prerequisite failed — postId was not set').toBeTruthy();
    const res = await request.post(`${API}/forum/posts/${postId}/lock`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Forum dashboard (HR)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/forum/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("Delete forum post (author)", async ({ request }) => {
    test.setTimeout(30_000);
    // Create a new post to delete
    expect(categoryId, 'Prerequisite failed — categoryId was not set').toBeTruthy();
    const createRes = await request.post(`${API}/forum/posts`, {
      headers: auth(empToken),
      data: {
        title: `Delete Me ${Date.now()}`,
        content: "This post will be deleted",
        category_id: categoryId,
      },
    });
    expect(createRes.status()).toBe(201);
    const delId = (await createRes.json()).data.id;

    const res = await request.delete(`${API}/forum/posts/${delId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
  });
});
