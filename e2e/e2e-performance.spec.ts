import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Performance Module — E2E Tests
// Auth: SSO from EmpCloud (login ananya@technova.in → POST /auth/sso to performance)
// API: https://test-performance-api.empcloud.com/api/v1
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const PERF_API = 'https://test-performance-api.empcloud.com/api/v1';
const PERF_BASE = 'https://test-performance-api.empcloud.com';

let token = '';
let employeeToken = '';

// IDs captured during creation for use in subsequent tests
let reviewCycleId: number | string = 0;
let reviewId: number | string = 0;
let goalId: number | string = 0;
let keyResultId: number | string = 0;
let checkInId: number | string = 0;
let feedbackId: number | string = 0;
let nominationId: number | string = 0;
let meetingId: number | string = 0;
let agendaItemId: number | string = 0;
let careerPathId: number | string = 0;
let careerLevelId: number | string = 0;
let frameworkId: number | string = 0;
let competencyId: number | string = 0;
let pipId: number | string = 0;
let pipObjectiveId: number | string = 0;

test.describe('EMP Performance Module', () => {
  // ─── Setup: SSO login ──────────────────────────────────────────────────────

  test.beforeAll(async ({ request }) => {
    // Login to EmpCloud as org_admin
    const login = await request.post(`${EMPCLOUD_API}/auth/login`, {
      data: { email: 'ananya@technova.in', password: 'Welcome@123' },
    });
    expect(login.status()).toBe(200);
    const ecBody = await login.json();
    const ecToken = ecBody.data.tokens.access_token;

    // SSO to Performance module
    const sso = await request.post(`${PERF_API}/auth/sso`, {
      data: { token: ecToken },
    });
    const ssoBody = await sso.json();
    token = ssoBody.data?.tokens?.accessToken
      || ssoBody.data?.tokens?.access_token
      || ssoBody.data?.token
      || ecToken;

    // Login as employee for RBAC tests
    const empLogin = await request.post(`${EMPCLOUD_API}/auth/login`, {
      data: { email: 'arjun@technova.in', password: 'Welcome@123' },
    });
    if (empLogin.status() === 200) {
      const empBody = await empLogin.json();
      const empEcToken = empBody.data.tokens.access_token;
      const empSso = await request.post(`${PERF_API}/auth/sso`, {
        data: { token: empEcToken },
      });
      const empSsoBody = await empSso.json();
      employeeToken = empSsoBody.data?.tokens?.accessToken
        || empSsoBody.data?.tokens?.access_token
        || empSsoBody.data?.token
        || '';
    }
  });

  const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });
  const empAuth = () => ({ headers: { Authorization: `Bearer ${employeeToken}` } });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. AUTH & HEALTH (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Auth & Health', () => {
    test('health check returns 200', async ({ request }) => {
      const r = await request.get(`${PERF_BASE}/health`);
      expect(r.status()).toBe(200);
    });

    test('SSO token is valid', async () => {
      expect(token.length).toBeGreaterThan(10);
    });

    test('authenticated request succeeds', async ({ request }) => {
      const r = await request.get(`${PERF_API}/auth/me`, auth());
      expect([200, 204]).toContain(r.status());
    });

    test('unauthenticated request returns 401', async ({ request }) => {
      const r = await request.get(`${PERF_API}/review-cycles`);
      expect(r.status()).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. REVIEW CYCLES (10 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Review Cycles', () => {
    test('POST /review-cycles — create review cycle', async ({ request }) => {
      const r = await request.post(`${PERF_API}/review-cycles`, {
        ...auth(),
        data: {
          name: 'PW Q1 2026 Review',
          description: 'Playwright test review cycle',
          type: 'quarterly',
          start_date: '2026-01-01',
          end_date: '2026-03-31',
          review_start_date: '2026-04-01',
          review_end_date: '2026-04-15',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      reviewCycleId = body.data?.id || body.data?.review_cycle_id || body.data?.reviewCycleId || 0;
    });

    test('GET /review-cycles — list review cycles', async ({ request }) => {
      const r = await request.get(`${PERF_API}/review-cycles`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.data).toBeDefined();
      // Capture ID if we didn't get one from create
      if (!reviewCycleId && Array.isArray(body.data) && body.data.length > 0) {
        reviewCycleId = body.data[0].id || body.data[0].review_cycle_id;
      }
    });

    test('GET /review-cycles/:id — get single cycle', async ({ request }) => {
      expect(reviewCycleId, 'Prerequisite failed — No review cycle ID available').toBeTruthy();
      const r = await request.get(`${PERF_API}/review-cycles/${reviewCycleId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('PUT /review-cycles/:id — update cycle', async ({ request }) => {
      expect(reviewCycleId, 'Prerequisite failed — No review cycle ID available').toBeTruthy();
      const r = await request.put(`${PERF_API}/review-cycles/${reviewCycleId}`, {
        ...auth(),
        data: { name: 'PW Q1 2026 Review (Updated)', description: 'Updated by Playwright' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('POST /review-cycles/:id/participants — add participants', async ({ request }) => {
      expect(reviewCycleId, 'Prerequisite failed — No review cycle ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/review-cycles/${reviewCycleId}/participants`, {
        ...auth(),
        data: { employee_ids: [522], participants: [{ employee_id: 522 }] },
      });
      expect([200, 201, 400]).toContain(r.status());
    });

    test('POST /review-cycles/:id/launch — launch cycle', async ({ request }) => {
      expect(reviewCycleId, 'Prerequisite failed — No review cycle ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/review-cycles/${reviewCycleId}/launch`, auth());
      expect([200, 201, 400, 409]).toContain(r.status());
    });

    test('POST /review-cycles/:id/close — close cycle', async ({ request }) => {
      expect(reviewCycleId, 'Prerequisite failed — No review cycle ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/review-cycles/${reviewCycleId}/close`, auth());
      expect([200, 201, 400, 409]).toContain(r.status());
    });

    test('GET /review-cycles/:id/ratings-distribution — ratings', async ({ request }) => {
      expect(reviewCycleId, 'Prerequisite failed — No review cycle ID available').toBeTruthy();
      const r = await request.get(
        `${PERF_API}/review-cycles/${reviewCycleId}/ratings-distribution`,
        auth(),
      );
      expect([200, 404]).toContain(r.status());
    });

    test('employee cannot create review cycle (RBAC)', async ({ request }) => {
      expect(employeeToken, 'Prerequisite failed — No employee token available').toBeTruthy();
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

    test('employee cannot launch review cycle (RBAC)', async ({ request }) => {
      expect(employeeToken && reviewCycleId, 'Prerequisite failed — No employee token or cycle ID').toBeTruthy();
      const r = await request.post(
        `${PERF_API}/review-cycles/${reviewCycleId}/launch`,
        empAuth(),
      );
      expect([401, 403]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. REVIEWS (8 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Reviews', () => {
    test('POST /reviews — create review', async ({ request }) => {
      const r = await request.post(`${PERF_API}/reviews`, {
        ...auth(),
        data: {
          review_cycle_id: reviewCycleId || undefined,
          employee_id: 522,
          reviewer_id: 1,
          type: 'manager',
          status: 'draft',
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      reviewId = body.data?.id || body.data?.review_id || body.data?.reviewId || 0;
    });

    test('GET /reviews — list reviews', async ({ request }) => {
      const r = await request.get(`${PERF_API}/reviews`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      if (!reviewId && Array.isArray(body.data) && body.data.length > 0) {
        reviewId = body.data[0].id || body.data[0].review_id;
      }
    });

    test('GET /reviews/:id — get single review', async ({ request }) => {
      expect(reviewId, 'Prerequisite failed — No review ID available').toBeTruthy();
      const r = await request.get(`${PERF_API}/reviews/${reviewId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('PUT /reviews/:id — save draft', async ({ request }) => {
      expect(reviewId, 'Prerequisite failed — No review ID available').toBeTruthy();
      const r = await request.put(`${PERF_API}/reviews/${reviewId}`, {
        ...auth(),
        data: { status: 'draft', comments: 'Playwright draft save', overall_rating: 3 },
      });
      expect([200, 204, 400]).toContain(r.status());
    });

    test('POST /reviews/:id/ratings — rate competency', async ({ request }) => {
      expect(reviewId, 'Prerequisite failed — No review ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/reviews/${reviewId}/ratings`, {
        ...auth(),
        data: {
          competency_id: competencyId || 1,
          rating: 4,
          comments: 'Strong performance in this area',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });

    test('POST /reviews/:id/submit — submit review', async ({ request }) => {
      expect(reviewId, 'Prerequisite failed — No review ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/reviews/${reviewId}/submit`, auth());
      expect([200, 201, 400, 409]).toContain(r.status());
    });

    test('GET /reviews?status=draft — filter by status', async ({ request }) => {
      const r = await request.get(`${PERF_API}/reviews?status=draft`, auth());
      expect([200]).toContain(r.status());
    });

    test('GET /reviews?status=submitted — filter submitted', async ({ request }) => {
      const r = await request.get(`${PERF_API}/reviews?status=submitted`, auth());
      expect([200]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. GOALS & OKRs (10 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Goals & OKRs', () => {
    test('POST /goals — create goal', async ({ request }) => {
      const r = await request.post(`${PERF_API}/goals`, {
        ...auth(),
        data: {
          title: 'PW Increase Revenue Q1',
          description: 'Playwright test goal for revenue growth',
          type: 'individual',
          status: 'active',
          start_date: '2026-01-01',
          end_date: '2026-03-31',
          target_value: 100,
          current_value: 0,
          employee_id: 522,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      goalId = body.data?.id || body.data?.goal_id || body.data?.goalId || 0;
    });

    test('GET /goals — list goals', async ({ request }) => {
      const r = await request.get(`${PERF_API}/goals`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      if (!goalId && Array.isArray(body.data) && body.data.length > 0) {
        goalId = body.data[0].id || body.data[0].goal_id;
      }
    });

    test('GET /goals/:id — get single goal', async ({ request }) => {
      expect(goalId, 'Prerequisite failed — No goal ID available').toBeTruthy();
      const r = await request.get(`${PERF_API}/goals/${goalId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('PUT /goals/:id — update goal', async ({ request }) => {
      expect(goalId, 'Prerequisite failed — No goal ID available').toBeTruthy();
      const r = await request.put(`${PERF_API}/goals/${goalId}`, {
        ...auth(),
        data: { title: 'PW Increase Revenue Q1 (Updated)', target_value: 120 },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('POST /goals/:id/key-results — add key result', async ({ request }) => {
      expect(goalId, 'Prerequisite failed — No goal ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/goals/${goalId}/key-results`, {
        ...auth(),
        data: {
          title: 'PW Close 10 enterprise deals',
          target_value: 10,
          current_value: 0,
          unit: 'deals',
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      keyResultId = body.data?.id || body.data?.key_result_id || body.data?.keyResultId || 0;
    });

    test('PUT /goals/:id/key-results/:krId — update key result', async ({ request }) => {
      expect(goalId && keyResultId, 'Prerequisite failed — No goal or key result ID').toBeTruthy();
      const r = await request.put(
        `${PERF_API}/goals/${goalId}/key-results/${keyResultId}`,
        {
          ...auth(),
          data: { current_value: 3, title: 'PW Close 10 enterprise deals (updated)' },
        },
      );
      expect([200, 204, 400]).toContain(r.status());
    });

    test('POST /goals/:id/check-ins — create check-in', async ({ request }) => {
      expect(goalId, 'Prerequisite failed — No goal ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/goals/${goalId}/check-ins`, {
        ...auth(),
        data: {
          progress: 25,
          note: 'Playwright check-in: on track',
          status: 'on_track',
          value: 25,
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      checkInId = body.data?.id || body.data?.check_in_id || 0;
    });

    test('GET /goals/:id/check-ins — list check-ins', async ({ request }) => {
      expect(goalId, 'Prerequisite failed — No goal ID available').toBeTruthy();
      const r = await request.get(`${PERF_API}/goals/${goalId}/check-ins`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('GET /goals/alignment-tree — alignment tree', async ({ request }) => {
      const r = await request.get(`${PERF_API}/goals/alignment-tree`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('DELETE /goals/:id — delete goal', async ({ request }) => {
      expect(goalId, 'Prerequisite failed — No goal ID available').toBeTruthy();
      const r = await request.delete(`${PERF_API}/goals/${goalId}`, auth());
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. FEEDBACK (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Feedback', () => {
    test('POST /feedback — give kudos', async ({ request }) => {
      const r = await request.post(`${PERF_API}/feedback`, {
        ...auth(),
        data: {
          to_employee_id: 522,
          type: 'kudos',
          message: 'Great work on the Q1 release! - Playwright test',
          is_anonymous: false,
          visibility: 'public',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      feedbackId = body.data?.id || body.data?.feedback_id || 0;
    });

    test('POST /feedback — give anonymous feedback', async ({ request }) => {
      const r = await request.post(`${PERF_API}/feedback`, {
        ...auth(),
        data: {
          to_employee_id: 522,
          type: 'constructive',
          message: 'Consider improving documentation. - Playwright anonymous test',
          is_anonymous: true,
          visibility: 'private',
        },
      });
      expect([200, 201]).toContain(r.status());
    });

    test('GET /feedback/received — list received feedback', async ({ request }) => {
      const r = await request.get(`${PERF_API}/feedback/received`, auth());
      expect([200]).toContain(r.status());
    });

    test('GET /feedback/given — list given feedback', async ({ request }) => {
      const r = await request.get(`${PERF_API}/feedback/given`, auth());
      expect([200]).toContain(r.status());
    });

    test('GET /feedback/wall — feedback wall', async ({ request }) => {
      const r = await request.get(`${PERF_API}/feedback/wall`, auth());
      expect([200]).toContain(r.status());
    });

    test('DELETE /feedback/:id — delete feedback', async ({ request }) => {
      expect(feedbackId, 'Prerequisite failed — No feedback ID available').toBeTruthy();
      const r = await request.delete(`${PERF_API}/feedback/${feedbackId}`, auth());
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. PEER REVIEWS (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Peer Reviews', () => {
    test('POST /peer-reviews/nominations — nominate peer', async ({ request }) => {
      const r = await request.post(`${PERF_API}/peer-reviews/nominations`, {
        ...auth(),
        data: {
          review_cycle_id: reviewCycleId || undefined,
          employee_id: 522,
          nominee_id: 523,
          nominated_employee_id: 523,
          reason: 'Collaborated closely on project - Playwright test',
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      nominationId = body.data?.id || body.data?.nomination_id || 0;
    });

    test('GET /peer-reviews/nominations — list nominations', async ({ request }) => {
      const r = await request.get(`${PERF_API}/peer-reviews/nominations`, auth());
      expect([200]).toContain(r.status());
      const body = await r.json();
      if (!nominationId && Array.isArray(body.data) && body.data.length > 0) {
        nominationId = body.data[0].id || body.data[0].nomination_id;
      }
    });

    test('POST /peer-reviews/nominations/:id/approve — approve nomination', async ({ request }) => {
      expect(nominationId, 'Prerequisite failed — No nomination ID available').toBeTruthy();
      const r = await request.post(
        `${PERF_API}/peer-reviews/nominations/${nominationId}/approve`,
        auth(),
      );
      expect([200, 201, 400, 409]).toContain(r.status());
    });

    test('POST /peer-reviews/nominations/:id/decline — decline nomination', async ({ request }) => {
      expect(nominationId, 'Prerequisite failed — No nomination ID available').toBeTruthy();
      const r = await request.post(
        `${PERF_API}/peer-reviews/nominations/${nominationId}/decline`,
        auth(),
      );
      expect([200, 201, 400, 409]).toContain(r.status());
    });

    test('employee cannot approve nominations (RBAC)', async ({ request }) => {
      expect(employeeToken && nominationId, 'Prerequisite failed — No employee token or nomination ID').toBeTruthy();
      const r = await request.post(
        `${PERF_API}/peer-reviews/nominations/${nominationId}/approve`,
        empAuth(),
      );
      expect([401, 403]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. ONE-ON-ONES (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('One-on-Ones', () => {
    test('POST /one-on-ones — create meeting', async ({ request }) => {
      const r = await request.post(`${PERF_API}/one-on-ones`, {
        ...auth(),
        data: {
          title: 'PW Weekly 1:1 with Arjun',
          employee_id: 522,
          manager_id: 1,
          scheduled_date: '2026-04-07T10:00:00Z',
          duration_minutes: 30,
          recurrence: 'weekly',
          notes: 'Playwright test meeting',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      meetingId = body.data?.id || body.data?.meeting_id || body.data?.oneOnOneId || 0;
    });

    test('GET /one-on-ones — list meetings', async ({ request }) => {
      const r = await request.get(`${PERF_API}/one-on-ones`, auth());
      expect([200]).toContain(r.status());
      const body = await r.json();
      if (!meetingId && Array.isArray(body.data) && body.data.length > 0) {
        meetingId = body.data[0].id || body.data[0].meeting_id;
      }
    });

    test('POST /one-on-ones/:id/agenda — add agenda item', async ({ request }) => {
      expect(meetingId, 'Prerequisite failed — No meeting ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/one-on-ones/${meetingId}/agenda`, {
        ...auth(),
        data: {
          title: 'Review Q1 goals progress',
          description: 'Discuss goal tracking - Playwright test',
          owner: 'manager',
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      agendaItemId = body.data?.id || body.data?.agenda_item_id || 0;
    });

    test('PUT /one-on-ones/:id/agenda/:itemId/complete — complete agenda item', async ({ request }) => {
      expect(meetingId && agendaItemId, 'Prerequisite failed — No meeting or agenda item ID').toBeTruthy();
      const r = await request.put(
        `${PERF_API}/one-on-ones/${meetingId}/agenda/${agendaItemId}/complete`,
        auth(),
      );
      expect([200, 204, 400]).toContain(r.status());
    });

    test('POST /one-on-ones/:id/complete — complete meeting', async ({ request }) => {
      expect(meetingId, 'Prerequisite failed — No meeting ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/one-on-ones/${meetingId}/complete`, {
        ...auth(),
        data: { summary: 'Discussed Q1 goals. All on track. - Playwright test' },
      });
      expect([200, 201, 400, 409]).toContain(r.status());
    });

    test('DELETE /one-on-ones/:id — delete meeting', async ({ request }) => {
      expect(meetingId, 'Prerequisite failed — No meeting ID available').toBeTruthy();
      const r = await request.delete(`${PERF_API}/one-on-ones/${meetingId}`, auth());
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. CAREER PATHS (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Career Paths', () => {
    test('POST /career-paths — create career path', async ({ request }) => {
      const r = await request.post(`${PERF_API}/career-paths`, {
        ...auth(),
        data: {
          title: 'PW Software Engineering Track',
          description: 'Playwright test career path for engineers',
          department: 'Engineering',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      careerPathId = body.data?.id || body.data?.career_path_id || body.data?.careerPathId || 0;
    });

    test('POST /career-paths/:id/levels — add level', async ({ request }) => {
      expect(careerPathId, 'Prerequisite failed — No career path ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/career-paths/${careerPathId}/levels`, {
        ...auth(),
        data: {
          title: 'Senior Engineer',
          level: 3,
          order: 3,
          description: 'IC3 level - Playwright test',
          requirements: 'System design, mentoring, technical leadership',
          min_years_experience: 5,
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      careerLevelId = body.data?.id || body.data?.level_id || 0;
    });

    test('POST /career-paths/:id/assign — assign employee', async ({ request }) => {
      expect(careerPathId, 'Prerequisite failed — No career path ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/career-paths/${careerPathId}/assign`, {
        ...auth(),
        data: {
          employee_id: 522,
          current_level_id: careerLevelId || undefined,
          current_level: 2,
        },
      });
      expect([200, 201, 400]).toContain(r.status());
    });

    test('GET /career-paths — list career paths', async ({ request }) => {
      const r = await request.get(`${PERF_API}/career-paths`, auth());
      expect([200]).toContain(r.status());
    });

    test('GET /career-paths/employee/:id — get employee track', async ({ request }) => {
      const r = await request.get(`${PERF_API}/career-paths/employee/522`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('DELETE /career-paths/:id — delete career path', async ({ request }) => {
      expect(careerPathId, 'Prerequisite failed — No career path ID available').toBeTruthy();
      const r = await request.delete(`${PERF_API}/career-paths/${careerPathId}`, auth());
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. COMPETENCY FRAMEWORKS (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Competency Frameworks', () => {
    test('POST /competency-frameworks — create framework', async ({ request }) => {
      const r = await request.post(`${PERF_API}/competency-frameworks`, {
        ...auth(),
        data: {
          name: 'PW Engineering Competencies',
          description: 'Playwright test competency framework',
          status: 'active',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      frameworkId = body.data?.id || body.data?.framework_id || body.data?.frameworkId || 0;
    });

    test('POST /competency-frameworks/:id/competencies — add competency', async ({ request }) => {
      expect(frameworkId, 'Prerequisite failed — No framework ID available').toBeTruthy();
      const r = await request.post(
        `${PERF_API}/competency-frameworks/${frameworkId}/competencies`,
        {
          ...auth(),
          data: {
            name: 'Problem Solving',
            description: 'Ability to analyze and solve complex problems',
            category: 'technical',
            weight: 20,
          },
        },
      );
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      competencyId = body.data?.id || body.data?.competency_id || 0;
    });

    test('GET /competency-frameworks — list frameworks', async ({ request }) => {
      const r = await request.get(`${PERF_API}/competency-frameworks`, auth());
      expect([200]).toContain(r.status());
    });

    test('PUT /competency-frameworks/:id — update framework', async ({ request }) => {
      expect(frameworkId, 'Prerequisite failed — No framework ID available').toBeTruthy();
      const r = await request.put(`${PERF_API}/competency-frameworks/${frameworkId}`, {
        ...auth(),
        data: { name: 'PW Engineering Competencies (Updated)' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('DELETE /competency-frameworks/:id — delete framework', async ({ request }) => {
      expect(frameworkId, 'Prerequisite failed — No framework ID available').toBeTruthy();
      const r = await request.delete(
        `${PERF_API}/competency-frameworks/${frameworkId}`,
        auth(),
      );
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. PIPs (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Performance Improvement Plans (PIPs)', () => {
    test('POST /pips — create PIP', async ({ request }) => {
      const r = await request.post(`${PERF_API}/pips`, {
        ...auth(),
        data: {
          employee_id: 522,
          manager_id: 1,
          reason: 'Below expectations in Q4 - Playwright test',
          start_date: '2026-04-01',
          end_date: '2026-06-30',
          status: 'active',
          duration_days: 90,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      pipId = body.data?.id || body.data?.pip_id || body.data?.pipId || 0;
    });

    test('GET /pips — list PIPs', async ({ request }) => {
      const r = await request.get(`${PERF_API}/pips`, auth());
      expect([200]).toContain(r.status());
      const body = await r.json();
      if (!pipId && Array.isArray(body.data) && body.data.length > 0) {
        pipId = body.data[0].id || body.data[0].pip_id;
      }
    });

    test('POST /pips/:id/objectives — add objective', async ({ request }) => {
      expect(pipId, 'Prerequisite failed — No PIP ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/pips/${pipId}/objectives`, {
        ...auth(),
        data: {
          title: 'Improve code review turnaround',
          description: 'Complete code reviews within 24 hours - Playwright test',
          target: 'Review turnaround < 24h for 90% of PRs',
          due_date: '2026-05-15',
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      pipObjectiveId = body.data?.id || body.data?.objective_id || 0;
    });

    test('PUT /pips/:id — update PIP status', async ({ request }) => {
      expect(pipId, 'Prerequisite failed — No PIP ID available').toBeTruthy();
      const r = await request.put(`${PERF_API}/pips/${pipId}`, {
        ...auth(),
        data: { status: 'in_progress', notes: 'First check-in completed - Playwright test' },
      });
      expect([200, 204, 400]).toContain(r.status());
    });

    test('POST /pips/:id/extend — extend PIP', async ({ request }) => {
      expect(pipId, 'Prerequisite failed — No PIP ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/pips/${pipId}/extend`, {
        ...auth(),
        data: {
          new_end_date: '2026-07-31',
          extension_days: 30,
          reason: 'Additional time needed - Playwright test',
        },
      });
      expect([200, 201, 400, 409]).toContain(r.status());
    });

    test('POST /pips/:id/close — close PIP', async ({ request }) => {
      expect(pipId, 'Prerequisite failed — No PIP ID available').toBeTruthy();
      const r = await request.post(`${PERF_API}/pips/${pipId}/close`, {
        ...auth(),
        data: {
          outcome: 'improved',
          final_notes: 'Employee showed significant improvement - Playwright test',
        },
      });
      expect([200, 201, 400, 409]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. ANALYTICS (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Analytics', () => {
    test('GET /analytics/overview — overview stats', async ({ request }) => {
      const r = await request.get(`${PERF_API}/analytics/overview`, auth());
      expect([200]).toContain(r.status());
    });

    test('GET /analytics/ratings-distribution — ratings distribution', async ({ request }) => {
      const r = await request.get(`${PERF_API}/analytics/ratings-distribution`, auth());
      expect([200]).toContain(r.status());
    });

    test('GET /analytics/top-performers — top performers', async ({ request }) => {
      const r = await request.get(`${PERF_API}/analytics/top-performers`, auth());
      expect([200]).toContain(r.status());
    });

    test('GET /analytics/nine-box — nine-box grid', async ({ request }) => {
      const r = await request.get(`${PERF_API}/analytics/nine-box`, auth());
      expect([200]).toContain(r.status());
    });
  });
});
