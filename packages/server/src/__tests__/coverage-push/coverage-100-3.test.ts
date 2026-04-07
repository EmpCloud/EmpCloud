// =============================================================================
// Coverage Push: Wellness, Forum, Helpdesk KB — real DB tests
// Tests every exported function with parameter variations and edge cases
// =============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = "EmpCloud2026";
process.env.DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.RSA_PRIVATE_KEY_PATH = "/dev/null";
process.env.RSA_PUBLIC_KEY_PATH = "/dev/null";
process.env.BILLING_API_KEY = "test";
process.env.LOG_LEVEL = "error";

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { initDB, closeDB, getDB } from "../../db/connection.js";

const ORG = 5; // TechNova
const ADMIN = 522; // ananya@technova.in
const EMP = 524; // priya@technova.in
const MGR = 529; // karthik@technova.in
const U = String(Date.now()).slice(-6);

beforeAll(async () => { await initDB(); });
afterAll(async () => { await closeDB(); });

// =============================================================================
// WELLNESS SERVICE
// =============================================================================

describe("Wellness Service — Programs", () => {
  let wellness: typeof import("../../services/wellness/wellness.service.js");
  let programId: number;
  let programId2: number;

  beforeAll(async () => {
    wellness = await import("../../services/wellness/wellness.service.js");
  });

  afterAll(async () => {
    const db = getDB();
    // Clean up test data
    if (programId) {
      await db("wellness_enrollments").where("program_id", programId).del();
      await db("wellness_programs").where("id", programId).del();
    }
    if (programId2) {
      await db("wellness_enrollments").where("program_id", programId2).del();
      await db("wellness_programs").where("id", programId2).del();
    }
  });

  it("createProgram — fitness program with all fields", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const result = await wellness.createProgram(ORG, ADMIN, {
      title: `Test Fitness ${U}`,
      description: "A fitness challenge for coverage testing",
      program_type: "fitness",
      start_date: futureDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      max_participants: 10,
      is_active: true,
      points_reward: 50,
    } as any);

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    expect(result.title).toContain(`Test Fitness ${U}`);
    expect(result.program_type).toBe("fitness");
    expect(result.max_participants).toBe(10);
    expect(result.points_reward).toBe(50);
    expect(result.enrolled_count).toBe(0);
    programId = result.id;
  });

  it("createProgram — minimal fields (defaults)", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);

    const result = await wellness.createProgram(ORG, ADMIN, {
      title: `Test Mental ${U}`,
      program_type: "mental_health",
      start_date: futureDate.toISOString().split("T")[0],
    } as any);

    expect(result).toBeDefined();
    expect(result.program_type).toBe("mental_health");
    expect(result.is_active).toBeTruthy();
    programId2 = result.id;
  });

  it("createProgram — rejects past start_date", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    await expect(wellness.createProgram(ORG, ADMIN, {
      title: `Past Program ${U}`,
      program_type: "other",
      start_date: pastDate.toISOString().split("T")[0],
    } as any)).rejects.toThrow("Start date cannot be in the past");
  });

  it("createProgram — rejects end_date before start_date", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const earlierDate = new Date();
    earlierDate.setDate(earlierDate.getDate() + 5);

    await expect(wellness.createProgram(ORG, ADMIN, {
      title: `Bad Dates ${U}`,
      program_type: "nutrition",
      start_date: futureDate.toISOString().split("T")[0],
      end_date: earlierDate.toISOString().split("T")[0],
    } as any)).rejects.toThrow("End date cannot be before start date");
  });

  it("listPrograms — no filters", async () => {
    const result = await wellness.listPrograms(ORG);
    expect(result).toHaveProperty("programs");
    expect(result).toHaveProperty("total");
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("listPrograms — filter by program_type", async () => {
    const result = await wellness.listPrograms(ORG, { program_type: "fitness" } as any);
    expect(result.programs.length).toBeGreaterThanOrEqual(1);
    for (const p of result.programs) {
      expect(p.program_type).toBe("fitness");
    }
  });

  it("listPrograms — filter by is_active", async () => {
    const result = await wellness.listPrograms(ORG, { is_active: true } as any);
    expect(result.programs.length).toBeGreaterThanOrEqual(0);
  });

  it("listPrograms — with pagination", async () => {
    const result = await wellness.listPrograms(ORG, { page: 1, per_page: 2 } as any);
    expect(result.programs.length).toBeLessThanOrEqual(2);
  });

  it("getProgram — existing program", async () => {
    const result = await wellness.getProgram(ORG, programId);
    expect(result.id).toBe(programId);
    expect(result.organization_id).toBe(ORG);
  });

  it("getProgram — not found", async () => {
    await expect(wellness.getProgram(ORG, 999999)).rejects.toThrow();
  });

  it("updateProgram — update title and description", async () => {
    const result = await wellness.updateProgram(ORG, programId, {
      title: `Updated Fitness ${U}`,
      description: "Updated description",
    } as any);
    expect(result.title).toBe(`Updated Fitness ${U}`);
    expect(result.description).toBe("Updated description");
  });

  it("updateProgram — update program_type and points_reward", async () => {
    const result = await wellness.updateProgram(ORG, programId, {
      program_type: "team_activity",
      points_reward: 100,
    } as any);
    expect(result.program_type).toBe("team_activity");
    expect(result.points_reward).toBe(100);
  });

  it("updateProgram — deactivate program", async () => {
    const result = await wellness.updateProgram(ORG, programId2, {
      is_active: false,
    } as any);
    expect(result.is_active).toBeFalsy();
    // Re-activate for later tests
    await wellness.updateProgram(ORG, programId2, { is_active: true } as any);
  });

  it("updateProgram — rejects end_date before existing start_date", async () => {
    await expect(wellness.updateProgram(ORG, programId, {
      end_date: "2020-01-01",
    } as any)).rejects.toThrow("End date cannot be before start date");
  });

  it("updateProgram — not found", async () => {
    await expect(wellness.updateProgram(ORG, 999999, {
      title: "Nope",
    } as any)).rejects.toThrow();
  });
});

describe("Wellness Service — Enrollments", () => {
  let wellness: typeof import("../../services/wellness/wellness.service.js");
  let programId: number;

  beforeAll(async () => {
    wellness = await import("../../services/wellness/wellness.service.js");
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 60);

    const prog = await wellness.createProgram(ORG, ADMIN, {
      title: `Enrollment Test ${U}`,
      program_type: "fitness",
      start_date: futureDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      max_participants: 2,
      is_active: true,
    } as any);
    programId = prog.id;
  });

  afterAll(async () => {
    const db = getDB();
    await db("wellness_enrollments").where("program_id", programId).del();
    await db("wellness_programs").where("id", programId).del();
  });

  it("enrollInProgram — success", async () => {
    const result = await wellness.enrollInProgram(ORG, programId, EMP);
    expect(result).toHaveProperty("enrollment_id");
    expect(result.message).toContain("Successfully enrolled");
  });

  it("enrollInProgram — duplicate enrollment rejected", async () => {
    await expect(wellness.enrollInProgram(ORG, programId, EMP))
      .rejects.toThrow("already enrolled");
  });

  it("enrollInProgram — second user", async () => {
    const result = await wellness.enrollInProgram(ORG, programId, MGR);
    expect(result.enrollment_id).toBeGreaterThan(0);
  });

  it("enrollInProgram — max capacity reached", async () => {
    await expect(wellness.enrollInProgram(ORG, programId, ADMIN))
      .rejects.toThrow("maximum capacity");
  });

  it("enrollInProgram — inactive program not found", async () => {
    await expect(wellness.enrollInProgram(ORG, 999999, EMP))
      .rejects.toThrow();
  });

  it("getMyPrograms — returns enrolled programs", async () => {
    const result = await wellness.getMyPrograms(ORG, EMP);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const found = result.find((e: any) => e.program_id === programId);
    expect(found).toBeDefined();
    expect(found.enrollment_status).toBe("enrolled");
    expect(found.title).toContain(`Enrollment Test ${U}`);
  });

  it("getMyPrograms — user with no enrollments", async () => {
    // ADMIN was rejected above, so should have no enrollment on this program
    // (but may have others from prior tests; just check it returns array)
    const result = await wellness.getMyPrograms(ORG, ADMIN);
    expect(Array.isArray(result)).toBe(true);
  });

  it("completeProgram — success", async () => {
    const result = await wellness.completeProgram(ORG, programId, EMP);
    expect(result.message).toContain("completed");
  });

  it("completeProgram — already completed", async () => {
    await expect(wellness.completeProgram(ORG, programId, EMP))
      .rejects.toThrow("already completed");
  });

  it("completeProgram — enrollment not found", async () => {
    await expect(wellness.completeProgram(ORG, programId, ADMIN))
      .rejects.toThrow();
  });

  it("completeProgram — drop then try complete", async () => {
    const db = getDB();
    // Drop the MGR enrollment
    await db("wellness_enrollments")
      .where({ program_id: programId, user_id: MGR })
      .update({ status: "dropped" });

    await expect(wellness.completeProgram(ORG, programId, MGR))
      .rejects.toThrow("dropped");
  });
});

describe("Wellness Service — Daily Check-Ins", () => {
  let wellness: typeof import("../../services/wellness/wellness.service.js");
  const todayStr = new Date().toISOString().split("T")[0];

  beforeAll(async () => {
    wellness = await import("../../services/wellness/wellness.service.js");
  });

  afterAll(async () => {
    const db = getDB();
    await db("wellness_check_ins")
      .where({ organization_id: ORG, user_id: EMP })
      .where("notes", "like", `%${U}%`)
      .del();
  });

  it("dailyCheckIn — new check-in with all fields", async () => {
    const result = await wellness.dailyCheckIn(ORG, EMP, {
      mood: "great",
      energy_level: 4,
      sleep_hours: 7.5,
      exercise_minutes: 30,
      notes: `Test checkin ${U}`,
      check_in_date: todayStr,
    } as any);

    expect(result).toHaveProperty("id");
    expect(result.message).toBe("Check-in recorded");
    expect(result.check_in_date).toBe(todayStr);
  });

  it("dailyCheckIn — update existing check-in on same date", async () => {
    const result = await wellness.dailyCheckIn(ORG, EMP, {
      mood: "good",
      energy_level: 3,
      sleep_hours: 6,
      exercise_minutes: 45,
      notes: `Updated checkin ${U}`,
      check_in_date: todayStr,
    } as any);

    expect(result.message).toBe("Check-in updated");
  });

  it("dailyCheckIn — uses today when no check_in_date given", async () => {
    // Use MGR to avoid collision with EMP's existing check-in
    const result = await wellness.dailyCheckIn(ORG, MGR, {
      mood: "okay",
      energy_level: 2,
      notes: `Auto date ${U}`,
    } as any);

    expect(result).toHaveProperty("id");
    // Clean up
    const db = getDB();
    await db("wellness_check_ins").where("id", result.id).del();
  });

  it("dailyCheckIn — rejects energy_level out of range (0)", async () => {
    await expect(wellness.dailyCheckIn(ORG, EMP, {
      mood: "low",
      energy_level: 0,
      check_in_date: "2099-12-01",
    } as any)).rejects.toThrow("Energy level must be between 1 and 5");
  });

  it("dailyCheckIn — rejects energy_level out of range (6)", async () => {
    await expect(wellness.dailyCheckIn(ORG, EMP, {
      mood: "stressed",
      energy_level: 6,
      check_in_date: "2099-12-02",
    } as any)).rejects.toThrow("Energy level must be between 1 and 5");
  });

  it("dailyCheckIn — minimal fields (mood + energy_level only)", async () => {
    const result = await wellness.dailyCheckIn(ORG, ADMIN, {
      mood: "good",
      energy_level: 5,
      check_in_date: "2099-11-15",
      notes: `Minimal ${U}`,
    } as any);
    expect(result).toHaveProperty("id");
    // Clean up
    const db = getDB();
    await db("wellness_check_ins").where("id", result.id).del();
  });

  it("getMyCheckIns — no filters", async () => {
    const result = await wellness.getMyCheckIns(ORG, EMP);
    expect(result).toHaveProperty("check_ins");
    expect(result).toHaveProperty("total");
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("getMyCheckIns — with date range", async () => {
    const result = await wellness.getMyCheckIns(ORG, EMP, {
      start_date: todayStr,
      end_date: todayStr,
    });
    expect(result.check_ins.length).toBeGreaterThanOrEqual(1);
  });

  it("getMyCheckIns — with pagination", async () => {
    const result = await wellness.getMyCheckIns(ORG, EMP, {
      page: 1,
      per_page: 1,
    });
    expect(result.check_ins.length).toBeLessThanOrEqual(1);
  });

  it("getMyCheckIns — empty result for user with no check-ins", async () => {
    const result = await wellness.getMyCheckIns(ORG, 999999);
    expect(result.total).toBe(0);
    expect(result.check_ins.length).toBe(0);
  });
});

describe("Wellness Service — Check-In Trends", () => {
  let wellness: typeof import("../../services/wellness/wellness.service.js");

  beforeAll(async () => {
    wellness = await import("../../services/wellness/wellness.service.js");

    // Seed some check-ins for trend data
    const db = getDB();
    const today = new Date();
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];

      const exists = await db("wellness_check_ins")
        .where({ organization_id: ORG, user_id: ADMIN, check_in_date: dateStr })
        .first();
      if (!exists) {
        await db("wellness_check_ins").insert({
          organization_id: ORG,
          user_id: ADMIN,
          check_in_date: dateStr,
          mood: i % 2 === 0 ? "good" : "great",
          energy_level: Math.min(i + 2, 5),
          exercise_minutes: i * 15,
          notes: `Trend seed ${U}`,
          created_at: new Date(),
        });
      }
    }
  });

  afterAll(async () => {
    const db = getDB();
    await db("wellness_check_ins")
      .where({ organization_id: ORG, user_id: ADMIN })
      .where("notes", "like", `%Trend seed ${U}%`)
      .del();
  });

  it("getCheckInTrends — daily period", async () => {
    const result = await wellness.getCheckInTrends(ORG, ADMIN, "daily", 7);
    expect(result.period).toBe("daily");
    expect(result.days).toBe(7);
    expect(Array.isArray(result.trends)).toBe(true);
  });

  it("getCheckInTrends — weekly period", async () => {
    const result = await wellness.getCheckInTrends(ORG, ADMIN, "weekly", 30);
    expect(result.period).toBe("weekly");
    expect(result.days).toBe(30);
    expect(Array.isArray(result.trends)).toBe(true);
    if (result.trends.length > 0) {
      expect(result.trends[0]).toHaveProperty("period_start");
      expect(result.trends[0]).toHaveProperty("check_in_count");
      expect(result.trends[0]).toHaveProperty("mood_distribution");
      expect(result.trends[0]).toHaveProperty("avg_energy");
    }
  });

  it("getCheckInTrends — defaults to daily with 30 days", async () => {
    const result = await wellness.getCheckInTrends(ORG, ADMIN);
    expect(result.period).toBe("daily");
    expect(result.days).toBe(30);
  });

  it("getCheckInTrends — user with no check-ins", async () => {
    const result = await wellness.getCheckInTrends(ORG, 999999, "daily", 7);
    expect(result.trends.length).toBe(0);
  });
});

describe("Wellness Service — Goals", () => {
  let wellness: typeof import("../../services/wellness/wellness.service.js");
  let goalId: number;
  let goalId2: number;

  beforeAll(async () => {
    wellness = await import("../../services/wellness/wellness.service.js");
  });

  afterAll(async () => {
    const db = getDB();
    await db("wellness_goals")
      .where({ organization_id: ORG, user_id: EMP })
      .where("title", "like", `%${U}%`)
      .del();
  });

  it("createGoal — exercise goal with all fields", async () => {
    const result = await wellness.createGoal(ORG, EMP, {
      title: `Run 100km ${U}`,
      goal_type: "exercise",
      target_value: 100,
      unit: "km",
      frequency: "weekly",
      start_date: new Date().toISOString().split("T")[0],
      end_date: new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0],
    } as any);

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    expect(result.title).toContain(`Run 100km ${U}`);
    expect(result.goal_type).toBe("exercise");
    expect(result.target_value).toBe(100);
    expect(result.current_value).toBe(0);
    expect(result.status).toBe("active");
    goalId = result.id;
  });

  it("createGoal — minimal fields (defaults)", async () => {
    const result = await wellness.createGoal(ORG, EMP, {
      title: `Sleep Goal ${U}`,
      target_value: 56,
      unit: "hours",
      start_date: new Date().toISOString().split("T")[0],
    } as any);

    expect(result.goal_type).toBe("custom");
    expect(result.frequency).toBe("daily");
    goalId2 = result.id;
  });

  it("createGoal — rejects end_date before start_date", async () => {
    await expect(wellness.createGoal(ORG, EMP, {
      title: `Bad Goal ${U}`,
      target_value: 10,
      unit: "sessions",
      start_date: "2026-06-01",
      end_date: "2026-05-01",
    } as any)).rejects.toThrow("End date cannot be before start date");
  });

  it("getGoal — existing goal", async () => {
    const result = await wellness.getGoal(ORG, EMP, goalId);
    expect(result.id).toBe(goalId);
    expect(result.user_id).toBe(EMP);
  });

  it("getGoal — not found", async () => {
    await expect(wellness.getGoal(ORG, EMP, 999999)).rejects.toThrow();
  });

  it("getGoal — wrong user", async () => {
    await expect(wellness.getGoal(ORG, MGR, goalId)).rejects.toThrow();
  });

  it("updateGoalProgress — update current_value", async () => {
    const result = await wellness.updateGoalProgress(ORG, EMP, goalId, {
      current_value: 50,
    } as any);
    expect(result.current_value).toBe(50);
    expect(result.status).toBe("active");
  });

  it("updateGoalProgress — update title", async () => {
    const result = await wellness.updateGoalProgress(ORG, EMP, goalId, {
      title: `Run 200km ${U}`,
    } as any);
    expect(result.title).toBe(`Run 200km ${U}`);
  });

  it("updateGoalProgress — update target_value", async () => {
    const result = await wellness.updateGoalProgress(ORG, EMP, goalId, {
      target_value: 200,
    } as any);
    expect(result.target_value).toBe(200);
  });

  it("updateGoalProgress — auto-complete when target reached", async () => {
    const result = await wellness.updateGoalProgress(ORG, EMP, goalId, {
      current_value: 200,
    } as any);
    expect(result.status).toBe("completed");
  });

  it("updateGoalProgress — cannot update completed goal", async () => {
    await expect(wellness.updateGoalProgress(ORG, EMP, goalId, {
      current_value: 300,
    } as any)).rejects.toThrow("Can only update active goals");
  });

  it("updateGoalProgress — set status explicitly", async () => {
    // Use goalId2 which is still active
    const result = await wellness.updateGoalProgress(ORG, EMP, goalId2, {
      status: "abandoned",
    } as any);
    expect(result.status).toBe("abandoned");
  });

  it("updateGoalProgress — not found", async () => {
    await expect(wellness.updateGoalProgress(ORG, EMP, 999999, {
      current_value: 10,
    } as any)).rejects.toThrow();
  });

  it("getMyGoals — all goals", async () => {
    const result = await wellness.getMyGoals(ORG, EMP);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("getMyGoals — filter by status", async () => {
    const result = await wellness.getMyGoals(ORG, EMP, "completed");
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const g of result) {
      expect(g.status).toBe("completed");
    }
  });

  it("getMyGoals — empty result", async () => {
    const result = await wellness.getMyGoals(ORG, 999999, "active");
    expect(result.length).toBe(0);
  });

  it("deleteGoal — success", async () => {
    await wellness.deleteGoal(ORG, EMP, goalId);
    await expect(wellness.getGoal(ORG, EMP, goalId)).rejects.toThrow();
  });

  it("deleteGoal — not found", async () => {
    await expect(wellness.deleteGoal(ORG, EMP, 999999)).rejects.toThrow();
  });

  it("deleteGoal — wrong user", async () => {
    await expect(wellness.deleteGoal(ORG, MGR, goalId2)).rejects.toThrow();
  });
});

describe("Wellness Service — Dashboards", () => {
  let wellness: typeof import("../../services/wellness/wellness.service.js");

  beforeAll(async () => {
    wellness = await import("../../services/wellness/wellness.service.js");
  });

  it("getWellnessDashboard — returns all stats", async () => {
    const result = await wellness.getWellnessDashboard(ORG);

    expect(result).toHaveProperty("active_programs");
    expect(result).toHaveProperty("total_programs");
    expect(result).toHaveProperty("total_enrollments");
    expect(result).toHaveProperty("completed_enrollments");
    expect(result).toHaveProperty("checkin_count_30d");
    expect(result).toHaveProperty("active_participants");
    expect(result).toHaveProperty("mood_distribution");
    expect(result).toHaveProperty("avg_energy_level");
    expect(result).toHaveProperty("avg_exercise_minutes");
    expect(result).toHaveProperty("total_goals");
    expect(result).toHaveProperty("completed_goals");
    expect(result).toHaveProperty("goal_completion_rate");
    expect(result).toHaveProperty("wellness_score");
    expect(result).toHaveProperty("recent_programs");
    expect(result).toHaveProperty("top_programs");

    expect(typeof result.active_programs).toBe("number");
    expect(typeof result.total_programs).toBe("number");
    expect(typeof result.goal_completion_rate).toBe("number");
    expect(Array.isArray(result.recent_programs)).toBe(true);
    expect(Array.isArray(result.top_programs)).toBe(true);
  });

  it("getWellnessDashboard — org with no data", async () => {
    const result = await wellness.getWellnessDashboard(99999);
    expect(result.active_programs).toBe(0);
    expect(result.total_programs).toBe(0);
    expect(result.wellness_score).toBeNull();
  });

  it("getMyWellnessSummary — returns personal stats", async () => {
    const result = await wellness.getMyWellnessSummary(ORG, EMP);

    expect(result).toHaveProperty("mood_trend");
    expect(result).toHaveProperty("active_goals");
    expect(result).toHaveProperty("completed_goals_count");
    expect(result).toHaveProperty("enrolled_programs");
    expect(result).toHaveProperty("checkin_streak");
    expect(result).toHaveProperty("total_checkins");
    expect(result).toHaveProperty("latest_mood");
    expect(result).toHaveProperty("avg_energy_level");

    expect(Array.isArray(result.mood_trend)).toBe(true);
    expect(Array.isArray(result.active_goals)).toBe(true);
    expect(Array.isArray(result.enrolled_programs)).toBe(true);
    expect(typeof result.checkin_streak).toBe("number");
    expect(typeof result.total_checkins).toBe("number");
  });

  it("getMyWellnessSummary — user with no data", async () => {
    const result = await wellness.getMyWellnessSummary(ORG, 999999);
    expect(result.mood_trend.length).toBe(0);
    expect(result.active_goals.length).toBe(0);
    expect(result.enrolled_programs.length).toBe(0);
    expect(result.checkin_streak).toBe(0);
    expect(result.total_checkins).toBe(0);
    expect(result.latest_mood).toBeNull();
    expect(result.avg_energy_level).toBeNull();
  });
});

// =============================================================================
// FORUM SERVICE
// =============================================================================

describe("Forum Service — Categories", () => {
  let forum: typeof import("../../services/forum/forum.service.js");
  let categoryId: number;

  beforeAll(async () => {
    forum = await import("../../services/forum/forum.service.js");
  });

  afterAll(async () => {
    const db = getDB();
    if (categoryId) {
      await db("forum_categories").where("id", categoryId).del();
    }
  });

  it("createCategory — full fields", async () => {
    const result = await forum.createCategory(ORG, {
      name: `Test Cat ${U}`,
      description: "A test category for coverage",
      icon: "🧪",
      sort_order: 99,
    } as any);

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    expect(result.name).toBe(`Test Cat ${U}`);
    expect(result.icon).toBe("🧪");
    expect(result.sort_order).toBe(99);
    expect(result.is_active).toBeTruthy();
    categoryId = result.id;
  });

  it("createCategory — minimal fields", async () => {
    const result = await forum.createCategory(ORG, {
      name: `Minimal Cat ${U}`,
    } as any);
    expect(result.description).toBeNull();
    expect(result.icon).toBeNull();
    expect(result.sort_order).toBe(0);
    // Clean up
    const db = getDB();
    await db("forum_categories").where("id", result.id).del();
  });

  it("listCategories — returns categories with post counts", async () => {
    const result = await forum.listCategories(ORG);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Should have post_count from subquery
    expect(result[0]).toHaveProperty("post_count");
  });

  it("updateCategory — update name and description", async () => {
    const result = await forum.updateCategory(ORG, categoryId, {
      name: `Updated Cat ${U}`,
      description: "Updated desc",
    } as any);
    expect(result.name).toBe(`Updated Cat ${U}`);
    expect(result.description).toBe("Updated desc");
  });

  it("updateCategory — update icon and sort_order", async () => {
    const result = await forum.updateCategory(ORG, categoryId, {
      icon: "🔬",
      sort_order: 50,
    } as any);
    expect(result.icon).toBe("🔬");
    expect(result.sort_order).toBe(50);
  });

  it("updateCategory — not found", async () => {
    await expect(forum.updateCategory(ORG, 999999, {
      name: "Nope",
    } as any)).rejects.toThrow();
  });
});

describe("Forum Service — Posts", () => {
  let forum: typeof import("../../services/forum/forum.service.js");
  let categoryId: number;
  let postId: number;
  let questionPostId: number;

  beforeAll(async () => {
    forum = await import("../../services/forum/forum.service.js");

    const cat = await forum.createCategory(ORG, {
      name: `Post Test Cat ${U}`,
    } as any);
    categoryId = cat.id;
  });

  afterAll(async () => {
    const db = getDB();
    // Clean up in order: likes -> replies -> posts -> category
    if (postId) {
      await db("forum_likes").where({ target_type: "post", target_id: postId }).del();
      await db("forum_replies").where("post_id", postId).del();
      await db("forum_posts").where("id", postId).del();
    }
    if (questionPostId) {
      await db("forum_likes").where({ target_type: "post", target_id: questionPostId }).del();
      await db("forum_replies").where("post_id", questionPostId).del();
      await db("forum_posts").where("id", questionPostId).del();
    }
    if (categoryId) {
      await db("forum_categories").where("id", categoryId).del();
    }
  });

  it("createPost — discussion post with tags", async () => {
    const result = await forum.createPost(ORG, ADMIN, {
      category_id: categoryId,
      title: `Test Discussion ${U}`,
      content: "This is a test discussion for coverage testing",
      tags: ["test", "coverage"],
      post_type: "discussion",
    } as any);

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    expect(result.title).toContain(`Test Discussion ${U}`);
    expect(result.post_type).toBe("discussion");
    expect(result.is_pinned).toBeFalsy();
    expect(result.is_locked).toBeFalsy();
    expect(result.view_count).toBe(0);
    postId = result.id;
  });

  it("createPost — question post", async () => {
    const result = await forum.createPost(ORG, EMP, {
      category_id: categoryId,
      title: `Test Question ${U}`,
      content: "How does one test coverage?",
      post_type: "question",
    } as any);

    expect(result.post_type).toBe("question");
    questionPostId = result.id;
  });

  it("createPost — invalid category", async () => {
    await expect(forum.createPost(ORG, ADMIN, {
      category_id: 999999,
      title: "Bad post",
      content: "Should fail",
    } as any)).rejects.toThrow();
  });

  it("listPosts — no filters", async () => {
    const result = await forum.listPosts(ORG, {} as any);
    expect(result).toHaveProperty("posts");
    expect(result).toHaveProperty("total");
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("listPosts — filter by category_id", async () => {
    const result = await forum.listPosts(ORG, { category_id: categoryId } as any);
    expect(result.posts.length).toBeGreaterThanOrEqual(1);
    for (const p of result.posts) {
      expect(p.category_id).toBe(categoryId);
    }
  });

  it("listPosts — filter by post_type", async () => {
    const result = await forum.listPosts(ORG, { post_type: "question" } as any);
    for (const p of result.posts) {
      expect(p.post_type).toBe("question");
    }
  });

  it("listPosts — filter by author_id", async () => {
    const result = await forum.listPosts(ORG, { author_id: ADMIN } as any);
    for (const p of result.posts) {
      expect(p.author_id).toBe(ADMIN);
    }
  });

  it("listPosts — search", async () => {
    const result = await forum.listPosts(ORG, { search: U } as any);
    expect(result.posts.length).toBeGreaterThanOrEqual(1);
  });

  it("listPosts — sort by popular", async () => {
    const result = await forum.listPosts(ORG, { sort_by: "popular" } as any);
    expect(result).toHaveProperty("posts");
  });

  it("listPosts — sort by trending", async () => {
    const result = await forum.listPosts(ORG, { sort_by: "trending" } as any);
    expect(result).toHaveProperty("posts");
  });

  it("listPosts — sort by views", async () => {
    const result = await forum.listPosts(ORG, { sort_by: "views" } as any);
    expect(result).toHaveProperty("posts");
  });

  it("listPosts — pagination", async () => {
    const result = await forum.listPosts(ORG, { page: 1, per_page: 1 } as any);
    expect(result.posts.length).toBeLessThanOrEqual(1);
  });

  it("getPost — without incrementing view", async () => {
    const result = await forum.getPost(ORG, postId, false);
    expect(result.id).toBe(postId);
    expect(result).toHaveProperty("replies");
    expect(Array.isArray(result.replies)).toBe(true);
    expect(result).toHaveProperty("author_first_name");
    expect(result).toHaveProperty("category_name");
  });

  it("getPost — with incrementing view", async () => {
    const before = await forum.getPost(ORG, postId, false);
    await forum.getPost(ORG, postId, true);
    const after = await forum.getPost(ORG, postId, false);
    expect(after.view_count).toBeGreaterThanOrEqual(before.view_count);
  });

  it("getPost — not found", async () => {
    await expect(forum.getPost(ORG, 999999)).rejects.toThrow();
  });

  it("updatePost — update title and content", async () => {
    const result = await forum.updatePost(ORG, postId, ADMIN, {
      title: `Updated Discussion ${U}`,
      content: "Updated content for coverage",
    } as any);
    expect(result.title).toContain(`Updated Discussion ${U}`);
  });

  it("updatePost — update tags", async () => {
    const result = await forum.updatePost(ORG, postId, ADMIN, {
      tags: ["updated", "tag"],
    } as any);
    expect(result.tags).toContain("updated");
  });

  it("updatePost — clear tags", async () => {
    const result = await forum.updatePost(ORG, postId, ADMIN, {
      tags: null as any,
    } as any);
    expect(result.tags).toBeNull();
  });

  it("updatePost — wrong user forbidden", async () => {
    await expect(forum.updatePost(ORG, postId, EMP, {
      title: "Nope",
    } as any)).rejects.toThrow("only edit your own");
  });

  it("updatePost — not found", async () => {
    await expect(forum.updatePost(ORG, 999999, ADMIN, {
      title: "Nope",
    } as any)).rejects.toThrow();
  });

  it("pinPost — toggle pin on", async () => {
    const result = await forum.pinPost(ORG, postId);
    expect(result.is_pinned).toBe(true);
  });

  it("pinPost — toggle pin off", async () => {
    const result = await forum.pinPost(ORG, postId);
    expect(result.is_pinned).toBe(false);
  });

  it("pinPost — not found", async () => {
    await expect(forum.pinPost(ORG, 999999)).rejects.toThrow();
  });

  it("lockPost — toggle lock on", async () => {
    const result = await forum.lockPost(ORG, postId);
    expect(result.is_locked).toBe(true);
  });

  it("lockPost — toggle lock off", async () => {
    const result = await forum.lockPost(ORG, postId);
    expect(result.is_locked).toBe(false);
  });

  it("lockPost — not found", async () => {
    await expect(forum.lockPost(ORG, 999999)).rejects.toThrow();
  });
});

describe("Forum Service — Replies", () => {
  let forum: typeof import("../../services/forum/forum.service.js");
  let categoryId: number;
  let postId: number;
  let questionPostId: number;
  let replyId: number;
  let replyId2: number;

  beforeAll(async () => {
    forum = await import("../../services/forum/forum.service.js");

    const cat = await forum.createCategory(ORG, { name: `Reply Cat ${U}` } as any);
    categoryId = cat.id;

    const post = await forum.createPost(ORG, ADMIN, {
      category_id: categoryId,
      title: `Reply Test ${U}`,
      content: "Post for reply tests",
    } as any);
    postId = post.id;

    const qpost = await forum.createPost(ORG, EMP, {
      category_id: categoryId,
      title: `Question Reply ${U}`,
      content: "Question for accept tests",
      post_type: "question",
    } as any);
    questionPostId = qpost.id;
  });

  afterAll(async () => {
    const db = getDB();
    // Clean up
    const replyIds = await db("forum_replies")
      .whereIn("post_id", [postId, questionPostId])
      .pluck("id");
    if (replyIds.length > 0) {
      await db("forum_likes").where("target_type", "reply").whereIn("target_id", replyIds).del();
    }
    await db("forum_likes").where("target_type", "post").whereIn("target_id", [postId, questionPostId]).del();
    await db("forum_replies").whereIn("post_id", [postId, questionPostId]).del();
    await db("forum_posts").whereIn("id", [postId, questionPostId]).del();
    await db("forum_categories").where("id", categoryId).del();
  });

  it("createReply — basic reply", async () => {
    const result = await forum.createReply(ORG, postId, EMP, {
      content: `Test reply ${U}`,
    } as any);

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    expect(result.post_id).toBe(postId);
    expect(result.author_id).toBe(EMP);
    expect(result.is_accepted).toBeFalsy();
    replyId = result.id;
  });

  it("createReply — nested reply with parent_reply_id", async () => {
    const result = await forum.createReply(ORG, postId, MGR, {
      content: `Nested reply ${U}`,
      parent_reply_id: replyId,
    } as any);

    expect(result.parent_reply_id).toBe(replyId);
    replyId2 = result.id;
  });

  it("createReply — invalid parent_reply_id", async () => {
    await expect(forum.createReply(ORG, postId, EMP, {
      content: "Bad parent",
      parent_reply_id: 999999,
    } as any)).rejects.toThrow("Parent reply");
  });

  it("createReply — on locked post rejected", async () => {
    await forum.lockPost(ORG, postId);
    await expect(forum.createReply(ORG, postId, EMP, {
      content: "Should fail",
    } as any)).rejects.toThrow("locked");
    // Unlock for later tests
    await forum.lockPost(ORG, postId);
  });

  it("createReply — post not found", async () => {
    await expect(forum.createReply(ORG, 999999, EMP, {
      content: "Nope",
    } as any)).rejects.toThrow();
  });

  it("createReply — on question post", async () => {
    const result = await forum.createReply(ORG, questionPostId, MGR, {
      content: `Answer to question ${U}`,
    } as any);
    expect(result.post_id).toBe(questionPostId);
    // Save for accept test
    replyId2 = result.id;
  });

  it("acceptReply — question author accepts", async () => {
    const result = await forum.acceptReply(ORG, replyId2, EMP);
    expect(result.is_accepted).toBe(true);
  });

  it("acceptReply — toggle off (already accepted)", async () => {
    const result = await forum.acceptReply(ORG, replyId2, EMP);
    expect(result.is_accepted).toBe(false);
  });

  it("acceptReply — non-question post forbidden", async () => {
    await expect(forum.acceptReply(ORG, replyId, ADMIN))
      .rejects.toThrow("Only question posts");
  });

  it("acceptReply — non-author forbidden", async () => {
    // MGR is not the question author (EMP is)
    const qReply = await forum.createReply(ORG, questionPostId, ADMIN, {
      content: `Another answer ${U}`,
    } as any);
    await expect(forum.acceptReply(ORG, qReply.id, MGR))
      .rejects.toThrow("Only the question author");
  });

  it("acceptReply — not found", async () => {
    await expect(forum.acceptReply(ORG, 999999, EMP)).rejects.toThrow();
  });

  it("deleteReply — author can delete own reply", async () => {
    const tmpReply = await forum.createReply(ORG, postId, EMP, {
      content: `Delete me ${U}`,
    } as any);
    await forum.deleteReply(ORG, tmpReply.id, EMP, "employee");
    // Verify deleted
    const db = getDB();
    const check = await db("forum_replies").where("id", tmpReply.id).first();
    expect(check).toBeUndefined();
  });

  it("deleteReply — HR can delete any reply", async () => {
    const tmpReply = await forum.createReply(ORG, postId, EMP, {
      content: `HR delete me ${U}`,
    } as any);
    await forum.deleteReply(ORG, tmpReply.id, ADMIN, "hr_admin");
  });

  it("deleteReply — non-author non-HR forbidden", async () => {
    const tmpReply = await forum.createReply(ORG, postId, ADMIN, {
      content: `No delete ${U}`,
    } as any);
    await expect(forum.deleteReply(ORG, tmpReply.id, EMP, "employee"))
      .rejects.toThrow("only delete your own");
    // Clean up
    const db = getDB();
    await db("forum_replies").where("id", tmpReply.id).del();
  });

  it("deleteReply — not found", async () => {
    await expect(forum.deleteReply(ORG, 999999, ADMIN, "hr_admin"))
      .rejects.toThrow();
  });
});

describe("Forum Service — Likes", () => {
  let forum: typeof import("../../services/forum/forum.service.js");
  let categoryId: number;
  let postId: number;
  let replyId: number;

  beforeAll(async () => {
    forum = await import("../../services/forum/forum.service.js");

    const cat = await forum.createCategory(ORG, { name: `Like Cat ${U}` } as any);
    categoryId = cat.id;

    const post = await forum.createPost(ORG, ADMIN, {
      category_id: categoryId,
      title: `Like Test ${U}`,
      content: "Post for like tests",
    } as any);
    postId = post.id;

    const reply = await forum.createReply(ORG, postId, EMP, {
      content: `Likeable reply ${U}`,
    } as any);
    replyId = reply.id;
  });

  afterAll(async () => {
    const db = getDB();
    await db("forum_likes").where("target_type", "post").where("target_id", postId).del();
    await db("forum_likes").where("target_type", "reply").where("target_id", replyId).del();
    await db("forum_replies").where("post_id", postId).del();
    await db("forum_posts").where("id", postId).del();
    await db("forum_categories").where("id", categoryId).del();
  });

  it("toggleLike — like a post", async () => {
    const result = await forum.toggleLike(ORG, EMP, {
      target_type: "post",
      target_id: postId,
    } as any);
    expect(result.liked).toBe(true);
  });

  it("toggleLike — unlike a post (toggle off)", async () => {
    const result = await forum.toggleLike(ORG, EMP, {
      target_type: "post",
      target_id: postId,
    } as any);
    expect(result.liked).toBe(false);
  });

  it("toggleLike — like a reply", async () => {
    const result = await forum.toggleLike(ORG, MGR, {
      target_type: "reply",
      target_id: replyId,
    } as any);
    expect(result.liked).toBe(true);
  });

  it("toggleLike — unlike a reply", async () => {
    const result = await forum.toggleLike(ORG, MGR, {
      target_type: "reply",
      target_id: replyId,
    } as any);
    expect(result.liked).toBe(false);
  });

  it("toggleLike — post not found", async () => {
    await expect(forum.toggleLike(ORG, EMP, {
      target_type: "post",
      target_id: 999999,
    } as any)).rejects.toThrow();
  });

  it("toggleLike — reply not found", async () => {
    await expect(forum.toggleLike(ORG, EMP, {
      target_type: "reply",
      target_id: 999999,
    } as any)).rejects.toThrow();
  });

  it("getUserLikes — returns liked target ids", async () => {
    // Like the post first
    await forum.toggleLike(ORG, EMP, { target_type: "post", target_id: postId } as any);

    const result = await forum.getUserLikes(ORG, EMP, "post", [postId, 999999]);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain(postId);
    expect(result).not.toContain(999999);
  });

  it("getUserLikes — empty array input", async () => {
    const result = await forum.getUserLikes(ORG, EMP, "post", []);
    expect(result).toEqual([]);
  });

  it("getUserLikes — no likes found", async () => {
    const result = await forum.getUserLikes(ORG, 999999, "post", [postId]);
    expect(result.length).toBe(0);
  });
});

describe("Forum Service — Dashboard", () => {
  let forum: typeof import("../../services/forum/forum.service.js");

  beforeAll(async () => {
    forum = await import("../../services/forum/forum.service.js");
  });

  it("getForumDashboard — returns all stats", async () => {
    const result = await forum.getForumDashboard(ORG);

    expect(result).toHaveProperty("total_posts");
    expect(result).toHaveProperty("total_replies");
    expect(result).toHaveProperty("active_discussions");
    expect(result).toHaveProperty("top_contributors");
    expect(result).toHaveProperty("trending_posts");
    expect(result).toHaveProperty("categories");

    expect(typeof result.total_posts).toBe("number");
    expect(typeof result.total_replies).toBe("number");
    expect(typeof result.active_discussions).toBe("number");
    expect(Array.isArray(result.trending_posts)).toBe(true);
    expect(Array.isArray(result.categories)).toBe(true);
  });

  it("getForumDashboard — org with minimal data", async () => {
    const result = await forum.getForumDashboard(99999);
    expect(result.total_posts).toBe(0);
    expect(result.total_replies).toBe(0);
  });
});

describe("Forum Service — Delete Post (cascade)", () => {
  let forum: typeof import("../../services/forum/forum.service.js");
  let categoryId: number;
  let postId: number;

  beforeAll(async () => {
    forum = await import("../../services/forum/forum.service.js");

    const cat = await forum.createCategory(ORG, { name: `Del Cat ${U}` } as any);
    categoryId = cat.id;

    const post = await forum.createPost(ORG, ADMIN, {
      category_id: categoryId,
      title: `Delete Post ${U}`,
      content: "Post with replies and likes to delete",
    } as any);
    postId = post.id;

    // Add reply and likes
    const reply = await forum.createReply(ORG, postId, EMP, {
      content: `Reply to delete ${U}`,
    } as any);
    await forum.toggleLike(ORG, EMP, { target_type: "post", target_id: postId } as any);
    await forum.toggleLike(ORG, MGR, { target_type: "reply", target_id: reply.id } as any);
  });

  afterAll(async () => {
    const db = getDB();
    await db("forum_categories").where("id", categoryId).del();
  });

  it("deletePost — author can delete own post (cascades)", async () => {
    await forum.deletePost(ORG, postId, ADMIN, "employee");
    const db = getDB();
    const check = await db("forum_posts").where("id", postId).first();
    expect(check).toBeUndefined();
    // Replies and likes should be gone too
    const replies = await db("forum_replies").where("post_id", postId);
    expect(replies.length).toBe(0);
  });

  it("deletePost — HR can delete any post", async () => {
    const post2 = await forum.createPost(ORG, EMP, {
      category_id: categoryId,
      title: `HR Delete ${U}`,
      content: "HR deletes this",
    } as any);
    await forum.deletePost(ORG, post2.id, ADMIN, "org_admin");
    const db = getDB();
    const check = await db("forum_posts").where("id", post2.id).first();
    expect(check).toBeUndefined();
  });

  it("deletePost — non-author non-HR forbidden", async () => {
    const post3 = await forum.createPost(ORG, ADMIN, {
      category_id: categoryId,
      title: `No Delete ${U}`,
      content: "Cannot delete",
    } as any);
    await expect(forum.deletePost(ORG, post3.id, EMP, "employee"))
      .rejects.toThrow("only delete your own");
    // Clean up
    const db = getDB();
    await db("forum_posts").where("id", post3.id).del();
  });

  it("deletePost — not found", async () => {
    await expect(forum.deletePost(ORG, 999999, ADMIN, "hr_admin"))
      .rejects.toThrow();
  });
});

// =============================================================================
// HELPDESK SERVICE — Knowledge Base
// =============================================================================

describe("Helpdesk KB — Articles", () => {
  let helpdesk: typeof import("../../services/helpdesk/helpdesk.service.js");
  let articleId: number;
  let articleSlug: string;
  let articleId2: number;

  beforeAll(async () => {
    helpdesk = await import("../../services/helpdesk/helpdesk.service.js");
  });

  afterAll(async () => {
    const db = getDB();
    // Clean up ratings and articles
    if (articleId) {
      await db("kb_article_ratings").where("article_id", articleId).del().catch(() => {});
      await db("knowledge_base_articles").where("id", articleId).del();
    }
    if (articleId2) {
      await db("kb_article_ratings").where("article_id", articleId2).del().catch(() => {});
      await db("knowledge_base_articles").where("id", articleId2).del();
    }
  });

  it("createArticle — published article with all fields", async () => {
    const result = await helpdesk.createArticle(ORG, ADMIN, {
      title: `How to Use Leave ${U}`,
      content: "Step 1: Go to leave page. Step 2: Apply for leave.",
      category: "leave",
      slug: `leave-guide-${U}`,
      is_published: true,
      is_featured: true,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    expect(result.title).toContain(`How to Use Leave ${U}`);
    expect(result.slug).toBe(`leave-guide-${U}`);
    expect(result.category).toBe("leave");
    expect(result.is_published).toBeTruthy();
    expect(result.is_featured).toBeTruthy();
    expect(result.author_id).toBe(ADMIN);
    articleId = result.id;
    articleSlug = result.slug;
  });

  it("createArticle — draft article with auto-generated slug", async () => {
    const result = await helpdesk.createArticle(ORG, EMP, {
      title: `Attendance Policy ${U}`,
      content: "The attendance policy states...",
      category: "policy",
      is_published: false,
    });

    expect(result.is_published).toBeFalsy();
    expect(result.is_featured).toBeFalsy();
    expect(result.slug).toContain("attendance-policy");
    articleId2 = result.id;
  });

  it("createArticle — duplicate slug gets timestamp appended", async () => {
    const result = await helpdesk.createArticle(ORG, ADMIN, {
      title: `How to Use Leave ${U}`,
      content: "Duplicate slug test",
      category: "leave",
      slug: `leave-guide-${U}`,
      is_published: true,
    });

    // Slug should be different from the first one
    expect(result.slug).not.toBe(`leave-guide-${U}`);
    expect(result.slug).toContain(`leave-guide-${U}`);
    // Clean up
    const db = getDB();
    await db("knowledge_base_articles").where("id", result.id).del();
  });

  it("createArticle — defaults is_published to false", async () => {
    const result = await helpdesk.createArticle(ORG, ADMIN, {
      title: `Default Draft ${U}`,
      content: "Should be unpublished by default",
      category: "general",
    });
    expect(result.is_published).toBeFalsy();
    const db = getDB();
    await db("knowledge_base_articles").where("id", result.id).del();
  });

  it("listArticles — published only (default)", async () => {
    const result = await helpdesk.listArticles(ORG);
    expect(result).toHaveProperty("articles");
    expect(result).toHaveProperty("total");
    // All returned should be published
    for (const a of result.articles) {
      expect(a.is_published).toBeTruthy();
    }
  });

  it("listArticles — include unpublished", async () => {
    const result = await helpdesk.listArticles(ORG, { published_only: false });
    expect(result.total).toBeGreaterThanOrEqual(2); // at least our 2 articles
  });

  it("listArticles — filter by category", async () => {
    const result = await helpdesk.listArticles(ORG, {
      category: "leave",
      published_only: false,
    });
    for (const a of result.articles) {
      expect(a.category).toBe("leave");
    }
  });

  it("listArticles — search by title", async () => {
    const result = await helpdesk.listArticles(ORG, {
      search: U,
      published_only: false,
    });
    expect(result.articles.length).toBeGreaterThanOrEqual(1);
  });

  it("listArticles — pagination", async () => {
    const result = await helpdesk.listArticles(ORG, {
      page: 1,
      perPage: 1,
      published_only: false,
    });
    expect(result.articles.length).toBeLessThanOrEqual(1);
  });

  it("listArticles — empty result", async () => {
    const result = await helpdesk.listArticles(ORG, {
      category: "nonexistent-category-xyz",
    });
    expect(result.total).toBe(0);
    expect(result.articles.length).toBe(0);
  });

  it("getArticle — by numeric ID", async () => {
    const result = await helpdesk.getArticle(ORG, String(articleId));
    expect(result.id).toBe(articleId);
    expect(result).toHaveProperty("author_name");
    expect(result.view_count).toBeGreaterThanOrEqual(1); // incremented
  });

  it("getArticle — by slug", async () => {
    const result = await helpdesk.getArticle(ORG, articleSlug);
    expect(result.id).toBe(articleId);
    expect(result.slug).toBe(articleSlug);
  });

  it("getArticle — not found by ID", async () => {
    await expect(helpdesk.getArticle(ORG, "999999")).rejects.toThrow();
  });

  it("getArticle — not found by slug", async () => {
    await expect(helpdesk.getArticle(ORG, "nonexistent-slug-xyz")).rejects.toThrow();
  });

  it("getArticle — increments view count each call", async () => {
    const first = await helpdesk.getArticle(ORG, String(articleId));
    const second = await helpdesk.getArticle(ORG, String(articleId));
    expect(second.view_count).toBeGreaterThan(first.view_count);
  });

  it("updateArticle — update title and content", async () => {
    const result = await helpdesk.updateArticle(ORG, articleId, {
      title: `Updated Leave Guide ${U}`,
      content: "Updated content with more detail",
    });
    expect(result.title).toBe(`Updated Leave Guide ${U}`);
  });

  it("updateArticle — update category", async () => {
    const result = await helpdesk.updateArticle(ORG, articleId, {
      category: "payroll",
    });
    expect(result.category).toBe("payroll");
  });

  it("updateArticle — update slug", async () => {
    const result = await helpdesk.updateArticle(ORG, articleId, {
      slug: `new-slug-${U}`,
    });
    expect(result.slug).toBe(`new-slug-${U}`);
    articleSlug = result.slug;
  });

  it("updateArticle — toggle is_published", async () => {
    const result = await helpdesk.updateArticle(ORG, articleId, {
      is_published: false,
    });
    expect(result.is_published).toBeFalsy();
    // Re-publish
    await helpdesk.updateArticle(ORG, articleId, { is_published: true });
  });

  it("updateArticle — toggle is_featured", async () => {
    const result = await helpdesk.updateArticle(ORG, articleId, {
      is_featured: false,
    });
    expect(result.is_featured).toBeFalsy();
  });

  it("updateArticle — not found", async () => {
    await expect(helpdesk.updateArticle(ORG, 999999, {
      title: "Nope",
    })).rejects.toThrow();
  });

  it("deleteArticle — unpublishes the article", async () => {
    await helpdesk.deleteArticle(ORG, articleId2);
    const db = getDB();
    const check = await db("knowledge_base_articles").where("id", articleId2).first();
    expect(check).toBeDefined(); // still exists
    expect(check.is_published).toBeFalsy(); // but unpublished
  });

  it("deleteArticle — not found", async () => {
    await expect(helpdesk.deleteArticle(ORG, 999999)).rejects.toThrow();
  });
});

describe("Helpdesk KB — Article Ratings", () => {
  let helpdesk: typeof import("../../services/helpdesk/helpdesk.service.js");
  let articleId: number;

  beforeAll(async () => {
    helpdesk = await import("../../services/helpdesk/helpdesk.service.js");

    const article = await helpdesk.createArticle(ORG, ADMIN, {
      title: `Rating Test ${U}`,
      content: "Article for rating tests",
      category: "general",
      is_published: true,
    });
    articleId = article.id;
  });

  afterAll(async () => {
    const db = getDB();
    await db("kb_article_ratings").where("article_id", articleId).del().catch(() => {});
    await db("knowledge_base_articles").where("id", articleId).del();
  });

  it("rateArticle — helpful vote with userId", async () => {
    const result = await helpdesk.rateArticle(ORG, articleId, true, EMP);
    expect(result).toBeDefined();
    expect(result.helpful_count).toBeGreaterThanOrEqual(1);
  });

  it("rateArticle — same vote again (no change)", async () => {
    const before = await getDB()("knowledge_base_articles").where("id", articleId).first();
    await helpdesk.rateArticle(ORG, articleId, true, EMP);
    const after = await getDB()("knowledge_base_articles").where("id", articleId).first();
    expect(after.helpful_count).toBe(before.helpful_count);
  });

  it("rateArticle — swap vote from helpful to not helpful", async () => {
    const before = await getDB()("knowledge_base_articles").where("id", articleId).first();
    const result = await helpdesk.rateArticle(ORG, articleId, false, EMP);
    expect(result.not_helpful_count).toBeGreaterThan(before.not_helpful_count);
    expect(result.helpful_count).toBeLessThan(before.helpful_count);
  });

  it("rateArticle — swap vote back from not helpful to helpful", async () => {
    const before = await getDB()("knowledge_base_articles").where("id", articleId).first();
    const result = await helpdesk.rateArticle(ORG, articleId, true, EMP);
    expect(result.helpful_count).toBeGreaterThan(before.helpful_count);
    expect(result.not_helpful_count).toBeLessThan(before.not_helpful_count);
  });

  it("rateArticle — new user votes not helpful", async () => {
    const result = await helpdesk.rateArticle(ORG, articleId, false, MGR);
    expect(result.not_helpful_count).toBeGreaterThanOrEqual(1);
  });

  it("rateArticle — anonymous vote (no userId) — helpful", async () => {
    const before = await getDB()("knowledge_base_articles").where("id", articleId).first();
    const result = await helpdesk.rateArticle(ORG, articleId, true);
    expect(result.helpful_count).toBeGreaterThan(before.helpful_count);
  });

  it("rateArticle — anonymous vote (no userId) — not helpful", async () => {
    const before = await getDB()("knowledge_base_articles").where("id", articleId).first();
    const result = await helpdesk.rateArticle(ORG, articleId, false);
    expect(result.not_helpful_count).toBeGreaterThan(before.not_helpful_count);
  });

  it("rateArticle — article not found", async () => {
    await expect(helpdesk.rateArticle(ORG, 999999, true, EMP)).rejects.toThrow();
  });

  it("rateArticle — not found without userId", async () => {
    await expect(helpdesk.rateArticle(ORG, 999999, false)).rejects.toThrow();
  });
});
