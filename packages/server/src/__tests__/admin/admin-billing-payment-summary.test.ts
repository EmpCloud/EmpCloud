import { beforeEach, describe, expect, it, vi } from "vitest";

const { billingFetchRaw, getDB } = vi.hoisted(() => ({
  billingFetchRaw: vi.fn(),
  getDB: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({ getDB }));
vi.mock("../../services/billing/billing-integration.service.js", () => ({
  billingFetchRaw,
}));

import { getOrganizationPaymentSummaries } from "../../services/admin/admin-billing.service.js";

describe("organization payment summary adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      whereIn: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([
        { organization_id: 7, billing_client_id: "client-7" },
        { organization_id: 8, billing_client_id: "client-8" },
      ]),
    };
    getDB.mockReturnValue(vi.fn(() => query));
  });

  it("uses the Billing-owned batch summary and keeps missing results unavailable", async () => {
    billingFetchRaw.mockResolvedValue({
      data: [{
        clientId: "client-7",
        status: "overdue",
        outstandingByCurrency: [{ currency: "inr", amount: 25_000 }],
        overdueInvoiceCount: 1,
        unpaidInvoiceCount: 1,
        latestInvoice: {
          id: "invoice-7",
          invoiceNumber: "INV-007",
          status: "sent",
          amountDue: 25_000,
          total: 25_000,
          currency: "INR",
          issueDate: "2026-08-01T00:00:00Z",
          dueDate: "2026-08-31T00:00:00Z",
        },
      }],
    });

    const summaries = await getOrganizationPaymentSummaries([7, 8, 9]);

    expect(billingFetchRaw).toHaveBeenCalledWith(
      "POST",
      "/clients/payment-summaries",
      { clientIds: ["client-7", "client-8"] },
      5_000,
    );
    expect(summaries.get(7)).toMatchObject({
      status: "overdue",
      outstanding_by_currency: [{ currency: "INR", amount: 25_000 }],
      latest_invoice: { invoice_number: "INV-007" },
    });
    expect(summaries.get(8)?.status).toBe("unavailable");
    expect(summaries.get(9)?.status).toBe("not_configured");
  });

  it("marks mapped organizations unavailable when Billing cannot respond", async () => {
    billingFetchRaw.mockResolvedValue(null);

    const summaries = await getOrganizationPaymentSummaries([7]);

    expect(summaries.get(7)?.status).toBe("unavailable");
  });
});
