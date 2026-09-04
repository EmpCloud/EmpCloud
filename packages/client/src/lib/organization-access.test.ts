import { describe, expect, it } from "vitest";
import {
  getPaymentRestrictionDestination,
  isPaymentResolutionPage,
} from "./organization-access";

describe("payment-restricted navigation", () => {
  it("sends billing administrators to billing and employees to a contact-admin screen", () => {
    expect(getPaymentRestrictionDestination({ role: "org_admin" })).toBe("/billing");
    expect(getPaymentRestrictionDestination({ role: "hr_admin" })).toBe("/payment-required");
    expect(getPaymentRestrictionDestination({ role: "employee" })).toBe("/payment-required");
  });

  it("allows only payment-resolution pages while restricted", () => {
    expect(isPaymentResolutionPage("/billing")).toBe(true);
    expect(isPaymentResolutionPage("/payment-required")).toBe(true);
    expect(isPaymentResolutionPage("/employees")).toBe(false);
  });
});
