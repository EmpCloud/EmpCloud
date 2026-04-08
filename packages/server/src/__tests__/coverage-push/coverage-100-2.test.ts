// =============================================================================
// Coverage Push: Employee Detail, Employee Profile, Salary, Probation,
// Onboarding, Geo-fence — comprehensive real-DB tests
// =============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
// DB_PASSWORD must be set via environment variable
process.env.DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.RSA_PRIVATE_KEY_PATH = "/dev/null";
process.env.RSA_PUBLIC_KEY_PATH = "/dev/null";
process.env.BILLING_API_KEY = "test";
process.env.BILLING_MODULE_URL = "http://localhost:4001";
process.env.LOG_LEVEL = "error";

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { initDB, closeDB, getDB } from "../../db/connection.js";

const ORG = 5; // TechNova
const ADMIN = 522; // ananya@technova.in
const EMP = 524; // priya@technova.in
const MGR = 529; // karthik@technova.in
const U = String(Date.now()).slice(-6);

beforeAll(async () => { await initDB(); });
afterAll(async () => { await closeDB(); });

// =============================================================================
// 1. EMPLOYEE DETAIL SERVICE (16 functions)
// =============================================================================

describe("EmployeeDetailService — Addresses", () => {
  let svc: any;
  const createdIds: number[] = [];

  beforeAll(async () => {
    svc = await import("../../services/employee/employee-detail.service.js");
  });

  afterAll(async () => {
    const db = getDB();
    if (createdIds.length) {
      await db("employee_addresses").whereIn("id", createdIds).delete();
    }
  });

  it("getAddresses returns array for valid user", async () => {
    const result = await svc.getAddresses(ORG, EMP);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getAddresses returns empty array for non-existent user", async () => {
    const result = await svc.getAddresses(ORG, 999999);
    expect(result).toHaveLength(0);
  });

  it("createAddress creates a current address", async () => {
    const addr = await svc.createAddress(ORG, EMP, {
      type: "current",
      line1: `Test Addr ${U}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      zipcode: "400001",
    });
    expect(addr).toBeDefined();
    expect(addr.id).toBeDefined();
    expect(addr.type).toBe("current");
    expect(addr.city).toBe("Mumbai");
    createdIds.push(addr.id);
  });

  it("createAddress creates a permanent address with optional fields", async () => {
    const addr = await svc.createAddress(ORG, EMP, {
      type: "permanent",
      line1: `Perm Addr ${U}`,
      line2: "Apt 42",
      city: "Delhi",
      state: "Delhi",
      country: "India",
      zipcode: "110001",
    });
    expect(addr.type).toBe("permanent");
    expect(addr.line2).toBe("Apt 42");
    createdIds.push(addr.id);
  });

  it("updateAddress updates existing address", async () => {
    const updated = await svc.updateAddress(ORG, EMP, createdIds[0], {
      city: "Pune",
      zipcode: "411001",
    });
    expect(updated.city).toBe("Pune");
    expect(updated.zipcode).toBe("411001");
  });

  it("updateAddress throws NotFoundError for wrong addressId", async () => {
    try {
      await svc.updateAddress(ORG, EMP, 999999, { city: "X" });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });

  it("updateAddress throws NotFoundError for wrong org", async () => {
    try {
      await svc.updateAddress(99999, EMP, createdIds[0], { city: "X" });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });

  it("deleteAddress removes address", async () => {
    const addr = await svc.createAddress(ORG, EMP, {
      type: "current",
      line1: `Del Addr ${U}`,
      city: "Chennai",
      state: "TN",
      country: "India",
      zipcode: "600001",
    });
    await svc.deleteAddress(ORG, EMP, addr.id);
    // Verify deleted
    const db = getDB();
    const row = await db("employee_addresses").where({ id: addr.id }).first();
    expect(row).toBeUndefined();
  });

  it("deleteAddress throws NotFoundError for non-existent address", async () => {
    try {
      await svc.deleteAddress(ORG, EMP, 999999);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });

  it("deleteAddress throws NotFoundError for wrong user", async () => {
    try {
      await svc.deleteAddress(ORG, 999999, createdIds[0]);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });
});

describe("EmployeeDetailService — Education", () => {
  let svc: any;
  const createdIds: number[] = [];

  beforeAll(async () => {
    svc = await import("../../services/employee/employee-detail.service.js");
  });

  afterAll(async () => {
    const db = getDB();
    if (createdIds.length) {
      await db("employee_education").whereIn("id", createdIds).delete();
    }
  });

  it("getEducation returns array", async () => {
    const result = await svc.getEducation(ORG, EMP);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getEducation returns empty for non-existent user", async () => {
    const result = await svc.getEducation(ORG, 999999);
    expect(result).toHaveLength(0);
  });

  it("createEducation with required fields only", async () => {
    const edu = await svc.createEducation(ORG, EMP, {
      degree: `B.Tech ${U}`,
      institution: "IIT Mumbai",
      start_year: 2018,
    });
    expect(edu.degree).toBe(`B.Tech ${U}`);
    expect(edu.institution).toBe("IIT Mumbai");
    expect(edu.start_year).toBe(2018);
    createdIds.push(edu.id);
  });

  it("createEducation with all optional fields", async () => {
    const edu = await svc.createEducation(ORG, EMP, {
      degree: `M.Tech ${U}`,
      institution: "IIT Delhi",
      field_of_study: "Computer Science",
      start_year: 2020,
      end_year: 2022,
      grade: "9.1",
    });
    expect(edu.field_of_study).toBe("Computer Science");
    expect(edu.end_year).toBe(2022);
    expect(edu.grade).toBe("9.1");
    createdIds.push(edu.id);
  });

  it("updateEducation updates fields", async () => {
    const updated = await svc.updateEducation(ORG, EMP, createdIds[0], {
      grade: "8.5",
      end_year: 2022,
    });
    expect(updated.grade).toBe("8.5");
    expect(updated.end_year).toBe(2022);
  });

  it("updateEducation throws NotFoundError for wrong id", async () => {
    try {
      await svc.updateEducation(ORG, EMP, 999999, { degree: "X" });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });

  it("deleteEducation removes record", async () => {
    const edu = await svc.createEducation(ORG, EMP, {
      degree: `PhD ${U}`,
      institution: "IISC",
      start_year: 2023,
    });
    await svc.deleteEducation(ORG, EMP, edu.id);
    const db = getDB();
    const row = await db("employee_education").where({ id: edu.id }).first();
    expect(row).toBeUndefined();
  });

  it("deleteEducation throws NotFoundError for non-existent", async () => {
    try {
      await svc.deleteEducation(ORG, EMP, 999999);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });
});

describe("EmployeeDetailService — Work Experience", () => {
  let svc: any;
  const createdIds: number[] = [];

  beforeAll(async () => {
    svc = await import("../../services/employee/employee-detail.service.js");
  });

  afterAll(async () => {
    const db = getDB();
    if (createdIds.length) {
      await db("employee_work_experience").whereIn("id", createdIds).delete();
    }
  });

  it("getExperience returns array", async () => {
    const result = await svc.getExperience(ORG, EMP);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getExperience returns empty for non-existent user", async () => {
    const result = await svc.getExperience(ORG, 999999);
    expect(result).toHaveLength(0);
  });

  it("createExperience with required fields", async () => {
    const exp = await svc.createExperience(ORG, EMP, {
      company_name: `TestCorp ${U}`,
      designation: "SDE",
      start_date: "2020-01-15",
    });
    expect(exp.company_name).toBe(`TestCorp ${U}`);
    expect(exp.designation).toBe("SDE");
    createdIds.push(exp.id);
  });

  it("createExperience with all optional fields", async () => {
    const exp = await svc.createExperience(ORG, EMP, {
      company_name: `AcmeCo ${U}`,
      designation: "Tech Lead",
      start_date: "2018-06-01",
      end_date: "2020-01-14",
      description: "Led a team of 10 engineers",
    });
    expect(exp.end_date).toBeDefined();
    expect(exp.description).toBe("Led a team of 10 engineers");
    createdIds.push(exp.id);
  });

  it("updateExperience updates fields", async () => {
    const updated = await svc.updateExperience(ORG, EMP, createdIds[0], {
      designation: "Senior SDE",
      end_date: "2022-12-31",
    });
    expect(updated.designation).toBe("Senior SDE");
  });

  it("updateExperience throws NotFoundError for wrong id", async () => {
    try {
      await svc.updateExperience(ORG, EMP, 999999, { designation: "X" });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });

  it("deleteExperience removes record", async () => {
    const exp = await svc.createExperience(ORG, EMP, {
      company_name: `DelCorp ${U}`,
      designation: "Intern",
      start_date: "2017-01-01",
    });
    await svc.deleteExperience(ORG, EMP, exp.id);
    const db = getDB();
    const row = await db("employee_work_experience").where({ id: exp.id }).first();
    expect(row).toBeUndefined();
  });

  it("deleteExperience throws NotFoundError for non-existent", async () => {
    try {
      await svc.deleteExperience(ORG, EMP, 999999);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });

  it("deleteExperience throws NotFoundError for wrong org", async () => {
    try {
      await svc.deleteExperience(99999, EMP, createdIds[0]);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });
});

describe("EmployeeDetailService — Dependents", () => {
  let svc: any;
  const createdIds: number[] = [];

  beforeAll(async () => {
    svc = await import("../../services/employee/employee-detail.service.js");
  });

  afterAll(async () => {
    const db = getDB();
    if (createdIds.length) {
      await db("employee_dependents").whereIn("id", createdIds).delete();
    }
  });

  it("getDependents returns array", async () => {
    const result = await svc.getDependents(ORG, EMP);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getDependents returns empty for non-existent user", async () => {
    const result = await svc.getDependents(ORG, 999999);
    expect(result).toHaveLength(0);
  });

  it("createDependent with required fields only", async () => {
    const dep = await svc.createDependent(ORG, EMP, {
      name: `TestDep ${U}`,
      relationship: "spouse",
    });
    expect(dep.name).toBe(`TestDep ${U}`);
    expect(dep.relationship).toBe("spouse");
    createdIds.push(dep.id);
  });

  it("createDependent with all optional fields", async () => {
    const dep = await svc.createDependent(ORG, EMP, {
      name: `Child ${U}`,
      relationship: "child",
      date_of_birth: "2015-03-20",
      gender: "male",
      is_nominee: true,
    });
    expect(dep.gender).toBe("male");
    expect(dep.is_nominee).toBeTruthy();
    createdIds.push(dep.id);
  });

  it("createDependent with parent relationship", async () => {
    const dep = await svc.createDependent(ORG, EMP, {
      name: `Parent ${U}`,
      relationship: "parent",
      date_of_birth: "1960-11-05",
      gender: "female",
      is_nominee: false,
    });
    expect(dep.relationship).toBe("parent");
    createdIds.push(dep.id);
  });

  it("updateDependent updates fields", async () => {
    const updated = await svc.updateDependent(ORG, EMP, createdIds[0], {
      name: `Updated Dep ${U}`,
      is_nominee: true,
    });
    expect(updated.name).toBe(`Updated Dep ${U}`);
  });

  it("updateDependent throws NotFoundError for wrong id", async () => {
    try {
      await svc.updateDependent(ORG, EMP, 999999, { name: "X" });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });

  it("updateDependent throws NotFoundError for wrong user", async () => {
    try {
      await svc.updateDependent(ORG, 999999, createdIds[0], { name: "X" });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });

  it("deleteDependent removes record", async () => {
    const dep = await svc.createDependent(ORG, EMP, {
      name: `DelDep ${U}`,
      relationship: "sibling",
    });
    await svc.deleteDependent(ORG, EMP, dep.id);
    const db = getDB();
    const row = await db("employee_dependents").where({ id: dep.id }).first();
    expect(row).toBeUndefined();
  });

  it("deleteDependent throws NotFoundError for non-existent", async () => {
    try {
      await svc.deleteDependent(ORG, EMP, 999999);
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toMatch(/not found/i);
    }
  });
});

// =============================================================================
// 2. EMPLOYEE PROFILE SERVICE (6 functions)
// =============================================================================

describe("EmployeeProfileService", () => {
  let svc: any;

  beforeAll(async () => {
    svc = await import("../../services/employee/employee-profile.service.js");
  });

  describe("getProfile", () => {
    it("returns profile for existing employee", async () => {
      const profile = await svc.getProfile(ORG, EMP);
      expect(profile).toBeDefined();
      expect(profile.id).toBe(EMP);
      expect(profile.organization_id).toBe(ORG);
      expect(profile.first_name).toBeDefined();
      expect(profile.email).toBeDefined();
    });

    it("returns profile with manager name when reporting_manager_id is set", async () => {
      const profile = await svc.getProfile(ORG, EMP);
      // Profile may or may not have a manager; just check the field exists
      expect("reporting_manager_name" in profile).toBe(true);
    });

    it("throws NotFoundError for non-existent user", async () => {
      try {
        await svc.getProfile(ORG, 999999);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });

    it("throws NotFoundError for wrong org", async () => {
      try {
        await svc.getProfile(99999, EMP);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });
  });

  describe("upsertProfile", () => {
    it("upserts profile with basic data", async () => {
      const result = await svc.upsertProfile(ORG, EMP, {
        blood_group: "B+",
        marital_status: "single",
      });
      expect(result).toBeDefined();
      expect(result.id).toBe(EMP);
    });

    it("upserts profile with reporting_manager_id", async () => {
      const result = await svc.upsertProfile(ORG, EMP, {
        reporting_manager_id: MGR,
      });
      expect(result).toBeDefined();
      expect(result.reporting_manager_id).toBe(MGR);
    });

    it("upserts profile with null reporting_manager_id to clear it", async () => {
      const result = await svc.upsertProfile(ORG, EMP, {
        reporting_manager_id: null,
      });
      expect(result).toBeDefined();
      expect(result.reporting_manager_id).toBeNull();
    });

    it("upserts profile with string reporting_manager_id (coercion)", async () => {
      const result = await svc.upsertProfile(ORG, EMP, {
        reporting_manager_id: String(MGR),
      });
      expect(result.reporting_manager_id).toBe(MGR);
      // Reset
      await svc.upsertProfile(ORG, EMP, { reporting_manager_id: null });
    });

    it("throws NotFoundError for non-existent user", async () => {
      try {
        await svc.upsertProfile(ORG, 999999, { blood_group: "O+" });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });

    it("updates existing profile row when it already exists", async () => {
      // First upsert creates
      await svc.upsertProfile(ORG, EMP, { nationality: "Indian" });
      // Second upsert updates
      const result = await svc.upsertProfile(ORG, EMP, { nationality: "Indian" });
      expect(result).toBeDefined();
    });
  });

  describe("getDirectory", () => {
    it("returns paginated directory with defaults", async () => {
      const result = await svc.getDirectory(ORG, {});
      expect(result).toBeDefined();
      expect(result.users).toBeDefined();
      expect(Array.isArray(result.users)).toBe(true);
      expect(typeof result.total).toBe("number");
      expect(result.total).toBeGreaterThan(0);
    });

    it("returns directory with custom page and per_page", async () => {
      const result = await svc.getDirectory(ORG, { page: 1, per_page: 5 });
      expect(result.users.length).toBeLessThanOrEqual(5);
    });

    it("returns directory filtered by search term", async () => {
      const result = await svc.getDirectory(ORG, { search: "ananya" });
      expect(result).toBeDefined();
      // Should find at least the admin user
      if (result.total > 0) {
        const emails = result.users.map((u: any) => u.email);
        const names = result.users.map((u: any) => u.first_name.toLowerCase());
        expect(
          emails.some((e: string) => e.includes("ananya")) ||
          names.some((n: string) => n.includes("ananya"))
        ).toBe(true);
      }
    });

    it("returns directory filtered by status", async () => {
      const result = await svc.getDirectory(ORG, { status: 1 });
      expect(result).toBeDefined();
      if (result.users.length > 0) {
        expect(result.users.every((u: any) => u.status === 1)).toBe(true);
      }
    });

    it("returns directory filtered by status=0 (inactive)", async () => {
      const result = await svc.getDirectory(ORG, { status: 0 });
      expect(result).toBeDefined();
      // May be empty, but should not error
      expect(Array.isArray(result.users)).toBe(true);
    });

    it("returns directory filtered by department_id", async () => {
      // Get a valid department id first
      const db = getDB();
      const dept = await db("organization_departments")
        .where({ organization_id: ORG, is_deleted: false })
        .first();
      if (dept) {
        const result = await svc.getDirectory(ORG, { department_id: dept.id });
        expect(result).toBeDefined();
        if (result.users.length > 0) {
          expect(result.users.every((u: any) => u.department_id === dept.id)).toBe(true);
        }
      }
    });

    it("returns empty for non-existent org", async () => {
      const result = await svc.getDirectory(99999, {});
      expect(result.total).toBe(0);
      expect(result.users).toHaveLength(0);
    });

    it("page 2 returns different or fewer results", async () => {
      const p1 = await svc.getDirectory(ORG, { page: 1, per_page: 2 });
      const p2 = await svc.getDirectory(ORG, { page: 2, per_page: 2 });
      if (p1.total > 2) {
        // Page 2 should have results
        expect(p2.users.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getBirthdays", () => {
    it("returns array of upcoming birthdays", async () => {
      const result = await svc.getBirthdays(ORG);
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0].first_name).toBeDefined();
        expect(result[0].date_of_birth).toBeDefined();
      }
    });

    it("returns empty array for non-existent org", async () => {
      const result = await svc.getBirthdays(99999);
      expect(result).toHaveLength(0);
    });
  });

  describe("getAnniversaries", () => {
    it("returns array of upcoming anniversaries", async () => {
      const result = await svc.getAnniversaries(ORG);
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0].first_name).toBeDefined();
        expect(result[0].date_of_joining).toBeDefined();
      }
    });

    it("returns empty array for non-existent org", async () => {
      const result = await svc.getAnniversaries(99999);
      expect(result).toHaveLength(0);
    });
  });

  describe("getHeadcount", () => {
    it("returns headcount grouped by department_id", async () => {
      const result = await svc.getHeadcount(ORG);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("department_id");
      expect(result[0]).toHaveProperty("count");
      expect(Number(result[0].count)).toBeGreaterThan(0);
    });

    it("returns empty array for non-existent org", async () => {
      const result = await svc.getHeadcount(99999);
      expect(result).toHaveLength(0);
    });
  });
});

// =============================================================================
// 3. SALARY SERVICE (2 functions)
// =============================================================================

describe("SalaryService", () => {
  let svc: any;

  beforeAll(async () => {
    svc = await import("../../services/employee/salary.service.js");
  });

  describe("getSalaryStructure", () => {
    it("returns salary structure for employee with profile", async () => {
      const result = await svc.getSalaryStructure(ORG, EMP);
      expect(result).toBeDefined();
      expect(result.user_id).toBe(EMP);
      // salary may be null if not set
      expect("salary" in result).toBe(true);
    });

    it("throws NotFoundError for non-existent user", async () => {
      try {
        await svc.getSalaryStructure(ORG, 999999);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });

    it("throws NotFoundError for wrong org", async () => {
      try {
        await svc.getSalaryStructure(99999, EMP);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });
  });

  describe("upsertSalaryStructure", () => {
    // Build a valid salary structure:
    // basic = 25000, hra = 10000, da = 5000, special = 10000 => gross = 50000
    // employer_pf = 12% of min(25000, 15000) = 1800
    // employer_esi = 0 (gross > 21000)
    // gratuity = 4.81% of 25000 = 1203 (rounded)
    // ctc = 50000 + 1800 + 0 + 1203 = 53003
    const validSalary = {
      ctc: 53003,
      basic: 25000,
      hra: 10000,
      da: 5000,
      special_allowance: 10000,
      gross: 50000,
      employer_pf: 1800,
      employer_esi: 0,
      gratuity: 1203,
    };

    it("upserts valid salary structure", async () => {
      const result = await svc.upsertSalaryStructure(ORG, EMP, validSalary);
      expect(result).toBeDefined();
      expect(result.user_id).toBe(EMP);
      expect(result.salary).toBeDefined();
      expect(result.salary.ctc).toBe(53003);
      expect(result.salary.basic).toBe(25000);
      expect(result.salary.gross).toBe(50000);
      expect(result.validation).toBeDefined();
    });

    it("getSalaryStructure returns the saved salary", async () => {
      const result = await svc.getSalaryStructure(ORG, EMP);
      expect(result.salary).not.toBeNull();
      expect(result.salary.ctc).toBe(53003);
      expect(result.salary.basic).toBe(25000);
    });

    it("updates existing salary on second upsert", async () => {
      // Slightly different structure: basic=30000
      // employer_pf = 12% of 15000 = 1800
      // gross = 30000 + 12000 + 6000 + 12000 = 60000
      // esi = 0 (gross > 21000)
      // gratuity = 4.81% of 30000 = 1443
      // ctc = 60000 + 1800 + 0 + 1443 = 63243
      const updated = {
        ctc: 63243,
        basic: 30000,
        hra: 12000,
        da: 6000,
        special_allowance: 12000,
        gross: 60000,
        employer_pf: 1800,
        employer_esi: 0,
        gratuity: 1443,
      };
      const result = await svc.upsertSalaryStructure(ORG, EMP, updated);
      expect(result.salary.basic).toBe(30000);
      expect(result.salary.ctc).toBe(63243);
    });

    it("throws NotFoundError for non-existent user", async () => {
      try {
        await svc.upsertSalaryStructure(ORG, 999999, validSalary);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });

    it("throws ValidationError for invalid salary structure", async () => {
      try {
        await svc.upsertSalaryStructure(ORG, EMP, {
          ctc: 100000,
          basic: 25000,
          hra: 10000,
          da: 5000,
          special_allowance: 10000,
          gross: 50000,
          employer_pf: 1800,
          employer_esi: 0,
          gratuity: 1203,
        });
        // ctc (100000) != gross(50000)+pf(1800)+esi(0)+gratuity(1203)=53003
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/validation failed/i);
      }
    });

    it("throws ValidationError when components do not sum to gross", async () => {
      try {
        await svc.upsertSalaryStructure(ORG, EMP, {
          ctc: 53003,
          basic: 25000,
          hra: 10000,
          da: 5000,
          special_allowance: 20000, // sum = 60000, not 50000
          gross: 50000,
          employer_pf: 1800,
          employer_esi: 0,
          gratuity: 1203,
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/validation failed/i);
      }
    });

    // Restore original salary after tests
    afterAll(async () => {
      try {
        await svc.upsertSalaryStructure(ORG, EMP, validSalary);
      } catch { /* ignore */ }
    });
  });
});

// =============================================================================
// 4. PROBATION SERVICE (5 functions)
// =============================================================================

describe("ProbationService", () => {
  let svc: any;

  beforeAll(async () => {
    svc = await import("../../services/employee/probation.service.js");
  });

  describe("getEmployeesOnProbation", () => {
    it("returns array of employees on probation", async () => {
      const result = await svc.getEmployeesOnProbation(ORG);
      expect(Array.isArray(result)).toBe(true);
      for (const emp of result) {
        expect(["on_probation", "extended"]).toContain(emp.probation_status);
        expect(emp.probation_end_date).toBeDefined();
        expect(emp.first_name).toBeDefined();
      }
    });

    it("returns empty for non-existent org", async () => {
      const result = await svc.getEmployeesOnProbation(99999);
      expect(result).toHaveLength(0);
    });
  });

  describe("getUpcomingConfirmations", () => {
    it("returns upcoming confirmations with default 30 days", async () => {
      const result = await svc.getUpcomingConfirmations(ORG);
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns upcoming confirmations with custom days", async () => {
      const result = await svc.getUpcomingConfirmations(ORG, 90);
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns upcoming confirmations with 0 days (only today)", async () => {
      const result = await svc.getUpcomingConfirmations(ORG, 0);
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty for non-existent org", async () => {
      const result = await svc.getUpcomingConfirmations(99999, 30);
      expect(result).toHaveLength(0);
    });
  });

  describe("confirmProbation", () => {
    let tempUserId: number;

    beforeAll(async () => {
      // Create a temporary user on probation for testing
      const db = getDB();
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 2);
      const [id] = await db("users").insert({
        organization_id: ORG,
        first_name: "ProbTest",
        last_name: U,
        email: `probtest-${U}@test.local`,
        password: "test",
        role: "employee",
        status: 1,
        probation_status: "on_probation",
        probation_end_date: futureDate.toISOString().slice(0, 10),
        created_at: new Date(),
        updated_at: new Date(),
      });
      tempUserId = id;
    });

    afterAll(async () => {
      const db = getDB();
      await db("employee_profiles").where({ user_id: tempUserId, organization_id: ORG }).delete();
      await db("users").where({ id: tempUserId }).delete();
    });

    it("confirms probation for employee", async () => {
      const result = await svc.confirmProbation(ORG, tempUserId, ADMIN);
      expect(result).toBeDefined();
      expect(result.probation_status).toBe("confirmed");
      expect(result.probation_confirmed_by).toBe(ADMIN);
    });

    it("throws ValidationError when already confirmed", async () => {
      try {
        await svc.confirmProbation(ORG, tempUserId, ADMIN);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/already confirmed/i);
      }
    });

    it("throws NotFoundError for non-existent employee", async () => {
      try {
        await svc.confirmProbation(ORG, 999999, ADMIN);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });
  });

  describe("extendProbation", () => {
    let tempUserId: number;

    beforeAll(async () => {
      const db = getDB();
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      const [id] = await db("users").insert({
        organization_id: ORG,
        first_name: "ExtTest",
        last_name: U,
        email: `exttest-${U}@test.local`,
        password: "test",
        role: "employee",
        status: 1,
        probation_status: "on_probation",
        probation_end_date: futureDate.toISOString().slice(0, 10),
        created_at: new Date(),
        updated_at: new Date(),
      });
      tempUserId = id;
    });

    afterAll(async () => {
      const db = getDB();
      await db("employee_profiles").where({ user_id: tempUserId, organization_id: ORG }).delete();
      await db("users").where({ id: tempUserId }).delete();
    });

    it("extends probation with new end date and reason", async () => {
      const newEnd = new Date();
      newEnd.setMonth(newEnd.getMonth() + 3);
      const result = await svc.extendProbation(
        ORG, tempUserId, newEnd.toISOString().slice(0, 10), "Needs more training"
      );
      expect(result).toBeDefined();
      expect(result.probation_status).toBe("extended");
      expect(result.probation_extension_reason).toBe("Needs more training");
    });

    it("throws NotFoundError for non-existent employee", async () => {
      try {
        await svc.extendProbation(ORG, 999999, "2027-06-01", "reason");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });

    it("throws ValidationError for invalid date", async () => {
      try {
        await svc.extendProbation(ORG, tempUserId, "not-a-date", "reason");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/invalid date/i);
      }
    });

    it("throws ValidationError for confirmed employee", async () => {
      const db = getDB();
      await db("users").where({ id: tempUserId }).update({ probation_status: "confirmed" });
      try {
        await svc.extendProbation(ORG, tempUserId, "2027-06-01", "reason");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/confirmed/i);
      }
      // Restore for cleanup
      await db("users").where({ id: tempUserId }).update({ probation_status: "on_probation" });
    });
  });

  describe("getProbationDashboard", () => {
    it("returns dashboard stats", async () => {
      const result = await svc.getProbationDashboard(ORG);
      expect(result).toBeDefined();
      expect(typeof result.on_probation).toBe("number");
      expect(typeof result.confirmed_this_month).toBe("number");
      expect(typeof result.upcoming_30_days).toBe("number");
      expect(typeof result.overdue).toBe("number");
      expect(result.on_probation).toBeGreaterThanOrEqual(0);
      expect(result.confirmed_this_month).toBeGreaterThanOrEqual(0);
      expect(result.upcoming_30_days).toBeGreaterThanOrEqual(0);
      expect(result.overdue).toBeGreaterThanOrEqual(0);
    });

    it("returns zeros for non-existent org", async () => {
      const result = await svc.getProbationDashboard(99999);
      expect(result.on_probation).toBe(0);
      expect(result.confirmed_this_month).toBe(0);
      expect(result.upcoming_30_days).toBe(0);
      expect(result.overdue).toBe(0);
    });
  });
});

// =============================================================================
// 5. ONBOARDING SERVICE (4 functions)
// =============================================================================

describe("OnboardingService", () => {
  let svc: any;

  beforeAll(async () => {
    svc = await import("../../services/onboarding/onboarding.service.js");
  });

  describe("getOnboardingStatus", () => {
    it("returns onboarding status for valid org", async () => {
      const result = await svc.getOnboardingStatus(ORG);
      expect(result).toBeDefined();
      expect(typeof result.completed).toBe("boolean");
      expect(typeof result.currentStep).toBe("number");
      expect(Array.isArray(result.steps)).toBe(true);
      expect(result.steps).toHaveLength(5);
      expect(result.steps[0].key).toBe("company_info");
      expect(result.steps[4].key).toBe("quick_setup");
    });

    it("each step has correct structure", async () => {
      const result = await svc.getOnboardingStatus(ORG);
      for (const step of result.steps) {
        expect(step).toHaveProperty("step");
        expect(step).toHaveProperty("name");
        expect(step).toHaveProperty("key");
        expect(step).toHaveProperty("completed");
        expect(typeof step.completed).toBe("boolean");
      }
    });

    it("throws NotFoundError for non-existent org", async () => {
      try {
        await svc.getOnboardingStatus(999999);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });
  });

  describe("completeStep", () => {
    it("completes step 1 (Company Info) with data", async () => {
      const result = await svc.completeStep(ORG, ADMIN, 1, {
        timezone: "Asia/Kolkata",
        country: "India",
      });
      expect(result).toBeDefined();
      expect(result.currentStep).toBeGreaterThanOrEqual(1);
    });

    it("completes step 2 (Departments) with department names", async () => {
      const result = await svc.completeStep(ORG, ADMIN, 2, {
        departments: [`TestDept-${U}`],
      });
      expect(result).toBeDefined();
      // Cleanup
      const db = getDB();
      await db("organization_departments")
        .where({ organization_id: ORG, name: `TestDept-${U}` })
        .delete();
    });

    it("step 2 throws ValidationError with empty departments", async () => {
      try {
        await svc.completeStep(ORG, ADMIN, 2, { departments: [] });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/at least one/i);
      }
    });

    it("step 2 skips duplicate department names", async () => {
      const db = getDB();
      // Get existing department name
      const existing = await db("organization_departments")
        .where({ organization_id: ORG, is_deleted: false })
        .first();
      if (existing) {
        const result = await svc.completeStep(ORG, ADMIN, 2, {
          departments: [existing.name],
        });
        expect(result).toBeDefined();
      }
    });

    it("completes step 3 (Invite Team) with empty invitations", async () => {
      const result = await svc.completeStep(ORG, ADMIN, 3, {
        invitations: [],
      });
      expect(result).toBeDefined();
    });

    it("completes step 3 with invitation data", async () => {
      const email = `onboard-${U}@test.local`;
      const result = await svc.completeStep(ORG, ADMIN, 3, {
        invitations: [{ email, role: "employee" }],
      });
      expect(result).toBeDefined();
      // Cleanup
      const db = getDB();
      await db("invitations").where({ email }).delete();
    });

    it("step 3 skips blank emails", async () => {
      const result = await svc.completeStep(ORG, ADMIN, 3, {
        invitations: [{ email: "" }, { email: "  " }],
      });
      expect(result).toBeDefined();
    });

    it("step 3 skips existing users", async () => {
      // Use existing admin email
      const db = getDB();
      const adminUser = await db("users").where({ id: ADMIN }).first();
      const result = await svc.completeStep(ORG, ADMIN, 3, {
        invitations: [{ email: adminUser.email }],
      });
      expect(result).toBeDefined();
    });

    it("completes step 4 (Choose Modules) with empty module_ids", async () => {
      const result = await svc.completeStep(ORG, ADMIN, 4, {
        module_ids: [],
      });
      expect(result).toBeDefined();
    });

    it("completes step 5 (Quick Setup) with empty data", async () => {
      const result = await svc.completeStep(ORG, ADMIN, 5, {});
      expect(result).toBeDefined();
    });

    it("throws ValidationError for invalid step number", async () => {
      try {
        await svc.completeStep(ORG, ADMIN, 0, {});
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/invalid onboarding step/i);
      }
    });

    it("throws ValidationError for step > 5", async () => {
      try {
        await svc.completeStep(ORG, ADMIN, 6, {});
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/invalid onboarding step/i);
      }
    });

    it("throws NotFoundError for non-existent org", async () => {
      try {
        await svc.completeStep(999999, ADMIN, 1, {});
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });
  });

  describe("completeOnboarding", () => {
    let savedState: boolean;

    beforeAll(async () => {
      const db = getDB();
      const org = await db("organizations").where({ id: ORG }).first();
      savedState = !!org.onboarding_completed;
    });

    afterAll(async () => {
      const db = getDB();
      await db("organizations").where({ id: ORG }).update({
        onboarding_completed: savedState,
      });
    });

    it("marks onboarding as completed", async () => {
      const result = await svc.completeOnboarding(ORG);
      expect(result).toEqual({ completed: true });

      const db = getDB();
      const org = await db("organizations").where({ id: ORG }).first();
      expect(!!org.onboarding_completed).toBe(true);
    });
  });

  describe("skipOnboarding", () => {
    let savedState: boolean;

    beforeAll(async () => {
      const db = getDB();
      const org = await db("organizations").where({ id: ORG }).first();
      savedState = !!org.onboarding_completed;
    });

    afterAll(async () => {
      const db = getDB();
      await db("organizations").where({ id: ORG }).update({
        onboarding_completed: savedState,
      });
    });

    it("marks onboarding as skipped", async () => {
      // First reset it
      const db = getDB();
      await db("organizations").where({ id: ORG }).update({ onboarding_completed: false });

      const result = await svc.skipOnboarding(ORG);
      expect(result).toEqual({ completed: true, skipped: true });

      const org = await db("organizations").where({ id: ORG }).first();
      expect(!!org.onboarding_completed).toBe(true);
    });
  });
});

// =============================================================================
// 6. GEO-FENCE SERVICE (4 functions)
// =============================================================================

describe("GeoFenceService", () => {
  let svc: any;
  const createdIds: number[] = [];

  beforeAll(async () => {
    svc = await import("../../services/attendance/geo-fence.service.js");
  });

  afterAll(async () => {
    const db = getDB();
    if (createdIds.length) {
      await db("geo_fence_locations").whereIn("id", createdIds).delete();
    }
  });

  describe("createGeoFence", () => {
    it("creates a geo-fence location", async () => {
      const fence = await svc.createGeoFence(ORG, {
        name: `Office HQ ${U}`,
        latitude: 19.076,
        longitude: 72.8777,
        radius_meters: 200,
      });
      expect(fence).toBeDefined();
      expect(fence.id).toBeDefined();
      expect(fence.name).toBe(`Office HQ ${U}`);
      expect(Number(fence.latitude)).toBeCloseTo(19.076, 2);
      expect(Number(fence.longitude)).toBeCloseTo(72.8777, 2);
      expect(fence.radius_meters).toBe(200);
      expect(fence.is_active).toBeTruthy();
      createdIds.push(fence.id);
    });

    it("creates a second geo-fence with different coords", async () => {
      const fence = await svc.createGeoFence(ORG, {
        name: `Branch ${U}`,
        latitude: 28.6139,
        longitude: 77.209,
        radius_meters: 500,
      });
      expect(fence.name).toBe(`Branch ${U}`);
      expect(fence.radius_meters).toBe(500);
      createdIds.push(fence.id);
    });

    it("creates a geo-fence with minimum radius", async () => {
      const fence = await svc.createGeoFence(ORG, {
        name: `Tiny ${U}`,
        latitude: 12.9716,
        longitude: 77.5946,
        radius_meters: 10,
      });
      expect(fence.radius_meters).toBe(10);
      createdIds.push(fence.id);
    });
  });

  describe("listGeoFences", () => {
    it("lists all active geo-fences for org", async () => {
      const result = await svc.listGeoFences(ORG);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(3);
      // Should be sorted by name
      for (let i = 1; i < result.length; i++) {
        expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0);
      }
    });

    it("only returns active fences", async () => {
      const result = await svc.listGeoFences(ORG);
      for (const fence of result) {
        expect(fence.is_active).toBeTruthy();
      }
    });

    it("returns empty for non-existent org", async () => {
      const result = await svc.listGeoFences(99999);
      expect(result).toHaveLength(0);
    });
  });

  describe("updateGeoFence", () => {
    it("updates geo-fence name", async () => {
      const updated = await svc.updateGeoFence(ORG, createdIds[0], {
        name: `Updated HQ ${U}`,
      });
      expect(updated.name).toBe(`Updated HQ ${U}`);
    });

    it("updates geo-fence coordinates", async () => {
      const updated = await svc.updateGeoFence(ORG, createdIds[0], {
        latitude: 19.1,
        longitude: 72.9,
      });
      expect(Number(updated.latitude)).toBeCloseTo(19.1, 1);
      expect(Number(updated.longitude)).toBeCloseTo(72.9, 1);
    });

    it("updates geo-fence radius", async () => {
      const updated = await svc.updateGeoFence(ORG, createdIds[0], {
        radius_meters: 300,
      });
      expect(updated.radius_meters).toBe(300);
    });

    it("throws NotFoundError for non-existent fence", async () => {
      try {
        await svc.updateGeoFence(ORG, 999999, { name: "X" });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });

    it("throws NotFoundError for wrong org", async () => {
      try {
        await svc.updateGeoFence(99999, createdIds[0], { name: "X" });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });
  });

  describe("deleteGeoFence", () => {
    it("soft-deletes a geo-fence (sets is_active=false)", async () => {
      await svc.deleteGeoFence(ORG, createdIds[2]);
      const db = getDB();
      const row = await db("geo_fence_locations").where({ id: createdIds[2] }).first();
      expect(row).toBeDefined();
      expect(row.is_active).toBeFalsy();
    });

    it("deleted fence no longer appears in listGeoFences", async () => {
      const fences = await svc.listGeoFences(ORG);
      const ids = fences.map((f: any) => f.id);
      expect(ids).not.toContain(createdIds[2]);
    });

    it("throws NotFoundError for non-existent fence", async () => {
      try {
        await svc.deleteGeoFence(ORG, 999999);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });

    it("throws NotFoundError for wrong org", async () => {
      try {
        await svc.deleteGeoFence(99999, createdIds[0]);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toMatch(/not found/i);
      }
    });
  });
});
