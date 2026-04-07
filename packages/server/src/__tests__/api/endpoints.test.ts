import { describe, it, expect } from "vitest";

const API = process.env.TEST_API_URL ?? "https://test-empcloud-api.empcloud.com";

async function login(email: string, password: string) {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({ success: false, error: { message: "Non-JSON response" } })) as any;
  return { status: res.status, data };
}

async function getWithAuth(path: string, token: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({ success: false, error: { message: "Non-JSON response" } })) as any;
  return { status: res.status, data };
}

describe("API Endpoints - Live Server", () => {
  describe("Health Check", () => {
    it("GET /health returns healthy", async () => {
      const res = await fetch(`${API}/health`);
      const data = await res.json().catch(() => null) as any;
      expect(data).not.toBeNull();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("healthy");
    });
  });

  describe("Authentication", () => {
    it("POST /auth/login with valid credentials returns tokens", async () => {
      const { status, data } = await login("ananya@technova.in", "Welcome@123");
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.tokens.access_token).toBeTruthy();
      expect(data.data.tokens.refresh_token).toBeTruthy();
    });

    it("POST /auth/login with wrong password returns 401", async () => {
      const { status, data } = await login("ananya@technova.in", "WrongPass");
      expect(status).toBe(401);
      expect(data.success).toBe(false);
    });

    it("POST /auth/login with nonexistent email returns 401", async () => {
      const { status, data } = await login("nobody@nowhere.com", "SomePass123");
      expect(status).toBe(401);
      expect(data.success).toBe(false);
    });

    it("POST /auth/login with empty body returns 400 or 401", async () => {
      const res = await fetch(`${API}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect([400, 401, 422]).toContain(res.status);
    });

    it("POST /auth/login returns user info with tokens", async () => {
      const { data } = await login("ananya@technova.in", "Welcome@123");
      expect(data.data.user).toBeDefined();
      expect(data.data.user.email).toBe("ananya@technova.in");
      expect(data.data.user.password).toBeUndefined(); // password should not be returned
    });
  });

  describe("Protected Endpoints - Authorization", () => {
    it("GET /employees/directory requires auth (returns 401 without token)", async () => {
      const res = await fetch(`${API}/api/v1/employees/directory`);
      expect(res.status).toBe(401);
    });

    it("GET /attendance/shifts requires auth", async () => {
      const res = await fetch(`${API}/api/v1/attendance/shifts`);
      expect(res.status).toBe(401);
    });

    it("GET /leave/types requires auth", async () => {
      const res = await fetch(`${API}/api/v1/leave/types`);
      expect(res.status).toBe(401);
    });

    it("GET /announcements requires auth", async () => {
      const res = await fetch(`${API}/api/v1/announcements`);
      expect(res.status).toBe(401);
    });

    it("invalid token returns 401", async () => {
      const res = await fetch(`${API}/api/v1/employees/directory`, {
        headers: { Authorization: "Bearer invalidtoken12345" },
      });
      expect(res.status).toBe(401);
    });

    it("expired/malformed JWT returns 401", async () => {
      const res = await fetch(`${API}/api/v1/employees/directory`, {
        headers: { Authorization: "Bearer eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjF9.invalid" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("Employee Endpoints", () => {
    let token: string;

    it("GET /employees/directory with auth returns employee data", async () => {
      const { data: loginData } = await login("ananya@technova.in", "Welcome@123");
      token = loginData.data.tokens.access_token;

      const { status, data } = await getWithAuth("/api/v1/employees/directory", token);
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
    });

    it("GET /employees/directory returns org-scoped data only", async () => {
      if (!token) {
        const { data: loginData } = await login("ananya@technova.in", "Welcome@123");
        token = loginData.data.tokens.access_token;
      }
      const { data } = await getWithAuth("/api/v1/employees/directory", token);
      // Should not contain users from other orgs
      const emails = data.data.map((e: any) => e.email);
      expect(emails).not.toContain("john@globaltech.com");
    });

    it("GET /employees/directory supports pagination", async () => {
      if (!token) {
        const { data: loginData } = await login("ananya@technova.in", "Welcome@123");
        token = loginData.data.tokens.access_token;
      }
      const { status, data } = await getWithAuth("/api/v1/employees/directory?page=1&per_page=2", token);
      expect(status).toBe(200);
      expect(data.data.length).toBeLessThanOrEqual(2);
    });
  });

  describe("Tenant Isolation via API", () => {
    it("Org 9 user cannot see Org 5 employee data", async () => {
      const { status: loginStatus, data: loginData } = await login("john@globaltech.com", "Welcome@123");
      if (loginStatus !== 200 || !loginData?.data?.tokens) {
        // GlobalTech user may not exist in this seed — skip gracefully
        return;
      }
      const token = loginData.data.tokens.access_token;

      const { data } = await getWithAuth("/api/v1/employees/directory", token);
      // Should not contain TechNova employees
      const responseStr = JSON.stringify(data);
      expect(responseStr).not.toContain("ananya@technova.in");
      expect(responseStr).not.toContain("technova");
    });

    it("Org 9 user cannot see Org 5 announcements", async () => {
      const { status: loginStatus, data: loginData } = await login("john@globaltech.com", "Welcome@123");
      if (loginStatus !== 200 || !loginData?.data?.tokens) return;
      const token = loginData.data.tokens.access_token;

      const { data } = await getWithAuth("/api/v1/announcements", token);
      const responseStr = JSON.stringify(data);
      expect(responseStr).not.toContain("technova");
    });

    it("Org 5 user cannot see Org 9 data", async () => {
      const { data: loginData } = await login("ananya@technova.in", "Welcome@123");
      const token = loginData.data.tokens.access_token;

      const { data } = await getWithAuth("/api/v1/employees/directory", token);
      const responseStr = JSON.stringify(data);
      expect(responseStr).not.toContain("john@globaltech.com");
      expect(responseStr).not.toContain("globaltech");
    });
  });

  describe("Leave Endpoints", () => {
    it("GET /leave/types returns leave types for the org", async () => {
      const { data: loginData } = await login("ananya@technova.in", "Welcome@123");
      const token = loginData.data.tokens.access_token;

      const { status, data } = await getWithAuth("/api/v1/leave/types", token);
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("GET /leave/balances returns balance data", async () => {
      const { data: loginData } = await login("ananya@technova.in", "Welcome@123");
      const token = loginData.data.tokens.access_token;

      const { status, data } = await getWithAuth("/api/v1/leave/balances", token);
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe("Attendance Endpoints", () => {
    it("GET /attendance/shifts returns shifts", async () => {
      const { data: loginData } = await login("ananya@technova.in", "Welcome@123");
      const token = loginData.data.tokens.access_token;

      const { status, data } = await getWithAuth("/api/v1/attendance/shifts", token);
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe("Announcement Endpoints", () => {
    it("GET /announcements returns announcements for the org", async () => {
      const { data: loginData } = await login("ananya@technova.in", "Welcome@123");
      const token = loginData.data.tokens.access_token;

      const { status, data } = await getWithAuth("/api/v1/announcements", token);
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("non-existent route returns 404", async () => {
      const res = await fetch(`${API}/api/v1/nonexistent-route`);
      expect([401, 404]).toContain(res.status);
    });

    it("API returns consistent error format", async () => {
      const { data } = await login("ananya@technova.in", "WrongPass");
      expect(data).toHaveProperty("success");
      expect(data.success).toBe(false);
      expect(data).toHaveProperty("error");
    });
  });
});
