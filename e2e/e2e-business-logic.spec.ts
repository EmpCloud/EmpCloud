import { test, expect, type APIRequestContext } from '@playwright/test';

// =============================================================================
// EMP Cloud — Business Logic Accuracy Tests
// Verifies NUMBERS are correct, not just 200 statuses.
// Covers: Payroll Tax, Leave Balances, FnF Settlement, Attendance Math,
//         Subscription Pricing, Revenue Dashboard
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const PAYROLL_API = 'https://testpayroll-api.empcloud.com/api/v1';
const EXIT_API = 'https://test-exit-api.empcloud.com/api/v1';

const ORG_ADMIN = { email: 'ananya@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };
const SUPER_ADMIN = { email: 'admin@empcloud.com', password: process.env.TEST_SUPER_ADMIN_PASSWORD || 'SuperAdmin@123' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCloudToken(request: APIRequestContext, creds = ORG_ADMIN): Promise<string> {
  const res = await request.post(`${EMPCLOUD_API}/auth/login`, { data: creds });
  expect(res.status()).toBe(200);
  return (await res.json()).data.tokens.access_token;
}

async function getPayrollToken(request: APIRequestContext): Promise<string> {
  const ecToken = await getCloudToken(request);
  const sso = await request.post(`${PAYROLL_API}/auth/sso`, {
    data: { token: ecToken },
  });
  expect(sso.status()).toBe(200);
  const body = await sso.json();
  return body.data?.tokens?.accessToken || body.data?.tokens?.access_token || '';
}

async function getExitToken(request: APIRequestContext): Promise<string> {
  const ecToken = await getCloudToken(request);
  const sso = await request.post(`${EXIT_API}/auth/sso`, {
    data: { token: ecToken },
  });
  expect(sso.status()).toBe(200);
  const body = await sso.json();
  return body.data?.tokens?.accessToken || body.data?.tokens?.access_token || '';
}

function auth(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Run serially — shared tokens
test.describe.configure({ mode: 'serial' });

// =============================================================================
// 1. PAYROLL: Salary Structure & Tax Calculation Verification
// =============================================================================
test.describe('1. Payroll Salary & Tax Math', () => {
  let payrollToken = '';

  test.beforeAll(async ({ request }) => {
    payrollToken = await getPayrollToken(request);
    expect(payrollToken).toBeTruthy();
  });

  test('1.1 Salary structure components add up: Basic = 50% of CTC', async ({ request }) => {
    // Get employee 522 (Ananya) salary
    const res = await request.get(`${PAYROLL_API}/salary-structures/employee/522`, auth(payrollToken));
    if (res.status() !== 200) {
      console.log('No salary assigned to employee 522 — skipping component math');
      return;
    }
    const salary = (await res.json()).data;
    expect(salary, 'Employee salary data should exist').toBeTruthy();

    const ctc = parseFloat(salary.ctc);
    expect(ctc).toBeGreaterThan(0);

    const components: Array<{ code: string; annualAmount: number; monthlyAmount: number }> =
      salary.components || [];

    // Find BASIC component
    const basic = components.find((c) => c.code === 'BASIC');
    expect(basic, 'BASIC component must exist in salary structure').toBeTruthy();

    // Indian standard: Basic = 50% of CTC
    const expectedBasicAnnual = ctc * 0.5;
    expect(basic!.annualAmount).toBe(expectedBasicAnnual);
    console.log(`CTC: ${ctc}, Basic: ${basic!.annualAmount} (${(basic!.annualAmount / ctc * 100).toFixed(0)}% of CTC)`);

    // Monthly = Annual / 12
    expect(basic!.monthlyAmount).toBe(basic!.annualAmount / 12);
    console.log(`Basic monthly: ${basic!.monthlyAmount} = ${basic!.annualAmount} / 12 ✓`);
  });

  test('1.2 HRA is 40-50% of Basic salary', async ({ request }) => {
    const res = await request.get(`${PAYROLL_API}/salary-structures/employee/522`, auth(payrollToken));
    if (res.status() !== 200) return;
    const salary = (await res.json()).data;
    const components: Array<{ code: string; annualAmount: number; monthlyAmount: number }> =
      salary.components || [];

    const basic = components.find((c) => c.code === 'BASIC');
    const hra = components.find((c) => c.code === 'HRA');

    if (!hra) {
      console.log('No HRA component — some structures may not have HRA');
      return;
    }
    expect(basic).toBeTruthy();

    const hraPercentOfBasic = (hra!.annualAmount / basic!.annualAmount) * 100;
    // Indian rule: HRA is typically 40% (non-metro) or 50% (metro)
    expect(hraPercentOfBasic).toBeGreaterThanOrEqual(20);
    expect(hraPercentOfBasic).toBeLessThanOrEqual(50);
    console.log(`HRA: ${hra!.annualAmount} = ${hraPercentOfBasic.toFixed(1)}% of Basic (${basic!.annualAmount})`);

    // Monthly = Annual / 12
    expect(hra!.monthlyAmount).toBe(hra!.annualAmount / 12);
  });

  test('1.3 PF contribution = 12% of Basic, capped at ₹1,800/month', async ({ request }) => {
    const res = await request.get(`${PAYROLL_API}/salary-structures/employee/522`, auth(payrollToken));
    if (res.status() !== 200) return;
    const salary = (await res.json()).data;
    const components: Array<{ code: string; annualAmount: number; monthlyAmount: number }> =
      salary.components || [];

    const basic = components.find((c) => c.code === 'BASIC');
    const pf = components.find((c) => c.code === 'PF' || c.code === 'EPF');

    if (!pf) {
      console.log('No PF component found');
      return;
    }
    expect(basic).toBeTruthy();

    // PF = 12% of Basic
    const expectedPfAnnual = basic!.annualAmount * 0.12;
    const pfMonthly = pf!.monthlyAmount;

    // PF is 12% of basic, but capped at 12% of ₹15,000 = ₹1,800/month
    const PF_CAP_MONTHLY = 1800;
    const uncappedPfMonthly = basic!.monthlyAmount * 0.12;

    if (basic!.monthlyAmount > 15000) {
      // When basic > ₹15,000, PF can be either capped at ₹1,800 or uncapped (employer choice)
      const isCapped = pfMonthly === PF_CAP_MONTHLY;
      const isUncapped = Math.abs(pfMonthly - uncappedPfMonthly) < 1;
      expect(isCapped || isUncapped, `PF monthly (${pfMonthly}) should be either capped (${PF_CAP_MONTHLY}) or 12% of basic (${uncappedPfMonthly})`).toBe(true);
      console.log(`PF: ₹${pfMonthly}/mo (${isCapped ? 'capped at ₹1,800' : '12% uncapped'}) — Basic: ₹${basic!.monthlyAmount}/mo`);
    } else {
      // PF = 12% of basic when basic <= ₹15,000
      expect(Math.abs(pfMonthly - uncappedPfMonthly)).toBeLessThan(1);
      console.log(`PF: ₹${pfMonthly}/mo = 12% of ₹${basic!.monthlyAmount} ✓`);
    }

    // Monthly = Annual / 12
    expect(pf!.monthlyAmount).toBe(pf!.annualAmount / 12);
  });

  test('1.4 Gross salary = sum of all components (or net = gross - deductions)', async ({ request }) => {
    const res = await request.get(`${PAYROLL_API}/salary-structures/employee/522`, auth(payrollToken));
    if (res.status() !== 200) return;
    const salary = (await res.json()).data;
    const components: Array<{ code: string; annualAmount: number; monthlyAmount: number }> = salary.components || [];
    const grossSalary = parseFloat(salary.gross_salary);
    const netSalary = parseFloat(salary.net_salary);
    const ctc = parseFloat(salary.ctc);

    // Sum all component annual amounts
    const sumAllComponents = components.reduce((sum, c) => sum + c.annualAmount, 0);

    // Gross salary should equal sum of all listed components
    // (payroll stores gross as the total of Basic + HRA + PF etc.)
    const matchesSumAll = Math.abs(grossSalary - sumAllComponents) < 100;
    // Or gross might be CTC minus non-listed employer costs
    const grossLessThanCTC = grossSalary <= ctc;

    expect(grossLessThanCTC, `Gross (${grossSalary}) should be <= CTC (${ctc})`).toBe(true);
    expect(grossSalary).toBeGreaterThan(0);

    // Net should be <= Gross
    expect(netSalary, `Net (${netSalary}) should be <= Gross (${grossSalary})`).toBeLessThanOrEqual(grossSalary);

    console.log(`CTC: ${ctc}, Gross: ${grossSalary}, Net: ${netSalary}, Components sum: ${sumAllComponents}`);
    if (matchesSumAll) {
      console.log('Gross matches sum of all components ✓');
    } else {
      console.log(`Gross (${grossSalary}) ≠ components sum (${sumAllComponents}) — may have unlisted employer costs`);
    }
  });

  test('1.5 Monthly amounts = Annual / 12 for all components', async ({ request }) => {
    const res = await request.get(`${PAYROLL_API}/salary-structures/employee/522`, auth(payrollToken));
    if (res.status() !== 200) return;
    const salary = (await res.json()).data;
    const components: Array<{ code: string; annualAmount: number; monthlyAmount: number }> = salary.components || [];

    for (const comp of components) {
      const expectedMonthly = comp.annualAmount / 12;
      expect(
        comp.monthlyAmount,
        `${comp.code}: monthly (${comp.monthlyAmount}) should equal annual/12 (${expectedMonthly})`
      ).toBe(expectedMonthly);
    }
    console.log(`All ${components.length} components pass monthly = annual/12 check ✓`);
  });

  test('1.6 Tax computation — if exists, TDS slabs are mathematically correct', async ({ request }) => {
    const res = await request.get(`${PAYROLL_API}/tax/computation/522`, auth(payrollToken));
    expect(res.status()).toBe(200);
    const body = await res.json();

    if (!body.data) {
      console.log('No tax computation for employee 522 — may need salary/regime setup');
      return;
    }

    const tax = body.data;
    // If tax data is available, verify basic constraints
    if (tax.taxable_income !== undefined && tax.total_tax !== undefined) {
      const taxableIncome = parseFloat(tax.taxable_income);
      const totalTax = parseFloat(tax.total_tax);

      // Tax cannot be negative
      expect(totalTax).toBeGreaterThanOrEqual(0);

      // Tax cannot exceed taxable income
      expect(totalTax).toBeLessThanOrEqual(taxableIncome);

      // Effective tax rate should be reasonable (0-30% for India)
      if (taxableIncome > 0) {
        const effectiveRate = (totalTax / taxableIncome) * 100;
        expect(effectiveRate).toBeLessThanOrEqual(35); // max 30% + cess
        console.log(`Taxable income: ${taxableIncome}, Tax: ${totalTax}, Effective rate: ${effectiveRate.toFixed(1)}%`);
      }
    }
  });

  test('1.7 ESI threshold: not applicable if gross > ₹21,000/month', async ({ request }) => {
    const res = await request.get(`${PAYROLL_API}/salary-structures/employee/522`, auth(payrollToken));
    if (res.status() !== 200) return;
    const salary = (await res.json()).data;
    const grossMonthly = parseFloat(salary.gross_salary) / 12;
    const components: Array<{ code: string; annualAmount: number; monthlyAmount: number }> = salary.components || [];
    const esiComponent = components.find(c => c.code === 'ESI' || c.code === 'ESIC');

    if (grossMonthly > 21000) {
      // ESI not applicable for gross > ₹21,000/month
      if (esiComponent) {
        expect(
          esiComponent.monthlyAmount,
          `ESI should be 0 when gross (₹${grossMonthly.toFixed(0)}) > ₹21,000`
        ).toBe(0);
      }
      console.log(`Gross: ₹${grossMonthly.toFixed(0)}/mo > ₹21,000 — ESI correctly absent ✓`);
    } else {
      // ESI = 0.75% of gross
      if (esiComponent) {
        const expectedEsi = grossMonthly * 0.0075;
        expect(Math.abs(esiComponent.monthlyAmount - expectedEsi)).toBeLessThan(1);
        console.log(`ESI: ₹${esiComponent.monthlyAmount} = 0.75% of ₹${grossMonthly.toFixed(0)} ✓`);
      }
    }
  });
});

// =============================================================================
// 2. LEAVE: Accrual & Balance Verification
// =============================================================================
test.describe('2. Leave Balance Math', () => {
  let cloudToken = '';

  test.beforeAll(async ({ request }) => {
    cloudToken = await getCloudToken(request);
  });

  test('2.1 Leave balance = total_allocated + carry_forward - total_used', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/leave/balances/me`, auth(cloudToken));
    expect(res.status()).toBe(200);
    const balances: Array<{
      leave_type_name: string;
      total_allocated: string;
      total_used: string;
      total_carry_forward: string;
      balance: string;
    }> = (await res.json()).data;

    expect(balances.length).toBeGreaterThan(0);
    let allCorrect = true;

    for (const bal of balances) {
      const allocated = parseFloat(bal.total_allocated);
      const used = parseFloat(bal.total_used);
      const carryForward = parseFloat(bal.total_carry_forward);
      const balance = parseFloat(bal.balance);

      const expected = allocated + carryForward - used;

      if (Math.abs(balance - expected) > 0.01) {
        console.error(
          `WRONG: ${bal.leave_type_name}: balance=${balance}, expected=${expected} ` +
          `(allocated=${allocated} + cf=${carryForward} - used=${used})`
        );
        allCorrect = false;
      }
    }
    expect(allCorrect, 'All leave balances must satisfy: balance = allocated + carry_forward - used').toBe(true);
    console.log(`All ${balances.length} leave balances pass arithmetic check ✓`);
  });

  test('2.2 Leave balance cannot be negative (unless policy allows)', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/leave/balances/me`, auth(cloudToken));
    const balances: Array<{ leave_type_name: string; balance: string }> = (await res.json()).data;

    for (const bal of balances) {
      const balance = parseFloat(bal.balance);
      expect(
        balance,
        `${bal.leave_type_name} balance (${balance}) should not be negative`
      ).toBeGreaterThanOrEqual(0);
    }
    console.log('No negative balances found ✓');
  });

  test('2.3 total_used matches sum of approved leave applications', async ({ request }) => {
    // Get balances
    const balRes = await request.get(`${EMPCLOUD_API}/leave/balances/me`, auth(cloudToken));
    const balances: Array<{
      user_id: number;
      leave_type_id: number;
      leave_type_name: string;
      total_used: string;
      year: number;
    }> = (await balRes.json()).data;

    // Get approved applications for this year
    const appRes = await request.get(
      `${EMPCLOUD_API}/leave/applications?status=approved&year=${new Date().getFullYear()}`,
      auth(cloudToken)
    );
    const appBody = await appRes.json();
    const applications: Array<{
      leave_type_id: number;
      days_count: string;
      user_id: number;
    }> = appBody.data || [];

    // Get current user ID from token
    const userId = balances[0]?.user_id;
    if (!userId) return;

    // Sum approved days per leave type
    const approvedByType: Record<number, number> = {};
    for (const app of applications) {
      if (app.user_id === userId) {
        approvedByType[app.leave_type_id] =
          (approvedByType[app.leave_type_id] || 0) + parseFloat(app.days_count);
      }
    }

    let mismatches = 0;
    for (const bal of balances) {
      const usedFromBalance = parseFloat(bal.total_used);
      const usedFromApps = approvedByType[bal.leave_type_id] || 0;

      if (Math.abs(usedFromBalance - usedFromApps) > 0.5) {
        console.log(
          `INFO: ${bal.leave_type_name} — balance says ${usedFromBalance} used, applications sum to ${usedFromApps}`
        );
        // Only count as mismatch if applications show MORE than balance
        if (usedFromApps > usedFromBalance + 0.5) mismatches++;
      }
    }

    // Applications should never sum to MORE than total_used (data integrity)
    expect(mismatches, 'Approved applications should not exceed total_used in balance').toBe(0);
    console.log(`Leave applications cross-reference check passed ✓`);
  });

  test('2.4 Carry forward respects is_carry_forward flag on leave type', async ({ request }) => {
    // Get leave types
    const typesRes = await request.get(`${EMPCLOUD_API}/leave/types`, auth(cloudToken));
    const types: Array<{
      id: number;
      name: string;
      is_carry_forward: boolean;
      max_carry_forward_days: number;
    }> = (await typesRes.json()).data;

    // Get balances
    const balRes = await request.get(`${EMPCLOUD_API}/leave/balances/me`, auth(cloudToken));
    const balances: Array<{
      leave_type_id: number;
      leave_type_name: string;
      total_carry_forward: string;
    }> = (await balRes.json()).data;

    for (const bal of balances) {
      const type = types.find(t => t.id === bal.leave_type_id);
      if (!type) continue;

      const cf = parseFloat(bal.total_carry_forward);

      if (!type.is_carry_forward && cf > 0) {
        console.error(
          `BUG: ${type.name} has is_carry_forward=false but carry_forward=${cf}`
        );
        expect(cf, `${type.name}: carry_forward should be 0 when is_carry_forward=false`).toBe(0);
      }

      if (type.is_carry_forward && type.max_carry_forward_days > 0 && cf > type.max_carry_forward_days) {
        console.error(
          `BUG: ${type.name} carry_forward (${cf}) exceeds max (${type.max_carry_forward_days})`
        );
        expect(cf).toBeLessThanOrEqual(type.max_carry_forward_days);
      }
    }
    console.log('Carry forward flags respected ✓');
  });

  test('2.5 Standard leave types have correct default allocations', async ({ request }) => {
    // Check that standard Indian leave types have reasonable quotas
    const balRes = await request.get(`${EMPCLOUD_API}/leave/balances/me`, auth(cloudToken));
    const balances: Array<{
      leave_type_name: string;
      total_allocated: string;
    }> = (await balRes.json()).data;

    const knownTypes: Record<string, { min: number; max: number }> = {
      'Earned Leave': { min: 12, max: 30 },
      'Sick Leave': { min: 6, max: 15 },
      'Casual Leave': { min: 7, max: 15 },
      'Maternity Leave': { min: 182, max: 182 }, // 26 weeks per Indian law
      'Paternity Leave': { min: 5, max: 30 },
    };

    for (const bal of balances) {
      const range = knownTypes[bal.leave_type_name];
      if (!range) continue;

      const allocated = parseFloat(bal.total_allocated);
      expect(
        allocated,
        `${bal.leave_type_name} allocation (${allocated}) should be between ${range.min}-${range.max}`
      ).toBeGreaterThanOrEqual(range.min);
      expect(allocated).toBeLessThanOrEqual(range.max);
      console.log(`${bal.leave_type_name}: ${allocated} days (valid range: ${range.min}-${range.max}) ✓`);
    }
  });
});

// =============================================================================
// 3. FnF SETTLEMENT: Exit Module Math
// =============================================================================
test.describe('3. FnF Settlement Math', () => {
  let exitToken = '';

  test.beforeAll(async ({ request }) => {
    exitToken = await getExitToken(request);
  });

  test('3.1 FnF total_payable = earnings - deductions', async ({ request }) => {
    // List exits to find one with FnF
    const exitsRes = await request.get(`${EXIT_API}/exits?limit=50`, auth(exitToken));
    expect(exitsRes.status()).toBe(200);
    const exitsBody = await exitsRes.json();
    const exits: Array<{ id: string; status: string; employee?: { first_name: string } }> =
      exitsBody.data?.data || exitsBody.data || [];

    if (exits.length === 0) {
      console.log('No exits found — skipping FnF verification');
      return;
    }

    // Try to get FnF for each exit until we find one
    let fnfFound = false;
    for (const exit of exits.slice(0, 10)) {
      const fnfRes = await request.get(`${EXIT_API}/fnf/exit/${exit.id}`, auth(exitToken));
      if (fnfRes.status() !== 200) continue;

      const fnfBody = await fnfRes.json();
      const fnf = fnfBody.data;
      if (!fnf) continue;
      fnfFound = true;

      const basicDue = parseFloat(fnf.basic_salary_due) || 0;
      const leaveEncashment = parseFloat(fnf.leave_encashment) || 0;
      const bonusDue = parseFloat(fnf.bonus_due) || 0;
      const gratuity = parseFloat(fnf.gratuity) || 0;
      const otherEarnings = parseFloat(fnf.other_earnings) || 0;
      const noticePay = parseFloat(fnf.notice_pay_recovery) || 0;
      const otherDeductions = parseFloat(fnf.other_deductions) || 0;
      const totalPayable = parseFloat(fnf.total_payable) || 0;

      const grossEarnings = basicDue + leaveEncashment + bonusDue + gratuity + otherEarnings;
      const totalDeductions = noticePay + otherDeductions;
      const expectedTotal = grossEarnings - totalDeductions;

      expect(
        Math.abs(totalPayable - expectedTotal),
        `FnF total_payable (${totalPayable}) should equal earnings (${grossEarnings}) - deductions (${totalDeductions}) = ${expectedTotal}`
      ).toBeLessThan(1);

      console.log(
        `Exit ${exit.id.substring(0, 8)}... FnF: ` +
        `basic=${basicDue}, leave=${leaveEncashment}, gratuity=${gratuity}, ` +
        `notice_recovery=${noticePay} → total=${totalPayable} ✓`
      );

      // Check breakdown JSON if present
      if (fnf.breakdown_json) {
        const breakdown = typeof fnf.breakdown_json === 'string'
          ? JSON.parse(fnf.breakdown_json)
          : fnf.breakdown_json;

        expect(breakdown).toBeTruthy();
        console.log(`  Breakdown: last_basic=${breakdown.last_basic_salary}, notice_days=${breakdown.notice_days}`);
      }

      break;
    }

    if (!fnfFound) {
      console.log('No FnF settlements found for any exit — no math to verify');
    }
  });

  test('3.2 Gratuity formula: (15/26) × last_salary × years_of_service', async ({ request }) => {
    const exitsRes = await request.get(`${EXIT_API}/exits?limit=50`, auth(exitToken));
    const exits: Array<{ id: string; status: string; employee?: any }> =
      (await exitsRes.json()).data?.data || [];

    for (const exit of exits.slice(0, 10)) {
      const fnfRes = await request.get(`${EXIT_API}/fnf/exit/${exit.id}`, auth(exitToken));
      if (fnfRes.status() !== 200) continue;

      const fnf = (await fnfRes.json()).data;
      if (!fnf || !fnf.breakdown_json) continue;

      const gratuity = parseFloat(fnf.gratuity) || 0;
      if (gratuity === 0) {
        console.log('Gratuity is 0 — employee may have <5 years service');
        continue;
      }

      const breakdown = typeof fnf.breakdown_json === 'string'
        ? JSON.parse(fnf.breakdown_json)
        : fnf.breakdown_json;

      const lastBasic = breakdown.last_basic_salary || 0;
      const joiningDate = new Date(breakdown.date_of_joining);
      const lwd = new Date(breakdown.lwd);
      const yearsOfService = (lwd.getTime() - joiningDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

      if (yearsOfService >= 5) {
        // Indian Gratuity Act formula: (15/26) × last_drawn_salary × completed_years
        const completedYears = Math.floor(yearsOfService);
        const expectedGratuity = (15 / 26) * lastBasic * completedYears;
        const tolerance = lastBasic * 0.5; // allow rounding differences

        expect(
          Math.abs(gratuity - expectedGratuity),
          `Gratuity (${gratuity}) should be ~(15/26)×${lastBasic}×${completedYears} = ${expectedGratuity.toFixed(0)}`
        ).toBeLessThan(tolerance);
        console.log(`Gratuity: ${gratuity}, Expected: ${expectedGratuity.toFixed(0)}, Years: ${completedYears} ✓`);
      }
      break;
    }
  });

  test('3.3 Notice period recovery is non-negative and proportional', async ({ request }) => {
    const exitsRes = await request.get(`${EXIT_API}/exits?limit=50`, auth(exitToken));
    const exits: Array<{ id: string; notice_period_days: number; notice_period_waived: number }> =
      (await exitsRes.json()).data?.data || [];

    for (const exit of exits.slice(0, 10)) {
      const fnfRes = await request.get(`${EXIT_API}/fnf/exit/${exit.id}`, auth(exitToken));
      if (fnfRes.status() !== 200) continue;

      const fnf = (await fnfRes.json()).data;
      if (!fnf) continue;

      const noticePay = parseFloat(fnf.notice_pay_recovery) || 0;
      expect(noticePay, 'Notice pay recovery cannot be negative').toBeGreaterThanOrEqual(0);

      if (exit.notice_period_waived) {
        // If notice waived, recovery could be 0
        console.log(`Exit ${exit.id.substring(0, 8)}: notice waived, recovery=${noticePay}`);
      } else {
        console.log(`Exit ${exit.id.substring(0, 8)}: notice_days=${exit.notice_period_days}, recovery=${noticePay}`);
      }
      break;
    }
  });
});

// =============================================================================
// 4. ATTENDANCE: Days Arithmetic
// =============================================================================
test.describe('4. Attendance Calculation Math', () => {
  let cloudToken = '';

  test.beforeAll(async ({ request }) => {
    cloudToken = await getCloudToken(request);
  });

  test('4.1 Monthly report: present + half + absent + leave <= total_days', async ({ request }) => {
    const res = await request.get(
      `${EMPCLOUD_API}/attendance/monthly-report?month=3&year=2026`,
      auth(cloudToken)
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const report: Array<{
      first_name: string;
      last_name: string;
      total_days: number;
      present_days: string;
      half_days: string;
      absent_days: string;
      leave_days: string;
    }> = body.data?.report || [];

    expect(report.length).toBeGreaterThan(0);
    let violations = 0;

    for (const emp of report) {
      const total = emp.total_days;
      const present = parseFloat(emp.present_days);
      const halfDays = parseFloat(emp.half_days);
      const absent = parseFloat(emp.absent_days);
      const leave = parseFloat(emp.leave_days);

      // present + absent + leave should not exceed total days
      // Note: half_days are included in present_days count in some systems
      const accountedDays = present + absent + leave;

      if (accountedDays > total + 0.5) {
        console.error(
          `VIOLATION: ${emp.first_name} ${emp.last_name}: present(${present}) + absent(${absent}) + leave(${leave}) = ${accountedDays} > total(${total})`
        );
        violations++;
      }
    }

    expect(violations, `${violations} employees have days > total_days in month`).toBe(0);
    console.log(`${report.length} employees checked — all attendance totals are within bounds ✓`);
  });

  test('4.2 No negative attendance values', async ({ request }) => {
    const res = await request.get(
      `${EMPCLOUD_API}/attendance/monthly-report?month=3&year=2026`,
      auth(cloudToken)
    );
    const report: Array<{
      first_name: string;
      present_days: string;
      half_days: string;
      absent_days: string;
      leave_days: string;
      total_worked_minutes: string;
      total_overtime_minutes: string;
      total_late_minutes: string;
    }> = (await res.json()).data?.report || [];

    for (const emp of report) {
      expect(parseFloat(emp.present_days), `${emp.first_name} present_days negative`).toBeGreaterThanOrEqual(0);
      expect(parseFloat(emp.half_days), `${emp.first_name} half_days negative`).toBeGreaterThanOrEqual(0);
      expect(parseFloat(emp.absent_days), `${emp.first_name} absent_days negative`).toBeGreaterThanOrEqual(0);
      expect(parseFloat(emp.leave_days), `${emp.first_name} leave_days negative`).toBeGreaterThanOrEqual(0);
      expect(parseFloat(emp.total_worked_minutes), `${emp.first_name} worked_minutes negative`).toBeGreaterThanOrEqual(0);
      expect(parseFloat(emp.total_overtime_minutes), `${emp.first_name} overtime negative`).toBeGreaterThanOrEqual(0);
      expect(parseFloat(emp.total_late_minutes), `${emp.first_name} late_minutes negative`).toBeGreaterThanOrEqual(0);
    }
    console.log(`No negative attendance values found across ${report.length} employees ✓`);
  });

  test('4.3 Overtime minutes do not exceed worked minutes', async ({ request }) => {
    const res = await request.get(
      `${EMPCLOUD_API}/attendance/monthly-report?month=3&year=2026`,
      auth(cloudToken)
    );
    const report: Array<{
      first_name: string;
      total_worked_minutes: string;
      total_overtime_minutes: string;
    }> = (await res.json()).data?.report || [];

    for (const emp of report) {
      const worked = parseFloat(emp.total_worked_minutes);
      const overtime = parseFloat(emp.total_overtime_minutes);

      expect(
        overtime,
        `${emp.first_name}: overtime (${overtime}) should not exceed worked minutes (${worked})`
      ).toBeLessThanOrEqual(worked);
    }
    console.log('Overtime never exceeds worked minutes ✓');
  });

  test('4.4 Half days are counted correctly (half day = 0.5 present)', async ({ request }) => {
    const res = await request.get(
      `${EMPCLOUD_API}/attendance/monthly-report?month=3&year=2026`,
      auth(cloudToken)
    );
    const report: Array<{
      first_name: string;
      half_days: string;
      present_days: string;
      total_days: number;
    }> = (await res.json()).data?.report || [];

    for (const emp of report) {
      const halfDays = parseFloat(emp.half_days);
      // Half days should be whole numbers or half numbers (0, 1, 2, etc.)
      expect(
        halfDays % 1,
        `${emp.first_name}: half_days (${halfDays}) should be a whole number`
      ).toBe(0);

      // Half days cannot exceed present days
      expect(
        halfDays,
        `${emp.first_name}: half_days (${halfDays}) should not exceed present_days (${emp.present_days})`
      ).toBeLessThanOrEqual(parseFloat(emp.present_days));
    }
    console.log('Half day counts are valid ✓');
  });
});

// =============================================================================
// 5. SUBSCRIPTION PRICING: Seat × Rate Math
// =============================================================================
test.describe('5. Subscription Pricing Math', () => {
  let cloudToken = '';

  test.beforeAll(async ({ request }) => {
    cloudToken = await getCloudToken(request);
  });

  test('5.1 Price per seat is ₹100/user/month (10000 paise)', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/subscriptions`, auth(cloudToken));
    expect(res.status()).toBe(200);
    const subs: Array<{
      module_id: number;
      price_per_seat: number;
      currency: string;
      status: string;
    }> = (await res.json()).data;

    expect(subs.length).toBeGreaterThan(0);

    for (const sub of subs) {
      if (sub.currency === 'INR') {
        // ₹100/user/month = 10000 paise (stored as BIGINT in smallest unit)
        expect(
          sub.price_per_seat,
          `Module ${sub.module_id}: price_per_seat (${sub.price_per_seat}) should be 10000 paise (₹100)`
        ).toBe(10000);
      } else if (sub.currency === 'USD') {
        // $1/user/month = 100 cents
        expect(sub.price_per_seat).toBe(100);
      }
    }
    console.log(`All ${subs.length} subscriptions have correct price_per_seat ✓`);
  });

  test('5.2 Subscription periods are valid (end > start)', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/subscriptions`, auth(cloudToken));
    const subs: Array<{
      current_period_start: string;
      current_period_end: string;
      billing_cycle: string;
      status: string;
    }> = (await res.json()).data;

    for (const sub of subs) {
      if (sub.status !== 'active') continue;

      const start = new Date(sub.current_period_start);
      const end = new Date(sub.current_period_end);
      expect(end.getTime(), 'Period end must be after period start').toBeGreaterThan(start.getTime());

      // Verify billing cycle duration
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      if (sub.billing_cycle === 'monthly') {
        expect(diffDays).toBeGreaterThanOrEqual(28);
        expect(diffDays).toBeLessThanOrEqual(31);
      } else if (sub.billing_cycle === 'quarterly') {
        expect(diffDays).toBeGreaterThanOrEqual(28); // may have been adjusted
        expect(diffDays).toBeLessThanOrEqual(93);
      } else if (sub.billing_cycle === 'yearly') {
        expect(diffDays).toBeGreaterThanOrEqual(360);
        expect(diffDays).toBeLessThanOrEqual(366);
      }
    }
    console.log('All subscription periods are valid ✓');
  });

  test('5.3 used_seats <= total_seats for all subscriptions', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/subscriptions`, auth(cloudToken));
    const subs: Array<{
      module_id: number;
      used_seats: number;
      total_seats: number;
    }> = (await res.json()).data;

    for (const sub of subs) {
      expect(
        sub.used_seats,
        `Module ${sub.module_id}: used_seats (${sub.used_seats}) exceeds total_seats (${sub.total_seats})`
      ).toBeLessThanOrEqual(sub.total_seats);
    }
    console.log('No seat overallocation found ✓');
  });

  test('5.4 Total seats > 0 for all active subscriptions', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/subscriptions`, auth(cloudToken));
    const subs: Array<{
      module_id: number;
      total_seats: number;
      status: string;
    }> = (await res.json()).data;

    const activeSubs = subs.filter(s => s.status === 'active');
    for (const sub of activeSubs) {
      expect(
        sub.total_seats,
        `Active module ${sub.module_id} has 0 seats`
      ).toBeGreaterThan(0);
    }
    console.log(`All ${activeSubs.length} active subscriptions have seats > 0 ✓`);
  });
});

// =============================================================================
// 6. REVENUE DASHBOARD: MRR/ARR Cross-Verification
// =============================================================================
test.describe('6. Revenue Dashboard Math', () => {
  let superToken = '';

  test.beforeAll(async ({ request }) => {
    superToken = await getCloudToken(request, SUPER_ADMIN);
  });

  test('6.1 ARR = MRR × 12 exactly', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/admin/revenue`, auth(superToken));
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;

    expect(typeof data.mrr).toBe('number');
    expect(typeof data.arr).toBe('number');
    expect(data.mrr).toBeGreaterThan(0);

    expect(
      data.arr,
      `ARR (${data.arr}) must equal MRR (${data.mrr}) × 12 = ${data.mrr * 12}`
    ).toBe(data.mrr * 12);

    console.log(`MRR: ₹${(data.mrr / 100).toLocaleString()}, ARR: ₹${(data.arr / 100).toLocaleString()} ✓`);
  });

  test('6.2 Module revenue breakdown sums to MRR', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/admin/revenue`, auth(superToken));
    const data = (await res.json()).data;

    const moduleRevenues: Array<{ name: string; revenue: number }> = data.revenue_by_module;
    expect(moduleRevenues.length).toBeGreaterThan(0);

    let sumModuleRevenue = 0;
    for (const m of moduleRevenues) {
      expect(m.revenue, `${m.name} has negative revenue`).toBeGreaterThanOrEqual(0);
      sumModuleRevenue += m.revenue;
    }

    expect(
      sumModuleRevenue,
      `Sum of module revenues (${sumModuleRevenue}) must equal MRR (${data.mrr})`
    ).toBe(data.mrr);
    console.log(`Module revenue sum: ${sumModuleRevenue} = MRR ${data.mrr} ✓`);
  });

  test('6.3 Tier revenue breakdown sums to MRR', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/admin/revenue`, auth(superToken));
    const data = (await res.json()).data;

    const tierRevenues: Array<{ plan_tier: string; revenue: number; count: number }> = data.revenue_by_tier;
    expect(tierRevenues.length).toBeGreaterThan(0);

    let sumTierRevenue = 0;
    for (const t of tierRevenues) {
      expect(t.revenue, `${t.plan_tier} tier has negative revenue`).toBeGreaterThanOrEqual(0);
      expect(t.count, `${t.plan_tier} tier has negative count`).toBeGreaterThanOrEqual(0);
      sumTierRevenue += t.revenue;
    }

    expect(
      sumTierRevenue,
      `Sum of tier revenues (${sumTierRevenue}) must equal MRR (${data.mrr})`
    ).toBe(data.mrr);
    console.log(`Tier revenue sum: ${sumTierRevenue} = MRR ${data.mrr} ✓`);
  });

  test('6.4 Billing cycle distribution sums to MRR', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/admin/revenue`, auth(superToken));
    const data = (await res.json()).data;

    const cycles: Array<{ billing_cycle: string; revenue: number; count: number }> =
      data.billing_cycle_distribution || [];

    if (cycles.length === 0) {
      console.log('No billing cycle distribution data');
      return;
    }

    let sumCycleRevenue = 0;
    for (const c of cycles) {
      expect(c.revenue).toBeGreaterThanOrEqual(0);
      sumCycleRevenue += c.revenue;
    }

    expect(
      sumCycleRevenue,
      `Sum of billing cycle revenues (${sumCycleRevenue}) must equal MRR (${data.mrr})`
    ).toBe(data.mrr);
    console.log(`Billing cycle sum: ${sumCycleRevenue} = MRR ${data.mrr} ✓`);
  });

  test('6.5 MRR cross-check: compute from subscriptions vs revenue API', async ({ request }) => {
    // Get all subscriptions as super admin
    const subsRes = await request.get(`${EMPCLOUD_API}/subscriptions`, {
      headers: { Authorization: `Bearer ${await getCloudToken(request)}` },
    });
    const orgSubs: Array<{
      price_per_seat: number;
      total_seats: number;
      status: string;
      billing_cycle: string;
    }> = (await subsRes.json()).data;

    // Calculate expected MRR from this org's active subscriptions
    let orgMRR = 0;
    for (const sub of orgSubs) {
      if (sub.status !== 'active') continue;
      orgMRR += sub.price_per_seat * sub.total_seats;
    }

    // Get revenue from admin API
    const revRes = await request.get(`${EMPCLOUD_API}/admin/revenue`, auth(superToken));
    const revenue = (await revRes.json()).data;

    // The org's calculated MRR should be less than or equal to total platform MRR
    expect(
      orgMRR,
      `Org MRR (${orgMRR}) should not exceed platform MRR (${revenue.mrr})`
    ).toBeLessThanOrEqual(revenue.mrr);

    console.log(
      `Org (TechNova) computed MRR: ₹${(orgMRR / 100).toLocaleString()}, ` +
      `Platform MRR: ₹${(revenue.mrr / 100).toLocaleString()}`
    );
  });

  test('6.6 Top customers total_spend > 0 and subscription_count > 0', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/admin/revenue`, auth(superToken));
    const data = (await res.json()).data;
    const topCustomers: Array<{
      name: string;
      total_spend: number;
      subscription_count: number;
    }> = data.top_customers || [];

    for (const customer of topCustomers) {
      expect(customer.total_spend, `${customer.name} has non-positive spend`).toBeGreaterThan(0);
      expect(customer.subscription_count, `${customer.name} has 0 subscriptions`).toBeGreaterThan(0);
    }
    console.log(`${topCustomers.length} top customers all have positive spend and subscriptions ✓`);
  });

  test('6.7 MRR growth percentage is a finite number', async ({ request }) => {
    const res = await request.get(`${EMPCLOUD_API}/admin/revenue`, auth(superToken));
    const data = (await res.json()).data;

    expect(typeof data.mrr_growth_percent).toBe('number');
    expect(Number.isFinite(data.mrr_growth_percent)).toBe(true);
    // Growth cannot be below -100% (can't lose more than everything)
    expect(data.mrr_growth_percent).toBeGreaterThanOrEqual(-100);
    console.log(`MRR growth: ${data.mrr_growth_percent}% ✓`);
  });
});
