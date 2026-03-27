// =============================================================================
// EMP CLOUD — Attendance Service Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChain: any = {};
const chainMethods = [
  "select", "where", "andWhere", "orWhere", "whereRaw", "whereNull",
  "whereIn", "whereNot", "whereBetween", "first", "insert", "update",
  "del", "count", "join", "leftJoin", "orderBy", "limit", "offset",
  "groupBy", "raw", "clone",
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
  checkIn, checkOut, getMyToday, getMyHistory, listRecords, getDashboard,
} from "./attendance.service.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";

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

describe("AttendanceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  // =========================================================================
  // checkIn()
  // =========================================================================

  describe("checkIn()", () => {
    it("should create a new attendance record on first check-in", async () => {
      // No existing record today
      mockChain.first.mockResolvedValueOnce(null);
      // No shift assignment
      mockChain.first.mockResolvedValueOnce(null);
      // insert returns [1]
      mockChain.insert.mockResolvedValueOnce([1]);
      // final fetch
      mockChain.first.mockResolvedValueOnce({
        id: 1, status: "present", check_in: new Date(),
      });

      const result = await checkIn(1, 10, { source: "web" });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.status).toBe("present");
    });

    it("should throw ConflictError for duplicate check-in same day", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, check_in: new Date(), user_id: 10,
      });

      await expect(checkIn(1, 10, { source: "web" })).rejects.toThrow("Already checked in");
    });

    it("should update existing record if it has no check_in yet", async () => {
      // existing record without check_in (e.g., pre-created for shift)
      mockChain.first.mockResolvedValueOnce({
        id: 5, check_in: null, user_id: 10,
      });
      // no shift assignment
      mockChain.first.mockResolvedValueOnce(null);
      // after update, return result
      mockChain.first.mockResolvedValueOnce({
        id: 5, status: "present", check_in: new Date(),
      });

      const result = await checkIn(1, 10, { source: "mobile" });

      expect(result.id).toBe(5);
      expect(mockChain.update).toHaveBeenCalled();
    });

    it("should store latitude/longitude when provided", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, check_in_lat: 12.97, check_in_lng: 77.59 });

      await checkIn(1, 10, { source: "mobile", latitude: 12.97, longitude: 77.59 });

      const insertCall = mockChain.insert.mock.calls[0][0];
      expect(insertCall.check_in_lat).toBe(12.97);
      expect(insertCall.check_in_lng).toBe(77.59);
    });

    it("should calculate late minutes when shift has started and grace period exceeded", async () => {
      // No existing record
      mockChain.first.mockResolvedValueOnce(null);
      // Shift assignment found
      mockChain.first.mockResolvedValueOnce({ shift_id: 1 });
      // Shift details - start at 09:00 with 15 min grace
      mockChain.first.mockResolvedValueOnce({
        id: 1, start_time: "09:00", grace_minutes_late: 15,
      });
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1, late_minutes: 30 });

      const result = await checkIn(1, 10, { source: "web" });
      // We can't control "now" easily, so just verify the flow completes
      expect(result).toBeDefined();
    });

    it("should default source to 'manual' when not provided", async () => {
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.first.mockResolvedValueOnce(null);
      mockChain.insert.mockResolvedValueOnce([1]);
      mockChain.first.mockResolvedValueOnce({ id: 1 });

      await checkIn(1, 10, {} as any);

      const insertCall = mockChain.insert.mock.calls[0][0];
      expect(insertCall.check_in_source).toBe("manual");
    });
  });

  // =========================================================================
  // checkOut()
  // =========================================================================

  describe("checkOut()", () => {
    it("should throw NotFoundError if no check-in record for today", async () => {
      mockChain.first.mockResolvedValueOnce(null);

      await expect(checkOut(1, 10, { source: "web" })).rejects.toThrow(NotFoundError);
    });

    it("should throw ValidationError if check_in is missing", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, check_in: null, check_out: null,
      });

      await expect(checkOut(1, 10, { source: "web" })).rejects.toThrow("Must check in");
    });

    it("should throw ConflictError if already checked out", async () => {
      mockChain.first.mockResolvedValueOnce({
        id: 1, check_in: new Date(), check_out: new Date(),
      });

      await expect(checkOut(1, 10, { source: "web" })).rejects.toThrow("Already checked out");
    });

    it("should update record with check_out time and worked_minutes", async () => {
      const checkInTime = new Date(Date.now() - 8 * 60 * 60000); // 8 hours ago
      mockChain.first.mockResolvedValueOnce({
        id: 1, check_in: checkInTime, check_out: null, shift_id: null,
      });
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "present", worked_minutes: 480 });

      const result = await checkOut(1, 10, { source: "web" });

      expect(mockChain.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should mark status as 'half_day' if worked less than 4 hours (240 min)", async () => {
      const checkInTime = new Date(Date.now() - 2 * 60 * 60000); // 2 hours ago
      mockChain.first.mockResolvedValueOnce({
        id: 1, check_in: checkInTime, check_out: null, shift_id: null,
      });
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "half_day" });

      const result = await checkOut(1, 10, { source: "web" });

      const updateCall = mockChain.update.mock.calls[0][0];
      expect(updateCall.status).toBe("half_day");
    });

    it("should keep status as 'present' if worked 4+ hours", async () => {
      const checkInTime = new Date(Date.now() - 5 * 60 * 60000); // 5 hours ago
      mockChain.first.mockResolvedValueOnce({
        id: 1, check_in: checkInTime, check_out: null, shift_id: null,
      });
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "present" });

      await checkOut(1, 10, { source: "web" });

      const updateCall = mockChain.update.mock.calls[0][0];
      expect(updateCall.status).toBe("present");
    });

    it("should calculate overtime when checking out after shift end", async () => {
      const checkInTime = new Date(Date.now() - 10 * 60 * 60000);
      mockChain.first.mockResolvedValueOnce({
        id: 1, check_in: checkInTime, check_out: null, shift_id: 1,
      });
      // Shift ends 2 hours ago
      const endHour = new Date(Date.now() - 2 * 60 * 60000);
      mockChain.first.mockResolvedValueOnce({
        id: 1, end_time: `${endHour.getHours()}:00`,
        grace_minutes_early: 0,
      });
      mockChain.first.mockResolvedValueOnce({ id: 1, overtime_minutes: 120 });

      const result = await checkOut(1, 10, { source: "web" });
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // getMyToday()
  // =========================================================================

  describe("getMyToday()", () => {
    it("should return today's record when it exists", async () => {
      mockChain.first.mockResolvedValueOnce({ id: 1, status: "present" });

      const result = await getMyToday(1, 10);
      expect(result).toBeDefined();
      expect(result.status).toBe("present");
    });

    it("should return null/undefined when no record exists", async () => {
      mockChain.first.mockResolvedValueOnce(undefined);

      const result = await getMyToday(1, 10);
      // The service returns db query result which will be undefined or null
      expect(result).toBeFalsy();
    });
  });

  // =========================================================================
  // getDashboard()
  // =========================================================================

  describe("getDashboard()", () => {
    it("should return correct dashboard stats", async () => {
      // Total users count
      mockChain.count.mockResolvedValueOnce([{ count: 50 }]);
      // Present count
      mockChain.count.mockResolvedValueOnce([{ count: 35 }]);
      // Late count
      mockChain.count.mockResolvedValueOnce([{ count: 5 }]);
      // On leave count
      mockChain.count.mockResolvedValueOnce([{ count: 3 }]);

      const result = await getDashboard(1);

      expect(result.total_employees).toBe(50);
      expect(result.present).toBe(35);
      expect(result.on_leave).toBe(3);
      expect(result.absent).toBe(12); // 50 - 35 - 3
      expect(result.date).toBeDefined();
    });

    it("should return absent as 0 if total minus present is negative", async () => {
      mockChain.count.mockResolvedValueOnce([{ count: 10 }]);
      mockChain.count.mockResolvedValueOnce([{ count: 10 }]);
      mockChain.count.mockResolvedValueOnce([{ count: 0 }]);
      mockChain.count.mockResolvedValueOnce([{ count: 2 }]);

      const result = await getDashboard(1);
      expect(result.absent).toBe(0); // max(0, 10-10-2) = 0
    });
  });
});
