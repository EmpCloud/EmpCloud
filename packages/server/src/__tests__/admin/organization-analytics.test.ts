import { describe, expect, it } from "vitest";
import { adminOrganizationListQuerySchema } from "@empcloud/shared";
import { summarizeSubscriptionsByOrganization } from "../../services/admin/organization-analytics.js";

describe("organization analytics", () => {
  it("validates and caps organization analytics filters", () => {
    expect(adminOrganizationListQuerySchema.safeParse({ per_page: 500 }).success).toBe(true);
    expect(adminOrganizationListQuerySchema.safeParse({ per_page: 501 }).success).toBe(false);
    expect(adminOrganizationListQuerySchema.safeParse({ payment_status: "forged" }).success).toBe(false);
    expect(adminOrganizationListQuerySchema.parse({
      plan_tier: "custom_tier",
      payment_status: "overdue",
    })).toMatchObject({
      page: 1,
      per_page: 20,
      plan_tier: "custom_tier",
      payment_status: "overdue",
    });
  });

  it("summarizes module plans, license usage, and recurring charges without mixing currencies", () => {
    const summaries = summarizeSubscriptionsByOrganization([
      {
        id: 11,
        organization_id: 7,
        module_id: 2,
        module_name: "EMP Payroll",
        module_slug: "payroll",
        plan_tier: "professional",
        status: "active",
        total_seats: 100,
        used_seats: 74,
        billing_cycle: "annual",
        price_per_seat: 480000,
        currency: "INR",
        months_in_cycle: 12,
        current_period_start: "2026-04-01",
        current_period_end: "2027-03-31",
        trial_ends_at: null,
        auto_renew: true,
        is_free: false,
      },
      {
        id: 12,
        organization_id: 7,
        module_id: 3,
        module_name: "EMP Monitor",
        module_slug: "monitor",
        plan_tier: "basic",
        status: "active",
        total_seats: 50,
        used_seats: 42,
        billing_cycle: "monthly",
        price_per_seat: 500,
        currency: "USD",
        months_in_cycle: 1,
        current_period_start: "2026-09-01",
        current_period_end: "2026-09-30",
        trial_ends_at: null,
        auto_renew: false,
        is_free: false,
      },
      {
        id: 13,
        organization_id: 7,
        module_id: 4,
        module_name: "EMP Recruit",
        module_slug: "recruit",
        plan_tier: "basic",
        status: "cancelled",
        total_seats: 25,
        used_seats: 5,
        billing_cycle: "monthly",
        price_per_seat: 10000,
        currency: "INR",
        months_in_cycle: 1,
        current_period_start: "2026-07-01",
        current_period_end: "2026-07-31",
        trial_ends_at: null,
        auto_renew: false,
        is_free: false,
      },
      {
        id: 14,
        organization_id: 7,
        module_id: 5,
        module_name: "EMP LMS",
        module_slug: "lms",
        plan_tier: "enterprise",
        status: "suspended",
        total_seats: 30,
        used_seats: 20,
        billing_cycle: "monthly",
        price_per_seat: 20000,
        currency: "INR",
        months_in_cycle: 1,
        current_period_start: "2026-09-01",
        current_period_end: "2026-09-30",
        trial_ends_at: null,
        auto_renew: false,
        is_free: false,
      },
    ]);

    expect(summaries.get(7)).toMatchObject({
      active_module_count: 2,
      plans: ["basic", "professional"],
      subscription_statuses: ["active"],
      total_licenses: 150,
      used_licenses: 116,
      available_licenses: 34,
      license_utilization: 77,
      monthly_spend_by_currency: [
        { currency: "INR", amount: 4000000 },
        { currency: "USD", amount: 25000 },
      ],
    });
    expect(summaries.get(7)?.subscriptions).toHaveLength(4);
    expect(summaries.get(7)?.subscriptions[0]).toMatchObject({
      module_slug: "payroll",
      monthly_amount: 4000000,
      available_seats: 26,
    });
  });
});
