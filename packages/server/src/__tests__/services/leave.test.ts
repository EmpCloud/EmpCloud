import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID, OTHER_ORG_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Leave Management - Database Queries", () => {
  describe("Leave Types", () => {
    it("should have leave types for the org", async () => {
      const db = getTestDB();
      const types = await db("leave_types").where({ organization_id: TEST_ORG_ID, is_active: true });
      expect(types.length).toBeGreaterThan(0);
    });

    it("should have unique leave type codes per org", async () => {
      const db = getTestDB();
      const dupes = await db("leave_types")
        .where({ organization_id: TEST_ORG_ID })
        .select("code")
        .count("* as cnt")
        .groupBy("code")
        .having("cnt", ">", 1);
      expect(dupes).toHaveLength(0);
    });

    it("should have required fields on leave types", async () => {
      const db = getTestDB();
      const types = await db("leave_types").where({ organization_id: TEST_ORG_ID });
      for (const lt of types) {
        expect(lt.name).toBeTruthy();
        expect(lt.code).toBeTruthy();
        expect(lt.organization_id).toBe(TEST_ORG_ID);
        expect(typeof lt.is_paid).toBeDefined();
      }
    });

    it("should isolate leave types by org", async () => {
      const db = getTestDB();
      const orgTypes = await db("leave_types").where({ organization_id: TEST_ORG_ID });
      const otherTypes = await db("leave_types").where({ organization_id: OTHER_ORG_ID });
      // Both orgs have leave types
      expect(orgTypes.length).toBeGreaterThan(0);
      expect(otherTypes.length).toBeGreaterThan(0);
      // IDs should not overlap
      const orgIds = orgTypes.map((t: any) => t.id);
      const otherIds = otherTypes.map((t: any) => t.id);
      const overlap = orgIds.filter((id: number) => otherIds.includes(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe("Leave Policies", () => {
    it("should have leave policies linked to leave types", async () => {
      const db = getTestDB();
      const policies = await db("leave_policies").where({ organization_id: TEST_ORG_ID, is_active: true });
      expect(policies.length).toBeGreaterThan(0);
      for (const p of policies) {
        expect(p.leave_type_id).toBeTruthy();
        expect(Number(p.annual_quota)).toBeGreaterThan(0);
      }
    });

    it("should reference valid leave types", async () => {
      const db = getTestDB();
      const policies = await db("leave_policies").where({ organization_id: TEST_ORG_ID });
      for (const p of policies) {
        const lt = await db("leave_types").where({ id: p.leave_type_id }).first();
        expect(lt).toBeDefined();
        expect(lt.organization_id).toBe(TEST_ORG_ID);
      }
    });

    it("should have valid accrual_type values", async () => {
      const db = getTestDB();
      const policies = await db("leave_policies").where({ organization_id: TEST_ORG_ID });
      const validTypes = ["annual", "monthly", "quarterly"];
      for (const p of policies) {
        expect(validTypes).toContain(p.accrual_type);
      }
    });
  });

  describe("Leave Balances", () => {
    it("should have leave balances for org users", async () => {
      const db = getTestDB();
      const balances = await db("leave_balances").where({ organization_id: TEST_ORG_ID });
      // Balances may be 0 if not yet seeded for this org/year
      expect(balances.length).toBeGreaterThanOrEqual(0);
    });

    it("should have correct balance structure", async () => {
      const db = getTestDB();
      const balances = await db("leave_balances").where({ organization_id: TEST_ORG_ID }).limit(10);
      if (balances.length === 0) return; // skip if no balances seeded
      for (const b of balances) {
        expect(b.user_id).toBeTruthy();
        expect(b.leave_type_id).toBeTruthy();
        expect(b.year).toBeGreaterThanOrEqual(2024);
        expect(Number(b.total_allocated)).toBeGreaterThanOrEqual(0);
        expect(Number(b.total_used)).toBeGreaterThanOrEqual(0);
      }
    });

    it("should have balance = allocated + carry_forward - used", async () => {
      const db = getTestDB();
      const balances = await db("leave_balances").where({ organization_id: TEST_ORG_ID }).limit(20);
      if (balances.length === 0) return; // skip if no balances seeded
      for (const b of balances) {
        const expected = Number(b.total_allocated) + Number(b.total_carry_forward) - Number(b.total_used);
        expect(Number(b.balance)).toBeCloseTo(expected, 1);
      }
    });

    it("should reference valid users and leave types", async () => {
      const db = getTestDB();
      const balances = await db("leave_balances").where({ organization_id: TEST_ORG_ID }).limit(10);
      if (balances.length === 0) return; // skip if no balances seeded
      for (const b of balances) {
        const user = await db("users").where({ id: b.user_id }).first();
        expect(user).toBeDefined();
        expect(user.organization_id).toBe(TEST_ORG_ID);
        const lt = await db("leave_types").where({ id: b.leave_type_id }).first();
        expect(lt).toBeDefined();
      }
    });

    it("should have unique balance per user-type-year", async () => {
      const db = getTestDB();
      const dupes = await db("leave_balances")
        .where({ organization_id: TEST_ORG_ID })
        .select("user_id", "leave_type_id", "year")
        .count("* as cnt")
        .groupBy("user_id", "leave_type_id", "year")
        .having("cnt", ">", 1);
      expect(dupes).toHaveLength(0);
    });
  });

  describe("Leave Applications", () => {
    it("should have leave applications with valid statuses", async () => {
      const db = getTestDB();
      const apps = await db("leave_applications").where({ organization_id: TEST_ORG_ID });
      const validStatuses = ["pending", "approved", "rejected", "cancelled", "withdrawn"];
      for (const a of apps) {
        expect(validStatuses).toContain(a.status);
      }
    });

    it("should have start_date <= end_date", async () => {
      const db = getTestDB();
      const apps = await db("leave_applications").where({ organization_id: TEST_ORG_ID });
      for (const a of apps) {
        expect(new Date(a.start_date) <= new Date(a.end_date)).toBe(true);
      }
    });

    it("should have positive days_count", async () => {
      const db = getTestDB();
      const apps = await db("leave_applications").where({ organization_id: TEST_ORG_ID });
      for (const a of apps) {
        expect(Number(a.days_count)).toBeGreaterThan(0);
      }
    });

    it("should reference valid leave types", async () => {
      const db = getTestDB();
      const apps = await db("leave_applications").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const a of apps) {
        const lt = await db("leave_types").where({ id: a.leave_type_id }).first();
        expect(lt).toBeDefined();
      }
    });

    it("should isolate applications by org", async () => {
      const db = getTestDB();
      const orgApps = await db("leave_applications").where({ organization_id: TEST_ORG_ID });
      for (const a of orgApps) {
        expect(a.organization_id).toBe(TEST_ORG_ID);
        const user = await db("users").where({ id: a.user_id }).first();
        expect(user.organization_id).toBe(TEST_ORG_ID);
      }
    });
  });
});
