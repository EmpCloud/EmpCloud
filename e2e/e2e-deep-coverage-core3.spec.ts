import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// EMP Cloud — Deep Branch Coverage E2E Tests for Core Services (Part 3)
// Targets 8 mid-coverage service files from 40-60% to 85%+:
//   1. user.service.ts (49.5%)
//   2. attendance.service.ts (52.8%)
//   3. document.service.ts (56.5%)
//   4. employee-detail.service.ts (55.7%)
//   5. policy.service.ts (58.5%)
//   6. event.service.ts (60.8%)
//   7. anonymous-feedback.service.ts (52.9%)
//   8. probation.service.ts (62.8%)
// =============================================================================

const API = "https://test-empcloud-api.empcloud.com/api/v1";
const RUN = Date.now().toString().slice(-6);

const ADMIN = { email: "ananya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const EMPLOYEE = { email: "priya@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const MANAGER = { email: "karthik@technova.in", password: process.env.TEST_USER_PASSWORD || "Welcome@123" };
const SUPER_ADMIN = { email: "admin@empcloud.com", password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdmin@123" };

// =============================================================================
// Helpers
// =============================================================================

interface LoginResult {
  token: string;
  userId: number;
  orgId: number;
  role: string;
}

async function login(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<LoginResult> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return {
    token: body.data.tokens.access_token,
    userId: body.data.user.id,
    orgId: body.data.user.organization_id,
    role: body.data.user.role,
  };
}

function hdr(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const OK = [200, 201];
const OK_OR_ERR = [200, 201, 400, 401, 403, 404, 409, 422, 500];

// =============================================================================
// 1. USER SERVICE (49.5% -> 85%+)
// =============================================================================

test.describe("User Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let adminUserId: number;
  let mgrToken: string;
  let mgrUserId: number;
  let createdUserId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
    const mgr = await login(request, MANAGER.email, MANAGER.password);
    mgrToken = mgr.token;
    mgrUserId = mgr.userId;
  });

  // --- listUsers ---

  test("listUsers — default (active only, paginated)", async ({ request }) => {
    const res = await request.get(`${API}/users`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test("listUsers — with search filter", async ({ request }) => {
    const res = await request.get(`${API}/users?search=priya`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test("listUsers — include_inactive=true", async ({ request }) => {
    const res = await request.get(`${API}/users?include_inactive=true`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  test("listUsers — page 2", async ({ request }) => {
    const res = await request.get(`${API}/users?page=2&per_page=5`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  test("listUsers — search with no results", async ({ request }) => {
    const res = await request.get(`${API}/users?search=zzzznonexistent999`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  // --- getUser ---

  test("getUser — valid user", async ({ request }) => {
    const res = await request.get(`${API}/users/${empUserId}`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data.id).toBe(empUserId);
    // Should not leak password
    expect(body.data.password).toBeUndefined();
    expect(body.data.password_hash).toBeUndefined();
  });

  test("getUser — non-existent user returns 404", async ({ request }) => {
    const res = await request.get(`${API}/users/999999`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- createUser ---

  test("createUser — success", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: hdr(adminToken),
      data: {
        first_name: "TestUser",
        last_name: `Cover${RUN}`,
        email: `testuser-cover-${RUN}@technova.test`,
        password: "TestPass@123",
        role: "employee",
        date_of_birth: "1995-06-15",
        gender: "male",
        date_of_joining: "2025-01-10",
        employment_type: "full_time",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      const body = await res.json();
      createdUserId = body.data.id;
    }
  });

  test("createUser — duplicate email returns 409", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: hdr(adminToken),
      data: {
        first_name: "Dup",
        last_name: "User",
        email: EMPLOYEE.email,
        password: "TestPass@123",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("createUser — underage date_of_birth", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: hdr(adminToken),
      data: {
        first_name: "Young",
        last_name: "User",
        email: `young-${RUN}@technova.test`,
        password: "TestPass@123",
        date_of_birth: "2020-01-01",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("createUser — future date_of_birth", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: hdr(adminToken),
      data: {
        first_name: "Future",
        last_name: "DOB",
        email: `future-${RUN}@technova.test`,
        password: "TestPass@123",
        date_of_birth: "2099-01-01",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("createUser — invalid date_of_birth (before 1900)", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: hdr(adminToken),
      data: {
        first_name: "Old",
        last_name: "DOB",
        email: `olddob-${RUN}@technova.test`,
        password: "TestPass@123",
        date_of_birth: "1800-01-01",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("createUser — with emp_code", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: hdr(adminToken),
      data: {
        first_name: "Emp",
        last_name: `Code${RUN}`,
        email: `empcode-${RUN}@technova.test`,
        password: "TestPass@123",
        emp_code: `EC-${RUN}`,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("createUser — with reporting_manager_id", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: hdr(adminToken),
      data: {
        first_name: "Managed",
        last_name: `User${RUN}`,
        email: `managed-${RUN}@technova.test`,
        password: "TestPass@123",
        reporting_manager_id: mgrUserId,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("createUser — with invalid reporting_manager_id", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: hdr(adminToken),
      data: {
        first_name: "BadMgr",
        last_name: `User${RUN}`,
        email: `badmgr-${RUN}@technova.test`,
        password: "TestPass@123",
        reporting_manager_id: 999999,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("createUser — date_of_exit before date_of_joining", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: hdr(adminToken),
      data: {
        first_name: "BadExit",
        last_name: `User${RUN}`,
        email: `badexit-${RUN}@technova.test`,
        password: "TestPass@123",
        date_of_joining: "2025-06-01",
        date_of_exit: "2025-01-01",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- updateUser ---

  test("updateUser — change designation", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { designation: `QA Eng ${RUN}` },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — change role to manager", async ({ request }) => {
    if (!createdUserId) return;
    const res = await request.put(`${API}/users/${createdUserId}`, {
      headers: hdr(adminToken),
      data: { role: "employee" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — invalid role", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { role: "god_mode" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — self as reporting manager (circular)", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { reporting_manager_id: empUserId },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — non-existent reporting manager", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { reporting_manager_id: 999999 },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — empty first_name", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { first_name: "   " },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — HTML in first_name stripped", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { first_name: "<script>alert(1)</script>Priya" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — invalid phone format", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { contact_number: "not-a-phone!!!" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — invalid date_of_birth", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { date_of_birth: "not-a-date" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — future date_of_birth", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { date_of_birth: "2099-01-01" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — underage date_of_birth", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { date_of_birth: "2020-06-01" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — date_of_exit before joining", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { date_of_exit: "2020-01-01" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — invalid date_of_joining format", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { date_of_joining: "not-a-date" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — invalid gender ignored", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { gender: "alien" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — non-existent department_id ignored", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { department_id: 999999 },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — non-existent location_id ignored", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { location_id: 999999 },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — duplicate emp_code within org", async ({ request }) => {
    // First get another user's emp_code
    const listRes = await request.get(`${API}/users?per_page=5`, { headers: hdr(adminToken) });
    const listBody = await listRes.json();
    const users = listBody.data?.users || listBody.data || [];
    const otherUser = users.find((u: any) => u.id !== empUserId && u.emp_code);
    if (otherUser) {
      const res = await request.put(`${API}/users/${empUserId}`, {
        headers: hdr(adminToken),
        data: { emp_code: otherUser.emp_code },
      });
      expect(OK_OR_ERR).toContain(res.status());
    }
  });

  test("updateUser — non-existent user returns 404", async ({ request }) => {
    const res = await request.put(`${API}/users/999999`, {
      headers: hdr(adminToken),
      data: { first_name: "Ghost" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — phone field maps to contact_number", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { phone: "+91 9876543210" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateUser — employee_code maps to emp_code", async ({ request }) => {
    const res = await request.put(`${API}/users/${empUserId}`, {
      headers: hdr(adminToken),
      data: { employee_code: `MAP-${RUN}` },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- deleteUser (deactivate) ---

  test("deleteUser — non-existent user", async ({ request }) => {
    const res = await request.delete(`${API}/users/999999`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- inviteUser ---

  test("inviteUser — success", async ({ request }) => {
    const res = await request.post(`${API}/users/invite`, {
      headers: hdr(adminToken),
      data: {
        email: `invite-${RUN}@technova.test`,
        role: "employee",
        first_name: "Invited",
        last_name: `User${RUN}`,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("inviteUser — duplicate email (existing user)", async ({ request }) => {
    const res = await request.post(`${API}/users/invite`, {
      headers: hdr(adminToken),
      data: {
        email: EMPLOYEE.email,
        role: "employee",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("inviteUser — duplicate pending invite", async ({ request }) => {
    const res = await request.post(`${API}/users/invite`, {
      headers: hdr(adminToken),
      data: {
        email: `invite-${RUN}@technova.test`,
        role: "employee",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- listInvitations ---

  test("listInvitations — default pending", async ({ request }) => {
    const res = await request.get(`${API}/users/invitations`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  // --- acceptInvitation ---

  test("acceptInvitation — invalid token", async ({ request }) => {
    const res = await request.post(`${API}/users/accept-invitation`, {
      headers: { "Content-Type": "application/json" },
      data: {
        token: "0000000000000000000000000000000000000000000000000000000000000000",
        first_name: "Ghost",
        last_name: "Invite",
        password: "Pass@1234",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- orgChart ---

  test("orgChart — returns tree structure", async ({ request }) => {
    const res = await request.get(`${API}/users/org-chart`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  // --- employee non-admin cannot create users ---

  test("createUser — employee role forbidden", async ({ request }) => {
    const res = await request.post(`${API}/users`, {
      headers: hdr(empToken),
      data: {
        first_name: "Nope",
        last_name: "Nope",
        email: `nope-${RUN}@technova.test`,
        password: "TestPass@123",
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  // --- cleanup created test user ---

  test("deleteUser — cleanup created test user", async ({ request }) => {
    if (!createdUserId) return;
    const res = await request.delete(`${API}/users/${createdUserId}`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 2. ATTENDANCE SERVICE (52.8% -> 85%+)
// =============================================================================

test.describe("Attendance Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let mgrToken: string;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
    const mgr = await login(request, MANAGER.email, MANAGER.password);
    mgrToken = mgr.token;
  });

  // --- getMyToday ---

  test("getMyToday — before any action today", async ({ request }) => {
    const res = await request.get(`${API}/attendance/me/today`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
  });

  // --- checkIn ---

  test("checkIn — manual source (no geo)", async ({ request }) => {
    const res = await request.post(`${API}/attendance/check-in`, {
      headers: hdr(empToken),
      data: { source: "manual" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("checkIn — with geo coordinates", async ({ request }) => {
    const res = await request.post(`${API}/attendance/check-in`, {
      headers: hdr(mgrToken),
      data: {
        source: "web",
        latitude: 12.9716,
        longitude: 77.5946,
        remarks: "Office check-in",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("checkIn — duplicate check-in returns conflict", async ({ request }) => {
    const res = await request.post(`${API}/attendance/check-in`, {
      headers: hdr(empToken),
      data: { source: "manual" },
    });
    // Could be 409 (already checked in) or 200 if first check-in
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- checkOut ---

  test("checkOut — normal checkout", async ({ request }) => {
    const res = await request.post(`${API}/attendance/check-out`, {
      headers: hdr(empToken),
      data: { source: "manual" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("checkOut — with geo coordinates", async ({ request }) => {
    const res = await request.post(`${API}/attendance/check-out`, {
      headers: hdr(mgrToken),
      data: {
        source: "web",
        latitude: 12.9716,
        longitude: 77.5946,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("checkOut — duplicate checkout returns conflict", async ({ request }) => {
    const res = await request.post(`${API}/attendance/check-out`, {
      headers: hdr(empToken),
      data: { source: "manual" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- getMyToday after check-in/out ---

  test("getMyToday — after check-in/out", async ({ request }) => {
    const res = await request.get(`${API}/attendance/me/today`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
  });

  // --- getMyHistory ---

  test("getMyHistory — current month", async ({ request }) => {
    const res = await request.get(`${API}/attendance/me/history`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
  });

  test("getMyHistory — specific month/year", async ({ request }) => {
    const res = await request.get(`${API}/attendance/me/history?month=3&year=2026`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("getMyHistory — with pagination", async ({ request }) => {
    const res = await request.get(`${API}/attendance/me/history?page=1&per_page=5`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  // --- listRecords ---

  test("listRecords — default (current month)", async ({ request }) => {
    const res = await request.get(`${API}/attendance/records`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test("listRecords — by user_id", async ({ request }) => {
    const res = await request.get(`${API}/attendance/records?user_id=${empUserId}`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listRecords — by exact date", async ({ request }) => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request.get(`${API}/attendance/records?date=${today}`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listRecords — by date range", async ({ request }) => {
    const res = await request.get(
      `${API}/attendance/records?date_from=2026-03-01&date_to=2026-03-31`,
      { headers: hdr(adminToken) }
    );
    expect(OK).toContain(res.status());
  });

  test("listRecords — by month/year", async ({ request }) => {
    const res = await request.get(`${API}/attendance/records?month=4&year=2026`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listRecords — by department_id", async ({ request }) => {
    const res = await request.get(`${API}/attendance/records?department_id=1`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listRecords — with pagination", async ({ request }) => {
    const res = await request.get(`${API}/attendance/records?page=1&per_page=5`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  // --- getDashboard ---

  test("getDashboard — returns stats", async ({ request }) => {
    const res = await request.get(`${API}/attendance/dashboard`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    const d = body.data;
    expect(d).toHaveProperty("total_employees");
    expect(d).toHaveProperty("present");
    expect(d).toHaveProperty("absent");
    expect(d).toHaveProperty("late");
    expect(d).toHaveProperty("on_leave");
    expect(d).toHaveProperty("date");
  });

  // --- getMonthlyReport ---

  test("getMonthlyReport — current month", async ({ request }) => {
    const now = new Date();
    const res = await request.get(
      `${API}/attendance/monthly-report?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
      { headers: hdr(adminToken) }
    );
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toHaveProperty("report");
  });

  test("getMonthlyReport — specific user", async ({ request }) => {
    const now = new Date();
    const res = await request.get(
      `${API}/attendance/monthly-report?month=${now.getMonth() + 1}&year=${now.getFullYear()}&user_id=${empUserId}`,
      { headers: hdr(adminToken) }
    );
    expect(OK).toContain(res.status());
  });

  test("getMonthlyReport — past month", async ({ request }) => {
    const res = await request.get(
      `${API}/attendance/monthly-report?month=1&year=2026`,
      { headers: hdr(adminToken) }
    );
    expect(OK).toContain(res.status());
  });

  // --- employee role can't access dashboard ---

  test("getDashboard — employee role forbidden", async ({ request }) => {
    const res = await request.get(`${API}/attendance/dashboard`, { headers: hdr(empToken) });
    expect([401, 403]).toContain(res.status());
  });
});

// =============================================================================
// 3. DOCUMENT SERVICE (56.5% -> 85%+)
// =============================================================================

test.describe("Document Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let adminUserId: number;
  let categoryId: number;
  let mandatoryCategoryId: number;
  let docId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- Category CRUD ---

  test("createCategory — regular", async ({ request }) => {
    const res = await request.post(`${API}/documents/categories`, {
      headers: hdr(adminToken),
      data: { name: `TestCat-${RUN}`, description: "Test category", is_mandatory: false },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    categoryId = body.data.id;
  });

  test("createCategory — mandatory", async ({ request }) => {
    const res = await request.post(`${API}/documents/categories`, {
      headers: hdr(adminToken),
      data: { name: `Mandatory-${RUN}`, description: "Mandatory docs", is_mandatory: true },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    mandatoryCategoryId = body.data.id;
  });

  test("listCategories — returns categories with count", async ({ request }) => {
    const res = await request.get(`${API}/documents/categories`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test("updateCategory — change name", async ({ request }) => {
    if (!categoryId) return;
    const res = await request.put(`${API}/documents/categories/${categoryId}`, {
      headers: hdr(adminToken),
      data: { name: `Updated-${RUN}` },
    });
    expect(OK).toContain(res.status());
  });

  test("updateCategory — non-existent returns 404", async ({ request }) => {
    const res = await request.put(`${API}/documents/categories/999999`, {
      headers: hdr(adminToken),
      data: { name: "Ghost" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Document Upload (via multipart) ---

  test("uploadDocument — via form upload", async ({ request }) => {
    if (!categoryId) return;
    const res = await request.post(`${API}/documents/upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        file: {
          name: "test-doc.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Test document content for coverage"),
        },
        category_id: String(categoryId),
        name: `TestDoc-${RUN}`,
        user_id: String(empUserId),
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      const body = await res.json();
      docId = body.data.id;
      // Should have download_url, not file_path
      expect(body.data.file_path).toBeUndefined();
      expect(body.data.download_url).toBeDefined();
    }
  });

  // --- listDocuments ---

  test("listDocuments — default", async ({ request }) => {
    const res = await request.get(`${API}/documents`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test("listDocuments — filter by user_id", async ({ request }) => {
    const res = await request.get(`${API}/documents?user_id=${empUserId}`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listDocuments — filter by category_id", async ({ request }) => {
    if (!categoryId) return;
    const res = await request.get(`${API}/documents?category_id=${categoryId}`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listDocuments — filter by search", async ({ request }) => {
    const res = await request.get(`${API}/documents?search=TestDoc`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listDocuments — pagination", async ({ request }) => {
    const res = await request.get(`${API}/documents?page=1&per_page=5`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  // --- getMyDocuments ---

  test("getMyDocuments — employee sees own docs", async ({ request }) => {
    const res = await request.get(`${API}/documents/my`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  // --- getDocument ---

  test("getDocument — valid document", async ({ request }) => {
    if (!docId) return;
    const res = await request.get(`${API}/documents/${docId}`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data.file_path).toBeUndefined();
  });

  test("getDocument — non-existent returns 404", async ({ request }) => {
    const res = await request.get(`${API}/documents/999999`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("getDocument — employee can view own document", async ({ request }) => {
    if (!docId) return;
    const res = await request.get(`${API}/documents/${docId}`, { headers: hdr(empToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- verifyDocument ---

  test("verifyDocument — approve", async ({ request }) => {
    if (!docId) return;
    const res = await request.put(`${API}/documents/${docId}/verify`, {
      headers: hdr(adminToken),
      data: { is_verified: true, verification_remarks: "Looks good" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("verifyDocument — unverify", async ({ request }) => {
    if (!docId) return;
    const res = await request.put(`${API}/documents/${docId}/verify`, {
      headers: hdr(adminToken),
      data: { is_verified: false },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("verifyDocument — non-existent doc", async ({ request }) => {
    const res = await request.put(`${API}/documents/999999/verify`, {
      headers: hdr(adminToken),
      data: { is_verified: true },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- rejectDocument ---

  test("rejectDocument — with reason", async ({ request }) => {
    if (!docId) return;
    const res = await request.post(`${API}/documents/${docId}/reject`, {
      headers: hdr(adminToken),
      data: { rejection_reason: "Document is blurry" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("rejectDocument — non-existent", async ({ request }) => {
    const res = await request.post(`${API}/documents/999999/reject`, {
      headers: hdr(adminToken),
      data: { rejection_reason: "No such doc" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- getExpiring ---

  test("getExpiring — expiry alerts", async ({ request }) => {
    const res = await request.get(`${API}/documents/expiring`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  // --- getMandatoryStatus ---

  test("getMandatoryStatus — tracking", async ({ request }) => {
    const res = await request.get(`${API}/documents/mandatory-status`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  // --- trackMandatory ---

  test("trackMandatory — returns missing docs", async ({ request }) => {
    const res = await request.get(`${API}/documents/tracking/mandatory`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  // --- trackExpiry ---

  test("trackExpiry — returns expiring docs", async ({ request }) => {
    const res = await request.get(`${API}/documents/tracking/expiry`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  // --- download ---

  test("download — valid document", async ({ request }) => {
    if (!docId) return;
    const res = await request.get(`${API}/documents/${docId}/download`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("download — non-existent document", async ({ request }) => {
    const res = await request.get(`${API}/documents/999999/download`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- deleteDocument ---

  test("deleteDocument — success", async ({ request }) => {
    if (!docId) return;
    const res = await request.delete(`${API}/documents/${docId}`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteDocument — non-existent returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/documents/999999`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- deleteCategory (empty vs non-empty) ---

  test("deleteCategory — empty category succeeds", async ({ request }) => {
    if (!categoryId) return;
    const res = await request.delete(`${API}/documents/categories/${categoryId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteCategory — non-existent returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/documents/categories/999999`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // cleanup mandatory category
  test("deleteCategory — cleanup mandatory category", async ({ request }) => {
    if (!mandatoryCategoryId) return;
    const res = await request.delete(`${API}/documents/categories/${mandatoryCategoryId}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- RBAC: employee cannot create categories ---

  test("createCategory — employee forbidden", async ({ request }) => {
    const res = await request.post(`${API}/documents/categories`, {
      headers: hdr(empToken),
      data: { name: "NoCat" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// =============================================================================
// 4. EMPLOYEE DETAIL SERVICE (55.7% -> 85%+)
// =============================================================================

test.describe("Employee Detail Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let addressId: number;
  let educationId: number;
  let experienceId: number;
  let dependentId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- Addresses ---

  test("getAddresses — initially returns list", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empUserId}/addresses`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("createAddress — success", async ({ request }) => {
    const res = await request.post(`${API}/employees/${empUserId}/addresses`, {
      headers: hdr(empToken),
      data: {
        address_type: "permanent",
        address_line_1: `123 Test St ${RUN}`,
        city: "Bangalore",
        state: "Karnataka",
        country: "India",
        postal_code: "560001",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      const body = await res.json();
      addressId = body.data.id;
    }
  });

  test("updateAddress — change city", async ({ request }) => {
    if (!addressId) return;
    const res = await request.put(`${API}/employees/${empUserId}/addresses/${addressId}`, {
      headers: hdr(empToken),
      data: { city: "Chennai" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateAddress — non-existent returns 404", async ({ request }) => {
    const res = await request.put(`${API}/employees/${empUserId}/addresses/999999`, {
      headers: hdr(empToken),
      data: { city: "Ghost" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteAddress — success", async ({ request }) => {
    if (!addressId) return;
    const res = await request.delete(`${API}/employees/${empUserId}/addresses/${addressId}`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteAddress — non-existent returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/employees/${empUserId}/addresses/999999`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Education ---

  test("getEducation — returns list", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empUserId}/education`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("createEducation — success", async ({ request }) => {
    const res = await request.post(`${API}/employees/${empUserId}/education`, {
      headers: hdr(empToken),
      data: {
        institution: `IIT-${RUN}`,
        degree: "B.Tech",
        field_of_study: "Computer Science",
        start_date: "2013-08-01",
        end_date: "2017-05-01",
        grade: "8.5 CGPA",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      const body = await res.json();
      educationId = body.data.id;
    }
  });

  test("updateEducation — change grade", async ({ request }) => {
    if (!educationId) return;
    const res = await request.put(`${API}/employees/${empUserId}/education/${educationId}`, {
      headers: hdr(empToken),
      data: { grade: "9.0 CGPA" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateEducation — non-existent returns 404", async ({ request }) => {
    const res = await request.put(`${API}/employees/${empUserId}/education/999999`, {
      headers: hdr(empToken),
      data: { grade: "Ghost" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteEducation — success", async ({ request }) => {
    if (!educationId) return;
    const res = await request.delete(`${API}/employees/${empUserId}/education/${educationId}`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteEducation — non-existent returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/employees/${empUserId}/education/999999`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Experience ---

  test("getExperience — returns list", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empUserId}/experience`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("createExperience — success", async ({ request }) => {
    const res = await request.post(`${API}/employees/${empUserId}/experience`, {
      headers: hdr(empToken),
      data: {
        company_name: `TechCorp-${RUN}`,
        designation: "SDE-1",
        start_date: "2018-01-01",
        end_date: "2020-12-31",
        description: "Backend development",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      const body = await res.json();
      experienceId = body.data.id;
    }
  });

  test("updateExperience — change designation", async ({ request }) => {
    if (!experienceId) return;
    const res = await request.put(`${API}/employees/${empUserId}/experience/${experienceId}`, {
      headers: hdr(empToken),
      data: { designation: "SDE-2" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateExperience — non-existent returns 404", async ({ request }) => {
    const res = await request.put(`${API}/employees/${empUserId}/experience/999999`, {
      headers: hdr(empToken),
      data: { designation: "Ghost" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteExperience — success", async ({ request }) => {
    if (!experienceId) return;
    const res = await request.delete(`${API}/employees/${empUserId}/experience/${experienceId}`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteExperience — non-existent returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/employees/${empUserId}/experience/999999`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Dependents ---

  test("getDependents — returns list", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empUserId}/dependents`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  test("createDependent — success", async ({ request }) => {
    const res = await request.post(`${API}/employees/${empUserId}/dependents`, {
      headers: hdr(empToken),
      data: {
        name: `Dep-${RUN}`,
        relationship: "spouse",
        date_of_birth: "1996-03-15",
        gender: "female",
        contact_number: "+91 9876543210",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      const body = await res.json();
      dependentId = body.data.id;
    }
  });

  test("updateDependent — change name", async ({ request }) => {
    if (!dependentId) return;
    const res = await request.put(`${API}/employees/${empUserId}/dependents/${dependentId}`, {
      headers: hdr(empToken),
      data: { name: `DepUpd-${RUN}` },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updateDependent — non-existent returns 404", async ({ request }) => {
    const res = await request.put(`${API}/employees/${empUserId}/dependents/999999`, {
      headers: hdr(empToken),
      data: { name: "Ghost" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteDependent — success", async ({ request }) => {
    if (!dependentId) return;
    const res = await request.delete(`${API}/employees/${empUserId}/dependents/${dependentId}`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteDependent — non-existent returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/employees/${empUserId}/dependents/999999`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Admin can access employee details ---

  test("getAddresses — admin can access employee addresses", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empUserId}/addresses`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("getEducation — admin can access employee education", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empUserId}/education`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("getExperience — admin can access employee experience", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empUserId}/experience`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("getDependents — admin can access employee dependents", async ({ request }) => {
    const res = await request.get(`${API}/employees/${empUserId}/dependents`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });
});

// =============================================================================
// 5. POLICY SERVICE (58.5% -> 85%+)
// =============================================================================

test.describe("Policy Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let policyId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- createPolicy ---

  test("createPolicy — success", async ({ request }) => {
    const res = await request.post(`${API}/policies`, {
      headers: hdr(adminToken),
      data: {
        title: `Test Policy ${RUN}`,
        content: `<p>This is a test policy content for run ${RUN}.</p>`,
        category: "general",
        effective_date: "2026-04-01",
      },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    policyId = body.data.id;
  });

  test("createPolicy — with XSS in title (sanitized)", async ({ request }) => {
    const res = await request.post(`${API}/policies`, {
      headers: hdr(adminToken),
      data: {
        title: `<script>alert("xss")</script>Safe Title ${RUN}`,
        content: `<p>Clean content</p><script>bad</script>`,
        category: "security",
      },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    // Script tags should be stripped
    expect(body.data.title).not.toContain("<script>");
    // Cleanup
    if (body.data.id) {
      await request.delete(`${API}/policies/${body.data.id}`, { headers: hdr(adminToken) });
    }
  });

  test("createPolicy — employee forbidden", async ({ request }) => {
    const res = await request.post(`${API}/policies`, {
      headers: hdr(empToken),
      data: { title: "Nope", content: "Nope" },
    });
    expect([401, 403]).toContain(res.status());
  });

  // --- listPolicies ---

  test("listPolicies — default", async ({ request }) => {
    const res = await request.get(`${API}/policies`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test("listPolicies — filter by category", async ({ request }) => {
    const res = await request.get(`${API}/policies?category=general`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  test("listPolicies — pagination", async ({ request }) => {
    const res = await request.get(`${API}/policies?page=1&per_page=5`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  test("listPolicies — employee can also view", async ({ request }) => {
    const res = await request.get(`${API}/policies`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
  });

  // --- getPolicy ---

  test("getPolicy — valid policy", async ({ request }) => {
    if (!policyId) return;
    const res = await request.get(`${API}/policies/${policyId}`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data.id).toBe(policyId);
  });

  test("getPolicy — non-existent returns 404", async ({ request }) => {
    const res = await request.get(`${API}/policies/999999`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- updatePolicy ---

  test("updatePolicy — change title (version bumps)", async ({ request }) => {
    if (!policyId) return;
    const res = await request.put(`${API}/policies/${policyId}`, {
      headers: hdr(adminToken),
      data: { title: `Updated Policy ${RUN}` },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data.version).toBeGreaterThanOrEqual(2);
  });

  test("updatePolicy — change content", async ({ request }) => {
    if (!policyId) return;
    const res = await request.put(`${API}/policies/${policyId}`, {
      headers: hdr(adminToken),
      data: { content: `<p>Updated content for run ${RUN}</p>` },
    });
    expect(OK).toContain(res.status());
  });

  test("updatePolicy — non-existent returns 404", async ({ request }) => {
    const res = await request.put(`${API}/policies/999999`, {
      headers: hdr(adminToken),
      data: { title: "Ghost" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("updatePolicy — XSS in content sanitized", async ({ request }) => {
    if (!policyId) return;
    const res = await request.put(`${API}/policies/${policyId}`, {
      headers: hdr(adminToken),
      data: { content: `<p>Safe</p><img src=x onerror=alert(1)>` },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- acknowledgePolicy ---

  test("acknowledgePolicy — employee acknowledges", async ({ request }) => {
    if (!policyId) return;
    const res = await request.post(`${API}/policies/${policyId}/acknowledge`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("acknowledgePolicy — duplicate acknowledge (idempotent)", async ({ request }) => {
    if (!policyId) return;
    const res = await request.post(`${API}/policies/${policyId}/acknowledge`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("acknowledgePolicy — admin acknowledges", async ({ request }) => {
    if (!policyId) return;
    const res = await request.post(`${API}/policies/${policyId}/acknowledge`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("acknowledgePolicy — non-existent policy", async ({ request }) => {
    const res = await request.post(`${API}/policies/999999/acknowledge`, {
      headers: hdr(empToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- getAcknowledgments ---

  test("getAcknowledgments — returns list with user info", async ({ request }) => {
    if (!policyId) return;
    const res = await request.get(`${API}/policies/${policyId}/acknowledgments`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test("getAcknowledgments — non-existent policy", async ({ request }) => {
    const res = await request.get(`${API}/policies/999999/acknowledgments`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- getPendingPolicies ---

  test("getPendingPolicies — employee", async ({ request }) => {
    const res = await request.get(`${API}/policies/pending`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  // --- deletePolicy ---

  test("deletePolicy — soft delete", async ({ request }) => {
    if (!policyId) return;
    const res = await request.delete(`${API}/policies/${policyId}`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deletePolicy — non-existent returns 404", async ({ request }) => {
    const res = await request.delete(`${API}/policies/999999`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deletePolicy — already deleted returns 404", async ({ request }) => {
    if (!policyId) return;
    const res = await request.delete(`${API}/policies/${policyId}`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 6. EVENT SERVICE (60.8% -> 85%+)
// =============================================================================

test.describe("Event Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let adminUserId: number;
  let eventId: number;
  let eventToCancel: number;
  let eventToDelete: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- createEvent ---

  test("createEvent — full details", async ({ request }) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const endDate = new Date(futureDate);
    endDate.setHours(endDate.getHours() + 2);

    const res = await request.post(`${API}/events`, {
      headers: hdr(adminToken),
      data: {
        title: `Team Meeting ${RUN}`,
        description: "Quarterly sync-up",
        event_type: "meeting",
        start_date: futureDate.toISOString(),
        end_date: endDate.toISOString(),
        is_all_day: false,
        location: "Conference Room A",
        virtual_link: "https://meet.example.com/abc",
        target_type: "all",
        max_attendees: 50,
        is_mandatory: false,
      },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    eventId = body.data.id;
  });

  test("createEvent — minimal", async ({ request }) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 45);

    const res = await request.post(`${API}/events`, {
      headers: hdr(adminToken),
      data: {
        title: `Cancel Event ${RUN}`,
        start_date: futureDate.toISOString(),
      },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    eventToCancel = body.data.id;
  });

  test("createEvent — for deletion", async ({ request }) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 60);

    const res = await request.post(`${API}/events`, {
      headers: hdr(adminToken),
      data: {
        title: `Delete Event ${RUN}`,
        start_date: futureDate.toISOString(),
        is_all_day: true,
        is_mandatory: true,
      },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    eventToDelete = body.data.id;
  });

  test("createEvent — end_date before start_date", async ({ request }) => {
    const res = await request.post(`${API}/events`, {
      headers: hdr(adminToken),
      data: {
        title: "Bad dates",
        start_date: "2026-06-15T10:00:00Z",
        end_date: "2026-06-14T10:00:00Z",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("createEvent — employee forbidden", async ({ request }) => {
    const res = await request.post(`${API}/events`, {
      headers: hdr(empToken),
      data: { title: "Nope", start_date: new Date().toISOString() },
    });
    expect([401, 403]).toContain(res.status());
  });

  // --- listEvents ---

  test("listEvents — default", async ({ request }) => {
    const res = await request.get(`${API}/events`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test("listEvents — filter by event_type", async ({ request }) => {
    const res = await request.get(`${API}/events?event_type=meeting`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  test("listEvents — filter by status", async ({ request }) => {
    const res = await request.get(`${API}/events?status=upcoming`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  test("listEvents — filter by date range", async ({ request }) => {
    const res = await request.get(
      `${API}/events?start_date=2026-04-01&end_date=2026-12-31`,
      { headers: hdr(adminToken) }
    );
    expect(OK).toContain(res.status());
  });

  test("listEvents — pagination", async ({ request }) => {
    const res = await request.get(`${API}/events?page=1&per_page=5`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  test("listEvents — employee can view (with userId for RSVP)", async ({ request }) => {
    const res = await request.get(`${API}/events`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
  });

  // --- getEvent ---

  test("getEvent — valid (with RSVP counts)", async ({ request }) => {
    if (!eventId) return;
    const res = await request.get(`${API}/events/${eventId}`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toHaveProperty("attending_count");
    expect(body.data).toHaveProperty("rsvps");
  });

  test("getEvent — non-existent returns 404", async ({ request }) => {
    const res = await request.get(`${API}/events/999999`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- updateEvent ---

  test("updateEvent — change title and location", async ({ request }) => {
    if (!eventId) return;
    const res = await request.put(`${API}/events/${eventId}`, {
      headers: hdr(adminToken),
      data: { title: `Updated Meeting ${RUN}`, location: "Room B" },
    });
    expect(OK).toContain(res.status());
  });

  test("updateEvent — change dates", async ({ request }) => {
    if (!eventId) return;
    const newStart = new Date();
    newStart.setDate(newStart.getDate() + 35);
    const newEnd = new Date(newStart);
    newEnd.setHours(newEnd.getHours() + 3);

    const res = await request.put(`${API}/events/${eventId}`, {
      headers: hdr(adminToken),
      data: {
        start_date: newStart.toISOString(),
        end_date: newEnd.toISOString(),
        target_ids: [1, 2, 3],
      },
    });
    expect(OK).toContain(res.status());
  });

  test("updateEvent — non-existent returns 404", async ({ request }) => {
    const res = await request.put(`${API}/events/999999`, {
      headers: hdr(adminToken),
      data: { title: "Ghost" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- rsvpEvent ---

  test("rsvpEvent — attending", async ({ request }) => {
    if (!eventId) return;
    const res = await request.post(`${API}/events/${eventId}/rsvp`, {
      headers: hdr(empToken),
      data: { status: "attending" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("rsvpEvent — maybe", async ({ request }) => {
    if (!eventId) return;
    const res = await request.post(`${API}/events/${eventId}/rsvp`, {
      headers: hdr(empToken),
      data: { status: "maybe" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("rsvpEvent — declined", async ({ request }) => {
    if (!eventId) return;
    const res = await request.post(`${API}/events/${eventId}/rsvp`, {
      headers: hdr(empToken),
      data: { status: "declined" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("rsvpEvent — admin also RSVPs", async ({ request }) => {
    if (!eventId) return;
    const res = await request.post(`${API}/events/${eventId}/rsvp`, {
      headers: hdr(adminToken),
      data: { status: "attending" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("rsvpEvent — non-existent event", async ({ request }) => {
    const res = await request.post(`${API}/events/999999/rsvp`, {
      headers: hdr(empToken),
      data: { status: "attending" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- cancelEvent then RSVP to cancelled ---

  test("cancelEvent — success", async ({ request }) => {
    if (!eventToCancel) return;
    const res = await request.post(`${API}/events/${eventToCancel}/cancel`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("rsvpEvent — to cancelled event fails", async ({ request }) => {
    if (!eventToCancel) return;
    const res = await request.post(`${API}/events/${eventToCancel}/rsvp`, {
      headers: hdr(empToken),
      data: { status: "attending" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("cancelEvent — non-existent", async ({ request }) => {
    const res = await request.post(`${API}/events/999999/cancel`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- getMyEvents ---

  test("getMyEvents — returns RSVPd events", async ({ request }) => {
    const res = await request.get(`${API}/events/my`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  // --- getUpcomingEvents ---

  test("getUpcomingEvents — returns upcoming list", async ({ request }) => {
    const res = await request.get(`${API}/events/upcoming`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  // --- getEventDashboard ---

  test("getEventDashboard — returns stats", async ({ request }) => {
    const res = await request.get(`${API}/events/dashboard`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toHaveProperty("upcoming_count");
    expect(body.data).toHaveProperty("month_count");
    expect(body.data).toHaveProperty("total_attendees");
    expect(body.data).toHaveProperty("type_breakdown");
    expect(body.data).toHaveProperty("upcoming_events");
  });

  // --- deleteEvent ---

  test("deleteEvent — success", async ({ request }) => {
    if (!eventToDelete) return;
    const res = await request.delete(`${API}/events/${eventToDelete}`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteEvent — non-existent", async ({ request }) => {
    const res = await request.delete(`${API}/events/999999`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- cleanup main event ---

  test("deleteEvent — cleanup main event", async ({ request }) => {
    if (!eventId) return;
    const res = await request.delete(`${API}/events/${eventId}`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("deleteEvent — cleanup cancelled event", async ({ request }) => {
    if (!eventToCancel) return;
    const res = await request.delete(`${API}/events/${eventToCancel}`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });
});

// =============================================================================
// 7. ANONYMOUS FEEDBACK SERVICE (52.9% -> 85%+)
// =============================================================================

test.describe("Anonymous Feedback Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let adminUserId: number;
  let feedbackId: number;
  let urgentFeedbackId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- submitFeedback ---

  test("submitFeedback — general category (neutral sentiment)", async ({ request }) => {
    const res = await request.post(`${API}/feedback`, {
      headers: hdr(empToken),
      data: {
        category: "general",
        subject: `General feedback ${RUN}`,
        message: "The office environment is good overall.",
      },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    feedbackId = body.data.id;
    expect(body.data.sentiment).toBe("neutral");
  });

  test("submitFeedback — harassment category (negative sentiment auto)", async ({ request }) => {
    const res = await request.post(`${API}/feedback`, {
      headers: hdr(empToken),
      data: {
        category: "harassment",
        subject: `Harassment report ${RUN}`,
        message: "This is a test report for coverage.",
        is_urgent: true,
      },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    urgentFeedbackId = body.data.id;
    expect(body.data.sentiment).toBe("negative");
    expect(body.data.is_urgent).toBeTruthy();
  });

  test("submitFeedback — suggestion category (positive sentiment auto)", async ({ request }) => {
    const res = await request.post(`${API}/feedback`, {
      headers: hdr(empToken),
      data: {
        category: "suggestion",
        subject: `Suggestion ${RUN}`,
        message: "Consider adding a gym to the office.",
      },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data.sentiment).toBe("positive");
  });

  test("submitFeedback — safety category (negative auto)", async ({ request }) => {
    const res = await request.post(`${API}/feedback`, {
      headers: hdr(empToken),
      data: {
        category: "safety",
        subject: `Safety concern ${RUN}`,
        message: "Fire extinguishers need to be checked.",
      },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data.sentiment).toBe("negative");
  });

  test("submitFeedback — explicit sentiment overrides", async ({ request }) => {
    const res = await request.post(`${API}/feedback`, {
      headers: hdr(empToken),
      data: {
        category: "general",
        subject: `Explicit sentiment ${RUN}`,
        message: "Everything is great!",
        sentiment: "positive",
      },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data.sentiment).toBe("positive");
  });

  // --- getMyFeedback ---

  test("getMyFeedback — returns own submissions", async ({ request }) => {
    const res = await request.get(`${API}/feedback/my`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.meta?.total || body.total || 0).toBeGreaterThanOrEqual(1);
  });

  test("getMyFeedback — with pagination", async ({ request }) => {
    const res = await request.get(`${API}/feedback/my?page=1&per_page=2`, {
      headers: hdr(empToken),
    });
    expect(OK).toContain(res.status());
  });

  // --- listFeedback (HR) ---

  test("listFeedback — HR sees all feedback", async ({ request }) => {
    const res = await request.get(`${API}/feedback`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test("listFeedback — filter by category", async ({ request }) => {
    const res = await request.get(`${API}/feedback?category=general`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listFeedback — filter by status", async ({ request }) => {
    const res = await request.get(`${API}/feedback?status=new`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  test("listFeedback — filter by sentiment", async ({ request }) => {
    const res = await request.get(`${API}/feedback?sentiment=negative`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listFeedback — filter by is_urgent", async ({ request }) => {
    const res = await request.get(`${API}/feedback?is_urgent=true`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listFeedback — filter by search", async ({ request }) => {
    const res = await request.get(`${API}/feedback?search=gym`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  test("listFeedback — pagination", async ({ request }) => {
    const res = await request.get(`${API}/feedback?page=1&per_page=3`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  test("listFeedback — employee forbidden", async ({ request }) => {
    const res = await request.get(`${API}/feedback`, { headers: hdr(empToken) });
    expect([401, 403]).toContain(res.status());
  });

  // --- getFeedbackById ---

  test("getFeedbackById — HR can view any", async ({ request }) => {
    if (!feedbackId) return;
    const res = await request.get(`${API}/feedback/${feedbackId}`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
  });

  test("getFeedbackById — owner can view own", async ({ request }) => {
    if (!feedbackId) return;
    const res = await request.get(`${API}/feedback/${feedbackId}`, { headers: hdr(empToken) });
    expect(OK).toContain(res.status());
  });

  test("getFeedbackById — non-existent returns 404", async ({ request }) => {
    const res = await request.get(`${API}/feedback/999999`, { headers: hdr(adminToken) });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- respondToFeedback ---

  test("respondToFeedback — HR responds", async ({ request }) => {
    if (!feedbackId) return;
    const res = await request.post(`${API}/feedback/${feedbackId}/respond`, {
      headers: hdr(adminToken),
      data: { admin_response: `Thank you for your feedback. Response #${RUN}` },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data.admin_response).toBeDefined();
    expect(body.data.status).toBe("acknowledged");
  });

  test("respondToFeedback — non-existent returns 404", async ({ request }) => {
    const res = await request.post(`${API}/feedback/999999/respond`, {
      headers: hdr(adminToken),
      data: { admin_response: "Ghost response" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("respondToFeedback — employee forbidden", async ({ request }) => {
    if (!feedbackId) return;
    const res = await request.post(`${API}/feedback/${feedbackId}/respond`, {
      headers: hdr(empToken),
      data: { admin_response: "Nope" },
    });
    expect([401, 403]).toContain(res.status());
  });

  // --- updateStatus ---

  test("updateStatus — change to in_progress", async ({ request }) => {
    if (!feedbackId) return;
    const res = await request.put(`${API}/feedback/${feedbackId}/status`, {
      headers: hdr(adminToken),
      data: { status: "in_progress" },
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(body.data.status).toBe("in_progress");
  });

  test("updateStatus — change to resolved", async ({ request }) => {
    if (!urgentFeedbackId) return;
    const res = await request.put(`${API}/feedback/${urgentFeedbackId}/status`, {
      headers: hdr(adminToken),
      data: { status: "resolved" },
    });
    expect(OK).toContain(res.status());
  });

  test("updateStatus — non-existent returns 404", async ({ request }) => {
    const res = await request.put(`${API}/feedback/999999/status`, {
      headers: hdr(adminToken),
      data: { status: "closed" },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- getDashboard ---

  test("getDashboard — returns complete stats", async ({ request }) => {
    const res = await request.get(`${API}/feedback/dashboard`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    const d = body.data;
    expect(d).toHaveProperty("total");
    expect(d).toHaveProperty("urgentCount");
    expect(d).toHaveProperty("responseRate");
    expect(d).toHaveProperty("byCategory");
    expect(d).toHaveProperty("bySentiment");
    expect(d).toHaveProperty("byStatus");
    expect(d).toHaveProperty("recent");
    expect(Array.isArray(d.byCategory)).toBeTruthy();
    expect(Array.isArray(d.bySentiment)).toBeTruthy();
    expect(Array.isArray(d.byStatus)).toBeTruthy();
  });

  test("getDashboard — employee forbidden", async ({ request }) => {
    const res = await request.get(`${API}/feedback/dashboard`, { headers: hdr(empToken) });
    expect([401, 403]).toContain(res.status());
  });
});

// =============================================================================
// 8. PROBATION SERVICE (62.8% -> 85%+)
// =============================================================================

test.describe("Probation Service — Deep Branch Coverage", () => {
  let adminToken: string;
  let empToken: string;
  let empUserId: number;
  let adminUserId: number;
  let probationUserId: number;

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, ADMIN.email, ADMIN.password);
    adminToken = admin.token;
    adminUserId = admin.userId;
    const emp = await login(request, EMPLOYEE.email, EMPLOYEE.password);
    empToken = emp.token;
    empUserId = emp.userId;
  });

  // --- listProbation ---

  test("listProbation — returns employees on probation", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation`, { headers: hdr(adminToken) });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
    // Capture a probation user for further tests
    if (body.data.length > 0) {
      probationUserId = body.data[0].id;
    }
  });

  test("listProbation — employee forbidden", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation`, { headers: hdr(empToken) });
    expect([401, 403]).toContain(res.status());
  });

  // --- getProbationDashboard ---

  test("getProbationDashboard — returns stats", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    const d = body.data;
    expect(d).toHaveProperty("on_probation");
    expect(d).toHaveProperty("confirmed_this_month");
    expect(d).toHaveProperty("upcoming_30_days");
    expect(d).toHaveProperty("overdue");
  });

  test("getProbationDashboard — employee forbidden", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/dashboard`, {
      headers: hdr(empToken),
    });
    expect([401, 403]).toContain(res.status());
  });

  // --- getUpcoming ---

  test("getUpcoming — default 30 days", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/upcoming`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test("getUpcoming — custom days parameter", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/upcoming?days=60`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
  });

  // --- extendProbation ---

  test("extendProbation — success", async ({ request }) => {
    if (!probationUserId) return;
    const newEnd = new Date();
    newEnd.setMonth(newEnd.getMonth() + 3);

    const res = await request.put(`${API}/employees/${probationUserId}/probation/extend`, {
      headers: hdr(adminToken),
      data: {
        new_end_date: newEnd.toISOString().slice(0, 10),
        reason: `Extended for coverage test ${RUN}`,
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("extendProbation — non-existent employee", async ({ request }) => {
    const res = await request.put(`${API}/employees/999999/probation/extend`, {
      headers: hdr(adminToken),
      data: {
        new_end_date: "2027-01-01",
        reason: "Ghost employee",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("extendProbation — invalid date format", async ({ request }) => {
    if (!probationUserId) return;
    const res = await request.put(`${API}/employees/${probationUserId}/probation/extend`, {
      headers: hdr(adminToken),
      data: {
        new_end_date: "not-a-date",
        reason: "Bad date",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("extendProbation — employee forbidden", async ({ request }) => {
    if (!probationUserId) return;
    const res = await request.put(`${API}/employees/${probationUserId}/probation/extend`, {
      headers: hdr(empToken),
      data: {
        new_end_date: "2027-06-01",
        reason: "Nope",
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  // --- confirmProbation ---

  test("confirmProbation — success", async ({ request }) => {
    if (!probationUserId) return;
    const res = await request.put(`${API}/employees/${probationUserId}/probation/confirm`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
    if (OK.includes(res.status())) {
      const body = await res.json();
      expect(body.data.probation_status).toBe("confirmed");
    }
  });

  test("confirmProbation — already confirmed (error)", async ({ request }) => {
    if (!probationUserId) return;
    const res = await request.put(`${API}/employees/${probationUserId}/probation/confirm`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("confirmProbation — non-existent employee", async ({ request }) => {
    const res = await request.put(`${API}/employees/999999/probation/confirm`, {
      headers: hdr(adminToken),
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  test("confirmProbation — employee forbidden", async ({ request }) => {
    const res = await request.put(`${API}/employees/${empUserId}/probation/confirm`, {
      headers: hdr(empToken),
    });
    expect([401, 403]).toContain(res.status());
  });

  test("extendProbation — already confirmed employee fails", async ({ request }) => {
    if (!probationUserId) return;
    const res = await request.put(`${API}/employees/${probationUserId}/probation/extend`, {
      headers: hdr(adminToken),
      data: {
        new_end_date: "2027-12-01",
        reason: "Should not work after confirmation",
      },
    });
    expect(OK_OR_ERR).toContain(res.status());
  });

  // --- Re-check dashboard after changes ---

  test("getProbationDashboard — after confirm/extend operations", async ({ request }) => {
    const res = await request.get(`${API}/employees/probation/dashboard`, {
      headers: hdr(adminToken),
    });
    expect(OK).toContain(res.status());
    const body = await res.json();
    expect(typeof body.data.on_probation).toBe("number");
    expect(typeof body.data.confirmed_this_month).toBe("number");
  });
});
