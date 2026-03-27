// =============================================================================
// EMP CLOUD — Helpdesk Service Tests
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
  "groupBy", "raw", "clone", "increment",
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
  createTicket, assignTicket, resolveTicket, rateTicket,
  updateTicket, closeTicket, reopenTicket, addComment,
} from "./helpdesk.service.js";
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

describe("HelpdeskService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  // =========================================================================
  // createTicket()
  // =========================================================================

  describe("createTicket()", () => {
    it("should create ticket with correct SLA for medium priority (default)", async () => {
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({
        id: 1, priority: "medium", status: "open",
        sla_response_hours: 24, sla_resolution_hours: 72,
      });

      const result = await createTicket(1, 10, {
        category: "IT", subject: "Laptop issue", description: "Screen broken",
      });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.priority).toBe("medium");
      expect(insertArgs.sla_response_hours).toBe(24);
      expect(insertArgs.sla_resolution_hours).toBe(72);
      expect(insertArgs.status).toBe("open");
      expect(result.id).toBe(1);
    });

    it("should set SLA for urgent priority: response=2h, resolution=8h", async () => {
      mockChain.insert.mockResolvedValueOnce([2]);
      mockChain.first.mockResolvedValueOnce({ id: 2, priority: "urgent" });

      await createTicket(1, 10, {
        category: "IT", priority: "urgent", subject: "Server down", description: "Production offline",
      });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.sla_response_hours).toBe(2);
      expect(insertArgs.sla_resolution_hours).toBe(8);
    });

    it("should set SLA for high priority: response=8h, resolution=24h", async () => {
      mockChain.insert.mockResolvedValueOnce([3]);
      mockChain.first.mockResolvedValueOnce({ id: 3 });

      await createTicket(1, 10, {
        category: "IT", priority: "high", subject: "App crash", description: "Crashes on login",
      });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.sla_response_hours).toBe(8);
      expect(insertArgs.sla_resolution_hours).toBe(24);
    });

    it("should set SLA for low priority: response=48h, resolution=120h", async () => {
      mockChain.insert.mockResolvedValueOnce([4]);
      mockChain.first.mockResolvedValueOnce({ id: 4 });

      await createTicket(1, 10, {
        category: "General", priority: "low", subject: "Feature request", description: "Nice to have",
      });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.sla_response_hours).toBe(48);
      expect(insertArgs.sla_resolution_hours).toBe(120);
    });

    it("should calculate sla_response_due and sla_resolution_due dates", async () => {
      mockChain.insert.mockResolvedValueOnce([5]);
      mockChain.first.mockResolvedValueOnce({ id: 5 });

      await createTicket(1, 10, {
        category: "IT", priority: "urgent", subject: "Test", description: "Test",
      });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.sla_response_due).toBeInstanceOf(Date);
      expect(insertArgs.sla_resolution_due).toBeInstanceOf(Date);

      // urgent: response due should be ~2h from now, resolution ~8h
      const now = Date.now();
      const responseDue = insertArgs.sla_response_due.getTime();
      const resolutionDue = insertArgs.sla_resolution_due.getTime();
      expect(responseDue).toBeGreaterThan(now);
      expect(responseDue).toBeLessThanOrEqual(now + 2 * 3600 * 1000 + 5000);
      expect(resolutionDue).toBeGreaterThan(now);
      expect(resolutionDue).toBeLessThanOrEqual(now + 8 * 3600 * 1000 + 5000);
    });

    it("should serialize tags as JSON", async () => {
      mockChain.insert.mockResolvedValueOnce([6]);
      mockChain.first.mockResolvedValueOnce({ id: 6 });

      await createTicket(1, 10, {
        category: "IT", subject: "Test", description: "Test",
        tags: ["urgent", "laptop"],
      });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.tags).toBe(JSON.stringify(["urgent", "laptop"]));
    });

    it("should set assigned_to to null initially", async () => {
      mockChain.insert.mockResolvedValueOnce([7]);
      mockChain.first.mockResolvedValueOnce({ id: 7 });

      await createTicket(1, 10, {
        category: "IT", subject: "Test", description: "Test",
      });

      const insertArgs = mockChain.insert.mock.calls[0][0];
      expect(insertArgs.assigned_to).toBeNull();
    });
  });

  // =========================================================================
  // assignTicket()
  // =========================================================================

  describe("assignTicket()", () => {
    it("should throw NotFoundError if ticket does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(assignTicket(1, 999, 5)).rejects.toThrow(NotFoundError);
    });

    it("should update assigned_to and return the ticket", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "open", organization_id: 1 });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, assigned_to: 5, status: "in_progress" });

      const result = await assignTicket(1, 1, 5);

      expect(mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ assigned_to: 5 }),
      );
      expect(result.assigned_to).toBe(5);
    });

    it("should change status from 'open' to 'in_progress' on assignment", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "open" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "in_progress" });

      await assignTicket(1, 1, 5);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.status).toBe("in_progress");
    });

    it("should change status from 'reopened' to 'in_progress' on assignment", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "reopened" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "in_progress" });

      await assignTicket(1, 1, 5);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.status).toBe("in_progress");
    });

    it("should NOT change status if ticket is 'in_progress'", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "in_progress" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, assigned_to: 7 });

      await assignTicket(1, 1, 7);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.status).toBeUndefined();
    });
  });

  // =========================================================================
  // resolveTicket()
  // =========================================================================

  describe("resolveTicket()", () => {
    it("should throw NotFoundError if ticket does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(resolveTicket(1, 999, 5)).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenError if ticket is already resolved", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "resolved" });
      await expect(resolveTicket(1, 1, 5)).rejects.toThrow(ForbiddenError);
    });

    it("should throw ForbiddenError if ticket is already closed", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "closed" });
      await expect(resolveTicket(1, 1, 5)).rejects.toThrow("already resolved or closed");
    });

    it("should set resolved_at and status to 'resolved'", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "in_progress" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "resolved", resolved_at: new Date() });

      const result = await resolveTicket(1, 1, 5);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.status).toBe("resolved");
      expect(updateArgs.resolved_at).toBeInstanceOf(Date);
      expect(result.status).toBe("resolved");
    });
  });

  // =========================================================================
  // rateTicket()
  // =========================================================================

  describe("rateTicket()", () => {
    it("should throw NotFoundError if ticket does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(rateTicket(1, 999, 5)).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenError if ticket is not resolved/closed", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "open" });
      await expect(rateTicket(1, 1, 5)).rejects.toThrow(ForbiddenError);
    });

    it("should accept rating of 1", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "resolved" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, satisfaction_rating: 1 });

      const result = await rateTicket(1, 1, 1);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.satisfaction_rating).toBe(1);
    });

    it("should accept rating of 5", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "closed" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, satisfaction_rating: 5 });

      const result = await rateTicket(1, 1, 5);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.satisfaction_rating).toBe(5);
    });

    it("should store optional comment", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "resolved" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, satisfaction_rating: 4 });

      await rateTicket(1, 1, 4, "Great support!");

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.satisfaction_comment).toBe("Great support!");
    });
  });

  // =========================================================================
  // closeTicket()
  // =========================================================================

  describe("closeTicket()", () => {
    it("should throw NotFoundError if ticket does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(closeTicket(1, 999)).rejects.toThrow(NotFoundError);
    });

    it("should set resolved_at if not already resolved", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "in_progress", resolved_at: null });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "closed" });

      await closeTicket(1, 1);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.resolved_at).toBeInstanceOf(Date);
      expect(updateArgs.closed_at).toBeInstanceOf(Date);
    });
  });

  // =========================================================================
  // reopenTicket()
  // =========================================================================

  describe("reopenTicket()", () => {
    it("should throw ForbiddenError if ticket is not resolved/closed", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "open" });
      await expect(reopenTicket(1, 1)).rejects.toThrow(ForbiddenError);
    });

    it("should clear resolved_at, closed_at, and ratings on reopen", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "resolved" });
      mockChain.update.mockResolvedValueOnce(1);
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "reopened" });

      await reopenTicket(1, 1);

      const updateArgs = mockChain.update.mock.calls[0][0];
      expect(updateArgs.status).toBe("reopened");
      expect(updateArgs.resolved_at).toBeNull();
      expect(updateArgs.closed_at).toBeNull();
      expect(updateArgs.satisfaction_rating).toBeNull();
    });
  });

  // =========================================================================
  // addComment()
  // =========================================================================

  describe("addComment()", () => {
    it("should throw NotFoundError if ticket does not exist", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      await expect(addComment(1, 999, 10, "Test comment")).rejects.toThrow(NotFoundError);
    });

    it("should track first_response_at when HR responds for the first time", async () => {
      // ticket with no first_response_at, raised by user 10
      mockChain.first.mockResolvedValueOnce({
        id: 1, raised_by: 10, first_response_at: null, status: "open",
      });
      // insert comment
      mockChain.insert.mockResolvedValueOnce([1]);
      // update first_response_at
      mockChain.update.mockResolvedValueOnce(1);
      // return comment
      mockChain.first.mockResolvedValueOnce({ id: 1, comment: "Looking into it" });

      // HR user (5) responds — different from raised_by (10)
      await addComment(1, 1, 5, "Looking into it");

      // Should have updated first_response_at
      expect(mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ first_response_at: expect.any(Date) }),
      );
    });

    it("should NOT update first_response_at when ticket raiser comments", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, raised_by: 10, first_response_at: null, status: "open",
      });
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, comment: "Update" });

      // Raiser (10) comments on their own ticket
      await addComment(1, 1, 10, "Update");

      // update should NOT have been called for first_response_at
      // The only update would be status changes, not first_response_at
      const updateCalls = mockChain.update.mock.calls;
      const hasFirstResponseUpdate = updateCalls.some(
        (call: any) => call[0]?.first_response_at !== undefined,
      );
      expect(hasFirstResponseUpdate).toBe(false);
    });
  });
});
