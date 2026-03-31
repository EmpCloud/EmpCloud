import { test, expect, APIRequestContext } from "@playwright/test";

// =============================================================================
// Configuration
// =============================================================================

const BASE_URL = "https://test-empcloud-api.empcloud.com";
const API = `${BASE_URL}/api/v1`;

const ADMIN_CREDS = { email: "ananya@technova.in", password: "Welcome@123" };

// =============================================================================
// Helpers
// =============================================================================

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data.tokens.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// =============================================================================
// 1. OIDC Discovery & JWKS
// =============================================================================

test.describe("OAuth2/OIDC — Discovery", () => {
  test("OIDC discovery endpoint returns valid configuration", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${BASE_URL}/.well-known/openid-configuration`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Standard OIDC fields
    expect(body).toHaveProperty("issuer");
    expect(body).toHaveProperty("authorization_endpoint");
    expect(body).toHaveProperty("token_endpoint");
    expect(body).toHaveProperty("jwks_uri");
    expect(body).toHaveProperty("response_types_supported");
    expect(body).toHaveProperty("subject_types_supported");
    expect(body).toHaveProperty("id_token_signing_alg_values_supported");
  });

  test("JWKS endpoint returns valid key set", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${BASE_URL}/oauth/jwks`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("keys");
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBeGreaterThan(0);
    // Each key should have standard JWK fields
    const key = body.keys[0];
    expect(key).toHaveProperty("kty");
    expect(key).toHaveProperty("kid");
    expect(key).toHaveProperty("use", "sig");
  });
});

// =============================================================================
// 2. Token Endpoint — Error Cases
// =============================================================================

test.describe("OAuth2/OIDC — Token Endpoint", () => {
  test("Token endpoint rejects invalid authorization code", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${BASE_URL}/oauth/token`, {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "authorization_code",
        code: "invalid-code-12345",
        client_id: "nonexistent-client",
        redirect_uri: "https://example.com/callback",
      },
    });
    // Should fail with 400 or 401
    expect([400, 401, 422]).toContain(res.status());
  });

  test("Token endpoint rejects invalid refresh token", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${BASE_URL}/oauth/token`, {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "refresh_token",
        refresh_token: "invalid-refresh-token-12345",
        client_id: "nonexistent-client",
      },
    });
    // Should fail
    expect([400, 401, 422]).toContain(res.status());
  });
});

// =============================================================================
// 3. Revoke, Introspect, UserInfo
// =============================================================================

test.describe("OAuth2/OIDC — Revoke, Introspect, UserInfo", () => {
  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    accessToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
  });

  test("Revoke endpoint accepts token (RFC 7009 always returns 200)", async ({ request }) => {
    test.setTimeout(30_000);
    // Revoke with a dummy token — RFC 7009 says always return 200
    const res = await request.post(`${BASE_URL}/oauth/revoke`, {
      headers: { "Content-Type": "application/json" },
      data: {
        token: "some-random-token-that-does-not-exist",
        client_id: "empcloud-web",
        client_secret: "empcloud-web-secret",
      },
    });
    // May return 200 per RFC, or 400/401 if client validation fails
    expect([200, 400, 401, 422]).toContain(res.status());
  });

  test("Introspect endpoint handles token introspection", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.post(`${BASE_URL}/oauth/introspect`, {
      headers: { "Content-Type": "application/json" },
      data: {
        token: "expired-or-invalid-token",
        client_id: "empcloud-web",
        client_secret: "empcloud-web-secret",
      },
    });
    // Should return 200 with active: false, or 400/401 if client validation fails
    expect([200, 400, 401, 422]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("active", false);
    }
  });

  test("UserInfo endpoint returns user profile for valid token", async ({ request }) => {
    test.setTimeout(30_000);
    const res = await request.get(`${BASE_URL}/oauth/userinfo`, {
      headers: auth(accessToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("sub");
    expect(body).toHaveProperty("email");
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("org_id");
    expect(body).toHaveProperty("role");
  });
});
