import { describe, it, expect, beforeAll } from "vitest";
import { api, getToken } from "./helpers.js";

describe("Audit Log Endpoint", () => {
  let token: string;

  beforeAll(async () => {
    token = await getToken();
  });

  describe("GET /api/v1/audit", () => {
    it("returns audit logs with pagination", async () => {
      const { status, body } = await api.get("/api/v1/audit", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.meta).toBeDefined();
      expect(body.meta.page).toBe(1);
      expect(body.meta.total).toBeGreaterThan(0);

      const log = body.data[0];
      expect(log.id).toBeDefined();
      expect(log.organization_id).toBe(5);
      expect(log.action).toBeDefined();
      expect(log.created_at).toBeDefined();
    });

    it("contains login events from our test calls", async () => {
      const { body } = await api.get("/api/v1/audit", token);
      const loginEvents = body.data.filter((l: any) => l.action === "login");
      expect(loginEvents.length).toBeGreaterThan(0);
    });

    it("supports pagination", async () => {
      const { status, body } = await api.get("/api/v1/audit?page=1&per_page=1", token);
      expect(status).toBe(200);
      expect(body.data.length).toBeLessThanOrEqual(1);
      expect(body.meta.per_page).toBe(1);
    });

    it("rejects without auth", async () => {
      const { status } = await api.get("/api/v1/audit");
      expect(status).toBe(401);
    });
  });
});
