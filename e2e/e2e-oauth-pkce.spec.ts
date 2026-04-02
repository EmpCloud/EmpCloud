import { test, expect, APIRequestContext } from "@playwright/test";
import crypto from "crypto";

// =============================================================================
// EMP Cloud — OAuth2 PKCE Flow E2E Tests
// Tests: PKCE enforcement, authorization code flow, code reuse, redirect_uri
// =============================================================================

const BASE_URL = "https://test-empcloud-api.empcloud.com";
const API = `${BASE_URL}/api/v1`;

const ADMIN_CREDS = { email: "ananya@technova.in", password: "Welcome@123" };

// The empcloud-dashboard client is a public (non-confidential) OAuth client
const PUBLIC_CLIENT_ID = "empcloud-dashboard";
const REDIRECT_URI = "https://test-empcloud.empcloud.com/callback";

// =============================================================================
// Helpers
// =============================================================================

async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string
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

/** Generate a PKCE code_verifier (43-128 chars, base64url) */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Generate code_challenge from code_verifier using S256 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// =============================================================================
// 1. PKCE Enforcement for Public Clients
// =============================================================================

test.describe("OAuth2 PKCE Flow", () => {
  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    accessToken = await loginAndGetToken(request, ADMIN_CREDS.email, ADMIN_CREDS.password);
  });

  test("GET /oauth/authorize without PKCE for public client returns error", async ({ request }) => {
    test.setTimeout(30_000);
    // Public client must provide code_challenge — omit it to trigger error
    const res = await request.get(`${BASE_URL}/oauth/authorize`, {
      headers: auth(accessToken),
      params: {
        response_type: "code",
        client_id: PUBLIC_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: "openid profile email",
        state: "test-state-123",
        // Deliberately no code_challenge
      },
      maxRedirects: 0,
    });
    // Should return an error (400 or redirect with error param)
    const status = res.status();
    if (status >= 300 && status < 400) {
      // If it redirects, the error should be in the URL
      const location = res.headers()["location"] || "";
      expect(location).toContain("error");
    } else {
      // Direct error response
      expect([400, 403]).toContain(status);
    }
  });

  test("GET /oauth/authorize with valid PKCE returns authorization code via redirect", async ({ request }) => {
    test.setTimeout(30_000);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const res = await request.get(`${BASE_URL}/oauth/authorize`, {
      headers: auth(accessToken),
      params: {
        response_type: "code",
        client_id: PUBLIC_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: "openid profile email",
        state: "pkce-test-state",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      },
      maxRedirects: 0,
    });
    // Should redirect with authorization code
    expect(res.status()).toBe(302);
    const location = res.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toContain("code=");
    expect(location).toContain("state=pkce-test-state");
  });

  // =========================================================================
  // 2. Token Exchange with PKCE
  // =========================================================================

  test("POST /oauth/token with valid code + code_verifier returns tokens", async ({ request }) => {
    test.setTimeout(30_000);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Step 1: Get authorization code
    const authRes = await request.get(`${BASE_URL}/oauth/authorize`, {
      headers: auth(accessToken),
      params: {
        response_type: "code",
        client_id: PUBLIC_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: "openid profile email",
        state: "token-test",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      },
      maxRedirects: 0,
    });
    expect(authRes.status()).toBe(302);
    const location = authRes.headers()["location"];
    const url = new URL(location);
    const code = url.searchParams.get("code");
    expect(code).toBeTruthy();

    // Step 2: Exchange code for tokens
    const tokenRes = await request.post(`${BASE_URL}/oauth/token`, {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: PUBLIC_CLIENT_ID,
        code_verifier: codeVerifier,
      },
    });
    expect(tokenRes.status()).toBe(200);
    const body = await tokenRes.json();
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.token_type).toBe("Bearer");
    expect(body.scope).toContain("openid");
    // Should have id_token since we requested openid scope
    expect(body.id_token).toBeTruthy();
  });

  test("POST /oauth/token with wrong code_verifier returns error", async ({ request }) => {
    test.setTimeout(30_000);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const wrongVerifier = generateCodeVerifier(); // different verifier

    // Get authorization code
    const authRes = await request.get(`${BASE_URL}/oauth/authorize`, {
      headers: auth(accessToken),
      params: {
        response_type: "code",
        client_id: PUBLIC_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: "openid profile",
        state: "wrong-verifier-test",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      },
      maxRedirects: 0,
    });
    expect(authRes.status()).toBe(302);
    const location = authRes.headers()["location"];
    const url = new URL(location);
    const code = url.searchParams.get("code");

    // Exchange with WRONG verifier
    const tokenRes = await request.post(`${BASE_URL}/oauth/token`, {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: PUBLIC_CLIENT_ID,
        code_verifier: wrongVerifier,
      },
    });
    expect(tokenRes.status()).toBe(400);
    const body = await tokenRes.json();
    expect(body.error).toBeTruthy();
  });

  test("POST /oauth/token reuse authorization code returns error", async ({ request }) => {
    test.setTimeout(30_000);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Get authorization code
    const authRes = await request.get(`${BASE_URL}/oauth/authorize`, {
      headers: auth(accessToken),
      params: {
        response_type: "code",
        client_id: PUBLIC_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: "openid profile",
        state: "reuse-test",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      },
      maxRedirects: 0,
    });
    expect(authRes.status()).toBe(302);
    const location = authRes.headers()["location"];
    const url = new URL(location);
    const code = url.searchParams.get("code");

    // First exchange — should succeed
    const tokenRes1 = await request.post(`${BASE_URL}/oauth/token`, {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: PUBLIC_CLIENT_ID,
        code_verifier: codeVerifier,
      },
    });
    expect(tokenRes1.status()).toBe(200);

    // Second exchange with SAME code — should fail
    const tokenRes2 = await request.post(`${BASE_URL}/oauth/token`, {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: PUBLIC_CLIENT_ID,
        code_verifier: codeVerifier,
      },
    });
    expect(tokenRes2.status()).toBe(400);
    const body = await tokenRes2.json();
    expect(body.error).toBeTruthy();
  });

  test("POST /oauth/token with wrong redirect_uri returns error", async ({ request }) => {
    test.setTimeout(30_000);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Get authorization code
    const authRes = await request.get(`${BASE_URL}/oauth/authorize`, {
      headers: auth(accessToken),
      params: {
        response_type: "code",
        client_id: PUBLIC_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: "openid profile",
        state: "redirect-test",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      },
      maxRedirects: 0,
    });
    expect(authRes.status()).toBe(302);
    const location = authRes.headers()["location"];
    const url = new URL(location);
    const code = url.searchParams.get("code");

    // Exchange with WRONG redirect_uri
    const tokenRes = await request.post(`${BASE_URL}/oauth/token`, {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://evil.example.com/callback",
        client_id: PUBLIC_CLIENT_ID,
        code_verifier: codeVerifier,
      },
    });
    expect(tokenRes.status()).toBe(400);
    const body = await tokenRes.json();
    expect(body.error).toBeTruthy();
  });

  test("POST /oauth/token with invalid code returns error", async ({ request }) => {
    test.setTimeout(30_000);
    const tokenRes = await request.post(`${BASE_URL}/oauth/token`, {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "authorization_code",
        code: "completely-invalid-code",
        redirect_uri: REDIRECT_URI,
        client_id: PUBLIC_CLIENT_ID,
        code_verifier: generateCodeVerifier(),
      },
    });
    expect(tokenRes.status()).toBe(400);
  });

  test("POST /oauth/token without code_verifier when PKCE was used returns error", async ({ request }) => {
    test.setTimeout(30_000);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Get authorization code with PKCE
    const authRes = await request.get(`${BASE_URL}/oauth/authorize`, {
      headers: auth(accessToken),
      params: {
        response_type: "code",
        client_id: PUBLIC_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: "openid profile",
        state: "no-verifier-test",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      },
      maxRedirects: 0,
    });
    expect(authRes.status()).toBe(302);
    const location = authRes.headers()["location"];
    const url = new URL(location);
    const code = url.searchParams.get("code");

    // Exchange WITHOUT code_verifier — should fail
    const tokenRes = await request.post(`${BASE_URL}/oauth/token`, {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: PUBLIC_CLIENT_ID,
        // Deliberately no code_verifier
      },
    });
    expect(tokenRes.status()).toBe(400);
  });
});
