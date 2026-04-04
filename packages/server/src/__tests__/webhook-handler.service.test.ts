import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/connection", () => ({ getDB: vi.fn() }));
vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../services/audit/audit.service", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@empcloud/shared", () => ({
  AuditAction: {
    SUBSCRIPTION_UPDATED: "SUBSCRIPTION_UPDATED",
    SUBSCRIPTION_CANCELLED: "SUBSCRIPTION_CANCELLED",
  },
}));

import { handleWebhook } from "../services/billing/webhook-handler.service.js";
import { getDB } from "../db/connection.js";
import { logAudit } from "../services/audit/audit.service.js";

const mockedGetDB = vi.mocked(getDB);
const mockedLogAudit = vi.mocked(logAudit);

function createMockDB() {
  const chain: any = {};
  chain.where = vi.fn(() => chain);
  chain.whereIn = vi.fn(() => chain);
  chain.first = vi.fn(() => chain._firstResult);
  chain.update = vi.fn(() => 1);
  chain.select = vi.fn(() => chain);
  chain._firstResult = undefined;

  const db: any = vi.fn(() => chain);
  return { db, chain };
}

describe("webhook-handler.service", () => {
  let db: any;
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockDB();
    db = mock.db;
    chain = mock.chain;
    mockedGetDB.mockReturnValue(db);
  });

  // ---- invoice.paid ----
  describe("invoice.paid", () => {
    it("activates subscription when mapping exists and status is past_due", async () => {
      chain.first.mockResolvedValueOnce({ cloud_subscription_id: 10 }); // mapping

      await handleWebhook("invoice.paid", { subscriptionId: "billing-123", invoiceId: "inv-1" }, 5);

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" })
      );
      expect(mockedLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ details: expect.objectContaining({ webhook_event: "invoice.paid" }) })
      );
    });

    it("still logs audit even when no subscription mapping found", async () => {
      chain.first.mockResolvedValueOnce(undefined); // no mapping

      await handleWebhook("invoice.paid", { subscriptionId: "x" }, 1);
      expect(mockedLogAudit).toHaveBeenCalled();
    });

    it("handles missing subscriptionId — uses subscription_id fallback", async () => {
      chain.first.mockResolvedValueOnce({ cloud_subscription_id: 20 });

      await handleWebhook("invoice.paid", { subscription_id: "sub-55" }, 1);

      // Should query with billing_subscription_id = "sub-55"
      expect(chain.where).toHaveBeenCalledWith({ billing_subscription_id: "sub-55" });
    });

    it("skips DB update when no billingSubId at all", async () => {
      await handleWebhook("invoice.paid", { invoiceId: "inv-99" }, 1);
      // update should NOT be called since there's no subscriptionId
      expect(chain.update).not.toHaveBeenCalled();
      expect(mockedLogAudit).toHaveBeenCalled();
    });
  });

  // ---- payment.received ----
  describe("payment.received", () => {
    it("logs audit with amount info", async () => {
      await handleWebhook("payment.received", { paymentId: "pay-1", amount: 5000 }, 2);

      expect(mockedLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: "payment",
          details: expect.objectContaining({ amount: 5000 }),
        })
      );
    });
  });

  // ---- subscription.cancelled ----
  describe("subscription.cancelled", () => {
    it("cancels cloud subscription when mapping exists", async () => {
      chain.first.mockResolvedValueOnce({ cloud_subscription_id: 15 });

      await handleWebhook("subscription.cancelled", { subscriptionId: "s-1" }, 3);

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "cancelled" })
      );
      expect(mockedLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SUBSCRIPTION_CANCELLED",
        })
      );
    });

    it("uses data.id as fallback for subscriptionId", async () => {
      chain.first.mockResolvedValueOnce({ cloud_subscription_id: 16 });

      await handleWebhook("subscription.cancelled", { id: "s-fallback" }, 3);
      expect(chain.where).toHaveBeenCalledWith({ billing_subscription_id: "s-fallback" });
    });

    it("still logs audit when no mapping found", async () => {
      chain.first.mockResolvedValueOnce(undefined);

      await handleWebhook("subscription.cancelled", { subscriptionId: "s-x" }, 3);
      expect(chain.update).not.toHaveBeenCalled();
      expect(mockedLogAudit).toHaveBeenCalled();
    });
  });

  // ---- subscription.payment_failed ----
  describe("subscription.payment_failed", () => {
    it("marks subscription as past_due", async () => {
      chain.first.mockResolvedValueOnce({ cloud_subscription_id: 20 });

      await handleWebhook("subscription.payment_failed", { subscriptionId: "s-2" }, 4);

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "past_due" })
      );
    });

    it("skips update when no billingSubId", async () => {
      await handleWebhook("subscription.payment_failed", {}, 4);
      expect(chain.update).not.toHaveBeenCalled();
    });
  });

  // ---- invoice.overdue ----
  describe("invoice.overdue", () => {
    it("marks subscription as past_due", async () => {
      chain.first.mockResolvedValueOnce({ cloud_subscription_id: 25 });

      await handleWebhook("invoice.overdue", { subscription_id: "s-3", invoiceId: "inv-3" }, 5);

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "past_due" })
      );
    });
  });

  // ---- unknown event ----
  describe("unknown event", () => {
    it("does not throw for unhandled events", async () => {
      await expect(
        handleWebhook("some.unknown.event", { foo: "bar" }, 1)
      ).resolves.toBeUndefined();
    });
  });

  // ---- orgId handling ----
  describe("orgId handling", () => {
    it("passes null organizationId when orgId is undefined", async () => {
      await handleWebhook("payment.received", { paymentId: "p1" });

      expect(mockedLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: null })
      );
    });
  });
});
