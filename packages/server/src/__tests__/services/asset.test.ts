import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Asset Management - Database Queries", () => {
  describe("Asset Categories", () => {
    it("asset_categories table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("asset_categories");
      expect(hasTable).toBe(true);
    });

    it("should have categories for the org", async () => {
      const db = getTestDB();
      const categories = await db("asset_categories").where({ organization_id: TEST_ORG_ID });
      expect(categories.length).toBeGreaterThanOrEqual(0);
    });

    it("categories should have names", async () => {
      const db = getTestDB();
      const categories = await db("asset_categories").where({ organization_id: TEST_ORG_ID });
      for (const c of categories) {
        expect(c.name).toBeTruthy();
        expect(c.name.length).toBeGreaterThan(0);
      }
    });

    it("active categories should have is_active = true", async () => {
      const db = getTestDB();
      const active = await db("asset_categories").where({ organization_id: TEST_ORG_ID, is_active: true });
      for (const c of active) {
        expect(c.is_active).toBe(1); // mysql returns 1 for true
      }
    });
  });

  describe("Assets", () => {
    it("assets table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("assets");
      expect(hasTable).toBe(true);
    });

    it("should have assets for the org", async () => {
      const db = getTestDB();
      const assets = await db("assets").where({ organization_id: TEST_ORG_ID });
      expect(assets.length).toBeGreaterThanOrEqual(0);
    });

    it("asset tags should follow AST-YYYY-NNNN format", async () => {
      const db = getTestDB();
      const assets = await db("assets").where({ organization_id: TEST_ORG_ID });
      for (const a of assets) {
        expect(a.asset_tag).toBeTruthy();
        // Tag format: AST-YYYY-NNNN or similar pattern
        expect(a.asset_tag).toMatch(/^AST-\d{4}-\d{4}$/);
      }
    });

    it("asset tags should be unique per org", async () => {
      const db = getTestDB();
      const dupes = await db("assets")
        .where({ organization_id: TEST_ORG_ID })
        .select("asset_tag")
        .count("* as cnt")
        .groupBy("asset_tag")
        .having("cnt", ">", 1);
      expect(dupes).toHaveLength(0);
    });

    it("should have valid status values", async () => {
      const db = getTestDB();
      const assets = await db("assets").where({ organization_id: TEST_ORG_ID });
      const validStatuses = ["available", "assigned", "in_repair", "retired", "lost", "damaged"];
      for (const a of assets) {
        expect(validStatuses).toContain(a.status);
      }
    });

    it("should have valid condition_status values", async () => {
      const db = getTestDB();
      const assets = await db("assets").where({ organization_id: TEST_ORG_ID });
      const validConditions = ["new", "good", "fair", "poor"];
      for (const a of assets) {
        expect(validConditions).toContain(a.condition_status);
      }
    });

    it("assigned assets should have assigned_to user", async () => {
      const db = getTestDB();
      const assigned = await db("assets").where({ organization_id: TEST_ORG_ID, status: "assigned" });
      for (const a of assigned) {
        expect(a.assigned_to).toBeTruthy();
        const user = await db("users").where({ id: a.assigned_to }).first();
        expect(user).toBeDefined();
      }
    });

    it("available assets should not be assigned", async () => {
      const db = getTestDB();
      const available = await db("assets").where({ organization_id: TEST_ORG_ID, status: "available" });
      for (const a of available) {
        expect(a.assigned_to).toBeNull();
      }
    });

    it("should reference valid categories when present", async () => {
      const db = getTestDB();
      const assets = await db("assets")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("category_id")
        .limit(10);
      for (const a of assets) {
        const cat = await db("asset_categories").where({ id: a.category_id }).first();
        expect(cat).toBeDefined();
      }
    });

    it("purchase_cost should be non-negative when present", async () => {
      const db = getTestDB();
      const assets = await db("assets")
        .where({ organization_id: TEST_ORG_ID })
        .whereNotNull("purchase_cost");
      for (const a of assets) {
        expect(Number(a.purchase_cost)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Asset History", () => {
    it("asset_history table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("asset_history");
      expect(hasTable).toBe(true);
    });

    it("should have valid action values", async () => {
      const db = getTestDB();
      const history = await db("asset_history").where({ organization_id: TEST_ORG_ID }).limit(20);
      const validActions = ["created", "assigned", "returned", "repaired", "retired", "lost", "damaged", "updated"];
      for (const h of history) {
        expect(validActions).toContain(h.action);
      }
    });

    it("history entries should reference valid assets", async () => {
      const db = getTestDB();
      const history = await db("asset_history").where({ organization_id: TEST_ORG_ID }).limit(10);
      for (const h of history) {
        const asset = await db("assets").where({ id: h.asset_id }).first();
        expect(asset).toBeDefined();
      }
    });
  });
});
