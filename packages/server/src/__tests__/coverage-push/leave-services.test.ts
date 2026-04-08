// =============================================================================
// Coverage Push: Leave Services — actual service function imports
// =============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
// DB_PASSWORD must be set via environment variable
process.env.DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.RSA_PRIVATE_KEY_PATH = "/dev/null";
process.env.RSA_PUBLIC_KEY_PATH = "/dev/null";
process.env.BILLING_API_KEY = "test";
process.env.LOG_LEVEL = "error";

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { initDB, closeDB } from "../../db/connection.js";

const ORG = 5;
const EMP = 524;
const ADMIN = 522;
const MGR = 529;

beforeAll(async () => { await initDB(); });
afterAll(async () => { await closeDB(); });

// ============================================================================
// LEAVE TYPE SERVICE
// ============================================================================

describe("LeaveTypeService — full coverage", () => {
  it("listLeaveTypes", async () => {
    const { listLeaveTypes } = await import("../../services/leave/leave-type.service.js");
    const types = await listLeaveTypes(ORG);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) {
      expect(typeof t.is_paid).toBe("boolean");
      expect(typeof t.is_carry_forward).toBe("boolean");
      expect(typeof t.is_encashable).toBe("boolean");
      expect(typeof t.requires_approval).toBe("boolean");
      expect(typeof t.is_active).toBe("boolean");
    }
  });

  it("getLeaveType — found", async () => {
    const { listLeaveTypes, getLeaveType } = await import("../../services/leave/leave-type.service.js");
    const types = await listLeaveTypes(ORG);
    if (types.length > 0) {
      const t = await getLeaveType(ORG, types[0].id);
      expect(t.name).toBeTruthy();
    }
  });

  it("getLeaveType — not found", async () => {
    const { getLeaveType } = await import("../../services/leave/leave-type.service.js");
    await expect(getLeaveType(ORG, 999999)).rejects.toThrow();
  });

  it("deleteLeaveType — not found", async () => {
    const { deleteLeaveType } = await import("../../services/leave/leave-type.service.js");
    await expect(deleteLeaveType(ORG, 999999)).rejects.toThrow();
  });
});

// ============================================================================
// LEAVE POLICY SERVICE
// ============================================================================

describe("LeavePolicyService — full coverage", () => {
  it("listLeavePolicies", async () => {
    const { listLeavePolicies } = await import("../../services/leave/leave-policy.service.js");
    const policies = await listLeavePolicies(ORG);
    expect(Array.isArray(policies)).toBe(true);
  });

  it("getLeavePolicy — not found", async () => {
    const { getLeavePolicy } = await import("../../services/leave/leave-policy.service.js");
    await expect(getLeavePolicy(ORG, 999999)).rejects.toThrow();
  });

  it("updateLeavePolicy — not found", async () => {
    const { updateLeavePolicy } = await import("../../services/leave/leave-policy.service.js");
    await expect(updateLeavePolicy(ORG, 999999, { name: "x" })).rejects.toThrow();
  });

  it("deleteLeavePolicy — not found", async () => {
    const { deleteLeavePolicy } = await import("../../services/leave/leave-policy.service.js");
    await expect(deleteLeavePolicy(ORG, 999999)).rejects.toThrow();
  });
});

// ============================================================================
// LEAVE BALANCE SERVICE
// ============================================================================

describe("LeaveBalanceService — full coverage", () => {
  it("getBalances with explicit year", async () => {
    const { getBalances } = await import("../../services/leave/leave-balance.service.js");
    const balances = await getBalances(ORG, EMP, 2026);
    expect(Array.isArray(balances)).toBe(true);
  });

  it("getBalances with default year", async () => {
    const { getBalances } = await import("../../services/leave/leave-balance.service.js");
    const balances = await getBalances(ORG, EMP);
    expect(Array.isArray(balances)).toBe(true);
  });

  it("deductBalance — not found", async () => {
    const { deductBalance } = await import("../../services/leave/leave-balance.service.js");
    await expect(deductBalance(ORG, 999999, 1, 1)).rejects.toThrow();
  });

  it("creditBalance — not found", async () => {
    const { creditBalance } = await import("../../services/leave/leave-balance.service.js");
    await expect(creditBalance(ORG, 999999, 1, 1)).rejects.toThrow();
  });
});

// ============================================================================
// LEAVE APPLICATION SERVICE
// ============================================================================

describe("LeaveApplicationService — full coverage", () => {
  it("listApplications with defaults", async () => {
    const { listApplications } = await import("../../services/leave/leave-application.service.js");
    const r = await listApplications(ORG, {});
    expect(r).toHaveProperty("applications");
    expect(r).toHaveProperty("total");
  });

  it("listApplications with filters", async () => {
    const { listApplications } = await import("../../services/leave/leave-application.service.js");
    const r = await listApplications(ORG, {
      status: "approved",
      userId: EMP,
      page: 1,
      perPage: 5,
    });
    expect(r).toHaveProperty("applications");
  });

  it("listApplications — pending only", async () => {
    const { listApplications } = await import("../../services/leave/leave-application.service.js");
    const r = await listApplications(ORG, { status: "pending" });
    expect(r).toHaveProperty("applications");
  });

  it("getApplication — not found", async () => {
    const { getApplication } = await import("../../services/leave/leave-application.service.js");
    await expect(getApplication(ORG, 999999)).rejects.toThrow();
  });

  it("getLeaveCalendar", async () => {
    const { getLeaveCalendar } = await import("../../services/leave/leave-application.service.js");
    const calendar = await getLeaveCalendar(ORG, 3, 2026);
    expect(Array.isArray(calendar)).toBe(true);
  });

  it("getLeaveCalendar — December (year boundary)", async () => {
    const { getLeaveCalendar } = await import("../../services/leave/leave-application.service.js");
    const calendar = await getLeaveCalendar(ORG, 12, 2025);
    expect(Array.isArray(calendar)).toBe(true);
  });

  it("cancelLeave — not found", async () => {
    const { cancelLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(cancelLeave(ORG, EMP, 999999)).rejects.toThrow();
  });

  it("approveLeave — not found", async () => {
    const { approveLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(approveLeave(ORG, MGR, 999999)).rejects.toThrow();
  });

  it("rejectLeave — not found", async () => {
    const { rejectLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(rejectLeave(ORG, MGR, 999999)).rejects.toThrow();
  });

  it("applyLeave — invalid date", async () => {
    const { applyLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(
      applyLeave(ORG, EMP, {
        leave_type_id: 1,
        start_date: "not-a-date",
        end_date: "2026-04-10",
        days_count: 1,
        reason: "test",
      } as any),
    ).rejects.toThrow(/invalid/i);
  });

  it("applyLeave — end before start", async () => {
    const { applyLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(
      applyLeave(ORG, EMP, {
        leave_type_id: 1,
        start_date: "2026-04-10",
        end_date: "2026-04-05",
        days_count: 1,
        reason: "test",
      } as any),
    ).rejects.toThrow(/before/i);
  });

  it("applyLeave — start date too far in past", async () => {
    const { applyLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(
      applyLeave(ORG, EMP, {
        leave_type_id: 1,
        start_date: "2020-01-01",
        end_date: "2020-01-05",
        days_count: 5,
        reason: "test",
      } as any),
    ).rejects.toThrow(/past/i);
  });

  it("applyLeave — invalid leave type", async () => {
    const { applyLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(
      applyLeave(ORG, EMP, {
        leave_type_id: 999999,
        start_date: "2026-06-01",
        end_date: "2026-06-02",
        days_count: 2,
        reason: "test",
      } as any),
    ).rejects.toThrow();
  });
});

// ============================================================================
// COMP-OFF SERVICE
// ============================================================================

describe("CompOffService — full coverage", () => {
  it("listCompOffs defaults", async () => {
    const { listCompOffs } = await import("../../services/leave/comp-off.service.js");
    const r = await listCompOffs(ORG, {});
    expect(r).toHaveProperty("requests");
    expect(r).toHaveProperty("total");
  });

  it("listCompOffs with filters", async () => {
    const { listCompOffs } = await import("../../services/leave/comp-off.service.js");
    const r = await listCompOffs(ORG, { userId: EMP, status: "pending", page: 1, perPage: 5 });
    expect(r).toHaveProperty("requests");
  });

  it("getCompOff — not found", async () => {
    const { getCompOff } = await import("../../services/leave/comp-off.service.js");
    await expect(getCompOff(ORG, 999999)).rejects.toThrow();
  });

  it("approveCompOff — not found", async () => {
    const { approveCompOff } = await import("../../services/leave/comp-off.service.js");
    await expect(approveCompOff(ORG, ADMIN, 999999)).rejects.toThrow();
  });

  it("rejectCompOff — not found", async () => {
    const { rejectCompOff } = await import("../../services/leave/comp-off.service.js");
    await expect(rejectCompOff(ORG, ADMIN, 999999)).rejects.toThrow();
  });
});
