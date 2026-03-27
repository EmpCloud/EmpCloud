// =============================================================================
// EMP CLOUD — Auth Service Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the service under test
// ---------------------------------------------------------------------------

const mockChain: any = {};
const chainMethods = [
  "select", "where", "andWhere", "orWhere", "whereRaw", "whereNull",
  "first", "insert", "update", "del", "count", "join", "leftJoin",
  "orderBy", "limit", "offset", "groupBy", "raw", "clone",
];
chainMethods.forEach((m) => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
// Terminal methods default
mockChain.first = vi.fn().mockResolvedValue(null);

const mockDb: any = vi.fn().mockReturnValue(mockChain);
mockDb.raw = vi.fn();
mockDb.transaction = vi.fn();

vi.mock("../../db/connection.js", () => ({
  getDB: vi.fn(() => mockDb),
}));

vi.mock("../../utils/crypto.js", () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed_${pw}`),
  verifyPassword: vi.fn(async (plain: string, hash: string) => hash === `hashed_${plain}`),
  randomHex: vi.fn(() => "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"),
  hashToken: vi.fn((t: string) => `tokenhash_${t}`),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../oauth/oauth.service.js", () => ({
  issueTokens: vi.fn(async () => ({
    access_token: "mock_access_token",
    refresh_token: "mock_refresh_token",
    token_type: "Bearer",
    expires_in: 3600,
  })),
}));

vi.mock("@empcloud/shared", () => ({
  TOKEN_DEFAULTS: { PASSWORD_RESET_EXPIRY: 3600 },
}));

// ---------------------------------------------------------------------------
// Import service under test
// ---------------------------------------------------------------------------

import { register, login, changePassword, forgotPassword, resetPassword } from "./auth.service.js";
import { UnauthorizedError, ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chainable mock defaults
    chainMethods.forEach((m) => {
      mockChain[m] = vi.fn().mockReturnValue(mockChain);
    });
    mockChain.first = vi.fn().mockResolvedValue(null);
    mockDb.mockReturnValue(mockChain);
  });

  // =========================================================================
  // register()
  // =========================================================================

  describe("register()", () => {
    const baseParams = {
      orgName: "Acme Corp",
      firstName: "John",
      lastName: "Doe",
      email: "john@acme.com",
      password: "Secret123!",
    };

    it("should create org + user and return tokens on success", async () => {
      // first call: check existing user -> null
      mockChain.first.mockResolvedValueOnce(null);
      // insert org -> returns [1]
      mockChain.insert.mockResolvedValueOnce([1]);
      // insert user -> returns [10]
      mockChain.insert.mockResolvedValueOnce([10]);
      // fetch user
      mockChain.first.mockResolvedValueOnce({
        id: 10, email: "john@acme.com", first_name: "John", last_name: "Doe",
        role: "org_admin", organization_id: 1, password: "hashed_Secret123!",
      });
      // fetch org
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Acme Corp" });

      const result = await register(baseParams);

      expect(result.user).toBeDefined();
      expect(result.org).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect((result.user as any).password).toBeUndefined();
      expect((result.tokens as any).access_token).toBe("mock_access_token");
    });

    it("should throw ConflictError if email already exists", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 5, email: "john@acme.com" });

      await expect(register(baseParams)).rejects.toThrow(ConflictError);
    });

    it("should hash password before storing", async () => {
      const { hashPassword } = await import("../../utils/crypto.js");

      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.insert.mockResolvedValueOnce([10]);
      mockChain.first.mockResolvedValueOnce({
        id: 10, email: "john@acme.com", first_name: "John", last_name: "Doe",
        role: "org_admin", organization_id: 1, password: "hashed_Secret123!",
      });
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Acme Corp" });

      await register(baseParams);

      expect(hashPassword).toHaveBeenCalledWith("Secret123!");
    });

    it("should set default org country to IN and timezone to Asia/Kolkata", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.insert.mockResolvedValueOnce([10]);
      mockChain.first.mockResolvedValueOnce({
        id: 10, email: "john@acme.com", first_name: "John", last_name: "Doe",
        role: "org_admin", organization_id: 1, password: "hashed_Secret123!",
      });
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Acme Corp" });

      await register(baseParams);

      // The second call to mockDb is for users table (insert), but first is org insert
      const orgInsertCall = mockChain.insert.mock.calls[0][0];
      expect(orgInsertCall.country).toBe("IN");
      expect(orgInsertCall.timezone).toBe("Asia/Kolkata");
    });

    it("should use custom org country and timezone if provided", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.insert.mockResolvedValueOnce([10]);
      mockChain.first.mockResolvedValueOnce({
        id: 10, email: "john@acme.com", first_name: "John", last_name: "Doe",
        role: "org_admin", organization_id: 1, password: "hashed_Secret123!",
      });
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Acme Corp" });

      await register({ ...baseParams, orgCountry: "US", orgTimezone: "America/New_York" });

      const orgInsertCall = mockChain.insert.mock.calls[0][0];
      expect(orgInsertCall.country).toBe("US");
      expect(orgInsertCall.timezone).toBe("America/New_York");
    });

    it("should not include password in the returned user object", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.insert.mockResolvedValueOnce([10]);
      mockChain.first.mockResolvedValueOnce({
        id: 10, email: "john@acme.com", first_name: "John", last_name: "Doe",
        role: "org_admin", organization_id: 1, password: "hashed_Secret123!",
      });
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Acme Corp" });

      const result = await register(baseParams);
      expect(result.user).not.toHaveProperty("password");
    });
  });

  // =========================================================================
  // login()
  // =========================================================================

  describe("login()", () => {
    it("should return user, org, and tokens for valid credentials", async () => {
      // Find user
      mockChain.first.mockResolvedValueOnce({
        id: 10, email: "john@acme.com", password: "hashed_correct",
        first_name: "John", last_name: "Doe", role: "org_admin",
        organization_id: 1, status: 1,
      });
      // Find org
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Acme Corp", is_active: true });

      const result = await login({ email: "john@acme.com", password: "correct" });

      expect(result.user).toBeDefined();
      expect(result.org).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect((result.tokens as any).access_token).toBe("mock_access_token");
    });

    it("should throw UnauthorizedError for wrong password", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 10, email: "john@acme.com", password: "hashed_correct",
        status: 1, organization_id: 1,
      });

      await expect(login({ email: "john@acme.com", password: "wrong" })).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it("should throw UnauthorizedError for nonexistent email", async () => {
      mockChain.first.mockResolvedValueOnce(null);

      await expect(login({ email: "nobody@test.com", password: "any" })).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it("should throw UnauthorizedError when user has no password (SSO-only)", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 10, email: "sso@acme.com", password: null, status: 1,
      });

      await expect(login({ email: "sso@acme.com", password: "any" })).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it("should throw UnauthorizedError for inactive organization", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 10, email: "john@acme.com", password: "hashed_correct",
        status: 1, organization_id: 1, first_name: "John", last_name: "Doe", role: "org_admin",
      });
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Acme Corp", is_active: false });

      await expect(login({ email: "john@acme.com", password: "correct" })).rejects.toThrow(
        "Organization is inactive",
      );
    });

    it("should not include password in the returned user object", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 10, email: "john@acme.com", password: "hashed_correct",
        first_name: "John", last_name: "Doe", role: "org_admin",
        organization_id: 1, status: 1,
      });
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Acme Corp", is_active: true });

      const result = await login({ email: "john@acme.com", password: "correct" });
      expect(result.user).not.toHaveProperty("password");
    });

    it("should query only active users (status: 1)", async () => {
      mockChain.first.mockResolvedValueOnce(null);

      try { await login({ email: "john@acme.com", password: "any" }); } catch { /* expected */ }

      expect(mockChain.where).toHaveBeenCalledWith({ email: "john@acme.com", status: 1 });
    });
  });

  // =========================================================================
  // changePassword()
  // =========================================================================

  describe("changePassword()", () => {
    it("should update password when current password is correct", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 10, password: "hashed_oldpass",
      });

      await changePassword({ userId: 10, currentPassword: "oldpass", newPassword: "newpass" });

      expect(mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ password: "hashed_newpass" }),
      );
    });

    it("should throw UnauthorizedError when current password is wrong", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 10, password: "hashed_correct",
      });

      await expect(
        changePassword({ userId: 10, currentPassword: "wrong", newPassword: "new" }),
      ).rejects.toThrow(UnauthorizedError);
    });

    it("should throw NotFoundError when user does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);

      await expect(
        changePassword({ userId: 999, currentPassword: "any", newPassword: "new" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError when user has no password field", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 10, password: null });

      await expect(
        changePassword({ userId: 10, currentPassword: "any", newPassword: "new" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should hash the new password before storing", async () => {
      const { hashPassword } = await import("../../utils/crypto.js");

      mockChain.first.mockResolvedValueOnce({ id: 10, password: "hashed_old" });

      await changePassword({ userId: 10, currentPassword: "old", newPassword: "brandnew" });

      expect(hashPassword).toHaveBeenCalledWith("brandnew");
    });
  });

  // =========================================================================
  // forgotPassword()
  // =========================================================================

  describe("forgotPassword()", () => {
    it("should return a reset token for an existing active user", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 10, email: "john@acme.com", status: 1 });
      mockChain.insert.mockResolvedValueOnce([1]);

      const result = await forgotPassword("john@acme.com");

      expect(result).not.toBeNull();
      expect(result!.token).toBeDefined();
      expect(result!.token.length).toBeGreaterThan(0);
    });

    it("should return null (not throw) for nonexistent email — no info leak", async () => {
      mockChain.first.mockResolvedValueOnce(null);

      const result = await forgotPassword("nobody@test.com");
      expect(result).toBeNull();
    });

    it("should store hashed token in the database", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 10 });
      mockChain.insert.mockResolvedValueOnce([1]);

      await forgotPassword("john@acme.com");

      expect(mockChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ token_hash: expect.stringContaining("tokenhash_") }),
      );
    });
  });

  // =========================================================================
  // resetPassword()
  // =========================================================================

  describe("resetPassword()", () => {
    it("should throw ValidationError for invalid/used token", async () => {
      mockChain.first.mockResolvedValueOnce(null); // no matching token

      await expect(
        resetPassword({ token: "badtoken", newPassword: "new" }),
      ).rejects.toThrow(ValidationError);
    });

    it("should throw ValidationError for expired token", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, user_id: 10, expires_at: new Date(Date.now() - 10000).toISOString(),
      });

      await expect(
        resetPassword({ token: "expired", newPassword: "new" }),
      ).rejects.toThrow("expired");
    });

    it("should update password and mark token as used within a transaction", async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      mockChain.first.mockResolvedValueOnce({
        id: 1, user_id: 10, expires_at: futureDate,
      });

      // Mock transaction
      const trxChain: any = {};
      chainMethods.forEach((m) => {
        trxChain[m] = vi.fn().mockReturnValue(trxChain);
      });
      const mockTrx: any = vi.fn().mockReturnValue(trxChain);
      trxChain.update = vi.fn().mockResolvedValue(1);

      mockDb.transaction = vi.fn(async (cb: Function) => cb(mockTrx));

      await resetPassword({ token: "validtoken", newPassword: "newpass" });

      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });
});
