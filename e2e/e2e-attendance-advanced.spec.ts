import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Cloud — Attendance Advanced E2E Tests
// Tests: shifts CRUD, assign, bulk-assign, swap requests, geo-fences CRUD,
//        regularizations submit/approve/reject, monthly report, schedule
// =============================================================================

const API_BASE = 'https://test-empcloud-api.empcloud.com/api/v1';

const ORG_ADMIN = { email: 'ananya@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };
const EMPLOYEE = { email: 'arjun@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };

test.describe('Attendance Advanced', () => {
  let adminToken: string;
  let employeeToken: string;
  let adminUserId: number;
  let employeeUserId: number;

  test.beforeAll(async ({ request }) => {
    const adminResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    expect(adminResp.status()).toBe(200);
    const adminData = await adminResp.json();
    adminToken = adminData.data.tokens.access_token;

    const adminMe = await request.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    adminUserId = (await adminMe.json()).data.employee_id || (await adminMe.json()).data?.id;
    // re-fetch cleanly
    const adminMe2 = await request.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminMeData = await adminMe2.json();
    adminUserId = adminMeData.data.employee_id || adminMeData.data.id;

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
  });

  // ─── Shifts CRUD ───────────────────────────────────────────────────────────

  test.describe.serial('Shifts CRUD', () => {
    let createdShiftId: number;

    test('POST shift — create new shift', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/attendance/shifts`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: 'E2E Night Shift',
          start_time: '22:00',
          end_time: '06:00',
          break_minutes: 30,
          grace_minutes_late: 15,
          grace_minutes_early: 10,
          is_night_shift: true,
          is_default: false,
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('E2E Night Shift');
      createdShiftId = body.data.id;
    });

    test('GET shifts — list includes created shift', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/shifts`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      const found = body.data.find((s: any) => s.id === createdShiftId);
      expect(found).toBeTruthy();
    });

    test('GET shift by ID — returns shift details', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/shifts/${createdShiftId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('E2E Night Shift');
    });

    test('PUT shift — update name', async ({ request }) => {
      const resp = await request.put(`${API_BASE}/attendance/shifts/${createdShiftId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { name: 'E2E Night Shift (Updated)' },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('POST shift — same start/end time returns 400', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/attendance/shifts`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: 'Invalid Shift',
          start_time: '09:00',
          end_time: '09:00',
        },
      });
      expect(resp.status()).toBe(400);
    });

    test('employee cannot create shift (403)', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/attendance/shifts`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          name: 'Unauthorized Shift',
          start_time: '09:00',
          end_time: '17:00',
        },
      });
      expect(resp.status()).toBe(403);
    });

    test('DELETE shift — deactivate created shift', async ({ request }) => {
      const resp = await request.delete(`${API_BASE}/attendance/shifts/${createdShiftId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Shift Assignment ──────────────────────────────────────────────────────

  test.describe.serial('Shift Assignment', () => {
    let testShiftId: number;

    test.beforeAll(async ({ request }) => {
      // Create a shift for assignment tests
      const resp = await request.post(`${API_BASE}/attendance/shifts`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: 'E2E Assign Test Shift',
          start_time: '08:00',
          end_time: '16:00',
          break_minutes: 60,
          grace_minutes_late: 10,
          grace_minutes_early: 10,
          is_night_shift: false,
          is_default: false,
        },
      });
      const body = await resp.json();
      testShiftId = body.data.id;
    });

    test('POST assign shift — assign to employee', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0];
      const resp = await request.post(`${API_BASE}/attendance/shifts/assign`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          user_id: employeeUserId,
          shift_id: testShiftId,
          effective_from: today,
        },
      });
      // 201 if assigned, 400/409 if already assigned
      expect([201, 400, 409]).toContain(resp.status());
    });

    test('GET shift assignments — returns assignments', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/shifts/assignments`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('POST bulk-assign shift — assign to multiple users', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0];
      const resp = await request.post(`${API_BASE}/attendance/shifts/bulk-assign`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          user_ids: [employeeUserId],
          shift_id: testShiftId,
          effective_from: today,
        },
      });
      // 201 if success, 400/409 if already assigned
      expect([201, 400, 409]).toContain(resp.status());
    });

    test('GET my-schedule — employee sees own schedule', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/shifts/my-schedule`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test.afterAll(async ({ request }) => {
      // Cleanup shift
      await request.delete(`${API_BASE}/attendance/shifts/${testShiftId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    });
  });

  // ─── Shift Swap Requests ───────────────────────────────────────────────────

  test.describe('Shift Swap Requests', () => {
    test('GET swap requests — HR can list', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/shifts/swap-requests`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET swap requests — filter by status', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/shifts/swap-requests?status=pending`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Geo-Fences CRUD ──────────────────────────────────────────────────────

  test.describe.serial('Geo-Fences CRUD', () => {
    let createdFenceId: number;

    test('POST geo-fence — create fence', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/attendance/geo-fences`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: 'E2E Test Office',
          latitude: 12.9716,
          longitude: 77.5946,
          radius_meters: 200,
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      createdFenceId = body.data.id;
    });

    test('GET geo-fences — list includes created fence', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/geo-fences`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      const found = body.data.find((f: any) => f.id === createdFenceId);
      expect(found).toBeTruthy();
      expect(found.name).toBe('E2E Test Office');
    });

    test('PUT geo-fence — update name and radius', async ({ request }) => {
      const resp = await request.put(`${API_BASE}/attendance/geo-fences/${createdFenceId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { name: 'E2E Test Office (Updated)', radius_meters: 500 },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('POST geo-fence — invalid radius returns 400', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/attendance/geo-fences`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: 'Too Small',
          latitude: 12.97,
          longitude: 77.59,
          radius_meters: 5, // min is 10
        },
      });
      expect(resp.status()).toBe(400);
    });

    test('employee cannot create geo-fence (403)', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/attendance/geo-fences`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          name: 'Unauthorized Fence',
          latitude: 12.97,
          longitude: 77.59,
          radius_meters: 100,
        },
      });
      expect(resp.status()).toBe(403);
    });

    test('DELETE geo-fence — deactivate created fence', async ({ request }) => {
      const resp = await request.delete(`${API_BASE}/attendance/geo-fences/${createdFenceId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Regularizations ──────────────────────────────────────────────────────

  test.describe.serial('Regularization Lifecycle', () => {
    let createdRegId: number;

    test('POST regularization — employee submits request', async ({ request }) => {
      // Use yesterday's date for regularization
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];

      const resp = await request.post(`${API_BASE}/attendance/regularizations`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          date: dateStr,
          requested_check_in: '09:00',
          requested_check_out: '18:00',
          reason: 'E2E test — forgot to punch in/out',
        },
      });
      // 201 for created, 400 if duplicate or invalid
      const status = resp.status();
      expect([201, 400]).toContain(status);

      if (status === 201) {
        const body = await resp.json();
        expect(body.success).toBe(true);
        createdRegId = body.data.id;
      }
    });

    test('GET regularizations/me — employee sees own requests', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/regularizations/me`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET regularizations — HR sees all requests', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/regularizations`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET regularizations — filter by pending status', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/regularizations?status=pending`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('PUT regularizations approve — HR approves request', async ({ request }) => {
      // Find a pending regularization
      const listResp = await request.get(`${API_BASE}/attendance/regularizations?status=pending`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listData = await listResp.json();
      const pending = listData.data?.[0] || (createdRegId ? { id: createdRegId } : null);

      if (pending) {
        const resp = await request.put(
          `${API_BASE}/attendance/regularizations/${pending.id}/approve`,
          {
            headers: { Authorization: `Bearer ${adminToken}` },
            data: { status: 'approved' },
          },
        );
        // 200 if approved, 400 if already processed
        expect([200, 400]).toContain(resp.status());
      }
    });

    test('PUT regularizations reject — HR rejects request', async ({ request }) => {
      // Submit a new regularization to reject
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const dateStr = twoDaysAgo.toISOString().split('T')[0];

      const submitResp = await request.post(`${API_BASE}/attendance/regularizations`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          date: dateStr,
          requested_check_in: '10:00',
          requested_check_out: '19:00',
          reason: 'E2E test — to be rejected',
        },
      });

      if (submitResp.status() === 201) {
        const submitData = await submitResp.json();
        const regId = submitData.data.id;

        const resp = await request.put(
          `${API_BASE}/attendance/regularizations/${regId}/approve`,
          {
            headers: { Authorization: `Bearer ${adminToken}` },
            data: { status: 'rejected', rejection_reason: 'E2E test rejection' },
          },
        );
        expect([200, 400]).toContain(resp.status());
      }
    });
  });

  // ─── Monthly Report ────────────────────────────────────────────────────────

  test.describe('Monthly Report', () => {
    test('GET monthly-report — HR gets current month report', async ({ request }) => {
      const now = new Date();
      const resp = await request.get(
        `${API_BASE}/attendance/monthly-report?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET monthly-report — employee cannot access (403)', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/monthly-report`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(403);
    });
  });

  // ─── Schedule ──────────────────────────────────────────────────────────────

  test.describe('Shift Schedule', () => {
    test('GET schedule — HR gets schedule for date range', async ({ request }) => {
      const now = new Date();
      const startDate = now.toISOString().split('T')[0];
      const endDate = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];

      const resp = await request.get(
        `${API_BASE}/attendance/shifts/schedule?start_date=${startDate}&end_date=${endDate}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });
});
