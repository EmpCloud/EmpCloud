// =============================================================================
// EMP CLOUD — Field Tracking auth middleware tests
//
// Locks down the shared-secret gate for the EMP Field compatibility surface.
// The important contract — and the one place we deliberately diverge from
// emp-monitor — is FAIL-CLOSED: an unconfigured secret must reject every
// request, never authenticate via `undefined === undefined`.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config so each test can vary the configured secret without re-importing
// the (frozen-at-import) real config object.
vi.mock("../config/index.js", () => ({
  config: {
    fieldTracking: {
      get secretKey() {
        return process.env.__FT_TEST_SECRET ?? "";
      },
    },
  },
}));

import { fieldAuthenticate } from "../services/field-legacy/field-auth.middleware.js";

function mockRes() {
  const res: any = { body: undefined };
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res;
  });
  return res;
}

describe("fieldAuthenticate", () => {
  beforeEach(() => {
    delete process.env.__FT_TEST_SECRET;
  });

  it("fails closed (503) when no secret is configured, even with a body secretKey", () => {
    const res = mockRes();
    const next = vi.fn();
    fieldAuthenticate({ body: { secretKey: "anything" } } as any, res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.body.code).toBe(503);
    expect(res.body.data).toBeNull();
  });

  it("rejects (401) when the provided secretKey is wrong", () => {
    process.env.__FT_TEST_SECRET = "right-secret";
    const res = mockRes();
    const next = vi.fn();
    fieldAuthenticate({ body: { secretKey: "wrong-secret" } } as any, res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.body.code).toBe(401);
  });

  it("rejects (401) when the body is missing entirely", () => {
    process.env.__FT_TEST_SECRET = "right-secret";
    const res = mockRes();
    const next = vi.fn();
    fieldAuthenticate({ body: undefined } as any, res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.body.code).toBe(401);
  });

  it("rejects (401) when secretKey is a non-string (e.g. injected object)", () => {
    process.env.__FT_TEST_SECRET = "right-secret";
    const res = mockRes();
    const next = vi.fn();
    fieldAuthenticate({ body: { secretKey: { toString: () => "right-secret" } } } as any, res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.body.code).toBe(401);
  });

  it("calls next() when the provided secretKey matches", () => {
    process.env.__FT_TEST_SECRET = "right-secret";
    const res = mockRes();
    const next = vi.fn();
    fieldAuthenticate({ body: { secretKey: "right-secret" } } as any, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });
});
