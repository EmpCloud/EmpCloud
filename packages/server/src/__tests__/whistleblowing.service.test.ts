import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/connection", () => ({ getDB: vi.fn() }));

import {
  submitReport,
  getMyReports,
  getReportByCase,
  listReports,
  getReport,
  assignInvestigator,
  addUpdate,
  updateStatus,
  escalateReport,
  getWhistleblowingDashboard,
} from "../services/whistleblowing/whistleblowing.service.js";
import { getDB } from "../db/connection.js";

const mockedGetDB = vi.mocked(getDB);

// ---- Mock DB builder ----
function createMockDB() {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.where = vi.fn((arg?: any) => {
    if (typeof arg === "function") arg.call(chain);
    return chain;
  });
  chain.whereIn = vi.fn(() => chain);
  chain.whereNotNull = vi.fn(() => chain);
  chain.orWhere = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.join = vi.fn(() => chain);
  chain.first = vi.fn(() => chain._firstResult);
  chain.insert = vi.fn(() => [1]);
  chain.update = vi.fn(() => 1);
  chain.delete = vi.fn(() => 1);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.offset = vi.fn(() => chain);
  chain.count = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.clone = vi.fn(() => chain);
  chain.increment = vi.fn(() => chain);
  chain.decrement = vi.fn(() => chain);
  chain._firstResult = undefined;
  chain._result = [];
  chain.then = vi.fn((resolve: any) => resolve(chain._result));

  const db: any = vi.fn(() => chain);
  db.raw = vi.fn((sql: string) => sql);
  return { db, chain };
}

describe("whistleblowing.service", () => {
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
  // submitReport
  // -----------------------------------------------------------------------
  describe("submitReport", () => {
    it("inserts anonymous report with hashed reporter", async () => {
      // generateCaseNumber needs first() to return null (no prior reports)
      chain._firstResult = null;
      chain.insert.mockReturnValue([42]);

      const result = await submitReport(1, 10, {
        category: "fraud",
        subject: "Test",
        description: "Details",
        is_anonymous: true,
      });

      expect(result.id).toBe(42);
      expect(result.case_number).toMatch(/^WB-\d{4}-0001$/);
      // insert should have been called with reporter_hash set and reporter_user_id null
      const insertCall = chain.insert.mock.calls[0][0];
      expect(insertCall.reporter_hash).toBeTruthy();
      expect(insertCall.reporter_user_id).toBeNull();
      expect(insertCall.is_anonymous).toBe(true);
      expect(insertCall.severity).toBe("medium"); // default
    });

    it("inserts non-anonymous report with user_id exposed", async () => {
      chain._firstResult = null;
      chain.insert.mockReturnValue([43]);

      const result = await submitReport(1, 10, {
        category: "harassment",
        severity: "high",
        subject: "Title",
        description: "Desc",
        is_anonymous: false,
      });

      expect(result.id).toBe(43);
      const insertCall = chain.insert.mock.calls[0][0];
      expect(insertCall.reporter_user_id).toBe(10);
      expect(insertCall.reporter_hash).toBeNull();
      expect(insertCall.severity).toBe("high");
    });

    it("defaults is_anonymous to true when not provided", async () => {
      chain._firstResult = null;
      chain.insert.mockReturnValue([44]);

      await submitReport(1, 10, {
        category: "corruption",
        subject: "S",
        description: "D",
      });

      const insertCall = chain.insert.mock.calls[0][0];
      expect(insertCall.is_anonymous).toBe(true);
    });

    it("serialises evidence_paths to JSON", async () => {
      chain._firstResult = null;
      chain.insert.mockReturnValue([45]);

      await submitReport(1, 10, {
        category: "fraud",
        subject: "S",
        description: "D",
        evidence_paths: ["/uploads/a.pdf", "/uploads/b.jpg"],
      });

      const insertCall = chain.insert.mock.calls[0][0];
      expect(insertCall.evidence_paths).toBe(
        JSON.stringify(["/uploads/a.pdf", "/uploads/b.jpg"])
      );
    });

    it("increments case number when previous reports exist", async () => {
      // First call (generateCaseNumber) returns a prior report
      chain._firstResult = { case_number: `WB-${new Date().getFullYear()}-0005` };
      chain.insert.mockReturnValue([50]);

      const result = await submitReport(1, 10, {
        category: "fraud",
        subject: "S",
        description: "D",
      });

      expect(result.case_number).toMatch(/0006$/);
    });
  });

  // -----------------------------------------------------------------------
  // getReportByCase
  // -----------------------------------------------------------------------
  describe("getReportByCase", () => {
    it("throws NotFoundError when report does not exist", async () => {
      chain._firstResult = undefined;
      await expect(getReportByCase(1, "WB-2026-9999")).rejects.toThrow("Report not found");
    });

    it("returns report with visible updates", async () => {
      chain._firstResult = { id: 1, case_number: "WB-2026-0001", status: "submitted" };
      chain._result = [{ id: 10, update_type: "status_change", content: "test" }];

      const result = await getReportByCase(1, "WB-2026-0001");
      expect(result.id).toBe(1);
      expect(result.updates).toEqual([{ id: 10, update_type: "status_change", content: "test" }]);
    });
  });

  // -----------------------------------------------------------------------
  // getReport (HR detail)
  // -----------------------------------------------------------------------
  describe("getReport", () => {
    it("throws NotFoundError when report does not exist", async () => {
      chain._firstResult = undefined;
      await expect(getReport(1, 999)).rejects.toThrow("Report not found");
    });

    it("parses JSON evidence_paths when stored as string", async () => {
      chain._firstResult = {
        id: 1,
        evidence_paths: '["file1.pdf","file2.jpg"]',
        is_anonymous: false,
      };
      chain._result = []; // updates

      const result = await getReport(1, 1);
      expect(result.evidence_paths).toEqual(["file1.pdf", "file2.jpg"]);
    });
  });

  // -----------------------------------------------------------------------
  // assignInvestigator
  // -----------------------------------------------------------------------
  describe("assignInvestigator", () => {
    it("throws NotFoundError if report missing", async () => {
      chain._firstResult = undefined;
      await expect(assignInvestigator(1, 999, 5)).rejects.toThrow("Report not found");
    });

    it("sets status to under_investigation when currently submitted", async () => {
      // First call: find report
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "submitted" };
        // subsequent calls (getReport inside)
        return { id: 1, status: "under_investigation", evidence_paths: null };
      });
      chain._result = []; // updates

      await assignInvestigator(1, 1, 5);

      // Should have called update with under_investigation
      const updateCall = chain.update.mock.calls[0][0];
      expect(updateCall.status).toBe("under_investigation");
    });

    it("preserves status when not submitted", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "escalated" };
        return { id: 1, status: "escalated", evidence_paths: null };
      });
      chain._result = [];

      await assignInvestigator(1, 1, 5);
      const updateCall = chain.update.mock.calls[0][0];
      expect(updateCall.status).toBe("escalated");
    });
  });

  // -----------------------------------------------------------------------
  // addUpdate
  // -----------------------------------------------------------------------
  describe("addUpdate", () => {
    it("throws NotFoundError if report missing", async () => {
      chain._firstResult = undefined;
      await expect(addUpdate(1, 999, 5, "note", "note", true)).rejects.toThrow(
        "Report not found"
      );
    });

    it("inserts update and touches report timestamp", async () => {
      chain._firstResult = { id: 1 };
      chain.insert.mockReturnValue([100]);

      const result = await addUpdate(1, 1, 5, "some content", "note", false);
      expect(result.id).toBe(100);
      expect(chain.insert).toHaveBeenCalled();
      expect(chain.update).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // updateStatus
  // -----------------------------------------------------------------------
  describe("updateStatus", () => {
    it("throws NotFoundError if report missing", async () => {
      chain._firstResult = undefined;
      await expect(updateStatus(1, 999, "resolved")).rejects.toThrow("Report not found");
    });

    it("sets resolved_at for terminal statuses", async () => {
      for (const status of ["resolved", "closed", "dismissed"]) {
        vi.clearAllMocks();
        const m = createMockDB();
        mockedGetDB.mockReturnValue(m.db);
        let callCount = 0;
        m.chain.first.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return { id: 1, status: "under_investigation" };
          return { id: 1, status, evidence_paths: null };
        });
        m.chain._result = [];
        m.chain.insert.mockReturnValue([1]);

        await updateStatus(1, 1, status, "Resolution text");
        const updateCall = m.chain.update.mock.calls[0][0];
        expect(updateCall.resolved_at).toBeInstanceOf(Date);
        expect(updateCall.resolution).toBe("Resolution text");
      }
    });

    it("does NOT set resolved_at for non-terminal statuses", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "submitted" };
        return { id: 1, status: "under_investigation", evidence_paths: null };
      });
      chain._result = [];
      chain.insert.mockReturnValue([1]);

      await updateStatus(1, 1, "under_investigation");
      const updateCall = chain.update.mock.calls[0][0];
      expect(updateCall.resolved_at).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // escalateReport
  // -----------------------------------------------------------------------
  describe("escalateReport", () => {
    it("throws NotFoundError if report missing", async () => {
      chain._firstResult = undefined;
      await expect(escalateReport(1, 999, "board")).rejects.toThrow("Report not found");
    });

    it("sets status to escalated and records escalated_to", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "under_investigation" };
        return { id: 1, status: "escalated", evidence_paths: null };
      });
      chain._result = [];
      chain.insert.mockReturnValue([1]);

      await escalateReport(1, 1, "Board of Directors");
      const updateCall = chain.update.mock.calls[0][0];
      expect(updateCall.status).toBe("escalated");
      expect(updateCall.escalated_to).toBe("Board of Directors");
    });
  });

  // -----------------------------------------------------------------------
  // getWhistleblowingDashboard
  // -----------------------------------------------------------------------
  describe("getWhistleblowingDashboard", () => {
    it("returns aggregated stats", async () => {
      // Mock the many chained queries by returning different things from first/then
      chain._firstResult = { total: 10, count: 3, avg_hours: 48 };
      chain._result = [
        { status: "submitted", count: 3 },
        { status: "resolved", count: 5 },
      ];

      const result = await getWhistleblowingDashboard(1);
      // Should return an object with expected keys
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("open");
      expect(result).toHaveProperty("resolved");
      expect(result).toHaveProperty("avg_resolution_days");
      expect(result).toHaveProperty("by_status");
      expect(result).toHaveProperty("by_category");
      expect(result).toHaveProperty("by_severity");
      expect(result).toHaveProperty("recent");
    });

    it("returns null avg_resolution_days when no resolved reports", async () => {
      chain._firstResult = { total: 0, count: 0, avg_hours: null };
      chain._result = [];

      const result = await getWhistleblowingDashboard(1);
      expect(result.avg_resolution_days).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // listReports
  // -----------------------------------------------------------------------
  describe("listReports", () => {
    it("applies status, category, severity filters", async () => {
      chain._firstResult = { total: 2 };
      chain._result = [];

      await listReports(1, {
        status: "submitted",
        category: "fraud",
        severity: "high",
        search: "test",
        page: 2,
        perPage: 10,
      });

      // where should have been called multiple times for filters
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(chain.offset).toHaveBeenCalledWith(10); // (2-1)*10
    });

    it("uses default pagination", async () => {
      chain._firstResult = { total: 0 };
      chain._result = [];

      await listReports(1);
      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(chain.offset).toHaveBeenCalledWith(0);
    });
  });
});
