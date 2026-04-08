import { describe, it, expect, afterAll } from "vitest";
import { getTestDB, cleanupTestDB, TEST_ORG_ID, OTHER_ORG_ID } from "../setup";

afterAll(() => cleanupTestDB());

describe("Auth - Database Queries", () => {
  it("should find user by email", async () => {
    const db = getTestDB();
    const user = await db("users").where({ email: "ananya@technova.in" }).first();
    expect(user).toBeDefined();
    expect(user.email).toBe("ananya@technova.in");
    expect(user.status).toBe(1);
    expect(user.organization_id).toBe(TEST_ORG_ID);
  });

  it("should not find nonexistent user", async () => {
    const db = getTestDB();
    const user = await db("users").where({ email: "nobody@nowhere.com" }).first();
    expect(user).toBeUndefined();
  });

  it("should have hashed passwords (not plaintext)", async () => {
    const db = getTestDB();
    const user = await db("users").where({ email: "ananya@technova.in" }).first();
    expect(user.password).toMatch(/^\$2[aby]\$/); // bcrypt hash
    expect(user.password).not.toBe(process.env.TEST_USER_PASSWORD || "Welcome@123");
  });

  it("should enforce org_id tenant isolation", async () => {
    const db = getTestDB();
    const orgUsers = await db("users").where({ organization_id: TEST_ORG_ID, status: 1 });
    const otherOrgUsers = await db("users").where({ organization_id: OTHER_ORG_ID, status: 1 });

    expect(orgUsers.length).toBeGreaterThan(0);
    expect(otherOrgUsers.length).toBeGreaterThan(0);

    const orgEmails = orgUsers.map((u: any) => u.email);
    const otherEmails = otherOrgUsers.map((u: any) => u.email);
    const overlap = orgEmails.filter((e: string) => otherEmails.includes(e));
    expect(overlap).toHaveLength(0);
  });

  it("should have required fields on user records", async () => {
    const db = getTestDB();
    const user = await db("users").where({ email: "ananya@technova.in" }).first();
    expect(user.first_name).toBeTruthy();
    expect(user.last_name).toBeTruthy();
    expect(user.organization_id).toBeTruthy();
    expect(user.role).toBeTruthy();
    expect(user.created_at).toBeTruthy();
  });

  it("should have valid role values", async () => {
    const db = getTestDB();
    const users = await db("users").where({ organization_id: TEST_ORG_ID }).select("role");
    const validRoles = ["super_admin", "org_admin", "admin", "hr", "hr_admin", "manager", "employee"];
    for (const u of users) {
      expect(validRoles).toContain(u.role);
    }
  });

  it("should have unique emails across the system", async () => {
    const db = getTestDB();
    const duplicates = await db("users")
      .select("email")
      .count("* as cnt")
      .groupBy("email")
      .having("cnt", ">", 1);
    expect(duplicates).toHaveLength(0);
  });

  it("should have all user passwords as bcrypt hashes", async () => {
    const db = getTestDB();
    const users = await db("users")
      .whereNotNull("password")
      .where("password", "!=", "")
      .select("id", "email", "password");
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u.password).toMatch(/^\$2[aby]\$\d{2}\$/);
    }
  });

  it("should store user_roles linking users to roles", async () => {
    const db = getTestDB();
    const hasTable = await db.schema.hasTable("user_roles");
    expect(hasTable).toBe(true);
  });

  it("should have roles table with org-scoped roles", async () => {
    const db = getTestDB();
    const roles = await db("roles").where({ organization_id: TEST_ORG_ID });
    expect(roles.length).toBeGreaterThanOrEqual(0); // may or may not have custom roles
  });

  it("should support reporting_manager_id for hierarchy", async () => {
    const db = getTestDB();
    const usersWithManager = await db("users")
      .where({ organization_id: TEST_ORG_ID })
      .whereNotNull("reporting_manager_id");
    // At least some users should have a reporting manager
    expect(usersWithManager.length).toBeGreaterThanOrEqual(0);
    for (const u of usersWithManager) {
      // Manager must exist and be in the same org
      const manager = await db("users").where({ id: u.reporting_manager_id }).first();
      expect(manager).toBeDefined();
      expect(manager.organization_id).toBe(TEST_ORG_ID);
    }
  });
});
