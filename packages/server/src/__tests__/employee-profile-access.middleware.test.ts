import { beforeEach, describe, expect, it, vi } from "vitest";

const { isManagerOf } = vi.hoisted(() => ({ isManagerOf: vi.fn() }));
vi.mock("../services/team/team-resolver.service.js", () => ({ isManagerOf }));

import { requireEmployeeProfileAccess } from "../api/middleware/rbac.middleware.js";

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

function request(targetId: number, permissions: string[] = [], userId = 45) {
  return {
    params: { id: String(targetId) },
    user: { sub: userId, org_id: 7, role: "employee", permissions },
  } as any;
}

describe("requireEmployeeProfileAccess", () => {
  beforeEach(() => isManagerOf.mockReset());

  it("allows an employee to view their own profile with employees:view", async () => {
    const next = vi.fn();
    await requireEmployeeProfileAccess()(request(45, ["employees:view"]), response() as any, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects an employee viewing another profile", async () => {
    const res = response();
    const next = vi.fn();
    await requireEmployeeProfileAccess()(request(46, ["employees:view"]), res as any, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not treat employees:view_team as organization-wide access", async () => {
    isManagerOf.mockResolvedValue(false);
    const res = response();
    const next = vi.fn();
    await requireEmployeeProfileAccess()(request(46, ["employees:view_team"]), res as any, next);
    expect(isManagerOf).toHaveBeenCalledWith(7, 45, 46);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a manager to view an actual team member", async () => {
    isManagerOf.mockResolvedValue(true);
    const next = vi.fn();
    await requireEmployeeProfileAccess()(request(46, ["employees:view_team"]), response() as any, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows employees:view_all", async () => {
    const next = vi.fn();
    await requireEmployeeProfileAccess()(request(46, ["employees:view_all"]), response() as any, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
