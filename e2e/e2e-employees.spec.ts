import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Cloud — Employees Module E2E Tests
// Tests: list, search, filter, pagination, profile tabs, probation, access control
// =============================================================================

const API_BASE = 'https://test-empcloud-api.empcloud.com/api/v1';

const ORG_ADMIN = { email: 'ananya@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };
const EMPLOYEE = { email: 'arjun@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };

test.describe('Employees Module', () => {
  let adminToken: string;
  let employeeToken: string;
  let adminEmployeeId: string;
  let employeeEmployeeId: string;

  test.beforeAll(async ({ request }) => {
    // Login as org admin (HR)
    const adminResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    expect(adminResp.status()).toBe(200);
    const adminData = await adminResp.json();
    adminToken = adminData.data.tokens.access_token;

    // Get admin's employee ID from /auth/me
    const adminMe = await request.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminMeData = await adminMe.json();
    adminEmployeeId = adminMeData.data.employee_id || adminMeData.data.id;

    // Login as employee
    const empResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: EMPLOYEE.email, password: EMPLOYEE.password },
    });
    expect(empResp.status()).toBe(200);
    const empData = await empResp.json();
    employeeToken = empData.data.tokens.access_token;

    // Get employee's employee ID
    const empMe = await request.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const empMeData = await empMe.json();
    employeeEmployeeId = empMeData.data.employee_id || empMeData.data.id;
  });

  // ─── List & Search ─────────────────────────────────────────────────────────

  test.describe('GET /employees', () => {
    test('list employees as admin returns 200 with data', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    test('search employees by name returns filtered results', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees?search=arjun`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      // Should have at least one result matching the search
      if (body.data.length > 0) {
        const names = body.data.map((e: any) =>
          `${e.first_name} ${e.last_name}`.toLowerCase()
        );
        const hasMatch = names.some((n: string) => n.includes('arjun'));
        expect(hasMatch).toBe(true);
      }
    });

    test('filter employees by department returns filtered results', async ({ request }) => {
      // First get all employees to find a valid department
      const allResp = await request.get(`${API_BASE}/employees`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const allData = await allResp.json();
      const firstWithDept = allData.data.find((e: any) => e.department_id);

      if (firstWithDept) {
        const resp = await request.get(
          `${API_BASE}/employees?department_id=${firstWithDept.department_id}`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body.success).toBe(true);
        // All results should be from that department
        for (const emp of body.data) {
          expect(emp.department_id).toBe(firstWithDept.department_id);
        }
      }
    });

    test('pagination works (page=1, per_page=5)', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees?page=1&per_page=5`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBeLessThanOrEqual(5);
    });

    test('pagination page=2 returns different results', async ({ request }) => {
      const page1Resp = await request.get(`${API_BASE}/employees?page=1&per_page=5`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const page1 = await page1Resp.json();

      const page2Resp = await request.get(`${API_BASE}/employees?page=2&per_page=5`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const page2 = await page2Resp.json();
      expect(page2Resp.status()).toBe(200);

      // If there are enough employees, page 2 should have different data
      if (page2.data.length > 0 && page1.data.length > 0) {
        const page1Ids = page1.data.map((e: any) => e.id);
        const page2Ids = page2.data.map((e: any) => e.id);
        const overlap = page2Ids.filter((id: number) => page1Ids.includes(id));
        expect(overlap.length).toBe(0);
      }
    });
  });

  // ─── Individual Employee ───────────────────────────────────────────────────

  test.describe('GET /employees/:id', () => {
    test('get employee by ID returns 200', async ({ request }) => {
      // Get first employee from list
      const listResp = await request.get(`${API_BASE}/employees?per_page=1`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listData = await listResp.json();
      const empId = listData.data[0].id;

      const resp = await request.get(`${API_BASE}/employees/${empId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(empId);
    });

    test('get non-existent employee returns 404', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/999999`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(404);
    });
  });

  // ─── Profile Tabs (addresses, education, experience, dependents) ──────────

  test.describe('Employee Profile Tabs', () => {
    let testEmpId: string;

    test.beforeAll(async ({ request }) => {
      // Get the first employee ID
      const listResp = await request.get(`${API_BASE}/employees?per_page=1`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listData = await listResp.json();
      testEmpId = listData.data[0].id;
    });

    test('GET /:id/addresses returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${testEmpId}/addresses`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET /:id/education returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${testEmpId}/education`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET /:id/experience returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${testEmpId}/experience`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET /:id/dependents returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${testEmpId}/dependents`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Directory & Special Endpoints ─────────────────────────────────────────

  test.describe('Directory & Special Endpoints', () => {
    test('GET /employees/directory returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/directory`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET /employees/birthdays returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/birthdays`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET /employees/anniversaries returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/anniversaries`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Probation (HR-only) ──────────────────────────────────────────────────

  test.describe('Probation', () => {
    test('GET /employees/probation as HR returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/probation`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET /employees/probation/dashboard as HR returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/probation/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET /employees/probation as employee returns 403', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/probation`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(403);
    });
  });

  // ─── Access Control ────────────────────────────────────────────────────────

  test.describe('Access Control', () => {
    test('employee cannot view another employees addresses', async ({ request }) => {
      // Get an employee that is NOT the logged-in employee
      const listResp = await request.get(`${API_BASE}/employees`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listData = await listResp.json();
      const otherEmp = listData.data.find(
        (e: any) => String(e.id) !== String(employeeEmployeeId)
      );

      if (otherEmp) {
        const resp = await request.get(
          `${API_BASE}/employees/${otherEmp.id}/addresses`,
          { headers: { Authorization: `Bearer ${employeeToken}` } }
        );
        expect(resp.status()).toBe(403);
      }
    });

    test('employee cannot view another employees salary', async ({ request }) => {
      const listResp = await request.get(`${API_BASE}/employees`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listData = await listResp.json();
      const otherEmp = listData.data.find(
        (e: any) => String(e.id) !== String(employeeEmployeeId)
      );

      if (otherEmp) {
        const resp = await request.get(
          `${API_BASE}/employees/${otherEmp.id}/salary`,
          { headers: { Authorization: `Bearer ${employeeToken}` } }
        );
        expect(resp.status()).toBe(403);
      }
    });

    test('employee can view own addresses', async ({ request }) => {
      if (employeeEmployeeId) {
        const resp = await request.get(
          `${API_BASE}/employees/${employeeEmployeeId}/addresses`,
          { headers: { Authorization: `Bearer ${employeeToken}` } }
        );
        expect(resp.status()).toBe(200);
      }
    });

    test('employee can view headcount only if HR (should be 403)', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/headcount`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(403);
    });
  });
});
