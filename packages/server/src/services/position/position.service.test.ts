// =============================================================================
// EMP CLOUD — Position Service Tests
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
  "clone", "increment", "decrement", "delete",
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
  createPosition, assignUserToPosition, updatePosition,
  deletePosition, removeUserFromPosition,
} from "./position.service.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

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

describe("PositionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  // =========================================================================
  // createPosition()
  // =========================================================================

  describe("createPosition()", () => {
    it("should generate position code when not provided", async () => {
      // generatePositionCode: no department
      mockChain.first.mockResolvedValueOnce(null); // no existing code
      // Check code uniqueness
      mockChain.first.mockResolvedValueOnce(null);
      // insert
      mockChain.insert.mockResolvedValueOnce([1]);
      // return
      mockChain.first.mockResolvedValueOnce({ id: 1, code: "POS-001" });

      const result = await createPosition(1, 10, { title: "Software Engineer" } as any);

      expect(result).toBeDefined();
      expect(result.code).toBeDefined();
    });

    it("should use provided code if given", async () => {
      // Check code uniqueness
      mockChain.first.mockResolvedValueOnce(null);
      // insert
      mockChain.insert.mockResolvedValueOnce([1]);
      // return
      mockChain.first.mockResolvedValueOnce({ id: 1, code: "ENG-001" });

      const result = await createPosition(1, 10, {
        title: "Software Engineer", code: "ENG-001",
      } as any);

      expect(result.code).toBe("ENG-001");
    });

    it("should throw ValidationError if code already exists", async () => {
      // For custom code path
      mockChain.first.mockResolvedValueOnce({ id: 5, code: "ENG-001" }); // code already exists

      await expect(
        createPosition(1, 10, { title: "SE", code: "ENG-001" } as any),
      ).rejects.toThrow("already exists");
    });

    it("should set headcount_filled to 0 and status to 'active'", async () => {
      mockChain.first.mockResolvedValueOnce(null); // generate code
      mockChain.first.mockResolvedValueOnce(null); // uniqueness
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1 });

      await createPosition(1, 10, { title: "PM" } as any);

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.headcount_filled).toBe(0);
      expect(insertArgs.status).toBe("active");
    });

    it("should default headcount_budget to 1", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1 });

      await createPosition(1, 10, { title: "Designer" } as any);

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.headcount_budget).toBe(1);
    });

    it("should include department prefix in generated code when department_id given", async () => {
      // Lookup department
      mockChain.first.mockResolvedValueOnce({ id: 3, name: "Engineering" });
      // No existing code
      mockChain.first.mockResolvedValueOnce(null);
      // Uniqueness check
      mockChain.first.mockResolvedValueOnce(null);
      // insert
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, code: "POS-ENG-001" });

      const result = await createPosition(1, 10, {
        title: "Backend Engineer", department_id: 3,
      } as any);

      // Code should contain ENG from "Engineering"
      expect(result.code).toContain("ENG");
    });
  });

  // =========================================================================
  // assignUserToPosition()
  // =========================================================================

  describe("assignUserToPosition()", () => {
    it("should throw NotFoundError if position does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);

      await expect(
        assignUserToPosition(1, 999, 10, { start_date: "2026-04-01" } as any),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError if user does not exist in org", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "active", headcount_filled: 0, headcount_budget: 5,
      });
      mockChain.first.mockResolvedValueOnce(null); // user not found

      await expect(
        assignUserToPosition(1, 1, 999, { start_date: "2026-04-01" } as any),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ValidationError if user is already assigned to this position", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "active", headcount_filled: 1, headcount_budget: 5,
      });
      mockChain.first.mockResolvedValueOnce({ id: 10, organization_id: 1 }); // user found
      mockChain.first.mockResolvedValueOnce({ id: 50, status: "active" }); // existing assignment

      await expect(
        assignUserToPosition(1, 1, 10, { start_date: "2026-04-01" } as any),
      ).rejects.toThrow("already assigned");
    });

    it("should throw ValidationError if headcount budget is full", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "active", headcount_filled: 3, headcount_budget: 3,
      });
      mockChain.first.mockResolvedValueOnce({ id: 10, organization_id: 1 }); // user found
      mockChain.first.mockResolvedValueOnce(null); // no existing assignment

      await expect(
        assignUserToPosition(1, 1, 10, { start_date: "2026-04-01" } as any),
      ).rejects.toThrow("budget is full");
    });

    it("should increment headcount_filled on successful assignment", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "active", headcount_filled: 2, headcount_budget: 5,
      });
      mockChain.first.mockResolvedValueOnce({ id: 10, organization_id: 1 });
      mockChain.first.mockResolvedValueOnce(null); // no existing
      // insert assignment
      mockChain.insert.mockResolvedValueOnce([100]);
      // increment
      mockChain.update.mockResolvedValueOnce(1);
      // Check if now filled
      mockChain.first.mockResolvedValueOnce({
        id: 1, headcount_filled: 3, headcount_budget: 5,
      });
      // return assignment
      mockChain.first.mockResolvedValueOnce({ id: 100, user_id: 10 });

      const result = await assignUserToPosition(1, 1, 10, { start_date: "2026-04-01" } as any);

      expect(mockChain.increment).toHaveBeenCalledWith("headcount_filled", 1);
      expect(result.id).toBe(100);
    });

    it("should auto-set status to 'filled' when headcount_filled >= headcount_budget", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "active", headcount_filled: 4, headcount_budget: 5,
      });
      mockChain.first.mockResolvedValueOnce({ id: 10, organization_id: 1 });
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([100]);
      mockChain.update.mockResolvedValueOnce(1);
      // After increment, headcount_filled = 5 == budget
      mockChain.first.mockResolvedValueOnce({
        id: 1, headcount_filled: 5, headcount_budget: 5,
      });
      // The service updates status to "filled"
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 100, user_id: 10 });

      await assignUserToPosition(1, 1, 10, { start_date: "2026-04-01" } as any);

      // The second update call should set status to "filled"
      const updateCalls = mockChain.update.mock.calls;
      const filledCall = updateCalls.find(
        (call: any) => call[0]?.status === "filled",
      );
      expect(filledCall).toBeDefined();
    });

    it("should NOT set status to 'filled' when headcount_filled < headcount_budget", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "active", headcount_filled: 1, headcount_budget: 5,
      });
      mockChain.first.mockResolvedValueOnce({ id: 10, organization_id: 1 });
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([100]);
      mockChain.update.mockResolvedValueOnce(1);
      // After increment: 2/5
      mockChain.first.mockResolvedValueOnce({
        id: 1, headcount_filled: 2, headcount_budget: 5,
      });
      mockChain.first.mockResolvedValueOnce({ id: 100, user_id: 10 });

      await assignUserToPosition(1, 1, 10, { start_date: "2026-04-01" } as any);

      const updateCalls = mockChain.update.mock.calls;
      const filledCall = updateCalls.find(
        (call: any) => call[0]?.status === "filled",
      );
      expect(filledCall).toBeUndefined();
    });
  });

  // =========================================================================
  // removeUserFromPosition()
  // =========================================================================

  describe("removeUserFromPosition()", () => {
    it("should throw NotFoundError if assignment does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(removeUserFromPosition(1, 999)).rejects.toThrow(NotFoundError);
    });

    it("should decrement headcount_filled and revert 'filled' to 'active'", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 50, position_id: 1, user_id: 10, status: "active",
      });
      // update assignment
      mockChain.update.mockResolvedValueOnce(1);
      // decrement + update
      mockChain.update.mockResolvedValueOnce(1);
      // Check position state
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "filled", headcount_filled: 4, headcount_budget: 5,
      });
      // Revert to active
      mockChain.update.mockResolvedValueOnce(1);

      await removeUserFromPosition(1, 50);

      expect(mockChain.decrement).toHaveBeenCalledWith("headcount_filled", 1);
    });
  });

  // =========================================================================
  // updatePosition()
  // =========================================================================

  describe("updatePosition()", () => {
    it("should throw NotFoundError if position does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(updatePosition(1, 999, {} as any)).rejects.toThrow(NotFoundError);
    });

    it("should throw ValidationError if new code conflicts with existing", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, code: "POS-001" });
      // duplicate check
      mockChain.first.mockResolvedValueOnce({ id: 2, code: "POS-002" });

      await expect(
        updatePosition(1, 1, { code: "POS-002" } as any),
      ).rejects.toThrow(ValidationError);
    });

    it("should allow update with valid data", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, code: "POS-001" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, title: "Updated Title" });

      const result = await updatePosition(1, 1, { title: "Updated Title" } as any);
      expect(result.title).toBe("Updated Title");
    });
  });

  // =========================================================================
  // deletePosition()
  // =========================================================================

  describe("deletePosition()", () => {
    it("should throw NotFoundError if position does not exist or is closed", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(deletePosition(1, 999)).rejects.toThrow(NotFoundError);
    });

    it("should soft-delete by setting status to 'closed'", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "active" });
      // end assignments
      mockChain.update.mockResolvedValueOnce(1);
      // close position
      mockChain.update.mockResolvedValueOnce(1);

      await deletePosition(1, 1);

      const closeCall = mockChain.update.mock.calls.find(
        (call: any) => call[0]?.status === "closed",
      );
      expect(closeCall).toBeDefined();
    });
  });
});
