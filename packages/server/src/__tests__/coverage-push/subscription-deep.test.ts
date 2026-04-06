import { describe, it, expect, vi, beforeEach } from "vitest";

// Build a chainable mock DB that handles all Knex patterns
function createChain(): any {
  const handler: any = {
    get(target: any, prop: string) {
      if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
      if (prop === "_mocks") return target._mocks;
      if (!target._mocks[prop]) {
        target._mocks[prop] = vi.fn(function(...args: any[]) {
          return new Proxy({ _mocks: { ...target._mocks } }, handler);
        });
      }
      return target._mocks[prop];
    }
  };
  const mocks: any = {};
  return new Proxy({ _mocks: mocks }, handler);
}

// Simpler approach: just mock at service level where possible
// For functions that use complex DB chaining, we test the error paths and simple paths

vi.mock("../../db/connection", () => {
  // A global chain that we can control per-test
  const chain: any = {};
  const allMethods = [
    "select","where","whereIn","whereNull","whereNot","whereRaw","andWhere",
    "orderBy","limit","offset","join","leftJoin","clone","whereNotIn",
    "orWhere","orWhereRaw","groupBy","having","as","whereNotNull","whereBetween",
  ];
  allMethods.forEach(m => { chain[m] = vi.fn(() => chain); });
  // Terminal methods
  chain.first = vi.fn(() => Promise.resolve(null));
  chain.insert = vi.fn(() => Promise.resolve([1]));
  chain.update = vi.fn(() => Promise.resolve(1));
  chain.delete = vi.fn(() => Promise.resolve(1));
  chain.count = vi.fn(() => Promise.resolve([{ count: 0, "count(*)": 0 }]));
  chain.increment = vi.fn(() => Promise.resolve(1));
  chain.decrement = vi.fn(() => Promise.resolve(1));

  const db: any = vi.fn(() => chain);
  db.raw = vi.fn(() => Promise.resolve([[], []]));
  db.transaction = vi.fn(async (cb: any) => cb(db));
  db._chain = chain;
  return { getDB: vi.fn(() => db), initDB: vi.fn() };
});

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

import { getDB } from "../../db/connection.js";
import {
  getSubscription, createSubscription, updateSubscription,
  cancelSubscription, assignSeat, revokeSeat, listSeats, syncUsedSeats,
  checkModuleAccess, getBillingStatus, checkFreeTierUserLimit,
} from "../../services/subscription/subscription.service.js";

function getChain() {
  return (getDB() as any)._chain;
}

function reset() {
  vi.clearAllMocks();
  const mc = getChain();
  const chainMethods = [
    "select","where","whereIn","whereNull","whereNot","whereRaw","andWhere",
    "orderBy","limit","offset","join","leftJoin","clone","whereNotIn",
  ];
  chainMethods.forEach(m => { mc[m].mockReset().mockReturnValue(mc); });
  mc.first.mockReset().mockResolvedValue(null);
  mc.insert.mockReset().mockResolvedValue([1]);
  mc.update.mockReset().mockResolvedValue(1);
  mc.delete.mockReset().mockResolvedValue(1);
  mc.count.mockReset().mockResolvedValue([{ count: 0, "count(*)": 0 }]);
  mc.increment.mockReset().mockResolvedValue(1);
  mc.decrement.mockReset().mockResolvedValue(1);
}

describe("Subscription Service Coverage", () => {
  beforeEach(reset);

  describe("getSubscription", () => {
    it("throws when not found", async () => {
      await expect(getSubscription(1, 99)).rejects.toThrow("Subscription");
    });
    it("returns sub", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce({ id: 1, status: "active" });
      const r = await getSubscription(1, 1);
      expect(r.id).toBe(1);
    });
  });

  describe("createSubscription", () => {
    it("throws on existing active sub", async () => {
      const mc = getChain();
      // free tier check: count().first() - count returns chain (for .first())
      mc.count.mockReturnValueOnce({ first: vi.fn(() => Promise.resolve({ count: 0 })) });
      // existing sub check
      mc.first.mockResolvedValueOnce({ id: 1, status: "active" });
      await expect(createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 5 } as any)).rejects.toThrow("already has an active");
    });

    it("creates fresh subscription", async () => {
      const mc = getChain();
      mc.first
        .mockResolvedValueOnce(null) // existing sub
        .mockResolvedValueOnce({ id: 1, name: "Payroll" }) // module
        .mockResolvedValueOnce({ id: 1, status: "active" }); // getSubscription
      mc.insert.mockResolvedValueOnce([1]);
      const r = await createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 10, billing_cycle: "monthly" } as any);
      expect(r).toBeTruthy();
    });

    it("reactivates cancelled sub", async () => {
      const mc = getChain();
      mc.first
        .mockResolvedValueOnce({ id: 5, status: "cancelled" })
        .mockResolvedValueOnce({ id: 1, name: "Payroll" })
        .mockResolvedValueOnce({ id: 5, status: "active" });
      mc.update.mockResolvedValue(1);
      const r = await createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 5, billing_cycle: "quarterly" } as any);
      expect(r).toBeTruthy();
    });

    it("creates trial sub", async () => {
      const mc = getChain();
      mc.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, name: "LMS" })
        .mockResolvedValueOnce({ id: 1, status: "trial" });
      mc.insert.mockResolvedValueOnce([1]);
      const r = await createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 5, trial_days: 14, billing_cycle: "annual" } as any);
      expect(r).toBeTruthy();
    });

    it("throws on free tier limit", async () => {
      const mc = getChain();
      mc.count.mockReturnValueOnce({ first: vi.fn(() => Promise.resolve({ count: 1 })) });
      await expect(createSubscription(1, { module_id: 1, plan_tier: "free", total_seats: 5 } as any)).rejects.toThrow("Free tier");
    });
  });

  describe("updateSubscription", () => {
    it("throws on reduce below used", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce({ id: 1, used_seats: 10, status: "active" });
      await expect(updateSubscription(1, 1, { total_seats: 5 } as any)).rejects.toThrow("Cannot reduce seats");
    });

    it("updates with plan_tier", async () => {
      const mc = getChain();
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
      const mc = getChain();
      mc.first
        .mockResolvedValueOnce({ id: 1, status: "active" })
        .mockResolvedValueOnce({ id: 1, status: "cancelled" });
      mc.update.mockResolvedValue(1);
      const r = await cancelSubscription(1, 1);
      expect(r).toBeTruthy();
    });
  });

  describe("assignSeat", () => {
    it("throws when no active sub", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce(null);
      await expect(assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 })).rejects.toThrow("Active subscription");
    });

    it("throws when seats full", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce({ id: 1, used_seats: 10, total_seats: 10 });
      await expect(assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 })).rejects.toThrow("No available seats");
    });

    it("throws when already assigned", async () => {
      const mc = getChain();
      mc.first
        .mockResolvedValueOnce({ id: 1, used_seats: 5, total_seats: 10 })
        .mockResolvedValueOnce({ id: 1 });
      await expect(assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 })).rejects.toThrow("already has a seat");
    });

    it("assigns", async () => {
      const mc = getChain();
      mc.first
        .mockResolvedValueOnce({ id: 1, used_seats: 5, total_seats: 10 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1 });
      const r = await assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 });
      expect(r).toBeTruthy();
    });
  });

  describe("revokeSeat", () => {
    it("throws when not found", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce(null);
      await expect(revokeSeat(1, 1, 1)).rejects.toThrow("Seat assignment");
    });

    it("revokes", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce({ id: 1, subscription_id: 1 });
      await revokeSeat(1, 1, 1);
    });
  });

  describe("syncUsedSeats", () => {
    it("no-op when no sub", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce(null);
      await syncUsedSeats(1, 1);
    });

    it("updates when mismatch", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce({ id: 1, used_seats: 3 });
      mc.count.mockResolvedValueOnce([{ count: 5 }]);
      await syncUsedSeats(1, 1);
    });
  });

  describe("checkModuleAccess", () => {
    it("no access when module not found", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce(null);
      const r = await checkModuleAccess({ userId: 1, orgId: 1, moduleSlug: "bad" });
      expect(r.has_access).toBe(false);
    });

    it("no access with suspended sub", async () => {
      const mc = getChain();
      mc.first
        .mockResolvedValueOnce({ id: 1, is_active: true })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, status: "suspended" });
      const r = await checkModuleAccess({ userId: 1, orgId: 1, moduleSlug: "payroll" });
      expect(r.has_access).toBe(false);
    });

    it("no access no sub", async () => {
      const mc = getChain();
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
      const mc = getChain();
      mc.select.mockResolvedValueOnce([]);
      const r = await getBillingStatus(1);
      expect(r.has_overdue).toBe(false);
    });

    it("with overdue subs - warning level", async () => {
      const mc = getChain();
      const periodEnd = new Date(Date.now() - 10 * 86400000);
      mc.select.mockResolvedValueOnce([{ id: 1, module_name: "Payroll", status: "past_due", current_period_end: periodEnd }]);
      const r = await getBillingStatus(1);
      expect(r.has_overdue).toBe(true);
      expect(r.warning_level).toBe("warning");
    });

    it("critical for 15+ days", async () => {
      const mc = getChain();
      const periodEnd = new Date(Date.now() - 20 * 86400000);
      mc.select.mockResolvedValueOnce([{ id: 1, module_name: "P", status: "suspended", current_period_end: periodEnd }]);
      const r = await getBillingStatus(1);
      expect(r.warning_level).toBe("critical");
    });

    it("critical for 30+ days", async () => {
      const mc = getChain();
      const periodEnd = new Date(Date.now() - 35 * 86400000);
      mc.select.mockResolvedValueOnce([{ id: 1, module_name: "P", status: "deactivated", current_period_end: periodEnd }]);
      const r = await getBillingStatus(1);
      expect(r.warning_level).toBe("critical");
    });

    it("info for < 7 days", async () => {
      const mc = getChain();
      const periodEnd = new Date(Date.now() - 3 * 86400000);
      mc.select.mockResolvedValueOnce([{ id: 1, module_name: "P", status: "past_due", current_period_end: periodEnd }]);
      const r = await getBillingStatus(1);
      expect(r.warning_level).toBe("info");
    });
  });

  describe("checkFreeTierUserLimit", () => {
    it("allows paid sub", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce({ id: 1 });
      await checkFreeTierUserLimit(1);
    });

    it("allows no free sub", async () => {
      const mc = getChain();
      mc.first.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      await checkFreeTierUserLimit(1);
    });

    it("throws at limit", async () => {
      const mc = getChain();
      mc.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, plan_tier: "free" });
      mc.count.mockResolvedValueOnce([{ count: 5 }]);
      await expect(checkFreeTierUserLimit(1)).rejects.toThrow("Free tier");
    });

    it("allows under limit", async () => {
      const mc = getChain();
      mc.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, plan_tier: "free" });
      mc.count.mockResolvedValueOnce([{ count: 3 }]);
      await checkFreeTierUserLimit(1);
    });
  });
});
