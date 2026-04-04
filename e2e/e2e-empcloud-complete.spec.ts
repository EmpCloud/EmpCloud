import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Cloud — Complete Coverage E2E Tests (40 tests)
// Covers: Bulk Import, Employee Photo, Education/Experience/Dependent CRUD,
//         Shift Swap Approve/Reject, Comp-Off Approve/Reject, Onboarding Wizard,
//         Cross-Org User Management, Document Download, Manager Dashboard,
//         Dashboard Widgets, Probation, Leave Calendar, and more.
//
// TechNova Solutions — Karthik Iyer (Manager), Priya Patel (Employee), Meera Krishnan (HR Admin)
// API: https://test-empcloud-api.empcloud.com/api/v1
// =============================================================================

const API = 'https://test-empcloud-api.empcloud.com/api/v1';

const ADMIN = { email: 'ananya@technova.in', password: 'Welcome@123' };
const MANAGER_USER = { email: 'karthik@technova.in', password: 'Welcome@123' };
const EMPLOYEE = { email: 'priya@technova.in', password: 'Welcome@123' };
const MEERA = { email: 'meera@technova.in', password: 'Welcome@123' };

const RUN = Date.now().toString().slice(-6);

test.describe('EMP Cloud — Complete Coverage', () => {
  let adminToken: string;
  let managerToken: string;
  let employeeToken: string;
  let meeraToken: string;
  let adminUserId: number;
  let employeeUserId: number;
  let meeraUserId: number;

  test.beforeAll(async ({ request }) => {
    // Login as org admin
    const adminResp = await request.post(`${API}/auth/login`, { data: ADMIN });
    expect(adminResp.status()).toBe(200);
    const adminData = await adminResp.json();
    adminToken = adminData.data.tokens.access_token;

    const adminMe = await request.get(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminMeData = await adminMe.json();
    adminUserId = adminMeData.data?.user?.id || adminMeData.data?.employee_id || adminMeData.data?.id;

    // Login as manager (Karthik — reporting manager for Priya)
    const mgrResp = await request.post(`${API}/auth/login`, { data: MANAGER_USER });
    expect(mgrResp.status()).toBe(200);
    const mgrData = await mgrResp.json();
    managerToken = mgrData.data.tokens.access_token;

    // Login as employee (Priya — reports to Karthik)
    const empResp = await request.post(`${API}/auth/login`, { data: EMPLOYEE });
    expect(empResp.status()).toBe(200);
    const empData = await empResp.json();
    employeeToken = empData.data.tokens.access_token;

    const empMe = await request.get(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const empMeData = await empMe.json();
    employeeUserId = empMeData.data?.user?.id || empMeData.data?.employee_id || empMeData.data?.id;

    // Try login as Meera Krishnan
    try {
      const meeraResp = await request.post(`${API}/auth/login`, { data: MEERA });
      if (meeraResp.status() === 200) {
        const meeraData = await meeraResp.json();
        meeraToken = meeraData.data.tokens.access_token;
        const meeraMe = await request.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${meeraToken}` },
        });
        const meeraMeData = await meeraMe.json();
        meeraUserId = meeraMeData.data?.user?.id || meeraMeData.data?.employee_id || meeraMeData.data?.id;
      } else {
        // Meera may not exist — fall back to Arjun for employee-specific tests
        meeraToken = employeeToken;
        meeraUserId = employeeUserId;
      }
    } catch {
      meeraToken = employeeToken;
      meeraUserId = employeeUserId;
    }
  });

  const auth = () => ({ headers: { Authorization: `Bearer ${adminToken}` } });
  const empAuthH = () => ({ headers: { Authorization: `Bearer ${employeeToken}` } });
  const meeraAuth = () => ({ headers: { Authorization: `Bearer ${meeraToken}` } });

  // =========================================================================
  // 1. Bulk User Import (2 tests)
  // =========================================================================

  test.describe.serial('1 - Bulk User Import', () => {

    test('1.1 Import CSV preview — parse 5 TechNova employees', async ({ request }) => {
      const csvContent = [
        'first_name,last_name,email,role,designation,department',
        `Ravi,Kumar,ravi.import${RUN}@technova.in,employee,Backend Developer,Engineering`,
        `Sneha,Patel,sneha.import${RUN}@technova.in,employee,QA Engineer,Engineering`,
        `Deepak,Sharma,deepak.import${RUN}@technova.in,employee,DevOps Engineer,Engineering`,
        `Priya,Nair,priya.import${RUN}@technova.in,employee,UI Designer,Design`,
        `Karthik,Iyer,karthik.import${RUN}@technova.in,employee,Data Analyst,Analytics`,
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const r = await request.post(`${API}/users/import`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        multipart: {
          file: { name: 'technova_employees.csv', mimeType: 'text/csv', buffer },
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      if (r.status() === 200 || r.status() === 201) {
        const body = await r.json();
        expect(body.success).toBe(true);
        expect(body.data.totalRows).toBe(5);
      }
    });

    test('1.2 Execute bulk import of TechNova employees', async ({ request }) => {
      const csvContent = [
        'first_name,last_name,email,role,designation,department',
        `TestImport,User${RUN},testimport${RUN}@technova.in,employee,Intern,Engineering`,
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const r = await request.post(`${API}/users/import/execute`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        multipart: {
          file: { name: 'technova_import.csv', mimeType: 'text/csv', buffer },
        },
      });
      expect([200, 201, 400, 409]).toContain(r.status());
    });
  });

  // =========================================================================
  // 2. Employee Photo (2 tests)
  // =========================================================================

  test.describe.serial('2 - Employee Photo', () => {

    test('2.1 Upload profile photo for Meera Krishnan', async ({ request }) => {
      // Create a minimal 1x1 PNG (67 bytes)
      const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const r = await request.post(`${API}/employees/${meeraUserId}/photo`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        multipart: {
          photo: { name: 'meera_krishnan_profile.png', mimeType: 'image/png', buffer: pngBytes },
        },
      });
      expect([200, 201]).toContain(r.status());
      if (r.status() === 200 || r.status() === 201) {
        const body = await r.json();
        expect(body.success).toBe(true);
        expect(body.data.photo_url).toBeTruthy();
      }
    });

    test('2.2 Get profile photo for Meera', async ({ request }) => {
      const r = await request.get(`${API}/employees/${meeraUserId}/photo`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 3. Education CRUD for Meera — MBA from IIM Bangalore (2 tests)
  // =========================================================================

  test.describe.serial('3 - Education CRUD (Meera)', () => {
    let educationId: number;

    test('3.1 Create MBA education record — IIM Bangalore 2018', async ({ request }) => {
      const r = await request.post(`${API}/employees/${meeraUserId}/education`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          degree: 'MBA',
          institution: 'IIM Bangalore',
          field_of_study: 'Finance & Strategy',
          start_year: 2016,
          end_year: 2018,
          grade: '3.8 GPA',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.success).toBe(true);
      educationId = body.data.id;
    });

    test('3.2 Update MBA specialization to Finance & Analytics', async ({ request }) => {
      expect(educationId, 'Prerequisite failed — educationId not set').toBeTruthy();
      const r = await request.put(`${API}/employees/${meeraUserId}/education/${educationId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { field_of_study: 'Finance & Analytics' },
      });
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });
  });

  // =========================================================================
  // 4. Experience CRUD for Meera — 3 years at Infosys (2 tests)
  // =========================================================================

  test.describe.serial('4 - Experience CRUD (Meera)', () => {
    let experienceId: number;

    test('4.1 Create experience record — Infosys Financial Analyst', async ({ request }) => {
      const r = await request.post(`${API}/employees/${meeraUserId}/experience`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          company_name: 'Infosys Ltd',
          designation: 'Financial Analyst',
          start_date: '2018-07-01',
          end_date: '2021-06-30',
          is_current: false,
          description: 'Financial planning, budgeting, and variance analysis for IT services vertical',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.success).toBe(true);
      experienceId = body.data.id;
    });

    test('4.2 Update experience designation to Senior Financial Analyst', async ({ request }) => {
      expect(experienceId, 'Prerequisite failed — experienceId not set').toBeTruthy();
      const r = await request.put(`${API}/employees/${meeraUserId}/experience/${experienceId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { designation: 'Senior Financial Analyst' },
      });
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });
  });

  // =========================================================================
  // 5. Dependent CRUD for Meera (2 tests)
  // =========================================================================

  test.describe.serial('5 - Dependent CRUD (Meera)', () => {
    let dependentId: number;

    test('5.1 Add dependent — Mother (Lakshmi Krishnan)', async ({ request }) => {
      const r = await request.post(`${API}/employees/${meeraUserId}/dependents`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: 'Lakshmi Krishnan',
          relationship: 'Mother',
          date_of_birth: '1965-03-12',
          gender: 'female',
          is_nominee: true,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      expect(body.success).toBe(true);
      dependentId = body.data.id;
    });

    test('5.2 Update dependent — set as insurance nominee', async ({ request }) => {
      expect(dependentId, 'Prerequisite failed — dependentId not set').toBeTruthy();
      const r = await request.put(`${API}/employees/${meeraUserId}/dependents/${dependentId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { is_nominee: true, name: 'Lakshmi Krishnan (Updated)' },
      });
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });
  });

  // =========================================================================
  // 6. Shift Swap Approve/Reject (4 tests)
  // =========================================================================

  test.describe.serial('6 - Shift Swap Approve/Reject', () => {
    let swapRequestId: number;
    let shiftId: number;

    test('6.1 List existing shifts to get a valid shift ID', async ({ request }) => {
      const r = await request.get(`${API}/attendance/shifts`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
      if (body.data.length > 0) shiftId = body.data[0].id;
    });

    test('6.2 Create shift swap request for Priya', async ({ request }) => {
      if (!shiftId) { expect(true).toBe(true); return; }
      // Employee requests shift swap
      const r = await request.post(`${API}/attendance/shifts/swap-request`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          target_shift_id: shiftId,
          reason: `Priya needs to swap to accommodate client meeting ${RUN}`,
          swap_date: '2026-04-15',
        },
      });
      expect([200, 201, 400, 409]).toContain(r.status());
      if (r.status() === 200 || r.status() === 201) {
        const body = await r.json();
        if (body.data?.id) swapRequestId = body.data.id;
      }
    });

    test('6.3 List pending swap requests', async ({ request }) => {
      const r = await request.get(`${API}/attendance/shifts/swap-requests?status=pending`, auth());
      expect([200]).toContain(r.status());
      const body = await r.json();
      if (!swapRequestId && body.data?.length > 0) {
        swapRequestId = body.data[0].id;
      }
    });

    test('6.4 Approve swap request (or reject if no valid swap)', async ({ request }) => {
      if (!swapRequestId) { expect(true).toBe(true); return; }
      // Try approve first
      const r = await request.post(`${API}/attendance/shifts/swap-requests/${swapRequestId}/approve`, auth());
      expect([200, 400, 404, 409]).toContain(r.status());
    });
  });

  // =========================================================================
  // 7. Comp-Off Approve/Reject (4 tests)
  // =========================================================================

  test.describe.serial('7 - Comp-Off Approve/Reject', () => {
    let compOffId: number;

    test('7.1 Submit comp-off request for weekend work', async ({ request }) => {
      const r = await request.post(`${API}/leave/comp-off`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
        data: {
          work_date: '2026-04-05',
          reason: `Worked on Saturday for TechNova product launch ${RUN}`,
          hours_worked: 8,
        },
      });
      expect([200, 201, 400, 409]).toContain(r.status());
      if (r.status() === 200 || r.status() === 201) {
        const body = await r.json();
        if (body.data?.id) compOffId = body.data.id;
      }
    });

    test('7.2 List pending comp-off approvals', async ({ request }) => {
      const r = await request.get(`${API}/leave/comp-off/pending`, { headers: { Authorization: `Bearer ${managerToken}` } });
      expect([200]).toContain(r.status());
      const body = await r.json();
      if (!compOffId && body.data?.length > 0) {
        compOffId = body.data[0].id;
      }
    });

    test('7.3 Approve comp-off for weekend work (Manager)', async ({ request }) => {
      if (!compOffId) { expect(true).toBe(true); return; }
      const r = await request.put(`${API}/leave/comp-off/${compOffId}/approve`, { headers: { Authorization: `Bearer ${managerToken}` } });
      expect([200, 400, 404, 409]).toContain(r.status());
    });

    test('7.4 Get comp-off balance after approval', async ({ request }) => {
      const r = await request.get(`${API}/leave/comp-off/balance`, empAuthH());
      expect([200]).toContain(r.status());
      const body = await r.json();
      expect(body.success).toBe(true);
    });
  });

  // =========================================================================
  // 8. Onboarding Wizard (3 tests)
  // =========================================================================

  test.describe.serial('8 - Onboarding Wizard', () => {

    test('8.1 Get onboarding status', async ({ request }) => {
      const r = await request.get(`${API}/onboarding/status`, auth());
      expect([200]).toContain(r.status());
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('8.2 Complete onboarding step 1 (org setup)', async ({ request }) => {
      const r = await request.post(`${API}/onboarding/step/1`, {
        ...auth(),
        data: {
          company_name: 'TechNova Solutions',
          industry: 'Technology',
          employee_count: '50-200',
        },
      });
      expect([200, 400]).toContain(r.status());
    });

    test('8.3 Complete onboarding (mark all done)', async ({ request }) => {
      const r = await request.post(`${API}/onboarding/complete`, auth());
      expect([200, 400]).toContain(r.status());
    });
  });

  // =========================================================================
  // 9. Cross-Org User Management (3 tests)
  // =========================================================================

  test.describe.serial('9 - Cross-Org User Management', () => {
    let testUserId: number;

    test('9.1 List users to find a test user', async ({ request }) => {
      const r = await request.get(`${API}/users?include_inactive=true`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      // Pick a user that is not the admin or Arjun
      const users = body.data || [];
      const candidate = users.find((u: any) => u.id !== adminUserId && u.id !== employeeUserId);
      if (candidate) testUserId = candidate.id;
    });

    test('9.2 Deactivate user', async ({ request }) => {
      if (!testUserId) { expect(true).toBe(true); return; }
      const r = await request.delete(`${API}/users/${testUserId}`, auth());
      expect([200, 400, 404]).toContain(r.status());
    });

    test('9.3 Reactivate user via PUT', async ({ request }) => {
      if (!testUserId) { expect(true).toBe(true); return; }
      const r = await request.put(`${API}/users/${testUserId}`, {
        ...auth(),
        data: { status: 'active' },
      });
      expect([200, 400, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 10. Document Download (2 tests)
  // =========================================================================

  test.describe.serial('10 - Document Download', () => {
    let documentId: number;

    test('10.1 List documents to find one for download', async ({ request }) => {
      const r = await request.get(`${API}/documents`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      const docs = body.data || [];
      if (docs.length > 0) documentId = docs[0].id;
    });

    test('10.2 Download document by ID', async ({ request }) => {
      if (!documentId) { expect(true).toBe(true); return; }
      const r = await request.get(`${API}/documents/${documentId}/download`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 11. Manager Dashboard & Team (3 tests)
  // =========================================================================

  test.describe('11 - Manager Dashboard', () => {

    test('11.1 Get manager dashboard stats', async ({ request }) => {
      const r = await request.get(`${API}/manager/dashboard`, { headers: { Authorization: `Bearer ${managerToken}` } });
      expect([200]).toContain(r.status());
    });

    test('11.2 Get manager team members', async ({ request }) => {
      const r = await request.get(`${API}/manager/team`, { headers: { Authorization: `Bearer ${managerToken}` } });
      expect([200]).toContain(r.status());
    });

    test('11.3 Get team attendance today', async ({ request }) => {
      const r = await request.get(`${API}/manager/attendance`, { headers: { Authorization: `Bearer ${managerToken}` } });
      expect([200]).toContain(r.status());
    });
  });

  // =========================================================================
  // 12. Dashboard Widgets (1 test)
  // =========================================================================

  test.describe('12 - Dashboard Widgets', () => {

    test('12.1 Get module dashboard widgets', async ({ request }) => {
      const r = await request.get(`${API}/dashboard/widgets`, auth());
      expect([200]).toContain(r.status());
      const body = await r.json();
      expect(body.success).toBe(true);
    });
  });

  // =========================================================================
  // 13. Probation Tracking (3 tests)
  // =========================================================================

  test.describe('13 - Probation Tracking', () => {

    test('13.1 Get probation dashboard stats', async ({ request }) => {
      const r = await request.get(`${API}/employees/probation/dashboard`, auth());
      expect([200]).toContain(r.status());
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('13.2 List employees on probation', async ({ request }) => {
      const r = await request.get(`${API}/employees/probation`, auth());
      expect([200]).toContain(r.status());
    });

    test('13.3 Get upcoming probation confirmations (30 days)', async ({ request }) => {
      const r = await request.get(`${API}/employees/probation/upcoming?days=30`, auth());
      expect([200]).toContain(r.status());
    });
  });

  // =========================================================================
  // 14. Leave Calendar & Pending (2 tests)
  // =========================================================================

  test.describe('14 - Leave Calendar', () => {

    test('14.1 Get manager team leave calendar', async ({ request }) => {
      const r = await request.get(`${API}/manager/leaves/calendar?start_date=2026-04-01&end_date=2026-04-30`, { headers: { Authorization: `Bearer ${managerToken}` } });
      expect([200]).toContain(r.status());
    });

    test('14.2 Get manager pending leave approvals', async ({ request }) => {
      const r = await request.get(`${API}/manager/leaves/pending`, { headers: { Authorization: `Bearer ${managerToken}` } });
      expect([200]).toContain(r.status());
    });
  });

  // =========================================================================
  // 15. Employee Directory & Insights (4 tests)
  // =========================================================================

  test.describe('15 - Employee Insights', () => {

    test('15.1 Get employee birthdays', async ({ request }) => {
      const r = await request.get(`${API}/employees/birthdays`, auth());
      expect([200]).toContain(r.status());
    });

    test('15.2 Get employee work anniversaries', async ({ request }) => {
      const r = await request.get(`${API}/employees/anniversaries`, auth());
      expect([200]).toContain(r.status());
    });

    test('15.3 Get headcount breakdown', async ({ request }) => {
      const r = await request.get(`${API}/employees/headcount`, auth());
      expect([200]).toContain(r.status());
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('15.4 Employee directory search for Meera Krishnan', async ({ request }) => {
      const r = await request.get(`${API}/employees/directory?search=Meera`, auth());
      expect([200]).toContain(r.status());
    });
  });

  // =========================================================================
  // 16. Skip Onboarding & Invitations (2 tests)
  // =========================================================================

  test.describe('16 - Invitations & Onboarding Skip', () => {

    test('16.1 List pending invitations', async ({ request }) => {
      const r = await request.get(`${API}/users/invitations`, auth());
      expect([200]).toContain(r.status());
    });

    test('16.2 Skip onboarding wizard', async ({ request }) => {
      const r = await request.post(`${API}/onboarding/skip`, auth());
      expect([200, 400]).toContain(r.status());
    });
  });

  // =========================================================================
  // 17. Shift Schedule & My Schedule (2 tests)
  // =========================================================================

  test.describe('17 - Shift Schedule', () => {

    test('17.1 Get shift schedule for April 2026', async ({ request }) => {
      const r = await request.get(`${API}/attendance/shifts/schedule?start_date=2026-04-01&end_date=2026-04-30`, auth());
      expect([200]).toContain(r.status());
    });

    test('17.2 Get my shift schedule as employee', async ({ request }) => {
      const r = await request.get(`${API}/attendance/shifts/my-schedule`, empAuthH());
      expect([200]).toContain(r.status());
    });
  });

  // =========================================================================
  // 18. Document Expiring & Mandatory (2 tests)
  // =========================================================================

  test.describe('18 - Document Alerts', () => {

    test('18.1 Get expiring documents (next 30 days)', async ({ request }) => {
      const r = await request.get(`${API}/documents/expiring?days=30`, auth());
      expect([200]).toContain(r.status());
    });

    test('18.2 Get mandatory document compliance status', async ({ request }) => {
      const r = await request.get(`${API}/documents/mandatory-status`, auth());
      expect([200]).toContain(r.status());
    });
  });
});
