import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/connection", () => ({ getDB: vi.fn() }));
vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../services/module/module.service", () => ({
  getAccessibleFeatures: vi.fn().mockResolvedValue(["feature_a"]),
}));
vi.mock("../services/billing/billing-integration.service", () => ({
  createInvoice: vi.fn().mockResolvedValue("inv-123"),
  getBillingSubscriptionId: vi.fn().mockResolvedValue(null),
  cancelBillingSubscription: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/subscription/pricing", () => ({
  getPricePerSeat: vi.fn().mockReturnValue(100),
  getOrgCurrency: vi.fn().mockResolvedValue("INR"),
}));

import {
  getSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  assignSeat,
  revokeSeat,
  listSeats,
  syncUsedSeats,
  checkModuleAccess,
  getBillingStatus,
  checkFreeTierUserLimit,
} from "../services/subscription/subscription.service.js";
import { getDB } from "../db/connection.js";

const mockedGetDB = vi.mocked(getDB);

function createMockDB() {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.whereIn = vi.fn(() => chain);
  chain.whereNot = vi.fn(() => chain);
  chain.whereRaw = vi.fn(() => chain);
  chain.whereNotNull = vi.fn(() => chain);
  chain.first = vi.fn(() => chain._firstResult);
  chain.insert = vi.fn(() => [1]);
  chain.update = vi.fn(() => 1);
  chain.delete = vi.fn(() => 1);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.offset = vi.fn(() => chain);
  chain.count = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.clone = vi.fn(() => chain);
  chain.increment = vi.fn(() => chain);
  chain.decrement = vi.fn(() => chain);
  chain.join = vi.fn(() => chain);
  chain._firstResult = undefined;
  chain._result = [];
  chain.then = vi.fn((resolve: any) => resolve(chain._result));

  const db: any = vi.fn(() => chain);
  db.raw = vi.fn((sql: string) => sql);
  return { db, chain };
}

describe("subscription.service", () => {
  let db: any;
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockDB();
    db = mock.db;
    chain = mock.chain;
    mockedGetDB.mockReturnValue(db);
  });

  // -----------------------------------------------------------------------
  // getSubscription
  // -----------------------------------------------------------------------
  describe("getSubscription", () => {
    it("throws NotFoundError when subscription missing", async () => {
      chain._firstResult = undefined;
      await expect(getSubscription(1, 999)).rejects.toThrow("Subscription");
    });

    it("returns subscription when found", async () => {
      chain._firstResult = { id: 1, organization_id: 1, module_id: 2 };
      const result = await getSubscription(1, 1);
      expect(result.id).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // createSubscription
  // -----------------------------------------------------------------------
  describe("createSubscription", () => {
    it("throws ConflictError when active subscription exists", async () => {
      // free tier check returns no count
      chain._firstResult = { count: 0 };
      // Then existing check returns active sub
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { count: 0 }; // free tier check
        if (callCount === 2) return { id: 5, status: "active" }; // existing sub
        return { id: 5 }; // module lookup
      });

      await expect(
        createSubscription(1, {
          module_id: 2,
          plan_tier: "basic",
          total_seats: 10,
        } as any)
      ).rejects.toThrow("already has an active subscription");
    });

    it("reactivates cancelled subscription instead of inserting new", async () => {
      // plan_tier "basic" skips free tier check, so first first() = existing sub check
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 5, status: "cancelled" }; // existing cancelled
        if (callCount === 2) return { name: "Payroll" }; // module lookup
        return { id: 5, status: "active" }; // getSubscription
      });

      const result = await createSubscription(1, {
        module_id: 2,
        plan_tier: "basic",
        total_seats: 10,
      } as any);

      expect(chain.update).toHaveBeenCalled();
    });

    it("creates new subscription with trial period", async () => {
      // plan_tier "basic" skips free tier check, so first first() = existing sub check
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return undefined; // no existing sub
        if (callCount === 2) return { name: "Payroll" }; // module lookup
        return { id: 1, status: "trial" }; // getSubscription
      });
      chain.insert.mockReturnValue([1]);

      const result = await createSubscription(1, {
        module_id: 2,
        plan_tier: "basic",
        total_seats: 5,
        trial_days: 14,
      } as any);

      const insertArgs = chain.insert.mock.calls[0][0];
      expect(insertArgs.status).toBe("trial");
      expect(insertArgs.trial_ends_at).toBeInstanceOf(Date);
    });
  });

  // -----------------------------------------------------------------------
  // updateSubscription
  // -----------------------------------------------------------------------
  describe("updateSubscription", () => {
    it("throws ValidationError when reducing seats below usage", async () => {
      chain._firstResult = { id: 1, used_seats: 8, total_seats: 10 };

      await expect(
        updateSubscription(1, 1, { total_seats: 5 } as any)
      ).rejects.toThrow("Cannot reduce seats below current usage");
    });
  });

  // -----------------------------------------------------------------------
  // assignSeat
  // -----------------------------------------------------------------------
  describe("assignSeat", () => {
    it("throws NotFoundError when no active subscription", async () => {
      chain._firstResult = undefined;
      await expect(
        assignSeat({ orgId: 1, moduleId: 2, userId: 10, assignedBy: 5 })
      ).rejects.toThrow("Active subscription");
    });

    it("throws ValidationError when no available seats", async () => {
      chain._firstResult = { id: 1, used_seats: 10, total_seats: 10 };
      await expect(
        assignSeat({ orgId: 1, moduleId: 2, userId: 10, assignedBy: 5 })
      ).rejects.toThrow("No available seats");
    });

    it("throws ConflictError on duplicate seat assignment", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, used_seats: 5, total_seats: 10 }; // subscription
        if (callCount === 2) return { id: 99 }; // existing seat
        return undefined;
      });

      await expect(
        assignSeat({ orgId: 1, moduleId: 2, userId: 10, assignedBy: 5 })
      ).rejects.toThrow("already has a seat");
    });

    it("assigns seat and increments used_seats", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, used_seats: 5, total_seats: 10 };
        if (callCount === 2) return undefined; // no existing seat
        return { id: 50 }; // return newly created seat
      });
      chain.insert.mockReturnValue([50]);

      const result = await assignSeat({ orgId: 1, moduleId: 2, userId: 10, assignedBy: 5 });
      expect(chain.increment).toHaveBeenCalledWith("used_seats", 1);
    });
  });

  // -----------------------------------------------------------------------
  // revokeSeat
  // -----------------------------------------------------------------------
  describe("revokeSeat", () => {
    it("throws NotFoundError when seat not found", async () => {
      chain._firstResult = undefined;
      await expect(revokeSeat(1, 2, 10)).rejects.toThrow("Seat assignment");
    });

    it("deletes seat and decrements used_seats", async () => {
      chain._firstResult = { id: 50, subscription_id: 1 };

      await revokeSeat(1, 2, 10);
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.decrement).toHaveBeenCalledWith("used_seats", 1);
    });
  });

  // -----------------------------------------------------------------------
  // syncUsedSeats
  // -----------------------------------------------------------------------
  describe("syncUsedSeats", () => {
    it("does nothing when no active subscription", async () => {
      chain._firstResult = undefined;
      await syncUsedSeats(1, 2);
      expect(chain.update).not.toHaveBeenCalled();
    });

    it("updates used_seats when count differs", async () => {
      chain._firstResult = { id: 1, used_seats: 5 };
      chain._result = [{ count: 3 }];

      await syncUsedSeats(1, 2);
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ used_seats: 3 })
      );
    });

    it("skips update when count matches", async () => {
      chain._firstResult = { id: 1, used_seats: 5 };
      chain._result = [{ count: 5 }];

      await syncUsedSeats(1, 2);
      expect(chain.update).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // checkModuleAccess
  // -----------------------------------------------------------------------
  describe("checkModuleAccess", () => {
    it("returns no access when module not found", async () => {
      chain._firstResult = undefined;
      const result = await checkModuleAccess({ userId: 10, orgId: 1, moduleSlug: "nonexistent" });
      expect(result.has_access).toBe(false);
    });

    it("returns no access with suspended subscription info", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 2, slug: "payroll", is_active: true }; // module
        if (callCount === 2) return undefined; // no active sub
        if (callCount === 3) return { id: 5, status: "suspended" }; // suspended sub
        return undefined;
      });

      const result = await checkModuleAccess({ userId: 10, orgId: 1, moduleSlug: "payroll" });
      expect(result.has_access).toBe(false);
      expect(result.subscription?.status).toBe("suspended");
    });
  });

  // -----------------------------------------------------------------------
  // getBillingStatus
  // -----------------------------------------------------------------------
  describe("getBillingStatus", () => {
    it("returns no overdue when no problematic subscriptions", async () => {
      chain._result = [];
      chain.then.mockImplementation((resolve: any) => resolve([]));

      const result = await getBillingStatus(1);
      expect(result.has_overdue).toBe(false);
      expect(result.warning_level).toBe("none");
    });

    it("returns critical when 30+ days overdue", async () => {
      const longOverdue = new Date();
      longOverdue.setDate(longOverdue.getDate() - 35);

      chain._result = [
        { id: 1, module_name: "Payroll", status: "past_due", current_period_end: longOverdue },
      ];
      chain.then.mockImplementation((resolve: any) =>
        resolve([{ id: 1, module_name: "Payroll", status: "past_due", current_period_end: longOverdue }])
      );

      const result = await getBillingStatus(1);
      expect(result.has_overdue).toBe(true);
      expect(result.warning_level).toBe("critical");
      expect(result.days_overdue).toBeGreaterThanOrEqual(30);
    });
  });

  // -----------------------------------------------------------------------
  // checkFreeTierUserLimit
  // -----------------------------------------------------------------------
  describe("checkFreeTierUserLimit", () => {
    it("does nothing when paid subscription exists", async () => {
      chain._firstResult = { id: 1 }; // paid sub found
      await expect(checkFreeTierUserLimit(1)).resolves.toBeUndefined();
    });

    it("does nothing when no free subscription exists", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return undefined; // no paid sub
        return undefined; // no free sub
      });
      await expect(checkFreeTierUserLimit(1)).resolves.toBeUndefined();
    });

    it("throws ForbiddenError when at user limit with free tier", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return undefined; // no paid sub
        return { id: 1, plan_tier: "free" }; // free sub exists
      });
      chain._result = [{ count: 5 }]; // at limit

      await expect(checkFreeTierUserLimit(1)).rejects.toThrow("Free tier is limited to");
    });
  });
});
