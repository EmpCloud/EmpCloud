// =============================================================================
// EMP CLOUD — Chatbot Tools Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChain: any = {};
const chainMethods = [
  "select", "where", "andWhere", "orWhere", "whereRaw", "whereNull",
  "whereIn", "whereNot", "whereNotNull", "first", "insert", "update",
  "del", "count", "join", "leftJoin", "orderBy", "limit", "offset",
  "groupBy", "raw", "clone",
];
chainMethods.forEach((m) => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.first = vi.fn().mockResolvedValue(null);

const mockDb: any = vi.fn().mockReturnValue(mockChain);
mockDb.raw = vi.fn();

vi.mock("../../db/connection.js", () => ({
  getDB: vi.fn(() => mockDb),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { tools } from "./tools.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetChain() {
  chainMethods.forEach((m) => {
    mockChain[m] = vi.fn().mockReturnValue(mockChain);
  });
  mockChain.first = vi.fn().mockResolvedValue(null);
  mockDb.mockReturnValue(mockChain);
  mockDb.raw = vi.fn();
}

function getTool(name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Chatbot Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  // =========================================================================
  // get_employee_count
  // =========================================================================

  describe("get_employee_count", () => {
    it("should return a number representing total active employees", async () => {
      mockChain.count.mockResolvedValueOnce([{ count: 42 }]);

      const tool = getTool("get_employee_count");
      const result = await tool.execute(1, 10, {}) as any;

      expect(result.total_employees).toBe(42);
      expect(typeof result.total_employees).toBe("number");
    });

    it("should return 0 when no employees exist", async () => {
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);

      const tool = getTool("get_employee_count");
      const result = await tool.execute(1, 10, {}) as any;

      expect(result.total_employees).toBe(0);
    });

    it("should filter by organization_id and active status", async () => {
      mockChain.count.mockResolvedValueOnce([{ count: 10 }]);

      const tool = getTool("get_employee_count");
      await tool.execute(5, 10, {});

      expect(mockChain.where).toHaveBeenCalledWith({ organization_id: 5, status: 1 });
    });
  });

  // =========================================================================
  // get_attendance_today
  // =========================================================================

  describe("get_attendance_today", () => {
    it("should return present/absent counts and attendance rate", async () => {
      // total users
      mockChain.first.mockResolvedValueOnce({ count: 50 });
      // attendance status breakdown
      mockChain.groupBy.mockResolvedValueOnce([
        { status: "present", count: 30 },
        { status: "late", count: 5 },
        { status: "half_day", count: 3 },
        { status: "absent", count: 2 },
      ]);

      const tool = getTool("get_attendance_today");
      const result = await tool.execute(1, 10, {}) as any;

      expect(result.total_employees).toBe(50);
      expect(result.present).toBe(30);
      expect(result.late).toBe(5);
      expect(result.half_day).toBe(3);
      expect(result.absent).toBe(2);
      expect(result.date).toBeDefined();
      expect(result.attendance_rate).toContain("%");
    });

    it("should return N/A rate when no employees", async () => {
      mockChain.first.mockResolvedValueOnce({ count: 0 });
      mockChain.groupBy.mockResolvedValueOnce([]);

      const tool = getTool("get_attendance_today");
      const result = await tool.execute(1, 10, {}) as any;

      expect(result.attendance_rate).toBe("N/A");
    });
  });

  // =========================================================================
  // get_leave_balance
  // =========================================================================

  describe("get_leave_balance", () => {
    it("should return balance per leave type for current user when no name given", async () => {
      mockChain.select.mockResolvedValueOnce([
        { leave_type: "Casual Leave", total_allocated: 12, total_used: 3, balance: 9 },
        { leave_type: "Sick Leave", total_allocated: 8, total_used: 1, balance: 7 },
      ]);

      const tool = getTool("get_leave_balance");
      const result = await tool.execute(1, 10, {}) as any;

      expect(result.balances).toHaveLength(2);
      expect(result.balances[0].leave_type).toBe("Casual Leave");
    });

    it("should search by employee name when provided", async () => {
      // find employee by name
      mockChain.first.mockResolvedValueOnce({ id: 20, first_name: "Alice", last_name: "Smith" });
      // balances
      mockChain.select.mockResolvedValueOnce([
        { leave_type: "Casual Leave", balance: 5 },
      ]);

      const tool = getTool("get_leave_balance");
      const result = await tool.execute(1, 10, { employee_name: "Alice" }) as any;

      expect(result.balances).toHaveLength(1);
    });

    it("should return error when employee name not found", async () => {
      mockChain.first.mockResolvedValueOnce(null);

      const tool = getTool("get_leave_balance");
      const result = await tool.execute(1, 10, { employee_name: "Nobody" }) as any;

      expect(result.error).toBeDefined();
      expect(result.error).toContain("No employee found");
    });

    it("should return message when no balances exist", async () => {
      mockChain.select.mockResolvedValueOnce([]);

      const tool = getTool("get_leave_balance");
      const result = await tool.execute(1, 10, {}) as any;

      expect(result.message).toContain("No leave balances");
    });
  });

  // =========================================================================
  // run_sql_query
  // =========================================================================

  describe("run_sql_query", () => {
    it("should block DROP statements", async () => {
      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "DROP TABLE users",
      }) as any;

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Only SELECT");
    });

    it("should block DELETE statements", async () => {
      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "DELETE FROM users WHERE organization_id = 1",
      }) as any;

      expect(result.error).toBeDefined();
    });

    it("should block UPDATE statements", async () => {
      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "UPDATE users SET status = 0 WHERE organization_id = 1",
      }) as any;

      expect(result.error).toBeDefined();
    });

    it("should block INSERT statements", async () => {
      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "INSERT INTO users (email) VALUES ('hack@test.com')",
      }) as any;

      expect(result.error).toBeDefined();
    });

    it("should block TRUNCATE statements", async () => {
      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "TRUNCATE TABLE users",
      }) as any;

      expect(result.error).toBeDefined();
    });

    it("should block ALTER TABLE statements", async () => {
      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "ALTER TABLE users ADD COLUMN hack VARCHAR(255)",
      }) as any;

      expect(result.error).toBeDefined();
    });

    it("should allow valid SELECT query with organization_id", async () => {
      mockDb.raw.mockResolvedValueOnce([
        [{ id: 1, email: "test@test.com" }],
        [], // fields
      ]);

      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "SELECT id, email FROM users WHERE organization_id = 1",
      }) as any;

      expect(result.rows).toBeDefined();
      expect(result.count).toBe(1);
    });

    it("should enforce organization_id in query", async () => {
      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "SELECT * FROM users WHERE status = 1",
      }) as any;

      expect(result.error).toBeDefined();
      expect(result.error).toContain("organization_id");
    });

    it("should block multiple statements (SQL injection)", async () => {
      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "SELECT * FROM users WHERE organization_id = 1; DROP TABLE users",
      }) as any;

      expect(result.error).toBeDefined();
    });

    it("should limit results to 100 rows", async () => {
      const bigResult = Array.from({ length: 150 }, (_, i) => ({ id: i }));
      mockDb.raw.mockResolvedValueOnce([bigResult, []]);

      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "SELECT * FROM users WHERE organization_id = 1",
      }) as any;

      expect(result.rows.length).toBeLessThanOrEqual(100);
    });

    it("should handle database errors gracefully", async () => {
      mockDb.raw.mockRejectedValueOnce(new Error("Connection refused"));

      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "SELECT * FROM users WHERE organization_id = 1",
      }) as any;

      expect(result.error).toContain("Connection refused");
    });

    it("should reject queries not starting with SELECT", async () => {
      const tool = getTool("run_sql_query");
      const result = await tool.execute(1, 10, {
        query: "SHOW TABLES",
      }) as any;

      expect(result.error).toContain("Only SELECT");
    });
  });
});
