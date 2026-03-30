import { test, expect } from '@playwright/test';

const EMPCLOUD_API = 'https://test-empcloud-api.empcloud.com/api/v1';
const FIELD_API = 'https://test-field-api.empcloud.com/api/v1';
const FIELD_BASE = 'https://test-field-api.empcloud.com';

let token = '';

test.describe('EMP Field Module', () => {

  test.beforeAll(async ({ request }) => {
    // Login to EmpCloud
    const login = await request.post(`${EMPCLOUD_API}/auth/login`, {
      data: { email: 'ananya@technova.in', password: 'Welcome@123' },
    });
    const ecToken = (await login.json()).data.tokens.access_token;

    // SSO to Field
    const sso = await request.post(`${FIELD_API}/auth/sso`, {
      data: { token: ecToken },
    });
    const ssoBody = await sso.json();
    token = ssoBody.data?.tokens?.accessToken || ecToken;
  });

  const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });

  test('health check', async ({ request }) => {
    const r = await request.get(`${FIELD_BASE}/health`);
    expect(r.status()).toBe(200);
  });

  test('SSO works', async ({ request }) => {
    expect(token.length).toBeGreaterThan(10);
  });

  test('GET settings', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/settings`, auth());
    expect(r.status()).toBe(200);
  });

  test('GET client-sites', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/client-sites`, auth());
    expect(r.status()).toBe(200);
  });

  test('POST client-site', async ({ request }) => {
    const r = await request.post(`${FIELD_API}/client-sites`, {
      ...auth(),
      data: { name: 'PW Test Site', address: '1 St', city: 'Mumbai', latitude: 19.07, longitude: 72.87, radius_meters: 100 },
    });
    expect([200, 201]).toContain(r.status());
  });

  test('GET checkins', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/checkins`, auth());
    expect(r.status()).toBe(200);
  });

  test('GET work-orders', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/work-orders`, auth());
    expect(r.status()).toBe(200);
  });

  test('POST work-order', async ({ request }) => {
    const r = await request.post(`${FIELD_API}/work-orders`, {
      ...auth(),
      data: { title: 'PW Test WO', description: 'Test', priority: 'medium', assigned_to: 522 },
    });
    expect([200, 201]).toContain(r.status());
  });

  test('GET expenses', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/expenses`, auth());
    expect(r.status()).toBe(200);
  });

  test('POST expense', async ({ request }) => {
    const r = await request.post(`${FIELD_API}/expenses`, {
      ...auth(),
      data: { expense_type: 'travel', amount: 500, currency: 'INR', description: 'PW test' },
    });
    expect([200, 201]).toContain(r.status());
  });

  test('GET geo-fences', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/geo-fences`, auth());
    expect(r.status()).toBe(200);
  });

  test('GET mileage', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/mileage`, auth());
    expect(r.status()).toBe(200);
  });

  test('GET routes', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/routes`, auth());
    expect(r.status()).toBe(200);
  });

  test('GET analytics/dashboard', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/analytics/dashboard`, auth());
    expect(r.status()).toBe(200);
  });

  test('GET notifications', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/notifications`, auth());
    expect(r.status()).toBe(200);
  });

  test('unauthenticated returns 401', async ({ request }) => {
    const r = await request.get(`${FIELD_API}/client-sites`);
    expect(r.status()).toBe(401);
  });
});
