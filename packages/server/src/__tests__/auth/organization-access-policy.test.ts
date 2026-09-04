import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDB, mockGetOrganizationOverdueStatus } = vi.hoisted(() => ({
  mockGetDB: vi.fn(),
  mockGetOrganizationOverdueStatus: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({ getDB: mockGetDB }));
vi.mock("../../services/billing/billing-integration.service.js", () => ({
  getOrganizationOverdueStatus: mockGetOrganizationOverdueStatus,
}));

import {
  decideOrganizationAccess,
  hasOverduePayment,
  isPaymentResolutionRequest,
} from "../../services/auth/organization-access-policy.service.js";

describe("organization access policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const first = vi.fn().mockResolvedValue(undefined);
    const whereIn = vi.fn(() => ({ first }));
    const where = vi.fn(() => ({ whereIn }));
    mockGetDB.mockReturnValue(vi.fn(() => ({ where })));
  });

  it("hard-blocks every request when organization login is blocked", () => {
    expect(
      decideOrganizationAccess({
        loginBlocked: true,
        paymentBlockEnabled: true,
        hasOverduePayment: true,
        paymentResolutionRequest: true,
      }),
    ).toEqual({
      allowed: false,
      code: "LOGIN_BLOCKED",
      statusCode: 403,
      message: "Login has been disabled for this organization. Contact support.",
      paymentRestricted: false,
    });
  });

  it("restricts an overdue organization while allowing payment-resolution requests", () => {
    expect(
      decideOrganizationAccess({
        loginBlocked: false,
        paymentBlockEnabled: true,
        hasOverduePayment: true,
        paymentResolutionRequest: false,
      }),
    ).toMatchObject({
      allowed: false,
      code: "PAYMENT_REQUIRED",
      statusCode: 402,
      paymentRestricted: true,
    });

    expect(
      decideOrganizationAccess({
        loginBlocked: false,
        paymentBlockEnabled: true,
        hasOverduePayment: true,
        paymentResolutionRequest: true,
      }),
    ).toEqual({ allowed: true, paymentRestricted: true });
  });

  it("does not restrict payment access when there is no overdue balance", () => {
    expect(
      decideOrganizationAccess({
        loginBlocked: false,
        paymentBlockEnabled: true,
        hasOverduePayment: false,
        paymentResolutionRequest: false,
      }),
    ).toEqual({ allowed: true, paymentRestricted: false });
  });

  it("uses Billing overdue invoices when local subscriptions are still active", async () => {
    mockGetOrganizationOverdueStatus.mockResolvedValue("overdue");

    await expect(hasOverduePayment(5, { forceRefresh: true })).resolves.toBe(true);
    expect(mockGetOrganizationOverdueStatus).toHaveBeenCalledWith(5);
  });

  it("keeps an enabled payment gate closed while mapped Billing status is unavailable", async () => {
    mockGetOrganizationOverdueStatus.mockResolvedValue("unavailable");

    await expect(hasOverduePayment(6, { forceRefresh: true })).resolves.toBe(true);
  });

  it("opens an enabled payment gate only after Billing confirms it is clear", async () => {
    mockGetOrganizationOverdueStatus.mockResolvedValue("clear");

    await expect(hasOverduePayment(7, { forceRefresh: true })).resolves.toBe(false);
  });

  it("recognizes only the API routes needed to inspect and settle billing", () => {
    expect(isPaymentResolutionRequest("/api/v1/billing/invoices", "GET")).toBe(true);
    expect(isPaymentResolutionRequest("/api/v1/billing/pay", "POST")).toBe(true);
    expect(isPaymentResolutionRequest("/api/v1/billing-admin", "GET")).toBe(false);
    expect(isPaymentResolutionRequest("/api/v1/subscriptions/billing-status", "GET")).toBe(true);
    expect(isPaymentResolutionRequest("/api/v1/onboarding/status", "GET")).toBe(true);
    expect(isPaymentResolutionRequest("/api/v1/employees/directory", "GET")).toBe(false);
    expect(isPaymentResolutionRequest("/api/v1/subscriptions/1", "PUT")).toBe(false);
  });
});
