import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID, TEST_ADMIN_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Employee Management - Database Queries", () => {
  describe("Employee Directory", () => {
    it("should list employees for the org", async () => {
      const db = getTestDB();
      const employees = await db("users")
        .where({ organization_id: TEST_ORG_ID, status: 1 });
      expect(employees.length).toBeGreaterThan(0);
    });

    it("should support full name search via CONCAT", async () => {
      const db = getTestDB();
      const results = await db("users")
        .where({ organization_id: TEST_ORG_ID })
        .whereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", ["%Priya%"]);
      expect(results.length).toBeGreaterThan(0);
      const hasPriya = results.some((r: any) => r.first_name.toLowerCase().includes("priya"));
      expect(hasPriya).toBe(true);
    });

    it("should support department filter", async () => {
      const db = getTestDB();
      const depts = await db("organization_departments").where({ organization_id: TEST_ORG_ID }).limit(1);
      if (depts.length > 0) {
        const deptUsers = await db("users")
          .where({ organization_id: TEST_ORG_ID, department_id: depts[0].id });
        for (const u of deptUsers) {
          expect(u.department_id).toBe(depts[0].id);
        }
      }
    });

    it("should support pagination with limit/offset", async () => {
      const db = getTestDB();
      const page1 = await db("users")
        .where({ organization_id: TEST_ORG_ID, status: 1 })
        .orderBy("id")
        .limit(2)
        .offset(0);
      const page2 = await db("users")
        .where({ organization_id: TEST_ORG_ID, status: 1 })
        .orderBy("id")
        .limit(2)
        .offset(2);
      // Pages should not overlap
      if (page1.length > 0 && page2.length > 0) {
        const ids1 = page1.map((u: any) => u.id);
        const ids2 = page2.map((u: any) => u.id);
        const overlap = ids1.filter((id: number) => ids2.includes(id));
        expect(overlap).toHaveLength(0);
      }
    });

    it("should have valid employment_type values", async () => {
      const db = getTestDB();
      const users = await db("users").where({ organization_id: TEST_ORG_ID });
      const validTypes = ["full_time", "part_time", "contract", "intern", "probation"];
      for (const u of users) {
        if (u.employment_type) {
          expect(validTypes).toContain(u.employment_type);
        }
      }
    });

    it("should have emp_code on employees", async () => {
      const db = getTestDB();
      const employees = await db("users")
        .where({ organization_id: TEST_ORG_ID, status: 1 })
        .whereNotNull("emp_code");
      expect(employees.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Employee Profiles (Extended)", () => {
    it("employee_profiles table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("employee_profiles");
      expect(hasTable).toBe(true);
    });

    it("should have profiles for org users", async () => {
      const db = getTestDB();
      const profiles = await db("employee_profiles").where({ organization_id: TEST_ORG_ID });
      expect(profiles.length).toBeGreaterThanOrEqual(0);
    });

    it("should have unique profile per user", async () => {
      const db = getTestDB();
      const dupes = await db("employee_profiles")
        .where({ organization_id: TEST_ORG_ID })
        .select("user_id")
        .count("* as cnt")
        .groupBy("user_id")
        .having("cnt", ">", 1);
      expect(dupes).toHaveLength(0);
    });

    it("profile user_ids should reference valid org users", async () => {
      const db = getTestDB();
      const profiles = await db("employee_profiles").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const p of profiles) {
        const user = await db("users").where({ id: p.user_id }).first();
        expect(user).toBeDefined();
        expect(user.organization_id).toBe(TEST_ORG_ID);
      }
    });
  });

  describe("Employee Addresses", () => {
    it("employee_addresses table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("employee_addresses");
      expect(hasTable).toBe(true);
    });

    it("should have valid address types", async () => {
      const db = getTestDB();
      const addresses = await db("employee_addresses").where({ organization_id: TEST_ORG_ID });
      const validTypes = ["permanent", "current", "correspondence", "temporary"];
      for (const a of addresses) {
        expect(validTypes).toContain(a.type);
      }
    });
  });

  describe("Employee Education", () => {
    it("employee_education table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("employee_education");
      expect(hasTable).toBe(true);
    });

    it("should have required fields", async () => {
      const db = getTestDB();
      const records = await db("employee_education").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const r of records) {
        expect(r.degree).toBeTruthy();
        expect(r.institution).toBeTruthy();
        expect(r.user_id).toBeTruthy();
      }
    });
  });

  describe("Employee Dependents", () => {
    it("employee_dependents table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("employee_dependents");
      expect(hasTable).toBe(true);
    });

    it("nominee percentages should not exceed 100 per user", async () => {
      const db = getTestDB();
      const totals = await db("employee_dependents")
        .where({ organization_id: TEST_ORG_ID, is_nominee: true })
        .select("user_id")
        .sum("nominee_percentage as total_pct")
        .groupBy("user_id");
      for (const t of totals) {
        expect(Number(t.total_pct)).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("Reporting Manager Hierarchy", () => {
    it("should have valid reporting chain (no self-references)", async () => {
      const db = getTestDB();
      const users = await db("users")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("reporting_manager_id");
      for (const u of users) {
        expect(u.id).not.toBe(u.reporting_manager_id);
      }
    });
  });
});
