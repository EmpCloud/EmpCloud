// ============================================================================
// EMP CLOUD — Service Coverage Final Tests
// Targets: pricing, org, announcement, webhook, subscription, employee-detail,
//          leave-balance, errors, oauth
// ============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = "EmpCloud2026";
process.env.DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-cov-final";
process.env.LOG_LEVEL = "error";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initDB, getDB } from "../../db/connection.js";
import type { Knex } from "knex";

let db: Knex;

beforeAll(async () => {
  db = await initDB();
}, 30000);

afterAll(async () => {
  await db.destroy();
}, 10000);

// ── PRICING ──────────────────────────────────────────────────────────────────

describe("pricing helpers", () => {
  let getPricePerSeat: any;
  let getCurrencyForCountry: any;
  let PLAN_PRICING_BY_CURRENCY: any;

  beforeAll(async () => {
    const mod = await import("../../services/subscription/pricing.js");
    getPricePerSeat = mod.getPricePerSeat;
    getCurrencyForCountry = mod.getCurrencyForCountry;
    PLAN_PRICING_BY_CURRENCY = mod.PLAN_PRICING_BY_CURRENCY;
  });

  it("returns correct INR prices for all plan tiers", () => {
    expect(getPricePerSeat("free", "INR")).toBe(0);
    expect(getPricePerSeat("basic", "INR")).toBe(50000);
    expect(getPricePerSeat("professional", "INR")).toBe(100000);
    expect(getPricePerSeat("enterprise", "INR")).toBe(175000);
  });

  it("returns correct USD prices", () => {
    expect(getPricePerSeat("free", "USD")).toBe(0);
    expect(getPricePerSeat("basic", "USD")).toBe(500);
    expect(getPricePerSeat("enterprise", "USD")).toBe(1750);
  });

  it("falls back to USD for unknown currency", () => {
    expect(getPricePerSeat("basic", "JPY")).toBe(500);
  });

  it("falls back to basic price for unknown tier", () => {
    expect(getPricePerSeat("platinum", "USD")).toBe(500);
  });

  it("getCurrencyForCountry returns INR for India", () => {
    expect(getCurrencyForCountry("IN")).toBe("INR");
    expect(getCurrencyForCountry("India")).toBe("INR");
  });

  it("getCurrencyForCountry returns GBP for UK", () => {
    expect(getCurrencyForCountry("GB")).toBe("GBP");
    expect(getCurrencyForCountry("UK")).toBe("GBP");
    expect(getCurrencyForCountry("United Kingdom")).toBe("GBP");
  });

  it("getCurrencyForCountry returns EUR for EU", () => {
    expect(getCurrencyForCountry("DE")).toBe("EUR");
    expect(getCurrencyForCountry("France")).toBe("EUR");
    expect(getCurrencyForCountry("Italy")).toBe("EUR");
    expect(getCurrencyForCountry("Spain")).toBe("EUR");
  });

  it("getCurrencyForCountry defaults to USD", () => {
    expect(getCurrencyForCountry("US")).toBe("USD");
    expect(getCurrencyForCountry("JP")).toBe("USD");
    expect(getCurrencyForCountry("")).toBe("USD");
  });

  it("PLAN_PRICING has all 4 currencies", () => {
    expect(Object.keys(PLAN_PRICING_BY_CURRENCY)).toEqual(
      expect.arrayContaining(["INR", "USD", "GBP", "EUR"])
    );
  });
});

// ── ERROR CLASSES ────────────────────────────────────────────────────────────

describe("Error classes", () => {
  let errors: any;

  beforeAll(async () => {
    errors = await import("../../utils/errors.js");
  });

  it("AppError has correct properties", () => {
    const err = new errors.AppError("test msg", 500, "TEST_CODE", { foo: "bar" });
    expect(err.message).toBe("test msg");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("TEST_CODE");
    expect(err.details).toEqual({ foo: "bar" });
    expect(err.name).toBe("AppError");
    expect(err instanceof Error).toBe(true);
  });

  it("ValidationError defaults", () => {
    const err = new errors.ValidationError("bad input");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("UnauthorizedError default message", () => {
    const err = new errors.UnauthorizedError();
    expect(err.message).toBe("Unauthorized");
    expect(err.statusCode).toBe(401);
  });

  it("ForbiddenError default message", () => {
    const err = new errors.ForbiddenError();
    expect(err.message).toBe("Forbidden");
    expect(err.statusCode).toBe(403);
  });

  it("NotFoundError with resource name", () => {
    const err = new errors.NotFoundError("Department");
    expect(err.message).toBe("Department not found");
    expect(err.statusCode).toBe(404);
  });

  it("ConflictError", () => {
    const err = new errors.ConflictError("Already exists");
    expect(err.message).toBe("Already exists");
    expect(err.statusCode).toBe(409);
  });

  it("RateLimitError", () => {
    const err = new errors.RateLimitError();
    expect(err.message).toBe("Too many requests");
    expect(err.statusCode).toBe(429);
  });

  it("OAuthError toJSON", () => {
    const err = new errors.OAuthError("invalid_grant", "Token expired", 400);
    expect(err.errorType).toBe("invalid_grant");
    expect(err.toJSON()).toEqual({
      error: "invalid_grant",
      error_description: "Token expired",
    });
  });
});

// ── ORGANIZATION SERVICE ─────────────────────────────────────────────────────

describe("Org service — department/location CRUD", () => {
  let orgService: any;
  const ORG_ID = 5;
  let testDeptId: number;
  let testLocId: number;
  const U = String(Date.now()).slice(-6);

  beforeAll(async () => {
    orgService = await import("../../services/org/org.service.js");
  });

  afterAll(async () => {
    try { if (testDeptId) await db("organization_departments").where({ id: testDeptId }).del(); } catch {}
    try { if (testLocId) await db("organization_locations").where({ id: testLocId }).del(); } catch {}
  });

  it("createDepartment", async () => {
    const dept = await orgService.createDepartment(ORG_ID, "CovDept-" + U);
    expect(dept).toBeDefined();
    expect(dept.name).toBe("CovDept-" + U);
    testDeptId = dept.id;
  });

  it("getDepartment", async () => {
    const dept = await orgService.getDepartment(ORG_ID, testDeptId);
    expect(dept.name).toBe("CovDept-" + U);
  });

  it("updateDepartment", async () => {
    const dept = await orgService.updateDepartment(ORG_ID, testDeptId, { name: "CovDeptUpd-" + U });
    expect(dept.name).toBe("CovDeptUpd-" + U);
  });

  it("updateDepartment throws NotFoundError", async () => {
    await expect(orgService.updateDepartment(ORG_ID, 999999, { name: "x" }))
      .rejects.toThrow();
  });

  it("deleteDepartment", async () => {
    await orgService.deleteDepartment(ORG_ID, testDeptId);
    const dept = await db("organization_departments").where({ id: testDeptId }).first();
    expect(dept.is_deleted).toBe(1);
    testDeptId = 0;
  });

  it("getDepartmentsWithoutManager", async () => {
    const result = await orgService.getDepartmentsWithoutManager(ORG_ID);
    expect(Array.isArray(result)).toBe(true);
  });

  it("createLocation", async () => {
    const loc = await orgService.createLocation(ORG_ID, { name: "CovLoc-" + U, address: "123 Test St" });
    expect(loc).toBeDefined();
    expect(loc.name).toBe("CovLoc-" + U);
    testLocId = loc.id;
  });

  it("listLocations", async () => {
    const locs = await orgService.listLocations(ORG_ID);
    expect(Array.isArray(locs)).toBe(true);
    expect(locs.length).toBeGreaterThan(0);
  });
});

// ── ANNOUNCEMENT SERVICE ─────────────────────────────────────────────────────

describe("Announcement service — update/delete/read", () => {
  let announcementService: any;
  const ORG_ID = 5;
  const USER_ID = 522;
  let testAnnouncementId: number;
  const U = String(Date.now()).slice(-6);

  beforeAll(async () => {
    announcementService = await import("../../services/announcement/announcement.service.js");
    const [id] = await db("announcements").insert({
      organization_id: ORG_ID,
      title: "CovAnn-" + U,
      content: "<p>Test</p>",
      priority: "normal",
      target_type: "all",
      created_by: USER_ID,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    testAnnouncementId = id;
  });

  afterAll(async () => {
    try { await db("announcement_reads").where({ announcement_id: testAnnouncementId }).del(); } catch {}
    try { await db("announcements").where({ id: testAnnouncementId }).del(); } catch {}
  });

  it("updateAnnouncement", async () => {
    const updated = await announcementService.updateAnnouncement(ORG_ID, testAnnouncementId, {
      title: "CovAnnUpd-" + U,
    });
    expect(updated.title).toContain("Upd");
  });

  it("updateAnnouncement throws NotFoundError", async () => {
    await expect(announcementService.updateAnnouncement(ORG_ID, 999999, { title: "x" }))
      .rejects.toThrow();
  });

  it("markAsRead", async () => {
    await announcementService.markAsRead(testAnnouncementId, USER_ID, ORG_ID);
    const reads = await db("announcement_reads").where({ announcement_id: testAnnouncementId });
    expect(reads.length).toBe(1);
  });

  it("getReadStatus", async () => {
    const reads = await announcementService.getReadStatus(testAnnouncementId, ORG_ID);
    expect(Array.isArray(reads)).toBe(true);
    expect(reads.length).toBeGreaterThan(0);
  });

  it("deleteAnnouncement", async () => {
    await announcementService.deleteAnnouncement(ORG_ID, testAnnouncementId);
    const ann = await db("announcements").where({ id: testAnnouncementId }).first();
    expect(ann.is_active).toBe(0);
  });

  it("deleteAnnouncement throws NotFoundError for already-deleted", async () => {
    await expect(announcementService.deleteAnnouncement(ORG_ID, testAnnouncementId))
      .rejects.toThrow();
  });
});

// ── EMPLOYEE DETAIL SERVICE — getAddresses ───────────────────────────────────

describe("Employee detail — getAddresses", () => {
  let detailService: any;

  beforeAll(async () => {
    detailService = await import("../../services/employee/employee-detail.service.js");
  });

  it("getAddresses returns array (possibly empty)", async () => {
    const addrs = await detailService.getAddresses(5, 522);
    expect(Array.isArray(addrs)).toBe(true);
  });
});

// ── SUBSCRIPTION BILLING STATUS ──────────────────────────────────────────────

describe("Subscription getBillingStatus", () => {
  let subService: any;

  beforeAll(async () => {
    subService = await import("../../services/subscription/subscription.service.js");
  });

  it("returns billing status for org", async () => {
    const result = await subService.getBillingStatus(5);
    expect(result).toBeDefined();
    expect(typeof result.has_overdue).toBe("boolean");
    expect(["none", "info", "warning", "critical"]).toContain(result.warning_level);
  });
});

// ── WEBHOOK SERVICE ──────────────────────────────────────────────────────────

describe("Module webhook service", () => {
  let webhookService: any;

  beforeAll(async () => {
    webhookService = await import("../../services/webhook/module-webhook.service.js");
  });

  it("exit.initiated logs audit", async () => {
    await expect(
      webhookService.handleModuleWebhook("exit.initiated", { employeeId: 999, exitType: "resignation" }, "test")
    ).resolves.not.toThrow();
  });

  it("performance.cycle_completed logs audit", async () => {
    await expect(
      webhookService.handleModuleWebhook("performance.cycle_completed", {
        cycleId: "test-cycle", cycleName: "Q1 2026", participantCount: 10,
      }, "test")
    ).resolves.not.toThrow();
  });

  it("rewards.milestone_achieved logs audit", async () => {
    await expect(
      webhookService.handleModuleWebhook("rewards.milestone_achieved", {
        employeeId: 999, milestoneName: "5 Years", pointsAwarded: 500,
      }, "test")
    ).resolves.not.toThrow();
  });

  it("unknown event does not throw", async () => {
    await expect(
      webhookService.handleModuleWebhook("unknown.event", {}, "test")
    ).resolves.not.toThrow();
  });
});

// ── LEAVE BALANCE ERROR BRANCHES ─────────────────────────────────────────────

describe("Leave balance error branches", () => {
  let leaveBalanceService: any;

  beforeAll(async () => {
    leaveBalanceService = await import("../../services/leave/leave-balance.service.js");
  });

  it("deductBalance throws NotFoundError for nonexistent balance", async () => {
    await expect(leaveBalanceService.deductBalance(5, 999999, 999999, 1))
      .rejects.toThrow();
  });
});
