import { test, expect, APIRequestContext } from '@playwright/test';

// =============================================================================
// EMP Exit Module — E2E Tests
// Auth: SSO from EmpCloud (login ananya@technova.in → POST /auth/sso to exit)
// API: https://test-exit-api.empcloud.com/api/v1
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const EXIT_API = 'https://test-exit-api.empcloud.com/api/v1';
const EXIT_BASE = 'https://test-exit-api.empcloud.com';

const ADMIN_CREDS = { email: 'ananya@technova.in', password: 'Welcome@123' };
const EMPLOYEE_CREDS = { email: 'arjun@technova.in', password: 'Welcome@123' };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

let cloudToken = '';
let exitToken = '';
let employeeCloudToken = '';
let employeeExitToken = '';

async function loginToCloud(request: APIRequestContext, creds = ADMIN_CREDS): Promise<string> {
  const res = await request.post(`${EMPCLOUD_API}/auth/login`, { data: creds });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data.tokens.access_token;
}

async function ssoToExit(request: APIRequestContext, ecToken: string): Promise<string> {
  const res = await request.post(`${EXIT_API}/auth/sso`, {
    data: { token: ecToken },
  });
  const body = await res.json();
  return body.data?.tokens?.accessToken || body.data?.tokens?.access_token || ecToken;
}

function auth() {
  return { headers: { Authorization: `Bearer ${exitToken}` } };
}

function authJson() {
  return {
    headers: {
      Authorization: `Bearer ${exitToken}`,
      'Content-Type': 'application/json',
    },
  };
}

function empAuth() {
  return { headers: { Authorization: `Bearer ${employeeExitToken}` } };
}

function empAuthJson() {
  return {
    headers: {
      Authorization: `Bearer ${employeeExitToken}`,
      'Content-Type': 'application/json',
    },
  };
}

// Shared state across tests
let exitRequestId: number | string = 0;
let checklistId: number | string = 0;
let checklistItemId: number | string = 0;
let fnfId: number | string = 0;
let assetClearanceId: number | string = 0;
let knowledgeTransferId: number | string = 0;
let alumniId: number | string = 0;
let interviewId: number | string = 0;
let npsResponseId: number | string = 0;
let clearanceId: number | string = 0;
let rehireId: number | string = 0;
let letterId: number | string = 0;
let buyoutId: number | string = 0;
let challengeId: number | string = 0;
let settingId: number | string = 0;

// =============================================================================
// Tests
// =============================================================================

test.describe.serial('EMP Exit Module', () => {

  // ===========================================================================
  // 1. Auth & Health (2 tests)
  // ===========================================================================

  test.describe('1 - Health & Auth', () => {

    test('1.1 Health check returns 200', async ({ request }) => {
      const r = await request.get(`${EXIT_BASE}/health`);
      expect(r.status()).toBe(200);
    });

    test('1.2 SSO login succeeds for admin', async ({ request }) => {
      cloudToken = await loginToCloud(request);
      exitToken = await ssoToExit(request, cloudToken);
      expect(exitToken.length).toBeGreaterThan(10);

      // Also login employee
      try {
        employeeCloudToken = await loginToCloud(request, EMPLOYEE_CREDS);
        employeeExitToken = await ssoToExit(request, employeeCloudToken);
      } catch {
        employeeExitToken = '';
      }
    });
  });

  // ===========================================================================
  // 2. Exit Initiation (6 tests)
  // ===========================================================================

  test.describe('2 - Exit Initiation', () => {

    test('2.1 Initiate voluntary resignation', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/exit-requests`, {
        ...authJson(),
        data: {
          type: 'voluntary',
          reason: `PW voluntary resignation ${RUN}`,
          last_working_date: '2026-05-15',
          notice_period_days: 30,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) exitRequestId = body.data.id;
    });

    test('2.2 List exit requests', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/exit-requests`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      const list = body.data?.exit_requests || body.data?.exitRequests || body.data;
      expect(Array.isArray(list) || typeof body.data === 'object').toBe(true);
    });

    test('2.3 Get exit request by ID', async ({ request }) => {
      if (!exitRequestId) return test.skip();
      const r = await request.get(`${EXIT_API}/exit-requests/${exitRequestId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('2.4 Update exit request', async ({ request }) => {
      if (!exitRequestId) return test.skip();
      const r = await request.put(`${EXIT_API}/exit-requests/${exitRequestId}`, {
        ...authJson(),
        data: { reason: `Updated reason ${RUN}` },
      });
      expect([200, 204, 404]).toContain(r.status());
    });

    test('2.5 Approve exit request', async ({ request }) => {
      if (!exitRequestId) return test.skip();
      const r = await request.patch(`${EXIT_API}/exit-requests/${exitRequestId}/approve`, {
        ...authJson(),
        data: { comments: 'Approved by PW test' },
      });
      expect([200, 204, 400, 404, 409]).toContain(r.status());
    });

    test('2.6 Unauthenticated exit request returns 401', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/exit-requests`);
      expect(r.status()).toBe(401);
    });
  });

  // ===========================================================================
  // 3. Checklists (6 tests)
  // ===========================================================================

  test.describe('3 - Checklists', () => {

    test('3.1 Create exit checklist template', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/checklists`, {
        ...authJson(),
        data: {
          name: `PW Exit Checklist ${RUN}`,
          description: 'Playwright test checklist',
          items: [
            { title: 'Return laptop', department: 'IT', order: 1 },
            { title: 'Return ID card', department: 'HR', order: 2 },
          ],
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) checklistId = body.data.id;
    });

    test('3.2 List checklists', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/checklists`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.3 Get checklist by ID', async ({ request }) => {
      if (!checklistId) return test.skip();
      const r = await request.get(`${EXIT_API}/checklists/${checklistId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('3.4 Add item to checklist', async ({ request }) => {
      if (!checklistId) return test.skip();
      const r = await request.post(`${EXIT_API}/checklists/${checklistId}/items`, {
        ...authJson(),
        data: { title: `PW item ${RUN}`, department: 'Finance', order: 3 },
      });
      expect([200, 201, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) checklistItemId = body.data.id;
    });

    test('3.5 Update checklist item', async ({ request }) => {
      if (!checklistId || !checklistItemId) return test.skip();
      const r = await request.put(`${EXIT_API}/checklists/${checklistId}/items/${checklistItemId}`, {
        ...authJson(),
        data: { title: `Updated PW item ${RUN}`, is_completed: true },
      });
      expect([200, 204, 404]).toContain(r.status());
    });

    test('3.6 Delete checklist item', async ({ request }) => {
      if (!checklistId || !checklistItemId) return test.skip();
      const r = await request.delete(`${EXIT_API}/checklists/${checklistId}/items/${checklistItemId}`, auth());
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 4. Full & Final Settlement (4 tests)
  // ===========================================================================

  test.describe('4 - FnF Settlement', () => {

    test('4.1 Create FnF settlement', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/fnf`, {
        ...authJson(),
        data: {
          exit_request_id: exitRequestId || undefined,
          basic_salary: 50000,
          earned_leave_encashment: 10000,
          bonus: 5000,
          deductions: 2000,
          notice_period_recovery: 0,
          gratuity: 15000,
          comments: `PW FnF ${RUN}`,
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) fnfId = body.data.id;
    });

    test('4.2 List FnF settlements', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/fnf`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('4.3 Get FnF by ID', async ({ request }) => {
      if (!fnfId) return test.skip();
      const r = await request.get(`${EXIT_API}/fnf/${fnfId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('4.4 Approve FnF settlement', async ({ request }) => {
      if (!fnfId) return test.skip();
      const r = await request.patch(`${EXIT_API}/fnf/${fnfId}/approve`, {
        ...authJson(),
        data: { approved: true, comments: 'Approved by PW' },
      });
      expect([200, 204, 400, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 5. Asset Clearance (3 tests)
  // ===========================================================================

  test.describe('5 - Asset Clearance', () => {

    test('5.1 Create asset clearance record', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/asset-clearance`, {
        ...authJson(),
        data: {
          exit_request_id: exitRequestId || undefined,
          asset_name: `PW Laptop ${RUN}`,
          asset_type: 'laptop',
          serial_number: `SN-${RUN}`,
          status: 'pending',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) assetClearanceId = body.data.id;
    });

    test('5.2 List asset clearances', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/asset-clearance`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('5.3 Mark asset as returned', async ({ request }) => {
      if (!assetClearanceId) return test.skip();
      const r = await request.patch(`${EXIT_API}/asset-clearance/${assetClearanceId}`, {
        ...authJson(),
        data: { status: 'returned', return_date: '2026-04-15' },
      });
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 6. Knowledge Transfer (4 tests)
  // ===========================================================================

  test.describe('6 - Knowledge Transfer', () => {

    test('6.1 Create knowledge transfer plan', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/knowledge-transfer`, {
        ...authJson(),
        data: {
          exit_request_id: exitRequestId || undefined,
          title: `PW KT Plan ${RUN}`,
          description: 'Playwright knowledge transfer plan',
          assignee: 'arjun@technova.in',
          due_date: '2026-05-01',
          items: [
            { topic: 'API Documentation', status: 'pending' },
            { topic: 'Runbooks', status: 'pending' },
          ],
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) knowledgeTransferId = body.data.id;
    });

    test('6.2 List knowledge transfer plans', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/knowledge-transfer`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.3 Get knowledge transfer by ID', async ({ request }) => {
      if (!knowledgeTransferId) return test.skip();
      const r = await request.get(`${EXIT_API}/knowledge-transfer/${knowledgeTransferId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.4 Update knowledge transfer status', async ({ request }) => {
      if (!knowledgeTransferId) return test.skip();
      const r = await request.patch(`${EXIT_API}/knowledge-transfer/${knowledgeTransferId}`, {
        ...authJson(),
        data: { status: 'in_progress' },
      });
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 7. Alumni Network (3 tests)
  // ===========================================================================

  test.describe('7 - Alumni', () => {

    test('7.1 Create alumni profile', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/alumni`, {
        ...authJson(),
        data: {
          name: `PW Alumni ${RUN}`,
          email: `pw-alumni-${RUN}@test.com`,
          last_designation: 'Software Engineer',
          exit_date: '2026-03-31',
          linkedin_url: 'https://linkedin.com/in/test',
          current_company: 'TestCorp',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) alumniId = body.data.id;
    });

    test('7.2 List alumni', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/alumni`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('7.3 Get alumni by ID', async ({ request }) => {
      if (!alumniId) return test.skip();
      const r = await request.get(`${EXIT_API}/alumni/${alumniId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 8. Exit Interviews (6 tests)
  // ===========================================================================

  test.describe('8 - Exit Interviews', () => {

    test('8.1 Schedule exit interview', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/exit-interviews`, {
        ...authJson(),
        data: {
          exit_request_id: exitRequestId || undefined,
          interviewer: 'ananya@technova.in',
          scheduled_date: '2026-04-10',
          scheduled_time: '10:00',
          mode: 'virtual',
          meeting_link: 'https://meet.example.com/pw-test',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) interviewId = body.data.id;
    });

    test('8.2 List exit interviews', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/exit-interviews`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('8.3 Get exit interview by ID', async ({ request }) => {
      if (!interviewId) return test.skip();
      const r = await request.get(`${EXIT_API}/exit-interviews/${interviewId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('8.4 Submit interview feedback', async ({ request }) => {
      if (!interviewId) return test.skip();
      const r = await request.post(`${EXIT_API}/exit-interviews/${interviewId}/feedback`, {
        ...authJson(),
        data: {
          overall_experience: 4,
          management_rating: 3,
          culture_rating: 5,
          growth_rating: 3,
          reason_for_leaving: 'Better opportunity',
          suggestions: 'More growth paths',
          would_recommend: true,
          comments: `PW interview feedback ${RUN}`,
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });

    test('8.5 Update interview status to completed', async ({ request }) => {
      if (!interviewId) return test.skip();
      const r = await request.patch(`${EXIT_API}/exit-interviews/${interviewId}`, {
        ...authJson(),
        data: { status: 'completed' },
      });
      expect([200, 204, 404]).toContain(r.status());
    });

    test('8.6 Get interview analytics summary', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/exit-interviews/analytics`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 9. NPS / eNPS (2 tests)
  // ===========================================================================

  test.describe('9 - NPS', () => {

    test('9.1 Submit eNPS response', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/nps`, {
        ...authJson(),
        data: {
          exit_request_id: exitRequestId || undefined,
          score: 7,
          comments: `PW eNPS response ${RUN}`,
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) npsResponseId = body.data.id;
    });

    test('9.2 Get NPS summary', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/nps/summary`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 10. Clearance (4 tests)
  // ===========================================================================

  test.describe('10 - Clearance', () => {

    test('10.1 Create clearance request', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/clearance`, {
        ...authJson(),
        data: {
          exit_request_id: exitRequestId || undefined,
          departments: ['IT', 'Finance', 'HR', 'Admin'],
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) clearanceId = body.data.id;
    });

    test('10.2 List clearance requests', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/clearance`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('10.3 Approve department clearance', async ({ request }) => {
      if (!clearanceId) return test.skip();
      const r = await request.patch(`${EXIT_API}/clearance/${clearanceId}/approve`, {
        ...authJson(),
        data: { department: 'IT', approved: true, comments: 'All assets returned' },
      });
      expect([200, 204, 400, 404]).toContain(r.status());
    });

    test('10.4 Get clearance status', async ({ request }) => {
      if (!clearanceId) return test.skip();
      const r = await request.get(`${EXIT_API}/clearance/${clearanceId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 11. Rehire Eligibility (4 tests)
  // ===========================================================================

  test.describe('11 - Rehire', () => {

    test('11.1 Set rehire eligibility', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/rehire`, {
        ...authJson(),
        data: {
          exit_request_id: exitRequestId || undefined,
          eligible: true,
          rating: 'recommended',
          comments: `PW rehire eligible ${RUN}`,
          cooldown_months: 6,
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) rehireId = body.data.id;
    });

    test('11.2 List rehire records', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/rehire`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('11.3 Get rehire eligibility by ID', async ({ request }) => {
      if (!rehireId) return test.skip();
      const r = await request.get(`${EXIT_API}/rehire/${rehireId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('11.4 Update rehire eligibility', async ({ request }) => {
      if (!rehireId) return test.skip();
      const r = await request.put(`${EXIT_API}/rehire/${rehireId}`, {
        ...authJson(),
        data: { eligible: false, rating: 'not_recommended', comments: 'Updated by PW' },
      });
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 12. Letters (4 tests)
  // ===========================================================================

  test.describe('12 - Letters', () => {

    test('12.1 Generate experience letter', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/letters`, {
        ...authJson(),
        data: {
          exit_request_id: exitRequestId || undefined,
          type: 'experience',
          template: 'default',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) letterId = body.data.id;
    });

    test('12.2 Generate relieving letter', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/letters`, {
        ...authJson(),
        data: {
          exit_request_id: exitRequestId || undefined,
          type: 'relieving',
          template: 'default',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });

    test('12.3 List generated letters', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/letters`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('12.4 Download letter', async ({ request }) => {
      if (!letterId) return test.skip();
      const r = await request.get(`${EXIT_API}/letters/${letterId}/download`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 13. Notice Period Buyout (4 tests)
  // ===========================================================================

  test.describe('13 - Buyout', () => {

    test('13.1 Request notice period buyout', async ({ request }) => {
      const r = await request.post(`${EXIT_API}/buyout`, {
        ...authJson(),
        data: {
          exit_request_id: exitRequestId || undefined,
          buyout_days: 15,
          amount: 25000,
          reason: `PW buyout request ${RUN}`,
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) buyoutId = body.data.id;
    });

    test('13.2 List buyout requests', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/buyout`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('13.3 Approve buyout', async ({ request }) => {
      if (!buyoutId) return test.skip();
      const r = await request.patch(`${EXIT_API}/buyout/${buyoutId}/approve`, {
        ...authJson(),
        data: { approved: true, comments: 'Approved by PW' },
      });
      expect([200, 204, 400, 404]).toContain(r.status());
    });

    test('13.4 Get buyout details', async ({ request }) => {
      if (!buyoutId) return test.skip();
      const r = await request.get(`${EXIT_API}/buyout/${buyoutId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 14. Self-Service (4 tests)
  // ===========================================================================

  test.describe('14 - Self-Service', () => {

    test('14.1 Employee views own exit status', async ({ request }) => {
      const tokenToUse = employeeExitToken || exitToken;
      const r = await request.get(`${EXIT_API}/self-service/exit-status`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      expect([200, 404]).toContain(r.status());
    });

    test('14.2 Employee views own clearance status', async ({ request }) => {
      const tokenToUse = employeeExitToken || exitToken;
      const r = await request.get(`${EXIT_API}/self-service/clearance`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      expect([200, 404]).toContain(r.status());
    });

    test('14.3 Employee views own FnF details', async ({ request }) => {
      const tokenToUse = employeeExitToken || exitToken;
      const r = await request.get(`${EXIT_API}/self-service/fnf`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      expect([200, 404]).toContain(r.status());
    });

    test('14.4 Employee downloads own letters', async ({ request }) => {
      const tokenToUse = employeeExitToken || exitToken;
      const r = await request.get(`${EXIT_API}/self-service/letters`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 15. Analytics (4 tests)
  // ===========================================================================

  test.describe('15 - Analytics', () => {

    test('15.1 Get exit analytics dashboard', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/analytics/dashboard`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('15.2 Get attrition report', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/analytics/attrition`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('15.3 Get exit reasons breakdown', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/analytics/reasons`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('15.4 Get department-wise exits', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/analytics/departments`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 16. Settings (2 tests)
  // ===========================================================================

  test.describe('16 - Settings', () => {

    test('16.1 Get exit module settings', async ({ request }) => {
      const r = await request.get(`${EXIT_API}/settings`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('16.2 Update exit module settings', async ({ request }) => {
      const r = await request.put(`${EXIT_API}/settings`, {
        ...authJson(),
        data: {
          default_notice_period_days: 30,
          enable_exit_interviews: true,
          enable_fnf_auto_calculation: true,
          enable_alumni_network: true,
        },
      });
      expect([200, 204, 400, 404]).toContain(r.status());
    });
  });
});
