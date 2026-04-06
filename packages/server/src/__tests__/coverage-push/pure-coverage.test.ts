/**
 * Pure coverage tests - exercise code paths that don't require complex DB mocking.
 * Focus on: validation logic, error paths, utility functions, config.
 */
import { describe, it, expect, vi } from "vitest";

// ===== Utils =====
import { parseExpiry } from "../../services/oauth/jwt.service.js";

describe("JWT parseExpiry", () => {
  it("parses seconds", () => { expect(parseExpiry("30s")).toBe(30); });
  it("parses minutes", () => { expect(parseExpiry("10m")).toBe(600); });
  it("parses hours", () => { expect(parseExpiry("1h")).toBe(3600); });
  it("parses days", () => { expect(parseExpiry("7d")).toBe(604800); });
  it("defaults to 3600 for unknown", () => { expect(parseExpiry("xyz")).toBe(3600); });
});

// ===== Payroll Rules (pure functions) =====
import {
  calculatePF, calculateESI, calculatePT, calculateTDS,
  calculateGratuity, calculateOvertime, calculateLeaveEncashment,
  calculateCTC, calculateNetPay,
} from "../../utils/payroll-rules.js";

describe("Payroll Rules - additional paths", () => {
  it("calculatePF with high basic", () => {
    const r = calculatePF({ basic: 30000 });
    expect(r.employee).toBeGreaterThan(0);
    expect(r.employer).toBeGreaterThan(0);
  });

  it("calculatePF with zero basic", () => {
    const r = calculatePF({ basic: 0 });
    expect(r.employee).toBe(0);
  });

  it("calculateESI above threshold", () => {
    const r = calculateESI({ gross: 25000 });
    expect(r.employee).toBe(0); // Above 21k threshold
  });

  it("calculateESI below threshold", () => {
    const r = calculateESI({ gross: 15000 });
    expect(r.employee).toBeGreaterThan(0);
  });

  it("calculatePT for different states", () => {
    expect(calculatePT({ gross: 20000, state: "MH" })).toBeGreaterThan(0);
    expect(calculatePT({ gross: 20000, state: "KA" })).toBeGreaterThan(0);
    expect(calculatePT({ gross: 20000, state: "TN" })).toBeGreaterThan(0);
    expect(calculatePT({ gross: 5000, state: "MH" })).toBe(0);
  });

  it("calculateTDS for different regimes", () => {
    const old = calculateTDS({ annualIncome: 1200000, regime: "old", deductions80C: 150000 });
    expect(old).toBeGreaterThan(0);
    const newR = calculateTDS({ annualIncome: 1200000, regime: "new" });
    expect(newR).toBeGreaterThan(0);
  });

  it("calculateTDS below exempt limit", () => {
    expect(calculateTDS({ annualIncome: 200000, regime: "new" })).toBe(0);
  });

  it("calculateGratuity", () => {
    const r = calculateGratuity({ lastBasic: 30000, yearsOfService: 10 });
    expect(r).toBeGreaterThan(0);
  });

  it("calculateGratuity under 5 years", () => {
    const r = calculateGratuity({ lastBasic: 30000, yearsOfService: 3 });
    expect(r).toBe(0);
  });

  it("calculateOvertime", () => {
    const r = calculateOvertime({ hourlyRate: 200, overtimeHours: 5, multiplier: 2 });
    expect(r).toBe(2000);
  });

  it("calculateLeaveEncashment", () => {
    const r = calculateLeaveEncashment({ basic: 30000, leaveDays: 10 });
    expect(r).toBeGreaterThan(0);
  });

  it("calculateCTC", () => {
    const r = calculateCTC({ basic: 30000, hra: 15000, special: 5000, pf_employer: 1800, esi_employer: 500, bonus: 2500 });
    expect(r).toBeGreaterThan(0);
  });

  it("calculateNetPay", () => {
    const r = calculateNetPay({ gross: 50000, pf_employee: 1800, esi_employee: 375, pt: 200, tds: 3000 });
    expect(r).toBeLessThan(50000);
    expect(r).toBeGreaterThan(0);
  });
});

// ===== Working Days utility =====
import { getWorkingDaysBetween, isWeekend, isHoliday } from "../../utils/working-days.js";

describe("Working Days utility - additional paths", () => {
  it("counts working days in a week", () => {
    const r = getWorkingDaysBetween("2026-04-06", "2026-04-10", []); // Mon-Fri
    expect(r).toBe(5);
  });

  it("excludes weekends", () => {
    const r = getWorkingDaysBetween("2026-04-04", "2026-04-05", []); // Sat-Sun
    expect(r).toBe(0);
  });

  it("excludes holidays", () => {
    const r = getWorkingDaysBetween("2026-04-06", "2026-04-06", ["2026-04-06"]);
    expect(r).toBe(0);
  });

  it("isWeekend returns true for Saturday", () => {
    expect(isWeekend(new Date("2026-04-04"))).toBe(true);
  });

  it("isWeekend returns false for Monday", () => {
    expect(isWeekend(new Date("2026-04-06"))).toBe(false);
  });
});

// ===== FnF Settlement utility =====
import { calculateFnFSettlement } from "../../utils/fnf-settlement.js";

describe("FnF Settlement", () => {
  it("calculates settlement with all components", () => {
    const r = calculateFnFSettlement({
      lastMonthBasic: 30000,
      lastMonthGross: 50000,
      pendingLeaveDays: 10,
      noticePeriodDays: 30,
      servedNoticeDays: 15,
      yearsOfService: 6,
      pendingReimbursements: 5000,
      pendingBonus: 10000,
      recoveries: 2000,
    });
    expect(r.leaveEncashment).toBeGreaterThan(0);
    expect(r.noticePeriodRecovery).not.toBe(0);
    expect(r.gratuity).toBeGreaterThan(0);
    expect(r.totalPayable).toBeGreaterThan(0);
  });

  it("calculates with no gratuity (under 5 years)", () => {
    const r = calculateFnFSettlement({
      lastMonthBasic: 30000,
      lastMonthGross: 50000,
      pendingLeaveDays: 0,
      noticePeriodDays: 30,
      servedNoticeDays: 30,
      yearsOfService: 3,
      pendingReimbursements: 0,
      pendingBonus: 0,
      recoveries: 0,
    });
    expect(r.gratuity).toBe(0);
  });
});

// ===== Sanitize HTML utility =====
import { sanitizeHtml } from "../../utils/sanitize-html.js";

describe("Sanitize HTML - additional paths", () => {
  it("strips script tags", () => {
    const r = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(r).not.toContain("script");
    expect(r).toContain("Hello");
  });

  it("allows safe HTML", () => {
    const r = sanitizeHtml("<p><strong>Bold</strong> and <em>italic</em></p>");
    expect(r).toContain("strong");
    expect(r).toContain("em");
  });

  it("handles empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("strips event handlers", () => {
    const r = sanitizeHtml('<div onmouseover="alert(1)">test</div>');
    expect(r).not.toContain("onmouseover");
  });
});

// ===== Error classes - edge cases =====
import { AppError, ValidationError, NotFoundError, ForbiddenError, OAuthError } from "../../utils/errors.js";

describe("Error classes - edge cases", () => {
  it("AppError with all params", () => {
    const e = new AppError("test", 418, "TEAPOT", { key: "val" });
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe("TEAPOT");
    expect(e.details).toEqual({ key: "val" });
  });

  it("OAuthError with custom status", () => {
    const e = new OAuthError("server_error", "Something broke", 500);
    expect(e.statusCode).toBe(500);
    const json = e.toJSON();
    expect(json.error).toBe("server_error");
  });

  it("ValidationError with details array", () => {
    const e = new ValidationError("bad input", [{ field: "email", message: "required" }]);
    expect(e.details).toHaveLength(1);
  });
});

// ===== Generate Keys utility =====
import { generateKeyPair } from "../../utils/generate-keys.js";

describe("Generate Keys", () => {
  it("generates RSA key pair", () => {
    const { publicKey, privateKey } = generateKeyPair();
    expect(publicKey).toContain("PUBLIC KEY");
    expect(privateKey).toContain("PRIVATE KEY");
  });
});

// ===== Pricing utility =====
import { getPricePerSeat, getOrgCurrency } from "../../services/subscription/pricing.js";

vi.mock("../../db/connection", () => {
  const chain: any = {};
  const methods = ["select","where","whereIn","whereNull","first","insert","update","delete","orderBy","join","leftJoin"];
  methods.forEach(m => { chain[m] = vi.fn(() => chain); });
  chain.first = vi.fn(() => Promise.resolve({ country: "IN" }));
  const db: any = vi.fn(() => chain);
  db.raw = vi.fn();
  db.transaction = vi.fn(async (cb: any) => cb(db));
  db._chain = chain;
  return { getDB: vi.fn(() => db), initDB: vi.fn() };
});

describe("Pricing", () => {
  it("returns INR price for free tier", () => {
    expect(getPricePerSeat("free", "INR")).toBe(0);
  });

  it("returns INR price for starter", () => {
    const p = getPricePerSeat("starter", "INR");
    expect(p).toBeGreaterThan(0);
  });

  it("returns USD price for pro", () => {
    const p = getPricePerSeat("pro", "USD");
    expect(p).toBeGreaterThan(0);
  });

  it("returns GBP price", () => {
    const p = getPricePerSeat("starter", "GBP");
    expect(p).toBeGreaterThan(0);
  });

  it("returns EUR price", () => {
    const p = getPricePerSeat("starter", "EUR");
    expect(p).toBeGreaterThan(0);
  });

  it("getOrgCurrency returns currency from org country", async () => {
    const c = await getOrgCurrency(1);
    expect(c).toBeTruthy();
  });
});

// ===== Import service (parseCSV is pure) =====
import { parseCSV } from "../../services/import/import.service.js";

describe("Import Service - parseCSV", () => {
  it("parses CSV with headers", () => {
    const csv = Buffer.from("first_name,last_name,email\nJohn,Doe,john@test.com\nJane,Doe,jane@test.com");
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].first_name).toBe("John");
  });

  it("handles empty CSV", () => {
    const csv = Buffer.from("first_name,last_name,email\n");
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(0);
  });

  it("trims whitespace", () => {
    const csv = Buffer.from("first_name,last_name,email\n  John , Doe , john@test.com ");
    const rows = parseCSV(csv);
    expect(rows[0].first_name).toBe("John");
    expect(rows[0].email).toBe("john@test.com");
  });
});
