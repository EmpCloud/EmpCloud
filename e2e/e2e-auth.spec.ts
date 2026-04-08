import { test, expect } from '@playwright/test';

// =============================================================================
// EMP Cloud — Authentication E2E Tests
// Tests: login, /auth/me, token refresh, forgot-password, unauthenticated access
// =============================================================================

const API_BASE = 'https://test-empcloud-api.empcloud.com/api/v1';
const OAUTH_BASE = 'https://test-empcloud-api.empcloud.com';

const SUPER_ADMIN = { email: 'admin@empcloud.com', password: process.env.TEST_SUPER_ADMIN_PASSWORD || 'SuperAdmin@123' };
const ORG_ADMIN = { email: 'ananya@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };
const EMPLOYEE = { email: 'arjun@technova.in', password: process.env.TEST_USER_PASSWORD || 'Welcome@123' };

test.describe('Authentication Module', () => {
  // ─── Login Tests ────────────────────────────────────────────────────────────

  test.describe('POST /auth/login', () => {
    test('login with super admin credentials returns 200', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/auth/login`, {
        data: { email: SUPER_ADMIN.email, password: SUPER_ADMIN.password },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.tokens).toBeDefined();
      expect(body.data.tokens.access_token).toBeTruthy();
      expect(body.data.tokens.refresh_token).toBeTruthy();
      expect(body.data.user).toBeDefined();
      expect(body.data.user.email).toBe(SUPER_ADMIN.email);
    });

    test('login with org admin credentials returns 200', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/auth/login`, {
        data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.tokens.access_token).toBeTruthy();
      expect(body.data.user.email).toBe(ORG_ADMIN.email);
    });

    test('login with employee credentials returns 200', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/auth/login`, {
        data: { email: EMPLOYEE.email, password: EMPLOYEE.password },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.tokens.access_token).toBeTruthy();
      expect(body.data.user.email).toBe(EMPLOYEE.email);
    });

    test('login with wrong password returns 401', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/auth/login`, {
        data: { email: ORG_ADMIN.email, password: 'WrongPassword@999' },
      });
      expect(resp.status()).toBe(401);
      const body = await resp.json();
      expect(body.success).toBe(false);
    });

    test('login with non-existent email returns 401', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/auth/login`, {
        data: { email: 'nobody@nonexistent.com', password: 'Whatever@123' },
      });
      expect(resp.status()).toBe(401);
      const body = await resp.json();
      expect(body.success).toBe(false);
    });

    test('login with empty body returns 400', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/auth/login`, {
        data: {},
      });
      expect(resp.status()).toBe(400);
    });
  });

  // ─── /auth/me Tests ─────────────────────────────────────────────────────────

  test.describe('GET /auth/me', () => {
    test('returns current user profile with valid token', async ({ request }) => {
      // Login first
      const loginResp = await request.post(`${API_BASE}/auth/login`, {
        data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
      });
      const loginData = await loginResp.json();
      const token = loginData.data.tokens.access_token;

      const resp = await request.get(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe(ORG_ADMIN.email);
    });

    test('returns 401 without token', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/auth/me`);
      expect(resp.status()).toBe(401);
    });

    test('returns 401 with malformed token', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/auth/me`, {
        headers: { Authorization: 'Bearer not.a.valid.jwt.token' },
      });
      expect(resp.status()).toBe(401);
    });
  });

  // ─── Token Refresh Tests ───────────────────────────────────────────────────

  test.describe('POST /oauth/token (refresh)', () => {
    test('refresh token returns new access token', async ({ request }) => {
      // Login to get tokens
      const loginResp = await request.post(`${API_BASE}/auth/login`, {
        data: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
      });
      const loginData = await loginResp.json();
      const refreshToken = loginData.data.tokens.refresh_token;

      const resp = await request.post(`${OAUTH_BASE}/oauth/token`, {
        data: {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: 'empcloud-dashboard',
        },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.access_token).toBeTruthy();
      expect(body.refresh_token).toBeTruthy();
      expect(body.token_type).toBe('Bearer');
    });

    test('invalid refresh token returns error', async ({ request }) => {
      const resp = await request.post(`${OAUTH_BASE}/oauth/token`, {
        data: {
          grant_type: 'refresh_token',
          refresh_token: 'invalid-refresh-token-value',
          client_id: 'empcloud-dashboard',
        },
      });
      // Should be 400 or 401 (invalid grant)
      expect(resp.status()).toBeGreaterThanOrEqual(400);
    });
  });

  // ─── Forgot Password Tests ────────────────────────────────────────────────

  test.describe('POST /auth/forgot-password', () => {
    test('valid email returns 200', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/auth/forgot-password`, {
        data: { email: ORG_ADMIN.email },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });

    test('non-existent email still returns 200 (no information leak)', async ({ request }) => {
      const resp = await request.post(`${API_BASE}/auth/forgot-password`, {
        data: { email: 'doesnotexist@nowhere.com' },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Unauthenticated Access Control ────────────────────────────────────────

  test.describe('Unauthenticated access control', () => {
    test('GET /employees without token returns 401', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees`);
      expect(resp.status()).toBe(401);
    });

    test('GET /employees with malformed token returns 401', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/employees`, {
        headers: { Authorization: 'Bearer garbage.token.here' },
      });
      expect(resp.status()).toBe(401);
    });

    test('GET /attendance/dashboard without token returns 401', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/attendance/dashboard`);
      expect(resp.status()).toBe(401);
    });

    test('GET /leave/types without token returns 401', async ({ request }) => {
      const resp = await request.get(`${API_BASE}/leave/types`);
      expect(resp.status()).toBe(401);
    });
  });
});
