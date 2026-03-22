import { describe, it, expect, beforeAll } from "vitest";
import { api, getToken } from "./helpers.js";

describe("Subscriptions Endpoints", () => {
  let token: string;

  beforeAll(async () => {
    token = await getToken();
  });

  describe("GET /api/v1/subscriptions", () => {
    it("lists organization subscriptions", async () => {
      const { status, body } = await api.get("/api/v1/subscriptions", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(2);

      // Find the seeded Payroll subscription (known to have price_per_seat > 0)
      const payrollSub = body.data.find((s: any) => s.module_id === 1);
      expect(payrollSub).toBeDefined();
      expect(payrollSub.organization_id).toBe(1);
      expect(payrollSub.plan_tier).toBe("professional");
      expect(payrollSub.status).toBe("active");
      expect(payrollSub.total_seats).toBeGreaterThan(0);
      expect(payrollSub.price_per_seat).toBeGreaterThan(0);
      expect(payrollSub.currency).toBe("INR");
    });

    it("rejects without auth", async () => {
      const { status } = await api.get("/api/v1/subscriptions");
      expect(status).toBe(401);
    });
  });

  describe("GET /api/v1/subscriptions/:id", () => {
    it("returns a specific subscription", async () => {
      const { status, body } = await api.get("/api/v1/subscriptions/1", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.module_id).toBe(1);
      expect(body.data.plan_tier).toBe("professional");
    });
  });

  describe("GET /api/v1/subscriptions/billing-summary", () => {
    it("returns billing summary with costs", async () => {
      const { status, body } = await api.get("/api/v1/subscriptions/billing-summary", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.subscriptions).toBeDefined();
      expect(body.data.subscriptions.length).toBeGreaterThanOrEqual(2);
      expect(body.data.total_monthly_cost).toBeGreaterThan(0);
      expect(body.data.currency).toBe("INR");

      // Check seeded subscriptions (skip any with price 0 from test runs)
      const paidSubs = body.data.subscriptions.filter((s: any) => s.price_per_seat > 0);
      expect(paidSubs.length).toBeGreaterThanOrEqual(2);
      for (const sub of paidSubs) {
        expect(sub.module_name).toBeDefined();
        expect(sub.module_slug).toBeDefined();
        expect(sub.billing_cycle).toBe("monthly");
      }
    });
  });

  describe("GET /api/v1/subscriptions/:id/seats", () => {
    it("lists seat assignments for a subscription", async () => {
      const { status, body } = await api.get("/api/v1/subscriptions/1/seats", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  describe("POST /api/v1/subscriptions", () => {
    it("subscribes to a new module", async () => {
      // Use a module that likely hasn't been subscribed yet (emp-hrms, id 4)
      const { status, body } = await api.post(
        "/api/v1/subscriptions",
        {
          module_id: 4,
          plan_tier: "basic",
          total_seats: 10,
          billing_cycle: "monthly",
        },
        token
      );
      // Accept either 201 (new) or 409 (already subscribed from previous test run)
      if (status === 201) {
        expect(body.success).toBe(true);
        expect(body.data.module_id).toBe(4);
        expect(body.data.plan_tier).toBe("basic");
        expect(body.data.total_seats).toBe(10);
        expect(body.data.status).toBe("active");
      } else {
        expect(status).toBe(409);
      }
    });
  });

  describe("POST /api/v1/subscriptions/check-access", () => {
    it("returns true for user with active seat", async () => {
      // check-access doesn't require auth but needs organization_id
      const { status, body } = await api.post(
        "/api/v1/subscriptions/check-access",
        { user_id: 1, module_slug: "emp-payroll", organization_id: 1 },
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.has_access).toBe(true);
    });

    it("returns false for user without seat", async () => {
      const { status, body } = await api.post(
        "/api/v1/subscriptions/check-access",
        { user_id: 1, module_slug: "emp-field", organization_id: 1 },
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.has_access).toBe(false);
    });
  });
});
