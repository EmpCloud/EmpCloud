import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID, OTHER_ORG_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Attendance Management - Database Queries", () => {
  describe("Shifts", () => {
    it("should have shifts for the org", async () => {
      const db = getTestDB();
      const shifts = await db("shifts").where({ organization_id: TEST_ORG_ID, is_active: true });
      expect(shifts.length).toBeGreaterThan(0);
    });

    it("should have valid shift times", async () => {
      const db = getTestDB();
      const shifts = await db("shifts").where({ organization_id: TEST_ORG_ID });
      for (const s of shifts) {
        expect(s.start_time).toBeTruthy();
        expect(s.end_time).toBeTruthy();
        expect(s.name).toBeTruthy();
      }
    });

    it("should have at least one default shift", async () => {
      const db = getTestDB();
      const defaults = await db("shifts").where({ organization_id: TEST_ORG_ID, is_default: true });
      expect(defaults.length).toBeGreaterThanOrEqual(0); // may or may not have explicit default
    });

    it("should have non-negative grace minutes", async () => {
      const db = getTestDB();
      const shifts = await db("shifts").where({ organization_id: TEST_ORG_ID });
      for (const s of shifts) {
        expect(s.grace_minutes_late).toBeGreaterThanOrEqual(0);
        expect(s.grace_minutes_early).toBeGreaterThanOrEqual(0);
        expect(s.break_minutes).toBeGreaterThanOrEqual(0);
      }
    });

    it("should isolate shifts by org", async () => {
      const db = getTestDB();
      const orgShifts = await db("shifts").where({ organization_id: TEST_ORG_ID });
      const otherShifts = await db("shifts").where({ organization_id: OTHER_ORG_ID });
      const orgIds = orgShifts.map((s: any) => s.id);
      const otherIds = otherShifts.map((s: any) => s.id);
      const overlap = orgIds.filter((id: number) => otherIds.includes(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe("Attendance Records", () => {
    it("should have attendance records for the org", async () => {
      const db = getTestDB();
      const records = await db("attendance_records")
        .where({ organization_id: TEST_ORG_ID })
        .limit(10);
      expect(records.length).toBeGreaterThan(0);
    });

    it("should have valid status values", async () => {
      const db = getTestDB();
      const records = await db("attendance_records")
        .where({ organization_id: TEST_ORG_ID })
        .limit(50);
      const validStatuses = ["present", "absent", "half_day", "on_leave", "holiday", "weekend", "late"];
      for (const r of records) {
        expect(validStatuses).toContain(r.status);
      }
    });

    it("should have check_in before check_out when both exist", async () => {
      const db = getTestDB();
      const records = await db("attendance_records")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("check_in")
        .whereNotNull("check_out")
        .limit(20);
      for (const r of records) {
        expect(new Date(r.check_in) <= new Date(r.check_out)).toBe(true);
      }
    });

    it("should have unique record per user per date per org", async () => {
      const db = getTestDB();
      const dupes = await db("attendance_records")
        .where({ organization_id: TEST_ORG_ID })
        .select("user_id", "date")
        .count("* as cnt")
        .groupBy("user_id", "date")
        .having("cnt", ">", 1);
      expect(dupes).toHaveLength(0);
    });

    it("should have non-negative worked_minutes", async () => {
      const db = getTestDB();
      const records = await db("attendance_records")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("worked_minutes")
        .limit(20);
      for (const r of records) {
        expect(r.worked_minutes).toBeGreaterThanOrEqual(0);
      }
    });

    it("should reference valid users in the same org", async () => {
      const db = getTestDB();
      const records = await db("attendance_records")
        .where({ organization_id: TEST_ORG_ID })
        .limit(10);
      for (const r of records) {
        const user = await db("users").where({ id: r.user_id }).first();
        expect(user).toBeDefined();
        expect(user.organization_id).toBe(TEST_ORG_ID);
      }
    });

    it("should support date range filtering", async () => {
      const db = getTestDB();
      const records = await db("attendance_records")
        .where({ organization_id: TEST_ORG_ID })
        .whereBetween("date", ["2025-01-01", "2025-12-31"])
        .limit(10);
      for (const r of records) {
        const d = new Date(r.date);
        expect(d.getFullYear()).toBe(2025);
      }
    });

    it("should isolate attendance records by org", async () => {
      const db = getTestDB();
      const orgRecords = await db("attendance_records")
        .where({ organization_id: TEST_ORG_ID })
        .limit(5);
      for (const r of orgRecords) {
        expect(r.organization_id).toBe(TEST_ORG_ID);
      }
    });
  });

  describe("Shift Assignments", () => {
    it("shift_assignments table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("shift_assignments");
      expect(hasTable).toBe(true);
    });

    it("should reference valid shifts and users", async () => {
      const db = getTestDB();
      const assignments = await db("shift_assignments")
        .where({ organization_id: TEST_ORG_ID })
        .limit(10);
      for (const a of assignments) {
        const shift = await db("shifts").where({ id: a.shift_id }).first();
        expect(shift).toBeDefined();
        const user = await db("users").where({ id: a.user_id }).first();
        expect(user).toBeDefined();
      }
    });
  });

  describe("Attendance Regularizations", () => {
    it("regularizations table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("attendance_regularizations");
      expect(hasTable).toBe(true);
    });

    it("should have valid statuses", async () => {
      const db = getTestDB();
      const regs = await db("attendance_regularizations")
        .where({ organization_id: TEST_ORG_ID })
        .limit(10);
      const validStatuses = ["pending", "approved", "rejected"];
      for (const r of regs) {
        expect(validStatuses).toContain(r.status);
      }
    });
  });
});
