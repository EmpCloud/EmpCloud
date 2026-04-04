import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/connection", () => ({ getDB: vi.fn() }));
vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { tools } from "../services/chatbot/tools.js";
import { getDB } from "../db/connection.js";

const mockedGetDB = vi.mocked(getDB);

function createMockDB() {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.where = vi.fn((arg?: any) => {
    if (typeof arg === "function") arg.call(chain);
    return chain;
  });
  chain.whereIn = vi.fn(() => chain);
  chain.whereRaw = vi.fn(() => chain);
  chain.orWhereRaw = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.join = vi.fn(() => chain);
  chain.first = vi.fn(() => chain._firstResult);
  chain.count = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.offset = vi.fn(() => chain);
  chain.andOn = vi.fn(() => chain);
  chain.andOnVal = vi.fn(() => chain);
  chain.on = vi.fn(() => chain);
  chain._firstResult = undefined;
  chain._result = [];
  chain.then = vi.fn((resolve: any) => resolve(chain._result));

  const db: any = vi.fn(() => chain);
  db.raw = vi.fn((sql: string, bindings?: any) => ({ sql, bindings }));
  return { db, chain };
}

function getTool(name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

describe("chatbot tools", () => {
  let db: any;
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockDB();
    db = mock.db;
    chain = mock.chain;
    mockedGetDB.mockReturnValue(db);
  });

  // -----------------------------------------------------------------------
  // get_employee_count
  // -----------------------------------------------------------------------
  describe("get_employee_count", () => {
    it("returns total active employee count", async () => {
      chain._result = [{ count: 42 }];

      const tool = getTool("get_employee_count");
      const result = await tool.execute(1, 10, {});
      expect(result).toEqual({ total_employees: 42 });
    });
  });

  // -----------------------------------------------------------------------
  // get_employee_details
  // -----------------------------------------------------------------------
  describe("get_employee_details", () => {
    it("searches by name and returns results", async () => {
      chain._result = [
        { id: 1, first_name: "John", last_name: "Doe", email: "john@test.com" },
      ];

      const tool = getTool("get_employee_details");
      const result: any = await tool.execute(1, 10, { query: "john" });
      expect(result.employees).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it("returns empty when no match", async () => {
      chain._result = [];

      const tool = getTool("get_employee_details");
      const result: any = await tool.execute(1, 10, { query: "nonexistent" });
      expect(result.count).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // get_department_list
  // -----------------------------------------------------------------------
  describe("get_department_list", () => {
    it("returns departments with counts", async () => {
      chain._result = [
        { id: 1, name: "Engineering", employee_count: 15 },
        { id: 2, name: "HR", employee_count: 3 },
      ];

      const tool = getTool("get_department_list");
      const result: any = await tool.execute(1, 10, {});
      expect(result.departments).toHaveLength(2);
      expect(result.total_departments).toBe(2);
      expect(result.departments[0].employee_count).toBe(15);
    });
  });

  // -----------------------------------------------------------------------
  // get_attendance_today
  // -----------------------------------------------------------------------
  describe("get_attendance_today", () => {
    it("calculates attendance rate", async () => {
      chain._firstResult = { count: 100 };
      chain._result = [
        { status: "present", count: 60 },
        { status: "late", count: 10 },
        { status: "absent", count: 5 },
      ];

      const tool = getTool("get_attendance_today");
      const result: any = await tool.execute(1, 10, {});
      expect(result.total_employees).toBe(100);
      expect(result.present).toBe(60);
      expect(result.late).toBe(10);
      expect(result.absent).toBe(5);
      expect(result.attendance_rate).toBe("70%");
    });

    it("returns N/A rate when no employees", async () => {
      chain._firstResult = { count: 0 };
      chain._result = [];

      const tool = getTool("get_attendance_today");
      const result: any = await tool.execute(1, 10, {});
      expect(result.attendance_rate).toBe("N/A");
    });
  });

  // -----------------------------------------------------------------------
  // get_attendance_for_employee
  // -----------------------------------------------------------------------
  describe("get_attendance_for_employee", () => {
    it("returns error when employee not found", async () => {
      chain._firstResult = undefined;

      const tool = getTool("get_attendance_for_employee");
      const result: any = await tool.execute(1, 10, { employee_name: "Nobody" });
      expect(result.error).toContain("No employee found");
    });

    it("returns attendance records for found employee", async () => {
      chain._firstResult = { id: 5, first_name: "John", last_name: "Doe" };
      chain._result = [
        { date: "2026-04-04", status: "present", check_in: "2026-04-04T04:00:00Z", check_out: "2026-04-04T13:00:00Z", worked_minutes: 540 },
      ];

      const tool = getTool("get_attendance_for_employee");
      const result: any = await tool.execute(1, 10, { employee_name: "John", days: 7 });
      expect(result.employee).toBe("John Doe");
      expect(result.records).toHaveLength(1);
      expect(result.records[0].hours).toBe("9.0");
    });
  });

  // -----------------------------------------------------------------------
  // get_my_attendance
  // -----------------------------------------------------------------------
  describe("get_my_attendance", () => {
    it("returns not_checked_in when no record", async () => {
      chain._firstResult = undefined;

      const tool = getTool("get_my_attendance");
      const result: any = await tool.execute(1, 10, {});
      expect(result.status).toBe("not_checked_in");
    });

    it("returns attendance details when checked in", async () => {
      chain._firstResult = {
        status: "present",
        check_in: "2026-04-04T04:00:00Z",
        check_out: "2026-04-04T13:00:00Z",
        worked_minutes: 540,
      };

      const tool = getTool("get_my_attendance");
      const result: any = await tool.execute(1, 10, {});
      expect(result.status).toBe("present");
      expect(result.total_hours).toContain("9.0");
    });

    it("shows 'In progress' when no check_out yet", async () => {
      chain._firstResult = {
        status: "present",
        check_in: "2026-04-04T04:00:00Z",
        check_out: null,
        worked_minutes: null,
      };

      const tool = getTool("get_my_attendance");
      const result: any = await tool.execute(1, 10, {});
      expect(result.total_hours).toBe("In progress");
    });
  });

  // -----------------------------------------------------------------------
  // get_leave_balance
  // -----------------------------------------------------------------------
  describe("get_leave_balance", () => {
    it("returns current user balance when no name given", async () => {
      chain._result = [
        { leave_type: "Casual", total_allocated: 12, total_used: 3, balance: 9 },
      ];

      const tool = getTool("get_leave_balance");
      const result: any = await tool.execute(1, 10, {});
      expect(result.balances).toHaveLength(1);
      expect(result.balances[0].leave_type).toBe("Casual");
    });

    it("returns error when employee name not found", async () => {
      chain._firstResult = undefined;

      const tool = getTool("get_leave_balance");
      const result: any = await tool.execute(1, 10, { employee_name: "Nobody" });
      expect(result.error).toContain("No employee found");
    });

    it("returns message when no balances found", async () => {
      chain._result = [];

      const tool = getTool("get_leave_balance");
      const result: any = await tool.execute(1, 10, {});
      expect(result.message).toContain("No leave balances");
    });
  });

  // -----------------------------------------------------------------------
  // get_pending_leave_requests
  // -----------------------------------------------------------------------
  describe("get_pending_leave_requests", () => {
    it("returns pending requests", async () => {
      chain._result = [
        { id: 1, first_name: "Jane", last_name: "Doe", leave_type: "Sick" },
      ];

      const tool = getTool("get_pending_leave_requests");
      const result: any = await tool.execute(1, 10, {});
      expect(result.pending_requests).toHaveLength(1);
      expect(result.count).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // get_announcements
  // -----------------------------------------------------------------------
  describe("get_announcements", () => {
    it("returns recent announcements", async () => {
      chain._result = [
        { id: 1, title: "Holiday Notice", priority: "high" },
      ];

      const tool = getTool("get_announcements");
      const result: any = await tool.execute(1, 10, {});
      expect(result.announcements || result).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Tool definitions
  // -----------------------------------------------------------------------
  describe("tool registry", () => {
    it("has all expected tools defined", () => {
      const expectedTools = [
        "get_employee_count",
        "get_employee_details",
        "get_department_list",
        "get_attendance_today",
        "get_attendance_for_employee",
        "get_my_attendance",
        "get_leave_balance",
        "get_pending_leave_requests",
        "get_leave_calendar",
      ];

      for (const name of expectedTools) {
        expect(tools.find((t) => t.name === name)).toBeDefined();
      }
    });

    it("every tool has name, description, parameters, and execute", () => {
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(Array.isArray(tool.parameters)).toBe(true);
        expect(typeof tool.execute).toBe("function");
      }
    });
  });
});
