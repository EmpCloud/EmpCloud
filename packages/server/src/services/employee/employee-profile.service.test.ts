// =============================================================================
// EMP CLOUD — Employee Profile Service Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChain: any = {};
const chainMethods = [
  "select", "where", "andWhere", "orWhere", "orWhereRaw", "whereRaw",
  "whereNull", "whereNotNull", "whereNot", "first", "insert", "update",
  "del", "count", "join", "leftJoin", "orderBy", "orderByRaw", "limit",
  "offset", "groupBy", "raw", "clone",
];
chainMethods.forEach((m) => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.first = vi.fn().mockResolvedValue(null);

const mockDb: any = vi.fn().mockReturnValue(mockChain);
mockDb.raw = vi.fn((val: any) => val);

vi.mock("../../db/connection.js", () => ({
  getDB: vi.fn(() => mockDb),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getProfile, upsertProfile, getDirectory, getHeadcount } from "./employee-profile.service.js";
import { NotFoundError } from "../../utils/errors.js";

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

describe("EmployeeProfileService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  // =========================================================================
  // getProfile()
  // =========================================================================

  describe("getProfile()", () => {
    it("should return employee profile with extended data", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 10,
        first_name: "John",
        last_name: "Doe",
        email: "john@acme.com",
        designation: "Engineer",
        department_id: 1,
        reporting_manager_name: "Jane Smith",
        blood_group: "O+",
        marital_status: "single",
      });

      const result = await getProfile(1, 10);

      expect(result).toBeDefined();
      expect(result.first_name).toBe("John");
      expect(result.reporting_manager_name).toBe("Jane Smith");
      expect(result.blood_group).toBe("O+");
    });

    it("should throw NotFoundError when employee does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);

      await expect(getProfile(1, 999)).rejects.toThrow(NotFoundError);
      await expect(getProfile(1, 999)).rejects.toThrow("Employee not found");
    });

    it("should join employee_profiles and manager tables", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 10, first_name: "John" });

      await getProfile(1, 10);

      expect(mockChain.leftJoin).toHaveBeenCalled();
      expect(mockChain.select).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // upsertProfile()
  // =========================================================================

  describe("upsertProfile()", () => {
    it("should throw NotFoundError if user does not belong to org", async () => {
      mockChain.first.mockResolvedValueOnce(null);

      await expect(
        upsertProfile(1, 999, { blood_group: "A+" } as any),
      ).rejects.toThrow(NotFoundError);
    });

    it("should update existing profile when one exists", async () => {
      // user check
      mockChain.first.mockResolvedValueOnce({ id: 10, organization_id: 1 });
      // existing profile
      mockChain.first.mockResolvedValueOnce({ id: 5, user_id: 10 });
      // update
      mockChain.update.mockResolvedValueOnce(1);
      // getProfile after upsert
      mockChain.first.mockResolvedValueOnce({
        id: 10, first_name: "John", blood_group: "A+",
      });

      const result = await upsertProfile(1, 10, { blood_group: "A+" } as any);

      expect(mockChain.update).toHaveBeenCalled();
      expect(result.blood_group).toBe("A+");
    });

    it("should insert new profile when none exists", async () => {
      // user check
      mockChain.first.mockResolvedValueOnce({ id: 10, organization_id: 1 });
      // no existing profile
      mockChain.first.mockResolvedValueOnce(null);
      // insert
      mockChain.insert.mockResolvedValueOnce([5]);
      // getProfile
      mockChain.first.mockResolvedValueOnce({
        id: 10, first_name: "John", nationality: "Indian",
      });

      const result = await upsertProfile(1, 10, { nationality: "Indian" } as any);

      expect(mockChain.insert).toHaveBeenCalled();
      expect(result.nationality).toBe("Indian");
    });
  });

  // =========================================================================
  // getDirectory()
  // =========================================================================

  describe("getDirectory()", () => {
    it("should return paginated results with total count", async () => {
      mockChain.clone = vi.fn().mockReturnValue(mockChain);
      mockChain.count.mockResolvedValueOnce([{ count: 25 }]);
      mockChain.offset.mockResolvedValueOnce([
        { id: 1, first_name: "Alice" },
        { id: 2, first_name: "Bob" },
      ]);

      const result = await getDirectory(1, { page: 1, per_page: 20 });

      expect(result.total).toBe(25);
      expect(result.users).toHaveLength(2);
    });

    it("should apply search filter across name, email, designation", async () => {
      mockChain.clone = vi.fn().mockReturnValue(mockChain);
      mockChain.count.mockResolvedValueOnce([{ count: 1 }]);
      mockChain.offset.mockResolvedValueOnce([{ id: 1, first_name: "John" }]);

      const result = await getDirectory(1, { search: "John" });

      // The where(function) call should have been made for search
      expect(mockChain.where).toHaveBeenCalled();
      expect(result.users).toHaveLength(1);
    });

    it("should support full name search (CONCAT first_name + last_name)", async () => {
      mockChain.clone = vi.fn().mockReturnValue(mockChain);
      mockChain.count.mockResolvedValueOnce([{ count: 1 }]);
      mockChain.offset.mockResolvedValueOnce([{ id: 1, first_name: "John", last_name: "Doe" }]);

      // The service uses orWhereRaw for full name
      await getDirectory(1, { search: "John Doe" });
      expect(mockChain.where).toHaveBeenCalled();
    });

    it("should filter by department_id when provided", async () => {
      mockChain.clone = vi.fn().mockReturnValue(mockChain);
      mockChain.count.mockResolvedValueOnce([{ count: 5 }]);
      mockChain.offset.mockResolvedValueOnce([{ id: 1, department_id: 3 }]);

      await getDirectory(1, { department_id: 3 });

      expect(mockChain.where).toHaveBeenCalledWith("users.department_id", 3);
    });

    it("should filter by status when provided", async () => {
      mockChain.clone = vi.fn().mockReturnValue(mockChain);
      mockChain.count.mockResolvedValueOnce([{ count: 10 }]);
      mockChain.offset.mockResolvedValueOnce([]);

      await getDirectory(1, { status: 1 });

      expect(mockChain.where).toHaveBeenCalledWith("users.status", 1);
    });

    it("should default to page 1, per_page 20", async () => {
      mockChain.clone = vi.fn().mockReturnValue(mockChain);
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);
      mockChain.offset.mockResolvedValueOnce([]);

      await getDirectory(1, {});

      expect(mockChain.limit).toHaveBeenCalledWith(20);
      expect(mockChain.offset).toHaveBeenCalledWith(0);
    });
  });

  // =========================================================================
  // getHeadcount()
  // =========================================================================

  describe("getHeadcount()", () => {
    it("should return employee count grouped by department_id", async () => {
      mockChain.groupBy.mockResolvedValueOnce([
        { department_id: 1, count: 15 },
        { department_id: 2, count: 10 },
        { department_id: null, count: 3 },
      ]);

      const result = await getHeadcount(1);

      expect(result).toHaveLength(3);
      expect(result[0].count).toBe(15);
    });
  });
});
