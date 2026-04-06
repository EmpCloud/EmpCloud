import { describe, it, expect, vi, beforeEach } from "vitest";

// Better mock: ALL methods return chain, use mockResolvedValueOnce on terminal methods
function buildMockDB() {
  const chain: any = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then" || prop === "catch") return undefined;
      if (!_target[prop]) {
        _target[prop] = vi.fn(function() { return chain; });
      }
      return _target[prop];
    }
  });
  // Terminal methods that should be mockable
  chain.first = vi.fn(() => Promise.resolve(null));
  chain.insert = vi.fn(() => Promise.resolve([1]));
  chain.update = vi.fn(() => Promise.resolve(1));
  chain.delete = vi.fn(() => Promise.resolve(1));
  chain.count = vi.fn(() => chain); // count chains, use .first() after or resolve directly
  chain.increment = vi.fn(() => Promise.resolve(1));
  chain.decrement = vi.fn(() => Promise.resolve(1));

  const db: any = vi.fn(() => chain);
  db.raw = vi.fn(() => Promise.resolve([[], []]));
  db.transaction = vi.fn(async (cb: any) => cb(db));
  db._chain = chain;
  return { db, chain };
}

const { db: mockDB, chain: mc } = buildMockDB();

vi.mock("../../db/connection", () => ({
  getDB: vi.fn(() => mockDB),
  initDB: vi.fn(),
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../module/module.service", () => ({
  getAccessibleFeatures: vi.fn(() => Promise.resolve(["feature1"])),
}));

vi.mock("../billing/billing-integration.service", () => ({
  createInvoice: vi.fn(() => Promise.resolve("inv-1")),
  getBillingSubscriptionId: vi.fn(() => Promise.resolve(null)),
  cancelBillingSubscription: vi.fn(() => Promise.resolve()),
}));

vi.mock("./pricing", () => ({
  getPricePerSeat: vi.fn(() => 100),
  getOrgCurrency: vi.fn(() => Promise.resolve("INR")),
}));

import {
  getSubscription, createSubscription, updateSubscription,
  cancelSubscription, assignSeat, revokeSeat, listSeats, syncUsedSeats,
  checkModuleAccess, getBillingStatus, enforceOverdueInvoices, processDunning,
  checkFreeTierUserLimit,
} from "../../services/subscription/subscription.service.js";

function reset() {
  vi.clearAllMocks();
  // Reset the proxy-based chain
  mc.first.mockReset().mockResolvedValue(null);
  mc.insert.mockReset().mockResolvedValue([1]);
  mc.update.mockReset().mockResolvedValue(1);
  mc.delete.mockReset().mockResolvedValue(1);
  mc.count.mockReset().mockReturnValue(mc);
  mc.increment.mockReset().mockResolvedValue(1);
  mc.decrement.mockReset().mockResolvedValue(1);
}

describe("Subscription Service Coverage", () => {
  beforeEach(reset);

  describe("getSubscription", () => {
    it("throws when not found", async () => {
      mc.first.mockResolvedValueOnce(null);
      await expect(getSubscription(1, 99)).rejects.toThrow("Subscription");
    });
    it("returns sub", async () => {
      mc.first.mockResolvedValueOnce({ id: 1, status: "active" });
      const r = await getSubscription(1, 1);
      expect(r.id).toBe(1);
    });
  });

  describe("createSubscription", () => {
    it("throws on existing active sub", async () => {
      // createSubscription: free tier check uses count().first()
      mc.first
        .mockResolvedValueOnce({ count: 0 }) // free tier count
        .mockResolvedValueOnce({ id: 1, status: "active" }); // existing sub check
      await expect(createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 5 } as any)).rejects.toThrow("already has an active");
    });

    it("creates fresh subscription", async () => {
      mc.first
        .mockResolvedValueOnce(null) // existing check
        .mockResolvedValueOnce({ id: 1, name: "Payroll" }) // module name
        .mockResolvedValueOnce({ id: 1, status: "active" }); // getSubscription
      mc.insert.mockResolvedValueOnce([1]);
      const r = await createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 10, billing_cycle: "monthly" } as any);
      expect(r).toBeTruthy();
    });

    it("reactivates cancelled sub", async () => {
      mc.first
        .mockResolvedValueOnce({ id: 5, status: "cancelled" }) // existing cancelled
        .mockResolvedValueOnce({ id: 1, name: "Payroll" }) // module
        .mockResolvedValueOnce({ id: 5, status: "active" }); // getSubscription
      mc.update.mockResolvedValue(1);
      const r = await createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 5, billing_cycle: "quarterly" } as any);
      expect(r).toBeTruthy();
    });

    it("creates trial sub", async () => {
      mc.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, name: "LMS" })
        .mockResolvedValueOnce({ id: 1, status: "trial" });
      mc.insert.mockResolvedValueOnce([1]);
      const r = await createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 5, trial_days: 14, billing_cycle: "annual" } as any);
      expect(r).toBeTruthy();
    });

    it("throws on free tier module limit", async () => {
      mc.first.mockResolvedValueOnce({ count: 1 }); // count >= 1 free sub
      await expect(createSubscription(1, { module_id: 1, plan_tier: "free", total_seats: 5 } as any)).rejects.toThrow("Free tier");
    });
  });

  describe("updateSubscription", () => {
    it("throws on reduce below used seats", async () => {
      mc.first.mockResolvedValueOnce({ id: 1, used_seats: 10, status: "active" });
      await expect(updateSubscription(1, 1, { total_seats: 5 } as any)).rejects.toThrow("Cannot reduce seats");
    });

    it("updates with plan_tier", async () => {
      mc.first
        .mockResolvedValueOnce({ id: 1, used_seats: 2, status: "active" })
        .mockResolvedValueOnce({ id: 1, status: "active" });
      mc.update.mockResolvedValue(1);
      const r = await updateSubscription(1, 1, { plan_tier: "pro", total_seats: 20 } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("cancelSubscription", () => {
    it("cancels", async () => {
      mc.first
        .mockResolvedValueOnce({ id: 1, status: "active" })
        .mockResolvedValueOnce({ id: 1, status: "cancelled" });
      mc.update.mockResolvedValue(1);
      mc.delete.mockResolvedValue(3);
      const r = await cancelSubscription(1, 1);
      expect(r).toBeTruthy();
    });
  });

  describe("assignSeat", () => {
    it("throws when no active sub", async () => {
      mc.first.mockResolvedValueOnce(null);
      await expect(assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 })).rejects.toThrow("Active subscription");
    });

    it("throws when seats full", async () => {
      mc.first.mockResolvedValueOnce({ id: 1, used_seats: 10, total_seats: 10 });
      await expect(assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 })).rejects.toThrow("No available seats");
    });

    it("throws when already assigned", async () => {
      mc.first
        .mockResolvedValueOnce({ id: 1, used_seats: 5, total_seats: 10 })
        .mockResolvedValueOnce({ id: 1 });
      await expect(assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 })).rejects.toThrow("already has a seat");
    });

    it("assigns", async () => {
      mc.first
        .mockResolvedValueOnce({ id: 1, used_seats: 5, total_seats: 10 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1 });
      mc.insert.mockResolvedValueOnce([1]);
      const r = await assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 });
      expect(r).toBeTruthy();
    });
  });

  describe("revokeSeat", () => {
    it("throws when not found", async () => {
      mc.first.mockResolvedValueOnce(null);
      await expect(revokeSeat(1, 1, 1)).rejects.toThrow("Seat assignment");
    });

    it("revokes", async () => {
      mc.first.mockResolvedValueOnce({ id: 1, subscription_id: 1 });
      await revokeSeat(1, 1, 1);
    });
  });

  describe("syncUsedSeats", () => {
    it("no-op when no active sub", async () => {
      mc.first.mockResolvedValueOnce(null);
      await syncUsedSeats(1, 1);
    });

    it("updates when mismatch", async () => {
      mc.first.mockResolvedValueOnce({ id: 1, used_seats: 3 }).mockResolvedValueOnce({ count: 5 });
      mc.update.mockResolvedValue(1);
      await syncUsedSeats(1, 1);
    });

    it("skips when match", async () => {
      mc.first.mockResolvedValueOnce({ id: 1, used_seats: 5 }).mockResolvedValueOnce({ count: 5 });
      await syncUsedSeats(1, 1);
    });
  });

  describe("checkModuleAccess", () => {
    it("no access when module not found", async () => {
      mc.first.mockResolvedValueOnce(null);
      const r = await checkModuleAccess({ userId: 1, orgId: 1, moduleSlug: "bad" });
      expect(r.has_access).toBe(false);
    });

    it("no access with suspended sub", async () => {
      mc.first
        .mockResolvedValueOnce({ id: 1, is_active: true })
        .mockResolvedValueOnce(null) // no active
        .mockResolvedValueOnce({ id: 1, status: "suspended" }); // suspended
      const r = await checkModuleAccess({ userId: 1, orgId: 1, moduleSlug: "payroll" });
      expect(r.has_access).toBe(false);
    });

    it("no access with no sub", async () => {
      mc.first
        .mockResolvedValueOnce({ id: 1, is_active: true })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const r = await checkModuleAccess({ userId: 1, orgId: 1, moduleSlug: "payroll" });
      expect(r.has_access).toBe(false);
    });
  });

  describe("getBillingStatus", () => {
    it("no overdue", async () => {
      // select returns array, not chain
      mc.select = vi.fn(() => Promise.resolve([]));
      const r = await getBillingStatus(1);
      expect(r.has_overdue).toBe(false);
      mc.select.mockReset().mockReturnValue(mc); // restore
    });

    it("with overdue subs", async () => {
      const periodEnd = new Date(Date.now() - 10 * 86400000);
      mc.select = vi.fn(() => Promise.resolve([{ id: 1, module_name: "Payroll", status: "past_due", current_period_end: periodEnd }]));
      const r = await getBillingStatus(1);
      expect(r.has_overdue).toBe(true);
      mc.select.mockReset().mockReturnValue(mc);
    });
  });

  describe("enforceOverdueInvoices", () => {
    it("no overdue", async () => {
      mc.select = vi.fn(() => Promise.resolve([]));
      const r = await enforceOverdueInvoices();
      expect(r.suspended).toBe(0);
      mc.select.mockReset().mockReturnValue(mc);
    });
  });

  describe("processDunning", () => {
    it("no subs", async () => {
      mc.select = vi.fn(() => Promise.resolve([]));
      const r = await processDunning();
      expect(r.actions).toHaveLength(0);
      mc.select.mockReset().mockReturnValue(mc);
    });
  });

  describe("checkFreeTierUserLimit", () => {
    it("allows paid sub", async () => {
      mc.first.mockResolvedValueOnce({ id: 1 });
      await checkFreeTierUserLimit(1);
    });

    it("allows no free sub", async () => {
      mc.first.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      await checkFreeTierUserLimit(1);
    });

    it("throws at limit", async () => {
      mc.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, plan_tier: "free" })
        .mockResolvedValueOnce({ count: 5 });
      await expect(checkFreeTierUserLimit(1)).rejects.toThrow("Free tier");
    });

    it("allows under limit", async () => {
      mc.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, plan_tier: "free" })
        .mockResolvedValueOnce({ count: 3 });
      await checkFreeTierUserLimit(1);
    });
  });
});
