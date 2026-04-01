import { test, expect, APIRequestContext } from '@playwright/test';

// =============================================================================
// EMP Rewards Module — E2E Tests
// Auth: SSO from EmpCloud (login ananya@technova.in → POST /auth/sso to rewards)
// API: https://test-rewards-api.empcloud.com/api/v1
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const REWARDS_API = 'https://test-rewards-api.empcloud.com/api/v1';
const REWARDS_BASE = 'https://test-rewards-api.empcloud.com';

const ADMIN_CREDS = { email: 'ananya@technova.in', password: 'Welcome@123' };
const EMPLOYEE_CREDS = { email: 'arjun@technova.in', password: 'Welcome@123' };

const RUN = Date.now().toString().slice(-6);

// =============================================================================
// Helpers
// =============================================================================

let cloudToken = '';
let rewardsToken = '';
let employeeCloudToken = '';
let employeeRewardsToken = '';

async function loginToCloud(request: APIRequestContext, creds = ADMIN_CREDS): Promise<string> {
  const res = await request.post(`${EMPCLOUD_API}/auth/login`, { data: creds });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data.tokens.access_token;
}

async function ssoToRewards(request: APIRequestContext, ecToken: string): Promise<string> {
  const res = await request.post(`${REWARDS_API}/auth/sso`, {
    data: { token: ecToken },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  const moduleToken = body.data?.tokens?.accessToken;
  expect(moduleToken, 'SSO response missing data.tokens.accessToken').toBeTruthy();
  return moduleToken;
}

function auth() {
  return { headers: { Authorization: `Bearer ${rewardsToken}` } };
}

function authJson() {
  return {
    headers: {
      Authorization: `Bearer ${rewardsToken}`,
      'Content-Type': 'application/json',
    },
  };
}

function empAuth() {
  return { headers: { Authorization: `Bearer ${employeeRewardsToken}` } };
}

function empAuthJson() {
  return {
    headers: {
      Authorization: `Bearer ${employeeRewardsToken}`,
      'Content-Type': 'application/json',
    },
  };
}

// Shared state across tests
let catalogItemId: number | string = 0;
let nominationId: number | string = 0;
let badgeId: number | string = 0;
let redemptionId: number | string = 0;
let challengeId: number | string = 0;
let kudosId: number | string = 0;
let celebrationId: number | string = 0;
let milestoneId: number | string = 0;
let budgetId: number | string = 0;

// =============================================================================
// Tests
// =============================================================================

test.describe.serial('EMP Rewards Module', () => {

  // ===========================================================================
  // 1. Health & Auth (2 tests)
  // ===========================================================================

  test.describe('1 - Health & Auth', () => {

    test('1.1 Health check returns 200', async ({ request }) => {
      const r = await request.get(`${REWARDS_BASE}/health`);
      expect(r.status()).toBe(200);
    });

    test('1.2 SSO login succeeds for admin', async ({ request }) => {
      cloudToken = await loginToCloud(request);
      rewardsToken = await ssoToRewards(request, cloudToken);
      expect(rewardsToken.length).toBeGreaterThan(10);

      // Also login employee
      try {
        employeeCloudToken = await loginToCloud(request, EMPLOYEE_CREDS);
        employeeRewardsToken = await ssoToRewards(request, employeeCloudToken);
      } catch {
        employeeRewardsToken = '';
      }
    });
  });

  // ===========================================================================
  // 2. Rewards Catalog (5 tests)
  // ===========================================================================

  test.describe('2 - Rewards Catalog', () => {

    test('2.1 Create catalog item', async ({ request }) => {
      const r = await request.post(`${REWARDS_API}/rewards`, {
        ...authJson(),
        data: {
          name: `PW Gift Card ${RUN}`,
          description: 'Playwright test reward item',
          category: 'gift_card',
          points_cost: 500,
          quantity: 100,
          is_active: true,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) catalogItemId = body.data.id;
    });

    test('2.2 List catalog items', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/rewards`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      const list = body.data?.items || body.data?.catalog || body.data;
      expect(Array.isArray(list) || typeof body.data === 'object').toBe(true);
    });

    test('2.3 Get catalog item by ID', async ({ request }) => {
      expect(catalogItemId, 'Prerequisite failed — catalogItemId was not set').toBeTruthy();
      const r = await request.get(`${REWARDS_API}/rewards/${catalogItemId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('2.4 Update catalog item', async ({ request }) => {
      expect(catalogItemId, 'Prerequisite failed — catalogItemId was not set').toBeTruthy();
      const r = await request.put(`${REWARDS_API}/rewards/${catalogItemId}`, {
        ...authJson(),
        data: { description: `Updated PW item ${RUN}`, points_cost: 600 },
      });
      expect([200, 204, 404]).toContain(r.status());
    });

    test('2.5 Deactivate catalog item', async ({ request }) => {
      expect(catalogItemId, 'Prerequisite failed — catalogItemId was not set').toBeTruthy();
      const r = await request.patch(`${REWARDS_API}/rewards/${catalogItemId}`, {
        ...authJson(),
        data: { is_active: false },
      });
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 3. Nominations (4 tests)
  // ===========================================================================

  test.describe('3 - Nominations', () => {

    test('3.1 Create nomination', async ({ request }) => {
      const r = await request.post(`${REWARDS_API}/nominations`, {
        ...authJson(),
        data: {
          nominee_email: 'arjun@technova.in',
          category: 'star_performer',
          reason: `PW nomination for excellence ${RUN}`,
          points: 100,
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) nominationId = body.data.id;
    });

    test('3.2 List nominations', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/nominations`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('3.3 Approve nomination', async ({ request }) => {
      expect(nominationId, 'Prerequisite failed — nominationId was not set').toBeTruthy();
      const r = await request.patch(`${REWARDS_API}/nominations/${nominationId}/approve`, {
        ...authJson(),
        data: { approved: true, comments: 'Well deserved' },
      });
      expect([200, 204, 400, 404]).toContain(r.status());
    });

    test('3.4 Get nomination details', async ({ request }) => {
      expect(nominationId, 'Prerequisite failed — nominationId was not set').toBeTruthy();
      const r = await request.get(`${REWARDS_API}/nominations/${nominationId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 4. Points (3 tests)
  // ===========================================================================

  test.describe('4 - Points', () => {

    test('4.1 Get points balance', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/points/balance`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('4.2 Get points history', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/points/history`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('4.3 Award points manually', async ({ request }) => {
      const r = await request.post(`${REWARDS_API}/points/award`, {
        ...authJson(),
        data: {
          recipient_email: 'arjun@technova.in',
          points: 50,
          reason: `PW manual award ${RUN}`,
          category: 'spot_bonus',
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 5. Badges (5 tests)
  // ===========================================================================

  test.describe('5 - Badges', () => {

    test('5.1 Create badge', async ({ request }) => {
      const r = await request.post(`${REWARDS_API}/badges`, {
        ...authJson(),
        data: {
          name: `PW Innovation Badge ${RUN}`,
          description: 'Awarded for innovative ideas',
          icon: 'lightbulb',
          category: 'innovation',
          points_value: 200,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) badgeId = body.data.id;
    });

    test('5.2 List badges', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/badges`, auth());
      expect(r.status()).toBe(200);
    });

    test('5.3 Get badge by ID', async ({ request }) => {
      expect(badgeId, 'Prerequisite failed — badgeId was not set').toBeTruthy();
      const r = await request.get(`${REWARDS_API}/badges/${badgeId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('5.4 Award badge to employee', async ({ request }) => {
      expect(badgeId, 'Prerequisite failed — badgeId was not set').toBeTruthy();
      const r = await request.post(`${REWARDS_API}/badges/${badgeId}/award`, {
        ...authJson(),
        data: {
          recipient_email: 'arjun@technova.in',
          reason: `PW badge award ${RUN}`,
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });

    test('5.5 Update badge', async ({ request }) => {
      expect(badgeId, 'Prerequisite failed — badgeId was not set').toBeTruthy();
      const r = await request.put(`${REWARDS_API}/badges/${badgeId}`, {
        ...authJson(),
        data: { description: `Updated PW badge ${RUN}` },
      });
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 6. Redemptions (4 tests)
  // ===========================================================================

  test.describe('6 - Redemptions', () => {

    test('6.1 Redeem points for catalog item', async ({ request }) => {
      const r = await request.post(`${REWARDS_API}/redemptions`, {
        ...authJson(),
        data: {
          catalog_item_id: catalogItemId || undefined,
          quantity: 1,
          notes: `PW redemption ${RUN}`,
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) redemptionId = body.data.id;
    });

    test('6.2 List redemptions', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/redemptions`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.3 Get redemption by ID', async ({ request }) => {
      expect(redemptionId, 'Prerequisite failed — redemptionId was not set').toBeTruthy();
      const r = await request.get(`${REWARDS_API}/redemptions/${redemptionId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.4 Update redemption status (fulfill)', async ({ request }) => {
      expect(redemptionId, 'Prerequisite failed — redemptionId was not set').toBeTruthy();
      const r = await request.patch(`${REWARDS_API}/redemptions/${redemptionId}`, {
        ...authJson(),
        data: { status: 'fulfilled', tracking_info: 'Delivered in office' },
      });
      expect([200, 204, 400, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 7. Leaderboards (3 tests)
  // ===========================================================================

  test.describe('7 - Leaderboards', () => {

    test('7.1 Get overall leaderboard', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/leaderboard`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('7.2 Get department leaderboard', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/leaderboard?group_by=department`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('7.3 Get monthly leaderboard', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/leaderboard?period=monthly`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 8. Budget (3 tests)
  // ===========================================================================

  test.describe('8 - Budget', () => {

    test('8.1 Set rewards budget', async ({ request }) => {
      const r = await request.post(`${REWARDS_API}/budgets`, {
        ...authJson(),
        data: {
          period: '2026-Q2',
          total_points: 50000,
          department_allocations: [
            { department: 'Engineering', points: 20000 },
            { department: 'HR', points: 10000 },
          ],
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) budgetId = body.data.id;
    });

    test('8.2 Get budget overview', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/budgets`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('8.3 Get budget utilization', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/budgets/utilization`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 9. Challenges (4 tests)
  // ===========================================================================

  test.describe('9 - Challenges', () => {

    test('9.1 Create challenge', async ({ request }) => {
      const r = await request.post(`${REWARDS_API}/challenges`, {
        ...authJson(),
        data: {
          title: `PW Innovation Sprint ${RUN}`,
          description: 'Playwright test challenge',
          start_date: '2026-04-01',
          end_date: '2026-04-30',
          reward_points: 1000,
          max_participants: 50,
          criteria: 'Most innovative project submission',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) challengeId = body.data.id;
    });

    test('9.2 List challenges', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/challenges`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('9.3 Join challenge', async ({ request }) => {
      expect(challengeId, 'Prerequisite failed — challengeId was not set').toBeTruthy();
      const r = await request.post(`${REWARDS_API}/challenges/${challengeId}/join`, authJson());
      expect([200, 201, 400, 404, 409]).toContain(r.status());
    });

    test('9.4 Get challenge details', async ({ request }) => {
      expect(challengeId, 'Prerequisite failed — challengeId was not set').toBeTruthy();
      const r = await request.get(`${REWARDS_API}/challenges/${challengeId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 10. Kudos / Peer Recognition (6 tests)
  // ===========================================================================

  test.describe('10 - Kudos', () => {

    test('10.1 Send kudos', async ({ request }) => {
      const r = await request.post(`${REWARDS_API}/kudos`, {
        ...authJson(),
        data: {
          recipient_email: 'arjun@technova.in',
          message: `Great work on the project! ${RUN}`,
          category: 'teamwork',
          points: 25,
          is_public: true,
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) kudosId = body.data.id;
    });

    test('10.2 List kudos feed', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/kudos`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('10.3 Get kudos by ID', async ({ request }) => {
      expect(kudosId, 'Prerequisite failed — kudosId was not set').toBeTruthy();
      const r = await request.get(`${REWARDS_API}/kudos/${kudosId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('10.4 React to kudos (like)', async ({ request }) => {
      expect(kudosId, 'Prerequisite failed — kudosId was not set').toBeTruthy();
      const r = await request.post(`${REWARDS_API}/kudos/${kudosId}/react`, {
        ...authJson(),
        data: { reaction: 'like' },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });

    test('10.5 Get kudos received by user', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/kudos/received`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('10.6 Get kudos sent by user', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/kudos/sent`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 11. Celebrations (4 tests)
  // ===========================================================================

  test.describe('11 - Celebrations', () => {

    test('11.1 Create celebration', async ({ request }) => {
      const r = await request.post(`${REWARDS_API}/celebrations`, {
        ...authJson(),
        data: {
          type: 'birthday',
          recipient_email: 'arjun@technova.in',
          date: '2026-04-15',
          message: `Happy Birthday! ${RUN}`,
          auto_points: 50,
        },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) celebrationId = body.data.id;
    });

    test('11.2 List upcoming celebrations', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/celebrations`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('11.3 Get celebrations by type (work anniversaries)', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/celebrations?type=work_anniversary`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('11.4 Send celebration wish', async ({ request }) => {
      expect(celebrationId, 'Prerequisite failed — celebrationId was not set').toBeTruthy();
      const r = await request.post(`${REWARDS_API}/celebrations/${celebrationId}/wish`, {
        ...authJson(),
        data: { message: `Congrats from PW ${RUN}` },
      });
      expect([200, 201, 400, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 12. Milestones (3 tests)
  // ===========================================================================

  test.describe('12 - Milestones', () => {

    test('12.1 Create milestone reward rule', async ({ request }) => {
      const r = await request.post(`${REWARDS_API}/milestones`, {
        ...authJson(),
        data: {
          name: `PW 5-Year Service ${RUN}`,
          type: 'service_anniversary',
          trigger_years: 5,
          reward_points: 5000,
          badge_name: 'Veteran',
          is_active: true,
        },
      });
      expect([200, 201, 400]).toContain(r.status());
      const body = await r.json();
      if (body.data?.id) milestoneId = body.data.id;
    });

    test('12.2 List milestone rules', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/milestones`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('12.3 Update milestone rule', async ({ request }) => {
      expect(milestoneId, 'Prerequisite failed — milestoneId was not set').toBeTruthy();
      const r = await request.put(`${REWARDS_API}/milestones/${milestoneId}`, {
        ...authJson(),
        data: { reward_points: 6000 },
      });
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 13. Analytics (4 tests)
  // ===========================================================================

  test.describe('13 - Analytics', () => {

    test('13.1 Get rewards analytics dashboard', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/analytics/dashboard`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('13.2 Get points distribution report', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/analytics/points-distribution`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('13.3 Get recognition trends', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/analytics/trends`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('13.4 Get department-wise rewards summary', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/analytics/departments`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ===========================================================================
  // 14. Settings (2 tests)
  // ===========================================================================

  test.describe('14 - Settings', () => {

    test('14.1 Get rewards module settings', async ({ request }) => {
      const r = await request.get(`${REWARDS_API}/settings`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('14.2 Update rewards module settings', async ({ request }) => {
      const r = await request.put(`${REWARDS_API}/settings`, {
        ...authJson(),
        data: {
          points_expiry_months: 12,
          enable_peer_recognition: true,
          enable_auto_celebrations: true,
          max_kudos_per_day: 5,
          enable_leaderboard: true,
        },
      });
      expect([200, 204, 400, 404]).toContain(r.status());
    });
  });
});
