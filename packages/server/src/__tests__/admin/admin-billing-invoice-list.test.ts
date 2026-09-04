import { beforeEach, describe, expect, it, vi } from "vitest";

const { billingFetchRaw, getDB } = vi.hoisted(() => ({
  billingFetchRaw: vi.fn(),
  getDB: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({ getDB }));
vi.mock("../../services/billing/billing-integration.service.js", () => ({ billingFetchRaw }));
vi.mock("../../services/subscription/subscription.service.js", () => ({
  createSubscription: vi.fn(),
}));

import { listInvoices } from "../../services/admin/admin-billing.service.js";

let subscriptionQuery: any;

function queryReturning(rows: unknown[]) {
  const query: any = {
    leftJoin: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(rows),
  };
  return query;
}

describe("admin invoice list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    billingFetchRaw.mockResolvedValue({
      data: [{
        id: "invoice-7",
        invoiceNumber: "INV-007",
        clientId: "client-7",
        status: "sent",
        total: 25_000,
        amountPaid: 0,
        amountDue: 25_000,
        currency: "INR",
        notes: "Customer-visible invoice note",
      }],
      meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
    });

    const queries: Record<string, any> = {
      "billing_client_mappings as bcm": queryReturning([{
        billing_client_id: "client-7",
        organization_id: 7,
        organization_name: "Acme",
        organization_email: "billing@acme.test",
      }]),
      "org_subscriptions as os": queryReturning([
        {
          id: 70,
          organization_id: 7,
          plan_tier: "growth",
          status: "active",
          module_name: "Payroll",
          internal_notes: "Payroll-only operator note",
        },
        {
          id: 71,
          organization_id: 7,
          plan_tier: "basic",
          status: "expired",
          module_name: "EmpCloud",
          internal_notes: "Expired plan note",
        },
      ]),
    };
    subscriptionQuery = queries["org_subscriptions as os"];
    getDB.mockReturnValue(vi.fn((table: string) => queries[table]));
  });

  it("shows all organization plans, statuses, and their internal operator notes", async () => {
    const result = await listInvoices();

    expect(result.data[0]).toMatchObject({
      empcloud_plans: [
        {
          id: 70,
          plan_tier: "growth",
          status: "active",
          module_name: "Payroll",
          internal_notes: "Payroll-only operator note",
        },
        {
          id: 71,
          plan_tier: "basic",
          status: "expired",
          module_name: "EmpCloud",
          internal_notes: "Expired plan note",
        },
      ],
    });
    expect(subscriptionQuery.whereIn).toHaveBeenCalledOnce();
    expect(subscriptionQuery.whereIn).toHaveBeenCalledWith("os.organization_id", [7]);
  });

  it("resolves a duplicate billing client through its stable EmpCloud organization metadata", async () => {
    billingFetchRaw.mockImplementation(async (_method: string, path: string) => {
      if (path.startsWith("/invoices?")) {
        return {
          data: [{
            id: "invoice-48",
            invoiceNumber: "INV-048",
            clientId: "duplicate-client-48",
            status: "overdue",
            total: 500_000,
            amountPaid: 0,
            amountDue: 500_000,
            currency: "INR",
          }],
          meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
        };
      }
      if (path === "/clients/duplicate-client-48") {
        return {
          data: {
            id: "duplicate-client-48",
            customFields: { empcloud_org_id: 48 },
          },
        };
      }
      return null;
    });

    const queries: Record<string, any> = {
      "billing_client_mappings as bcm": queryReturning([]),
      organizations: queryReturning([{
        id: 48,
        name: "Bridgesoft solutions",
        email: "ranjith.g@bridgesoft.com",
      }]),
      "org_subscriptions as os": queryReturning([{
        id: 130,
        organization_id: 48,
        plan_tier: "basic",
        status: "past_due",
        module_name: "EMP Recruit",
        internal_notes: null,
      }]),
    };
    getDB.mockReturnValue(vi.fn((table: string) => queries[table]));

    const result = await listInvoices();

    expect(result.data[0]).toMatchObject({
      empcloud_organization_id: 48,
      empcloud_organization_name: "Bridgesoft solutions",
      empcloud_organization_email: "ranjith.g@bridgesoft.com",
      empcloud_plans: [{
        id: 130,
        plan_tier: "basic",
        status: "past_due",
        module_name: "EMP Recruit",
        internal_notes: null,
      }],
    });
    expect(billingFetchRaw).toHaveBeenCalledWith("GET", "/clients/duplicate-client-48");
  });
});
