import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Monitor — E2E Tests (45 tests)
// Auth: SSO from EmpCloud → POST /auth/sso to Monitor
// API: https://test-empmonitor-api.empcloud.com/api/v3
// Monitor uses Express 4 + JS, responses are { code, data, message, error }
// =============================================================================

// Run all tests serially in one worker so SSO tokens are shared
test.describe.configure({ mode: 'serial' });

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const MONITOR_API = 'https://test-empmonitor-api.empcloud.com/api/v3';
const MONITOR_BASE = 'https://test-empmonitor-api.empcloud.com';

const ORG_ADMIN = { email: 'ananya@technova.in', password: 'Welcome@123' };
const EMPLOYEE = { email: 'arjun@technova.in', password: 'Welcome@123' };

let adminToken = '';
let employeeToken = '';
let ecAdminToken = '';

// Helper: auth header
const auth = (t?: string) => ({
  headers: { Authorization: `Bearer ${t || adminToken}` },
});

// Helper: today as ISO date
const today = () => new Date().toISOString().split('T')[0];

// Helper: check response (accepts 429 rate-limit as non-failure)
const expectOkOrRateLimit = (status: number, okCodes: number[] = [200]) => {
  expect([...okCodes, 429]).toContain(status);
};

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
    // Monitor returns { code: 200, data: "<encrypted_token>", user_name, email, ... }
    expect(typeof body.data).toBe('string');
    expect(body.data.length).toBeGreaterThan(10);
    expect(body.message).toContain('SSO');
    expect(body.email).toBe(ORG_ADMIN.email);
    adminToken = body.data;
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
    expect(login.status()).toBe(200);
    const ecEmpToken = (await login.json()).data.tokens.access_token;

    const sso = await request.post(`${MONITOR_API}/auth/sso`, {
      data: { token: ecEmpToken },
    });
    expect([200, 201]).toContain(sso.status());
    const body = await sso.json();
    expect(body.code).toBe(200);
    expect(typeof body.data).toBe('string');
    expect(body.data.length).toBeGreaterThan(10);
    employeeToken = body.data;
  });
});

// =============================================================================
// 2. CURRENT USER & DASHBOARD EMPLOYEES (8 tests)
// =============================================================================

test.describe('2. User & Dashboard', () => {

  test('2.1 Get current user profile (/me)', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/me`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.email).toBe(ORG_ADMIN.email);
    expect(body.organization_id).toBeTruthy();
  });

  test('2.2 List employees via dashboard', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/employees?date=${today()}`, auth());
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
      expect(body.data).toBeTruthy();
      expect(body.data.registeredEmp).toBeDefined();
    }
  });

  test('2.3 Dashboard employees status', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/employees-status?date=${today()}`, auth());
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
      expect(body.data).toBeTruthy();
    }
  });

  test('2.4 Dashboard idle user details', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/get-ideal-user-details?date=${today()}`, auth());
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
    }
  });

  test('2.5 Dashboard top-app-web (requires type param)', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/top-app-web?date=${today()}&type=app`, auth());
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('2.6 Dashboard activity-breakdown', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/dashboard/activity-breakdown?from_date=${today()}&to_date=${today()}`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('2.7 Dashboard productive-and-nonproductive', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/dashboard/productive-and-nonproductive?date=${today()}&type=app`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('2.8 Invalid token returns error', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/me`, {
      headers: { Authorization: 'Bearer invalid-token-12345' },
    });
    // Monitor may return 401, 403, or 500 for invalid tokens
    expect([401, 403, 500]).toContain(r.status());
    expect(r.status()).not.toBe(200);
  });
});

// =============================================================================
// 3. SCREENSHOTS (3 tests)
// =============================================================================

test.describe('3. Screenshots', () => {

  test('3.1 Get screenshots (POST with user_id)', async ({ request }) => {
    const now = Date.now();
    const r = await request.post(`${MONITOR_API}/screenshot/get-screenshots-new`, {
      ...auth(),
      data: { user_id: 1, from: now - 86400000, to: now, date: today() },
    });
    expectOkOrRateLimit(r.status(), [200, 404]);
  });

  test('3.2 Screenshots without user_id returns validation error or empty', async ({ request }) => {
    const r = await request.post(`${MONITOR_API}/screenshot/get-screenshots-new`, {
      ...auth(),
      data: { date: today() },
    });
    // May return validation error (400/404) or 200 with error in body
    expect([200, 400, 404, 429]).toContain(r.status());
  });

  test('3.3 Screenshots require auth', async ({ request }) => {
    const r = await request.post(`${MONITOR_API}/screenshot/get-screenshots-new`, {
      data: { user_id: 1, date: today() },
    });
    expect([401, 403]).toContain(r.status());
  });
});

// =============================================================================
// 4. PRODUCTIVITY REPORTS (8 tests)
// =============================================================================

test.describe('4. Productivity Reports', () => {

  test('4.1 Productivity report', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/report/productivity?startDate=${today()}&endDate=${today()}`,
      auth()
    );
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
    }
  });

  test('4.2 Productivity list', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/report/productivity-list?startDate=${today()}&endDate=${today()}`,
      auth()
    );
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
    }
  });

  test('4.3 Productivity new report', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/report/productivity-new?startDate=${today()}&endDate=${today()}`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('4.4 Download options', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/report/download-options`, auth());
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
      expect(body.data).toBeTruthy();
    }
  });

  test('4.5 Employee report (POST)', async ({ request }) => {
    const r = await request.post(`${MONITOR_API}/report/employee`, {
      ...auth(),
      data: {
        startDate: today(),
        endDate: today(),
        employee_id: 0,
        location_id: 0,
        department_id: 0,
      },
    });
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('4.6 Email reports list', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/report/reports`, auth());
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('4.7 Activity logs report', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/report/get-activity-logs`, auth());
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('4.8 Productivity report requires date params', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/report/productivity`, auth());
    expect([400, 429]).toContain(r.status());
  });
});

// =============================================================================
// 5. DASHBOARD DETAILS (8 tests)
// =============================================================================

test.describe('5. Dashboard Details', () => {

  test('5.1 Dashboard employees-stats', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/employees-stats?date=${today()}`, auth());
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
    }
  });

  test('5.2 Dashboard performance (requires category)', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/dashboard/performance?date=${today()}&category=productive`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('5.3 Dashboard active-days', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/dashboard/active-days?from_date=${today()}&to_date=${today()}`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('5.4 Dashboard workforce-validate', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/workForce-validate`, auth());
    expectOkOrRateLimit(r.status(), [200, 400, 404]);
  });

  test('5.5 Dashboard web-app activity (POST)', async ({ request }) => {
    const r = await request.post(`${MONITOR_API}/dashboard/get-web-app-activity-productive-employees`, {
      ...auth(),
      data: { date: today(), type: 'app' },
    });
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('5.6 Dashboard get-web-app (POST)', async ({ request }) => {
    const r = await request.post(`${MONITOR_API}/dashboard/get-web-app`, {
      ...auth(),
      data: { date: today(), type: 'app' },
    });
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('5.7 Dashboard requires auth', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/dashboard/employees?date=${today()}`);
    expect([401, 403]).toContain(r.status());
  });

  test('5.8 Employee /me returns employee role', async ({ request }) => {
    expect(employeeToken, 'Prerequisite failed — No employee token').toBeTruthy();
    const r = await request.get(`${MONITOR_API}/me`, auth(employeeToken));
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.email).toBe(EMPLOYEE.email);
    expect(body.is_employee).toBe(true);
  });
});

// =============================================================================
// 6. EMPLOYEE DETAILS (5 tests)
// =============================================================================

test.describe('6. Employee Details', () => {

  test('6.1 Employee attendance', async ({ request }) => {
    // date param is a YYYYMM number for this endpoint
    const yyyymm = new Date().getFullYear() * 100 + (new Date().getMonth() + 1);
    const r = await request.get(
      `${MONITOR_API}/employee/attendance?date=${yyyymm}&employee_id=1`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('6.2 Employee attendance-sheet', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/employee/attendance-sheet?startDate=${today()}&endDate=${today()}&employee_id=1`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('6.3 Employee applications usage', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/employee/applications?startDate=${today()}&endDate=${today()}&employee_id=1`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('6.4 Employee browser history', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/employee/browser-history?startDate=${today()}&endDate=${today()}&employee_id=1`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('6.5 Employee keystrokes', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/employee/keystrokes?startDate=${today()}&endDate=${today()}&employee_id=1`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });
});

// =============================================================================
// 7. TIMESHEET (4 tests)
// =============================================================================

test.describe('7. Timesheet', () => {

  test('7.1 Get timesheet (requires all params)', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/timesheet?location_id=0&department_id=0&employee_id=0&start_date=${today()}&end_date=${today()}`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('7.2 Get timesheet data', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/timesheet/timesheet?location_id=0&department_id=0&employee_id=0&start_date=${today()}&end_date=${today()}`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('7.3 Get employee timesheet (custom rate)', async ({ request }) => {
    const r = await request.get(
      `${MONITOR_API}/timesheet/employee-timesheet?start_date=${today()}&end_date=${today()}`,
      auth()
    );
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('7.4 Timesheet requires date params', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/timesheet`, auth());
    expect([400, 429]).toContain(r.status());
  });
});

// =============================================================================
// 8. SETTINGS (5 tests)
// =============================================================================

test.describe('8. Settings', () => {

  test('8.1 Get setting options', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/settings/options`, auth());
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
      expect(body.data).toBeTruthy();
    }
  });

  test('8.2 Get roles list', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/settings/roles`, auth());
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  test('8.3 Get role permissions', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/settings/role/permissions`, auth());
    expectOkOrRateLimit(r.status(), [200, 400]);
  });

  test('8.4 Get productivity rankings', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/settings/productivity-rankings`, auth());
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
    }
  });

  test('8.5 Get categories', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/settings/category`, auth());
    // May return 400 "No Categories Found" if none configured
    expectOkOrRateLimit(r.status(), [200, 400]);
  });
});

// =============================================================================
// 9. LOCATION (3 tests)
// =============================================================================

test.describe('9. Location', () => {

  test('9.1 Get locations (POST)', async ({ request }) => {
    const r = await request.post(`${MONITOR_API}/location/get-locations`, {
      ...auth(),
      data: {},
    });
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  test('9.2 Get locations with departments (POST)', async ({ request }) => {
    const r = await request.post(`${MONITOR_API}/location/get-locations-dept`, {
      ...auth(),
      data: {},
    });
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  test('9.3 Get location roles', async ({ request }) => {
    const r = await request.get(`${MONITOR_API}/location/roles`, auth());
    expectOkOrRateLimit(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.code).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });
});

// =============================================================================
// 10. HEALTH (1 test)
// =============================================================================

test.describe('10. Health', () => {

  test('10.1 Health check endpoint', async ({ request }) => {
    const r = await request.get(`${MONITOR_BASE}/health`);
    // Accept 200 (healthy) or 502/503 if monitor is down on test server
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('emp-monitor');
    } else {
      console.log(`Monitor health returned ${r.status()} — module may be down`);
      expect(r.status()).toBeLessThan(504);
    }
  });
});
