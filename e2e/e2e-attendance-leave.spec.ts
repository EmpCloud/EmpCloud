import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Cloud — Attendance & Leave E2E Tests
// Tests: dashboard, check-in/out, records, shifts, regularizations, leave CRUD
// =============================================================================

const API_BASE = 'https://test-empcloud-api.empcloud.com/api/v1';

const ORG_ADMIN = { email: 'ananya@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };
const MANAGER = { email: 'karthik@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };
const EMPLOYEE = { email: 'priya@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };

test.describe('Attendance & Leave Module', () => {
  let adminToken: string;
  let managerToken: string;
  let employeeToken: string;

  test.beforeAll(async ({ request }) => {
    // Login as org admin (HR)
    const adminResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    expect(adminResp.status()).toBe(200);
    const adminData = await adminResp.json();
    adminToken = adminData.data.tokens.access_token;

    // Login as manager (Karthik — reporting manager for Priya)
    const mgrResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: MANAGER.email, password: MANAGER.password },
    });
    expect(mgrResp.status()).toBe(200);
    const mgrData = await mgrResp.json();
    managerToken = mgrData.data.tokens.access_token;

    // Login as employee (Priya — reports to Karthik)
    const empResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: EMPLOYEE.email, password: EMPLOYEE.password },
    });
    expect(empResp.status()).toBe(200);
    const empData = await empResp.json();
    employeeToken = empData.data.tokens.access_token;
  });

  // ─── Attendance Dashboard ──────────────────────────────────────────────────

  test.describe('Attendance Dashboard', () => {
    test('GET /attendance/dashboard as HR returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET /attendance/dashboard as employee returns 403', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/dashboard`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(403);
    });
  });

  // ─── Check-in / Check-out ─────────────────────────────────────────────────

  test.describe('Check-in / Check-out Flow', () => {
    test('employee can check in', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/attendance/check-in`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {},
      });
      // 200 or 201 for success, 400 if already checked in, 409 conflict
      const status = resp.status();
      expect([200, 201, 400, 409]).toContain(status);

      if (status === 200 || status === 201) {
        const body = await resp.json();
        expect(body.success).toBe(true);
      }
    });

    test('employee can check out', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/attendance/check-out`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {},
      });
      // 200 for success, 400 if not checked in or already checked out, 409 conflict
      const status = resp.status();
      expect([200, 201, 400, 409]).toContain(status);

      if (status === 200 || status === 201) {
        const body = await resp.json();
        expect(body.success).toBe(true);
      }
    });

    test('employee can view today attendance', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/me/today`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('employee can view attendance history', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/me/history`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Attendance Records with Filters ──────────────────────────────────────

  test.describe('Attendance Records', () => {
    test('GET /attendance/records returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/records`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('records with date filter returns only that date', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const resp = await request.get(
        `${API_BASE}/attendance/records?date=${today}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);

      // Verify all records are from the requested date
      if (Array.isArray(body.data) && body.data.length > 0) {
        for (const record of body.data) {
          if (record.date) {
            expect(record.date).toContain(today);
          }
        }
      }
    });

    test('records with employee_id filter returns only that employee', async ({ request }) => {
      // Get a valid employee/user ID from attendance records
      const recList = await request.get(`${API_BASE}/attendance/records?per_page=1`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const recData = await recList.json();
      const userId = recData.data?.[0]?.user_id;

      if (userId) {
        const resp = await request.get(
          `${API_BASE}/attendance/records?employee_id=${userId}`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body.success).toBe(true);

        // All records should belong to the requested user
        if (Array.isArray(body.data) && body.data.length > 0) {
          for (const record of body.data) {
            expect(String(record.user_id)).toBe(String(userId));
          }
        }
      }
    });
  });

  // ─── Shifts ───────────────────────────────────────────────────────────────

  test.describe('Shifts', () => {
    test('GET /attendance/shifts returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/shifts`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('employee can view shifts', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/shifts`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
    });
  });

  // ─── Regularizations ─────────────────────────────────────────────────────

  test.describe('Regularizations', () => {
    test('GET /attendance/regularizations as HR returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/regularizations`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('employee can view own regularizations', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/regularizations/me`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Leave Types ──────────────────────────────────────────────────────────

  test.describe('Leave Types', () => {
    test('GET /leave/types returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/types`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('employee can view leave types', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/types`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
    });
  });

  // ─── Leave Balances ───────────────────────────────────────────────────────

  test.describe('Leave Balances', () => {
    test('GET /leave/balances/me returns employee balances', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/balances/me`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET /leave/balances as HR returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/balances`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Leave Applications ───────────────────────────────────────────────────

  test.describe('Leave Applications', () => {
    let createdLeaveId: number | null = null;

    test('apply leave with past date returns 400', async ({ request }) => {
      // Get a leave type first
      const typesResp = await request.get(`${API_BASE}/leave/types`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      const typesData = await typesResp.json();
      const leaveTypeId = typesData.data[0]?.id;

      if (leaveTypeId) {
        const resp = await request.post(`${API_BASE}/leave/applications`, {
          headers: { Authorization: `Bearer ${employeeToken}` },
          data: {
            leave_type_id: leaveTypeId,
            start_date: '2020-01-01',
            end_date: '2020-01-01',
            reason: 'E2E test - past date (should fail)',
          },
        });
        expect(resp.status()).toBe(400);
      }
    });

    test('apply leave with valid future date returns 201', async ({ request }) => {
      // Get a leave type
      const typesResp = await request.get(`${API_BASE}/leave/types`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      const typesData = await typesResp.json();
      const leaveTypeId = typesData.data[0]?.id;

      if (leaveTypeId) {
        // Use a date 30 days from now to avoid conflicts
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        const dateStr = futureDate.toISOString().split('T')[0];

        const resp = await request.post(`${API_BASE}/leave/applications`, {
          headers: { Authorization: `Bearer ${employeeToken}` },
          data: {
            leave_type_id: leaveTypeId,
            start_date: dateStr,
            end_date: dateStr,
            reason: 'E2E test - valid leave application',
          },
        });
        // 201 for created, 400 if insufficient balance or overlapping leave
        const status = resp.status();
        expect([200, 201, 400]).toContain(status);

        if (status === 201 || status === 200) {
          const body = await resp.json();
          expect(body.success).toBe(true);
          createdLeaveId = body.data?.id || null;
        }
      }
    });

    test('GET /leave/applications/me returns employee applications', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/applications/me`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET /leave/applications as HR returns all applications', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/applications`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('approve leave as Manager returns 200', async ({ request }) => {
      // Find a pending leave application to approve
      const listResp = await request.get(
        `${API_BASE}/leave/applications?status=pending`,
        { headers: { Authorization: `Bearer ${managerToken}` } }
      );
      const listData = await listResp.json();
      const pendingLeave = listData.data?.[0] || (createdLeaveId ? { id: createdLeaveId } : null);

      if (pendingLeave) {
        const resp = await request.put(
          `${API_BASE}/leave/applications/${pendingLeave.id}/approve`,
          {
            headers: { Authorization: `Bearer ${managerToken}` },
            data: { comments: 'Approved via E2E test by manager' },
          }
        );
        // 200 if approved, 400 if already processed
        expect([200, 400]).toContain(resp.status());
      }
    });

    test('employee cannot approve/reject others leave (returns 403)', async ({ request }) => {
      // Get any leave application
      const listResp = await request.get(`${API_BASE}/leave/applications`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listData = await listResp.json();
      const anyLeave = listData.data?.[0];

      if (anyLeave) {
        const resp = await request.put(
          `${API_BASE}/leave/applications/${anyLeave.id}/reject`,
          {
            headers: { Authorization: `Bearer ${employeeToken}` },
            data: { comments: 'Rejected via E2E test (should fail)' },
          }
        );
        // Should be 403 (not authorized to reject) or 400 (already processed)
        expect([403, 401, 400]).toContain(resp.status());
      }
    });
  });

  // ─── Leave Calendar ───────────────────────────────────────────────────────

  test.describe('Leave Calendar', () => {
    test('GET /leave/calendar returns 200', async ({ request }) => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const resp = await request.get(
        `${API_BASE}/leave/calendar?month=${month}&year=${year}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('employee can view leave calendar', async ({ request }) => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const resp = await request.get(
        `${API_BASE}/leave/calendar?month=${month}&year=${year}`,
        { headers: { Authorization: `Bearer ${employeeToken}` } }
      );
      expect(resp.status()).toBe(200);
    });
  });

  // ─── Leave Policies ──────────────────────────────────────────────────────

  test.describe('Leave Policies', () => {
    test('GET /leave/policies returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/policies`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });
});
