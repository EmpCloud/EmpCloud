// =============================================================================
// EMP CLOUD — Asset Service Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChain: any = {};
const chainMethods = [
  "select", "where", "andWhere", "orWhere", "whereRaw", "whereNull",
  "whereIn", "whereNot", "whereNotNull", "first", "insert", "update",
  "del", "count", "join", "leftJoin", "orderBy", "limit", "offset",
  "groupBy", "raw", "clone", "increment", "decrement",
];
chainMethods.forEach((m) => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.first = vi.fn().mockResolvedValue(null);

const mockDb: any = vi.fn().mockReturnValue(mockChain);
mockDb.raw = vi.fn();
mockDb.schema = { hasTable: vi.fn().mockResolvedValue(false) };

vi.mock("../../db/connection.js", () => ({
  getDB: vi.fn(() => mockDb),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  createAsset, assignAsset, returnAsset, retireAsset,
  reportLost, getExpiringWarranties, getAsset, updateAsset,
} from "./asset.service.js";
import { NotFoundError, ForbiddenError } from "../../utils/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetChain() {
  chainMethods.forEach((m) => {
    mockChain[m] = vi.fn().mockReturnValue(mockChain);
  });
  mockChain.first = vi.fn().mockResolvedValue(null);
  mockDb.mockReturnValue(mockChain);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AssetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  // =========================================================================
  // createAsset()
  // =========================================================================

  describe("createAsset()", () => {
    it("should generate asset tag in format AST-YYYY-NNNN", async () => {
      const year = new Date().getFullYear();
      // generateAssetTag: count query
      mockChain.count.mockResolvedValueOnce([{ count: 5 }]);
      // insert asset
      mockChain.insert.mockResolvedValueOnce([1]);
      // logHistory insert
      mockChain.insert.mockResolvedValueOnce([1]);
      // return asset
      mockChain.first.mockResolvedValueOnce({
        id: 1, asset_tag: `AST-${year}-0006`, status: "available",
      });

      const result = await createAsset(1, 10, { name: "MacBook Pro" });

      expect(result.asset_tag).toMatch(/^AST-\d{4}-\d{4}$/);
      expect(result.asset_tag).toBe(`AST-${year}-0006`);
    });

    it("should create asset with status 'available' by default", async () => {
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.insert.mockResolvedValueOnce([1]); // history
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "available" });

      await createAsset(1, 10, { name: "Laptop" });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.status).toBe("available");
    });

    it("should store all provided optional fields", async () => {
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1 });

      await createAsset(1, 10, {
        name: "Dell Monitor",
        serial_number: "SN-12345",
        brand: "Dell",
        model: "U2723QE",
        purchase_date: "2026-01-15",
        purchase_cost: 45000,
        warranty_expiry: "2029-01-15",
      });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.serial_number).toBe("SN-12345");
      expect(insertArgs.brand).toBe("Dell");
      expect(insertArgs.model).toBe("U2723QE");
      expect(insertArgs.purchase_cost).toBe(45000);
    });

    it("should log creation in asset_history", async () => {
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.insert.mockResolvedValueOnce([1]); // history
      mockChain.first.mockResolvedValueOnce({ id: 1 });

      await createAsset(1, 10, { name: "Keyboard" });

      // Second insert should be asset_history
      expect(mockChain.insert).toHaveBeenCalledTimes(2);
      const historyInsert = mockChain.insert.mock.calls[1][0];
      expect(historyInsert.action).toBe("created");
      expect(historyInsert.performed_by).toBe(10);
    });

    it("should start asset tag numbering from 0001", async () => {
      const year = new Date().getFullYear();
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({
        id: 1, asset_tag: `AST-${year}-0001`,
      });

      const result = await createAsset(1, 10, { name: "Mouse" });
      expect(result.asset_tag).toBe(`AST-${year}-0001`);
    });
  });

  // =========================================================================
  // assignAsset()
  // =========================================================================

  describe("assignAsset()", () => {
    it("should throw NotFoundError if asset does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(assignAsset(1, 999, 10, 5)).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenError if asset is already assigned", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "assigned" });
      await expect(assignAsset(1, 1, 10, 5)).rejects.toThrow("already assigned");
    });

    it("should throw ForbiddenError if asset is retired", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "retired" });
      await expect(assignAsset(1, 1, 10, 5)).rejects.toThrow(ForbiddenError);
    });

    it("should throw ForbiddenError if asset is lost", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "lost" });
      await expect(assignAsset(1, 1, 10, 5)).rejects.toThrow(ForbiddenError);
    });

    it("should update status to 'assigned' and set assigned_to", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "available" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.insert.mockResolvedValueOnce([1]); // history
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "assigned", assigned_to: 10,
      });

      const result = await assignAsset(1, 1, 10, 5);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.status).toBe("assigned");
      expect(updateArgs.assigned_to).toBe(10);
      expect(updateArgs.assigned_by).toBe(5);
      expect(result.assigned_to).toBe(10);
    });

    it("should log assignment in asset_history", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "available" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "assigned" });

      await assignAsset(1, 1, 10, 5, "New joiner laptop");

      const historyInsert = mockChain.insert.mock.calls[0][0];
      expect(historyInsert.action).toBe("assigned");
      expect(historyInsert.to_user_id).toBe(10);
      expect(historyInsert.performed_by).toBe(5);
    });
  });

  // =========================================================================
  // returnAsset()
  // =========================================================================

  describe("returnAsset()", () => {
    it("should throw NotFoundError if asset does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(returnAsset(1, 999, 10)).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenError if asset is not currently assigned", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "available" });
      await expect(returnAsset(1, 1, 10)).rejects.toThrow("not currently assigned");
    });

    it("should update status to 'available' and clear assignment fields", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "assigned", assigned_to: 10,
      });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.insert.mockResolvedValueOnce([1]); // history
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "available", assigned_to: null,
      });

      const result = await returnAsset(1, 1, 10);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.status).toBe("available");
      expect(updateArgs.assigned_to).toBeNull();
      expect(updateArgs.assigned_at).toBeNull();
      expect(result.status).toBe("available");
    });

    it("should log return in asset_history with from_user_id", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "assigned", assigned_to: 10,
      });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "available" });

      await returnAsset(1, 1, 10);

      const historyInsert = mockChain.insert.mock.calls[0][0];
      expect(historyInsert.action).toBe("returned");
      expect(historyInsert.from_user_id).toBe(10);
    });

    it("should update condition_status if provided", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "assigned", assigned_to: 10,
      });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, condition_status: "fair" });

      await returnAsset(1, 1, 10, "fair");

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.condition_status).toBe("fair");
    });
  });

  // =========================================================================
  // getExpiringWarranties()
  // =========================================================================

  describe("getExpiringWarranties()", () => {
    it("should query assets with warranty expiring within N days", async () => {
      mockChain.orderBy.mockResolvedValueOnce([
        { id: 1, warranty_expiry: "2026-04-15", name: "Laptop A" },
        { id: 2, warranty_expiry: "2026-04-20", name: "Monitor B" },
      ]);

      const result = await getExpiringWarranties(1, 30);

      expect(result).toHaveLength(2);
      expect(mockChain.whereNotNull).toHaveBeenCalledWith("warranty_expiry");
      expect(mockChain.whereNot).toHaveBeenCalledWith("status", "retired");
    });

    it("should default to 30 days if no days parameter specified", async () => {
      mockChain.orderBy.mockResolvedValueOnce([]);

      await getExpiringWarranties(1);

      // The where clause with date should be called
      expect(mockChain.where).toHaveBeenCalled();
    });

    it("should exclude retired assets", async () => {
      mockChain.orderBy.mockResolvedValueOnce([]);

      await getExpiringWarranties(1, 60);

      expect(mockChain.whereNot).toHaveBeenCalledWith("status", "retired");
    });
  });

  // =========================================================================
  // retireAsset()
  // =========================================================================

  describe("retireAsset()", () => {
    it("should throw ForbiddenError if asset is already retired", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "retired" });
      await expect(retireAsset(1, 1, 10)).rejects.toThrow(ForbiddenError);
    });

    it("should set status to 'retired' and clear assignment", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "available", assigned_to: null });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "retired" });

      const result = await retireAsset(1, 1, 10);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.status).toBe("retired");
      expect(updateArgs.assigned_to).toBeNull();
    });
  });

  // =========================================================================
  // reportLost()
  // =========================================================================

  describe("reportLost()", () => {
    it("should throw ForbiddenError if asset is already lost", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "lost" });
      await expect(reportLost(1, 1, 10)).rejects.toThrow(ForbiddenError);
    });

    it("should set status to 'lost'", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "assigned" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "lost" });

      const result = await reportLost(1, 1, 10);
      expect(result.status).toBe("lost");
    });
  });
});
