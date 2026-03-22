import { describe, it, expect, beforeAll } from "vitest";
import { api, getToken } from "./helpers.js";

describe("Users Endpoints", () => {
  let token: string;

  beforeAll(async () => {
    token = await getToken();
  });

  describe("GET /api/v1/users", () => {
    it("lists users with pagination", async () => {
      const { status, body } = await api.get("/api/v1/users", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(5);
      expect(body.meta).toBeDefined();
      expect(body.meta.page).toBe(1);
      expect(body.meta.total).toBeGreaterThanOrEqual(5);
    });

    it("supports pagination params", async () => {
      const { status, body } = await api.get("/api/v1/users?page=1&per_page=2", token);
      expect(status).toBe(200);
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.meta.per_page).toBe(2);
    });

    it("supports search by name", async () => {
      const { status, body } = await api.get("/api/v1/users?search=Ananya", token);
      expect(status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0].first_name).toBe("Ananya");
    });

    it("rejects without auth", async () => {
      const { status } = await api.get("/api/v1/users");
      expect(status).toBe(401);
    });
  });

  describe("GET /api/v1/users/:id", () => {
    it("returns a specific user", async () => {
      const { status, body } = await api.get("/api/v1/users/1", token);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.email).toBe("ananya@technova.in");
      expect(body.data.first_name).toBe("Ananya");
    });

    it("returns 404 for non-existent user", async () => {
      const { status } = await api.get("/api/v1/users/99999", token);
      expect(status).toBe(404);
    });
  });

  describe("POST /api/v1/users", () => {
    it("creates a new user in the organization", async () => {
      const newUser = {
        first_name: "Sanjay",
        last_name: "Kumar",
        email: `sanjay_${Date.now()}@technova.in`,
        password: "Sanjay@123",
        designation: "QA Engineer",
        department_id: 1,
        employment_type: "full_time",
        date_of_joining: "2026-03-22",
        role: "employee",
      };
      const { status, body } = await api.post("/api/v1/users", newUser, token);
      expect(status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.email).toBe(newUser.email);
      expect(body.data.designation).toBe("QA Engineer");
    });
  });

  describe("PUT /api/v1/users/:id", () => {
    it("updates a user's info", async () => {
      const { status, body } = await api.put(
        "/api/v1/users/2",
        { designation: "Senior Engineering Lead" },
        token
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);

      // Verify
      const getRes = await api.get("/api/v1/users/2", token);
      expect(getRes.body.data.designation).toBe("Senior Engineering Lead");
    });
  });

  describe("POST /api/v1/users/invite", () => {
    it("sends an invitation email", async () => {
      const { status, body } = await api.post(
        "/api/v1/users/invite",
        {
          email: `invite_${Date.now()}@example.com`,
          first_name: "Invited",
          last_name: "User",
          role: "employee",
        },
        token
      );
      expect(status).toBe(201);
      expect(body.success).toBe(true);
    });
  });
});
