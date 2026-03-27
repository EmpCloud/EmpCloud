import { describe, it, expect, beforeAll } from "vitest";
import { api, getToken } from "./helpers.js";

describe("Organization Endpoints", () => {
  let token: string;

  beforeAll(async () => {
    token = await getToken();
  });

  describe("GET /api/v1/organizations/me", () => {
    it("returns current organization details", async () => {
      const { status, body } = await api.get("/api/v1/organizations/me", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      // Verify it returns the logged-in user's org (TechNova)
      expect(body.data.name).toBeDefined();
      expect(body.data.name).toContain("TechNova");
      expect(body.data.country).toBeTruthy();
      expect(body.data.timezone).toBe("Asia/Kolkata");
      expect(body.data.is_active).toBe(1);
    });

    it("rejects without auth", async () => {
      const { status } = await api.get("/api/v1/organizations/me");
      expect(status).toBe(401);
    });
  });

  describe("GET /api/v1/organizations/me/stats", () => {
    it("returns org statistics", async () => {
      const { status, body } = await api.get("/api/v1/organizations/me/stats", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.total_users).toBeGreaterThanOrEqual(5);
      expect(body.data.total_departments).toBeGreaterThanOrEqual(5);
      expect(body.data.active_subscriptions).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Departments", () => {
    it("GET /api/v1/organizations/me/departments lists departments", async () => {
      const { status, body } = await api.get("/api/v1/organizations/me/departments", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(5);
      const names = body.data.map((d: any) => d.name);
      expect(names).toContain("HR");
      // Check for at least one other department (actual names may vary by seed data)
      expect(body.data.length).toBeGreaterThanOrEqual(3);
    });

    it("POST /api/v1/organizations/me/departments creates a department", async () => {
      const deptName = `QA_${Date.now()}`;
      const { status, body } = await api.post(
        "/api/v1/organizations/me/departments",
        { name: deptName },
        token
      );
      expect(status).toBe(201);
      expect(body.success).toBe(true);

      // Verify it appears in list
      const listRes = await api.get("/api/v1/organizations/me/departments", token);
      const names = listRes.body.data.map((d: any) => d.name);
      expect(names).toContain(deptName);
    });
  });

  describe("Locations", () => {
    it("GET /api/v1/organizations/me/locations lists locations", async () => {
      const { status, body } = await api.get("/api/v1/organizations/me/locations", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("POST /api/v1/organizations/me/locations creates a location", async () => {
      const locName = `Office_${Date.now()}`;
      const { status, body } = await api.post(
        "/api/v1/organizations/me/locations",
        { name: locName, address: "123 Test St", city: "Mumbai", state: "MH", country: "IN" },
        token
      );
      expect(status).toBe(201);
      expect(body.success).toBe(true);
    });
  });

  describe("PUT /api/v1/organizations/me", () => {
    it("updates organization details", async () => {
      const { status, body } = await api.put(
        "/api/v1/organizations/me",
        { website: "https://technova-updated.in" },
        token
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);

      // Verify update
      const getRes = await api.get("/api/v1/organizations/me", token);
      expect(getRes.body.data.website).toBe("https://technova-updated.in");
    });
  });
});
