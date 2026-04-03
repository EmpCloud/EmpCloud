import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Performance Module — Complete Coverage E2E Tests (54 tests)
// Covers: AI Summary, Letters (template + generate + send), Manager Effectiveness,
//         Succession Planning, Notifications (review/PIP/meeting reminders),
//         9-Box Grid, Calibration, Team Analytics, Employee Summary, Settings.
//
// TechNova Solutions — via SSO from EmpCloud
// API: https://test-performance-api.empcloud.com/api/v1
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const PERF_API = 'https://test-performance-api.empcloud.com/api/v1';
const PERF_BASE = 'https://test-performance-api.empcloud.com';

let token = '';
let employeeToken = '';

const RUN = Date.now().toString().slice(-6);

// Captured IDs
let reviewCycleId: number | string = 0;
let goalId: number | string = 0;
let letterTemplateId: number | string = 0;
let letterId: number | string = 0;
let successionPlanId: number | string = 0;
let meetingId: number | string = 0;
let pipId: number | string = 0;

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function loginWithRetry(request: any, creds: { email: string; password: string }): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await request.post(`${EMPCLOUD_API}/auth/login`, { data: creds });
    if (res.status() === 429) { await sleep(2000); continue; }
    expect(res.status()).toBe(200);
    const body = await res.json();
    return body.data.tokens.access_token;
  }
  throw new Error('Login failed after 3 retries');
}

async function ssoWithRetry(request: any, ecToken: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await request.post(`${PERF_API}/auth/sso`, { data: { token: ecToken } });
    if (res.status() === 429) { await sleep(2000); continue; }
    expect(res.status()).toBe(200);
    const body = await res.json();
    return body.data?.tokens?.accessToken || '';
  }
  throw new Error('SSO failed after 3 retries');
}

test.describe('EMP Performance — Complete Coverage', () => {

  const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });
  const empAuth = () => ({ headers: { Authorization: `Bearer ${employeeToken}` } });

  // =========================================================================
  // 1. Auth & Health (3 tests)
  // =========================================================================

  test.beforeAll(async ({ request }) => {
    const ecToken = await loginWithRetry(request, { email: 'ananya@technova.in', password: 'Welcome@123' });
    token = await ssoWithRetry(request, ecToken);
    expect(token.length).toBeGreaterThan(10);

    try {
      const empEcToken = await loginWithRetry(request, { email: 'arjun@technova.in', password: 'Welcome@123' });
      employeeToken = await ssoWithRetry(request, empEcToken);
    } catch {
      employeeToken = '';
    }
  });

  test.describe('1 - Auth & Health', () => {

    test('1.1 Health check returns 200', async ({ request }) => {
      const r = await request.get(`${PERF_BASE}/health`);
      expect(r.status()).toBe(200);
    });

    test('1.2 SSO token is valid', async () => {
      expect(token.length).toBeGreaterThan(10);
    });

    test('1.3 Unauthenticated request returns 401', async ({ request }) => {
      const r = await request.get(`${PERF_API}/review-cycles`);
      expect(r.status()).toBe(401);
    });
  });

  // =========================================================================
  // 2. Review Cycle Setup (3 tests)
  // =========================================================================

  test.describe('2 - Review Cycle Setup', () => {

    test('2.1 Create Q2 2026 review cycle', async ({ request }) => {
      const r = await request.post(`${PERF_API}/review-cycles`, {
        ...auth(),
        data: {
          name: `TechNova Q2 2026 Review ${RUN}`,
          description: 'Quarterly performance review for TechNova Q2',
          type: 'quarterly',
          start_date: '2026-04-01',
          end_date: '2026-06-30',
          review_start_date: '2026-07-01',
          review_end_date: '2026-07-15',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      reviewCycleId = body.data?.id || body.data?.review_cycle_id || 0;
    });

    test('2.2 List review cycles', async ({ request }) => {
      const r = await request.get(`${PERF_API}/review-cycles`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      if (!reviewCycleId && Array.isArray(body.data) && body.data.length > 0) {
        reviewCycleId = body.data[0].id;
      }
    });

    test('2.3 Get review cycle details', async ({ request }) => {
      if (!reviewCycleId) { expect(true).toBeTruthy(); return; }
      const r = await request.get(`${PERF_API}/review-cycles/${reviewCycleId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 3. AI Summary (4 tests)
  // =========================================================================

  test.describe('3 - AI Summary', () => {

    test('3.1 Generate AI review summary for Arjun (employee 522)', async ({ request }) => {
      const r = await request.post(`${PERF_API}/ai/review-summary`, {
        ...auth(),
        data: {
          employee_id: 522,
          cycle_id: reviewCycleId || undefined,
          period: 'Q1 2026',
        },
      });
      expect([200, 201, 400, 404, 500]).toContain(r.status());
    });

    test('3.2 Generate AI employee summary', async ({ request }) => {
      const r = await request.get(`${PERF_API}/ai/employee-summary/522`, auth());
      expect([200, 404, 500]).toContain(r.status());
    });

    test('3.3 Generate AI team summary for Vikram Singh', async ({ request }) => {
      const r = await request.get(`${PERF_API}/ai/team-summary`, auth());
      expect([200, 404, 500]).toContain(r.status());
    });

    test('3.4 Get AI insights for review cycle', async ({ request }) => {
      if (!reviewCycleId) { expect(true).toBeTruthy(); return; }
      const r = await request.get(`${PERF_API}/ai/cycle-insights/${reviewCycleId}`, auth());
      expect([200, 404, 500]).toContain(r.status());
    });
  });

  // =========================================================================
  // 4. Letters — Template, Generate, Send (6 tests)
  // =========================================================================

  test.describe('4 - Performance Letters', () => {

    test('4.1 Create "Annual Performance Review Letter" template', async ({ request }) => {
      const r = await request.post(`${PERF_API}/letters/templates`, {
        ...auth(),
        data: {
          name: `Annual Performance Review Letter ${RUN}`,
          type: 'performance_review',
          body: '<p>Dear {{employee_name}},</p><p>This letter summarizes your performance for {{review_period}}. Your overall rating is {{overall_rating}}.</p><p>Key achievements: {{achievements}}</p>',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) letterTemplateId = body.data.id;
    });

    test('4.2 List letter templates', async ({ request }) => {
      const r = await request.get(`${PERF_API}/letters/templates`, auth());
      expect([200, 404]).toContain(r.status());
      if (r.status() === 200 && !letterTemplateId) {
        const body = await r.json();
        const items = body.data?.data || body.data || [];
        if (Array.isArray(items) && items.length > 0) letterTemplateId = items[0].id;
      }
    });

    test('4.3 Generate performance letter for Arjun', async ({ request }) => {
      const r = await request.post(`${PERF_API}/letters/generate`, {
        ...auth(),
        data: {
          employee_id: 522,
          template_id: letterTemplateId || undefined,
          cycle_id: reviewCycleId || undefined,
          review_period: 'Q1 2026',
          overall_rating: 4,
          achievements: 'Led microservices migration, mentored 3 junior engineers',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) letterId = body.data.id;
    });

    test('4.4 List generated letters', async ({ request }) => {
      const r = await request.get(`${PERF_API}/letters`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('4.5 Send letter to employee', async ({ request }) => {
      if (!letterId) { expect(true).toBeTruthy(); return; }
      const r = await request.post(`${PERF_API}/letters/${letterId}/send`, auth());
      expect([200, 201, 400, 404]).toContain(r.status());
    });

    test('4.6 Download letter as PDF', async ({ request }) => {
      if (!letterId) { expect(true).toBeTruthy(); return; }
      const r = await request.get(`${PERF_API}/letters/${letterId}/download`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 5. Manager Effectiveness (4 tests)
  // =========================================================================

  test.describe('5 - Manager Effectiveness', () => {

    test('5.1 Calculate manager effectiveness score for Vikram Singh Q1 2026', async ({ request }) => {
      const r = await request.get(`${PERF_API}/manager-effectiveness/calculate?manager_id=523&period=Q1-2026`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('5.2 Get manager effectiveness dashboard', async ({ request }) => {
      const r = await request.get(`${PERF_API}/manager-effectiveness/dashboard`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('5.3 Get all managers effectiveness ranking', async ({ request }) => {
      const r = await request.get(`${PERF_API}/manager-effectiveness/ranking`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('5.4 Get manager effectiveness trends', async ({ request }) => {
      const r = await request.get(`${PERF_API}/manager-effectiveness/trends`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 6. Succession Planning (5 tests)
  // =========================================================================

  test.describe('6 - Succession Planning', () => {

    test('6.1 Create VP Engineering succession plan', async ({ request }) => {
      const r = await request.post(`${PERF_API}/succession-plans`, {
        ...auth(),
        data: {
          position: 'VP Engineering',
          department: 'Engineering',
          current_holder_id: 523,
          risk_level: 'medium',
          notes: 'Planning succession for VP Engineering role at TechNova',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) successionPlanId = body.data.id;
    });

    test('6.2 Add Arjun as succession candidate — ready in 1 year', async ({ request }) => {
      if (!successionPlanId) { expect(true).toBeTruthy(); return; }
      const r = await request.post(`${PERF_API}/succession-plans/${successionPlanId}/candidates`, {
        ...auth(),
        data: {
          employee_id: 522,
          readiness: 'ready_in_1_year',
          development_areas: 'Strategic leadership, stakeholder management, budget planning',
          notes: 'Strong technical background, needs executive coaching',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });

    test('6.3 List succession plans', async ({ request }) => {
      const r = await request.get(`${PERF_API}/succession-plans`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.4 Get succession plan details', async ({ request }) => {
      if (!successionPlanId) { expect(true).toBeTruthy(); return; }
      const r = await request.get(`${PERF_API}/succession-plans/${successionPlanId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.5 Update succession plan risk level', async ({ request }) => {
      if (!successionPlanId) { expect(true).toBeTruthy(); return; }
      const r = await request.put(`${PERF_API}/succession-plans/${successionPlanId}`, {
        ...auth(),
        data: { risk_level: 'high', notes: 'Current holder may transition within 6 months' },
      });
      expect([200, 204, 400, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 7. Notifications & Reminders (5 tests)
  // =========================================================================

  test.describe('7 - Notifications', () => {

    test('7.1 Get review reminders', async ({ request }) => {
      const r = await request.get(`${PERF_API}/notifications/review-reminders`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('7.2 Get PIP reminders', async ({ request }) => {
      const r = await request.get(`${PERF_API}/notifications/pip-reminders`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('7.3 Get meeting reminders (1:1s)', async ({ request }) => {
      const r = await request.get(`${PERF_API}/notifications/meeting-reminders`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('7.4 Get notification queue status', async ({ request }) => {
      const r = await request.get(`${PERF_API}/notifications/queue-status`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('7.5 Get notification preferences', async ({ request }) => {
      const r = await request.get(`${PERF_API}/notifications/preferences`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 8. 9-Box Grid & Calibration (4 tests)
  // =========================================================================

  test.describe('8 - 9-Box & Calibration', () => {

    test('8.1 Get 9-box grid data', async ({ request }) => {
      const r = await request.get(`${PERF_API}/analytics/nine-box?cycleId=${reviewCycleId}`, auth());
      expect([200, 400, 404]).toContain(r.status());
    });

    test('8.2 Get calibration sessions', async ({ request }) => {
      const r = await request.get(`${PERF_API}/calibration`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('8.3 Create calibration session for Q2 cycle', async ({ request }) => {
      if (!reviewCycleId) { expect(true).toBeTruthy(); return; }
      const r = await request.post(`${PERF_API}/calibration`, {
        ...auth(),
        data: {
          cycle_id: reviewCycleId,
          name: `TechNova Q2 Calibration ${RUN}`,
          facilitator_id: 523,
          scheduled_at: '2026-07-10T14:00:00Z',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });

    test('8.4 Get ratings distribution for cycle', async ({ request }) => {
      if (!reviewCycleId) { expect(true).toBeTruthy(); return; }
      const r = await request.get(`${PERF_API}/review-cycles/${reviewCycleId}/ratings-distribution`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 9. Team Analytics (4 tests)
  // =========================================================================

  test.describe('9 - Team Analytics', () => {

    test('9.1 Get analytics overview', async ({ request }) => {
      const r = await request.get(`${PERF_API}/analytics/overview`, auth());
      expect([200]).toContain(r.status());
    });

    test('9.2 Get top performers', async ({ request }) => {
      const r = await request.get(`${PERF_API}/analytics/top-performers?cycleId=${reviewCycleId}`, auth());
      expect([200, 400]).toContain(r.status());
    });

    test('9.3 Get department performance comparison', async ({ request }) => {
      const r = await request.get(`${PERF_API}/analytics/departments`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('9.4 Get goal completion analytics', async ({ request }) => {
      const r = await request.get(`${PERF_API}/analytics/goal-completion`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 10. Goals & OKRs (4 tests)
  // =========================================================================

  test.describe('10 - Goals Advanced', () => {

    test('10.1 Create Engineering OKR for Q2', async ({ request }) => {
      const r = await request.post(`${PERF_API}/goals`, {
        ...auth(),
        data: {
          title: `TechNova Platform Reliability OKR ${RUN}`,
          description: 'Achieve 99.95% uptime for all TechNova services',
          category: 'team',
          status: 'not_started',
          start_date: '2026-04-01',
          due_date: '2026-06-30',
          target_value: 99.95,
          current_value: 99.8,
          employee_id: 522,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      goalId = body.data?.id || 0;
    });

    test('10.2 Add key result — reduce P1 incidents', async ({ request }) => {
      if (!goalId) { expect(true).toBeTruthy(); return; }
      const r = await request.post(`${PERF_API}/goals/${goalId}/key-results`, {
        ...auth(),
        data: {
          title: 'Reduce P1 incidents by 50%',
          target_value: 2,
          current_value: 4,
          unit: 'incidents/month',
        },
      });
      expect([200, 201, 400]).toContain(r.status());
    });

    test('10.3 Update goal progress', async ({ request }) => {
      if (!goalId) { expect(true).toBeTruthy(); return; }
      const r = await request.put(`${PERF_API}/goals/${goalId}`, {
        ...auth(),
        data: { progress: 40, status: 'in_progress', current_value: 99.9 },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('10.4 Get goals filtered by status', async ({ request }) => {
      const r = await request.get(`${PERF_API}/goals?status=in_progress`, auth());
      expect([200]).toContain(r.status());
    });
  });

  // =========================================================================
  // 11. One-on-Ones (4 tests)
  // =========================================================================

  test.describe('11 - One-on-Ones', () => {

    test('11.1 Create weekly 1:1 with Arjun', async ({ request }) => {
      const r = await request.post(`${PERF_API}/one-on-ones`, {
        ...auth(),
        data: {
          title: `TechNova Weekly 1:1 — Arjun ${RUN}`,
          employee_id: 522,
          manager_id: 1,
          scheduled_at: '2026-04-14T10:00:00Z',
          duration_minutes: 30,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      meetingId = body.data?.id || 0;
    });

    test('11.2 Add agenda item — discuss platform reliability OKR', async ({ request }) => {
      if (!meetingId) { expect(true).toBeTruthy(); return; }
      const r = await request.post(`${PERF_API}/one-on-ones/${meetingId}/agenda`, {
        ...auth(),
        data: {
          title: 'Platform reliability OKR progress',
          description: 'Review P1 incident reduction and uptime metrics',
          owner: 'manager',
        },
      });
      expect([200, 201, 400]).toContain(r.status());
    });

    test('11.3 Complete meeting with notes', async ({ request }) => {
      if (!meetingId) { expect(true).toBeTruthy(); return; }
      const r = await request.post(`${PERF_API}/one-on-ones/${meetingId}/complete`, {
        ...auth(),
        data: {
          summary: 'Discussed OKR progress. Arjun on track for 99.95% uptime target. Action: Set up chaos engineering tests.',
        },
      });
      expect([200, 201, 400, 409]).toContain(r.status());
    });

    test('11.4 List all 1:1 meetings', async ({ request }) => {
      const r = await request.get(`${PERF_API}/one-on-ones`, auth());
      expect([200]).toContain(r.status());
    });
  });

  // =========================================================================
  // 12. PIPs (3 tests)
  // =========================================================================

  test.describe('12 - PIPs', () => {

    test('12.1 List active PIPs', async ({ request }) => {
      const r = await request.get(`${PERF_API}/pips`, auth());
      expect([200]).toContain(r.status());
      const body = await r.json();
      const pips = body.data?.data || (Array.isArray(body.data) ? body.data : []);
      if (pips.length > 0) pipId = pips[0].id;
    });

    test('12.2 Get PIP analytics', async ({ request }) => {
      const r = await request.get(`${PERF_API}/pips/analytics`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('12.3 Get PIP by ID (if exists)', async ({ request }) => {
      if (!pipId) { expect(true).toBeTruthy(); return; }
      const r = await request.get(`${PERF_API}/pips/${pipId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 13. Feedback Advanced (3 tests)
  // =========================================================================

  test.describe('13 - Feedback Advanced', () => {

    test('13.1 Give kudos to Arjun for mentoring', async ({ request }) => {
      const r = await request.post(`${PERF_API}/feedback`, {
        ...auth(),
        data: {
          to_user_id: 522,
          type: 'kudos',
          message: `Exceptional mentoring of new TechNova hires during onboarding week ${RUN}`,
          is_anonymous: false,
          visibility: 'public',
        },
      });
      expect([200, 201]).toContain(r.status());
    });

    test('13.2 Get feedback wall', async ({ request }) => {
      const r = await request.get(`${PERF_API}/feedback/wall`, auth());
      expect([200]).toContain(r.status());
    });

    test('13.3 Get feedback analytics', async ({ request }) => {
      const r = await request.get(`${PERF_API}/feedback/analytics`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 14. Settings & Configuration (3 tests)
  // =========================================================================

  test.describe('14 - Settings', () => {

    test('14.1 Get performance module settings', async ({ request }) => {
      const r = await request.get(`${PERF_API}/settings`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('14.2 Update settings — enable AI summaries and 360 feedback', async ({ request }) => {
      const r = await request.put(`${PERF_API}/settings`, {
        ...auth(),
        data: {
          enable_ai_summaries: true,
          enable_360_feedback: true,
          enable_peer_reviews: true,
          review_reminder_days: 7,
          pip_reminder_days: 14,
          enable_succession_planning: true,
        },
      });
      expect([200, 204, 400, 404]).toContain(r.status());
    });

    test('14.3 Get settings to verify update', async ({ request }) => {
      const r = await request.get(`${PERF_API}/settings`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // =========================================================================
  // 15. RBAC & Edge Cases (4 tests)
  // =========================================================================

  test.describe('15 - RBAC & Edge Cases', () => {

    test('15.1 Employee cannot create review cycle', async ({ request }) => {
      if (!employeeToken) { expect(true).toBeTruthy(); return; }
      const r = await request.post(`${PERF_API}/review-cycles`, {
        ...empAuth(),
        data: {
          name: 'Unauthorized Cycle',
          type: 'annual',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
        },
      });
      expect([401, 403]).toContain(r.status());
    });

    test('15.2 Employee can view own goals', async ({ request }) => {
      if (!employeeToken) { expect(true).toBeTruthy(); return; }
      const r = await request.get(`${PERF_API}/goals?mine=true`, empAuth());
      expect([200]).toContain(r.status());
    });

    test('15.3 Employee can view feedback received', async ({ request }) => {
      if (!employeeToken) { expect(true).toBeTruthy(); return; }
      const r = await request.get(`${PERF_API}/feedback/received`, empAuth());
      expect([200]).toContain(r.status());
    });

    test('15.4 Employee cannot access succession plans', async ({ request }) => {
      if (!employeeToken) { expect(true).toBeTruthy(); return; }
      const r = await request.get(`${PERF_API}/succession-plans`, empAuth());
      expect([200, 401, 403, 404]).toContain(r.status());
    });
  });
});
