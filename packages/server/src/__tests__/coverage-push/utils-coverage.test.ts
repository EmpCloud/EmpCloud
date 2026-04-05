// =============================================================================
// Coverage Push: Pure utility functions (no DB needed)
// =============================================================================

import { describe, it, expect } from "vitest";

// --- Payroll Rules ---
import {
  calculateEmployeePF,
  calculateEmployerPF,
  calculateEmployeeESI,
  calculateEmployerESI,
  calculateGratuity,
  computeCTC,
  sumComponents,
  validateSalaryStructure,
  calculateShiftDurationMinutes,
  calculateOvertime,
  PF_BASIC_CAP,
  ESI_GROSS_THRESHOLD,
  type SalaryStructure,
} from "../../utils/payroll-rules.js";

// --- F&F Settlement ---
import {
  calculateFnF,
  calculateGratuityForFnF,
  calculateLeaveEncashmentRate,
  GRATUITY_MAX,
} from "../../utils/fnf-settlement.js";

// --- Working Days ---
import { calculateWorkingDays } from "../../utils/working-days.js";

// --- Sanitize HTML ---
import { sanitizeHtml } from "../../utils/sanitize-html.js";

// --- Errors ---
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  OAuthError,
} from "../../utils/errors.js";

// --- Crypto ---
import {
  hashPassword,
  verifyPassword,
  randomHex,
  randomBase64Url,
  sha256,
  sha256Base64Url,
  verifyPKCE,
  generateClientId,
  generateClientSecret,
  hashToken,
  timingSafeEqual,
} from "../../utils/crypto.js";

// --- Params ---
import { param, paramInt } from "../../utils/params.js";

// ============================================================================
// PAYROLL RULES
// ============================================================================

describe("Payroll Rules — PF Calculation", () => {
  it("calculateEmployeePF: basic below cap", () => {
    expect(calculateEmployeePF(10000)).toBe(Math.round(10000 * 0.12));
  });

  it("calculateEmployeePF: basic at cap", () => {
    expect(calculateEmployeePF(PF_BASIC_CAP)).toBe(Math.round(PF_BASIC_CAP * 0.12));
  });

  it("calculateEmployeePF: basic above cap", () => {
    expect(calculateEmployeePF(50000)).toBe(Math.round(PF_BASIC_CAP * 0.12));
  });

  it("calculateEmployeePF: zero basic", () => {
    expect(calculateEmployeePF(0)).toBe(0);
  });

  it("calculateEmployerPF: below cap", () => {
    expect(calculateEmployerPF(10000)).toBe(Math.round(10000 * 0.12));
  });

  it("calculateEmployerPF: above cap", () => {
    expect(calculateEmployerPF(100000)).toBe(Math.round(PF_BASIC_CAP * 0.12));
  });
});

describe("Payroll Rules — ESI Calculation", () => {
  it("calculateEmployeeESI: gross below threshold", () => {
    expect(calculateEmployeeESI(20000)).toBe(Math.round(20000 * 0.0075));
  });

  it("calculateEmployeeESI: gross at threshold", () => {
    expect(calculateEmployeeESI(ESI_GROSS_THRESHOLD)).toBe(
      Math.round(ESI_GROSS_THRESHOLD * 0.0075),
    );
  });

  it("calculateEmployeeESI: gross above threshold returns 0", () => {
    expect(calculateEmployeeESI(25000)).toBe(0);
  });

  it("calculateEmployerESI: gross below threshold", () => {
    expect(calculateEmployerESI(20000)).toBe(Math.round(20000 * 0.0325));
  });

  it("calculateEmployerESI: gross above threshold returns 0", () => {
    expect(calculateEmployerESI(50000)).toBe(0);
  });
});

describe("Payroll Rules — Gratuity", () => {
  it("calculateGratuity: standard", () => {
    expect(calculateGratuity(10000)).toBe(Math.round(10000 * 0.0481));
  });

  it("calculateGratuity: zero basic", () => {
    expect(calculateGratuity(0)).toBe(0);
  });
});

describe("Payroll Rules — CTC", () => {
  it("computeCTC: correct formula", () => {
    const gross = 50000;
    const basic = 25000;
    const expected =
      gross +
      calculateEmployerPF(basic) +
      calculateEmployerESI(gross) +
      calculateGratuity(basic);
    expect(computeCTC(gross, basic)).toBe(expected);
  });
});

describe("Payroll Rules — sumComponents", () => {
  it("sums basic + hra + da + special", () => {
    expect(sumComponents(25000, 10000, 5000, 10000)).toBe(50000);
  });

  it("sums with other components", () => {
    const result = sumComponents(25000, 10000, 5000, 5000, [
      { name: "Transport", amount: 2000 },
      { name: "Food", amount: 3000 },
    ]);
    expect(result).toBe(50000);
  });

  it("sums with empty other components", () => {
    expect(sumComponents(10000, 5000, 2000, 3000, [])).toBe(20000);
  });
});

describe("Payroll Rules — validateSalaryStructure", () => {
  it("valid salary structure passes", () => {
    const basic = 25000;
    const hra = 10000;
    const da = 5000;
    const special = 10000;
    const gross = basic + hra + da + special;
    const employerPF = calculateEmployerPF(basic);
    const employerESI = calculateEmployerESI(gross);
    const gratuity = calculateGratuity(basic);

    const structure: SalaryStructure = {
      basic,
      hra,
      da,
      special_allowance: special,
      gross,
      employer_pf: employerPF,
      employer_esi: employerESI,
      gratuity,
      ctc: gross + employerPF + employerESI + gratuity,
    };

    const result = validateSalaryStructure(structure);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects component sum mismatch", () => {
    const structure: SalaryStructure = {
      basic: 25000,
      hra: 10000,
      da: 5000,
      special_allowance: 10000,
      gross: 99999, // wrong
      employer_pf: 1800,
      employer_esi: 0,
      gratuity: 1203,
      ctc: 99999 + 1800 + 1203,
    };
    const result = validateSalaryStructure(structure);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("detects ESI should be 0 above threshold", () => {
    const basic = 25000;
    const gross = 50000; // above ESI threshold
    const structure: SalaryStructure = {
      basic,
      hra: 10000,
      da: 5000,
      special_allowance: 10000,
      gross,
      employer_pf: calculateEmployerPF(basic),
      employer_esi: 500, // should be 0
      gratuity: calculateGratuity(basic),
      ctc: gross + calculateEmployerPF(basic) + 500 + calculateGratuity(basic),
    };
    const result = validateSalaryStructure(structure);
    expect(result.valid).toBe(false);
  });

  it("returns computed values", () => {
    const basic = 10000;
    const gross = 20000;
    const structure: SalaryStructure = {
      basic,
      hra: 5000,
      da: 2000,
      special_allowance: 3000,
      gross,
      employer_pf: calculateEmployerPF(basic),
      employer_esi: calculateEmployerESI(gross),
      gratuity: calculateGratuity(basic),
      ctc: computeCTC(gross, basic),
    };
    const result = validateSalaryStructure(structure);
    expect(result.computed.employee_pf).toBeDefined();
    expect(result.computed.employer_pf).toBeDefined();
    expect(result.computed.expected_ctc).toBeDefined();
  });
});

describe("Payroll Rules — Shift Duration", () => {
  it("normal day shift", () => {
    expect(calculateShiftDurationMinutes("09:00", "18:00")).toBe(540);
  });

  it("night shift crossing midnight", () => {
    expect(calculateShiftDurationMinutes("22:00", "06:00", true)).toBe(480);
  });

  it("auto-detects night shift when end <= start", () => {
    expect(calculateShiftDurationMinutes("22:00", "06:00")).toBe(480);
  });

  it("same start and end = 24 hours for night shift", () => {
    expect(calculateShiftDurationMinutes("09:00", "09:00", false)).toBe(1440);
  });
});

describe("Payroll Rules — Overtime", () => {
  it("no overtime when checking out on time", () => {
    const checkIn = new Date("2026-04-01T09:00:00");
    const checkOut = new Date("2026-04-01T18:00:00");
    const result = calculateOvertime(checkIn, checkOut, "09:00", "18:00");
    expect(result.overtime_minutes).toBe(0);
  });

  it("overtime when checking out late", () => {
    const checkIn = new Date("2026-04-01T09:00:00");
    const checkOut = new Date("2026-04-01T20:00:00");
    const result = calculateOvertime(checkIn, checkOut, "09:00", "18:00");
    expect(result.overtime_minutes).toBe(120);
  });

  it("no overtime when worked less than shift duration", () => {
    const checkIn = new Date("2026-04-01T09:00:00");
    const checkOut = new Date("2026-04-01T14:00:00"); // 5 hours of 9h shift
    const result = calculateOvertime(checkIn, checkOut, "09:00", "18:00");
    expect(result.overtime_minutes).toBe(0);
  });

  it("night shift overtime", () => {
    const checkIn = new Date("2026-04-01T22:00:00");
    const checkOut = new Date("2026-04-02T08:00:00"); // 2h after 06:00 end
    const result = calculateOvertime(checkIn, checkOut, "22:00", "06:00", true);
    expect(result.overtime_minutes).toBe(120);
  });

  it("break minutes reduce required shift time for OT eligibility", () => {
    const checkIn = new Date("2026-04-01T09:00:00");
    const checkOut = new Date("2026-04-01T19:00:00"); // 10h worked, shift is 9h - 1h break = 8h net
    const result = calculateOvertime(checkIn, checkOut, "09:00", "18:00", false, 60);
    expect(result.overtime_minutes).toBe(60);
  });

  it("returns total_worked_minutes and shift_duration_minutes", () => {
    const checkIn = new Date("2026-04-01T09:00:00");
    const checkOut = new Date("2026-04-01T18:00:00");
    const result = calculateOvertime(checkIn, checkOut, "09:00", "18:00");
    expect(result.total_worked_minutes).toBe(540);
    expect(result.shift_duration_minutes).toBe(540);
  });
});

// ============================================================================
// F&F SETTLEMENT
// ============================================================================

describe("F&F Settlement", () => {
  it("calculateFnF: basic case", () => {
    const result = calculateFnF({
      pendingSalary: 50000,
      leaveBalance: 10,
      leaveEncashmentRate: 2000,
    });
    expect(result.pendingSalary).toBe(50000);
    expect(result.leaveEncashment).toBe(20000);
    expect(result.gratuity).toBe(0);
    expect(result.bonus).toBe(0);
    expect(result.totalEarnings).toBe(70000);
    expect(result.totalDeductions).toBe(0);
    expect(result.netSettlement).toBe(70000);
  });

  it("calculateFnF: with gratuity and bonus", () => {
    const result = calculateFnF({
      pendingSalary: 50000,
      leaveBalance: 5,
      leaveEncashmentRate: 2000,
      gratuityAmount: 10000,
      bonusAmount: 5000,
    });
    expect(result.totalEarnings).toBe(50000 + 10000 + 10000 + 5000);
  });

  it("calculateFnF: with recoveries and notice period", () => {
    const result = calculateFnF({
      pendingSalary: 50000,
      leaveBalance: 0,
      leaveEncashmentRate: 0,
      noticePeriodRecovery: 30000,
      recoveries: [
        { description: "Laptop", amount: 5000 },
        { description: "Loan", amount: 10000 },
      ],
    });
    expect(result.totalDeductions).toBe(45000);
    expect(result.netSettlement).toBe(50000 - 45000);
  });

  it("calculateFnF: negative settlement when deductions exceed earnings", () => {
    const result = calculateFnF({
      pendingSalary: 10000,
      leaveBalance: 0,
      leaveEncashmentRate: 0,
      noticePeriodRecovery: 50000,
    });
    expect(result.netSettlement).toBeLessThan(0);
  });

  it("calculateGratuityForFnF: eligible (>= 5 years)", () => {
    const result = calculateGratuityForFnF(50000, 6);
    expect(result).toBe(Math.round((50000 * 15 * 6) / 26));
  });

  it("calculateGratuityForFnF: not eligible (< 5 years)", () => {
    expect(calculateGratuityForFnF(50000, 4)).toBe(0);
  });

  it("calculateGratuityForFnF: capped at max", () => {
    const result = calculateGratuityForFnF(5000000, 30);
    expect(result).toBe(GRATUITY_MAX);
  });

  it("calculateGratuityForFnF: custom min years", () => {
    expect(calculateGratuityForFnF(50000, 2, 3)).toBe(0);
    expect(calculateGratuityForFnF(50000, 3, 3)).toBeGreaterThan(0);
  });

  it("calculateLeaveEncashmentRate: default 26 days", () => {
    expect(calculateLeaveEncashmentRate(52000)).toBe(2000);
  });

  it("calculateLeaveEncashmentRate: custom days", () => {
    expect(calculateLeaveEncashmentRate(50000, 25)).toBe(2000);
  });
});

// ============================================================================
// WORKING DAYS
// ============================================================================

describe("Working Days Calculator", () => {
  it("counts weekdays correctly", () => {
    // Mon Apr 7 to Fri Apr 11 = 5 working days
    expect(calculateWorkingDays("2026-04-06", "2026-04-10")).toBe(5);
  });

  it("excludes weekends", () => {
    // Full week Mon-Sun = 5 working days
    expect(calculateWorkingDays("2026-04-06", "2026-04-12")).toBe(5);
  });

  it("excludes holidays", () => {
    expect(
      calculateWorkingDays("2026-04-06", "2026-04-10", ["2026-04-08"]),
    ).toBe(4);
  });

  it("returns 0 for reversed range", () => {
    expect(calculateWorkingDays("2026-04-10", "2026-04-06")).toBe(0);
  });

  it("single day weekday", () => {
    expect(calculateWorkingDays("2026-04-07", "2026-04-07")).toBe(1); // Tuesday
  });

  it("single day weekend", () => {
    expect(calculateWorkingDays("2026-04-05", "2026-04-05")).toBe(0); // Sunday
  });

  it("handles Date objects", () => {
    expect(
      calculateWorkingDays(
        new Date("2026-04-06"),
        new Date("2026-04-10"),
      ),
    ).toBe(5);
  });

  it("handles holiday as Date objects", () => {
    expect(
      calculateWorkingDays("2026-04-06", "2026-04-10", [
        new Date("2026-04-07"),
      ]),
    ).toBe(4);
  });
});

// ============================================================================
// SANITIZE HTML
// ============================================================================

describe("Sanitize HTML", () => {
  it("strips script tags", () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).toBe("");
  });

  it("strips iframe tags", () => {
    expect(sanitizeHtml('<iframe src="evil.com"></iframe>')).toBe("");
  });

  it("strips self-closing script tags", () => {
    expect(sanitizeHtml('<script src="evil.js"/>')).toBe("");
  });

  it("removes on* event handlers", () => {
    const result = sanitizeHtml('<div onclick="alert(1)">text</div>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("text");
  });

  it("removes javascript: URIs", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain("javascript");
  });

  it("strips svg tags", () => {
    expect(sanitizeHtml('<svg onload="alert(1)"></svg>')).toBe("");
  });

  it("strips object/embed/applet tags", () => {
    expect(sanitizeHtml('<object data="evil"></object>')).toBe("");
    expect(sanitizeHtml('<embed src="evil"/>')).toBe("");
    expect(sanitizeHtml('<applet></applet>')).toBe("");
  });

  it("preserves safe HTML", () => {
    const safe = '<p>Hello <strong>world</strong></p>';
    expect(sanitizeHtml(safe)).toBe(safe);
  });

  it("returns empty/falsy input as-is", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null as any)).toBe(null);
    expect(sanitizeHtml(undefined as any)).toBe(undefined);
  });

  it("strips form tags", () => {
    expect(sanitizeHtml('<form action="/steal"><input></form>')).toBe(
      "<input>",
    );
  });

  it("strips link/meta/base tags", () => {
    expect(sanitizeHtml('<link rel="stylesheet" href="evil.css">')).toBe("");
    expect(sanitizeHtml('<meta http-equiv="refresh">')).toBe("");
    expect(sanitizeHtml('<base href="evil.com">')).toBe("");
  });

  it("case insensitive tag removal", () => {
    expect(sanitizeHtml('<SCRIPT>evil</SCRIPT>')).toBe("");
    expect(sanitizeHtml('<Script>evil</Script>')).toBe("");
  });

  it("removes vbscript URIs", () => {
    const result = sanitizeHtml('<a href="vbscript:evil">link</a>');
    expect(result).not.toContain("vbscript");
  });

  it("removes data: URIs in src", () => {
    const result = sanitizeHtml('<img src="data:text/html,evil">');
    expect(result).not.toContain("data:");
  });
});

// ============================================================================
// ERROR CLASSES
// ============================================================================

describe("Error Classes", () => {
  it("AppError has statusCode, code, and details", () => {
    const err = new AppError("test", 500, "TEST", { foo: 1 });
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("TEST");
    expect(err.details).toEqual({ foo: 1 });
    expect(err.message).toBe("test");
    expect(err.name).toBe("AppError");
  });

  it("ValidationError is 400", () => {
    const err = new ValidationError("bad input", { field: "x" });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({ field: "x" });
  });

  it("UnauthorizedError is 401", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Unauthorized");
  });

  it("UnauthorizedError custom message", () => {
    const err = new UnauthorizedError("Token expired");
    expect(err.message).toBe("Token expired");
  });

  it("ForbiddenError is 403", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Forbidden");
  });

  it("ForbiddenError custom message", () => {
    const err = new ForbiddenError("No access");
    expect(err.message).toBe("No access");
  });

  it("NotFoundError is 404", () => {
    const err = new NotFoundError("User");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("User not found");
  });

  it("NotFoundError default message", () => {
    const err = new NotFoundError();
    expect(err.message).toBe("Resource not found");
  });

  it("ConflictError is 409", () => {
    const err = new ConflictError("Already exists");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });

  it("RateLimitError is 429", () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
  });

  it("RateLimitError custom message", () => {
    const err = new RateLimitError("Slow down");
    expect(err.message).toBe("Slow down");
  });

  it("OAuthError has errorType and toJSON", () => {
    const err = new OAuthError("invalid_grant", "Grant expired", 401);
    expect(err.statusCode).toBe(401);
    expect(err.errorType).toBe("invalid_grant");
    const json = err.toJSON();
    expect(json.error).toBe("invalid_grant");
    expect(json.error_description).toBe("Grant expired");
  });

  it("OAuthError default statusCode is 400", () => {
    const err = new OAuthError("invalid_request", "Bad request");
    expect(err.statusCode).toBe(400);
  });
});

// ============================================================================
// CRYPTO
// ============================================================================

describe("Crypto Utilities", () => {
  it("hashPassword and verifyPassword", async () => {
    const hash = await hashPassword("TestPassword123!");
    expect(hash).toBeTruthy();
    expect(hash).not.toBe("TestPassword123!");
    const valid = await verifyPassword("TestPassword123!", hash);
    expect(valid).toBe(true);
    const invalid = await verifyPassword("WrongPassword", hash);
    expect(invalid).toBe(false);
  });

  it("randomHex generates expected length", () => {
    const hex = randomHex(16);
    expect(hex).toHaveLength(32); // 16 bytes = 32 hex chars
  });

  it("randomHex default 32 bytes", () => {
    const hex = randomHex();
    expect(hex).toHaveLength(64);
  });

  it("randomBase64Url generates string", () => {
    const token = randomBase64Url(24);
    expect(token.length).toBeGreaterThan(0);
  });

  it("sha256 returns hex digest", () => {
    const hash = sha256("hello");
    expect(hash).toHaveLength(64);
    // Known SHA-256 of "hello"
    expect(hash).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("sha256Base64Url returns base64url digest", () => {
    const hash = sha256Base64Url("hello");
    expect(hash.length).toBeGreaterThan(0);
    // Should not contain + / =
    expect(hash).not.toMatch(/[+/=]/);
  });

  it("verifyPKCE: plain method", () => {
    expect(verifyPKCE("challenge", "challenge", "plain")).toBe(true);
    expect(verifyPKCE("wrong", "challenge", "plain")).toBe(false);
  });

  it("verifyPKCE: S256 method", () => {
    const verifier = "test-verifier-string";
    const challenge = sha256Base64Url(verifier);
    expect(verifyPKCE(verifier, challenge, "S256")).toBe(true);
    expect(verifyPKCE("wrong", challenge, "S256")).toBe(false);
  });

  it("generateClientId starts with ec_", () => {
    const id = generateClientId();
    expect(id).toMatch(/^ec_/);
  });

  it("generateClientSecret starts with ecs_", () => {
    const secret = generateClientSecret();
    expect(secret).toMatch(/^ecs_/);
  });

  it("hashToken returns sha256 hex", () => {
    const hash = hashToken("my-token");
    expect(hash).toHaveLength(64);
  });

  it("timingSafeEqual: same strings", () => {
    expect(timingSafeEqual("hello", "hello")).toBe(true);
  });

  it("timingSafeEqual: different strings", () => {
    expect(timingSafeEqual("hello", "world")).toBe(false);
  });

  it("timingSafeEqual: different lengths", () => {
    expect(timingSafeEqual("short", "longer-string")).toBe(false);
  });
});

// ============================================================================
// PARAMS
// ============================================================================

describe("Route Parameter Helpers", () => {
  it("param: string value", () => {
    expect(param("42")).toBe("42");
  });

  it("param: array value returns first", () => {
    expect(param(["42", "99"])).toBe("42");
  });

  it("param: undefined returns empty string", () => {
    expect(param(undefined)).toBe("");
  });

  it("paramInt: valid integer", () => {
    expect(paramInt("42")).toBe(42);
  });

  it("paramInt: throws on non-integer", () => {
    expect(() => paramInt("abc")).toThrow();
  });

  it("paramInt: throws on float", () => {
    expect(() => paramInt("3.14")).toThrow();
  });

  it("paramInt: array value", () => {
    expect(paramInt(["99", "100"])).toBe(99);
  });

  it("paramInt: undefined throws", () => {
    expect(() => paramInt(undefined)).toThrow();
  });
});
