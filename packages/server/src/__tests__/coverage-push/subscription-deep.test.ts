import { describe, it, expect, vi, beforeEach } from "vitest";

function buildMockDB() {
  const chain: any = {};
  const methods = ["select","where","whereIn","whereNull","whereNot","whereRaw","andWhere","first","insert","update","delete","orderBy","limit","offset","join","leftJoin","clone","count","increment","decrement","whereNotIn"];
  methods.forEach(m => { chain[m] = vi.fn(() => chain); });
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
  return { db, chain };
}

const { db: mockDB, chain: mockChain } = buildMockDB();

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
  listSubscriptions, getSubscription, createSubscription, updateSubscription,
  cancelSubscription, assignSeat, revokeSeat, listSeats, syncUsedSeats,
  checkModuleAccess, getBillingStatus, enforceOverdueInvoices, processDunning,
  checkFreeTierUserLimit,
} from "../../services/subscription/subscription.service.js";

function resetChain() {
  Object.values(mockChain).forEach((fn: any) => {
    if (typeof fn === "function" && fn.mockReset) fn.mockReset();
  });
  const chainMethods = ["select","where","whereIn","whereNull","whereNot","whereRaw","andWhere","orderBy","limit","offset","join","leftJoin","clone","whereNotIn"];
  chainMethods.forEach(m => { mockChain[m].mockReturnValue(mockChain); });
  mockChain.first.mockResolvedValue(null);
  mockChain.insert.mockResolvedValue([1]);
  mockChain.update.mockResolvedValue(1);
  mockChain.delete.mockResolvedValue(1);
  mockChain.count.mockResolvedValue([{ count: 0, "count(*)": 0 }]);
  mockChain.increment.mockResolvedValue(1);
  mockChain.decrement.mockResolvedValue(1);
}

describe("Subscription Service Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  describe("getSubscription", () => {
    it("throws when not found", async () => {
      await expect(getSubscription(1, 99)).rejects.toThrow("Subscription");
    });
    it("returns subscription", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "active" });
      const r = await getSubscription(1, 1);
      expect(r.id).toBe(1);
    });
  });

  describe("createSubscription", () => {
    it("throws on free tier module limit", async () => {
      mockChain.first.mockResolvedValueOnce({ count: 1 }); // active free subs
      await expect(createSubscription(1, { module_id: 1, plan_tier: "free", total_seats: 5 } as any)).rejects.toThrow("Free tier");
    });

    it("throws on existing active subscription", async () => {
      mockChain.first
        .mockResolvedValueOnce(null) // free tier check - no active free subs (not free tier)
        .mockResolvedValueOnce({ id: 1, status: "active" }); // existing sub
      await expect(createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 5 } as any)).rejects.toThrow("already has an active");
    });

    it("creates fresh subscription", async () => {
      mockChain.first
        .mockResolvedValueOnce(null) // existing check
        .mockResolvedValueOnce({ id: 1, name: "Payroll" }) // module name
        .mockResolvedValueOnce({ id: 1, status: "active" }); // getSubscription return
      mockChain.insert.mockResolvedValueOnce([1]);
      const r = await createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 10, billing_cycle: "monthly" } as any);
      expect(r).toBeTruthy();
    });

    it("reactivates cancelled subscription", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 5, status: "cancelled" }) // existing cancelled
        .mockResolvedValueOnce({ id: 1, name: "Payroll" }) // module
        .mockResolvedValueOnce({ id: 5, status: "active" }); // getSubscription
      mockChain.update.mockResolvedValue(1);
      const r = await createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 5, billing_cycle: "quarterly" } as any);
      expect(r).toBeTruthy();
    });

    it("creates trial subscription", async () => {
      mockChain.first
        .mockResolvedValueOnce(null) // existing
        .mockResolvedValueOnce({ id: 1, name: "LMS" }) // module
        .mockResolvedValueOnce({ id: 1, status: "trial" }); // getSubscription
      mockChain.insert.mockResolvedValueOnce([1]);
      const r = await createSubscription(1, { module_id: 1, plan_tier: "starter", total_seats: 5, trial_days: 14, billing_cycle: "annual" } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("updateSubscription", () => {
    it("throws when reducing below used seats", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, used_seats: 10, status: "active" });
      await expect(updateSubscription(1, 1, { total_seats: 5 } as any)).rejects.toThrow("Cannot reduce seats");
    });

    it("updates with plan_tier change", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, used_seats: 2, status: "active" }) // getSub
        .mockResolvedValueOnce({ id: 1, status: "active" }); // getSub after update
      mockChain.update.mockResolvedValue(1);
      const r = await updateSubscription(1, 1, { plan_tier: "pro", total_seats: 20 } as any);
      expect(r).toBeTruthy();
    });
  });

  describe("cancelSubscription", () => {
    it("cancels and removes seats", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, status: "active" }) // getSub check
        .mockResolvedValueOnce({ id: 1, status: "cancelled" }); // getSub return
      mockChain.update.mockResolvedValue(1);
      mockChain.delete.mockResolvedValue(3);
      const r = await cancelSubscription(1, 1);
      expect(r).toBeTruthy();
    });
  });

  describe("assignSeat", () => {
    it("throws when no active subscription", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 })).rejects.toThrow("Active subscription");
    });

    it("throws when no available seats", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, used_seats: 10, total_seats: 10 });
      await expect(assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 })).rejects.toThrow("No available seats");
    });

    it("throws when already assigned", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, used_seats: 5, total_seats: 10 })
        .mockResolvedValueOnce({ id: 1 }); // existing seat
      await expect(assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 })).rejects.toThrow("already has a seat");
    });

    it("assigns seat successfully", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, used_seats: 5, total_seats: 10 })
        .mockResolvedValueOnce(null) // no existing
        .mockResolvedValueOnce({ id: 1 }); // return seat
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.increment.mockResolvedValueOnce(1);
      const r = await assignSeat({ orgId: 1, moduleId: 1, userId: 1, assignedBy: 2 });
      expect(r).toBeTruthy();
    });
  });

  describe("revokeSeat", () => {
    it("throws when not found", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(revokeSeat(1, 1, 1)).rejects.toThrow("Seat assignment");
    });

    it("revokes successfully", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, subscription_id: 1 });
      mockChain.delete.mockResolvedValueOnce(1);
      mockChain.decrement.mockResolvedValueOnce(1);
      await revokeSeat(1, 1, 1);
    });
  });

  describe("listSeats", () => {
    it("returns seats", async () => {
      mockChain.select.mockResolvedValueOnce([{ id: 1, user_id: 1 }]);
      const r = await listSeats(1, 1);
      expect(r).toBeTruthy();
    });
  });

  describe("syncUsedSeats", () => {
    it("does nothing when no active sub", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await syncUsedSeats(1, 1);
    });

    it("updates when count differs", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, used_seats: 3 });
      mockChain.count.mockResolvedValueOnce([{ count: 5 }]);
      mockChain.update.mockResolvedValueOnce(1);
      await syncUsedSeats(1, 1);
    });

    it("skips when count matches", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, used_seats: 5 });
      mockChain.count.mockResolvedValueOnce([{ count: 5 }]);
      await syncUsedSeats(1, 1);
    });
  });

  describe("checkModuleAccess", () => {
    it("returns no access when module not found", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      const r = await checkModuleAccess({ userId: 1, orgId: 1, moduleSlug: "bad" });
      expect(r.has_access).toBe(false);
    });

    it("returns no access with suspended sub info", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, is_active: true }) // module
        .mockResolvedValueOnce(null) // no active sub
        .mockResolvedValueOnce({ id: 1, status: "suspended" }); // suspended sub
      const r = await checkModuleAccess({ userId: 1, orgId: 1, moduleSlug: "payroll" });
      expect(r.has_access).toBe(false);
    });

    it("returns access with seat", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, is_active: true }) // module
        .mockResolvedValueOnce({ id: 1, status: "active", plan_tier: "starter" }) // active sub
        .mockResolvedValueOnce({ id: 1 }); // seat
      const r = await checkModuleAccess({ userId: 1, orgId: 1, moduleSlug: "payroll" });
      expect(r.has_access).toBe(true);
    });

    it("returns no access without seat", async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: 1, is_active: true })
        .mockResolvedValueOnce({ id: 1, status: "active", plan_tier: "starter" })
        .mockResolvedValueOnce(null); // no seat
      const r = await checkModuleAccess({ userId: 1, orgId: 1, moduleSlug: "payroll" });
      expect(r.has_access).toBe(false);
    });
  });

  describe("getBillingStatus", () => {
    it("returns no overdue when clean", async () => {
      mockChain.select.mockResolvedValueOnce([]);
      const r = await getBillingStatus(1);
      expect(r.has_overdue).toBe(false);
    });

    it("returns info level for recent overdue", async () => {
      const periodEnd = new Date(Date.now() - 3 * 86400000); // 3 days ago
      mockChain.select.mockResolvedValueOnce([{ id: 1, module_name: "Payroll", status: "past_due", current_period_end: periodEnd, dunning_stage: "reminder" }]);
      const r = await getBillingStatus(1);
      expect(r.has_overdue).toBe(true);
      expect(r.warning_level).toBe("info");
    });

    it("returns warning for 7+ days overdue", async () => {
      const periodEnd = new Date(Date.now() - 10 * 86400000);
      mockChain.select.mockResolvedValueOnce([{ id: 1, module_name: "Payroll", status: "past_due", current_period_end: periodEnd }]);
      const r = await getBillingStatus(1);
      expect(r.warning_level).toBe("warning");
    });

    it("returns critical for 15+ days overdue", async () => {
      const periodEnd = new Date(Date.now() - 20 * 86400000);
      mockChain.select.mockResolvedValueOnce([{ id: 1, module_name: "Payroll", status: "suspended", current_period_end: periodEnd }]);
      const r = await getBillingStatus(1);
      expect(r.warning_level).toBe("critical");
    });

    it("returns critical for 30+ days overdue", async () => {
      const periodEnd = new Date(Date.now() - 35 * 86400000);
      mockChain.select.mockResolvedValueOnce([{ id: 1, module_name: "Payroll", status: "deactivated", current_period_end: periodEnd }]);
      const r = await getBillingStatus(1);
      expect(r.warning_level).toBe("critical");
    });
  });

  describe("enforceOverdueInvoices", () => {
    it("handles no overdue subscriptions", async () => {
      mockChain.select.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const r = await enforceOverdueInvoices();
      expect(r.suspended).toBe(0);
      expect(r.deactivated).toBe(0);
    });

    it("suspends 15+ day overdue mapped subscription", async () => {
      const periodEnd = new Date(Date.now() - 20 * 86400000);
      mockChain.select
        .mockResolvedValueOnce([{ organization_id: 1, cloud_subscription_id: 1, current_status: "active", current_period_end: periodEnd }])
        .mockResolvedValueOnce([]); // pastDueSubs
      // getGracePeriodDays mock
      mockChain.first.mockResolvedValueOnce({ grace_period_days: 0 });
      mockChain.update.mockResolvedValue(1);
      const r = await enforceOverdueInvoices();
      expect(r.suspended).toBe(1);
    });

    it("deactivates 30+ day overdue", async () => {
      const periodEnd = new Date(Date.now() - 35 * 86400000);
      mockChain.select
        .mockResolvedValueOnce([{ organization_id: 1, cloud_subscription_id: 1, current_status: "active", current_period_end: periodEnd }])
        .mockResolvedValueOnce([]);
      mockChain.first.mockResolvedValueOnce({ grace_period_days: 0 });
      mockChain.update.mockResolvedValue(1);
      const r = await enforceOverdueInvoices();
      expect(r.deactivated).toBe(1);
    });

    it("skips within grace period", async () => {
      const periodEnd = new Date(Date.now() - 5 * 86400000);
      mockChain.select
        .mockResolvedValueOnce([{ organization_id: 1, cloud_subscription_id: 1, current_status: "active", current_period_end: periodEnd }])
        .mockResolvedValueOnce([]);
      mockChain.first.mockResolvedValueOnce({ grace_period_days: 10 }); // 10 day grace > 5 days overdue
      const r = await enforceOverdueInvoices();
      expect(r.gracePeriodSkipped).toBe(1);
    });

    it("handles past_due subs without billing mappings", async () => {
      const periodEnd = new Date(Date.now() - 35 * 86400000);
      mockChain.select
        .mockResolvedValueOnce([]) // no mappings
        .mockResolvedValueOnce([{ id: 1, organization_id: 1, current_period_end: periodEnd }]);
      mockChain.first.mockResolvedValueOnce({ grace_period_days: 0 });
      mockChain.update.mockResolvedValue(1);
      const r = await enforceOverdueInvoices();
      expect(r.deactivated).toBe(1);
    });
  });

  describe("processDunning", () => {
    it("handles no overdue subscriptions", async () => {
      mockChain.select.mockResolvedValueOnce([]);
      const r = await processDunning();
      expect(r.actions).toHaveLength(0);
    });

    it("sends reminder for 1-6 day overdue", async () => {
      const periodEnd = new Date(Date.now() - 3 * 86400000);
      mockChain.select.mockResolvedValueOnce([{ id: 1, organization_id: 1, status: "active", current_period_end: periodEnd, dunning_stage: "current" }]);
      mockChain.first.mockResolvedValueOnce({ grace_period_days: 0 });
      mockChain.update.mockResolvedValue(1);
      const r = await processDunning();
      expect(r.actions.length).toBeGreaterThan(0);
      expect(r.actions[0].stage).toBe("reminder");
    });

    it("sends warning for 7+ day overdue", async () => {
      const periodEnd = new Date(Date.now() - 10 * 86400000);
      mockChain.select.mockResolvedValueOnce([{ id: 1, organization_id: 1, status: "past_due", current_period_end: periodEnd, dunning_stage: "reminder" }]);
      mockChain.first.mockResolvedValueOnce({ grace_period_days: 0 });
      mockChain.update.mockResolvedValue(1);
      const r = await processDunning();
      expect(r.actions[0].stage).toBe("warning");
    });

    it("suspends for 15+ day overdue", async () => {
      const periodEnd = new Date(Date.now() - 20 * 86400000);
      mockChain.select.mockResolvedValueOnce([{ id: 1, organization_id: 1, status: "past_due", current_period_end: periodEnd, dunning_stage: "warning" }]);
      mockChain.first.mockResolvedValueOnce({ grace_period_days: 0 });
      mockChain.update.mockResolvedValue(1);
      const r = await processDunning();
      expect(r.actions[0].stage).toBe("suspended");
    });

    it("deactivates for 30+ day overdue", async () => {
      const periodEnd = new Date(Date.now() - 35 * 86400000);
      mockChain.select.mockResolvedValueOnce([{ id: 1, organization_id: 1, status: "suspended", current_period_end: periodEnd, dunning_stage: "suspended" }]);
      mockChain.first.mockResolvedValueOnce({ grace_period_days: 0 });
      mockChain.update.mockResolvedValue(1);
      const r = await processDunning();
      expect(r.actions[0].stage).toBe("deactivated");
    });

    it("skips when already at or past target stage", async () => {
      const periodEnd = new Date(Date.now() - 3 * 86400000);
      mockChain.select.mockResolvedValueOnce([{ id: 1, organization_id: 1, status: "past_due", current_period_end: periodEnd, dunning_stage: "warning" }]);
      mockChain.first.mockResolvedValueOnce({ grace_period_days: 0 });
      const r = await processDunning();
      expect(r.actions).toHaveLength(0);
    });
  });

  describe("checkFreeTierUserLimit", () => {
    it("allows when paid sub exists", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1 }); // paid sub
      await checkFreeTierUserLimit(1); // should not throw
    });

    it("allows when no free sub", async () => {
      mockChain.first.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      await checkFreeTierUserLimit(1);
    });

    it("throws when free tier user limit reached", async () => {
      mockChain.first
        .mockResolvedValueOnce(null) // no paid sub
        .mockResolvedValueOnce({ id: 1, plan_tier: "free" }); // free sub
      mockChain.count.mockResolvedValueOnce([{ count: 5 }]);
      await expect(checkFreeTierUserLimit(1)).rejects.toThrow("Free tier");
    });

    it("allows when under free tier limit", async () => {
      mockChain.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, plan_tier: "free" });
      mockChain.count.mockResolvedValueOnce([{ count: 3 }]);
      await checkFreeTierUserLimit(1);
    });
  });
});
