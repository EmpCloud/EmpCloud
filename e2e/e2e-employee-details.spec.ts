import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Cloud — Employee Details E2E Tests
// Tests: address CRUD, education CRUD, experience CRUD, dependent CRUD,
//        salary upsert, photo upload, profile upsert, probation confirm/extend
// =============================================================================

const API_BASE = 'https://test-empcloud-api.empcloud.com/api/v1';

const ORG_ADMIN = { email: 'ananya@technova.in', password: 'Welcome@123' };
const EMPLOYEE = { email: 'arjun@technova.in', password: 'Welcome@123' };

test.describe('Employee Details — Profile CRUD', () => {
  let adminToken: string;
  let employeeToken: string;
  let adminUserId: number;
  let employeeUserId: number;

  test.beforeAll(async ({ request }) => {
    // Login as org admin (HR)
    const adminResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    expect(adminResp.status()).toBe(200);
    const adminData = await adminResp.json();
    adminToken = adminData.data.tokens.access_token;

    const adminMe = await request.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminMeData = await adminMe.json();
    adminUserId = adminMeData.data.employee_id || adminMeData.data.id;

    // Login as employee
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

  // ─── Address CRUD ──────────────────────────────────────────────────────────

  test.describe.serial('Address CRUD', () => {
    let createdAddressId: number;

    test('POST address — create current address', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/employees/${employeeUserId}/addresses`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          type: 'current',
          line1: '42 E2E Test Street',
          line2: 'Apt 7B',
          city: 'Bengaluru',
          state: 'Karnataka',
          country: 'IN',
          zipcode: '560001',
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeTruthy();
      createdAddressId = body.data.id;
    });

    test('GET addresses — list includes created address', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/addresses`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      const found = body.data.find((a: any) => a.id === createdAddressId);
      expect(found).toBeTruthy();
      expect(found.line1).toBe('42 E2E Test Street');
    });

    test('PUT address — update city', async ({ request }) => {
      const resp = await request.put(
        `${API_BASE}/employees/${employeeUserId}/addresses/${createdAddressId}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: { city: 'Mumbai' },
        },
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('DELETE address — remove created address', async ({ request }) => {
      const resp = await request.delete(
        `${API_BASE}/employees/${employeeUserId}/addresses/${createdAddressId}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET addresses after delete — address is gone', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/addresses`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      const found = body.data.find((a: any) => a.id === createdAddressId);
      expect(found).toBeFalsy();
    });
  });

  // ─── Education CRUD ────────────────────────────────────────────────────────

  test.describe.serial('Education CRUD', () => {
    let createdEducationId: number;

    test('POST education — create record', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/employees/${employeeUserId}/education`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          degree: 'B.Tech',
          institution: 'IIT Delhi (E2E Test)',
          field_of_study: 'Computer Science',
          start_year: 2016,
          end_year: 2020,
          grade: '8.5 CGPA',
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      createdEducationId = body.data.id;
    });

    test('GET education — list includes created record', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/education`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      const found = body.data.find((e: any) => e.id === createdEducationId);
      expect(found).toBeTruthy();
      expect(found.degree).toBe('B.Tech');
    });

    test('PUT education — update institution', async ({ request }) => {
      const resp = await request.put(
        `${API_BASE}/employees/${employeeUserId}/education/${createdEducationId}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: { institution: 'IIT Bombay (E2E Updated)' },
        },
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('DELETE education — remove created record', async ({ request }) => {
      const resp = await request.delete(
        `${API_BASE}/employees/${employeeUserId}/education/${createdEducationId}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(resp.status()).toBe(200);
    });
  });

  // ─── Experience CRUD ───────────────────────────────────────────────────────

  test.describe.serial('Experience CRUD', () => {
    let createdExperienceId: number;

    test('POST experience — create record', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/employees/${employeeUserId}/experience`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          company_name: 'E2E Corp Pvt Ltd',
          designation: 'Software Engineer',
          start_date: '2020-07-01',
          end_date: '2023-06-30',
          is_current: false,
          description: 'Worked on HRMS platform',
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      createdExperienceId = body.data.id;
    });

    test('GET experience — list includes created record', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/experience`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      const found = body.data.find((e: any) => e.id === createdExperienceId);
      expect(found).toBeTruthy();
      expect(found.company_name).toBe('E2E Corp Pvt Ltd');
    });

    test('PUT experience — update designation', async ({ request }) => {
      const resp = await request.put(
        `${API_BASE}/employees/${employeeUserId}/experience/${createdExperienceId}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: { designation: 'Senior Software Engineer' },
        },
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('POST experience — end_date before start_date returns 400', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/employees/${employeeUserId}/experience`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          company_name: 'Invalid Dates Corp',
          designation: 'Tester',
          start_date: '2023-01-01',
          end_date: '2020-01-01',
          is_current: false,
        },
      });
      expect(resp.status()).toBe(400);
    });

    test('DELETE experience — remove created record', async ({ request }) => {
      const resp = await request.delete(
        `${API_BASE}/employees/${employeeUserId}/experience/${createdExperienceId}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(resp.status()).toBe(200);
    });
  });

  // ─── Dependent CRUD ────────────────────────────────────────────────────────

  test.describe.serial('Dependent CRUD', () => {
    let createdDependentId: number;

    test('POST dependent — create record', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/employees/${employeeUserId}/dependents`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: 'E2E Test Dependent',
          relationship: 'Spouse',
          date_of_birth: '1995-05-15',
          gender: 'female',
          is_nominee: true,
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      createdDependentId = body.data.id;
    });

    test('GET dependents — list includes created record', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/dependents`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      const found = body.data.find((d: any) => d.id === createdDependentId);
      expect(found).toBeTruthy();
      expect(found.name).toBe('E2E Test Dependent');
    });

    test('PUT dependent — update name', async ({ request }) => {
      const resp = await request.put(
        `${API_BASE}/employees/${employeeUserId}/dependents/${createdDependentId}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: { name: 'E2E Test Dependent (Updated)' },
        },
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('DELETE dependent — remove created record', async ({ request }) => {
      const resp = await request.delete(
        `${API_BASE}/employees/${employeeUserId}/dependents/${createdDependentId}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(resp.status()).toBe(200);
    });
  });

  // ─── Salary Structure ──────────────────────────────────────────────────────

  test.describe.serial('Salary Structure', () => {
    test('GET salary — returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/salary`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('PUT salary — upsert salary structure as HR', async ({ request }) => {
      const resp = await request.put(`${API_BASE}/employees/${employeeUserId}/salary`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          ctc: 1200000,
          basic: 480000,
          hra: 240000,
          da: 60000,
          special_allowance: 180000,
          gross: 960000,
          employer_pf: 57600,
          employer_esi: 0,
          gratuity: 23077,
        },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('PUT salary — employee cannot update salary (403)', async ({ request }) => {
      const resp = await request.put(`${API_BASE}/employees/${employeeUserId}/salary`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          ctc: 9999999,
          basic: 4000000,
          hra: 2000000,
          da: 500000,
          special_allowance: 1500000,
          gross: 8000000,
          employer_pf: 480000,
          employer_esi: 0,
          gratuity: 192308,
        },
      });
      expect(resp.status()).toBe(403);
    });

    test('PUT salary — missing fields returns 400', async ({ request }) => {
      const resp = await request.put(`${API_BASE}/employees/${employeeUserId}/salary`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { ctc: 1200000 }, // missing all other fields
      });
      expect(resp.status()).toBe(400);
    });

    test('employee can view own salary', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/salary`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Profile (Extended Employee Profile) ───────────────────────────────────

  test.describe('Employee Profile', () => {
    test('GET profile — returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/profile`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('PUT profile — upsert profile data', async ({ request }) => {
      const resp = await request.put(`${API_BASE}/employees/${employeeUserId}/profile`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          blood_group: 'O+',
          marital_status: 'single',
        },
      });
      // 200 for success
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('employee can view own profile', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/profile`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Photo Upload ──────────────────────────────────────────────────────────

  test.describe('Photo Upload', () => {
    test('GET photo — returns 200 or 404', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/photo`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      // 200 if photo exists, 404 if not
      expect([200, 404]).toContain(resp.status());
    });

    test('POST photo — no file returns 400', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/employees/${employeeUserId}/photo`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        // No file attached
        data: {},
      });
      // Should fail with 400 (no photo) or 500
      expect([400, 500]).toContain(resp.status());
    });
  });

  // ─── Probation Confirm / Extend ────────────────────────────────────────────

  test.describe('Probation Management', () => {
    test('GET probation list — returns 200 for HR', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/probation`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET probation dashboard — returns 200 for HR', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/probation/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('GET probation upcoming — returns 200', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/probation/upcoming?days=90`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('PUT probation confirm — on valid probation employee', async ({ request }) => {
      // Get probation list to find a candidate
      const listResp = await request.get(`${API_BASE}/employees/probation`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listData = await listResp.json();
      const probEmployee = listData.data?.[0];

      if (probEmployee) {
        const resp = await request.put(
          `${API_BASE}/employees/${probEmployee.id}/probation/confirm`,
          { headers: { Authorization: `Bearer ${adminToken}` } },
        );
        // 200 if confirmed, 400/404 if already confirmed or not found
        expect([200, 400, 404]).toContain(resp.status());
      }
    });

    test('PUT probation extend — requires new_end_date and reason', async ({ request }) => {
      const listResp = await request.get(`${API_BASE}/employees/probation`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listData = await listResp.json();
      const probEmployee = listData.data?.[0];

      if (probEmployee) {
        // Missing fields should return 400
        const resp = await request.put(
          `${API_BASE}/employees/${probEmployee.id}/probation/extend`,
          {
            headers: { Authorization: `Bearer ${adminToken}` },
            data: {}, // no new_end_date or reason
          },
        );
        expect(resp.status()).toBe(400);
      }
    });

    test('PUT probation extend — with valid data', async ({ request }) => {
      const listResp = await request.get(`${API_BASE}/employees/probation`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listData = await listResp.json();
      const probEmployee = listData.data?.[0];

      if (probEmployee) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 3);
        const dateStr = futureDate.toISOString().split('T')[0];

        const resp = await request.put(
          `${API_BASE}/employees/${probEmployee.id}/probation/extend`,
          {
            headers: { Authorization: `Bearer ${adminToken}` },
            data: {
              new_end_date: dateStr,
              reason: 'E2E test — extending probation for evaluation',
            },
          },
        );
        // 200 if extended, 400/404 if not on probation
        expect([200, 400, 404]).toContain(resp.status());
      }
    });

    test('employee cannot access probation endpoints (403)', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/probation`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      expect(resp.status()).toBe(403);
    });
  });

  // ─── Access Control ────────────────────────────────────────────────────────

  test.describe('Access Control', () => {
    test('employee can create own address', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/employees/${employeeUserId}/addresses`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          type: 'permanent',
          line1: '99 Self-Service Lane',
          city: 'Chennai',
          state: 'Tamil Nadu',
          country: 'IN',
          zipcode: '600001',
        },
      });
      expect(resp.status()).toBe(201);
      const body = await resp.json();
      // Clean up
      if (body.data?.id) {
        await request.delete(
          `${API_BASE}/employees/${employeeUserId}/addresses/${body.data.id}`,
          { headers: { Authorization: `Bearer ${employeeToken}` } },
        );
      }
    });

    test('employee cannot create address for another employee (403)', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/employees/${adminUserId}/addresses`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          type: 'current',
          line1: '1 Unauthorized St',
          city: 'Delhi',
          state: 'Delhi',
          country: 'IN',
          zipcode: '110001',
        },
      });
      expect(resp.status()).toBe(403);
    });

    test('unauthenticated request returns 401', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees/${employeeUserId}/addresses`);
      expect(resp.status()).toBe(401);
    });
  });
});
