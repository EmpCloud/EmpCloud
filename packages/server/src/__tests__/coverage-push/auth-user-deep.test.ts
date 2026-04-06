import { describe, it, expect, vi, beforeEach } from "vitest";

function buildMockDB() {
  const chain: any = {};
  const chainMethods = ["select","where","whereIn","whereNull","whereNot","whereRaw","andWhere","orderBy","limit","offset","join","leftJoin","clone","whereNotIn","orWhere","orWhereRaw"];
  chainMethods.forEach(m => { chain[m] = vi.fn(() => chain); });
  chain.first = vi.fn(() => Promise.resolve(null));
  chain.insert = vi.fn(() => Promise.resolve([1]));
  chain.update = vi.fn(() => Promise.resolve(1));
  chain.delete = vi.fn(() => Promise.resolve(1));
  chain.count = vi.fn(() => Promise.resolve([{ count: 0 }]));
  chain.increment = vi.fn(() => Promise.resolve(1));
  chain.decrement = vi.fn(() => Promise.resolve(1));
  chain.then = (resolve: any) => Promise.resolve([]).then(resolve);
  chain.catch = () => chain;
  const db: any = vi.fn(() => chain);
  db.raw = vi.fn(() => Promise.resolve([[], []]));
  db.transaction = vi.fn(async (cb: any) => cb(db));
  db._chain = chain;
  return { db, chain };
}

const { db: mockDB, chain: mockChain } = buildMockDB();

vi.mock("../../db/connection", () => ({
  getDB: vi.fn(() => mockDB),
  initDB: vi.fn(),
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../utils/crypto", () => ({
  hashPassword: vi.fn(() => Promise.resolve("hashed_pw")),
  verifyPassword: vi.fn(() => Promise.resolve(true)),
  randomHex: vi.fn(() => "mock-hex-token"),
  hashToken: vi.fn((t: string) => `hashed_${t}`),
}));

vi.mock("../oauth/oauth.service", () => ({
  issueTokens: vi.fn(() => Promise.resolve({
    access_token: "at", refresh_token: "rt", expires_in: 3600, token_type: "Bearer", scope: "openid",
  })),
}));

vi.mock("../audit/audit.service", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@empcloud/shared", () => ({
  TOKEN_DEFAULTS: { PASSWORD_RESET_EXPIRY: 3600, INVITATION_EXPIRY: 604800 },
  AuditAction: { LOGIN_FAILED: "LOGIN_FAILED" },
  ROLE_HIERARCHY: { employee: 0, manager: 20, hr_admin: 60, org_admin: 80, super_admin: 100 },
}));

vi.mock("../subscription/subscription.service", () => ({
  checkFreeTierUserLimit: vi.fn(() => Promise.resolve()),
}));

function resetChain() {
  const chainMethods = ["select","where","whereIn","whereNull","whereNot","whereRaw","andWhere","orderBy","limit","offset","join","leftJoin","clone","whereNotIn","orWhere","orWhereRaw"];
  chainMethods.forEach(m => { mockChain[m].mockReset().mockReturnValue(mockChain); });
  mockChain.first.mockReset().mockResolvedValue(null);
  mockChain.insert.mockReset().mockResolvedValue([1]);
  mockChain.update.mockReset().mockResolvedValue(1);
  mockChain.delete.mockReset().mockResolvedValue(1);
  mockChain.count.mockReset().mockResolvedValue([{ count: 0 }]);
  mockChain.increment.mockReset().mockResolvedValue(1);
  mockChain.decrement.mockReset().mockResolvedValue(1);
}

// ===================== Auth Service =====================
import {
  register, login, changePassword, forgotPassword, resetPassword,
} from "../../services/auth/auth.service.js";
import { verifyPassword } from "../../utils/crypto.js";

describe("Auth Service Coverage", () => {
  beforeEach(() => { vi.clearAllMocks(); resetChain(); });

  describe("register", () => {
    it("throws on duplicate email", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1 }); // existing user
      await expect(register({ orgName: "O", firstName: "A", lastName: "B", email: "a@a.com", password: "Pass1234" })).rejects.toThrow("already exists");
    });

    it("registers successfully", async () => {
      mockChain.first
        .mockResolvedValueOnce(null) // no existing user
        .mockResolvedValueOnce({ id: 1, email: "a@a.com", first_name: "A", last_name: "B", role: "org_admin", password: "hashed" }) // user
        .mockResolvedValueOnce({ id: 1, name: "O" }); // org
      mockChain.insert.mockResolvedValue([1]);
      const r = await register({ orgName: "O", firstName: "A", lastName: "B", email: "a@a.com", password: "Pass1234" });
      expect(r.user).toBeTruthy();
      expect(r.org).toBeTruthy();
      expect(r.tokens).toBeTruthy();
    });

    it("registers with optional fields", async () => {
      mockChain.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, email: "a@a.com", first_name: "A", last_name: "B", role: "org_admin", password: "h" })
        .mockResolvedValueOnce({ id: 1, name: "Corp" });
      mockChain.insert.mockResolvedValue([1]);
      const r = await register({ orgName: "Corp", orgLegalName: "Corp Ltd", orgCountry: "US", orgState: "CA", orgTimezone: "US/Pacific", orgEmail: "info@corp.com", firstName: "A", lastName: "B", email: "b@b.com", password: "Pass1234" });
      expect(r.user).toBeTruthy();
    });
  });

  describe("login", () => {
    it("throws on unknown email", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(login({ email: "x@x.com", password: "p" })).rejects.toThrow("Invalid email or password");
    });

    it("throws on deactivated account", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, email: "a@a.com", password: "h", status: 2 });
      await expect(login({ email: "a@a.com", password: "p" })).rejects.toThrow("deactivated");
    });

    it("throws on past exit date", async () => {
      const pastExit = new Date(Date.now() - 86400000 * 30);
      mockChain.first.mockResolvedValueOnce({ id: 1, email: "a@a.com", password: "h", status: 1, date_of_exit: pastExit });
      await expect(login({ email: "a@a.com", password: "p" })).rejects.toThrow("deactivated");
    });

    it("throws on wrong password", async () => {
      vi.mocked(verifyPassword).mockResolvedValueOnce(false);
      mockChain.first.mockResolvedValueOnce({ id: 1, email: "a@a.com", password: "h", status: 1, organization_id: 1, date_of_exit: null });
      await expect(login({ email: "a@a.com", password: "wrong" })).rejects.toThrow("Invalid email or password");
    });

    it("throws on inactive org", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, email: "a@a.com", password: "h", status: 1, organization_id: 1, date_of_exit: null })
        .mockResolvedValueOnce({ id: 1, is_active: false }); // inactive org
      await expect(login({ email: "a@a.com", password: "p" })).rejects.toThrow("inactive");
    });

    it("logs in successfully", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, email: "a@a.com", password: "h", status: 1, organization_id: 1, date_of_exit: null, first_name: "A", last_name: "B", role: "employee", created_at: new Date(), password_changed_at: new Date() })
        .mockResolvedValueOnce({ id: 1, name: "O", is_active: true, password_expiry_days: 0 });
      const r = await login({ email: "a@a.com", password: "p" });
      expect(r.tokens).toBeTruthy();
    });

    it("detects expired password", async () => {
      const oldDate = new Date(Date.now() - 100 * 86400000);
      mockChain.first
        .mockResolvedValueOnce({ id: 1, email: "a@a.com", password: "h", status: 1, organization_id: 1, date_of_exit: null, first_name: "A", last_name: "B", role: "employee", created_at: oldDate, password_changed_at: oldDate })
        .mockResolvedValueOnce({ id: 1, name: "O", is_active: true, password_expiry_days: 90 });
      const r = await login({ email: "a@a.com", password: "p" });
      expect(r.password_expired).toBe(true);
    });

    it("uses created_at when no password_changed_at", async () => {
      const oldDate = new Date(Date.now() - 100 * 86400000);
      mockChain.first
        .mockResolvedValueOnce({ id: 1, email: "a@a.com", password: "h", status: 1, organization_id: 1, date_of_exit: null, first_name: "A", last_name: "B", role: "employee", created_at: oldDate, password_changed_at: null })
        .mockResolvedValueOnce({ id: 1, name: "O", is_active: true, password_expiry_days: 90 });
      const r = await login({ email: "a@a.com", password: "p" });
      expect(r.password_expired).toBe(true);
    });
  });

  describe("changePassword", () => {
    it("throws on user not found", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(changePassword({ userId: 1, currentPassword: "old", newPassword: "new" })).rejects.toThrow("User");
    });

    it("throws on wrong current password", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, password: "h" });
      vi.mocked(verifyPassword).mockResolvedValueOnce(false);
      await expect(changePassword({ userId: 1, currentPassword: "wrong", newPassword: "new" })).rejects.toThrow("incorrect");
    });

    it("changes password successfully", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, password: "h" });
      mockChain.update.mockResolvedValueOnce(1);
      await changePassword({ userId: 1, currentPassword: "old", newPassword: "new" });
    });
  });

  describe("forgotPassword", () => {
    it("returns null for unknown email", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      const r = await forgotPassword("x@x.com");
      expect(r).toBeNull();
    });

    it("creates reset token", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1 });
      mockChain.insert.mockResolvedValueOnce([1]);
      const r = await forgotPassword("a@a.com");
      expect(r).toBeTruthy();
      expect(r!.token).toBe("mock-hex-token");
    });
  });

  describe("resetPassword", () => {
    it("throws on invalid token", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(resetPassword({ token: "bad", newPassword: "new" })).rejects.toThrow("Invalid or expired");
    });

    it("throws on expired token", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, user_id: 1, expires_at: new Date(Date.now() - 100000) });
      await expect(resetPassword({ token: "exp", newPassword: "new" })).rejects.toThrow("expired");
    });

    it("resets password successfully", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, user_id: 1, expires_at: new Date(Date.now() + 100000) });
      mockChain.update.mockResolvedValue(1);
      await resetPassword({ token: "valid", newPassword: "new" });
    });
  });
});

// ===================== User Service =====================
import {
  listUsers, getUser, createUser, updateUser, deactivateUser,
  inviteUser, listInvitations, acceptInvitation, getOrgChart, bulkCreateUsers,
} from "../../services/user/user.service.js";

describe("User Service Coverage", () => {
  beforeEach(() => { vi.clearAllMocks(); resetChain(); });

  describe("listUsers", () => {
    it("lists with default params", async () => {
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);
      const r = await listUsers(1);
      expect(r.total).toBe(0);
    });

    it("lists with search and include_inactive", async () => {
      mockChain.count.mockResolvedValueOnce([{ count: 1 }]);
      // We need to handle the where callback for search
      mockChain.where.mockImplementation(function(this: any, arg: any) {
        if (typeof arg === "function") arg.call(mockChain);
        return mockChain;
      });
      const r = await listUsers(1, { page: 1, perPage: 10, search: "test", include_inactive: true });
      expect(r).toBeTruthy();
    });
  });

  describe("getUser", () => {
    it("throws when not found", async () => {
      await expect(getUser(1, 99)).rejects.toThrow("User");
    });
    it("returns sanitized user", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, first_name: "A", password: "secret" });
      const r = await getUser(1, 1);
      expect((r as any).password).toBeUndefined();
    });
  });

  describe("createUser", () => {
    it("throws on duplicate email", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, total_allowed_user_count: 100, current_user_count: 5 }) // org
        .mockResolvedValueOnce({ id: 1 }); // existing email
      await expect(createUser(1, { first_name: "A", last_name: "B", email: "dup@a.com" } as any)).rejects.toThrow("Email already in use");
    });

    it("throws on org user limit", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, total_allowed_user_count: 5, current_user_count: 5 }); // org
      await expect(createUser(1, { first_name: "A", last_name: "B", email: "a@a.com" } as any)).rejects.toThrow("user limit");
    });

    it("throws on duplicate emp_code", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, total_allowed_user_count: 100, current_user_count: 1 }) // org
        .mockResolvedValueOnce(null) // no dup email
        .mockResolvedValueOnce({ id: 2 }); // dup emp_code
      await expect(createUser(1, { first_name: "A", last_name: "B", email: "a@a.com", emp_code: "E001" } as any)).rejects.toThrow("Employee code");
    });

    it("validates date_of_birth under 18", async () => {
      const recentDob = new Date();
      recentDob.setFullYear(recentDob.getFullYear() - 10);
      mockChain.first
        .mockResolvedValueOnce({ id: 1, total_allowed_user_count: 100, current_user_count: 1 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null); // no dup code
      await expect(createUser(1, { first_name: "A", last_name: "B", email: "a@a.com", date_of_birth: recentDob.toISOString().slice(0, 10) } as any)).rejects.toThrow("at least 18");
    });

    it("creates user successfully", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, total_allowed_user_count: 100, current_user_count: 1 }) // org check
        .mockResolvedValueOnce(null) // no dup email
        .mockResolvedValueOnce({ id: 1, first_name: "A", last_name: "B" }); // getUser at the end
      mockChain.insert.mockResolvedValue([1]);
      mockChain.increment.mockResolvedValue(1);
      const r = await createUser(1, { first_name: "A", last_name: "B", email: "new@a.com", password: "Pass1234", role: "employee" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("updateUser", () => {
    it("throws when user not found", async () => {
      await expect(updateUser(1, 99, {} as any)).rejects.toThrow("User");
    });

    it("validates phone format", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1 });
      await expect(updateUser(1, 1, { contact_number: "!!invalid!!" } as any)).rejects.toThrow("Invalid phone");
    });

    it("prevents self-manager", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1 });
      await expect(updateUser(1, 1, { reporting_manager_id: 1 } as any)).rejects.toThrow("own reporting manager");
    });

    it("detects circular chain", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1 }) // user
        .mockResolvedValueOnce({ id: 2, reporting_manager_id: 1 }); // manager reports to user
      await expect(updateUser(1, 1, { reporting_manager_id: 2 } as any)).rejects.toThrow("Circular");
    });

    it("validates invalid role", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1 });
      await expect(updateUser(1, 1, { role: "hacker" } as any)).rejects.toThrow("Invalid role");
    });

    it("updates successfully", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, date_of_joining: "2025-01-01" }) // user
        .mockResolvedValueOnce({ id: 1, first_name: "Updated" }); // getUser
      mockChain.update.mockResolvedValue(1);
      const r = await updateUser(1, 1, { first_name: "Updated" } as any);
      expect(r).toBeTruthy();
    });

    it("rejects empty name", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1 });
      await expect(updateUser(1, 1, { first_name: "   " } as any)).rejects.toThrow("cannot be empty");
    });
  });

  describe("deactivateUser", () => {
    it("throws when not found", async () => {
      await expect(deactivateUser(1, 99)).rejects.toThrow("User");
    });

    it("throws with pending items", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1 }); // user
      mockChain.count
        .mockResolvedValueOnce([{ count: 2 }]) // pending leaves
        .mockResolvedValueOnce([{ count: 0 }]) // assets
        .mockResolvedValueOnce([{ count: 0 }]); // tickets
      await expect(deactivateUser(1, 1)).rejects.toThrow("pending items");
    });

    it("deactivates successfully", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1 });
      mockChain.count
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 0 }]);
      mockChain.update.mockResolvedValue(1);
      mockChain.decrement.mockResolvedValue(1);
      await deactivateUser(1, 1);
    });
  });

  describe("inviteUser", () => {
    it("throws on existing user", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, total_allowed_user_count: 100, current_user_count: 1 })
        .mockResolvedValueOnce({ id: 1 }); // existing user
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);
      await expect(inviteUser(1, 1, { email: "dup@a.com", role: "employee" } as any)).rejects.toThrow("already exists");
    });

    it("throws on existing pending invite", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, total_allowed_user_count: 100, current_user_count: 1 })
        .mockResolvedValueOnce(null) // no existing user
        .mockResolvedValueOnce({ id: 1 }); // pending invite
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);
      await expect(inviteUser(1, 1, { email: "a@a.com", role: "employee" } as any)).rejects.toThrow("already been sent");
    });

    it("throws on seat limit", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, total_allowed_user_count: 5, current_user_count: 4 });
      mockChain.count.mockResolvedValueOnce([{ count: 1 }]); // 4+1 = 5 = limit
      await expect(inviteUser(1, 1, { email: "a@a.com", role: "employee" } as any)).rejects.toThrow("user limit");
    });

    it("creates invitation", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, total_allowed_user_count: 100, current_user_count: 1 })
        .mockResolvedValueOnce(null) // no existing user
        .mockResolvedValueOnce(null) // no pending invite
        .mockResolvedValueOnce({ id: 1, email: "a@a.com" }); // invitation
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);
      mockChain.insert.mockResolvedValue([1]);
      const r = await inviteUser(1, 1, { email: "a@a.com", role: "employee" } as any);
      expect(r.token).toBe("mock-hex-token");
    });
  });

  describe("listInvitations", () => {
    it("returns invitations", async () => {
      mockChain.orderBy.mockResolvedValueOnce([{ id: 1 }]);
      const r = await listInvitations(1);
      expect(r).toBeTruthy();
    });
  });

  describe("acceptInvitation", () => {
    it("throws on invalid token", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(acceptInvitation({ token: "bad", firstName: "A", lastName: "B", password: "P" })).rejects.toThrow("Invitation");
    });

    it("throws on expired invitation", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, expires_at: new Date(Date.now() - 100000) });
      await expect(acceptInvitation({ token: "exp", firstName: "A", lastName: "B", password: "P" })).rejects.toThrow("expired");
    });

    it("accepts successfully", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, organization_id: 1, email: "a@a.com", role: "employee", first_name: "A", last_name: "B", expires_at: new Date(Date.now() + 100000) })
        .mockResolvedValueOnce({ id: 1, first_name: "A", last_name: "B", email: "a@a.com" }); // created user
      mockChain.insert.mockResolvedValue([1]);
      mockChain.update.mockResolvedValue(1);
      mockChain.increment.mockResolvedValue(1);
      const r = await acceptInvitation({ token: "valid", firstName: "A", lastName: "B", password: "P" });
      expect(r).toBeTruthy();
    });
  });

  describe("getOrgChart", () => {
    it("builds tree from users", async () => {
      mockChain.select.mockResolvedValueOnce([
        { id: 1, first_name: "Boss", last_name: "A", designation: "CEO", role: "org_admin", reporting_manager_id: null, photo: null, department: "Mgmt" },
        { id: 2, first_name: "Emp", last_name: "B", designation: "Dev", role: "employee", reporting_manager_id: 1, photo: null, department: "Eng" },
      ]);
      const r = await getOrgChart(1);
      expect(r.length).toBeGreaterThan(0);
    });

    it("handles no manager group", async () => {
      mockChain.select.mockResolvedValueOnce([
        { id: 1, first_name: "A", last_name: "B", designation: null, role: "employee", reporting_manager_id: 999, photo: null, department: null },
      ]);
      const r = await getOrgChart(1);
      expect(r.some(n => n.name === "No Manager")).toBe(true);
    });

    it("handles circular chain", async () => {
      mockChain.select.mockResolvedValueOnce([
        { id: 1, first_name: "A", last_name: "B", designation: null, role: "employee", reporting_manager_id: 2, photo: null, department: null },
        { id: 2, first_name: "C", last_name: "D", designation: null, role: "employee", reporting_manager_id: 1, photo: null, department: null },
      ]);
      const r = await getOrgChart(1);
      expect(r).toBeTruthy();
    });
  });

  describe("bulkCreateUsers", () => {
    it("bulk creates users", async () => {
      mockChain.insert.mockResolvedValue([1]);
      mockChain.increment.mockResolvedValue(1);
      const r = await bulkCreateUsers(1, [
        { first_name: "A", last_name: "B", email: "a@a.com" },
        { first_name: "C", last_name: "D", email: "c@c.com" },
      ], 1);
      expect(r.count).toBe(2);
    });
  });
});
