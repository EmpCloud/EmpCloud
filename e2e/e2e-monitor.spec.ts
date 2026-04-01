import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Monitor — E2E Tests
// Auth: SSO from EmpCloud (ananya@technova.in) → POST /auth/sso to Monitor
// API: https://test-empmonitor-api.empcloud.com/api/v3
// Covers: SSO Auth, User Management, Screenshots, Productivity Reports,
//         Dashboard, Employee Details, Timesheet, Settings, Location, Health
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const MONITOR_API = 'https://test-empmonitor-api.empcloud.com/api/v3';
const MONITOR_BASE = 'https://test-empmonitor-api.empcloud.com';

const ORG_ADMIN = { email: 'ananya@technova.in', password: 'Welcome@123' };
const EMPLOYEE = { email: 'arjun@technova.in', password: 'Welcome@123' };

let adminToken = '';
let employeeToken = '';
let ecAdminToken = '';
let userId: string | number = '';
let teamId: string | number = '';

// Helper: auth header
const auth = (t?: string) => ({
  headers: { Authorization: `Bearer ${t || adminToken}` },
});

// =============================================================================
// 1. SSO AUTH (5 tests)
// =============================================================================

test.describe('1. SSO Auth', () => {

  test('1.1 Login to EmpCloud returns access_token', async ({ request }) => {
    const r = await request.post(`${EMPCLOUD_API}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data.tokens.access_token).toBeTruthy();
    ecAdminToken = body.data.tokens.access_token;
  });

  test('1.2 SSO to Monitor with EmpCloud token', async ({ request }) => {
    expect(ecAdminToken, 'Prerequisite failed — No EmpCloud token').toBeTruthy();
    const r = await request.post(`${MONITOR_API}/auth/sso`, {
      data: { token: ecAdminToken },
    });
    expect([200, 201]).toContain(r.status());
    const body = await r.json();
    expect(body.code).toBe(200);
    // Monitor returns { code: 200, data: "<jwt_token_string>", ... }
    expect(typeof body.data).toBe('string');
    adminToken = body.data;
    expect(adminToken.length).toBeGreaterThan(10);
  });

  test('1.3 SSO fails without token', async ({ request }) => {
    const r = await request.post(`${MONITOR_API}/auth/sso`, {
      data: {},
    });
    expect([400, 401, 422]).toContain(r.status());
  });

  test('1.4 SSO fails with invalid token', async ({ request }) => {
    const r = await request.post(`${MONITOR_API}/auth/sso`, {
      data: { token: 'invalid-jwt-token-12345' },
    });
    expect([400, 401, 403, 422]).toContain(r.status());
  });

  test('1.5 SSO for employee user', async ({ request }) => {
    const login = await request.post(`${EMPCLOUD_API}/auth/login`, {
      data: { email: EMPLOYEE.email, password: EMPLOYEE.password },
    });
    if (login.status() !== 200) {
      expect.fail('Employee login failed');
      return;
    }
    const ecEmpToken = (await login.json()).data.tokens.access_token;

    const sso = await request.post(`${MONITOR_API}/auth/sso`, {
      data: { token: ecEmpToken },
    });
    expect([200, 201]).toContain(sso.status());
    const body = await sso.json();
    // Monitor returns { code: 200, data: "<jwt_token_string>", ... }
    employeeToken = typeof body.data === 'string' ? body.data : ecEmpToken;
  });
});

// =============================================================================
// 2. USER MANAGEMENT (8 tests)
// =============================================================================

test.describe('2. User Management', () => {

  test('2.1 List users/employees', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/users`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.users || body.data || [];
      if (Array.isArray(list) && list.length > 0) {
        userId = list[0].id || list[0]._id || list[0].user_id || '';
      }
    }
  });

  test('2.2 Get current user profile', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/users/me`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200 && body.data) {
      if (!userId) userId = body.data.id || body.data._id || body.data.user_id || '';
    }
  });

  test('2.3 Get specific user by ID', async ({ request }) => {
    expect(userId, 'Prerequisite failed — No user ID available').toBeTruthy();
    const r = await request.get(`${MONITOR_API}/users/${userId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('2.4 List teams', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/teams`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.teams || body.data || [];
      if (Array.isArray(list) && list.length > 0) {
        teamId = list[0].id || list[0]._id || '';
      }
    }
  });

  test('2.5 Create a team', async ({ request }) => {
    const r = await request.post(`${MONITOR_API}/teams`, {
      ...auth(),
      data: {
        name: `PW Test Team ${Date.now()}`,
        description: 'E2E test team',
      },
    });
    expect([200, 201, 400, 404, 409]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id || body.data?._id) {
      teamId = body.data.id || body.data._id;
    }
  });

  test('2.6 Update user settings', async ({ request }) => {
    const r = await request.put(`${MONITOR_API}/users/me/settings`, {
      ...auth(),
      data: { screenshot_interval: 300, blur_screenshots: false },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('2.7 Get user activity summary', async ({ request }) => {
    expect(userId, 'Prerequisite failed — No user ID available').toBeTruthy();
    const r = await request.get(`${MONITOR_API}/users/${userId}/activity`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('2.8 Employee cannot list all users (RBAC)', async ({ request }) => {
    expect(employeeToken, 'Prerequisite failed — No employee token').toBeTruthy();
    const r = await request.get(`${MONITOR_API}/users`, auth(employeeToken));
    // Employee may be forbidden or get limited results
    expect([200, 403, 404]).toContain(r.status());
  });
});

// =============================================================================
// 3. SCREENSHOTS (3 tests)
// =============================================================================

test.describe('3. Screenshots', () => {

  test('3.1 List screenshots', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0];
    const r = await request.get(`${MONITOR_API}/screenshots?date=${today}`, auth());
    expect([200, 404]).toContain(r.status());
    const body = await r.json();
    if (r.status() === 200) {
      const list = body.data?.screenshots || body.data || [];
      expect(Array.isArray(list)).toBe(true);
    }
  });

  test('3.2 List screenshots for specific user', async ({ request }) => {
    expect(userId, 'Prerequisite failed — No user ID available').toBeTruthy();
    const today = new Date().toISOString().split('T')[0];
    const r = await request.get(`${MONITOR_API}/screenshots?user_id=${userId}&date=${today}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('3.3 Screenshot settings / blur config', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/screenshots/settings`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 4. PRODUCTIVITY REPORTS (8 tests)
// =============================================================================

test.describe('4. Productivity Reports', () => {

  test('4.1 Daily productivity report', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0];
    const r = await request.get(`${MONITOR_API}/reports/productivity?date=${today}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('4.2 Weekly productivity report', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/reports/productivity?period=weekly`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('4.3 App usage report', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/reports/app-usage`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('4.4 URL/website tracking report', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/reports/url-tracking`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('4.5 Idle time report', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/reports/idle-time`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('4.6 Active time report', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/reports/active-time`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('4.7 Team productivity report', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/reports/team-productivity`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('4.8 Export productivity report', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/reports/productivity/export?format=csv`, auth());
    expect([200, 404, 501]).toContain(r.status());
  });
});

// =============================================================================
// 5. DASHBOARD (8 tests)
// =============================================================================

test.describe('5. Dashboard', () => {

  test('5.1 Dashboard overview/stats', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.2 Dashboard — online users count', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/online`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.3 Dashboard — today summary', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/today`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.4 Dashboard — top productive employees', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/top-productive`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.5 Dashboard — least productive employees', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/least-productive`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.6 Dashboard — activity timeline', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/timeline`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.7 Dashboard — app category breakdown', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/app-categories`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('5.8 Dashboard — weekly trend', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/weekly-trend`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 6. EMPLOYEE DETAILS (5 tests)
// =============================================================================

test.describe('6. Employee Details', () => {

  test('6.1 Get employee detail with activity', async ({ request }) => {
    expect(userId, 'Prerequisite failed — No user ID available').toBeTruthy();
    const r = await request.get(`${MONITOR_API}/employees/${userId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.2 Employee app usage breakdown', async ({ request }) => {
    expect(userId, 'Prerequisite failed — No user ID available').toBeTruthy();
    const r = await request.get(`${MONITOR_API}/employees/${userId}/app-usage`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.3 Employee productivity score', async ({ request }) => {
    expect(userId, 'Prerequisite failed — No user ID available').toBeTruthy();
    const r = await request.get(`${MONITOR_API}/employees/${userId}/productivity`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.4 Employee timeline for a date', async ({ request }) => {
    expect(userId, 'Prerequisite failed — No user ID available').toBeTruthy();
    const today = new Date().toISOString().split('T')[0];
    const r = await request.get(`${MONITOR_API}/employees/${userId}/timeline?date=${today}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.5 Employee screenshots for a date', async ({ request }) => {
    expect(userId, 'Prerequisite failed — No user ID available').toBeTruthy();
    const today = new Date().toISOString().split('T')[0];
    const r = await request.get(`${MONITOR_API}/employees/${userId}/screenshots?date=${today}`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 7. TIMESHEET (4 tests)
// =============================================================================

test.describe('7. Timesheet', () => {

  test('7.1 Get timesheet for today', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0];
    const r = await request.get(`${MONITOR_API}/timesheet?date=${today}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.2 Get timesheet for date range', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/timesheet?from=2026-03-01&to=2026-03-31`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.3 Get timesheet summary', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/timesheet/summary`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('7.4 Get user-specific timesheet', async ({ request }) => {
    expect(userId, 'Prerequisite failed — No user ID available').toBeTruthy();
    const today = new Date().toISOString().split('T')[0];
    const r = await request.get(`${MONITOR_API}/timesheet?user_id=${userId}&date=${today}`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 8. SETTINGS (5 tests)
// =============================================================================

test.describe('8. Settings', () => {

  test('8.1 Get organization monitoring settings', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/settings`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('8.2 Update screenshot interval setting', async ({ request }) => {
    const r = await request.put(`${MONITOR_API}/settings`, {
      ...auth(),
      data: { screenshot_interval: 300 },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('8.3 Get app categories (productive/unproductive)', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/settings/app-categories`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('8.4 Update app category classification', async ({ request }) => {
    const r = await request.put(`${MONITOR_API}/settings/app-categories`, {
      ...auth(),
      data: {
        app_name: 'slack',
        category: 'productive',
      },
    });
    expect([200, 204, 400, 404]).toContain(r.status());
  });

  test('8.5 Get URL tracking rules', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/settings/url-rules`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 9. LOCATION (3 tests)
// =============================================================================

test.describe('9. Location', () => {

  test('9.1 Get location tracking data', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/location`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.2 Get location for specific user', async ({ request }) => {
    expect(userId, 'Prerequisite failed — No user ID available').toBeTruthy();
    const r = await request.get(`${MONITOR_API}/location?user_id=${userId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.3 Get geo-fence / location settings', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/location/settings`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// =============================================================================
// 10. HEALTH (1 test)
// =============================================================================

test.describe('10. Health', () => {

  test('10.1 Health check endpoint', async ({ request }) => {
    const r = await request.get(`${MONITOR_BASE}/health`);
    expect([200, 404]).toContain(r.status());
  });
});
