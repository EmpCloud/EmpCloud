/**
 * Pure coverage tests - exercise code paths via pure functions and utilities.
 */
import { describe, it, expect, vi } from "vitest";

// ===== JWT parseExpiry =====
import { parseExpiry } from "../../services/oauth/jwt.service.js";

describe("JWT parseExpiry", () => {
  it("parses seconds", () => { expect(parseExpiry("30s")).toBe(30); });
  it("parses minutes", () => { expect(parseExpiry("10m")).toBe(600); });
  it("parses hours", () => { expect(parseExpiry("1h")).toBe(3600); });
  it("parses days", () => { expect(parseExpiry("7d")).toBe(604800); });
  it("returns number for numeric string", () => { expect(parseExpiry("3600")).toBe(3600); });
});

// ===== Payroll Rules =====
import {
  calculateEmployeePF, calculateEmployerPF,
  calculateEmployeeESI, calculateEmployerESI,
  calculateGratuity, computeCTC, sumComponents,
  validateSalaryStructure, calculateShiftDurationMinutes,
  PF_BASIC_CAP, ESI_GROSS_THRESHOLD,
} from "../../utils/payroll-rules.js";

describe("Payroll Rules", () => {
  it("calculateEmployeePF with normal basic", () => {
    expect(calculateEmployeePF(15000)).toBe(1800);
  });
  it("calculateEmployeePF caps at PF_BASIC_CAP", () => {
    expect(calculateEmployeePF(50000)).toBe(Math.round(PF_BASIC_CAP * 0.12));
  });
  it("calculateEmployeePF zero", () => {
    expect(calculateEmployeePF(0)).toBe(0);
  });
  it("calculateEmployerPF", () => {
    expect(calculateEmployerPF(15000)).toBe(1800);
  });
  it("calculateEmployeeESI below threshold", () => {
    expect(calculateEmployeeESI(15000)).toBeGreaterThan(0);
  });
  it("calculateEmployeeESI above threshold", () => {
    expect(calculateEmployeeESI(25000)).toBe(0);
  });
  it("calculateEmployerESI below threshold", () => {
    expect(calculateEmployerESI(15000)).toBeGreaterThan(0);
  });
  it("calculateEmployerESI above threshold", () => {
    expect(calculateEmployerESI(25000)).toBe(0);
  });
  it("calculateGratuity", () => {
    expect(calculateGratuity(30000)).toBeGreaterThan(0);
  });
  it("computeCTC", () => {
    expect(computeCTC(50000, 25000)).toBeGreaterThan(50000);
  });
  it("sumComponents adds up", () => {
    const r = sumComponents([
      { name: "Basic", amount: 25000 },
      { name: "HRA", amount: 10000 },
    ]);
    expect(r).toBe(35000);
  });
  it("validateSalaryStructure valid", () => {
    const r = validateSalaryStructure({
      basic: 25000, hra: 10000, special: 5000,
      gross: 40000, ctc: 50000,
      components: [{ name: "Basic", amount: 25000, type: "earning" }],
    });
    expect(r.valid).toBe(true);
  });
  it("validateSalaryStructure invalid (basic > gross)", () => {
    const r = validateSalaryStructure({
      basic: 60000, hra: 10000, special: 5000,
      gross: 40000, ctc: 50000,
      components: [],
    });
    expect(r.valid).toBe(false);
  });
  it("calculateShiftDurationMinutes", () => {
    expect(calculateShiftDurationMinutes("09:00", "18:00")).toBe(540);
  });
  it("calculateShiftDurationMinutes overnight", () => {
    expect(calculateShiftDurationMinutes("22:00", "06:00")).toBe(480);
  });
});

// ===== Working Days =====
import { calculateWorkingDays } from "../../utils/working-days.js";

describe("Working Days", () => {
  it("counts working days Mon-Fri", () => {
    const r = calculateWorkingDays(new Date("2026-04-06"), new Date("2026-04-10"), []);
    expect(r).toBe(5);
  });
  it("excludes weekends", () => {
    const r = calculateWorkingDays(new Date("2026-04-04"), new Date("2026-04-05"), []);
    expect(r).toBe(0);
  });
  it("excludes holidays", () => {
    const r = calculateWorkingDays(new Date("2026-04-06"), new Date("2026-04-06"), [new Date("2026-04-06")]);
    expect(r).toBe(0);
  });
  it("handles same day (working)", () => {
    const r = calculateWorkingDays(new Date("2026-04-06"), new Date("2026-04-06"), []);
    expect(r).toBe(1);
  });
});

// ===== FnF Settlement =====
import { calculateFnF } from "../../utils/fnf-settlement.js";

describe("FnF Settlement", () => {
  it("calculates full settlement", () => {
    const r = calculateFnF({
      basicMonthly: 30000,
      grossMonthly: 50000,
      yearsOfService: 6,
      pendingLeaveDays: 10,
      noticePeriodDays: 30,
      noticeDaysServed: 15,
      pendingReimbursements: 5000,
      pendingBonus: 10000,
      loanRecovery: 2000,
      otherRecovery: 0,
    });
    expect(r.gratuity).toBeGreaterThan(0);
    expect(r.netPayable).toBeGreaterThan(0);
  });

  it("zero gratuity under 5 years", () => {
    const r = calculateFnF({
      basicMonthly: 30000,
      grossMonthly: 50000,
      yearsOfService: 3,
      pendingLeaveDays: 0,
      noticePeriodDays: 0,
      noticeDaysServed: 0,
      pendingReimbursements: 0,
      pendingBonus: 0,
      loanRecovery: 0,
      otherRecovery: 0,
    });
    expect(r.gratuity).toBe(0);
  });
});

// ===== Sanitize HTML =====
import { sanitizeHtml } from "../../utils/sanitize-html.js";

describe("Sanitize HTML", () => {
  it("strips script tags", () => {
    const r = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(r).not.toContain("script");
  });
  it("allows safe tags", () => {
    const r = sanitizeHtml("<p><strong>Bold</strong></p>");
    expect(r).toContain("strong");
  });
  it("handles empty", () => {
    expect(sanitizeHtml("")).toBe("");
  });
  it("strips event handlers", () => {
    const r = sanitizeHtml('<div onmouseover="alert(1)">test</div>');
    expect(r).not.toContain("onmouseover");
  });
});

// ===== Error classes =====
import { AppError, OAuthError, ValidationError } from "../../utils/errors.js";

describe("Error classes extra", () => {
  it("AppError custom code and details", () => {
    const e = new AppError("test", 418, "TEAPOT", { key: "val" });
    expect(e.statusCode).toBe(418);
    expect(e.details).toEqual({ key: "val" });
  });
  it("OAuthError with 500", () => {
    const e = new OAuthError("server_error", "broke", 500);
    expect(e.statusCode).toBe(500);
  });
  it("ValidationError with details", () => {
    const e = new ValidationError("bad", [{ field: "x" }]);
    expect(e.details).toHaveLength(1);
  });
});

// ===== Pricing =====
import { getPricePerSeat } from "../../services/subscription/pricing.js";

vi.mock("../../db/connection", () => {
  const chain: any = {};
  ["select","where","first","join","leftJoin","orderBy"].forEach(m => { chain[m] = vi.fn(() => chain); });
  chain.first = vi.fn(() => Promise.resolve({ country: "IN" }));
  const db: any = vi.fn(() => chain);
  db.raw = vi.fn();
  db.transaction = vi.fn(async (cb: any) => cb(db));
  return { getDB: vi.fn(() => db), initDB: vi.fn() };
});

describe("Pricing", () => {
  it("free tier is 0", () => { expect(getPricePerSeat("free", "INR")).toBe(0); });
  it("INR starter", () => { expect(getPricePerSeat("starter", "INR")).toBeGreaterThan(0); });
  it("USD pro", () => { expect(getPricePerSeat("pro", "USD")).toBeGreaterThan(0); });
  it("GBP starter", () => { expect(getPricePerSeat("starter", "GBP")).toBeGreaterThan(0); });
  it("EUR starter", () => { expect(getPricePerSeat("starter", "EUR")).toBeGreaterThan(0); });
});

// ===== Import parseCSV =====
import { parseCSV } from "../../services/import/import.service.js";

describe("Import parseCSV", () => {
  it("parses CSV", () => {
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
});
