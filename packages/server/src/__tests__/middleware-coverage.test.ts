// =============================================================================
// EMP CLOUD — Middleware, Error, RBAC, Response, DB Connection Unit Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the modules under test
// ---------------------------------------------------------------------------

// Mock verifyAccessToken (jwt.service)
const mockVerifyAccessToken = vi.fn();
vi.mock("../services/oauth/jwt.service", () => ({
  verifyAccessToken: (...args: any[]) => mockVerifyAccessToken(...args),
}));

// Mock getDB — returns a Knex-like builder chain
const mockFirst = vi.fn();
const mockWhereNull = vi.fn(() => ({ first: mockFirst }));
const mockWhere = vi.fn(() => ({ whereNull: mockWhereNull }));
const mockKnexTable = vi.fn(() => ({ where: mockWhere }));
vi.mock("../db/connection", () => ({
  getDB: () => mockKnexTable,
  initDB: vi.fn(),
  closeDB: vi.fn(),
}));

// Mock sendError / sendSuccess
vi.mock("../utils/response", async () => {
  const actual = await vi.importActual<any>("../utils/response");
  return actual;
});

// Mock logger
vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock config
vi.mock("../config/index", () => ({
  config: { isProd: false, db: { host: "localhost", port: 3306, user: "root", password: "", name: "empcloud" } },
}));

// Mock @empcloud/shared
vi.mock("@empcloud/shared", () => ({
  ROLE_HIERARCHY: {
    employee: 0,
    manager: 20,
    hr_admin: 60,
    org_admin: 80,
    super_admin: 100,
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { authenticate, optionalAuth } from "../api/middleware/auth.middleware";
import { errorHandler } from "../api/middleware/error.middleware";
import { requireRole, requireSelfOrHR } from "../api/middleware/rbac.middleware";
import { requestIdMiddleware } from "../api/middleware/request-id.middleware";
import { sendSuccess, sendError, sendPaginated } from "../utils/response";
import { AppError, OAuthError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, RateLimitError } from "../utils/errors";
import { ZodError } from "zod";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockReq(overrides: any = {}): any {
  return { headers: {}, params: {}, query: {}, body: {}, ...overrides };
}

function mockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

// =============================================================================
// Auth Middleware
// =============================================================================
describe("EmpCloud Auth Middleware", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe("authenticate()", () => {
    it("rejects request with no Authorization header", () => {
      const req = mockReq();
      const res = mockRes();
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.objectContaining({ code: "UNAUTHORIZED" }) })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects request with non-Bearer Authorization", () => {
      const req = mockReq({ headers: { authorization: "Basic abc123" } });
      const res = mockRes();
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("rejects when verifyAccessToken throws TokenExpiredError", () => {
      const err = new Error("Token expired");
      err.name = "TokenExpiredError";
      mockVerifyAccessToken.mockImplementation(() => { throw err; });

      const req = mockReq({ headers: { authorization: "Bearer expired-token" } });
      const res = mockRes();
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: "TOKEN_EXPIRED" }) })
      );
    });

    it("rejects when verifyAccessToken throws generic error", () => {
      mockVerifyAccessToken.mockImplementation(() => { throw new Error("bad signature"); });

      const req = mockReq({ headers: { authorization: "Bearer bad-token" } });
      const res = mockRes();
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: "UNAUTHORIZED" }) })
      );
    });

    it("attaches user and calls next() on valid token with DB record", async () => {
      const decoded = { sub: 1, jti: "jti-123", role: "org_admin", org_id: 1 };
      mockVerifyAccessToken.mockReturnValue(decoded);
      mockFirst.mockResolvedValue({ id: 1, jti: "jti-123" });

      const req = mockReq({ headers: { authorization: "Bearer valid-token" } });
      const res = mockRes();
      const next = vi.fn();

      authenticate(req, res, next);

      // Wait for async DB check
      await new Promise((r) => setTimeout(r, 10));

      expect(mockVerifyAccessToken).toHaveBeenCalledWith("valid-token");
      expect(req.user).toEqual(decoded);
      expect(next).toHaveBeenCalled();
    });

    it("rejects when token is revoked (no DB record)", async () => {
      const decoded = { sub: 1, jti: "jti-revoked", role: "employee" };
      mockVerifyAccessToken.mockReturnValue(decoded);
      mockFirst.mockResolvedValue(null);

      const req = mockReq({ headers: { authorization: "Bearer revoked-token" } });
      const res = mockRes();
      const next = vi.fn();

      authenticate(req, res, next);
      await new Promise((r) => setTimeout(r, 10));

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: "Token has been revoked" }) })
      );
    });

    it("rejects when DB check fails", async () => {
      const decoded = { sub: 1, jti: "jti-ok" };
      mockVerifyAccessToken.mockReturnValue(decoded);
      mockFirst.mockRejectedValue(new Error("DB down"));

      const req = mockReq({ headers: { authorization: "Bearer db-fail" } });
      const res = mockRes();
      const next = vi.fn();

      authenticate(req, res, next);
      await new Promise((r) => setTimeout(r, 10));

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("optionalAuth()", () => {
    it("calls next() without attaching user when no auth header", () => {
      const req = mockReq();
      const res = mockRes();
      const next = vi.fn();

      optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it("attaches user when valid token is present", () => {
      const decoded = { sub: 1, role: "employee" };
      mockVerifyAccessToken.mockReturnValue(decoded);

      const req = mockReq({ headers: { authorization: "Bearer good" } });
      const res = mockRes();
      const next = vi.fn();

      optionalAuth(req, res, next);

      expect(req.user).toEqual(decoded);
      expect(next).toHaveBeenCalled();
    });

    it("calls next() without user when token is invalid", () => {
      mockVerifyAccessToken.mockImplementation(() => { throw new Error("bad"); });

      const req = mockReq({ headers: { authorization: "Bearer bad" } });
      const res = mockRes();
      const next = vi.fn();

      optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// RBAC Middleware
// =============================================================================
describe("EmpCloud RBAC Middleware", () => {
  describe("requireRole()", () => {
    it("rejects when no user is attached", () => {
      const middleware = requireRole("hr_admin" as any);
      const req = mockReq();
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("rejects when user role is insufficient", () => {
      const middleware = requireRole("org_admin" as any);
      const req = mockReq({ user: { role: "employee" } });
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("allows when user role meets requirement", () => {
      const middleware = requireRole("hr_admin" as any);
      const req = mockReq({ user: { role: "org_admin" } });
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("allows super_admin for any role check", () => {
      const middleware = requireRole("employee" as any);
      const req = mockReq({ user: { role: "super_admin" } });
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("requireSelfOrHR()", () => {
    it("rejects when no user", () => {
      const middleware = requireSelfOrHR("id");
      const req = mockReq({ params: { id: "5" } });
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("allows when user is accessing own resource", () => {
      const middleware = requireSelfOrHR("id");
      const req = mockReq({ user: { sub: 5, role: "employee" }, params: { id: "5" } });
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("allows when user has HR role", () => {
      const middleware = requireSelfOrHR("id");
      const req = mockReq({ user: { sub: 1, role: "hr_admin" }, params: { id: "99" } });
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("rejects when not self and not HR", () => {
      const middleware = requireSelfOrHR("id");
      const req = mockReq({ user: { sub: 1, role: "employee" }, params: { id: "99" } });
      const res = mockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});

// =============================================================================
// Error Handler Middleware
// =============================================================================
describe("EmpCloud Error Handler", () => {
  it("handles OAuthError with RFC 6749 format", () => {
    const err = new OAuthError("invalid_client", "Client not found", 401);
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "invalid_client", error_description: "Client not found" });
  });

  it("handles AppError with correct status and code", () => {
    const err = new AppError("Something broke", 422, "CUSTOM_ERROR", { field: "bad" });
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ code: "CUSTOM_ERROR" }) })
    );
  });

  it("handles ZodError as 400 VALIDATION_ERROR", () => {
    const err = new ZodError([
      { code: "invalid_type", expected: "string", received: "number", path: ["name"], message: "Expected string" },
    ]);
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "VALIDATION_ERROR" }) })
    );
  });

  it("handles ER_DUP_ENTRY as 400 BAD_REQUEST", () => {
    const err = new Error("ER_DUP_ENTRY: Duplicate entry");
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("handles TypeError as 400 BAD_REQUEST", () => {
    const err = new TypeError("Cannot read properties of undefined");
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("handles unknown errors as 500 INTERNAL_ERROR", () => {
    const err = new Error("totally unexpected");
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "INTERNAL_ERROR" }) })
    );
  });
});

// =============================================================================
// Request ID Middleware
// =============================================================================
describe("Request ID Middleware", () => {
  it("generates a UUID when no X-Request-ID header", () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(typeof req.requestId).toBe("string");
    expect(req.requestId.length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it("preserves existing X-Request-ID header", () => {
    const req = mockReq({ headers: { "x-request-id": "custom-id-123" } });
    const res = mockRes();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe("custom-id-123");
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", "custom-id-123");
  });
});

// =============================================================================
// Response Helpers
// =============================================================================
describe("Response Helpers", () => {
  describe("sendSuccess()", () => {
    it("sends 200 with data by default", () => {
      const res = mockRes();
      sendSuccess(res, { id: 1, name: "test" });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1, name: "test" } });
    });

    it("supports custom status code", () => {
      const res = mockRes();
      sendSuccess(res, { created: true }, 201);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("includes meta when provided", () => {
      const res = mockRes();
      sendSuccess(res, [1, 2], 200, { page: 1, per_page: 10, total: 2, total_pages: 1 });

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ meta: { page: 1, per_page: 10, total: 2, total_pages: 1 } })
      );
    });
  });

  describe("sendError()", () => {
    it("sends error response with correct structure", () => {
      const res = mockRes();
      sendError(res, 404, "NOT_FOUND", "User not found");

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { code: "NOT_FOUND", message: "User not found", details: undefined },
      });
    });
  });

  describe("sendPaginated()", () => {
    it("calculates total_pages correctly", () => {
      const res = mockRes();
      sendPaginated(res, [1, 2, 3], 25, 1, 10);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [1, 2, 3],
          meta: { page: 1, per_page: 10, total: 25, total_pages: 3 },
        })
      );
    });
  });
});

// =============================================================================
// Error Classes
// =============================================================================
describe("Error Classes", () => {
  it("AppError carries statusCode, code, and details", () => {
    const err = new AppError("fail", 400, "BAD", { field: "x" });
    expect(err.message).toBe("fail");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("BAD");
    expect(err.details).toEqual({ field: "x" });
    expect(err instanceof Error).toBe(true);
  });

  it("ValidationError defaults to 400", () => {
    const err = new ValidationError("bad input");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("UnauthorizedError defaults to 401", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  it("ForbiddenError defaults to 403", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it("NotFoundError includes resource name", () => {
    const err = new NotFoundError("User");
    expect(err.message).toBe("User not found");
    expect(err.statusCode).toBe(404);
  });

  it("ConflictError is 409", () => {
    const err = new ConflictError("duplicate");
    expect(err.statusCode).toBe(409);
  });

  it("RateLimitError is 429", () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
  });

  it("OAuthError.toJSON() returns RFC 6749 format", () => {
    const err = new OAuthError("invalid_grant", "Grant expired");
    expect(err.toJSON()).toEqual({ error: "invalid_grant", error_description: "Grant expired" });
  });
});
