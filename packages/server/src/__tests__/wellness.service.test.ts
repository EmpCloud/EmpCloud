import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/connection", () => ({ getDB: vi.fn() }));

import {
  createProgram,
  getProgram,
  updateProgram,
  listPrograms,
  enrollInProgram,
  completeProgram,
  dailyCheckIn,
  createGoal,
  updateGoalProgress,
  deleteGoal,
  getMyGoals,
  getCheckInTrends,
} from "../services/wellness/wellness.service.js";
import { getDB } from "../db/connection.js";

const mockedGetDB = vi.mocked(getDB);

function createMockDB() {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.where = vi.fn((arg?: any) => {
    if (typeof arg === "function") arg.call(chain);
    return chain;
  });
  chain.whereIn = vi.fn(() => chain);
  chain.whereNull = vi.fn(() => chain);
  chain.whereNotNull = vi.fn(() => chain);
  chain.orWhere = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.join = vi.fn(() => chain);
  chain.first = vi.fn(() => chain._firstResult);
  chain.insert = vi.fn(() => [1]);
  chain.update = vi.fn(() => 1);
  chain.delete = vi.fn(() => 1);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.offset = vi.fn(() => chain);
  chain.count = vi.fn(() => chain);
  chain.countDistinct = vi.fn(() => chain);
  chain.avg = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.clone = vi.fn(() => chain);
  chain.increment = vi.fn(() => chain);
  chain.decrement = vi.fn(() => chain);
  chain._firstResult = undefined;
  chain._result = [];
  chain.then = vi.fn((resolve: any) => resolve(chain._result));

  const db: any = vi.fn(() => chain);
  db.raw = vi.fn((sql: string) => sql);
  db.schema = { hasTable: vi.fn(() => false) };
  return { db, chain };
}

describe("wellness.service", () => {
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
  // createProgram
  // -----------------------------------------------------------------------
  describe("createProgram", () => {
    it("throws ValidationError when start_date is in the past", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 2);

      await expect(
        createProgram(1, 10, {
          title: "Yoga",
          start_date: yesterday.toISOString().split("T")[0],
        } as any)
      ).rejects.toThrow("Start date cannot be in the past");
    });

    it("throws ValidationError when end_date is before start_date", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);

      await expect(
        createProgram(1, 10, {
          title: "Yoga",
          start_date: dayAfter.toISOString().split("T")[0],
          end_date: tomorrow.toISOString().split("T")[0],
        } as any)
      ).rejects.toThrow("End date cannot be before start date");
    });

    it("inserts program with defaults and returns it", async () => {
      chain.insert.mockReturnValue([5]);
      chain._firstResult = { id: 5, title: "Yoga", is_active: true };

      const result = await createProgram(1, 10, { title: "Yoga" } as any);
      expect(result.id).toBe(5);

      const insertArgs = chain.insert.mock.calls[0][0];
      expect(insertArgs.program_type).toBe("other");
      expect(insertArgs.is_active).toBe(true);
      expect(insertArgs.points_reward).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // updateProgram
  // -----------------------------------------------------------------------
  describe("updateProgram", () => {
    it("throws NotFoundError when program does not exist", async () => {
      chain._firstResult = undefined;
      await expect(updateProgram(1, 999, {} as any)).rejects.toThrow("Wellness program");
    });

    it("validates end_date against existing start_date", async () => {
      chain._firstResult = { id: 1, start_date: "2026-06-01", end_date: "2026-07-01" };

      await expect(
        updateProgram(1, 1, { end_date: "2026-05-01" } as any)
      ).rejects.toThrow("End date cannot be before start date");
    });
  });

  // -----------------------------------------------------------------------
  // enrollInProgram
  // -----------------------------------------------------------------------
  describe("enrollInProgram", () => {
    it("throws NotFoundError for inactive program", async () => {
      chain._firstResult = undefined;
      await expect(enrollInProgram(1, 1, 10)).rejects.toThrow("Active wellness program");
    });

    it("throws ForbiddenError when at max capacity", async () => {
      chain._firstResult = { id: 1, max_participants: 5, enrolled_count: 5, is_active: true };
      await expect(enrollInProgram(1, 1, 10)).rejects.toThrow("maximum capacity");
    });

    it("throws ForbiddenError on duplicate enrollment", async () => {
      // First first() = program, second first() = existing enrollment
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, max_participants: 10, enrolled_count: 2, is_active: true };
        return { id: 99 }; // existing enrollment
      });

      await expect(enrollInProgram(1, 1, 10)).rejects.toThrow("already enrolled");
    });

    it("successfully enrolls and increments count", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, max_participants: 10, enrolled_count: 2, is_active: true };
        return undefined; // no existing enrollment
      });
      chain.insert.mockReturnValue([50]);

      const result = await enrollInProgram(1, 1, 10);
      expect(result.enrollment_id).toBe(50);
      expect(chain.increment).toHaveBeenCalledWith("enrolled_count", 1);
    });

    it("allows enrollment when max_participants is null (unlimited)", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, max_participants: null, enrolled_count: 100, is_active: true };
        return undefined;
      });
      chain.insert.mockReturnValue([51]);

      const result = await enrollInProgram(1, 1, 10);
      expect(result.enrollment_id).toBe(51);
    });
  });

  // -----------------------------------------------------------------------
  // completeProgram
  // -----------------------------------------------------------------------
  describe("completeProgram", () => {
    it("throws NotFoundError when enrollment missing", async () => {
      chain._firstResult = undefined;
      await expect(completeProgram(1, 1, 10)).rejects.toThrow("Enrollment");
    });

    it("throws ForbiddenError when already completed", async () => {
      chain._firstResult = { id: 1, status: "completed" };
      await expect(completeProgram(1, 1, 10)).rejects.toThrow("already completed");
    });

    it("throws ForbiddenError when dropped", async () => {
      chain._firstResult = { id: 1, status: "dropped" };
      await expect(completeProgram(1, 1, 10)).rejects.toThrow("Cannot complete a dropped");
    });

    it("marks enrollment as completed with 100% progress", async () => {
      chain._firstResult = { id: 1, status: "enrolled" };

      const result = await completeProgram(1, 1, 10);
      expect(result.message).toContain("completed");
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed", progress_percentage: 100 })
      );
    });
  });

  // -----------------------------------------------------------------------
  // dailyCheckIn
  // -----------------------------------------------------------------------
  describe("dailyCheckIn", () => {
    it("throws ValidationError for energy_level out of range", async () => {
      await expect(
        dailyCheckIn(1, 10, { mood: "good", energy_level: 0 } as any)
      ).rejects.toThrow("Energy level must be between 1 and 5");

      await expect(
        dailyCheckIn(1, 10, { mood: "good", energy_level: 6 } as any)
      ).rejects.toThrow("Energy level must be between 1 and 5");
    });

    it("updates existing check-in when one exists for the date", async () => {
      chain._firstResult = { id: 42 };

      const result = await dailyCheckIn(1, 10, {
        mood: "great",
        energy_level: 4,
        check_in_date: "2026-04-04",
      } as any);

      expect(result.message).toBe("Check-in updated");
      expect(result.id).toBe(42);
      expect(chain.update).toHaveBeenCalled();
    });

    it("creates new check-in when none exists", async () => {
      chain._firstResult = undefined;
      chain.insert.mockReturnValue([99]);

      const result = await dailyCheckIn(1, 10, {
        mood: "good",
        energy_level: 3,
      } as any);

      expect(result.message).toBe("Check-in recorded");
      expect(result.id).toBe(99);
    });

    it("uses today as default check_in_date", async () => {
      chain._firstResult = undefined;
      chain.insert.mockReturnValue([100]);

      const result = await dailyCheckIn(1, 10, {
        mood: "okay",
        energy_level: 2,
      } as any);

      const today = new Date().toISOString().split("T")[0];
      expect(result.check_in_date).toBe(today);
    });
  });

  // -----------------------------------------------------------------------
  // createGoal
  // -----------------------------------------------------------------------
  describe("createGoal", () => {
    it("throws ValidationError when end_date before start_date", async () => {
      await expect(
        createGoal(1, 10, {
          title: "Steps",
          target_value: 10000,
          unit: "steps",
          start_date: "2026-06-01",
          end_date: "2026-05-01",
        } as any)
      ).rejects.toThrow("End date cannot be before start date");
    });

    it("creates goal with defaults", async () => {
      chain.insert.mockReturnValue([7]);
      chain._firstResult = { id: 7, title: "Steps" };

      const result = await createGoal(1, 10, {
        title: "Steps",
        target_value: 10000,
        unit: "steps",
        start_date: "2026-06-01",
      } as any);

      expect(result.id).toBe(7);
      const insertArgs = chain.insert.mock.calls[0][0];
      expect(insertArgs.goal_type).toBe("custom");
      expect(insertArgs.frequency).toBe("daily");
      expect(insertArgs.current_value).toBe(0);
      expect(insertArgs.status).toBe("active");
    });
  });

  // -----------------------------------------------------------------------
  // updateGoalProgress
  // -----------------------------------------------------------------------
  describe("updateGoalProgress", () => {
    it("throws NotFoundError when goal missing", async () => {
      chain._firstResult = undefined;
      await expect(updateGoalProgress(1, 10, 999, {} as any)).rejects.toThrow("Wellness goal");
    });

    it("throws ForbiddenError when goal is not active", async () => {
      chain._firstResult = { id: 1, status: "completed", target_value: 100 };
      await expect(
        updateGoalProgress(1, 10, 1, { current_value: 50 } as any)
      ).rejects.toThrow("Can only update active goals");
    });

    it("auto-completes goal when current_value reaches target", async () => {
      // First call: find goal. Second call: return updated goal.
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "active", target_value: 100 };
        return { id: 1, status: "completed", current_value: 100 };
      });

      await updateGoalProgress(1, 10, 1, { current_value: 100 } as any);

      const updateCall = chain.update.mock.calls[0][0];
      expect(updateCall.status).toBe("completed");
    });

    it("does not auto-complete when below target", async () => {
      let callCount = 0;
      chain.first.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { id: 1, status: "active", target_value: 100 };
        return { id: 1, status: "active", current_value: 50 };
      });

      await updateGoalProgress(1, 10, 1, { current_value: 50 } as any);

      const updateCall = chain.update.mock.calls[0][0];
      expect(updateCall.status).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // deleteGoal
  // -----------------------------------------------------------------------
  describe("deleteGoal", () => {
    it("throws NotFoundError when goal missing", async () => {
      chain._firstResult = undefined;
      await expect(deleteGoal(1, 10, 999)).rejects.toThrow("Wellness goal");
    });

    it("deletes the goal", async () => {
      chain._firstResult = { id: 1 };
      await deleteGoal(1, 10, 1);
      expect(chain.delete).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getMyGoals
  // -----------------------------------------------------------------------
  describe("getMyGoals", () => {
    it("filters by status when provided", async () => {
      chain._result = [{ id: 1 }];
      await getMyGoals(1, 10, "active");
      expect(chain.where).toHaveBeenCalledWith("status", "active");
    });
  });

  // -----------------------------------------------------------------------
  // getCheckInTrends
  // -----------------------------------------------------------------------
  describe("getCheckInTrends", () => {
    it("returns daily trends", async () => {
      const today = new Date().toISOString().split("T")[0];
      chain._result = [
        { check_in_date: today, mood: "good", energy_level: 4 },
        { check_in_date: today, mood: "great", energy_level: 5 },
      ];

      const result = await getCheckInTrends(1, 10, "daily", 7);
      expect(result.period).toBe("daily");
      expect(result.days).toBe(7);
      expect(result.trends.length).toBeGreaterThanOrEqual(1);
    });

    it("returns weekly trends with mood distribution", async () => {
      // Use a date that's valid (recent)
      const d = new Date();
      const dateStr = d.toISOString().split("T")[0];
      chain._result = [
        { check_in_date: dateStr, mood: "good", energy_level: 3 },
        { check_in_date: dateStr, mood: "good", energy_level: 4 },
      ];

      const result = await getCheckInTrends(1, 10, "weekly", 30);
      expect(result.period).toBe("weekly");
      expect(result.trends.length).toBeGreaterThanOrEqual(1);
      if (result.trends.length > 0) {
        expect(result.trends[0]).toHaveProperty("mood_distribution");
        expect(result.trends[0]).toHaveProperty("avg_energy");
      }
    });

    it("returns empty trends when no check-ins", async () => {
      chain._result = [];
      const result = await getCheckInTrends(1, 10, "daily", 7);
      expect(result.trends).toEqual([]);
    });
  });
});
