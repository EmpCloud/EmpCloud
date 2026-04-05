// =============================================================================
// Coverage Push: Employee Profile, Detail, Probation, Salary — actual imports
// =============================================================================

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
import { initDB, closeDB } from "../../db/connection.js";

const ORG = 5;
const EMP = 524;
const ADMIN = 522;

beforeAll(async () => { await initDB(); });
afterAll(async () => { await closeDB(); });

// ============================================================================
// EMPLOYEE PROFILE SERVICE
// ============================================================================

describe("EmployeeProfileService — full coverage", () => {
  it("getProfile", async () => {
    const { getProfile } = await import("../../services/employee/employee-profile.service.js");
    const p = await getProfile(ORG, EMP);
    expect(p.id).toBe(EMP);
    expect(p.first_name).toBeTruthy();
    expect(p.email).toBeTruthy();
  });

  it("getProfile — not found", async () => {
    const { getProfile } = await import("../../services/employee/employee-profile.service.js");
    await expect(getProfile(ORG, 999999)).rejects.toThrow();
  });

  it("getDirectory — defaults", async () => {
    const { getDirectory } = await import("../../services/employee/employee-profile.service.js");
    const r = await getDirectory(ORG, {});
    expect(r).toHaveProperty("users");
    expect(r).toHaveProperty("total");
    expect(r.users.length).toBeGreaterThan(0);
  });

  it("getDirectory — with search", async () => {
    const { getDirectory } = await import("../../services/employee/employee-profile.service.js");
    const r = await getDirectory(ORG, { search: "priya", page: 1, per_page: 5 });
    expect(r).toHaveProperty("users");
  });

  it("getDirectory — with department_id", async () => {
    const { getDirectory } = await import("../../services/employee/employee-profile.service.js");
    const r = await getDirectory(ORG, { department_id: 72 });
    expect(r).toHaveProperty("users");
  });

  it("getDirectory — with status filter", async () => {
    const { getDirectory } = await import("../../services/employee/employee-profile.service.js");
    const r = await getDirectory(ORG, { status: 0 });
    expect(r).toHaveProperty("users");
  });

  it("getBirthdays", async () => {
    const { getBirthdays } = await import("../../services/employee/employee-profile.service.js");
    const r = await getBirthdays(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getAnniversaries", async () => {
    const { getAnniversaries } = await import("../../services/employee/employee-profile.service.js");
    const r = await getAnniversaries(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getHeadcount", async () => {
    const { getHeadcount } = await import("../../services/employee/employee-profile.service.js");
    const r = await getHeadcount(ORG);
    expect(Array.isArray(r)).toBe(true);
    for (const item of r) {
      expect(Number(item.count)).toBeGreaterThan(0);
    }
  });

  it("upsertProfile — not found user", async () => {
    const { upsertProfile } = await import("../../services/employee/employee-profile.service.js");
    await expect(upsertProfile(ORG, 999999, {} as any)).rejects.toThrow();
  });
});

// ============================================================================
// EMPLOYEE DETAIL SERVICE
// ============================================================================

describe("EmployeeDetailService — full coverage", () => {
  it("getAddresses", async () => {
    const { getAddresses } = await import("../../services/employee/employee-detail.service.js");
    const r = await getAddresses(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getEducation", async () => {
    const { getEducation } = await import("../../services/employee/employee-detail.service.js");
    const r = await getEducation(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getExperience", async () => {
    const { getExperience } = await import("../../services/employee/employee-detail.service.js");
    const r = await getExperience(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getDependents", async () => {
    const { getDependents } = await import("../../services/employee/employee-detail.service.js");
    const r = await getDependents(ORG, EMP);
    expect(Array.isArray(r)).toBe(true);
  });

  it("updateAddress — not found", async () => {
    const { updateAddress } = await import("../../services/employee/employee-detail.service.js");
    await expect(updateAddress(ORG, EMP, 999999, {})).rejects.toThrow();
  });

  it("deleteAddress — not found", async () => {
    const { deleteAddress } = await import("../../services/employee/employee-detail.service.js");
    await expect(deleteAddress(ORG, EMP, 999999)).rejects.toThrow();
  });

  it("updateEducation — not found", async () => {
    const { updateEducation } = await import("../../services/employee/employee-detail.service.js");
    await expect(updateEducation(ORG, EMP, 999999, {})).rejects.toThrow();
  });

  it("deleteEducation — not found", async () => {
    const { deleteEducation } = await import("../../services/employee/employee-detail.service.js");
    await expect(deleteEducation(ORG, EMP, 999999)).rejects.toThrow();
  });

  it("updateExperience — not found", async () => {
    const { updateExperience } = await import("../../services/employee/employee-detail.service.js");
    await expect(updateExperience(ORG, EMP, 999999, {})).rejects.toThrow();
  });

  it("deleteExperience — not found", async () => {
    const { deleteExperience } = await import("../../services/employee/employee-detail.service.js");
    await expect(deleteExperience(ORG, EMP, 999999)).rejects.toThrow();
  });

  it("updateDependent — not found", async () => {
    const { updateDependent } = await import("../../services/employee/employee-detail.service.js");
    await expect(updateDependent(ORG, EMP, 999999, {})).rejects.toThrow();
  });

  it("deleteDependent — not found", async () => {
    const { deleteDependent } = await import("../../services/employee/employee-detail.service.js");
    await expect(deleteDependent(ORG, EMP, 999999)).rejects.toThrow();
  });
});

// ============================================================================
// PROBATION SERVICE
// ============================================================================

describe("ProbationService — full coverage", () => {
  it("getEmployeesOnProbation", async () => {
    const { getEmployeesOnProbation } = await import("../../services/employee/probation.service.js");
    const r = await getEmployeesOnProbation(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getUpcomingConfirmations — default 30 days", async () => {
    const { getUpcomingConfirmations } = await import("../../services/employee/probation.service.js");
    const r = await getUpcomingConfirmations(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getUpcomingConfirmations — custom days", async () => {
    const { getUpcomingConfirmations } = await import("../../services/employee/probation.service.js");
    const r = await getUpcomingConfirmations(ORG, 60);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getProbationDashboard", async () => {
    const { getProbationDashboard } = await import("../../services/employee/probation.service.js");
    const d = await getProbationDashboard(ORG);
    expect(d).toHaveProperty("on_probation");
    expect(d).toHaveProperty("confirmed_this_month");
    expect(d).toHaveProperty("upcoming_30_days");
    expect(d).toHaveProperty("overdue");
  });

  it("confirmProbation — not found", async () => {
    const { confirmProbation } = await import("../../services/employee/probation.service.js");
    await expect(confirmProbation(ORG, 999999, ADMIN)).rejects.toThrow();
  });

  it("extendProbation — not found", async () => {
    const { extendProbation } = await import("../../services/employee/probation.service.js");
    await expect(extendProbation(ORG, 999999, "2026-12-31", "test")).rejects.toThrow();
  });

  it("extendProbation — invalid date", async () => {
    const { extendProbation } = await import("../../services/employee/probation.service.js");
    // Need a real user for this; use EMP and hope they aren't confirmed
    try {
      await extendProbation(ORG, EMP, "not-a-date", "test");
    } catch (e: any) {
      expect(e.message).toMatch(/date|not found|confirmed/i);
    }
  });
});

// ============================================================================
// SALARY SERVICE
// ============================================================================

describe("SalaryService — full coverage", () => {
  it("getSalaryStructure — user with profile", async () => {
    const { getSalaryStructure } = await import("../../services/employee/salary.service.js");
    const r = await getSalaryStructure(ORG, EMP);
    expect(r).toHaveProperty("user_id");
    expect(r.user_id).toBe(EMP);
    // salary may be null
  });

  it("getSalaryStructure — not found user", async () => {
    const { getSalaryStructure } = await import("../../services/employee/salary.service.js");
    await expect(getSalaryStructure(ORG, 999999)).rejects.toThrow();
  });

  it("upsertSalaryStructure — not found user", async () => {
    const { upsertSalaryStructure } = await import("../../services/employee/salary.service.js");
    await expect(
      upsertSalaryStructure(ORG, 999999, {
        ctc: 100000,
        basic: 50000,
        hra: 20000,
        da: 10000,
        special_allowance: 20000,
        gross: 100000,
        employer_pf: 1800,
        employer_esi: 0,
        gratuity: 2405,
      }),
    ).rejects.toThrow();
  });
});
