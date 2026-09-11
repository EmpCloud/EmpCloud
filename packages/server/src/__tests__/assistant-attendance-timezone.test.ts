import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const attendanceQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  const timezoneQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  const db = vi.fn((table: string) => {
    if (table === "attendance_records") return attendanceQuery;
    if (table === "users as u") return timezoneQuery;
    throw new Error(`Unexpected table: ${table}`);
  });
  return { attendanceQuery, timezoneQuery, db };
});

vi.mock("../db/connection.js", () => ({ getDB: () => mocks.db }));
vi.mock("../services/assistant/scope-resolver.js", () => ({
  assertTargetAccess: vi.fn().mockResolvedValue(undefined),
  getTeamUserIds: vi.fn(),
  hasPermission: vi.fn().mockReturnValue(true),
  resolveMonitorScope: vi.fn(),
  visibleEmployeeIds: vi.fn(),
}));
vi.mock("../services/leave/leave-balance.service.js", () => ({ getBalances: vi.fn() }));
vi.mock("../services/leave/leave-type.service.js", () => ({ listLeaveTypesForUser: vi.fn() }));
vi.mock("../services/attendance/shift.service.js", () => ({ getSchedule: vi.fn() }));
vi.mock("../services/assistant/module-client.js", () => ({ payrollGet: vi.fn(), monitorGet: vi.fn() }));

import { executeAssistantTool } from "../services/assistant/tools.js";

function chain(query: Record<string, ReturnType<typeof vi.fn>>, methods: string[]) {
  for (const method of methods) query[method] = vi.fn(() => query);
}

describe("assistant attendance timezone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain(mocks.attendanceQuery, ["where", "whereBetween", "orderBy"]);
    mocks.attendanceQuery.select = vi.fn().mockResolvedValue([{
      date: "2026-08-28",
      status: "present",
      check_in: new Date("2026-08-28T04:30:00.000Z"),
      check_out: new Date("2026-08-28T13:09:00.000Z"),
      worked_minutes: 519,
      late_minutes: 0,
      overtime_minutes: 0,
    }]);

    chain(mocks.timezoneQuery, ["leftJoin", "join", "where", "select"]);
    mocks.timezoneQuery.first = vi.fn().mockResolvedValue({
      location_timezone: "Asia/Kolkata",
      organization_timezone: "Asia/Kolkata",
    });
  });

  it("returns attendance timestamps in the employee location timezone", async () => {
    const raw = await executeAssistantTool(
      { orgId: 7, userId: 13, role: "org_admin", permissions: new Set(["attendance:view_all"]) },
      "get_attendance",
      { employee_id: 45, start_date: "2026-08-28", end_date: "2026-08-28" },
    );

    expect(JSON.parse(raw)).toMatchObject({
      timezone: "Asia/Kolkata",
      records: [{
        date: "2026-08-28",
        check_in: "2026-08-28 10:00:00",
        check_out: "2026-08-28 18:39:00",
      }],
    });
  });
});
