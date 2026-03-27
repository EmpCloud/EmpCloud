import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID, OTHER_ORG_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Organization - Database Queries", () => {
  describe("Organizations", () => {
    it("should find TechNova org by ID", async () => {
      const db = getTestDB();
      const org = await db("organizations").where({ id: TEST_ORG_ID }).first();
      expect(org).toBeDefined();
      expect(org.name).toBeTruthy();
      expect(org.is_active).toBeTruthy();
    });

    it("should have required fields", async () => {
      const db = getTestDB();
      const org = await db("organizations").where({ id: TEST_ORG_ID }).first();
      expect(org.name).toBeTruthy();
      expect(org.language).toBeTruthy();
      expect(org.created_at).toBeTruthy();
    });

    it("should have multiple active orgs", async () => {
      const db = getTestDB();
      const orgs = await db("organizations").where({ is_active: true });
      expect(orgs.length).toBeGreaterThan(1);
    });

    it("current_user_count should be non-negative", async () => {
      const db = getTestDB();
      const orgs = await db("organizations").where({ is_active: true });
      for (const o of orgs) {
        expect(o.current_user_count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Organization Departments", () => {
    it("should have departments for the org", async () => {
      const db = getTestDB();
      const depts = await db("organization_departments").where({ organization_id: TEST_ORG_ID, is_deleted: false });
      expect(depts.length).toBeGreaterThan(0);
    });

    it("department names should be unique within org (non-deleted)", async () => {
      const db = getTestDB();
      const dupes = await db("organization_departments")
        .where({ organization_id: TEST_ORG_ID, is_deleted: false })
        .select("name")
        .count("* as cnt")
        .groupBy("name")
        .having("cnt", ">", 1);
      expect(dupes).toHaveLength(0);
    });

    it("departments should have non-empty names", async () => {
      const db = getTestDB();
      const depts = await db("organization_departments").where({ organization_id: TEST_ORG_ID });
      for (const d of depts) {
        expect(d.name).toBeTruthy();
        expect(d.name.trim().length).toBeGreaterThan(0);
      }
    });

    it("should isolate departments by org", async () => {
      const db = getTestDB();
      const orgDepts = await db("organization_departments").where({ organization_id: TEST_ORG_ID });
      const otherDepts = await db("organization_departments").where({ organization_id: OTHER_ORG_ID });
      const orgIds = orgDepts.map((d: any) => d.id);
      const otherIds = otherDepts.map((d: any) => d.id);
      const overlap = orgIds.filter((id: number) => otherIds.includes(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe("Organization Locations", () => {
    it("should have locations for the org", async () => {
      const db = getTestDB();
      const locations = await db("organization_locations").where({ organization_id: TEST_ORG_ID });
      expect(locations.length).toBeGreaterThan(0);
    });

    it("locations should have non-empty names", async () => {
      const db = getTestDB();
      const locations = await db("organization_locations").where({ organization_id: TEST_ORG_ID });
      for (const l of locations) {
        expect(l.name).toBeTruthy();
      }
    });

    it("should isolate locations by org", async () => {
      const db = getTestDB();
      const orgLocs = await db("organization_locations").where({ organization_id: TEST_ORG_ID });
      for (const l of orgLocs) {
        expect(l.organization_id).toBe(TEST_ORG_ID);
      }
    });
  });
});
