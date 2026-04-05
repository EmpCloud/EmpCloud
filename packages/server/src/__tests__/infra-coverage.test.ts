/**
 * Infrastructure coverage tests — error classes, response helpers, sanitizer,
 * params, working-days, crypto, payroll rules, F&F settlement.
 * Pure logic, no DB required.
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// 1. Error Classes
// ---------------------------------------------------------------------------
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  OAuthError,
} from "../utils/errors";

describe("Error classes", () => {
  describe("AppError", () => {
    it("sets message, statusCode, code", () => {
      const err = new AppError("bad", 400, "BAD_REQUEST");
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("bad");
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("BAD_REQUEST");
      expect(err.name).toBe("AppError");
    });

    it("includes details when provided", () => {
      const err = new AppError("oops", 422, "VALIDATION", { fields: ["a"] });
      expect(err.details).toEqual({ fields: ["a"] });
    });

    it("has undefined details when not provided", () => {
      const err = new AppError("x", 500, "ERR");
      expect(err.details).toBeUndefined();
    });

    it("has a stack trace", () => {
      const err = new AppError("x", 500, "ERR");
      expect(err.stack).toBeDefined();
    });
  });

  describe("ValidationError", () => {
    it("creates 400 with VALIDATION_ERROR code", () => {
      const err = new ValidationError("invalid input");
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.name).toBe("ValidationError");
      expect(err).toBeInstanceOf(AppError);
    });

    it("includes details", () => {
      const err = new ValidationError("bad", { email: ["required"] });
      expect(err.details).toEqual({ email: ["required"] });
    });
  });

  describe("UnauthorizedError", () => {
    it("creates 401 with default message", () => {
      const err = new UnauthorizedError();
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe("Unauthorized");
      expect(err.code).toBe("UNAUTHORIZED");
    });

    it("accepts custom message", () => {
      const err = new UnauthorizedError("Token expired");
      expect(err.message).toBe("Token expired");
    });
  });

  describe("ForbiddenError", () => {
    it("creates 403 with default message", () => {
      const err = new ForbiddenError();
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe("Forbidden");
      expect(err.code).toBe("FORBIDDEN");
    });

    it("accepts custom message", () => {
      const err = new ForbiddenError("Admin only");
      expect(err.message).toBe("Admin only");
    });
  });

  describe("NotFoundError", () => {
    it("creates 404 with resource name", () => {
      const err = new NotFoundError("User");
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe("User not found");
      expect(err.code).toBe("NOT_FOUND");
    });

    it("uses default resource name", () => {
      const err = new NotFoundError();
      expect(err.message).toBe("Resource not found");
    });
  });

  describe("ConflictError", () => {
    it("creates 409 with message", () => {
      const err = new ConflictError("Already exists");
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe("CONFLICT");
    });
  });

  describe("RateLimitError", () => {
    it("creates 429 with default message", () => {
      const err = new RateLimitError();
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe("RATE_LIMITED");
      expect(err.message).toBe("Too many requests");
    });

    it("accepts custom message", () => {
      const err = new RateLimitError("Slow down");
      expect(err.message).toBe("Slow down");
    });
  });

  describe("OAuthError", () => {
    it("creates with errorType and description", () => {
      const err = new OAuthError("invalid_grant", "Code expired");
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("OAUTH_ERROR");
      expect(err.errorType).toBe("invalid_grant");
      expect(err.message).toBe("Code expired");
    });

    it("accepts custom statusCode", () => {
      const err = new OAuthError("unauthorized_client", "Not allowed", 401);
      expect(err.statusCode).toBe(401);
    });

    it("toJSON returns RFC 6749 format", () => {
      const err = new OAuthError("invalid_scope", "Unknown scope");
      expect(err.toJSON()).toEqual({
        error: "invalid_scope",
        error_description: "Unknown scope",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Response Helpers
// ---------------------------------------------------------------------------
import { sendSuccess, sendError, sendPaginated } from "../utils/response";

function createMockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

describe("Response helpers", () => {
  describe("sendSuccess", () => {
    it("sends 200 by default with success envelope", () => {
      const res = createMockRes();
      sendSuccess(res, { id: 1 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1 } });
    });

    it("sends custom status code", () => {
      const res = createMockRes();
      sendSuccess(res, null, 201);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("includes meta when provided", () => {
      const res = createMockRes();
      sendSuccess(res, [], 200, { page: 1, per_page: 10, total: 100, total_pages: 10 });
      const body = res.json.mock.calls[0][0];
      expect(body.meta).toEqual({ page: 1, per_page: 10, total: 100, total_pages: 10 });
    });

    it("omits meta when not provided", () => {
      const res = createMockRes();
      sendSuccess(res, "ok");
      const body = res.json.mock.calls[0][0];
      expect(body.meta).toBeUndefined();
    });
  });

  describe("sendError", () => {
    it("sends error response with code and message", () => {
      const res = createMockRes();
      sendError(res, 404, "NOT_FOUND", "Gone");
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { code: "NOT_FOUND", message: "Gone", details: undefined },
      });
    });

    it("includes details when provided", () => {
      const res = createMockRes();
      sendError(res, 400, "VALIDATION", "Bad", { f: ["x"] });
      const body = res.json.mock.calls[0][0];
      expect(body.error.details).toEqual({ f: ["x"] });
    });
  });

  describe("sendPaginated", () => {
    it("sends paginated response with correct meta", () => {
      const res = createMockRes();
      sendPaginated(res, [1, 2], 50, 1, 20);
      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data).toEqual([1, 2]);
      expect(body.meta.total_pages).toBe(3);
    });

    it("calculates total_pages for exact division", () => {
      const res = createMockRes();
      sendPaginated(res, [], 40, 2, 20);
      const body = res.json.mock.calls[0][0];
      expect(body.meta.total_pages).toBe(2);
    });

    it("handles zero total", () => {
      const res = createMockRes();
      sendPaginated(res, [], 0, 1, 10);
      const body = res.json.mock.calls[0][0];
      expect(body.meta.total_pages).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. HTML Sanitizer
// ---------------------------------------------------------------------------
import { sanitizeHtml } from "../utils/sanitize-html";

describe("sanitizeHtml", () => {
  it("returns empty/falsy input as-is", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null as any)).toBe(null);
    expect(sanitizeHtml(undefined as any)).toBe(undefined);
  });

  it("strips <script> tags and content", () => {
    expect(sanitizeHtml('<p>Hello</p><script>alert("xss")</script>')).toBe("<p>Hello</p>");
  });

  it("strips <iframe> tags", () => {
    expect(sanitizeHtml('<iframe src="evil.com"></iframe>')).toBe("");
  });

  it("strips <object> and <embed> tags", () => {
    expect(sanitizeHtml('<object data="x"><embed src="y">')).toBe("");
  });

  it("strips <svg> tags and content", () => {
    expect(sanitizeHtml('<svg onload="alert(1)"><circle/></svg>')).toBe("");
  });

  it("strips <form> tags and their content", () => {
    expect(sanitizeHtml('<form action="/steal"><input></form>')).toBe("");
  });

  it("strips <meta> and <base> tags", () => {
    expect(sanitizeHtml('<meta http-equiv="refresh"><base href="evil">')).toBe("");
  });

  it("strips on* event handler attributes", () => {
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe('<img src="x">');
    expect(sanitizeHtml('<div onclick="steal()">Hi</div>')).toBe("<div>Hi</div>");
  });

  it("strips javascript: URIs in href", () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("javascript:");
  });

  it("strips vbscript: URIs in src", () => {
    const input = '<img src="vbscript:exec">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("vbscript:");
  });

  it("strips data: URIs in href", () => {
    const input = '<a href="data:text/html,<script>alert(1)</script>">X</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("data:");
  });

  it("preserves safe HTML", () => {
    const safe = '<p>Hello <strong>world</strong></p><ul><li>Item</li></ul>';
    expect(sanitizeHtml(safe)).toBe(safe);
  });

  it("is case-insensitive for dangerous tags", () => {
    expect(sanitizeHtml('<SCRIPT>alert(1)</SCRIPT>')).toBe("");
    expect(sanitizeHtml('<Script>bad</Script>')).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 4. Param Helpers
// ---------------------------------------------------------------------------
import { param, paramInt } from "../utils/params";

describe("param helpers", () => {
  describe("param()", () => {
    it("returns string value as-is", () => {
      expect(param("hello")).toBe("hello");
    });

    it("returns first element of array", () => {
      expect(param(["a", "b"])).toBe("a");
    });

    it("returns empty string for undefined", () => {
      expect(param(undefined)).toBe("");
    });
  });

  describe("paramInt()", () => {
    it("parses valid integer string", () => {
      expect(paramInt("42")).toBe(42);
    });

    it("parses integer from array", () => {
      expect(paramInt(["7", "8"])).toBe(7);
    });

    it("throws ValidationError for non-integer", () => {
      expect(() => paramInt("abc")).toThrow(ValidationError);
    });

    it("throws ValidationError for float", () => {
      expect(() => paramInt("3.14")).toThrow(ValidationError);
    });

    it("throws ValidationError for empty string", () => {
      expect(() => paramInt("")).toThrow(ValidationError);
    });

    it("throws ValidationError for undefined", () => {
      expect(() => paramInt(undefined)).toThrow(ValidationError);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Working Days Calculator
// ---------------------------------------------------------------------------
import { calculateWorkingDays } from "../utils/working-days";

describe("calculateWorkingDays", () => {
  it("counts weekdays in a full week (Mon-Sun)", () => {
    // 2026-01-05 is Monday, 2026-01-11 is Sunday
    expect(calculateWorkingDays("2026-01-05", "2026-01-11")).toBe(5);
  });

  it("returns 0 when end < start", () => {
    expect(calculateWorkingDays("2026-01-10", "2026-01-05")).toBe(0);
  });

  it("counts single weekday", () => {
    // 2026-01-05 is Monday
    expect(calculateWorkingDays("2026-01-05", "2026-01-05")).toBe(1);
  });

  it("returns 0 for single weekend day", () => {
    // 2026-01-10 is Saturday
    expect(calculateWorkingDays("2026-01-10", "2026-01-10")).toBe(0);
  });

  it("excludes holidays", () => {
    // Mon-Fri with Wednesday as holiday
    expect(calculateWorkingDays("2026-01-05", "2026-01-09", ["2026-01-07"])).toBe(4);
  });

  it("excludes multiple holidays", () => {
    expect(
      calculateWorkingDays("2026-01-05", "2026-01-09", ["2026-01-06", "2026-01-08"])
    ).toBe(3);
  });

  it("ignores holidays on weekends", () => {
    // Sat is already excluded
    expect(calculateWorkingDays("2026-01-05", "2026-01-11", ["2026-01-10"])).toBe(5);
  });

  it("accepts Date objects", () => {
    const start = new Date("2026-01-05");
    const end = new Date("2026-01-09");
    expect(calculateWorkingDays(start, end)).toBe(5);
  });

  it("handles multi-week range", () => {
    // 2 full weeks: 10 working days
    expect(calculateWorkingDays("2026-01-05", "2026-01-16")).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 6. Crypto Utilities
// ---------------------------------------------------------------------------
import {
  randomHex,
  randomBase64Url,
  sha256,
  sha256Base64Url,
  verifyPKCE,
  generateClientId,
  generateClientSecret,
  hashToken,
  timingSafeEqual,
  hashPassword,
  verifyPassword,
} from "../utils/crypto";

describe("Crypto utilities", () => {
  describe("randomHex", () => {
    it("generates hex string of expected length", () => {
      const hex = randomHex(16);
      expect(hex).toMatch(/^[0-9a-f]{32}$/);
    });

    it("defaults to 32 bytes (64 hex chars)", () => {
      expect(randomHex().length).toBe(64);
    });

    it("generates unique values", () => {
      expect(randomHex()).not.toBe(randomHex());
    });
  });

  describe("randomBase64Url", () => {
    it("generates URL-safe base64 string", () => {
      const val = randomBase64Url(16);
      expect(val).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("defaults to 32 bytes", () => {
      const val = randomBase64Url();
      expect(val.length).toBeGreaterThan(0);
    });
  });

  describe("sha256", () => {
    it("produces consistent hex digest", () => {
      const hash = sha256("hello");
      expect(hash).toBe(sha256("hello"));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces different hashes for different inputs", () => {
      expect(sha256("a")).not.toBe(sha256("b"));
    });
  });

  describe("sha256Base64Url", () => {
    it("produces base64url digest", () => {
      const hash = sha256Base64Url("test");
      expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe("verifyPKCE", () => {
    it("verifies S256 method", () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const challenge = sha256Base64Url(verifier);
      expect(verifyPKCE(verifier, challenge, "S256")).toBe(true);
    });

    it("rejects wrong verifier for S256", () => {
      const challenge = sha256Base64Url("correct");
      expect(verifyPKCE("wrong", challenge, "S256")).toBe(false);
    });

    it("verifies plain method", () => {
      expect(verifyPKCE("same", "same", "plain")).toBe(true);
    });

    it("rejects wrong verifier for plain", () => {
      expect(verifyPKCE("a", "b", "plain")).toBe(false);
    });
  });

  describe("generateClientId", () => {
    it("starts with ec_ prefix", () => {
      expect(generateClientId()).toMatch(/^ec_/);
    });
  });

  describe("generateClientSecret", () => {
    it("starts with ecs_ prefix", () => {
      expect(generateClientSecret()).toMatch(/^ecs_/);
    });
  });

  describe("hashToken", () => {
    it("is a SHA-256 of the input", () => {
      expect(hashToken("mytoken")).toBe(sha256("mytoken"));
    });
  });

  describe("timingSafeEqual", () => {
    it("returns true for equal strings", () => {
      expect(timingSafeEqual("abc", "abc")).toBe(true);
    });

    it("returns false for different strings", () => {
      expect(timingSafeEqual("abc", "xyz")).toBe(false);
    });

    it("returns false for different lengths", () => {
      expect(timingSafeEqual("short", "longer")).toBe(false);
    });
  });

  describe("hashPassword / verifyPassword", () => {
    it("hashes and verifies correctly", async () => {
      const hash = await hashPassword("Secret123!");
      expect(hash).not.toBe("Secret123!");
      expect(await verifyPassword("Secret123!", hash)).toBe(true);
      expect(await verifyPassword("Wrong", hash)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Payroll Rules
// ---------------------------------------------------------------------------
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
} from "../utils/payroll-rules";

describe("Payroll rules", () => {
  describe("PF calculation", () => {
    it("calculates 12% of basic when below cap", () => {
      expect(calculateEmployeePF(10_000)).toBe(1200);
      expect(calculateEmployerPF(10_000)).toBe(1200);
    });

    it("caps PF at PF_BASIC_CAP", () => {
      const capped = Math.round(PF_BASIC_CAP * 0.12);
      expect(calculateEmployeePF(100_000)).toBe(capped);
      expect(calculateEmployerPF(100_000)).toBe(capped);
    });
  });

  describe("ESI calculation", () => {
    it("calculates ESI when gross <= threshold", () => {
      expect(calculateEmployeeESI(20_000)).toBe(Math.round(20_000 * 0.0075));
      expect(calculateEmployerESI(20_000)).toBe(Math.round(20_000 * 0.0325));
    });

    it("returns 0 when gross > threshold", () => {
      expect(calculateEmployeeESI(ESI_GROSS_THRESHOLD + 1)).toBe(0);
      expect(calculateEmployerESI(ESI_GROSS_THRESHOLD + 1)).toBe(0);
    });

    it("applies ESI at exact threshold", () => {
      expect(calculateEmployeeESI(ESI_GROSS_THRESHOLD)).toBeGreaterThan(0);
    });
  });

  describe("Gratuity", () => {
    it("calculates 4.81% of basic", () => {
      expect(calculateGratuity(50_000)).toBe(Math.round(50_000 * 0.0481));
    });
  });

  describe("CTC", () => {
    it("= gross + employer PF + employer ESI + gratuity", () => {
      const gross = 20_000;
      const basic = 10_000;
      const expected = gross + calculateEmployerPF(basic) + calculateEmployerESI(gross) + calculateGratuity(basic);
      expect(computeCTC(gross, basic)).toBe(expected);
    });
  });

  describe("sumComponents", () => {
    it("sums basic + hra + da + special", () => {
      expect(sumComponents(10_000, 5_000, 2_000, 3_000)).toBe(20_000);
    });

    it("includes other components", () => {
      expect(sumComponents(10_000, 0, 0, 0, [{ name: "Bonus", amount: 5_000 }])).toBe(15_000);
    });
  });

  describe("validateSalaryStructure", () => {
    it("validates a correct structure", () => {
      const basic = 10_000;
      const gross = 20_000;
      const result = validateSalaryStructure({
        basic,
        hra: 5_000,
        da: 2_000,
        special_allowance: 3_000,
        gross,
        employer_pf: calculateEmployerPF(basic),
        employer_esi: calculateEmployerESI(gross),
        gratuity: calculateGratuity(basic),
        ctc: computeCTC(gross, basic),
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("catches component sum mismatch", () => {
      const result = validateSalaryStructure({
        basic: 10_000,
        hra: 1_000,
        da: 0,
        special_allowance: 0,
        gross: 20_000,
        employer_pf: 1200,
        employer_esi: 0,
        gratuity: 481,
        ctc: 21_681,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("components sum"))).toBe(true);
    });
  });

  describe("Shift duration", () => {
    it("calculates day shift duration", () => {
      expect(calculateShiftDurationMinutes("09:00", "18:00")).toBe(540);
    });

    it("handles night shift crossing midnight", () => {
      expect(calculateShiftDurationMinutes("22:00", "06:00", true)).toBe(480);
    });

    it("auto-detects night shift when end < start", () => {
      expect(calculateShiftDurationMinutes("23:00", "07:00")).toBe(480);
    });
  });

  describe("Overtime", () => {
    it("calculates OT when employee works past shift end", () => {
      const checkIn = new Date("2026-01-05T09:00:00");
      const checkOut = new Date("2026-01-05T20:00:00"); // 2 hours after 18:00
      const result = calculateOvertime(checkIn, checkOut, "09:00", "18:00");
      expect(result.overtime_minutes).toBe(120);
      expect(result.shift_duration_minutes).toBe(540);
    });

    it("returns 0 OT when employee leaves on time", () => {
      const checkIn = new Date("2026-01-05T09:00:00");
      const checkOut = new Date("2026-01-05T18:00:00");
      const result = calculateOvertime(checkIn, checkOut, "09:00", "18:00");
      expect(result.overtime_minutes).toBe(0);
    });

    it("returns 0 OT when employee leaves early", () => {
      const checkIn = new Date("2026-01-05T09:00:00");
      const checkOut = new Date("2026-01-05T16:00:00");
      const result = calculateOvertime(checkIn, checkOut, "09:00", "18:00");
      expect(result.overtime_minutes).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// 8. F&F Settlement Calculator
// ---------------------------------------------------------------------------
import {
  calculateFnF,
  calculateGratuityForFnF,
  calculateLeaveEncashmentRate,
  GRATUITY_MAX,
} from "../utils/fnf-settlement";

describe("F&F Settlement", () => {
  describe("calculateFnF", () => {
    it("calculates basic settlement without deductions", () => {
      const result = calculateFnF({
        pendingSalary: 50_000,
        leaveBalance: 10,
        leaveEncashmentRate: 2_000,
      });
      expect(result.pendingSalary).toBe(50_000);
      expect(result.leaveEncashment).toBe(20_000);
      expect(result.totalEarnings).toBe(70_000);
      expect(result.totalDeductions).toBe(0);
      expect(result.netSettlement).toBe(70_000);
    });

    it("includes gratuity and bonus", () => {
      const result = calculateFnF({
        pendingSalary: 50_000,
        leaveBalance: 0,
        leaveEncashmentRate: 0,
        gratuityAmount: 10_000,
        bonusAmount: 5_000,
      });
      expect(result.gratuity).toBe(10_000);
      expect(result.bonus).toBe(5_000);
      expect(result.totalEarnings).toBe(65_000);
    });

    it("deducts recoveries and notice period", () => {
      const result = calculateFnF({
        pendingSalary: 100_000,
        leaveBalance: 0,
        leaveEncashmentRate: 0,
        noticePeriodRecovery: 30_000,
        recoveries: [
          { description: "Loan", amount: 10_000 },
          { description: "Laptop", amount: 5_000 },
        ],
      });
      expect(result.totalDeductions).toBe(45_000);
      expect(result.netSettlement).toBe(55_000);
    });

    it("can produce negative settlement", () => {
      const result = calculateFnF({
        pendingSalary: 10_000,
        leaveBalance: 0,
        leaveEncashmentRate: 0,
        noticePeriodRecovery: 50_000,
      });
      expect(result.netSettlement).toBeLessThan(0);
    });
  });

  describe("calculateGratuityForFnF", () => {
    it("returns 0 if service < min years", () => {
      expect(calculateGratuityForFnF(50_000, 4)).toBe(0);
    });

    it("calculates gratuity for eligible employee", () => {
      const expected = Math.round((50_000 * 15 * 5) / 26);
      expect(calculateGratuityForFnF(50_000, 5)).toBe(expected);
    });

    it("caps at statutory maximum", () => {
      // Very high basic * many years should be capped
      expect(calculateGratuityForFnF(10_000_000, 30)).toBe(GRATUITY_MAX);
    });

    it("uses custom min years", () => {
      expect(calculateGratuityForFnF(50_000, 3, 3)).toBeGreaterThan(0);
      expect(calculateGratuityForFnF(50_000, 2, 3)).toBe(0);
    });
  });

  describe("calculateLeaveEncashmentRate", () => {
    it("calculates rate as basic / 26", () => {
      expect(calculateLeaveEncashmentRate(52_000)).toBe(2_000);
    });

    it("uses custom working days", () => {
      expect(calculateLeaveEncashmentRate(60_000, 30)).toBe(2_000);
    });
  });
});
