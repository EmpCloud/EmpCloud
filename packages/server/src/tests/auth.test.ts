import { describe, it, expect } from "vitest";
import { api, loginAs } from "./helpers.js";

describe("Auth Endpoints", () => {
  const testOrg = {
    org_name: `TestOrg_${Date.now()}`,
    first_name: "Test",
    last_name: "User",
    email: `test_${Date.now()}@example.com`,
    password: "TestPass@123",
  };

  describe("POST /api/v1/auth/register", () => {
    it("registers a new organization and admin user", async () => {
      const { status, body } = await api.post("/api/v1/auth/register", testOrg);
      expect(status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe(testOrg.email);
      expect(body.data.user.first_name).toBe(testOrg.first_name);
      expect(body.data.user.role).toBe("org_admin");
      expect(body.data.org.name).toBe(testOrg.org_name);
      expect(body.data.tokens.access_token).toBeDefined();
      expect(body.data.tokens.refresh_token).toBeDefined();
      expect(body.data.tokens.token_type).toBe("Bearer");
    });

    it("rejects duplicate email registration", async () => {
      const { status, body } = await api.post("/api/v1/auth/register", testOrg);
      expect(status).toBe(409);
      expect(body.success).toBe(false);
    });

    it("rejects invalid registration data", async () => {
      const { status, body } = await api.post("/api/v1/auth/register", {
        org_name: "",
        email: "bad-email",
        password: "short",
      });
      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("logs in with valid credentials", async () => {
      const { status, body } = await api.post("/api/v1/auth/login", {
        email: testOrg.email,
        password: testOrg.password,
      });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe(testOrg.email);
      expect(body.data.tokens.access_token).toBeDefined();
      expect(body.data.tokens.refresh_token).toBeDefined();
      expect(body.data.tokens.id_token).toBeDefined();
    });

    it("rejects wrong password", async () => {
      const { status, body } = await api.post("/api/v1/auth/login", {
        email: testOrg.email,
        password: "WrongPass@123",
      });
      expect(status).toBe(401);
      expect(body.success).toBe(false);
    });

    it("rejects non-existent email", async () => {
      const { status, body } = await api.post("/api/v1/auth/login", {
        email: "nonexistent@example.com",
        password: "TestPass@123",
      });
      expect(status).toBe(401);
      expect(body.success).toBe(false);
    });
  });

  describe("POST /api/v1/auth/change-password", () => {
    it("changes password with valid current password", async () => {
      const { token } = await loginAs(testOrg.email, testOrg.password);
      const { status, body } = await api.post(
        "/api/v1/auth/change-password",
        { current_password: testOrg.password, new_password: "NewPass@456" },
        token
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);

      // Verify new password works
      const loginResult = await api.post("/api/v1/auth/login", {
        email: testOrg.email,
        password: "NewPass@456",
      });
      expect(loginResult.status).toBe(200);
    });

    it("rejects without auth token", async () => {
      const { status } = await api.post("/api/v1/auth/change-password", {
        current_password: "old",
        new_password: "NewPass@789",
      });
      expect(status).toBe(401);
    });
  });

  describe("POST /api/v1/auth/forgot-password", () => {
    it("accepts valid email for password reset", async () => {
      const { status, body } = await api.post("/api/v1/auth/forgot-password", {
        email: "ananya@technova.in",
      });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("returns success even for non-existent email (no leak)", async () => {
      const { status, body } = await api.post("/api/v1/auth/forgot-password", {
        email: "nobody@nowhere.com",
      });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });
});
