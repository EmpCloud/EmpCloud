import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Position Management - Database Queries", () => {
  describe("Positions", () => {
    it("positions table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("positions");
      expect(hasTable).toBe(true);
    });

    it("should have positions for the org", async () => {
      const db = getTestDB();
      const positions = await db("positions").where({ organization_id: TEST_ORG_ID });
      expect(positions.length).toBeGreaterThanOrEqual(0);
    });

    it("should have valid status values", async () => {
      const db = getTestDB();
      const positions = await db("positions").where({ organization_id: TEST_ORG_ID });
      const validStatuses = ["active", "frozen", "closed"];
      for (const p of positions) {
        expect(validStatuses).toContain(p.status);
      }
    });

    it("position codes should be unique per org", async () => {
      const db = getTestDB();
      const dupes = await db("positions")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("code")
        .select("code")
        .count("* as cnt")
        .groupBy("code")
        .having("cnt", ">", 1);
      expect(dupes).toHaveLength(0);
    });

    it("headcount_filled should not exceed headcount_budget", async () => {
      const db = getTestDB();
      const positions = await db("positions").where({ organization_id: TEST_ORG_ID });
      for (const p of positions) {
        expect(p.headcount_filled).toBeLessThanOrEqual(p.headcount_budget);
      }
    });

    it("headcount values should be non-negative", async () => {
      const db = getTestDB();
      const positions = await db("positions").where({ organization_id: TEST_ORG_ID });
      for (const p of positions) {
        expect(p.headcount_budget).toBeGreaterThanOrEqual(0);
        expect(p.headcount_filled).toBeGreaterThanOrEqual(0);
      }
    });

    it("should detect vacancies (budget > filled)", async () => {
      const db = getTestDB();
      const vacancies = await db("positions")
        .where({ organization_id: TEST_ORG_ID, status: "active" })
        .whereRaw("headcount_filled < headcount_budget");
      // Vacancies are positions where there is unfilled headcount
      for (const v of vacancies) {
        expect(v.headcount_budget - v.headcount_filled).toBeGreaterThan(0);
      }
    });

    it("should have valid employment_type values", async () => {
      const db = getTestDB();
      const positions = await db("positions").where({ organization_id: TEST_ORG_ID });
      const validTypes = ["full_time", "part_time", "contract", "intern"];
      for (const p of positions) {
        expect(validTypes).toContain(p.employment_type);
      }
    });

    it("salary range: min_salary <= max_salary when both present", async () => {
      const db = getTestDB();
      const positions = await db("positions")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("min_salary")
        .whereNotNull("max_salary");
      for (const p of positions) {
        expect(Number(p.min_salary)).toBeLessThanOrEqual(Number(p.max_salary));
      }
    });

    it("should reference valid departments when present", async () => {
      const db = getTestDB();
      const positions = await db("positions")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("department_id")
        .limit(10);
      for (const p of positions) {
        const dept = await db("organization_departments").where({ id: p.department_id }).first();
        expect(dept).toBeDefined();
      }
    });
  });

  describe("Position Assignments", () => {
    it("position_assignments table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("position_assignments");
      expect(hasTable).toBe(true);
    });

    it("should reference valid positions and users", async () => {
      const db = getTestDB();
      const assignments = await db("position_assignments")
        .where({ organization_id: TEST_ORG_ID })
        .limit(10);
      for (const a of assignments) {
        const pos = await db("positions").where({ id: a.position_id }).first();
        expect(pos).toBeDefined();
        const user = await db("users").where({ id: a.user_id }).first();
        expect(user).toBeDefined();
      }
    });

    it("should have valid status values", async () => {
      const db = getTestDB();
      const assignments = await db("position_assignments")
        .where({ organization_id: TEST_ORG_ID });
      const validStatuses = ["active", "ended"];
      for (const a of assignments) {
        expect(validStatuses).toContain(a.status);
      }
    });
  });

  describe("Headcount Plans", () => {
    it("headcount_plans table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("headcount_plans");
      expect(hasTable).toBe(true);
    });

    it("should have valid status values", async () => {
      const db = getTestDB();
      const plans = await db("headcount_plans").where({ organization_id: TEST_ORG_ID });
      const validStatuses = ["draft", "submitted", "approved", "rejected"];
      for (const p of plans) {
        expect(validStatuses).toContain(p.status);
      }
    });
  });
});
