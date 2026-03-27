// =============================================================================
// EMP CLOUD — Org Service Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChain: any = {};
const chainMethods = [
  "select", "where", "andWhere", "orWhere", "whereRaw", "whereNull",
  "whereIn", "whereNot", "first", "insert", "update", "del", "count",
  "join", "leftJoin", "orderBy", "limit", "offset", "groupBy", "raw",
  "clone",
];
chainMethods.forEach((m) => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.first = vi.fn().mockResolvedValue(null);

const mockDb: any = vi.fn().mockReturnValue(mockChain);
mockDb.raw = vi.fn();

vi.mock("../../db/connection.js", () => ({
  getDB: vi.fn(() => mockDb),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getOrg, updateOrg, getOrgStats,
  createDepartment, deleteDepartment, listDepartments,
  createLocation, deleteLocation, listLocations,
} from "./org.service.js";
import { NotFoundError, ConflictError } from "../../utils/errors.js";

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

describe("OrgService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  // =========================================================================
  // getOrg()
  // =========================================================================

  describe("getOrg()", () => {
    it("should return organization by ID", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Acme Corp" });

      const result = await getOrg(1);
      expect(result.name).toBe("Acme Corp");
    });

    it("should throw NotFoundError if org does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(getOrg(999)).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // updateOrg()
  // =========================================================================

  describe("updateOrg()", () => {
    it("should update org and return updated data", async () => {
      mockChain.update.mockResolvedValueOnce(1);
      // getOrg called after update
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Acme Corp Updated", timezone: "UTC" });

      const result = await updateOrg(1, { name: "Acme Corp Updated" } as any);
      expect(result.name).toBe("Acme Corp Updated");
    });
  });

  // =========================================================================
  // getOrgStats()
  // =========================================================================

  describe("getOrgStats()", () => {
    it("should return user count, department count, and subscription count", async () => {
      mockChain.count.mockResolvedValueOnce([{ userCount: 50 }]);
      mockChain.count.mockResolvedValueOnce([{ deptCount: 8 }]);
      mockChain.count.mockResolvedValueOnce([{ subCount: 3 }]);

      const result = await getOrgStats(1) as any;

      expect(result.total_users).toBe(50);
      expect(result.total_departments).toBe(8);
      expect(result.active_subscriptions).toBe(3);
    });
  });

  // =========================================================================
  // createDepartment()
  // =========================================================================

  describe("createDepartment()", () => {
    it("should create a department successfully", async () => {
      // Check for duplicate -> null
      mockChain.first.mockResolvedValueOnce(null);
      // Insert
      mockChain.insert.mockResolvedValueOnce([1]);
      // Return
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Engineering" });

      const result = await createDepartment(1, "Engineering");
      expect(result.name).toBe("Engineering");
    });

    it("should reject duplicate department names (case-insensitive)", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Engineering" });
      await expect(createDepartment(1, "engineering")).rejects.toThrow(ConflictError);
    });

    it("should reject duplicate department names regardless of casing", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Engineering" });
      await expect(createDepartment(1, "ENGINEERING")).rejects.toThrow("already exists");
    });

    it("should trim whitespace from name", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Sales" });

      await createDepartment(1, "  Sales  ");

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.name).toBe("Sales");
    });

    it("should use case-insensitive comparison via LOWER()", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1 });

      await createDepartment(1, "Marketing");

      expect(mockChain.whereRaw).toHaveBeenCalledWith(
        "LOWER(name) = LOWER(?)",
        ["Marketing"],
      );
    });

    it("should only check non-deleted departments for uniqueness", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1 });

      await createDepartment(1, "HR");

      expect(mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ is_deleted: false }),
      );
    });
  });

  // =========================================================================
  // deleteDepartment()
  // =========================================================================

  describe("deleteDepartment()", () => {
    it("should soft-delete department by setting is_deleted=true", async () => {
      mockChain.update.mockResolvedValueOnce(1);

      await deleteDepartment(1, 5);

      expect(mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_deleted: true }),
      );
    });

    it("should filter by both org_id and dept_id", async () => {
      mockChain.update.mockResolvedValueOnce(1);

      await deleteDepartment(1, 5);

      expect(mockChain.where).toHaveBeenCalledWith({ id: 5, organization_id: 1 });
    });
  });

  // =========================================================================
  // listDepartments()
  // =========================================================================

  describe("listDepartments()", () => {
    it("should return only non-deleted departments", async () => {
      mockChain.where.mockResolvedValueOnce([
        { id: 1, name: "Engineering" },
        { id: 2, name: "Marketing" },
      ]);

      const result = await listDepartments(1);
      expect(result).toHaveLength(2);
    });

    it("should filter by organization_id and is_deleted=false", async () => {
      mockChain.where.mockResolvedValueOnce([]);

      await listDepartments(5);

      expect(mockChain.where).toHaveBeenCalledWith({ organization_id: 5, is_deleted: false });
    });
  });

  // =========================================================================
  // createLocation()
  // =========================================================================

  describe("createLocation()", () => {
    it("should create a location successfully", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Mumbai HQ" });

      const result = await createLocation(1, { name: "Mumbai HQ" });
      expect(result.name).toBe("Mumbai HQ");
    });

    it("should reject duplicate location names (case-insensitive)", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Mumbai HQ" });
      await expect(createLocation(1, { name: "mumbai hq" })).rejects.toThrow(ConflictError);
    });

    it("should reject duplicate location names regardless of casing", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Mumbai HQ" });
      await expect(createLocation(1, { name: "MUMBAI HQ" })).rejects.toThrow("already exists");
    });

    it("should only check active locations for uniqueness", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1 });

      await createLocation(1, { name: "Bangalore" });

      expect(mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true }),
      );
    });

    it("should trim whitespace from name", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, name: "Pune" });

      await createLocation(1, { name: "  Pune  " });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.name).toBe("Pune");
    });

    it("should accept optional address and timezone", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1 });

      await createLocation(1, {
        name: "Delhi",
        address: "Connaught Place, New Delhi",
        timezone: "Asia/Kolkata",
      });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.address).toBe("Connaught Place, New Delhi");
      expect(insertArgs.timezone).toBe("Asia/Kolkata");
    });
  });

  // =========================================================================
  // deleteLocation()
  // =========================================================================

  describe("deleteLocation()", () => {
    it("should soft-delete by setting is_active=false", async () => {
      mockChain.update.mockResolvedValueOnce(1);

      await deleteLocation(1, 3);

      expect(mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false }),
      );
    });

    it("should filter by org_id and location_id", async () => {
      mockChain.update.mockResolvedValueOnce(1);

      await deleteLocation(1, 3);

      expect(mockChain.where).toHaveBeenCalledWith({ id: 3, organization_id: 1 });
    });
  });

  // =========================================================================
  // listLocations()
  // =========================================================================

  describe("listLocations()", () => {
    it("should return only active locations", async () => {
      mockChain.where.mockResolvedValueOnce([
        { id: 1, name: "Mumbai" },
        { id: 2, name: "Bangalore" },
      ]);

      const result = await listLocations(1);
      expect(result).toHaveLength(2);
    });

    it("should filter by organization_id and is_active=true", async () => {
      mockChain.where.mockResolvedValueOnce([]);

      await listLocations(5);

      expect(mockChain.where).toHaveBeenCalledWith({ organization_id: 5, is_active: true });
    });
  });
});
