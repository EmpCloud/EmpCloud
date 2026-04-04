// =============================================================================
// EMP CLOUD - Service-level tests that import actual service functions
// to generate real V8 coverage for the service layer.
//
// REFACTORED: Every section now calls real service functions (not just imports)
// so vitest coverage tracks actual code execution paths.
// =============================================================================

// Set env vars BEFORE importing anything
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = "EmpCloud2026";
process.env.DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.RSA_PRIVATE_KEY_PATH = "/dev/null";
process.env.RSA_PUBLIC_KEY_PATH = "/dev/null";
process.env.BILLING_API_KEY = "test";
process.env.LOG_LEVEL = "error";

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { initDB, closeDB, getDB } from "../../db/connection.js";

const ORG = 5;
const ADMIN = 522;
const EMP = 524;
const MGR = 529;
const HR = 525;
const U = String(Date.now()).slice(-6);

beforeAll(async () => {
  await initDB();
});

afterAll(async () => {
  await closeDB();
});

// ============================================================================
// USER SERVICE
// ============================================================================
describe("UserService coverage", () => {
  it("listUsers with defaults", async () => {
    const { listUsers } = await import("../../services/user/user.service.js");
    const result = await listUsers(ORG);
    expect(result.users.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
    for (const u of result.users) {
      expect((u as any).role).not.toBe("super_admin");
      expect((u as any).password).toBeUndefined();
    }
  });

  it("listUsers with search", async () => {
    const { listUsers } = await import("../../services/user/user.service.js");
    const result = await listUsers(ORG, { search: "Ananya", page: 1, perPage: 5 });
    expect(result.users.length).toBeGreaterThanOrEqual(1);
  });

  it("listUsers with include_inactive", async () => {
    const { listUsers } = await import("../../services/user/user.service.js");
    const result = await listUsers(ORG, { include_inactive: true });
    expect(result.users.length).toBeGreaterThan(0);
  });

  it("getUser", async () => {
    const { getUser } = await import("../../services/user/user.service.js");
    const user = await getUser(ORG, EMP);
    expect(user.first_name).toBeTruthy();
    expect((user as any).password).toBeUndefined();
  });

  it("getUser - not found", async () => {
    const { getUser } = await import("../../services/user/user.service.js");
    await expect(getUser(ORG, 999999)).rejects.toThrow();
  });

  it("updateUser - self manager rejected", async () => {
    const { updateUser } = await import("../../services/user/user.service.js");
    await expect(updateUser(ORG, EMP, {
      reporting_manager_id: EMP,
    } as any)).rejects.toThrow(/own reporting manager/);
  });

  it("updateUser - invalid role rejected", async () => {
    const { updateUser } = await import("../../services/user/user.service.js");
    await expect(updateUser(ORG, EMP, {
      role: "admin_super_fake",
    } as any)).rejects.toThrow(/Invalid role/);
  });

  it("updateUser - empty first_name rejected", async () => {
    const { updateUser } = await import("../../services/user/user.service.js");
    await expect(updateUser(ORG, EMP, {
      first_name: "   ",
    } as any)).rejects.toThrow(/empty/);
  });

  it("updateUser - phone validation", async () => {
    const { updateUser } = await import("../../services/user/user.service.js");
    await expect(updateUser(ORG, EMP, {
      phone: "not@phone!!"
    } as any)).rejects.toThrow(/phone/i);
  });

  it("updateUser - not found", async () => {
    const { updateUser } = await import("../../services/user/user.service.js");
    await expect(updateUser(ORG, 999999, { first_name: "X" } as any)).rejects.toThrow();
  });

  it("getOrgChart", async () => {
    const { getOrgChart } = await import("../../services/user/user.service.js");
    const chart = await getOrgChart(ORG);
    expect(chart.length).toBeGreaterThan(0);
  });

  it("listInvitations", async () => {
    const { listInvitations } = await import("../../services/user/user.service.js");
    const inv = await listInvitations(ORG);
    expect(Array.isArray(inv)).toBe(true);
  });

  it("deactivateUser - not found", async () => {
    const { deactivateUser } = await import("../../services/user/user.service.js");
    await expect(deactivateUser(ORG, 999999)).rejects.toThrow();
  });
});

// ============================================================================
// ATTENDANCE SERVICE
// ============================================================================
describe("AttendanceService coverage", () => {
  it("getMyToday", async () => {
    const { getMyToday } = await import("../../services/attendance/attendance.service.js");
    const r = await getMyToday(ORG, EMP);
    expect(r === null || r === undefined || typeof r === "object").toBe(true);
  });

  it("getMyHistory", async () => {
    const { getMyHistory } = await import("../../services/attendance/attendance.service.js");
    const r = await getMyHistory(ORG, EMP, { month: 4, year: 2026, page: 1, perPage: 5 });
    expect(r).toHaveProperty("records");
    expect(r).toHaveProperty("total");
  });

  it("getMyHistory defaults", async () => {
    const { getMyHistory } = await import("../../services/attendance/attendance.service.js");
    const r = await getMyHistory(ORG, EMP);
    expect(r).toHaveProperty("records");
  });

  it("getDashboard", async () => {
    const { getDashboard } = await import("../../services/attendance/attendance.service.js");
    const d = await getDashboard(ORG);
    expect(d).toHaveProperty("total_employees");
    expect(d).toHaveProperty("present");
    expect(d).toHaveProperty("absent");
    expect(d).toHaveProperty("late");
    expect(d).toHaveProperty("on_leave");
    expect(d.total_employees).toBeGreaterThan(0);
  });

  it("getMonthlyReport", async () => {
    const { getMonthlyReport } = await import("../../services/attendance/attendance.service.js");
    const r = await getMonthlyReport(ORG, { month: 4, year: 2026 });
    expect(r).toHaveProperty("report");
    expect(r.month).toBe(4);
  });

  it("getMonthlyReport for single user", async () => {
    const { getMonthlyReport } = await import("../../services/attendance/attendance.service.js");
    const r = await getMonthlyReport(ORG, { month: 4, year: 2026, user_id: EMP });
    expect(r).toHaveProperty("report");
  });
});

// ============================================================================
// REGULARIZATION SERVICE
// ============================================================================
describe("RegularizationService coverage", () => {
  it("listRegularizations", async () => {
    const { listRegularizations } = await import("../../services/attendance/regularization.service.js");
    const r = await listRegularizations(ORG, { status: "pending", page: 1, perPage: 5 });
    expect(r).toHaveProperty("records");
    expect(r).toHaveProperty("total");
  });

  it("listRegularizations without status", async () => {
    const { listRegularizations } = await import("../../services/attendance/regularization.service.js");
    const r = await listRegularizations(ORG);
    expect(r).toHaveProperty("records");
  });

  it("getMyRegularizations", async () => {
    const { getMyRegularizations } = await import("../../services/attendance/regularization.service.js");
    const r = await getMyRegularizations(ORG, EMP);
    expect(r).toHaveProperty("records");
    expect(r).toHaveProperty("total");
  });
});

// ============================================================================
// SHIFT SERVICE
// ============================================================================
describe("ShiftService coverage", () => {
  it("listShifts", async () => {
    const { listShifts } = await import("../../services/attendance/shift.service.js");
    const shifts = await listShifts(ORG);
    expect(shifts.length).toBeGreaterThanOrEqual(1);
  });

  it("getShift", async () => {
    const { listShifts, getShift } = await import("../../services/attendance/shift.service.js");
    const shifts = await listShifts(ORG);
    if (shifts.length > 0) {
      const s = await getShift(ORG, shifts[0].id);
      expect(s.name).toBeTruthy();
    }
  });

  it("getShift - not found", async () => {
    const { getShift } = await import("../../services/attendance/shift.service.js");
    await expect(getShift(ORG, 999999)).rejects.toThrow();
  });

  it("listShiftAssignments", async () => {
    const { listShiftAssignments } = await import("../../services/attendance/shift.service.js");
    const r = await listShiftAssignments(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("listShiftAssignments by user", async () => {
    const { listShiftAssignments } = await import("../../services/attendance/shift.service.js");
    const r = await listShiftAssignments(ORG, { user_id: EMP });
    expect(Array.isArray(r)).toBe(true);
  });

  it("getMySchedule", async () => {
    const { getMySchedule } = await import("../../services/attendance/shift.service.js");
    const r = await getMySchedule(ORG, EMP);
    expect(r).toHaveProperty("start_date");
    expect(r).toHaveProperty("end_date");
    expect(r).toHaveProperty("assignments");
  });

  it("listSwapRequests", async () => {
    const { listSwapRequests } = await import("../../services/attendance/shift.service.js");
    const r = await listSwapRequests(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("listSwapRequests by status", async () => {
    const { listSwapRequests } = await import("../../services/attendance/shift.service.js");
    const r = await listSwapRequests(ORG, { status: "pending" });
    expect(Array.isArray(r)).toBe(true);
  });

  it("getSchedule", async () => {
    const { getSchedule } = await import("../../services/attendance/shift.service.js");
    const r = await getSchedule(ORG, { start_date: "2026-04-01", end_date: "2026-04-30" });
    expect(Array.isArray(r)).toBe(true);
    if (r.length > 0) {
      expect(r[0]).toHaveProperty("user_id");
      expect(r[0]).toHaveProperty("assignments");
    }
  });

  it("getSchedule with department", async () => {
    const { getSchedule } = await import("../../services/attendance/shift.service.js");
    const r = await getSchedule(ORG, { start_date: "2026-04-01", end_date: "2026-04-30", department_id: 72 });
    expect(Array.isArray(r)).toBe(true);
  });
});

// ============================================================================
// LEAVE BALANCE SERVICE
// ============================================================================
describe("LeaveBalanceService coverage", () => {
  it("getBalances", async () => {
    const { getBalances } = await import("../../services/leave/leave-balance.service.js");
    const r = await getBalances(ORG, EMP);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]).toHaveProperty("leave_type_name");
  });

  it("getBalances with year", async () => {
    const { getBalances } = await import("../../services/leave/leave-balance.service.js");
    const r = await getBalances(ORG, EMP, 2026);
    expect(Array.isArray(r)).toBe(true);
  });

  it("deductBalance - not found", async () => {
    const { deductBalance } = await import("../../services/leave/leave-balance.service.js");
    await expect(deductBalance(ORG, 999999, 999999, 1)).rejects.toThrow();
  });

  it("creditBalance - not found", async () => {
    const { creditBalance } = await import("../../services/leave/leave-balance.service.js");
    await expect(creditBalance(ORG, 999999, 999999, 1)).rejects.toThrow();
  });
});

// ============================================================================
// LEAVE APPLICATION SERVICE
// ============================================================================
describe("LeaveApplicationService coverage", () => {
  it("listApplications", async () => {
    const { listApplications } = await import("../../services/leave/leave-application.service.js");
    const r = await listApplications(ORG, { page: 1, perPage: 5 });
    expect(r).toHaveProperty("applications");
    expect(r).toHaveProperty("total");
  });

  it("listApplications with filters", async () => {
    const { listApplications } = await import("../../services/leave/leave-application.service.js");
    const r = await listApplications(ORG, { status: "approved", userId: EMP });
    expect(r).toHaveProperty("applications");
  });

  it("getLeaveCalendar", async () => {
    const { getLeaveCalendar } = await import("../../services/leave/leave-application.service.js");
    const r = await getLeaveCalendar(ORG, 4, 2026);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getApplication - not found", async () => {
    const { getApplication } = await import("../../services/leave/leave-application.service.js");
    await expect(getApplication(ORG, 999999)).rejects.toThrow();
  });

  it("applyLeave - invalid dates rejected", async () => {
    const { applyLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(applyLeave(ORG, EMP, {
      leave_type_id: 999999,
      start_date: "invalid-date",
      end_date: "2026-04-10",
      days_count: 1,
      reason: "test",
    } as any)).rejects.toThrow(/Invalid start_date/);
  });

  it("applyLeave - end before start rejected", async () => {
    const { applyLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(applyLeave(ORG, EMP, {
      leave_type_id: 1,
      start_date: "2026-04-15",
      end_date: "2026-04-10",
      days_count: 1,
      reason: "test",
    } as any)).rejects.toThrow(/before start/);
  });

  it("applyLeave - past date rejected", async () => {
    const { applyLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(applyLeave(ORG, EMP, {
      leave_type_id: 1,
      start_date: "2020-01-01",
      end_date: "2020-01-02",
      days_count: 1,
      reason: "test",
    } as any)).rejects.toThrow(/past/);
  });

  it("applyLeave - non-existent leave type rejected", async () => {
    const { applyLeave } = await import("../../services/leave/leave-application.service.js");
    await expect(applyLeave(ORG, EMP, {
      leave_type_id: 999999,
      start_date: "2026-04-20",
      end_date: "2026-04-20",
      days_count: 1,
      reason: "test",
    } as any)).rejects.toThrow();
  });
});

// ============================================================================
// COMP-OFF SERVICE
// ============================================================================
describe("CompOffService coverage", () => {
  it("listCompOffs", async () => {
    const { listCompOffs } = await import("../../services/leave/comp-off.service.js");
    const r = await listCompOffs(ORG, { page: 1, perPage: 5 });
    expect(r).toHaveProperty("requests");
    expect(r).toHaveProperty("total");
  });

  it("listCompOffs with filters", async () => {
    const { listCompOffs } = await import("../../services/leave/comp-off.service.js");
    const r = await listCompOffs(ORG, { userId: EMP, status: "approved" });
    expect(r).toHaveProperty("requests");
  });

  it("getCompOff - not found", async () => {
    const { getCompOff } = await import("../../services/leave/comp-off.service.js");
    await expect(getCompOff(ORG, 999999)).rejects.toThrow();
  });

  it("approveCompOff - not found", async () => {
    const { approveCompOff } = await import("../../services/leave/comp-off.service.js");
    await expect(approveCompOff(ORG, 999999, HR)).rejects.toThrow();
  });

  it("rejectCompOff - not found", async () => {
    const { rejectCompOff } = await import("../../services/leave/comp-off.service.js");
    await expect(rejectCompOff(ORG, 999999, HR, "test")).rejects.toThrow();
  });
});

// ============================================================================
// DOCUMENT SERVICE
// ============================================================================
describe("DocumentService coverage", () => {
  it("listCategories", async () => {
    const { listCategories } = await import("../../services/document/document.service.js");
    const r = await listCategories(ORG);
    expect(r.length).toBeGreaterThan(0);
  });

  it("listDocuments", async () => {
    const { listDocuments } = await import("../../services/document/document.service.js");
    const r = await listDocuments(ORG, { page: 1, perPage: 5 });
    expect(r).toHaveProperty("documents");
    expect(r).toHaveProperty("total");
  });

  it("listDocuments with search", async () => {
    const { listDocuments } = await import("../../services/document/document.service.js");
    const r = await listDocuments(ORG, { search: "PAN" });
    expect(r).toHaveProperty("documents");
  });

  it("listDocuments by user", async () => {
    const { listDocuments } = await import("../../services/document/document.service.js");
    const r = await listDocuments(ORG, { user_id: EMP });
    expect(r).toHaveProperty("documents");
  });

  it("listDocuments by category", async () => {
    const { listDocuments } = await import("../../services/document/document.service.js");
    const r = await listDocuments(ORG, { category_id: 54 });
    expect(r).toHaveProperty("documents");
  });

  it("getDocument - not found", async () => {
    const { getDocument } = await import("../../services/document/document.service.js");
    await expect(getDocument(ORG, 999999)).rejects.toThrow();
  });

  it("getMandatoryTracking", async () => {
    const { getMandatoryTracking } = await import("../../services/document/document.service.js");
    const r = await getMandatoryTracking(ORG);
    expect(r).toHaveProperty("mandatory_categories");
    expect(r).toHaveProperty("missing");
  });

  it("getExpiryAlerts", async () => {
    const { getExpiryAlerts } = await import("../../services/document/document.service.js");
    const r = await getExpiryAlerts(ORG, 30);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getMyDocuments", async () => {
    const { getMyDocuments } = await import("../../services/document/document.service.js");
    const r = await getMyDocuments(ORG, EMP);
    expect(r).toHaveProperty("documents");
    expect(r).toHaveProperty("total");
  });

  it("deleteCategory - not found", async () => {
    const { deleteCategory } = await import("../../services/document/document.service.js");
    await expect(deleteCategory(ORG, 999999)).rejects.toThrow();
  });

  it("createCategory + updateCategory + deleteCategory lifecycle", async () => {
    const { createCategory, updateCategory, deleteCategory } = await import("../../services/document/document.service.js");
    const cat = await createCategory(ORG, { name: `TestCat-${U}`, description: "Temp test category" });
    expect(cat.name).toContain("TestCat");

    const updated = await updateCategory(ORG, cat.id, { name: `TestCat-${U}-upd` });
    expect(updated.name).toContain("upd");

    await deleteCategory(ORG, cat.id);
  });
});

// ============================================================================
// POLICY SERVICE
// ============================================================================
describe("PolicyService coverage", () => {
  let createdPolicyId: number;

  it("listPolicies", async () => {
    const { listPolicies } = await import("../../services/policy/policy.service.js");
    const r = await listPolicies(ORG);
    expect(r).toHaveProperty("policies");
    expect(r).toHaveProperty("total");
    expect(r.total).toBeGreaterThan(0);
  });

  it("listPolicies with category filter", async () => {
    const { listPolicies } = await import("../../services/policy/policy.service.js");
    const r = await listPolicies(ORG, { category: "general" });
    expect(r).toHaveProperty("policies");
  });

  it("createPolicy", async () => {
    const { createPolicy } = await import("../../services/policy/policy.service.js");
    const p = await createPolicy(ORG, ADMIN, {
      title: `Test Policy ${U}`,
      content: "<p>This is test policy content.</p>",
      category: "general",
    });
    expect(p.title).toContain("Test Policy");
    expect(p.is_active).toBe(1);
    createdPolicyId = p.id;
  });

  it("getPolicy", async () => {
    const { getPolicy } = await import("../../services/policy/policy.service.js");
    const p = await getPolicy(ORG, createdPolicyId);
    expect(p.title).toContain("Test Policy");
  });

  it("getPolicy - not found", async () => {
    const { getPolicy } = await import("../../services/policy/policy.service.js");
    await expect(getPolicy(ORG, 999999)).rejects.toThrow();
  });

  it("updatePolicy", async () => {
    const { updatePolicy } = await import("../../services/policy/policy.service.js");
    const p = await updatePolicy(ORG, createdPolicyId, { title: `Updated Policy ${U}` });
    expect(p.title).toContain("Updated Policy");
  });

  it("acknowledgePolicy + getAcknowledgments", async () => {
    const { acknowledgePolicy, getAcknowledgments } = await import("../../services/policy/policy.service.js");
    await acknowledgePolicy(createdPolicyId, EMP, ORG);
    const acks = await getAcknowledgments(ORG, createdPolicyId);
    expect(acks.length).toBeGreaterThanOrEqual(1);
  });

  it("getPendingAcknowledgments", async () => {
    const { getPendingAcknowledgments } = await import("../../services/policy/policy.service.js");
    const r = await getPendingAcknowledgments(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("deletePolicy (cleanup)", async () => {
    const { deletePolicy } = await import("../../services/policy/policy.service.js");
    if (createdPolicyId) {
      // Clean up acknowledgments first
      const db = getDB();
      await db("policy_acknowledgments").where({ policy_id: createdPolicyId }).delete();
      await deletePolicy(ORG, createdPolicyId);
    }
  });

  it("deletePolicy - not found", async () => {
    const { deletePolicy } = await import("../../services/policy/policy.service.js");
    await expect(deletePolicy(ORG, 999999)).rejects.toThrow();
  });
});

// ============================================================================
// ORG SERVICE
// ============================================================================
describe("OrgService coverage", () => {
  it("getOrg", async () => {
    const { getOrg } = await import("../../services/org/org.service.js");
    const org = await getOrg(ORG);
    expect(org).toHaveProperty("name");
    expect(org.id).toBe(ORG);
  });

  it("getOrg - not found", async () => {
    const { getOrg } = await import("../../services/org/org.service.js");
    await expect(getOrg(999999)).rejects.toThrow();
  });

  it("getOrgStats", async () => {
    const { getOrgStats } = await import("../../services/org/org.service.js");
    const stats = await getOrgStats(ORG);
    expect(stats).toHaveProperty("total_users");
    expect(stats).toHaveProperty("total_departments");
    expect(stats).toHaveProperty("active_subscriptions");
  });

  it("listDepartments", async () => {
    const { listDepartments } = await import("../../services/org/org.service.js");
    const depts = await listDepartments(ORG);
    expect(depts.length).toBeGreaterThan(0);
  });

  it("getDepartment - not found", async () => {
    const { getDepartment } = await import("../../services/org/org.service.js");
    await expect(getDepartment(ORG, 999999)).rejects.toThrow();
  });

  it("listLocations", async () => {
    const { listLocations } = await import("../../services/org/org.service.js");
    const locs = await listLocations(ORG);
    expect(Array.isArray(locs)).toBe(true);
  });

  it("getLocation - not found", async () => {
    const { getLocation } = await import("../../services/org/org.service.js");
    await expect(getLocation(ORG, 999999)).rejects.toThrow();
  });

  it("getDepartmentsWithoutManager", async () => {
    const { getDepartmentsWithoutManager } = await import("../../services/org/org.service.js");
    const r = await getDepartmentsWithoutManager(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("createDepartment + deleteDepartment lifecycle", async () => {
    const { createDepartment, deleteDepartment } = await import("../../services/org/org.service.js");
    const dept = await createDepartment(ORG, `TestDept-${U}`);
    expect(dept.name).toContain("TestDept");
    await deleteDepartment(ORG, dept.id);
  });

  it("deleteDepartment - non-existent id is no-op", async () => {
    const { deleteDepartment } = await import("../../services/org/org.service.js");
    // deleteDepartment soft-deletes; non-existent id is a no-op (no throw)
    const result = await deleteDepartment(ORG, 999999);
    expect(result === undefined || result === null || typeof result === "object").toBe(true);
  });

  it("createLocation + deleteLocation lifecycle", async () => {
    const { createLocation, deleteLocation } = await import("../../services/org/org.service.js");
    const loc = await createLocation(ORG, { name: `TestLoc-${U}`, address: "123 Test St" });
    expect(loc.name).toContain("TestLoc");
    await deleteLocation(ORG, loc.id);
  });

  it("deleteLocation - non-existent id is no-op", async () => {
    const { deleteLocation } = await import("../../services/org/org.service.js");
    // deleteLocation performs a hard delete; non-existent id is a no-op (no throw)
    const result = await deleteLocation(ORG, 999999);
    expect(result === undefined || result === null || typeof result === "number").toBe(true);
  });
});

// ============================================================================
// SUBSCRIPTION SERVICE
// ============================================================================
describe("SubscriptionService coverage", () => {
  it("listSubscriptions", async () => {
    const { listSubscriptions } = await import("../../services/subscription/subscription.service.js");
    const r = await listSubscriptions(ORG);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("getSubscription", async () => {
    const { listSubscriptions, getSubscription } = await import("../../services/subscription/subscription.service.js");
    const subs = await listSubscriptions(ORG);
    if (subs.length > 0) {
      const s = await getSubscription(ORG, subs[0].id);
      expect(s).toHaveProperty("status");
    }
  });

  it("getSubscription - not found", async () => {
    const { getSubscription } = await import("../../services/subscription/subscription.service.js");
    await expect(getSubscription(ORG, 999999)).rejects.toThrow();
  });

  it("listSeats for a module", async () => {
    const { listSubscriptions, listSeats } = await import("../../services/subscription/subscription.service.js");
    const subs = await listSubscriptions(ORG);
    if (subs.length > 0) {
      const seats = await listSeats(ORG, subs[0].module_id);
      expect(Array.isArray(seats)).toBe(true);
    }
  });

  it("getBillingStatus", async () => {
    const { getBillingStatus } = await import("../../services/subscription/subscription.service.js");
    const status = await getBillingStatus(ORG);
    expect(status).toHaveProperty("has_overdue");
  });

  it("checkModuleAccess", async () => {
    const { checkModuleAccess } = await import("../../services/subscription/subscription.service.js");
    // signature: checkModuleAccess({ userId, orgId, moduleSlug })
    const db = getDB();
    const mod = await db("modules").where({ is_active: true }).first();
    if (mod) {
      const access = await checkModuleAccess({ orgId: ORG, moduleSlug: mod.slug, userId: EMP });
      expect(access).toHaveProperty("has_access");
    }
  });
});

// ============================================================================
// EVENT SERVICE
// ============================================================================
describe("EventService coverage", () => {
  let createdEventId: number;

  it("createEvent", async () => {
    const { createEvent } = await import("../../services/event/event.service.js");
    const ev = await createEvent(ORG, ADMIN, {
      title: `Test Event ${U}`,
      description: "Automated test event",
      event_type: "team_building",
      start_date: "2026-06-15T10:00:00",
      end_date: "2026-06-15T17:00:00",
    } as any);
    expect(ev.title).toContain("Test Event");
    createdEventId = ev.id;
  });

  it("listEvents", async () => {
    const { listEvents } = await import("../../services/event/event.service.js");
    const r = await listEvents(ORG);
    expect(r).toHaveProperty("events");
    expect(r).toHaveProperty("total");
  });

  it("listEvents with type filter", async () => {
    const { listEvents } = await import("../../services/event/event.service.js");
    const r = await listEvents(ORG, { event_type: "team_building" });
    expect(r).toHaveProperty("events");
  });

  it("getEvent", async () => {
    const { getEvent } = await import("../../services/event/event.service.js");
    const ev = await getEvent(ORG, createdEventId);
    expect(ev.title).toContain("Test Event");
  });

  it("getEvent - not found", async () => {
    const { getEvent } = await import("../../services/event/event.service.js");
    await expect(getEvent(ORG, 999999)).rejects.toThrow();
  });

  it("rsvpEvent", async () => {
    const { rsvpEvent } = await import("../../services/event/event.service.js");
    // DB enum: attending, maybe, declined
    const r = await rsvpEvent(ORG, createdEventId, EMP, "attending");
    expect(r).toHaveProperty("event_id");
  });

  it("getMyEvents", async () => {
    const { getMyEvents } = await import("../../services/event/event.service.js");
    const r = await getMyEvents(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getUpcomingEvents", async () => {
    const { getUpcomingEvents } = await import("../../services/event/event.service.js");
    const r = await getUpcomingEvents(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getEventDashboard", async () => {
    const { getEventDashboard } = await import("../../services/event/event.service.js");
    const d = await getEventDashboard(ORG);
    expect(d).toHaveProperty("upcoming_count");
  });

  it("updateEvent", async () => {
    const { updateEvent } = await import("../../services/event/event.service.js");
    const ev = await updateEvent(ORG, createdEventId, { title: `Updated Event ${U}` });
    expect(ev.title).toContain("Updated");
  });

  it("cancelEvent", async () => {
    const { cancelEvent } = await import("../../services/event/event.service.js");
    const ev = await cancelEvent(ORG, createdEventId);
    expect(ev.status).toBe("cancelled");
  });

  it("deleteEvent (cleanup)", async () => {
    const { deleteEvent } = await import("../../services/event/event.service.js");
    // Clean up RSVP first
    const db = getDB();
    await db("event_rsvps").where({ event_id: createdEventId }).delete();
    await deleteEvent(ORG, createdEventId);
  });

  it("createEvent - end before start rejected", async () => {
    const { createEvent } = await import("../../services/event/event.service.js");
    await expect(createEvent(ORG, ADMIN, {
      title: "Bad Event",
      start_date: "2026-06-20T17:00:00",
      end_date: "2026-06-20T10:00:00",
    } as any)).rejects.toThrow(/before start/);
  });
});

// ============================================================================
// WELLNESS SERVICE
// ============================================================================
describe("WellnessService coverage", () => {
  let createdProgramId: number;

  it("createProgram", async () => {
    const { createProgram } = await import("../../services/wellness/wellness.service.js");
    const p = await createProgram(ORG, ADMIN, {
      title: `Test Wellness ${U}`,
      description: "Automated test program",
      program_type: "fitness",
      start_date: "2026-06-01",
      end_date: "2026-06-30",
      max_participants: 50,
      points_reward: 100,
    } as any);
    expect(p.title).toContain("Test Wellness");
    createdProgramId = p.id;
  });

  it("createProgram - end before start rejected", async () => {
    const { createProgram } = await import("../../services/wellness/wellness.service.js");
    await expect(createProgram(ORG, ADMIN, {
      title: "Bad Program",
      program_type: "fitness",
      start_date: "2026-06-30",
      end_date: "2026-06-01",
    } as any)).rejects.toThrow(/before start/);
  });

  it("listPrograms", async () => {
    const { listPrograms } = await import("../../services/wellness/wellness.service.js");
    const r = await listPrograms(ORG);
    expect(r).toHaveProperty("programs");
    expect(r).toHaveProperty("total");
  });

  it("listPrograms with type filter", async () => {
    const { listPrograms } = await import("../../services/wellness/wellness.service.js");
    const r = await listPrograms(ORG, { program_type: "fitness" } as any);
    expect(r).toHaveProperty("programs");
  });

  it("getProgram", async () => {
    const { getProgram } = await import("../../services/wellness/wellness.service.js");
    const p = await getProgram(ORG, createdProgramId);
    expect(p.title).toContain("Test Wellness");
  });

  it("getProgram - not found", async () => {
    const { getProgram } = await import("../../services/wellness/wellness.service.js");
    await expect(getProgram(ORG, 999999)).rejects.toThrow();
  });

  it("enrollInProgram", async () => {
    const { enrollInProgram } = await import("../../services/wellness/wellness.service.js");
    // signature: enrollInProgram(orgId, programId, userId)
    const r = await enrollInProgram(ORG, createdProgramId, EMP);
    expect(r).toHaveProperty("enrollment_id");
  });

  it("getMyPrograms", async () => {
    const { getMyPrograms } = await import("../../services/wellness/wellness.service.js");
    const r = await getMyPrograms(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("dailyCheckIn", async () => {
    const { dailyCheckIn } = await import("../../services/wellness/wellness.service.js");
    const r = await dailyCheckIn(ORG, EMP, {
      mood: "good",
      energy_level: 4,
      sleep_hours: 7,
      exercise_minutes: 30,
      notes: "Feeling great",
      check_in_date: "2018-06-15",
    } as any);
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("check_in_date");
  });

  it("dailyCheckIn - update existing", async () => {
    const { dailyCheckIn } = await import("../../services/wellness/wellness.service.js");
    // DB enum for mood: great, good, okay, low, stressed
    const r = await dailyCheckIn(ORG, EMP, {
      mood: "great",
      energy_level: 5,
      check_in_date: "2018-06-15",
    } as any);
    expect(r.message).toBe("Check-in updated");
  });

  it("dailyCheckIn - invalid energy_level", async () => {
    const { dailyCheckIn } = await import("../../services/wellness/wellness.service.js");
    await expect(dailyCheckIn(ORG, EMP, {
      mood: "good",
      energy_level: 10,
    } as any)).rejects.toThrow(/between 1 and 5/);
  });

  it("getMyCheckIns", async () => {
    const { getMyCheckIns } = await import("../../services/wellness/wellness.service.js");
    const r = await getMyCheckIns(ORG, EMP);
    expect(r).toHaveProperty("check_ins");
    expect(r).toHaveProperty("total");
  });

  it("getMyCheckIns with date range", async () => {
    const { getMyCheckIns } = await import("../../services/wellness/wellness.service.js");
    const r = await getMyCheckIns(ORG, EMP, { start_date: "2018-06-01", end_date: "2018-06-30" });
    expect(r).toHaveProperty("check_ins");
  });

  it("createGoal", async () => {
    const { createGoal } = await import("../../services/wellness/wellness.service.js");
    const g = await createGoal(ORG, EMP, {
      title: `Test Goal ${U}`,
      goal_type: "steps",
      target_value: 10000,
      unit: "steps",
      frequency: "daily",
      start_date: "2026-06-01",
      end_date: "2026-06-30",
    } as any);
    expect(g.title).toContain("Test Goal");
    // Clean up
    const db = getDB();
    await db("wellness_goals").where({ id: g.id }).delete();
  });

  it("getMyGoals", async () => {
    const { getMyGoals } = await import("../../services/wellness/wellness.service.js");
    const r = await getMyGoals(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getWellnessDashboard", async () => {
    const { getWellnessDashboard } = await import("../../services/wellness/wellness.service.js");
    const d = await getWellnessDashboard(ORG);
    expect(d).toHaveProperty("total_programs");
  });

  it("getMyWellnessSummary", async () => {
    const { getMyWellnessSummary } = await import("../../services/wellness/wellness.service.js");
    const s = await getMyWellnessSummary(ORG, EMP);
    expect(s).toBeTruthy();
  });

  it("cleanup: delete test program enrollment and program", async () => {
    const db = getDB();
    await db("wellness_enrollments").where({ program_id: createdProgramId }).delete();
    await db("wellness_check_ins").where({ organization_id: ORG, user_id: EMP, check_in_date: "2018-06-15" }).delete();
    await db("wellness_programs").where({ id: createdProgramId }).delete();
  });
});

// ============================================================================
// SURVEY SERVICE
// ============================================================================
describe("SurveyService coverage", () => {
  let createdSurveyId: number;

  it("createSurvey", async () => {
    const { createSurvey } = await import("../../services/survey/survey.service.js");
    const s = await createSurvey(ORG, ADMIN, {
      title: `Test Survey ${U}`,
      description: "Automated test survey",
      type: "pulse",
      is_anonymous: true,
      questions: [
        { question_text: "How satisfied are you?", question_type: "rating_1_5", is_required: true },
        { question_text: "Any comments?", question_type: "text", is_required: false },
      ],
    } as any);
    expect(s.title).toContain("Test Survey");
    expect(s.status).toBe("draft");
    createdSurveyId = s.id;
  });

  it("createSurvey - end before start rejected", async () => {
    const { createSurvey } = await import("../../services/survey/survey.service.js");
    await expect(createSurvey(ORG, ADMIN, {
      title: "Bad Survey",
      start_date: "2026-06-30",
      end_date: "2026-06-01",
      questions: [{ question_text: "Q1", question_type: "rating_1_5" }],
    } as any)).rejects.toThrow(/before/);
  });

  it("listSurveys", async () => {
    const { listSurveys } = await import("../../services/survey/survey.service.js");
    const r = await listSurveys(ORG);
    expect(r).toHaveProperty("surveys");
    expect(r).toHaveProperty("total");
  });

  it("listSurveys with type filter", async () => {
    const { listSurveys } = await import("../../services/survey/survey.service.js");
    const r = await listSurveys(ORG, { type: "pulse" } as any);
    expect(r).toHaveProperty("surveys");
  });

  it("getSurvey", async () => {
    const { getSurvey } = await import("../../services/survey/survey.service.js");
    const s = await getSurvey(ORG, createdSurveyId);
    expect(s.title).toContain("Test Survey");
    expect(s).toHaveProperty("questions");
  });

  it("getSurvey - not found", async () => {
    const { getSurvey } = await import("../../services/survey/survey.service.js");
    await expect(getSurvey(ORG, 999999)).rejects.toThrow();
  });

  it("updateSurvey", async () => {
    const { updateSurvey } = await import("../../services/survey/survey.service.js");
    const s = await updateSurvey(ORG, createdSurveyId, { title: `Updated Survey ${U}` } as any);
    expect(s.title).toContain("Updated Survey");
  });

  it("publishSurvey", async () => {
    const { publishSurvey } = await import("../../services/survey/survey.service.js");
    const s = await publishSurvey(ORG, createdSurveyId);
    expect(s.status).toBe("active");
  });

  it("getActiveSurveys", async () => {
    const { getActiveSurveys } = await import("../../services/survey/survey.service.js");
    const r = await getActiveSurveys(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getMyResponses", async () => {
    const { getMyResponses } = await import("../../services/survey/survey.service.js");
    const r = await getMyResponses(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getSurveyDashboard", async () => {
    const { getSurveyDashboard } = await import("../../services/survey/survey.service.js");
    const d = await getSurveyDashboard(ORG);
    expect(d).toHaveProperty("active_count");
    expect(d).toHaveProperty("total_count");
  });

  it("closeSurvey", async () => {
    const { closeSurvey } = await import("../../services/survey/survey.service.js");
    const s = await closeSurvey(ORG, createdSurveyId);
    expect(s.status).toBe("closed");
  });

  it("deleteSurvey - closed survey rejected", async () => {
    const { deleteSurvey } = await import("../../services/survey/survey.service.js");
    // Closed surveys cannot be deleted via service; only draft can be deleted
    await expect(deleteSurvey(ORG, createdSurveyId, "hr_admin")).rejects.toThrow(/draft/i);
  });

  it("cleanup: delete test survey directly", async () => {
    const db = getDB();
    await db("survey_questions").where({ survey_id: createdSurveyId }).delete();
    await db("surveys").where({ id: createdSurveyId }).delete();
  });
});

// ============================================================================
// HELPDESK SERVICE
// ============================================================================
describe("HelpdeskService coverage", () => {
  let createdTicketId: number;
  let createdArticleId: number;

  it("createTicket", async () => {
    const { createTicket } = await import("../../services/helpdesk/helpdesk.service.js");
    // DB enum: leave, payroll, benefits, it, facilities, onboarding, policy, general
    const t = await createTicket(ORG, EMP, {
      category: "it",
      priority: "medium",
      subject: `Test Ticket ${U}`,
      description: "Automated test ticket for service coverage",
    });
    expect(t.subject).toContain("Test Ticket");
    expect(t.status).toBe("open");
    expect(t.sla_response_hours).toBe(24);
    createdTicketId = t.id;
  });

  it("listTickets", async () => {
    const { listTickets } = await import("../../services/helpdesk/helpdesk.service.js");
    const r = await listTickets(ORG);
    expect(r).toHaveProperty("tickets");
    expect(r).toHaveProperty("total");
  });

  it("listTickets with filters", async () => {
    const { listTickets } = await import("../../services/helpdesk/helpdesk.service.js");
    const r = await listTickets(ORG, { status: "open", priority: "medium" });
    expect(r).toHaveProperty("tickets");
  });

  it("getTicket", async () => {
    const { getTicket } = await import("../../services/helpdesk/helpdesk.service.js");
    const t = await getTicket(ORG, createdTicketId);
    expect(t.subject).toContain("Test Ticket");
  });

  it("getTicket - not found", async () => {
    const { getTicket } = await import("../../services/helpdesk/helpdesk.service.js");
    await expect(getTicket(ORG, 999999)).rejects.toThrow();
  });

  it("assignTicket", async () => {
    const { assignTicket } = await import("../../services/helpdesk/helpdesk.service.js");
    const t = await assignTicket(ORG, createdTicketId, HR);
    expect(t.assigned_to).toBe(HR);
  });

  it("addComment", async () => {
    const { addComment } = await import("../../services/helpdesk/helpdesk.service.js");
    const c = await addComment(ORG, createdTicketId, HR, {
      content: "Working on this ticket",
      is_internal: false,
    });
    expect(c.content).toContain("Working on");
  });

  it("getMyTickets", async () => {
    const { getMyTickets } = await import("../../services/helpdesk/helpdesk.service.js");
    const r = await getMyTickets(ORG, EMP);
    expect(r).toHaveProperty("tickets");
    expect(r).toHaveProperty("total");
  });

  it("resolveTicket", async () => {
    const { resolveTicket } = await import("../../services/helpdesk/helpdesk.service.js");
    const t = await resolveTicket(ORG, createdTicketId, HR);
    expect(t.status).toBe("resolved");
  });

  it("reopenTicket", async () => {
    const { reopenTicket } = await import("../../services/helpdesk/helpdesk.service.js");
    const t = await reopenTicket(ORG, createdTicketId);
    expect(t.status).toBe("open");
  });

  it("closeTicket", async () => {
    const { closeTicket } = await import("../../services/helpdesk/helpdesk.service.js");
    const t = await closeTicket(ORG, createdTicketId);
    expect(t.status).toBe("closed");
  });

  it("getHelpdeskDashboard", async () => {
    const { getHelpdeskDashboard } = await import("../../services/helpdesk/helpdesk.service.js");
    const d = await getHelpdeskDashboard(ORG);
    expect(d).toHaveProperty("total_open");
  });

  it("createArticle", async () => {
    const { createArticle } = await import("../../services/helpdesk/helpdesk.service.js");
    const a = await createArticle(ORG, HR, {
      title: `Test KB Article ${U}`,
      content: "This is a test knowledge base article.",
      category: "general",
      tags: ["test"],
    });
    expect(a.title).toContain("Test KB Article");
    createdArticleId = a.id;
  });

  it("listArticles", async () => {
    const { listArticles } = await import("../../services/helpdesk/helpdesk.service.js");
    const r = await listArticles(ORG);
    expect(r).toHaveProperty("articles");
    expect(r).toHaveProperty("total");
  });

  it("getArticle", async () => {
    const { getArticle } = await import("../../services/helpdesk/helpdesk.service.js");
    const a = await getArticle(ORG, String(createdArticleId));
    expect(a.title).toContain("Test KB Article");
  });

  it("rateArticle", async () => {
    const { rateArticle } = await import("../../services/helpdesk/helpdesk.service.js");
    const r = await rateArticle(ORG, createdArticleId, true, EMP);
    expect(r).toHaveProperty("helpful_count");
  });

  it("cleanup: delete helpdesk test data", async () => {
    const db = getDB();
    await db("helpdesk_comments").where({ ticket_id: createdTicketId }).delete();
    await db("helpdesk_tickets").where({ id: createdTicketId }).delete();
    await db("kb_article_ratings").where({ article_id: createdArticleId }).delete();
    await db("kb_articles").where({ id: createdArticleId }).delete();
  });
});

// ============================================================================
// FEEDBACK SERVICE
// ============================================================================
describe("FeedbackService coverage", () => {
  let createdFeedbackId: number;

  it("submitFeedback", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const f = await submitFeedback(ORG, EMP, {
      category: "suggestion",
      subject: `Test Feedback ${U}`,
      message: "This is automated test feedback for service coverage",
    });
    expect(f.subject).toContain("Test Feedback");
    expect(f.status).toBe("new");
    expect(f.sentiment).toBe("positive"); // suggestion -> positive
    createdFeedbackId = f.id;
  });

  it("submitFeedback - negative sentiment inferred", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const f = await submitFeedback(ORG, EMP, {
      category: "harassment",
      subject: `Harassment Report ${U}`,
      message: "Test harassment feedback",
    });
    expect(f.sentiment).toBe("negative");
    // Clean up
    const db = getDB();
    await db("anonymous_feedback").where({ id: f.id }).delete();
  });

  it("submitFeedback - explicit sentiment overrides", async () => {
    const { submitFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const f = await submitFeedback(ORG, EMP, {
      category: "other",
      subject: `Neutral Feedback ${U}`,
      message: "Test explicit sentiment",
      sentiment: "positive",
    });
    expect(f.sentiment).toBe("positive");
    const db = getDB();
    await db("anonymous_feedback").where({ id: f.id }).delete();
  });

  it("getMyFeedback", async () => {
    const { getMyFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const r = await getMyFeedback(ORG, EMP);
    expect(r).toHaveProperty("feedback");
    expect(r).toHaveProperty("total");
  });

  it("listFeedback", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const r = await listFeedback(ORG);
    expect(r).toHaveProperty("feedback");
    expect(r).toHaveProperty("total");
  });

  it("listFeedback with filters", async () => {
    const { listFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    const r = await listFeedback(ORG, { category: "suggestion", status: "new" });
    expect(r).toHaveProperty("feedback");
  });

  it("getFeedbackById", async () => {
    const { getFeedbackById } = await import("../../services/feedback/anonymous-feedback.service.js");
    const f = await getFeedbackById(ORG, createdFeedbackId);
    expect(f.subject).toContain("Test Feedback");
  });

  it("getFeedbackById - not found", async () => {
    const { getFeedbackById } = await import("../../services/feedback/anonymous-feedback.service.js");
    await expect(getFeedbackById(ORG, 999999)).rejects.toThrow();
  });

  it("respondToFeedback", async () => {
    const { respondToFeedback } = await import("../../services/feedback/anonymous-feedback.service.js");
    // signature: respondToFeedback(orgId, feedbackId, response, respondedBy)
    const f = await respondToFeedback(ORG, createdFeedbackId, "Thank you for your feedback", HR);
    expect(f.admin_response).toContain("Thank you");
  });

  it("updateStatus", async () => {
    const { updateStatus } = await import("../../services/feedback/anonymous-feedback.service.js");
    // DB enum: new, acknowledged, under_review, resolved, archived
    const f = await updateStatus(ORG, createdFeedbackId, "under_review");
    expect(f.status).toBe("under_review");
  });

  it("getFeedbackDashboard", async () => {
    const { getFeedbackDashboard } = await import("../../services/feedback/anonymous-feedback.service.js");
    const d = await getFeedbackDashboard(ORG);
    expect(d).toHaveProperty("total");
  });

  it("cleanup: delete test feedback", async () => {
    const db = getDB();
    await db("anonymous_feedback").where({ id: createdFeedbackId }).delete();
  });
});

// ============================================================================
// CUSTOM FIELD SERVICE
// ============================================================================
describe("CustomFieldService coverage", () => {
  let createdFieldId: number;

  it("createFieldDefinition", async () => {
    const { createFieldDefinition } = await import("../../services/custom-field/custom-field.service.js");
    const f = await createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `Test Field ${U}`,
      field_type: "text",
      is_required: false,
      section: "Custom Fields",
    } as any);
    expect(f.field_name).toContain("Test Field");
    expect(f.field_type).toBe("text");
    createdFieldId = f.id;
  });

  it("createFieldDefinition - duplicate rejected", async () => {
    const { createFieldDefinition } = await import("../../services/custom-field/custom-field.service.js");
    await expect(createFieldDefinition(ORG, ADMIN, {
      entity_type: "employee",
      field_name: `Test Field ${U}`,
      field_type: "text",
    } as any)).rejects.toThrow(/already exists/);
  });

  it("listFieldDefinitions", async () => {
    const { listFieldDefinitions } = await import("../../services/custom-field/custom-field.service.js");
    const r = await listFieldDefinitions(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("listFieldDefinitions with entity type", async () => {
    const { listFieldDefinitions } = await import("../../services/custom-field/custom-field.service.js");
    const r = await listFieldDefinitions(ORG, "employee");
    expect(Array.isArray(r)).toBe(true);
  });

  it("getFieldDefinition", async () => {
    const { getFieldDefinition } = await import("../../services/custom-field/custom-field.service.js");
    const f = await getFieldDefinition(ORG, createdFieldId);
    expect(f.field_name).toContain("Test Field");
  });

  it("getFieldDefinition - not found", async () => {
    const { getFieldDefinition } = await import("../../services/custom-field/custom-field.service.js");
    await expect(getFieldDefinition(ORG, 999999)).rejects.toThrow();
  });

  it("setFieldValues + getFieldValues", async () => {
    const { setFieldValues, getFieldValues } = await import("../../services/custom-field/custom-field.service.js");
    // signature uses fieldId (camelCase)
    await setFieldValues(ORG, "employee", EMP, [
      { fieldId: createdFieldId, value: "custom-test-value" },
    ] as any);
    const values = await getFieldValues(ORG, "employee", EMP);
    const found = values.find((v: any) => v.field_id === createdFieldId);
    expect(found).toBeTruthy();
    expect(found.value).toBe("custom-test-value");
  });

  it("deleteFieldDefinition (cleanup)", async () => {
    const { deleteFieldDefinition } = await import("../../services/custom-field/custom-field.service.js");
    // Clean up field values first
    const db = getDB();
    await db("custom_field_values").where({ field_id: createdFieldId }).delete();
    await deleteFieldDefinition(ORG, createdFieldId);
  });
});

// ============================================================================
// WHISTLEBLOWING SERVICE
// ============================================================================
describe("WhistleblowingService coverage", () => {
  let createdReportId: number;
  let createdCaseNumber: string;

  it("submitReport", async () => {
    const { submitReport } = await import("../../services/whistleblowing/whistleblowing.service.js");
    // submitReport returns { id, case_number }
    const r = await submitReport(ORG, EMP, {
      category: "fraud",
      severity: "high",
      subject: `Test Whistleblower Report ${U}`,
      description: "Automated test report for service coverage",
      is_anonymous: true,
    });
    expect(r.id).toBeGreaterThan(0);
    expect(r.case_number).toBeTruthy();
    createdReportId = r.id;
    createdCaseNumber = r.case_number;
  });

  it("submitReport - non-anonymous", async () => {
    const { submitReport } = await import("../../services/whistleblowing/whistleblowing.service.js");
    const r = await submitReport(ORG, EMP, {
      category: "misconduct",
      subject: `Non-anon Report ${U}`,
      description: "Non-anonymous test report",
      is_anonymous: false,
    });
    expect(r.id).toBeGreaterThan(0);
    // Verify non-anonymous by reading the DB directly
    const db = getDB();
    const report = await db("whistleblower_reports").where({ id: r.id }).first();
    expect(report.reporter_user_id).toBe(EMP);
    // Clean up
    await db("whistleblower_reports").where({ id: r.id }).delete();
  });

  it("getMyReports", async () => {
    const { getMyReports } = await import("../../services/whistleblowing/whistleblowing.service.js");
    const r = await getMyReports(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getReportByCase", async () => {
    const { getReportByCase } = await import("../../services/whistleblowing/whistleblowing.service.js");
    const r = await getReportByCase(ORG, createdCaseNumber);
    expect(r.id).toBe(createdReportId);
  });

  it("getReportByCase - not found", async () => {
    const { getReportByCase } = await import("../../services/whistleblowing/whistleblowing.service.js");
    await expect(getReportByCase(ORG, "WB-0000-9999")).rejects.toThrow();
  });

  it("listReports", async () => {
    const { listReports } = await import("../../services/whistleblowing/whistleblowing.service.js");
    const r = await listReports(ORG);
    expect(r).toHaveProperty("reports");
    expect(r).toHaveProperty("total");
  });

  it("listReports with filters", async () => {
    const { listReports } = await import("../../services/whistleblowing/whistleblowing.service.js");
    const r = await listReports(ORG, { status: "submitted", severity: "high" });
    expect(r).toHaveProperty("reports");
  });

  it("getReport", async () => {
    const { getReport } = await import("../../services/whistleblowing/whistleblowing.service.js");
    const r = await getReport(ORG, createdReportId);
    expect(r.subject).toContain("Test Whistleblower Report");
  });

  it("getReport - not found", async () => {
    const { getReport } = await import("../../services/whistleblowing/whistleblowing.service.js");
    await expect(getReport(ORG, 999999)).rejects.toThrow();
  });

  it("assignInvestigator", async () => {
    const { assignInvestigator } = await import("../../services/whistleblowing/whistleblowing.service.js");
    const r = await assignInvestigator(ORG, createdReportId, HR);
    expect(r.assigned_investigator_id).toBe(HR);
  });

  it("addUpdate", async () => {
    const { addUpdate } = await import("../../services/whistleblowing/whistleblowing.service.js");
    const r = await addUpdate(ORG, createdReportId, HR, {
      update_text: "Investigation in progress",
      is_internal: true,
    });
    expect(r).toHaveProperty("id");
  });

  it("updateStatus", async () => {
    const { updateStatus } = await import("../../services/whistleblowing/whistleblowing.service.js");
    const r = await updateStatus(ORG, createdReportId, {
      status: "under_investigation",
      investigation_notes: "Investigating the matter",
    });
    expect(r.status).toBe("under_investigation");
  });

  it("getWhistleblowingDashboard", async () => {
    const { getWhistleblowingDashboard } = await import("../../services/whistleblowing/whistleblowing.service.js");
    const d = await getWhistleblowingDashboard(ORG);
    expect(d).toHaveProperty("total");
    expect(d).toHaveProperty("open");
  });

  it("cleanup: delete whistleblower test data", async () => {
    const db = getDB();
    await db("whistleblower_updates").where({ report_id: createdReportId }).delete();
    await db("whistleblower_reports").where({ id: createdReportId }).delete();
  });
});

// ============================================================================
// CHATBOT SERVICE
// ============================================================================
describe("ChatbotService coverage", () => {
  let conversationId: number;

  it("createConversation", async () => {
    const { createConversation } = await import("../../services/chatbot/chatbot.service.js");
    const c = await createConversation(ORG, EMP);
    expect(c).toHaveProperty("id");
    expect(c.status).toBe("active");
    conversationId = c.id;
  });

  it("getConversations", async () => {
    const { getConversations } = await import("../../services/chatbot/chatbot.service.js");
    const r = await getConversations(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBeGreaterThan(0);
  });

  it("getMessages - empty conversation", async () => {
    const { getMessages } = await import("../../services/chatbot/chatbot.service.js");
    const msgs = await getMessages(ORG, conversationId, EMP);
    expect(Array.isArray(msgs)).toBe(true);
  });

  it("getMessages - not found", async () => {
    const { getMessages } = await import("../../services/chatbot/chatbot.service.js");
    await expect(getMessages(ORG, 999999, EMP)).rejects.toThrow();
  });

  it("getSuggestions", async () => {
    const { getSuggestions } = await import("../../services/chatbot/chatbot.service.js");
    const suggestions = getSuggestions();
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("deleteConversation", async () => {
    const { deleteConversation } = await import("../../services/chatbot/chatbot.service.js");
    const r = await deleteConversation(ORG, conversationId, EMP);
    expect(r.success).toBe(true);
  });

  it("deleteConversation - not found", async () => {
    const { deleteConversation } = await import("../../services/chatbot/chatbot.service.js");
    await expect(deleteConversation(ORG, 999999, EMP)).rejects.toThrow();
  });

  it("cleanup: delete test conversation", async () => {
    const db = getDB();
    await db("chatbot_messages").where({ conversation_id: conversationId }).delete();
    await db("chatbot_conversations").where({ id: conversationId }).delete();
  });
});
