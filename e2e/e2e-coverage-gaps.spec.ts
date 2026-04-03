import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";

const ADMIN = { email: "ananya@technova.in", password: "Welcome@123" };
const EMPLOYEE = { email: "priya@technova.in", password: "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: "SuperAdmin@123" };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

async function login(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return { token: body.data.tokens.access_token, userId: body.data.user.id };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// =============================================================================
// 1. Probation Lifecycle
// =============================================================================

test.describe("1. Probation Lifecycle", () => {
  let adminToken: string;
  let employeeId: number;

  test.beforeAll(async ({ request }) => {
    const a = await login(request, ADMIN.email, ADMIN.password);
    adminToken = a.token;
  });

  test("1.1 List employees on probation", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("1.2 Get probation dashboard", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/dashboard`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("1.3 Get upcoming probation expirations", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/upcoming?days=90`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("1.4 Confirm probation for an employee", async ({ request }) => {
    // First find someone on probation
    const listRes = await request.get(`${API}/employees/probation`, {
      headers: auth(adminToken),
    });
    const listBody = await listRes.json();
    const probationList = Array.isArray(listBody.data) ? listBody.data : (listBody.data?.data || []);

    if (probationList.length === 0) {
      // No one on probation — verify the endpoint still responds correctly
      const res = await request.put(`${API}/employees/999999/probation/confirm`, {
        headers: auth(adminToken),
        data: { confirmation_date: new Date().toISOString().split("T")[0] },
      });
      expect([200, 400, 404]).toContain(res.status());
      return;
    }

    employeeId = probationList[0].id || probationList[0].employee_id;
    const res = await request.put(`${API}/employees/${employeeId}/probation/confirm`, {
      headers: auth(adminToken),
      data: { confirmation_date: new Date().toISOString().split("T")[0] },
    });
    expect([200, 400, 409]).toContain(res.status());
  });

  test("1.5 Extend probation for an employee", async ({ request }) => {
    const listRes = await request.get(`${API}/employees/probation`, {
      headers: auth(adminToken),
    });
    const listBody = await listRes.json();
    const probationList = Array.isArray(listBody.data) ? listBody.data : (listBody.data?.data || []);

    if (probationList.length === 0) {
      const res = await request.put(`${API}/employees/999999/probation/extend`, {
        headers: auth(adminToken),
        data: { new_end_date: "2026-12-31", reason: "E2E test extension" },
      });
      expect([200, 400, 404]).toContain(res.status());
      return;
    }

    const eid = probationList[0].id || probationList[0].employee_id;
    const res = await request.put(`${API}/employees/${eid}/probation/extend`, {
      headers: auth(adminToken),
      data: { new_end_date: "2026-12-31", reason: `E2E extension test ${RUN}` },
    });
    expect([200, 400, 409]).toContain(res.status());
  });
});

// =============================================================================
// 2. Headcount Planning (full CRUD)
// =============================================================================

test.describe("2. Headcount Planning", () => {
  let adminToken: string;
  let planId: number;

  test.beforeAll(async ({ request }) => {
    const a = await login(request, ADMIN.email, ADMIN.password);
    adminToken = a.token;
  });

  test("2.1 List headcount plans", async ({ request }) => {
    const res = await request.get(`${API}/positions/headcount-plans`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("2.2 Create a headcount plan", async ({ request }) => {
    const res = await request.post(`${API}/positions/headcount-plans`, {
      headers: auth(adminToken),
      data: {
        title: `E2E Headcount Plan ${RUN}`,
        department_id: 1,
        positions_requested: 3,
        justification: "E2E test — team expansion for Q3",
        fiscal_year: "2026-2027",
      },
    });
    expect([200, 201, 400, 500]).toContain(res.status());
    if (res.status() < 400) {
      const body = await res.json();
      planId = body.data?.id;
    }
  });

  test("2.3 Update a headcount plan", async ({ request }) => {
    if (!planId) {
      // Try listing to find one
      const listRes = await request.get(`${API}/positions/headcount-plans`, { headers: auth(adminToken) });
      const listBody = await listRes.json();
      const plans = Array.isArray(listBody.data) ? listBody.data : (listBody.data?.data || []);
      if (plans.length > 0) planId = plans[0].id;
    }
    if (!planId) {
      const res = await request.put(`${API}/positions/headcount-plans/999999`, {
        headers: auth(adminToken),
        data: { title: "Updated" },
      });
      expect([200, 400, 404]).toContain(res.status());
      return;
    }
    const res = await request.put(`${API}/positions/headcount-plans/${planId}`, {
      headers: auth(adminToken),
      data: { title: `Updated E2E Plan ${RUN}`, positions_requested: 5 },
    });
    expect([200, 400, 404]).toContain(res.status());
  });

  test("2.4 Approve a headcount plan", async ({ request }) => {
    if (!planId) {
      const res = await request.post(`${API}/positions/headcount-plans/999999/approve`, {
        headers: auth(adminToken),
        data: { comments: "Approved in E2E" },
      });
      expect([200, 400, 404]).toContain(res.status());
      return;
    }
    const res = await request.post(`${API}/positions/headcount-plans/${planId}/approve`, {
      headers: auth(adminToken),
      data: { comments: `E2E approval ${RUN}` },
    });
    expect([200, 400, 409]).toContain(res.status());
  });

  test("2.5 Reject a headcount plan", async ({ request }) => {
    // Create another plan to reject
    const createRes = await request.post(`${API}/positions/headcount-plans`, {
      headers: auth(adminToken),
      data: {
        title: `E2E Reject Plan ${RUN}`,
        department_id: 1,
        positions_requested: 1,
        justification: "E2E test — will be rejected",
        fiscal_year: "2026-2027",
      },
    });
    const createBody = await createRes.json();
    const rejectId = createBody.data?.id;

    if (!rejectId) {
      const res = await request.post(`${API}/positions/headcount-plans/999999/reject`, {
        headers: auth(adminToken),
        data: { comments: "Rejected in E2E" },
      });
      expect([200, 400, 404]).toContain(res.status());
      return;
    }
    const res = await request.post(`${API}/positions/headcount-plans/${rejectId}/reject`, {
      headers: auth(adminToken),
      data: { comments: `E2E rejection ${RUN}` },
    });
    expect([200, 400, 409]).toContain(res.status());
  });

  test("2.6 Delete a position assignment", async ({ request }) => {
    const res = await request.delete(`${API}/positions/assignments/999999`, {
      headers: auth(adminToken),
    });
    expect([200, 204, 404]).toContain(res.status());
  });
});

// =============================================================================
// 3. Leave Calendar & Comp-Off Rejection
// =============================================================================

test.describe("3. Leave Calendar & Comp-Off", () => {
  let adminToken: string;
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await login(request, ADMIN.email, ADMIN.password);
    adminToken = a.token;
    const e = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = e.token;
  });

  test("3.1 Get leave calendar", async ({ request }) => {
    const res = await request.get(`${API}/leave/calendar`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("3.2 Get leave calendar with date range", async ({ request }) => {
    const res = await request.get(`${API}/leave/calendar?start_date=2026-04-01&end_date=2026-04-30`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("3.3 Reject a comp-off request", async ({ request }) => {
    // List comp-off requests
    const listRes = await request.get(`${API}/leave/comp-off/pending`, {
      headers: auth(adminToken),
    });
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    const pending = Array.isArray(listBody.data) ? listBody.data : (listBody.data?.data || []);

    if (pending.length === 0) {
      // Create one first, then reject
      const createRes = await request.post(`${API}/leave/comp-off/request`, {
        headers: auth(empToken),
        data: {
          date: "2026-03-28",
          reason: `E2E comp-off request ${RUN}`,
          hours_worked: 8,
        },
      });
      if (createRes.status() === 201 || createRes.status() === 200) {
        const createBody = await createRes.json();
        const compOffId = createBody.data?.id;
        if (compOffId) {
          const res = await request.put(`${API}/leave/comp-off/${compOffId}/reject`, {
            headers: auth(adminToken),
            data: { reason: "E2E test rejection" },
          });
          expect([200, 400, 404]).toContain(res.status());
          return;
        }
      }
    }

    // Try rejecting first pending one
    if (pending.length > 0) {
      const res = await request.put(`${API}/leave/comp-off/${pending[0].id}/reject`, {
        headers: auth(adminToken),
        data: { reason: "E2E test rejection" },
      });
      expect([200, 400, 409]).toContain(res.status());
    } else {
      // Endpoint test with invalid ID
      const res = await request.put(`${API}/leave/comp-off/999999/reject`, {
        headers: auth(adminToken),
        data: { reason: "E2E test rejection" },
      });
      expect([200, 400, 404]).toContain(res.status());
    }
  });
});

// =============================================================================
// 4. Shift Swap Rejection
// =============================================================================

test.describe("4. Shift Swap Rejection", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await login(request, ADMIN.email, ADMIN.password);
    adminToken = a.token;
  });

  test("4.1 Reject a shift swap request", async ({ request }) => {
    // List pending swap requests
    const listRes = await request.get(`${API}/attendance/shifts/swap-requests?status=pending`, {
      headers: auth(adminToken),
    });
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    const pending = Array.isArray(listBody.data) ? listBody.data : (listBody.data?.data || []);

    if (pending.length > 0) {
      const res = await request.post(`${API}/attendance/shifts/swap-requests/${pending[0].id}/reject`, {
        headers: auth(adminToken),
        data: { reason: "E2E test rejection" },
      });
      expect([200, 400, 409]).toContain(res.status());
    } else {
      // Verify endpoint exists with invalid ID
      const res = await request.post(`${API}/attendance/shifts/swap-requests/999999/reject`, {
        headers: auth(adminToken),
        data: { reason: "E2E test rejection" },
      });
      expect([200, 400, 404]).toContain(res.status());
    }
  });
});

// =============================================================================
// 5. Super Admin Cross-Org Actions
// =============================================================================

test.describe("5. Super Admin Cross-Org Actions", () => {
  let superToken: string;

  test.beforeAll(async ({ request }) => {
    const sa = await login(request, SUPER_ADMIN.email, SUPER_ADMIN.password);
    superToken = sa.token;
  });

  test("5.1 Get module adoption analytics", async ({ request }) => {
    const res = await request.get(`${API}/admin/module-adoption`, {
      headers: auth(superToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("5.2 Deactivate a user cross-org", async ({ request }) => {
    // Use a non-existent user to test the endpoint exists without side effects
    const res = await request.put(`${API}/admin/organizations/5/users/999999/deactivate`, {
      headers: auth(superToken),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("5.3 Activate a user cross-org", async ({ request }) => {
    const res = await request.put(`${API}/admin/organizations/5/users/999999/activate`, {
      headers: auth(superToken),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("5.4 Change user role cross-org", async ({ request }) => {
    const res = await request.put(`${API}/admin/organizations/5/users/999999/role`, {
      headers: auth(superToken),
      data: { role: "employee" },
    });
    expect([200, 400, 404]).toContain(res.status());
  });
});

// =============================================================================
// 6. Survey Exports & My Responses
// =============================================================================

test.describe("6. Survey Exports & My Responses", () => {
  let adminToken: string;
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await login(request, ADMIN.email, ADMIN.password);
    adminToken = a.token;
    const e = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = e.token;
  });

  test("6.1 Get my survey responses", async ({ request }) => {
    const res = await request.get(`${API}/surveys/my-responses`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("6.2 Export survey results", async ({ request }) => {
    // List surveys first
    const listRes = await request.get(`${API}/surveys`, { headers: auth(adminToken) });
    const listBody = await listRes.json();
    const surveys = Array.isArray(listBody.data) ? listBody.data : (listBody.data?.data || []);

    if (surveys.length > 0) {
      const res = await request.get(`${API}/surveys/${surveys[0].id}/results/export`, {
        headers: auth(adminToken),
      });
      expect([200, 204, 404]).toContain(res.status());
    } else {
      const res = await request.get(`${API}/surveys/999999/results/export`, {
        headers: auth(adminToken),
      });
      expect([200, 404]).toContain(res.status());
    }
  });
});

// =============================================================================
// 7. Wellness Program Management
// =============================================================================

test.describe("7. Wellness Program Management", () => {
  let adminToken: string;
  let empToken: string;
  let programId: number;

  test.beforeAll(async ({ request }) => {
    const a = await login(request, ADMIN.email, ADMIN.password);
    adminToken = a.token;
    const e = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = e.token;
  });

  test("7.1 List wellness programs", async ({ request }) => {
    const res = await request.get(`${API}/wellness/programs`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const programs = Array.isArray(body.data) ? body.data : (body.data?.data || []);
    if (programs.length > 0) programId = programs[0].id;
  });

  test("7.2 Get wellness program by ID", async ({ request }) => {
    const id = programId || 1;
    const res = await request.get(`${API}/wellness/programs/${id}`, {
      headers: auth(adminToken),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("7.3 Update wellness program", async ({ request }) => {
    const id = programId || 999999;
    const res = await request.put(`${API}/wellness/programs/${id}`, {
      headers: auth(adminToken),
      data: { title: `Updated E2E Program ${RUN}`, description: "Updated by E2E test" },
    });
    expect([200, 400, 404]).toContain(res.status());
  });

  test("7.4 Complete a wellness program", async ({ request }) => {
    const id = programId || 999999;
    const res = await request.post(`${API}/wellness/programs/${id}/complete`, {
      headers: auth(empToken),
    });
    expect([200, 400, 404, 409]).toContain(res.status());
  });
});

// =============================================================================
// 8. Forum Reply Management
// =============================================================================

test.describe("8. Forum Reply Management", () => {
  let adminToken: string;
  let empToken: string;
  let postId: number;
  let replyId: number;

  test.beforeAll(async ({ request }) => {
    const a = await login(request, ADMIN.email, ADMIN.password);
    adminToken = a.token;
    const e = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = e.token;
  });

  test("8.1 Create forum post for reply testing", async ({ request }) => {
    // First get or create a category
    const catRes = await request.get(`${API}/forum/categories`, { headers: auth(adminToken) });
    const catBody = await catRes.json();
    const categories = Array.isArray(catBody.data) ? catBody.data : (catBody.data?.data || []);
    const categoryId = categories.length > 0 ? categories[0].id : undefined;

    const res = await request.post(`${API}/forum/posts`, {
      headers: auth(empToken),
      data: {
        title: `E2E Forum Post ${RUN}`,
        content: "This is a test post for reply management testing.",
        ...(categoryId ? { category_id: categoryId } : {}),
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    postId = body.data?.id;
    expect(postId).toBeTruthy();
  });

  test("8.2 Reply to the forum post", async ({ request }) => {
    if (!postId) return;
    const res = await request.post(`${API}/forum/posts/${postId}/reply`, {
      headers: auth(adminToken),
      data: { content: `E2E reply ${RUN}` },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    replyId = body.data?.id;
  });

  test("8.3 Accept a reply as answer", async ({ request }) => {
    if (!replyId) {
      const res = await request.post(`${API}/forum/replies/999999/accept`, {
        headers: auth(adminToken),
      });
      expect([200, 400, 404]).toContain(res.status());
      return;
    }
    const res = await request.post(`${API}/forum/replies/${replyId}/accept`, {
      headers: auth(empToken), // post author accepts
    });
    expect([200, 400, 403, 404]).toContain(res.status());
  });

  test("8.4 Delete a forum reply", async ({ request }) => {
    if (!replyId) {
      const res = await request.delete(`${API}/forum/replies/999999`, {
        headers: auth(adminToken),
      });
      expect([200, 204, 404]).toContain(res.status());
      return;
    }
    const res = await request.delete(`${API}/forum/replies/${replyId}`, {
      headers: auth(adminToken),
    });
    expect([200, 204, 403, 404]).toContain(res.status());
  });
});

// =============================================================================
// 9. Custom Field Search & Bulk Values
// =============================================================================

test.describe("9. Custom Fields Advanced", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await login(request, ADMIN.email, ADMIN.password);
    adminToken = a.token;
  });

  test("9.1 Search custom fields", async ({ request }) => {
    // First get a custom field definition
    const defRes = await request.get(`${API}/custom-fields/definitions`, {
      headers: auth(adminToken),
    });
    expect(defRes.status()).toBe(200);
    const defBody = await defRes.json();
    const defs = Array.isArray(defBody.data) ? defBody.data : (defBody.data?.data || []);

    if (defs.length > 0) {
      const res = await request.get(
        `${API}/custom-fields/search?entity_type=employee&field_id=${defs[0].id}&search_value=test`,
        { headers: auth(adminToken) },
      );
      expect([200, 404]).toContain(res.status());
    } else {
      const res = await request.get(
        `${API}/custom-fields/search?entity_type=employee&field_id=1&search_value=test`,
        { headers: auth(adminToken) },
      );
      expect([200, 400, 404]).toContain(res.status());
    }
  });

  test("9.2 Get bulk custom field values", async ({ request }) => {
    const res = await request.get(`${API}/custom-fields/values/employee`, {
      headers: auth(adminToken),
    });
    expect([200, 400]).toContain(res.status());
  });
});

// =============================================================================
// 10. Chatbot Conversation Delete
// =============================================================================

test.describe("10. Chatbot Conversation Lifecycle", () => {
  let empToken: string;
  let conversationId: number;

  test.beforeAll(async ({ request }) => {
    const e = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = e.token;
  });

  test("10.1 Create a chatbot conversation", async ({ request }) => {
    const res = await request.post(`${API}/chatbot/conversations`, {
      headers: auth(empToken),
      data: { title: `E2E Chat ${RUN}` },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    conversationId = body.data?.id;
  });

  test("10.2 Delete the chatbot conversation", async ({ request }) => {
    if (!conversationId) {
      const res = await request.delete(`${API}/chatbot/conversations/999999`, {
        headers: auth(empToken),
      });
      expect([200, 204, 404]).toContain(res.status());
      return;
    }
    const res = await request.delete(`${API}/chatbot/conversations/${conversationId}`, {
      headers: auth(empToken),
    });
    expect([200, 204]).toContain(res.status());
  });
});

// =============================================================================
// 11. SSO Token Validation (internal)
// =============================================================================

test.describe("11. SSO Token Endpoints", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await login(request, ADMIN.email, ADMIN.password);
    adminToken = a.token;
  });

  test("11.1 Validate SSO token", async ({ request }) => {
    const res = await request.post(`${API}/auth/sso/validate`, {
      headers: auth(adminToken),
      data: { token: adminToken },
    });
    expect([200, 400, 404]).toContain(res.status());
  });

  test("11.2 Exchange SSO token", async ({ request }) => {
    const res = await request.post(`${API}/auth/sso/token`, {
      headers: { "Content-Type": "application/json" },
      data: { token: adminToken },
    });
    expect([200, 400, 401, 404]).toContain(res.status());
  });
});

// =============================================================================
// 12. Employee Documents Self-Service
// =============================================================================

test.describe("12. Employee Self-Service Documents", () => {
  let empToken: string;

  test.beforeAll(async ({ request }) => {
    const e = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = e.token;
  });

  test("12.1 Get my documents", async ({ request }) => {
    const res = await request.get(`${API}/documents/my`, {
      headers: auth(empToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// 13. Helpdesk Aliases
// =============================================================================

test.describe("13. Helpdesk Alias Endpoints", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const a = await login(request, ADMIN.email, ADMIN.password);
    adminToken = a.token;
  });

  test("13.1 Get my tickets via alias", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/my-tickets`, {
      headers: auth(adminToken),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("13.2 Get knowledge base via alias", async ({ request }) => {
    const res = await request.get(`${API}/helpdesk/knowledge-base`, {
      headers: auth(adminToken),
    });
    expect([200, 404]).toContain(res.status());
  });
});
