import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/connection", () => {
  const chain: any = new Proxy({} as any, {
    get(_target: any, prop: string) {
      if (prop === "then" || prop === "catch") return undefined;
      if (!_target[prop]) {
        _target[prop] = vi.fn(function() { return chain; });
      }
      return _target[prop];
    }
  });
  chain.first = vi.fn(() => Promise.resolve(null));
  chain.insert = vi.fn(() => Promise.resolve([1]));
  chain.update = vi.fn(() => Promise.resolve(1));
  chain.delete = vi.fn(() => Promise.resolve(1));
  chain.count = vi.fn(() => chain);
  const db: any = vi.fn(() => chain);
  db.raw = vi.fn(() => Promise.resolve([[], []]));
  db.transaction = vi.fn((cb: any) => cb(db));
  db._chain = chain;
  return { getDB: vi.fn(() => db), initDB: vi.fn() };
});

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../utils/crypto", () => ({
  randomBase64Url: vi.fn(() => "mock-random-base64"),
  hashToken: vi.fn((t: string) => `hashed_${t}`),
  verifyPKCE: vi.fn(() => true),
  sha256: vi.fn(() => "mock-sha256"),
}));

vi.mock("../../config/index", () => ({
  config: {
    oauth: {
      issuer: "https://test.empcloud.com",
      authCodeExpiry: "10m",
      accessTokenExpiry: "1h",
      refreshTokenExpiry: "7d",
    },
  },
}));

vi.mock("./jwt.service", () => ({
  signAccessToken: vi.fn(() => "mock-access-token"),
  signIDToken: vi.fn(() => "mock-id-token"),
  parseExpiry: vi.fn((s: string) => {
    if (s === "10m") return 600;
    if (s === "1h") return 3600;
    if (s === "7d") return 604800;
    return 3600;
  }),
  verifyAccessToken: vi.fn(() => ({
    sub: 1, org_id: 1, email: "test@test.com", role: "employee",
    scope: "openid profile", client_id: "test-client", jti: "test-jti",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: "https://test.empcloud.com",
  })),
}));

vi.mock("uuid", () => ({ v4: vi.fn(() => "mock-uuid") }));

import { getDB } from "../../db/connection.js";
import {
  findClientById, validateClient, createAuthorizationCode,
  exchangeAuthorizationCode, issueTokens, refreshAccessToken,
  revokeToken, introspectToken, getOpenIDConfiguration,
} from "../../services/oauth/oauth.service.js";
import { verifyPKCE } from "../../utils/crypto.js";

describe("OAuth Service Coverage", () => {
  let chain: any;
  beforeEach(() => {
    vi.clearAllMocks();
    const db: any = getDB();
    chain = db._chain;
  });

  describe("findClientById", () => {
    it("returns client when found", async () => {
      chain.first.mockResolvedValueOnce({ client_id: "c1", is_active: true });
      const r = await findClientById("c1");
      expect(r).toBeTruthy();
    });
    it("returns null when not found", async () => {
      chain.first.mockResolvedValueOnce(null);
      const r = await findClientById("x");
      expect(r).toBeNull();
    });
  });

  describe("validateClient", () => {
    it("throws on unknown client", async () => {
      chain.first.mockResolvedValueOnce(null);
      await expect(validateClient("bad")).rejects.toThrow("Unknown client_id");
    });
    it("throws on missing secret for confidential", async () => {
      chain.first.mockResolvedValueOnce({ client_id: "c1", is_confidential: true });
      await expect(validateClient("c1")).rejects.toThrow("client_secret required");
    });
    it("throws on wrong secret", async () => {
      chain.first.mockResolvedValueOnce({ client_id: "c1", is_confidential: true, client_secret_hash: "hashed_correct" });
      await expect(validateClient("c1", "wrong")).rejects.toThrow("Invalid client_secret");
    });
    it("throws on invalid redirect_uri", async () => {
      chain.first.mockResolvedValueOnce({ client_id: "c1", is_confidential: false, redirect_uris: '["https://ok.com"]' });
      await expect(validateClient("c1", undefined, "https://evil.com")).rejects.toThrow("Invalid redirect_uri");
    });
    it("succeeds with valid credentials", async () => {
      chain.first.mockResolvedValueOnce({ client_id: "c1", is_confidential: true, client_secret_hash: "hashed_secret", redirect_uris: '["https://ok.com"]' });
      const r = await validateClient("c1", "secret", "https://ok.com");
      expect(r.client_id).toBe("c1");
    });
  });

  describe("createAuthorizationCode", () => {
    it("creates code with all params", async () => {
      chain.insert.mockResolvedValueOnce([1]);
      const code = await createAuthorizationCode({
        clientId: "c1", userId: 1, organizationId: 1, redirectUri: "https://ok.com",
        scope: "openid", codeChallenge: "ch", codeChallengeMethod: "S256", nonce: "n",
      });
      expect(code).toBe("mock-random-base64");
    });
    it("creates code without optional params", async () => {
      chain.insert.mockResolvedValueOnce([1]);
      const code = await createAuthorizationCode({
        clientId: "c1", userId: 1, organizationId: 1, redirectUri: "https://ok.com", scope: "openid",
      });
      expect(code).toBe("mock-random-base64");
    });
  });

  describe("exchangeAuthorizationCode", () => {
    it("throws on invalid code", async () => {
      chain.first.mockResolvedValueOnce(null);
      await expect(exchangeAuthorizationCode({ code: "bad", clientId: "c1", redirectUri: "x" })).rejects.toThrow("Invalid authorization code");
    });
    it("throws on reused code", async () => {
      chain.first.mockResolvedValueOnce({ used_at: new Date() });
      await expect(exchangeAuthorizationCode({ code: "r", clientId: "c1", redirectUri: "x" })).rejects.toThrow("already used");
    });
    it("throws on expired code", async () => {
      chain.first.mockResolvedValueOnce({ used_at: null, expires_at: new Date(Date.now() - 100000) });
      await expect(exchangeAuthorizationCode({ code: "e", clientId: "c1", redirectUri: "x" })).rejects.toThrow("expired");
    });
    it("throws on redirect_uri mismatch", async () => {
      chain.first.mockResolvedValueOnce({ used_at: null, expires_at: new Date(Date.now() + 100000), redirect_uri: "https://a.com" });
      await expect(exchangeAuthorizationCode({ code: "c", clientId: "c1", redirectUri: "https://b.com" })).rejects.toThrow("mismatch");
    });
    it("throws when code_verifier missing but required", async () => {
      chain.first.mockResolvedValueOnce({ used_at: null, expires_at: new Date(Date.now() + 100000), redirect_uri: "https://ok.com", code_challenge: "ch" });
      await expect(exchangeAuthorizationCode({ code: "c", clientId: "c1", redirectUri: "https://ok.com" })).rejects.toThrow("code_verifier required");
    });
    it("throws on PKCE failure", async () => {
      vi.mocked(verifyPKCE).mockReturnValueOnce(false);
      chain.first.mockResolvedValueOnce({ used_at: null, expires_at: new Date(Date.now() + 100000), redirect_uri: "https://ok.com", code_challenge: "ch", code_challenge_method: "S256" });
      await expect(exchangeAuthorizationCode({ code: "c", clientId: "c1", redirectUri: "https://ok.com", codeVerifier: "bad" })).rejects.toThrow("PKCE verification failed");
    });
    it("throws when user not found after exchange", async () => {
      chain.first.mockResolvedValueOnce({ id: 1, used_at: null, expires_at: new Date(Date.now() + 100000), redirect_uri: "https://ok.com", user_id: 1, organization_id: 1, scope: "openid", nonce: null })
        .mockResolvedValueOnce(null);
      chain.update.mockResolvedValueOnce(1);
      await expect(exchangeAuthorizationCode({ code: "c", clientId: "c1", redirectUri: "https://ok.com" })).rejects.toThrow("User or organization not found");
    });
    it("succeeds with valid code and PKCE", async () => {
      vi.mocked(verifyPKCE).mockReturnValueOnce(true);
      chain.first
        .mockResolvedValueOnce({ id: 1, used_at: null, expires_at: new Date(Date.now() + 100000), redirect_uri: "https://ok.com", code_challenge: "ch", code_challenge_method: "S256", user_id: 1, organization_id: 1, scope: "openid profile", nonce: "n" })
        .mockResolvedValueOnce({ id: 1, email: "a@a.com", role: "employee", first_name: "A", last_name: "B" })
        .mockResolvedValueOnce({ id: 1, name: "Org" });
      chain.update.mockResolvedValueOnce(1);
      chain.insert.mockResolvedValueOnce([1]).mockResolvedValueOnce([1]);
      const r = await exchangeAuthorizationCode({ code: "v", clientId: "c1", redirectUri: "https://ok.com", codeVerifier: "v" });
      expect(r.access_token).toBe("mock-access-token");
    });
  });

  describe("issueTokens", () => {
    it("issues tokens with openid scope", async () => {
      chain.insert.mockResolvedValueOnce([1]).mockResolvedValueOnce([1]);
      const r = await issueTokens({ userId: 1, orgId: 1, email: "a@a.com", role: "employee" as any, firstName: "A", lastName: "B", orgName: "O", scope: "openid profile email", clientId: "c1", nonce: "n" });
      expect(r.id_token).toBe("mock-id-token");
    });
    it("issues tokens without id_token when no openid", async () => {
      chain.insert.mockResolvedValueOnce([1]).mockResolvedValueOnce([1]);
      const r = await issueTokens({ userId: 1, orgId: 1, email: "a@a.com", role: "employee" as any, firstName: "A", lastName: "B", orgName: "O", scope: "profile", clientId: "c1" });
      expect(r.id_token).toBeUndefined();
    });
  });

  describe("refreshAccessToken", () => {
    it("throws on invalid refresh token", async () => {
      chain.first.mockResolvedValueOnce(null);
      await expect(refreshAccessToken({ refreshToken: "bad", clientId: "c1" })).rejects.toThrow("Invalid refresh token");
    });
    it("throws and revokes family on reuse", async () => {
      chain.first.mockResolvedValueOnce({ revoked_at: new Date(), family_id: "f1" });
      chain.update.mockResolvedValueOnce(5);
      await expect(refreshAccessToken({ refreshToken: "reused", clientId: "c1" })).rejects.toThrow("reuse detected");
    });
    it("throws on expired token", async () => {
      chain.first.mockResolvedValueOnce({ revoked_at: null, expires_at: new Date(Date.now() - 100000) });
      await expect(refreshAccessToken({ refreshToken: "exp", clientId: "c1" })).rejects.toThrow("expired");
    });
    it("throws when user not found", async () => {
      chain.first.mockResolvedValueOnce({ id: 1, revoked_at: null, expires_at: new Date(Date.now() + 100000), user_id: 1, organization_id: 1, scope: "openid", family_id: "f1" })
        .mockResolvedValueOnce(null);
      chain.update.mockResolvedValueOnce(1);
      await expect(refreshAccessToken({ refreshToken: "v", clientId: "c1" })).rejects.toThrow("User or organization not found");
    });
    it("succeeds", async () => {
      chain.first
        .mockResolvedValueOnce({ id: 1, revoked_at: null, expires_at: new Date(Date.now() + 100000), user_id: 1, organization_id: 1, scope: "openid", family_id: "f1" })
        .mockResolvedValueOnce({ id: 1, email: "a@a.com", role: "employee", first_name: "A", last_name: "B" })
        .mockResolvedValueOnce({ id: 1, name: "Org" });
      chain.update.mockResolvedValueOnce(1);
      chain.insert.mockResolvedValueOnce([2]).mockResolvedValueOnce([2]);
      const r = await refreshAccessToken({ refreshToken: "v", clientId: "c1" });
      expect(r.access_token).toBe("mock-access-token");
    });
  });

  describe("revokeToken", () => {
    it("revokes refresh token", async () => {
      chain.update.mockResolvedValueOnce(1);
      await revokeToken({ token: "rt", tokenTypeHint: "refresh_token", clientId: "c1" });
    });
    it("revokes access token", async () => {
      chain.update.mockResolvedValueOnce(1);
      await revokeToken({ token: "at", tokenTypeHint: "access_token", clientId: "c1" });
    });
    it("tries both when no hint", async () => {
      chain.update.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      await revokeToken({ token: "x", clientId: "c1" });
    });
  });

  describe("introspectToken", () => {
    it("returns active for valid access token", async () => {
      chain.first.mockResolvedValueOnce({ jti: "test-jti", revoked_at: null });
      const r: any = await introspectToken({ token: "v" });
      expect(r.active).toBe(true);
    });
    it("returns inactive for revoked access token", async () => {
      chain.first.mockResolvedValueOnce({ jti: "test-jti", revoked_at: new Date() });
      const r: any = await introspectToken({ token: "v" });
      expect(r.active).toBe(false);
    });
    it("checks refresh token when access invalid", async () => {
      const { verifyAccessToken } = await import("../../services/oauth/jwt.service.js");
      vi.mocked(verifyAccessToken).mockImplementationOnce(() => { throw new Error("bad"); });
      chain.first.mockResolvedValueOnce({ revoked_at: null, expires_at: new Date(Date.now() + 100000), scope: "openid", client_id: "c1", user_id: 1 });
      const r: any = await introspectToken({ token: "rt" });
      expect(r.active).toBe(true);
    });
    it("returns inactive when nothing matches", async () => {
      const { verifyAccessToken } = await import("../../services/oauth/jwt.service.js");
      vi.mocked(verifyAccessToken).mockImplementationOnce(() => { throw new Error("bad"); });
      chain.first.mockResolvedValueOnce(null);
      const r: any = await introspectToken({ token: "garbage" });
      expect(r.active).toBe(false);
    });
  });

  describe("getOpenIDConfiguration", () => {
    it("returns OIDC config", () => {
      const c: any = getOpenIDConfiguration();
      expect(c.issuer).toBe("https://test.empcloud.com");
      expect(c.scopes_supported).toContain("openid");
      expect(c.code_challenge_methods_supported).toContain("S256");
    });
  });
});
