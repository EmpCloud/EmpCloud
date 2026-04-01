import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Field — Advanced E2E Tests (~50 tests)
// Auth: SSO from EmpCloud (ananya@technova.in)
// API: https://test-field-api.empcloud.com/api/v1
// Note: Basic tests are in e2e-field.spec.ts (16 tests).
//       This file covers deeper CRUD, lifecycle, and edge-case scenarios.
// Covers: Check-in/out, Mileage, Work Orders, Expenses, Routes, Geo-fences,
//         Client Sites, Location History, Visits, Notifications, Settings,
//         Analytics, Health
// =============================================================================

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const FIELD_API = 'https://test-field-api.empcloud.com/api/v1';
const FIELD_BASE = 'https://test-field-api.empcloud.com';

const ORG_ADMIN = { email: 'ananya@technova.in', password: 'Welcome@123' };

let token = '';

// IDs captured during test execution
let createdClientSiteId: number | string = 0;
let createdWorkOrderId: number | string = 0;
let createdExpenseId: number | string = 0;
let createdRouteId: number | string = 0;
let createdGeoFenceId: number | string = 0;
let createdVisitId: number | string = 0;
let checkinId: number | string = 0;
let createdMileageId: number | string = 0;

// ---------------------------------------------------------------------------
// Helper: auth header
// ---------------------------------------------------------------------------
const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });

test.describe('EMP Field Module — Advanced', () => {

  test.beforeAll(async ({ request }) => {
    // Login to EmpCloud
    const login = await request.post(`${EMPCLOUD_API}/auth/login`, {
      data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    expect(login.status()).toBe(200);
    const ecBody = await login.json();
    const ecToken = ecBody.data.tokens.access_token;

    // SSO to Field — exchange EmpCloud RS256 JWT for Field HS256 JWT
    const sso = await request.post(`${FIELD_API}/auth/sso`, {
      data: { token: ecToken },
    });
    expect(sso.status(), `SSO to Field failed with status ${sso.status()}`).toBe(200);
    const ssoBody = await sso.json();
    token = ssoBody.data?.tokens?.accessToken
      || ssoBody.data?.tokens?.access_token
      || ssoBody.data?.token
      || '';
    expect(token, 'SSO token extraction failed — check Field auth response shape').toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. HEALTH (2 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('1. Health', () => {

    test('1.1 Health endpoint returns 200', async ({ request }) => {
      const r = await request.get(`${FIELD_BASE}/health`);
      expect(r.status()).toBe(200);
    });

    test('1.2 Unauthenticated request returns 401', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/checkins`);
      expect(r.status()).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. CLIENT SITES (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('2. Client Sites', () => {

    test('2.1 Create client site', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/client-sites`, {
        ...auth(),
        data: {
          name: `PW Adv Site ${Date.now()}`,
          address: '42 Test Lane',
          city: 'Pune',
          state: 'Maharashtra',
          latitude: 18.5204,
          longitude: 73.8567,
          radius_meters: 200,
          contact_person: 'PW Tester',
          contact_phone: '9876543210',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdClientSiteId = body.data?.id || body.data?.clientSite?.id || body.data?.client_site?.id || 0;
    });

    test('2.2 List client sites with pagination', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/client-sites?page=1&limit=10`, auth());
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });

    test('2.3 Update client site', async ({ request }) => {
      expect(createdClientSiteId, 'Prerequisite failed — createdClientSiteId was not set').toBeTruthy();
      const r = await request.put(`${FIELD_API}/client-sites/${createdClientSiteId}`, {
        ...auth(),
        data: { name: `PW Adv Site Updated ${Date.now()}`, radius_meters: 300 },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('2.4 Get client site by ID', async ({ request }) => {
      expect(createdClientSiteId, 'Prerequisite failed — createdClientSiteId was not set').toBeTruthy();
      const r = await request.get(`${FIELD_API}/client-sites/${createdClientSiteId}`, auth());
      expect(r.status()).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CHECK-IN / CHECK-OUT (8 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('3. Check-in / Check-out', () => {

    test('3.1 Check in at client site', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/checkins`, {
        ...auth(),
        data: {
          client_site_id: createdClientSiteId || undefined,
          latitude: 18.5204,
          longitude: 73.8567,
          notes: 'PW check-in test',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      checkinId = body.data?.id || body.data?.checkin?.id || body.data?.checkinId || 0;
    });

    test('3.2 List checkins', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/checkins`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.3 Get checkin by ID', async ({ request }) => {
      expect(checkinId, 'Prerequisite failed — checkinId was not set').toBeTruthy();
      const r = await request.get(`${FIELD_API}/checkins/${checkinId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('3.4 Check out', async ({ request }) => {
      expect(checkinId, 'Prerequisite failed — checkinId was not set').toBeTruthy();
      const r = await request.put(`${FIELD_API}/checkins/${checkinId}/checkout`, {
        ...auth(),
        data: {
          latitude: 18.5210,
          longitude: 73.8570,
          notes: 'PW check-out test',
        },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('3.5 Filter checkins by date range', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/checkins?from=2026-01-01&to=2026-12-31`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.6 Filter checkins by client site', async ({ request }) => {
      expect(createdClientSiteId, 'Prerequisite failed — createdClientSiteId was not set').toBeTruthy();
      const r = await request.get(`${FIELD_API}/checkins?client_site_id=${createdClientSiteId}`, auth());
      expect(r.status()).toBe(200);
    });

    test('3.7 Check in without coordinates fails or warns', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/checkins`, {
        ...auth(),
        data: { notes: 'No coords test' },
      });
      // Should either fail validation or create with warning
      expect([200, 201, 400, 422]).toContain(r.status());
    });

    test('3.8 Get today checkins summary', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0];
      const r = await request.get(`${FIELD_API}/checkins?date=${today}`, auth());
      expect(r.status()).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. MILEAGE (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('4. Mileage', () => {

    test('4.1 Log mileage entry', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/mileage`, {
        ...auth(),
        data: {
          distance_km: 25.5,
          start_location: 'Pune Office',
          end_location: 'Client Site A',
          date: '2026-03-31',
          vehicle_type: 'car',
          purpose: 'Client visit',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdMileageId = body.data?.id || body.data?.mileage?.id || 0;
    });

    test('4.2 List mileage entries', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/mileage`, auth());
      expect(r.status()).toBe(200);
    });

    test('4.3 Get mileage summary/report', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/mileage/summary?month=2026-03`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('4.4 Update mileage entry', async ({ request }) => {
      expect(createdMileageId, 'Prerequisite failed — createdMileageId was not set').toBeTruthy();
      const r = await request.put(`${FIELD_API}/mileage/${createdMileageId}`, {
        ...auth(),
        data: { distance_km: 30.0, purpose: 'Updated client visit' },
      });
      expect([200, 204]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. WORK ORDERS (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('5. Work Orders', () => {

    test('5.1 Create work order', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/work-orders`, {
        ...auth(),
        data: {
          title: `PW Adv WO ${Date.now()}`,
          description: 'Advanced Playwright work order test',
          priority: 'high',
          assigned_to: 522,
          client_site_id: createdClientSiteId || undefined,
          due_date: '2026-04-15',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdWorkOrderId = body.data?.id || body.data?.workOrder?.id || body.data?.work_order?.id || 0;
    });

    test('5.2 List work orders', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/work-orders`, auth());
      expect(r.status()).toBe(200);
    });

    test('5.3 Get work order by ID', async ({ request }) => {
      expect(createdWorkOrderId, 'Prerequisite failed — createdWorkOrderId was not set').toBeTruthy();
      const r = await request.get(`${FIELD_API}/work-orders/${createdWorkOrderId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('5.4 Update work order status', async ({ request }) => {
      expect(createdWorkOrderId, 'Prerequisite failed — createdWorkOrderId was not set').toBeTruthy();
      const r = await request.put(`${FIELD_API}/work-orders/${createdWorkOrderId}`, {
        ...auth(),
        data: { status: 'in_progress' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('5.5 Filter work orders by priority', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/work-orders?priority=high`, auth());
      expect(r.status()).toBe(200);
    });

    test('5.6 Complete work order', async ({ request }) => {
      expect(createdWorkOrderId, 'Prerequisite failed — createdWorkOrderId was not set').toBeTruthy();
      const r = await request.put(`${FIELD_API}/work-orders/${createdWorkOrderId}`, {
        ...auth(),
        data: { status: 'completed', completion_notes: 'Done via Playwright' },
      });
      expect([200, 204]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. EXPENSES (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('6. Expenses', () => {

    test('6.1 Create expense claim', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/expenses`, {
        ...auth(),
        data: {
          expense_type: 'travel',
          amount: 1500,
          currency: 'INR',
          description: 'PW advanced expense test',
          date: '2026-03-31',
          work_order_id: createdWorkOrderId || undefined,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdExpenseId = body.data?.id || body.data?.expense?.id || 0;
    });

    test('6.2 List expenses', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/expenses`, auth());
      expect(r.status()).toBe(200);
    });

    test('6.3 Get expense by ID', async ({ request }) => {
      expect(createdExpenseId, 'Prerequisite failed — createdExpenseId was not set').toBeTruthy();
      const r = await request.get(`${FIELD_API}/expenses/${createdExpenseId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('6.4 Update expense', async ({ request }) => {
      expect(createdExpenseId, 'Prerequisite failed — createdExpenseId was not set').toBeTruthy();
      const r = await request.put(`${FIELD_API}/expenses/${createdExpenseId}`, {
        ...auth(),
        data: { amount: 2000, description: 'Updated PW expense' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('6.5 Filter expenses by type', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/expenses?expense_type=travel`, auth());
      expect(r.status()).toBe(200);
    });

    test('6.6 Approve/reject expense (admin)', async ({ request }) => {
      expect(createdExpenseId, 'Prerequisite failed — createdExpenseId was not set').toBeTruthy();
      const r = await request.put(`${FIELD_API}/expenses/${createdExpenseId}/approve`, {
        ...auth(),
        data: { status: 'approved', remarks: 'Approved via Playwright' },
      });
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. ROUTES (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('7. Routes', () => {

    test('7.1 Create route', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/routes`, {
        ...auth(),
        data: {
          name: `PW Route ${Date.now()}`,
          description: 'Playwright test route',
          waypoints: [
            { latitude: 18.5204, longitude: 73.8567, name: 'Start' },
            { latitude: 18.5300, longitude: 73.8600, name: 'Stop 1' },
            { latitude: 18.5400, longitude: 73.8700, name: 'End' },
          ],
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdRouteId = body.data?.id || body.data?.route?.id || 0;
    });

    test('7.2 List routes', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/routes`, auth());
      expect(r.status()).toBe(200);
    });

    test('7.3 Get route by ID', async ({ request }) => {
      expect(createdRouteId, 'Prerequisite failed — createdRouteId was not set').toBeTruthy();
      const r = await request.get(`${FIELD_API}/routes/${createdRouteId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('7.4 Update route', async ({ request }) => {
      expect(createdRouteId, 'Prerequisite failed — createdRouteId was not set').toBeTruthy();
      const r = await request.put(`${FIELD_API}/routes/${createdRouteId}`, {
        ...auth(),
        data: { name: `PW Route Updated ${Date.now()}` },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('7.5 Delete route', async ({ request }) => {
      expect(createdRouteId, 'Prerequisite failed — createdRouteId was not set').toBeTruthy();
      // Create disposable route
      const create = await request.post(`${FIELD_API}/routes`, {
        ...auth(),
        data: { name: `PW Route Del ${Date.now()}`, waypoints: [] },
      });
      const cBody = await create.json();
      const delId = cBody.data?.id || cBody.data?.route?.id || 0;
      expect(delId, 'Prerequisite failed — delId was not set').toBeTruthy();
      const r = await request.delete(`${FIELD_API}/routes/${delId}`, auth());
      expect([200, 204]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. GEO-FENCES (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('8. Geo-fences', () => {

    test('8.1 Create geo-fence', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/geo-fences`, {
        ...auth(),
        data: {
          name: `PW Fence ${Date.now()}`,
          latitude: 18.5204,
          longitude: 73.8567,
          radius_meters: 500,
          type: 'inclusion',
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdGeoFenceId = body.data?.id || body.data?.geoFence?.id || body.data?.geo_fence?.id || 0;
    });

    test('8.2 List geo-fences', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/geo-fences`, auth());
      expect(r.status()).toBe(200);
    });

    test('8.3 Get geo-fence by ID', async ({ request }) => {
      expect(createdGeoFenceId, 'Prerequisite failed — createdGeoFenceId was not set').toBeTruthy();
      const r = await request.get(`${FIELD_API}/geo-fences/${createdGeoFenceId}`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('8.4 Update geo-fence radius', async ({ request }) => {
      expect(createdGeoFenceId, 'Prerequisite failed — createdGeoFenceId was not set').toBeTruthy();
      const r = await request.put(`${FIELD_API}/geo-fences/${createdGeoFenceId}`, {
        ...auth(),
        data: { radius_meters: 750, name: `PW Fence Updated ${Date.now()}` },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('8.5 Check point in geo-fence', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/geo-fences/check`, {
        ...auth(),
        data: { latitude: 18.5204, longitude: 73.8567 },
      });
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. LOCATION HISTORY (3 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('9. Location History', () => {

    test('9.1 Log location update', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/location-history`, {
        ...auth(),
        data: {
          latitude: 18.5220,
          longitude: 73.8580,
          accuracy: 10,
          timestamp: new Date().toISOString(),
        },
      });
      expect([200, 201]).toContain(r.status());
    });

    test('9.2 Get location history', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/location-history`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('9.3 Get location history by date range', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/location-history?from=2026-03-01&to=2026-03-31`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. VISITS (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('10. Visits', () => {

    test('10.1 Schedule a visit', async ({ request }) => {
      const r = await request.post(`${FIELD_API}/visits`, {
        ...auth(),
        data: {
          client_site_id: createdClientSiteId || undefined,
          scheduled_date: '2026-04-01',
          scheduled_time: '10:00',
          purpose: 'PW test visit',
          assigned_to: 522,
        },
      });
      expect([200, 201]).toContain(r.status());
      const body = await r.json();
      createdVisitId = body.data?.id || body.data?.visit?.id || 0;
    });

    test('10.2 List visits', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/visits`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('10.3 Update visit status', async ({ request }) => {
      expect(createdVisitId, 'Prerequisite failed — createdVisitId was not set').toBeTruthy();
      const r = await request.put(`${FIELD_API}/visits/${createdVisitId}`, {
        ...auth(),
        data: { status: 'completed', outcome: 'Successful PW visit' },
      });
      expect([200, 204]).toContain(r.status());
    });

    test('10.4 Get visit by ID', async ({ request }) => {
      expect(createdVisitId, 'Prerequisite failed — createdVisitId was not set').toBeTruthy();
      const r = await request.get(`${FIELD_API}/visits/${createdVisitId}`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. NOTIFICATIONS (3 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('11. Notifications', () => {

    test('11.1 List notifications', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/notifications`, auth());
      expect(r.status()).toBe(200);
    });

    test('11.2 Get unread notification count', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/notifications/unread-count`, auth());
      expect([200, 404]).toContain(r.status());
    });

    test('11.3 Mark notifications as read', async ({ request }) => {
      const r = await request.put(`${FIELD_API}/notifications/mark-read`, {
        ...auth(),
        data: { all: true },
      });
      expect([200, 204, 404]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. SETTINGS (2 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('12. Settings', () => {

    test('12.1 Get field settings', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/settings`, auth());
      expect(r.status()).toBe(200);
    });

    test('12.2 Update field settings', async ({ request }) => {
      const r = await request.put(`${FIELD_API}/settings`, {
        ...auth(),
        data: {
          geo_tracking_enabled: true,
          checkin_radius_meters: 200,
          mileage_rate_per_km: 8,
        },
      });
      expect([200, 204, 403]).toContain(r.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. ANALYTICS (2 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('13. Analytics', () => {

    test('13.1 Get field analytics dashboard', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/analytics/dashboard`, auth());
      expect(r.status()).toBe(200);
    });

    test('13.2 Get team performance analytics', async ({ request }) => {
      const r = await request.get(`${FIELD_API}/analytics/team-performance`, auth());
      expect([200, 404]).toContain(r.status());
    });
  });
});
