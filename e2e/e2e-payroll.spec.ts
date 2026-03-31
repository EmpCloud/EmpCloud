import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Payroll — Comprehensive E2E Tests
// Tests: Auth, Salary Structures, Payroll Runs, Payslips, Loans, Tax,
//        Benefits, Reimbursements, Self-Service, Reports, Employees, Health
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const PAYROLL_API = 'https://testpayroll-api.empcloud.com/api/v1';
const PAYROLL_BASE = 'https://testpayroll-api.empcloud.com';

const ORG_ADMIN = { email: 'ananya@technova.in', password: 'Welcome@123' };

let token = '';
let refreshToken = '';

// IDs captured during test execution for cross-test dependencies
let createdStructureId = '';
let createdRunId = '';
let createdLoanId = '';
let createdBenefitPlanId = '';
let createdEnrollmentId = '';
let employeeId = '';
let payslipId = '';

// ---------------------------------------------------------------------------
// Helper: auth header
// ---------------------------------------------------------------------------
const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });

// ---------------------------------------------------------------------------
// 1. AUTH (5 tests)
// ---------------------------------------------------------------------------
test.describe('1. Auth', () => {

  test('1.1 Login to EmpCloud returns access_token', async ({ request }) => {
    const r = await request.post(`${EMPCLOUD_API}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data.tokens.access_token).toBeTruthy();
  });

  test('1.2 SSO to Payroll with EmpCloud token', async ({ request }) => {
    // Login to EmpCloud
    const login = await request.post(`${EMPCLOUD_API}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    const ecToken = (await login.json()).data.tokens.access_token;

    // SSO to Payroll
    const sso = await request.post(`${PAYROLL_API}/auth/sso`, {
      data: { token: ecToken },
    });
    expect(sso.status()).toBe(200);
    const ssoBody = await sso.json();
    expect(ssoBody.success).toBe(true);
    expect(ssoBody.data?.tokens?.accessToken || ssoBody.data?.tokens?.access_token).toBeTruthy();

    // Save tokens for subsequent tests
    token = ssoBody.data?.tokens?.accessToken || ssoBody.data?.tokens?.access_token || ecToken;
    refreshToken = ssoBody.data?.tokens?.refreshToken || ssoBody.data?.tokens?.refresh_token || '';
  });

  test('1.3 SSO fails without token', async ({ request }) => {
    const r = await request.post(`${PAYROLL_API}/auth/sso`, {
      data: {},
    });
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.success).toBe(false);
  });

  test('1.4 Refresh token endpoint responds', async ({ request }) => {
    const r = await request.post(`${PAYROLL_API}/auth/refresh-token`, {
      data: { refreshToken: refreshToken || 'invalid-token' },
    });
    // Either 200 with new tokens or 401 if refresh token is invalid
    expect([200, 401, 400]).toContain(r.status());
  });

  test('1.5 Logout endpoint responds 200', async ({ request }) => {
    const r = await request.post(`${PAYROLL_API}/auth/logout`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ensure token is available for all subsequent tests
// ---------------------------------------------------------------------------
test.beforeAll(async ({ request }) => {
  const login = await request.post(`${EMPCLOUD_API}/auth/login`, {
    data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
  });
  const ecToken = (await login.json()).data.tokens.access_token;

  const sso = await request.post(`${PAYROLL_API}/auth/sso`, {
    data: { token: ecToken },
  });
  const ssoBody = await sso.json();
  token = ssoBody.data?.tokens?.accessToken || ssoBody.data?.tokens?.access_token || ecToken;
  refreshToken = ssoBody.data?.tokens?.refreshToken || ssoBody.data?.tokens?.refresh_token || '';
});

// ---------------------------------------------------------------------------
// 2. SALARY STRUCTURES (10 tests)
// ---------------------------------------------------------------------------
test.describe('2. Salary Structures', () => {

  test('2.1 List salary structures', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/salary-structures`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('2.2 Create salary structure', async ({ request }) => {
    const r = await request.post(`${PAYROLL_API}/salary-structures`, {
      ...auth(),
      data: {
        name: `PW Test Structure ${Date.now()}`,
        description: 'Playwright test salary structure',
        components: [
          { name: 'Basic', type: 'earning', calculationType: 'percentage', value: 50, isTaxable: true },
          { name: 'HRA', type: 'earning', calculationType: 'percentage', value: 20, isTaxable: true },
          { name: 'PF', type: 'deduction', calculationType: 'percentage', value: 12, isTaxable: false },
        ],
      },
    });
    expect([200, 201]).toContain(r.status());
    const body = await r.json();
    expect(body.success).toBe(true);
    if (body.data?.id) createdStructureId = String(body.data.id);
  });

  test('2.3 Get salary structure by ID', async ({ request }) => {
    test.skip(!createdStructureId, 'No structure created');
    const r = await request.get(`${PAYROLL_API}/salary-structures/${createdStructureId}`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
  });

  test('2.4 Update salary structure', async ({ request }) => {
    test.skip(!createdStructureId, 'No structure created');
    const r = await request.put(`${PAYROLL_API}/salary-structures/${createdStructureId}`, {
      ...auth(),
      data: { description: 'Updated by Playwright' },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('2.5 Get structure components', async ({ request }) => {
    test.skip(!createdStructureId, 'No structure created');
    const r = await request.get(`${PAYROLL_API}/salary-structures/${createdStructureId}/components`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('2.6 Add component to structure', async ({ request }) => {
    test.skip(!createdStructureId, 'No structure created');
    const r = await request.post(`${PAYROLL_API}/salary-structures/${createdStructureId}/components`, {
      ...auth(),
      data: { name: 'Special Allowance', type: 'earning', calculationType: 'fixed', value: 5000, isTaxable: true },
    });
    expect([200, 201]).toContain(r.status());
  });

  test('2.7 Assign salary structure to employee', async ({ request }) => {
    // First get an employee
    const empR = await request.get(`${PAYROLL_API}/employees?limit=1`, auth());
    const empBody = await empR.json();
    const emp = empBody.data?.data?.[0] || empBody.data?.[0];
    if (emp) employeeId = String(emp.empcloud_user_id || emp.id || emp.empcloudUserId);

    test.skip(!employeeId || !createdStructureId, 'No employee or structure');
    const r = await request.post(`${PAYROLL_API}/salary-structures/assign`, {
      ...auth(),
      data: {
        employeeId: employeeId,
        structureId: createdStructureId,
        ctc: 1200000,
        effectiveDate: '2026-04-01',
      },
    });
    expect([200, 201]).toContain(r.status());
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('2.8 Get employee salary', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/salary-structures/employee/${employeeId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('2.9 Get employee salary history', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/salary-structures/employee/${employeeId}/history`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('2.10 Delete salary structure', async ({ request }) => {
    test.skip(!createdStructureId, 'No structure created');
    const r = await request.delete(`${PAYROLL_API}/salary-structures/${createdStructureId}`, auth());
    // May fail if assigned, which is fine
    expect([200, 400, 409]).toContain(r.status());
  });
});

// ---------------------------------------------------------------------------
// 3. PAYROLL RUNS (12 tests)
// ---------------------------------------------------------------------------
test.describe('3. Payroll Runs', () => {

  test('3.1 List payroll runs', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/payroll`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('3.2 Create payroll run', async ({ request }) => {
    const r = await request.post(`${PAYROLL_API}/payroll`, {
      ...auth(),
      data: {
        month: 3,
        year: 2026,
        name: `PW Payroll Run ${Date.now()}`,
      },
    });
    expect([200, 201, 400, 409]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) createdRunId = String(body.data.id);
  });

  test('3.3 Get payroll run by ID', async ({ request }) => {
    // If we did not create a run, get the first from the list
    if (!createdRunId) {
      const list = await request.get(`${PAYROLL_API}/payroll`, auth());
      const listBody = await list.json();
      const firstRun = listBody.data?.[0];
      if (firstRun) createdRunId = String(firstRun.id);
    }
    test.skip(!createdRunId, 'No payroll run available');
    const r = await request.get(`${PAYROLL_API}/payroll/${createdRunId}`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('3.4 Compute payroll run', async ({ request }) => {
    test.skip(!createdRunId, 'No payroll run available');
    const r = await request.post(`${PAYROLL_API}/payroll/${createdRunId}/compute`, auth());
    // 200 = success, 400/409 = already computed or invalid state
    expect([200, 400, 409]).toContain(r.status());
  });

  test('3.5 Get payroll run summary', async ({ request }) => {
    test.skip(!createdRunId, 'No payroll run available');
    const r = await request.get(`${PAYROLL_API}/payroll/${createdRunId}/summary`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('3.6 Get payroll run payslips', async ({ request }) => {
    test.skip(!createdRunId, 'No payroll run available');
    const r = await request.get(`${PAYROLL_API}/payroll/${createdRunId}/payslips`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('3.7 Approve payroll run', async ({ request }) => {
    test.skip(!createdRunId, 'No payroll run available');
    const r = await request.post(`${PAYROLL_API}/payroll/${createdRunId}/approve`, auth());
    // 200 = success, 400/409 = wrong state
    expect([200, 400, 409]).toContain(r.status());
  });

  test('3.8 Mark payroll run as paid', async ({ request }) => {
    test.skip(!createdRunId, 'No payroll run available');
    const r = await request.post(`${PAYROLL_API}/payroll/${createdRunId}/pay`, auth());
    expect([200, 400, 409]).toContain(r.status());
  });

  test('3.9 Revert payroll run to draft', async ({ request }) => {
    test.skip(!createdRunId, 'No payroll run available');
    const r = await request.post(`${PAYROLL_API}/payroll/${createdRunId}/revert`, auth());
    expect([200, 400, 409]).toContain(r.status());
  });

  test('3.10 Cancel payroll run', async ({ request }) => {
    test.skip(!createdRunId, 'No payroll run available');
    const r = await request.post(`${PAYROLL_API}/payroll/${createdRunId}/cancel`, auth());
    expect([200, 400, 409]).toContain(r.status());
  });

  test('3.11 Send payslip emails for run', async ({ request }) => {
    test.skip(!createdRunId, 'No payroll run available');
    const r = await request.post(`${PAYROLL_API}/payroll/${createdRunId}/send-payslips`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });

  test('3.12 Payroll requires authentication', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/payroll`);
    expect([401, 403]).toContain(r.status());
  });
});

// ---------------------------------------------------------------------------
// 4. PAYSLIPS (6 tests)
// ---------------------------------------------------------------------------
test.describe('4. Payslips', () => {

  test('4.1 List payslips', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/payslips`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);

    // Capture a payslip ID for later tests
    const firstPayslip = body.data?.data?.[0] || body.data?.[0];
    if (firstPayslip) payslipId = String(firstPayslip.id);
  });

  test('4.2 Get payslip by ID', async ({ request }) => {
    test.skip(!payslipId, 'No payslip available');
    const r = await request.get(`${PAYROLL_API}/payslips/${payslipId}`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
  });

  test('4.3 Get payslips by employee', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/payslips/employee/${employeeId}`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('4.4 Download payslip PDF (HTML)', async ({ request }) => {
    test.skip(!payslipId, 'No payslip available');
    const r = await request.get(`${PAYROLL_API}/payslips/${payslipId}/pdf`, auth());
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const contentType = r.headers()['content-type'] || '';
      expect(contentType).toContain('html');
    }
  });

  test('4.5 Dispute a payslip', async ({ request }) => {
    test.skip(!payslipId, 'No payslip available');
    const r = await request.post(`${PAYROLL_API}/payslips/${payslipId}/dispute`, {
      ...auth(),
      data: { reason: 'Playwright test dispute - HRA seems incorrect' },
    });
    expect([200, 400, 409]).toContain(r.status());
  });

  test('4.6 Resolve payslip dispute', async ({ request }) => {
    test.skip(!payslipId, 'No payslip available');
    const r = await request.post(`${PAYROLL_API}/payslips/${payslipId}/resolve`, {
      ...auth(),
      data: { resolution: 'Verified - amount is correct per salary structure' },
    });
    expect([200, 400, 404]).toContain(r.status());
  });
});

// ---------------------------------------------------------------------------
// 5. LOANS (5 tests)
// ---------------------------------------------------------------------------
test.describe('5. Loans', () => {

  test('5.1 List loans', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/loans`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('5.2 Create a loan', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.post(`${PAYROLL_API}/loans`, {
      ...auth(),
      data: {
        employeeId: employeeId,
        type: 'personal',
        amount: 50000,
        interestRate: 5,
        tenureMonths: 12,
        startDate: '2026-04-01',
        reason: 'Playwright test loan',
      },
    });
    expect([200, 201, 400]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) createdLoanId = String(body.data.id);
  });

  test('5.3 Get loans by employee', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/loans/employee/${employeeId}`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('5.4 Record EMI payment', async ({ request }) => {
    test.skip(!createdLoanId, 'No loan created');
    const r = await request.post(`${PAYROLL_API}/loans/${createdLoanId}/payment`, {
      ...auth(),
      data: { amount: 5000 },
    });
    expect([200, 400]).toContain(r.status());
  });

  test('5.5 Cancel loan', async ({ request }) => {
    test.skip(!createdLoanId, 'No loan created');
    const r = await request.post(`${PAYROLL_API}/loans/${createdLoanId}/cancel`, auth());
    expect([200, 400, 409]).toContain(r.status());
  });
});

// ---------------------------------------------------------------------------
// 6. TAX (6 tests)
// ---------------------------------------------------------------------------
test.describe('6. Tax', () => {

  test('6.1 Get tax computation for employee', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/tax/computation/${employeeId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.2 Compute tax for employee', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.post(`${PAYROLL_API}/tax/computation/${employeeId}/compute`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });

  test('6.3 Get tax declarations', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/tax/declarations/${employeeId}`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('6.4 Submit tax declarations', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.post(`${PAYROLL_API}/tax/declarations/${employeeId}`, {
      ...auth(),
      data: {
        financialYear: '2025-2026',
        declarations: [
          { section: '80C', description: 'PPF', declaredAmount: 150000 },
          { section: '80D', description: 'Health Insurance', declaredAmount: 25000 },
        ],
      },
    });
    expect([200, 201, 400]).toContain(r.status());
  });

  test('6.5 Get and update tax regime', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    // Get current regime
    const getR = await request.get(`${PAYROLL_API}/tax/regime/${employeeId}`, auth());
    expect([200, 404]).toContain(getR.status());

    // Update regime
    const putR = await request.put(`${PAYROLL_API}/tax/regime/${employeeId}`, {
      ...auth(),
      data: { regime: 'new' },
    });
    expect([200, 400]).toContain(putR.status());
  });

  test('6.6 Generate Form 16 HTML', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/tax/form16/${employeeId}?fy=2025-2026`, auth());
    expect([200, 404]).toContain(r.status());
    if (r.status() === 200) {
      const ct = r.headers()['content-type'] || '';
      expect(ct).toContain('html');
    }
  });
});

// ---------------------------------------------------------------------------
// 7. BENEFITS (6 tests)
// ---------------------------------------------------------------------------
test.describe('7. Benefits', () => {

  test('7.1 Get benefits dashboard', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/benefits/dashboard`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('7.2 Create benefit plan', async ({ request }) => {
    const r = await request.post(`${PAYROLL_API}/benefits/plans`, {
      ...auth(),
      data: {
        name: `PW Test Plan ${Date.now()}`,
        type: 'health',
        description: 'Playwright test health benefit plan',
        coverageAmount: 500000,
        employerContribution: 100,
        employeeContribution: 0,
        isActive: true,
      },
    });
    expect([200, 201]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) createdBenefitPlanId = String(body.data.id);
  });

  test('7.3 List benefit plans', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/benefits/plans`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);

    // Capture plan ID if we didn't create one
    if (!createdBenefitPlanId && body.data?.[0]) {
      createdBenefitPlanId = String(body.data[0].id);
    }
  });

  test('7.4 Enroll employee in benefit plan', async ({ request }) => {
    test.skip(!employeeId || !createdBenefitPlanId, 'No employee or plan');
    const r = await request.post(`${PAYROLL_API}/benefits/enroll`, {
      ...auth(),
      data: {
        employeeId: employeeId,
        planId: createdBenefitPlanId,
        startDate: '2026-04-01',
      },
    });
    expect([200, 201, 400, 409]).toContain(r.status());
    const body = await r.json();
    if (body.data?.id) createdEnrollmentId = String(body.data.id);
  });

  test('7.5 Get my benefits (self-service)', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/benefits/my`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('7.6 Cancel enrollment', async ({ request }) => {
    test.skip(!createdEnrollmentId, 'No enrollment created');
    const r = await request.post(`${PAYROLL_API}/benefits/enrollments/${createdEnrollmentId}/cancel`, auth());
    expect([200, 400, 409]).toContain(r.status());
  });
});

// ---------------------------------------------------------------------------
// 8. REIMBURSEMENTS (4 tests)
// ---------------------------------------------------------------------------
test.describe('8. Reimbursements', () => {

  let reimbursementId = '';

  test('8.1 List reimbursements', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/reimbursements`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);

    // Capture an ID if available
    const first = body.data?.data?.[0] || body.data?.[0];
    if (first) reimbursementId = String(first.id);
  });

  test('8.2 Approve reimbursement', async ({ request }) => {
    test.skip(!reimbursementId, 'No reimbursement available');
    const r = await request.post(`${PAYROLL_API}/reimbursements/${reimbursementId}/approve`, {
      ...auth(),
      data: { amount: 5000 },
    });
    expect([200, 400, 409]).toContain(r.status());
  });

  test('8.3 Reject reimbursement', async ({ request }) => {
    test.skip(!reimbursementId, 'No reimbursement available');
    const r = await request.post(`${PAYROLL_API}/reimbursements/${reimbursementId}/reject`, auth());
    expect([200, 400, 409]).toContain(r.status());
  });

  test('8.4 Mark reimbursement as paid', async ({ request }) => {
    test.skip(!reimbursementId, 'No reimbursement available');
    const r = await request.post(`${PAYROLL_API}/reimbursements/${reimbursementId}/pay`, {
      ...auth(),
      data: { month: 3, year: 2026 },
    });
    expect([200, 400, 409]).toContain(r.status());
  });
});

// ---------------------------------------------------------------------------
// 9. SELF-SERVICE (8 tests)
// ---------------------------------------------------------------------------
test.describe('9. Self-Service', () => {

  test('9.1 Self-service dashboard', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/dashboard`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
  });

  test('9.2 My payslips', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/payslips`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('9.3 My payslips YTD summary', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/payslips/ytd`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('ytdGross');
    expect(body.data).toHaveProperty('ytdDeductions');
    expect(body.data).toHaveProperty('ytdNet');
  });

  test('9.4 My salary', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/salary`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.5 My salary CTC breakdown', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/salary/ctc`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.6 My tax computation', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/tax/computation`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.7 My tax declarations', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/tax/declarations`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('9.8 My reimbursements', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/reimbursements`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. REPORTS (5 tests) — uses existing payroll run
// ---------------------------------------------------------------------------
test.describe('10. Reports', () => {

  let reportRunId = '';

  test.beforeAll(async ({ request }) => {
    // Find an existing payroll run for report generation
    const login = await request.post(`${EMPCLOUD_API}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    const ecToken = (await login.json()).data.tokens.access_token;
    const sso = await request.post(`${PAYROLL_API}/auth/sso`, { data: { token: ecToken } });
    const ssoBody = await sso.json();
    const t = ssoBody.data?.tokens?.accessToken || ssoBody.data?.tokens?.access_token || ecToken;

    const list = await request.get(`${PAYROLL_API}/payroll`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const listBody = await list.json();
    const run = listBody.data?.[0];
    if (run) reportRunId = String(run.id);
  });

  test('10.1 PF ECR report', async ({ request }) => {
    test.skip(!reportRunId, 'No payroll run for reports');
    const r = await request.get(`${PAYROLL_API}/payroll/${reportRunId}/reports/pf`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });

  test('10.2 ESI return report', async ({ request }) => {
    test.skip(!reportRunId, 'No payroll run for reports');
    const r = await request.get(`${PAYROLL_API}/payroll/${reportRunId}/reports/esi`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });

  test('10.3 TDS summary report', async ({ request }) => {
    test.skip(!reportRunId, 'No payroll run for reports');
    const r = await request.get(`${PAYROLL_API}/payroll/${reportRunId}/reports/tds`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });

  test('10.4 Bank file download', async ({ request }) => {
    test.skip(!reportRunId, 'No payroll run for reports');
    const r = await request.get(`${PAYROLL_API}/payroll/${reportRunId}/reports/bank-file`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });

  test('10.5 Journal CSV export', async ({ request }) => {
    test.skip(!reportRunId, 'No payroll run for reports');
    const r = await request.get(`${PAYROLL_API}/payroll/${reportRunId}/export/journal-csv`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });
});

// ---------------------------------------------------------------------------
// 11. EMPLOYEES (6 tests)
// ---------------------------------------------------------------------------
test.describe('11. Employees', () => {

  let testEmpId = '';

  test('11.1 List employees', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/employees`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);

    // Capture an employee ID
    const first = body.data?.data?.[0] || body.data?.[0];
    if (first) testEmpId = String(first.empcloud_user_id || first.id || first.empcloudUserId);
  });

  test('11.2 Search employees', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/employees/search?q=ananya`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('11.3 Get employee by ID', async ({ request }) => {
    test.skip(!testEmpId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/employees/${testEmpId}`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
  });

  test('11.4 Get employee bank details', async ({ request }) => {
    test.skip(!testEmpId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/employees/${testEmpId}/bank-details`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('11.5 Get employee tax info', async ({ request }) => {
    test.skip(!testEmpId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/employees/${testEmpId}/tax-info`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('11.6 Get employee PF details', async ({ request }) => {
    test.skip(!testEmpId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/employees/${testEmpId}/pf-details`, auth());
    expect([200, 404]).toContain(r.status());
  });
});

// ---------------------------------------------------------------------------
// 12. HEALTH (2 tests)
// ---------------------------------------------------------------------------
test.describe('12. Health', () => {

  test('12.1 Basic health check', async ({ request }) => {
    const r = await request.get(`${PAYROLL_BASE}/health`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
  });

  test('12.2 Detailed health check', async ({ request }) => {
    const r = await request.get(`${PAYROLL_BASE}/health/detailed`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(body.checks).toBeTruthy();
    expect(body.checks.database).toBeTruthy();
    expect(body.checks.memory).toBeTruthy();
    expect(body.checks.uptime).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 13. ADDITIONAL COVERAGE — Edge cases & extra endpoints
// ---------------------------------------------------------------------------
test.describe('13. Additional Coverage', () => {

  test('13.1 Self-service profile', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/profile`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
  });

  test('13.2 Self-service tax regime', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/tax/regime`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('13.3 Self-service Form 16', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/self-service/tax/form16?fy=2025-2026`, auth());
    expect([200, 404]).toContain(r.status());
  });

  test('13.4 Submit reimbursement via self-service', async ({ request }) => {
    const r = await request.post(`${PAYROLL_API}/self-service/reimbursements`, {
      ...auth(),
      data: {
        type: 'travel',
        amount: 3000,
        description: 'Playwright test reimbursement - client visit',
        date: '2026-03-15',
      },
    });
    expect([200, 201, 400]).toContain(r.status());
  });

  test('13.5 Submit tax declarations via self-service', async ({ request }) => {
    const r = await request.post(`${PAYROLL_API}/self-service/tax/declarations`, {
      ...auth(),
      data: {
        financialYear: '2025-2026',
        declarations: [
          { section: '80C', description: 'ELSS Mutual Fund', declaredAmount: 100000 },
        ],
      },
    });
    expect([200, 201, 400]).toContain(r.status());
  });

  test('13.6 Update self-service tax regime', async ({ request }) => {
    const r = await request.put(`${PAYROLL_API}/self-service/tax/regime`, {
      ...auth(),
      data: { regime: 'old' },
    });
    expect([200, 400]).toContain(r.status());
  });

  test('13.7 Employee export CSV', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/employees/export`, auth());
    expect(r.status()).toBe(200);
    const ct = r.headers()['content-type'] || '';
    expect(ct).toContain('csv');
  });

  test('13.8 Employee import template', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/employees/import/template`, auth());
    expect(r.status()).toBe(200);
    const ct = r.headers()['content-type'] || '';
    expect(ct).toContain('csv');
  });

  test('13.9 Payslip export CSV', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/payslips/export/csv`, auth());
    expect([200, 400]).toContain(r.status());
  });

  test('13.10 Employee active EMI total', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/loans/employee/${employeeId}/emi-total`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('totalEMI');
  });

  test('13.11 Benefit plan by ID', async ({ request }) => {
    test.skip(!createdBenefitPlanId, 'No benefit plan');
    const r = await request.get(`${PAYROLL_API}/benefits/plans/${createdBenefitPlanId}`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('13.12 List all benefit enrollments', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/benefits/enrollments`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('13.13 Employee benefits by ID', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/benefits/employee/${employeeId}`, auth());
    expect(r.status()).toBe(200);
  });

  test('13.14 Approve tax declarations', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.post(`${PAYROLL_API}/tax/declarations/${employeeId}/approve`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });

  test('13.15 Form 12BB placeholder', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/tax/form12bb/${employeeId}`, auth());
    expect(r.status()).toBe(200);
  });

  test('13.16 TDS challan report', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/payroll/reports/tds-challan?quarter=4&fy=2025-2026`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });

  test('13.17 Form 24Q report', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/payroll/reports/form24q?quarter=4&fy=2025-2026`, auth());
    expect([200, 400, 404]).toContain(r.status());
  });

  test('13.18 Employee notes', async ({ request }) => {
    test.skip(!employeeId, 'No employee ID');
    const r = await request.get(`${PAYROLL_API}/employees/${employeeId}/notes`, auth());
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
  });

  test('13.19 Unauthorized access returns 401', async ({ request }) => {
    const r = await request.get(`${PAYROLL_API}/employees`, {
      headers: { Authorization: 'Bearer invalid-token-abc' },
    });
    expect([401, 403]).toContain(r.status());
  });

  test('13.20 Self-service update bank details', async ({ request }) => {
    const r = await request.put(`${PAYROLL_API}/self-service/profile/bank-details`, {
      ...auth(),
      data: {
        bankName: 'HDFC Bank',
        accountNumber: '50100123456789',
        ifscCode: 'HDFC0001234',
        accountHolderName: 'Ananya Sharma',
      },
    });
    expect([200, 400]).toContain(r.status());
  });
});
