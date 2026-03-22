import { describe, it, expect, beforeAll } from "vitest";
import { api, getToken } from "./helpers.js";

describe("Modules Endpoints", () => {
  let token: string;

  beforeAll(async () => {
    token = await getToken();
  });

  describe("GET /api/v1/modules", () => {
    it("lists all active modules (marketplace)", async () => {
      const { status, body } = await api.get("/api/v1/modules", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(12);

      const slugs = body.data.map((m: any) => m.slug);
      expect(slugs).toContain("emp-payroll");
      expect(slugs).toContain("emp-billing");
      expect(slugs).toContain("emp-monitor");
      expect(slugs).toContain("emp-hrms");
      expect(slugs).toContain("emp-attendance");
      expect(slugs).toContain("emp-recruit");
      expect(slugs).toContain("emp-field");
      expect(slugs).toContain("emp-biometrics");
      expect(slugs).toContain("emp-projects");
      expect(slugs).toContain("emp-rewards");
      expect(slugs).toContain("emp-performance");
      expect(slugs).toContain("emp-exit");
    });

    it("each module has required fields", async () => {
      const { body } = await api.get("/api/v1/modules", token);
      for (const mod of body.data) {
        expect(mod.id).toBeDefined();
        expect(mod.name).toBeDefined();
        expect(mod.slug).toBeDefined();
        expect(mod.description).toBeDefined();
        expect(mod.base_url).toBeDefined();
        expect(mod.is_active).toBe(1);
      }
    });
  });

  describe("GET /api/v1/modules/:id", () => {
    it("returns a specific module", async () => {
      const { status, body } = await api.get("/api/v1/modules/1", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.slug).toBe("emp-payroll");
      expect(body.data.name).toBe("EMP Payroll");
    });

    it("returns 404 for non-existent module", async () => {
      const { status } = await api.get("/api/v1/modules/99999", token);
      expect(status).toBe(404);
    });
  });

  describe("GET /api/v1/modules/:id/features", () => {
    it("returns features for a module", async () => {
      const { status, body } = await api.get("/api/v1/modules/1/features", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      for (const feature of body.data) {
        expect(feature.name).toBeDefined();
        expect(feature.feature_key).toBeDefined();
        expect(feature.min_plan_tier).toBeDefined();
      }
    });
  });
});
