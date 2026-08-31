import { beforeEach, describe, expect, it, vi } from "vitest";

const rows: Record<string, any[]> = {};
const whereCalls: Array<{ table: string; args: any[] }> = [];

function baseTable(name: string) {
  return name.split(/\s+as\s+/i)[0];
}

function chainFor(name: string) {
  const table = baseTable(name);
  const chain: any = {};
  for (const method of ["select", "orderBy", "leftJoin", "whereIn", "whereNot"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.where = vi.fn((...args: any[]) => {
    whereCalls.push({ table, args });
    return chain;
  });
  chain.then = (resolve: any, reject: any) => Promise.resolve(rows[table] || []).then(resolve, reject);
  return chain;
}

const mockDB: any = vi.fn((table: string) => chainFor(table));
vi.mock("../../db/connection", () => ({ getDB: () => mockDB }));
vi.mock("../../db/connection.js", () => ({ getDB: () => mockDB }));

const leaveMocks = vi.hoisted(() => ({ getBalances: vi.fn() }));
vi.mock("../../services/leave/leave-balance.service", () => ({ getBalances: leaveMocks.getBalances }));
vi.mock("../../services/leave/leave-balance.service.js", () => ({ getBalances: leaveMocks.getBalances }));
vi.mock("../../services/attendance/attendance-settings.service", () => ({
  assertChannelAllowed: vi.fn(),
}));
vi.mock("../../services/attendance/attendance-settings.service.js", () => ({
  assertChannelAllowed: vi.fn(),
}));

import { getAttendanceGridLeaveContext } from "../../services/attendance/attendance.service.js";
import {
  attendanceGridCellSchema,
  attendanceGridLeaveContextQuerySchema,
} from "@empcloud/shared";

describe("attendance-grid leave context", () => {
  beforeEach(() => {
    for (const key of Object.keys(rows)) delete rows[key];
    whereCalls.length = 0;
    vi.clearAllMocks();
    leaveMocks.getBalances.mockResolvedValue([
      { leave_type_id: 7, available_now: 6, fiscal_year_label: "2026-27" },
    ]);
  });

  it("returns only date-matched attendance-grid cancellation history with actor audit data", async () => {
    rows.leave_types = [
      { id: 7, name: "Casual Leave", code: "CL", color: "#2563eb", requires_approval: 1 },
    ];
    rows.leave_applications = [
      { id: 10, leave_type_id: 7, status: "approved", leave_type_name: "Casual Leave" },
      { id: 11, leave_type_id: 7, status: "cancelled", leave_type_name: "Casual Leave" },
      { id: 12, leave_type_id: 7, status: "cancelled", leave_type_name: "Casual Leave" },
    ];
    rows.audit_logs = [
      {
        resource_id: "11",
        details: JSON.stringify({
          source: "attendance_grid",
          date: "2026-08-09",
          actor_name: "Ananya Gupta",
        }),
        actor_first_name: "Ananya",
        actor_last_name: "Gupta",
      },
      {
        resource_id: "12",
        details: JSON.stringify({ source: "attendance_grid", date: "2026-08-10" }),
        actor_first_name: "Other",
        actor_last_name: "Admin",
      },
    ];

    const result = await getAttendanceGridLeaveContext(3, 25, "2026-08-09");

    expect(result.leaveTypes).toEqual([
      expect.objectContaining({ id: 7, available_now: 6, fiscal_year_label: "2026-27" }),
    ]);
    expect(result.existingApplications.map((application: any) => application.id)).toEqual([10, 11]);
    expect(result.existingApplications[1].cancelled_by_name).toBe("Ananya Gupta");
    expect(whereCalls).toContainEqual({
      table: "leave_applications",
      args: [{
        "leave_applications.organization_id": 3,
        "leave_applications.user_id": 25,
      }],
    });
    expect(whereCalls).toContainEqual({
      table: "audit_logs",
      args: [{
        "al.organization_id": 3,
        "al.action": "leave_cancelled",
        "al.resource_type": "leave_application",
      }],
    });
  });

  it("validates grid query and cell input with shared Zod schemas", () => {
    expect(attendanceGridLeaveContextQuerySchema.parse({ user_id: "25", date: "2026-08-09" }))
      .toEqual({ user_id: 25, date: "2026-08-09" });
    expect(() => attendanceGridLeaveContextQuerySchema.parse({ user_id: "0", date: "2026-02-31" }))
      .toThrow();
    expect(attendanceGridCellSchema.parse({ user_id: "25", date: "2026-08-09", code: "A" }))
      .toEqual({ user_id: 25, date: "2026-08-09", code: "A" });
    expect(() => attendanceGridCellSchema.parse({ user_id: 25, date: "2026-08-09", code: "INVALID" }))
      .toThrow();
  });
});
