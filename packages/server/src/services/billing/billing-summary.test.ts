// =============================================================================
// buildBillingSummary — /billing/summary field-contract test
//
// Regression guard for the dashboard vs /billing mismatch: the summary must
// expose the camelCase fields the UI reads (monthlyRecurring, outstandingAmount,
// overdueCount, nextInvoiceDate), and monthlyRecurring must equal the local
// subscription cost total — so the dashboard and the /billing plan card agree
// instead of showing ₹0 vs ₹4L.
// =============================================================================

import { describe, it, expect } from "vitest";
import { buildBillingSummary } from "./billing-integration.service";

const NOW = new Date("2026-07-02T00:00:00Z").getTime();

describe("buildBillingSummary — UI field contract", () => {
  it("exposes monthlyRecurring from the local total and derives outstanding/overdue/next", () => {
    const invoices = {
      invoices: [
        { status: "overdue", amountDue: 500000, total: 500000 },
        { status: "sent", amountDue: 300000, total: 300000 },
        { status: "paid", amountDue: 0, total: 900000 },
        { status: "viewed", amountDue: 200000, total: 200000 },
      ],
    };
    const local = {
      subscriptions: [
        { current_period_end: "2026-08-01" },
        { current_period_end: "2026-07-15" }, // earliest upcoming
        { current_period_end: "2026-01-01" }, // past -> ignored
      ],
      total_monthly_cost: 40000000, // ₹4,00,000 in paise
      currency: "INR",
    };

    const s: any = buildBillingSummary(invoices, { payments: [] }, local, NOW);

    // The actual bug: monthlyRecurring used to be absent -> UI showed ₹0.
    expect(s.monthlyRecurring).toBe(40000000);
    expect(s.monthlyRecurring).toBeGreaterThan(0);
    // outstanding = overdue + sent + viewed (unpaid), not paid
    expect(s.outstandingAmount).toBe(1000000);
    expect(s.outstanding_amount).toBe(1000000); // back-compat snake_case retained
    expect(s.overdueCount).toBe(1);
    expect(s.nextInvoiceDate).toBe("2026-07-15"); // earliest upcoming period end
    expect(s.currency).toBe("INR");
  });

  it("returns zeroes (never undefined) with no subscriptions or invoices", () => {
    const s: any = buildBillingSummary({ invoices: [] }, { payments: [] }, {}, NOW);
    expect(s.monthlyRecurring).toBe(0);
    expect(s.outstandingAmount).toBe(0);
    expect(s.overdueCount).toBe(0);
    expect(s.nextInvoiceDate).toBeNull();
  });

  it("handles a missing/empty invoice payload without throwing", () => {
    const s: any = buildBillingSummary(null, null, { total_monthly_cost: 12345 }, NOW);
    expect(s.recent_invoices).toEqual([]);
    expect(s.recent_payments).toEqual([]);
    expect(s.monthlyRecurring).toBe(12345);
  });
});
