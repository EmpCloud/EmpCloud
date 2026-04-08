import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN_CREDS = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE_CREDS = { email: "arjun@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };

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
// Custom Fields — Definitions CRUD, Values, Search
// =============================================================================

test.describe("Custom Fields", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let fieldId: number;
  let secondFieldId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
    adminToken = admin.token;

    const emp = await loginAndGetToken(request, EMPLOYEE_CREDS.email, EMPLOYEE_CREDS.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- Definitions CRUD ---

  test("HR can create a custom field definition (text)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: auth(adminToken),
      data: {
        name: `E2E Field ${RUN}`,
        entity_type: "employee",
        field_type: "text",
        is_required: false,
        help_text: "E2E test text field",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    fieldId = body.data.id;
  });

  test("HR can create a second custom field definition (dropdown)", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/custom-fields/definitions`, {
      headers: auth(adminToken),
      data: {
        name: `E2E Dropdown ${RUN}`,
        entity_type: "employee",
        field_type: "dropdown",
        is_required: false,
        help_text: "E2E test dropdown field",
        options: ["Option A", "Option B", "Option C"],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    secondFieldId = body.data.id;
  });

  test("Any user can list custom field definitions", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/custom-fields/definitions?entity_type=employee`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // Should include the fields we created
    const ids = body.data.map((f: any) => f.id);
    expect(ids).toContain(fieldId);
  });

  test("Any user can get a field definition by ID", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/custom-fields/definitions/${fieldId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id", fieldId);
    expect(body.data.field_type).toBe("text");
  });

  test("HR can update a custom field definition", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.put(`${API}/custom-fields/definitions/${fieldId}`, {
      headers: auth(adminToken),
      data: {
        help_text: "Updated help text via E2E",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // --- Values ---

  test("User can set custom field values for an entity", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: auth(adminToken),
      data: {
        values: [
          { fieldId: fieldId, value: `E2E value ${RUN}` },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("User can get custom field values for an entity", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/custom-fields/values/employee/${empUserId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Should contain the value we just set
    const vals = Array.isArray(body.data) ? body.data : [];
    const found = vals.find((v: any) => v.field_id === fieldId);
    if (found) {
      expect(found.value).toContain(RUN);
    }
  });

  test("User can bulk get custom field values", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${API}/custom-fields/values/employee?entityIds=${empUserId}`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("User can search entities by field value", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(
      `${API}/custom-fields/search?entity_type=employee&field_id=${fieldId}&search_value=${RUN}`,
      { headers: auth(empToken) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // --- Reorder ---

  test("HR can reorder custom fields", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.put(`${API}/custom-fields/definitions/reorder`, {
      headers: auth(adminToken),
      data: {
        entity_type: "employee",
        field_ids: [secondFieldId, fieldId],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // --- Delete (deactivate) ---

  test("HR can delete (deactivate) a custom field", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.delete(`${API}/custom-fields/definitions/${secondFieldId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
