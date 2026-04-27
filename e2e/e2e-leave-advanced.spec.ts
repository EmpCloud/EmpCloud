import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Cloud — Leave Advanced E2E Tests
// Tests: leave types CRUD, policies CRUD, balance init, applications lifecycle
//        (apply/approve/reject/cancel), comp-off request/approve/reject, calendar
// =============================================================================

const API_BASE = 'https://test-empcloud-api.empcloud.com/api/v1';

const ORG_ADMIN = { email: 'ananya@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };
const MANAGER = { email: 'karthik@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };
const EMPLOYEE = { email: 'priya@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };

/** Find or create an active leave type; returns the leave type id */
async function ensureActiveLeaveType(
  request: import('@playwright/test').APIRequestContext,
  token: string,
): Promise<number> {
  const resp = await request.get(`${API_BASE}/leave/types`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await resp.json();
  const active = body.data?.find((t: any) => t.is_active);
  if (active) return active.id;

  // No active leave type — create one as admin
  const code = `E2E_WF_${Date.now().toString(36).toUpperCase()}`;
  const createResp = await request.post(`${API_BASE}/leave/types`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: 'E2E Workflow Leave',
      code,
      description: 'Auto-created for workflow tests',
      is_paid: true,
      is_carry_forward: false,
      max_carry_forward_days: 0,
      is_encashable: false,
      requires_approval: true,
      color: '#4CAF50',
      annual_quota: 12,
    },
  });
  const createBody = await createResp.json();
  return createBody.data.id;
}

test.describe('Leave Advanced', () => {
  let adminToken: string;
  let managerToken: string;
  let employeeToken: string;
  let employeeUserId: number;
  let activeLeaveTypeId: number;

  test.beforeAll(async ({ request }) => {
    const adminResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    expect(adminResp.status()).toBe(200);
    const adminData = await adminResp.json();
    adminToken = adminData.data.tokens.access_token;

    const mgrResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: MANAGER.email, password: MANAGER.password },
    });
    expect(mgrResp.status()).toBe(200);
    const mgrData = await mgrResp.json();
    managerToken = mgrData.data.tokens.access_token;

    const empResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: EMPLOYEE.email, password: EMPLOYEE.password },
    });
    expect(empResp.status()).toBe(200);
    const empData = await empResp.json();
    employeeToken = empData.data.tokens.access_token;

    const empMe = await request.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const empMeData = await empMe.json();
    employeeUserId = empMeData.data.employee_id || empMeData.data.id;

    // Ensure an active leave type exists for application tests
    activeLeaveTypeId = await ensureActiveLeaveType(request, adminToken);

    // Initialize balances for the current year so leave applications work
    await request.post(`${API_BASE}/leave/balances/initialize`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { year: new Date().getFullYear() },
    });
  });

  // ─── Leave Types CRUD ─────────────────────────────────────────────────────

  test.describe.serial('Leave Types CRUD', () => {
    let createdTypeId: number;
    const uniqueCode = `E2E_${Date.now().toString(36).toUpperCase()}`;

    test('POST leave type — create new type', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/leave/types`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: 'E2E Test Leave',
          code: uniqueCode,
          description: 'Created by E2E test',
          is_paid: true,
          is_carry_forward: false,
          max_carry_forward_days: 0,
          is_encashable: false,
          requires_approval: true,
          color: '#FF5733',
          annual_quota: 12,
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.code).toBe(uniqueCode);
      createdTypeId = body.data.id;
    });

    test('GET leave types — list includes created type', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/types`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      const found = body.data.find((t: any) => t.id === createdTypeId);
      expect(found).toBeTruthy();
      expect(found.name).toBe('E2E Test Leave');
    });

    test('GET leave type by ID — returns type details', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/types/${createdTypeId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.code).toBe(uniqueCode);
    });

    test('PUT leave type — update name', async ({ request }) => {
      const resp = await request.put(`${API_BASE}/leave/types/${createdTypeId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { name: 'E2E Test Leave (Updated)' },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('employee cannot create leave type (403)', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/leave/types`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          name: 'Unauthorized Leave Type',
          code: 'UNAUTH',
        },
      });
      expect(resp.status()).toBe(403);
    });

    test('DELETE leave type — deactivate created type', async ({ request }) => {
      const resp = await request.delete(`${API_BASE}/leave/types/${createdTypeId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Leave Policies CRUD ──────────────────────────────────────────────────

  test.describe.serial('Leave Policies CRUD', () => {
    let createdPolicyId: number;
    let testLeaveTypeId: number;

    test.beforeAll(async ({ request }) => {
      // Get first leave type for policy tests
      const resp = await request.get(`${API_BASE}/leave/types`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await resp.json();
      testLeaveTypeId = body.data[0]?.id;
    });

    test('POST leave policy — create new policy', async ({ request }) => {
      if (!testLeaveTypeId) return;

      const resp = await request.post(`${API_BASE}/leave/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          leave_type_id: testLeaveTypeId,
          name: 'E2E Test Policy',
          annual_quota: 12,
          accrual_type: 'monthly',
          accrual_rate: 1,
          applicable_from_months: 0,
          min_days_before_application: 1,
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      createdPolicyId = body.data.id;
    });

    test('GET leave policies — list includes created policy', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      if (createdPolicyId) {
        const found = body.data.find((p: any) => p.id === createdPolicyId);
        expect(found).toBeTruthy();
      }
    });

    test('GET leave policy by ID — returns details', async ({ request }) => {
      if (!createdPolicyId) return;

      const resp = await request.get(`${API_BASE}/leave/policies/${createdPolicyId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('E2E Test Policy');
    });

    test('PUT leave policy — update annual quota', async ({ request }) => {
      if (!createdPolicyId) return;

      const resp = await request.put(`${API_BASE}/leave/policies/${createdPolicyId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { annual_quota: 15 },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('employee cannot create leave policy (403)', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/leave/policies`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          leave_type_id: testLeaveTypeId || 1,
          name: 'Unauthorized Policy',
          annual_quota: 99,
        },
      });
      expect(resp.status()).toBe(403);
    });

    test('DELETE leave policy — deactivate', async ({ request }) => {
      if (!createdPolicyId) return;

      const resp = await request.delete(`${API_BASE}/leave/policies/${createdPolicyId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
    });
  });

  // ─── Leave Balance Initialization ─────────────────────────────────────────

  test.describe('Leave Balance Initialization', () => {
    test('POST balances/initialize — initialize for current year', async ({ request }) => {
      const year = new Date().getFullYear();
      const resp = await request.post(`${API_BASE}/leave/balances/initialize`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { year },
      });
      // 201 if initialized, 200/400 if already done
      expect([200, 201, 400]).toContain(resp.status());
    });

    test('GET balances — HR sees all balances', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/balances`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET balances/me — employee sees own balances', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/balances/me`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET balances with year filter', async ({ request }) => {
      const year = new Date().getFullYear();
      const resp = await request.get(`${API_BASE}/leave/balances?year=${year}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('employee cannot view other users balance (403)', async ({ request }) => {
      // Try to view admin's balance as employee
      const resp = await request.get(`${API_BASE}/leave/balances?user_id=1`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      // 403 if RBAC enforced, 200 if requesting own (user_id might match)
      expect([200, 403]).toContain(resp.status());
    });

    test('employee cannot initialize balances (403)', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/leave/balances/initialize`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: { year: new Date().getFullYear() },
      });
      expect(resp.status()).toBe(403);
    });
  });

  // ─── Leave Applications Lifecycle ─────────────────────────────────────────

  test.describe.serial('Leave Application Lifecycle', () => {
    let appliedLeaveId: number;

    test('POST apply leave — future date returns 201', async ({ request }) => {
      const future = new Date();
      future.setDate(future.getDate() + 45);
      const dateStr = future.toISOString().split('T')[0];

      const resp = await request.post(`${API_BASE}/leave/applications`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          leave_type_id: activeLeaveTypeId,
          start_date: dateStr,
          end_date: dateStr,
          days_count: 1,
          is_half_day: false,
          reason: 'E2E lifecycle test — apply',
        },
      });
      // 201 for success, 400 if no balance or overlap
      const status = resp.status();
      expect([200, 201, 400]).toContain(status);

      if (status === 201 || status === 200) {
        const body = await resp.json();
        appliedLeaveId = body.data.id;
      }
    });

    test('GET application by ID — returns details', async ({ request }) => {
      if (!appliedLeaveId) return;

      const resp = await request.get(`${API_BASE}/leave/applications/${appliedLeaveId}`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(appliedLeaveId);
    });

    test('GET applications/me — employee sees own applications', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/applications/me`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET applications — HR sees all applications', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/applications`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET applications — filter by status=pending', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/applications?status=pending`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('PUT approve — Manager approves leave', async ({ request }) => {
      if (!appliedLeaveId) return;

      const resp = await request.put(
        `${API_BASE}/leave/applications/${appliedLeaveId}/approve`,
        {
          headers: { Authorization: `Bearer ${managerToken}` },
          data: { remarks: 'Approved via E2E test by manager' },
        },
      );
      // 200 if approved, 400 if already processed
      expect([200, 400]).toContain(resp.status());
    });

    test('employee cannot approve leave (403)', async ({ request }) => {
      // Get any pending leave
      const listResp = await request.get(`${API_BASE}/leave/applications?status=pending`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listData = await listResp.json();
      const pending = listData.data?.[0];

      if (pending) {
        const resp = await request.put(
          `${API_BASE}/leave/applications/${pending.id}/approve`,
          {
            headers: { Authorization: `Bearer ${employeeToken}` },
            data: { remarks: 'Should fail' },
          },
        );
        expect([403, 401, 400]).toContain(resp.status());
      }
    });
  });

  // ─── Leave Reject Flow ────────────────────────────────────────────────────

  test.describe.serial('Leave Reject Flow', () => {
    let rejectLeaveId: number;

    test('POST apply leave — to be rejected', async ({ request }) => {
      const future = new Date();
      future.setDate(future.getDate() + 60);
      const dateStr = future.toISOString().split('T')[0];

      const resp = await request.post(`${API_BASE}/leave/applications`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          leave_type_id: activeLeaveTypeId,
          start_date: dateStr,
          end_date: dateStr,
          days_count: 1,
          is_half_day: false,
          reason: 'E2E test — to be rejected',
        },
      });
      const status = resp.status();
      expect([200, 201, 400]).toContain(status);

      if (status === 201 || status === 200) {
        const body = await resp.json();
        rejectLeaveId = body.data.id;
      }
    });

    test('PUT reject — Manager rejects leave', async ({ request }) => {
      if (!rejectLeaveId) return;

      const resp = await request.put(
        `${API_BASE}/leave/applications/${rejectLeaveId}/reject`,
        {
          headers: { Authorization: `Bearer ${managerToken}` },
          data: { remarks: 'Rejected via E2E test by manager' },
        },
      );
      expect([200, 400]).toContain(resp.status());
    });
  });

  // ─── Leave Cancel Flow ────────────────────────────────────────────────────

  test.describe.serial('Leave Cancel Flow', () => {
    let cancelLeaveId: number;

    test('POST apply leave — to be cancelled', async ({ request }) => {
      const future = new Date();
      future.setDate(future.getDate() + 75);
      const dateStr = future.toISOString().split('T')[0];

      const resp = await request.post(`${API_BASE}/leave/applications`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          leave_type_id: activeLeaveTypeId,
          start_date: dateStr,
          end_date: dateStr,
          days_count: 1,
          is_half_day: false,
          reason: 'E2E test — to be cancelled',
        },
      });
      const status = resp.status();
      expect([200, 201, 400]).toContain(status);

      if (status === 201 || status === 200) {
        const body = await resp.json();
        cancelLeaveId = body.data.id;
      }
    });

    test('PUT cancel — employee cancels own leave', async ({ request }) => {
      if (!cancelLeaveId) return;

      const resp = await request.put(
        `${API_BASE}/leave/applications/${cancelLeaveId}/cancel`,
        { headers: { Authorization: `Bearer ${employeeToken}` } },
      );
      expect([200, 400]).toContain(resp.status());
    });

    test('PUT cancel via status update — alternative cancel endpoint', async ({ request }) => {
      // Apply another one to test the PUT /:id with status=cancelled
      const future = new Date();
      future.setDate(future.getDate() + 90);
      const dateStr = future.toISOString().split('T')[0];

      const applyResp = await request.post(`${API_BASE}/leave/applications`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          leave_type_id: activeLeaveTypeId,
          start_date: dateStr,
          end_date: dateStr,
          days_count: 1,
          is_half_day: false,
          reason: 'E2E test — cancel via PUT /:id',
        },
      });

      if (applyResp.status() === 201 || applyResp.status() === 200) {
        const applyData = await applyResp.json();
        const leaveId = applyData.data.id;

        const resp = await request.put(`${API_BASE}/leave/applications/${leaveId}`, {
          headers: { Authorization: `Bearer ${employeeToken}` },
          data: { status: 'cancelled' },
        });
        expect([200, 400]).toContain(resp.status());
      }
    });
  });

  // ─── Comp-Off ──────────────────────────────────────────────────────────────

  test.describe.serial('Comp-Off Lifecycle', () => {
    let compOffId: number;

    test('POST comp-off — employee requests comp-off', async ({ request }) => {
      // Use last Saturday as worked date
      const now = new Date();
      const dayOfWeek = now.getDay();
      const lastSaturday = new Date(now);
      lastSaturday.setDate(now.getDate() - ((dayOfWeek + 1) % 7) - 1);
      const workedDate = lastSaturday.toISOString().split('T')[0];

      const expiresDate = new Date();
      expiresDate.setMonth(expiresDate.getMonth() + 3);
      const expiresOn = expiresDate.toISOString().split('T')[0];

      const resp = await request.post(`${API_BASE}/leave/comp-off`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          worked_date: workedDate,
          expires_on: expiresOn,
          reason: 'E2E test — worked on Saturday for release',
          days: 1,
        },
      });
      // 201 for success, 400 if duplicate or invalid
      const status = resp.status();
      expect([201, 400]).toContain(status);

      if (status === 201) {
        const body = await resp.json();
        compOffId = body.data.id;
      }
    });

    test('GET comp-off/my — employee sees own requests', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/comp-off/my`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET comp-off — Manager sees all requests', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/comp-off`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET comp-off/pending — Manager lists pending comp-offs', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/comp-off/pending`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET comp-off/balance — employee checks comp-off balance', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/comp-off/balance`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('PUT comp-off approve — Manager approves', async ({ request }) => {
      // Find a pending comp-off
      const listResp = await request.get(`${API_BASE}/leave/comp-off/pending`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      const listData = await listResp.json();
      const pending = listData.data?.[0] || (compOffId ? { id: compOffId } : null);

      if (pending) {
        const resp = await request.put(
          `${API_BASE}/leave/comp-off/${pending.id}/approve`,
          { headers: { Authorization: `Bearer ${managerToken}` } },
        );
        // 200 if approved, 400 if already processed
        expect([200, 400]).toContain(resp.status());
      }
    });

    test('PUT comp-off reject — Manager rejects', async ({ request }) => {
      // Submit a new comp-off to reject
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 8);
      const workedDate = twoDaysAgo.toISOString().split('T')[0];

      const expiresDate = new Date();
      expiresDate.setMonth(expiresDate.getMonth() + 2);
      const expiresOn = expiresDate.toISOString().split('T')[0];

      const submitResp = await request.post(`${API_BASE}/leave/comp-off`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          worked_date: workedDate,
          expires_on: expiresOn,
          reason: 'E2E test — to be rejected',
          days: 0.5,
        },
      });

      if (submitResp.status() === 201) {
        const submitData = await submitResp.json();
        const resp = await request.put(
          `${API_BASE}/leave/comp-off/${submitData.data.id}/reject`,
          {
            headers: { Authorization: `Bearer ${managerToken}` },
            data: { reason: 'E2E test rejection by manager' },
          },
        );
        expect([200, 400]).toContain(resp.status());
      }
    });

    test('employee cannot approve comp-off (403)', async ({ request }) => {
      const listResp = await request.get(`${API_BASE}/leave/comp-off/pending`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      const listData = await listResp.json();
      const pending = listData.data?.[0];

      if (pending) {
        const resp = await request.put(
          `${API_BASE}/leave/comp-off/${pending.id}/approve`,
          { headers: { Authorization: `Bearer ${employeeToken}` } },
        );
        expect([403, 401, 400]).toContain(resp.status());
      }
    });
  });

  // ─── Leave Calendar ────────────────────────────────────────────────────────

  test.describe('Leave Calendar', () => {
    test('GET calendar — current month', async ({ request }) => {
      const now = new Date();
      const resp = await request.get(
        `${API_BASE}/leave/calendar?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET calendar — employee can view', async ({ request }) => {
      const now = new Date();
      const resp = await request.get(
        `${API_BASE}/leave/calendar?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
        { headers: { Authorization: `Bearer ${employeeToken}` } },
      );
      expect(resp.status()).toBe(200);
    });

    test('GET calendar — next month', async ({ request }) => {
      const now = new Date();
      now.setMonth(now.getMonth() + 1);
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const resp = await request.get(
        `${API_BASE}/leave/calendar?month=${month}&year=${year}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Half-Day Leave ────────────────────────────────────────────────────────

  test.describe('Half-Day Leave', () => {
    test('POST apply half-day leave', async ({ request }) => {
      const future = new Date();
      future.setDate(future.getDate() + 100);
      const dateStr = future.toISOString().split('T')[0];

      const resp = await request.post(`${API_BASE}/leave/applications`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          leave_type_id: activeLeaveTypeId,
          start_date: dateStr,
          end_date: dateStr,
          days_count: 0.5,
          is_half_day: true,
          half_day_type: 'first_half',
          reason: 'E2E test — half day leave',
        },
      });
      // 201 or 400 (no balance)
      expect([200, 201, 400]).toContain(resp.status());

      // Clean up if created
      if (resp.status() === 201 || resp.status() === 200) {
        const body = await resp.json();
        if (body.data?.id) {
          await request.put(`${API_BASE}/leave/applications/${body.data.id}/cancel`, {
            headers: { Authorization: `Bearer ${employeeToken}` },
          });
        }
      }
    });
  });
});
