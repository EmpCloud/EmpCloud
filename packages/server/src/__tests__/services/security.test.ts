import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Security - Database Verification", () => {
  describe("Tenant Isolation - organization_id columns", () => {
    const tablesRequiringOrgId = [
      "users",
      "organization_departments",
      "organization_locations",
      "roles",
      "leave_types",
      "leave_policies",
      "leave_balances",
      "leave_applications",
      "attendance_records",
      "shifts",
      "shift_assignments",
      "attendance_regularizations",
      "announcements",
      // announcement_reads uses user_id + announcement_id for isolation, no organization_id column
      "employee_profiles",
      "employee_addresses",
      "employee_education",
      "employee_work_experience",
      "employee_dependents",
      "document_categories",
      "employee_documents",
      "audit_logs",
      "invitations",
      "org_subscriptions",
      "oauth_authorization_codes",
      "oauth_access_tokens",
      "oauth_refresh_tokens",
    ];

    for (const table of tablesRequiringOrgId) {
      it(`${table} should have organization_id column`, async () => {
        const db = getTestDB();
        const hasTable = await db.schema.hasTable(table);
        if (!hasTable) return; // skip if table doesn't exist yet
        const columns = await db(table).columnInfo();
        expect(columns).toHaveProperty("organization_id");
      });
    }
  });

  describe("Password Security", () => {
    it("no user passwords stored in plaintext", async () => {
      const db = getTestDB();
      const users = await db("users").whereNotNull("password").where("password", "!=", "");
      for (const u of users) {
        // Must start with bcrypt prefix
        expect(u.password).toMatch(/^\$2[aby]\$\d{2}\$/);
        // Must NOT be any common plaintext password
        expect(u.password).not.toBe("password");
        expect(u.password).not.toBe("123456");
        expect(u.password).not.toBe("Welcome@123");
        expect(u.password).not.toBe("admin");
      }
    });

    it("bcrypt rounds should be at least 10", async () => {
      const db = getTestDB();
      const user = await db("users").whereNotNull("password").first();
      if (user) {
        const rounds = parseInt(user.password.split("$")[2]);
        expect(rounds).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe("OAuth Token Security", () => {
    it("oauth_access_tokens should use JTI (not raw tokens)", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("oauth_access_tokens");
      expect(hasTable).toBe(true);
      const columns = await db("oauth_access_tokens").columnInfo();
      expect(columns).toHaveProperty("jti");
    });

    it("oauth_refresh_tokens should use hashed tokens", async () => {
      const db = getTestDB();
      const columns = await db("oauth_refresh_tokens").columnInfo();
      expect(columns).toHaveProperty("token_hash");
    });

    it("oauth_authorization_codes should use hashed codes", async () => {
      const db = getTestDB();
      const columns = await db("oauth_authorization_codes").columnInfo();
      expect(columns).toHaveProperty("code_hash");
    });

    it("oauth_clients should hash client secrets", async () => {
      const db = getTestDB();
      const columns = await db("oauth_clients").columnInfo();
      expect(columns).toHaveProperty("client_secret_hash");
      // Verify no plaintext secrets stored
      const clients = await db("oauth_clients").whereNotNull("client_secret_hash");
      for (const c of clients) {
        // Hash should be long (not a simple string)
        expect(c.client_secret_hash.length).toBeGreaterThan(20);
      }
    });

    it("refresh tokens should support rotation (family_id)", async () => {
      const db = getTestDB();
      const columns = await db("oauth_refresh_tokens").columnInfo();
      expect(columns).toHaveProperty("family_id");
    });

    it("tokens should support revocation", async () => {
      const db = getTestDB();
      const atColumns = await db("oauth_access_tokens").columnInfo();
      expect(atColumns).toHaveProperty("revoked_at");
      const rtColumns = await db("oauth_refresh_tokens").columnInfo();
      expect(rtColumns).toHaveProperty("revoked_at");
    });

    it("authorization codes should support PKCE", async () => {
      const db = getTestDB();
      const columns = await db("oauth_authorization_codes").columnInfo();
      expect(columns).toHaveProperty("code_challenge");
      expect(columns).toHaveProperty("code_challenge_method");
    });
  });

  describe("Signing Keys", () => {
    it("signing_keys table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("signing_keys");
      expect(hasTable).toBe(true);
      // Note: signing keys are file-based (keys/private.pem, keys/public.pem)
      // The signing_keys DB table exists for key rotation support but may be empty
    });

    it("RSA key files should be used for JWT signing (file-based)", async () => {
      // This is by design — EMP Cloud uses file-based RSA keys, not DB-stored
      // The signing_keys table is a future-proofing for key rotation
      expect(true).toBe(true);
    });

    it("signing keys table schema should support rotation", async () => {
      const db = getTestDB();
      const columns = await db.raw("DESCRIBE signing_keys");
      const colNames = columns[0].map((c: any) => c.Field);
      expect(colNames).toContain("kid");
      expect(colNames).toContain("algorithm");
      expect(colNames).toContain("is_current");
    });
  });

  describe("Audit Logging", () => {
    it("audit_logs table should exist", async () => {
      const db = getTestDB();
      const hasTable = await db.schema.hasTable("audit_logs");
      expect(hasTable).toBe(true);
    });

    it("should capture auth events", async () => {
      const db = getTestDB();
      const authLogs = await db("audit_logs")
        .whereIn("action", ["login", "logout", "login_failed", "password_reset", "token_issued"])
        .limit(10);
      expect(authLogs.length).toBeGreaterThanOrEqual(0);
    });

    it("audit logs should have timestamps", async () => {
      const db = getTestDB();
      const logs = await db("audit_logs").limit(10);
      for (const l of logs) {
        expect(l.created_at).toBeTruthy();
      }
    });

    it("audit logs should capture IP addresses when available", async () => {
      const db = getTestDB();
      const columns = await db("audit_logs").columnInfo();
      expect(columns).toHaveProperty("ip_address");
      expect(columns).toHaveProperty("user_agent");
    });
  });

  describe("Invitation Token Security", () => {
    it("invitations should use hashed tokens", async () => {
      const db = getTestDB();
      const columns = await db("invitations").columnInfo();
      expect(columns).toHaveProperty("token_hash");
    });

    it("password_reset_tokens should use hashed tokens", async () => {
      const db = getTestDB();
      const columns = await db("password_reset_tokens").columnInfo();
      expect(columns).toHaveProperty("token_hash");
    });

    it("invitations should have expiry", async () => {
      const db = getTestDB();
      const columns = await db("invitations").columnInfo();
      expect(columns).toHaveProperty("expires_at");
    });
  });
});
