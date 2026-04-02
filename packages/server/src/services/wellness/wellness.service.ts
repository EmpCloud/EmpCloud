// =============================================================================
// EMP CLOUD — Wellness Service
// Programs, enrollments, daily check-ins, goals, dashboard
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors.js";
import type {
  CreateWellnessProgramInput,
  UpdateWellnessProgramInput,
  WellnessCheckInInput,
  CreateWellnessGoalInput,
  UpdateWellnessGoalInput,
  WellnessQueryInput,
} from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Programs — CRUD
// ---------------------------------------------------------------------------

export async function createProgram(
  orgId: number,
  userId: number,
  data: CreateWellnessProgramInput
) {
  const db = getDB();

  // Validate start_date is not in the past — challenges must start today or later
  if (data.start_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(data.start_date);
    startDate.setHours(0, 0, 0, 0);
    if (startDate < today) {
      throw new ValidationError("Start date cannot be in the past");
    }
  }

  // Validate end_date is not before start_date
  if (data.start_date && data.end_date && new Date(data.end_date) < new Date(data.start_date)) {
    throw new ValidationError("End date cannot be before start date");
  }

  const [id] = await db("wellness_programs").insert({
    organization_id: orgId,
    title: data.title,
    description: data.description || null,
    program_type: data.program_type || "other",
    start_date: data.start_date || null,
    end_date: data.end_date || null,
    is_active: data.is_active !== undefined ? data.is_active : true,
    max_participants: data.max_participants || null,
    points_reward: data.points_reward || 0,
    enrolled_count: 0,
    created_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return getProgram(orgId, id);
}

export async function listPrograms(
  orgId: number,
  params?: WellnessQueryInput
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.per_page || 20;

  let query = db("wellness_programs").where({ organization_id: orgId });

  if (params?.program_type) {
    query = query.where("program_type", params.program_type);
  }
  if (params?.is_active !== undefined) {
    query = query.where("is_active", params.is_active);
  }

  const countQuery = query.clone().count("id as count");
  const [{ count }] = await countQuery;

  const programs = await query
    .clone()
    .select("*")
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    programs,
    total: Number(count),
  };
}

export async function getProgram(orgId: number, programId: number) {
  const db = getDB();

  const program = await db("wellness_programs")
    .where({ id: programId, organization_id: orgId })
    .first();
  if (!program) throw new NotFoundError("Wellness program");

  return program;
}

export async function updateProgram(
  orgId: number,
  programId: number,
  data: UpdateWellnessProgramInput
) {
  const db = getDB();

  const existing = await db("wellness_programs")
    .where({ id: programId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Wellness program");

  // Validate end_date is not before start_date (considering existing values)
  const effectiveStartDate = data.start_date !== undefined ? data.start_date : existing.start_date;
  const effectiveEndDate = data.end_date !== undefined ? data.end_date : existing.end_date;
  if (effectiveStartDate && effectiveEndDate && new Date(effectiveEndDate) < new Date(effectiveStartDate)) {
    throw new ValidationError("End date cannot be before start date");
  }

  const updateData: Record<string, any> = { updated_at: new Date() };
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.program_type !== undefined) updateData.program_type = data.program_type;
  if (data.start_date !== undefined) updateData.start_date = data.start_date;
  if (data.end_date !== undefined) updateData.end_date = data.end_date;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.max_participants !== undefined) updateData.max_participants = data.max_participants;
  if (data.points_reward !== undefined) updateData.points_reward = data.points_reward;

  await db("wellness_programs").where({ id: programId }).update(updateData);

  return getProgram(orgId, programId);
}

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

export async function enrollInProgram(
  orgId: number,
  programId: number,
  userId: number
) {
  const db = getDB();

  const program = await db("wellness_programs")
    .where({ id: programId, organization_id: orgId, is_active: true })
    .first();
  if (!program) throw new NotFoundError("Active wellness program");

  // Check max capacity
  if (program.max_participants && program.enrolled_count >= program.max_participants) {
    throw new ForbiddenError("This program has reached maximum capacity");
  }

  // Check duplicate enrollment
  const existing = await db("wellness_enrollments")
    .where({ program_id: programId, user_id: userId })
    .first();
  if (existing) {
    throw new ForbiddenError("You are already enrolled in this program");
  }

  const [id] = await db("wellness_enrollments").insert({
    program_id: programId,
    organization_id: orgId,
    user_id: userId,
    status: "enrolled",
    progress_percentage: 0,
    created_at: new Date(),
  });

  // Increment enrolled count
  await db("wellness_programs")
    .where({ id: programId })
    .increment("enrolled_count", 1);

  return {
    enrollment_id: id,
    message: "Successfully enrolled in program",
  };
}

export async function completeProgram(
  orgId: number,
  programId: number,
  userId: number
) {
  const db = getDB();

  const enrollment = await db("wellness_enrollments")
    .where({ program_id: programId, user_id: userId, organization_id: orgId })
    .first();
  if (!enrollment) throw new NotFoundError("Enrollment");

  if (enrollment.status === "completed") {
    throw new ForbiddenError("Program already completed");
  }
  if (enrollment.status === "dropped") {
    throw new ForbiddenError("Cannot complete a dropped program");
  }

  await db("wellness_enrollments")
    .where({ id: enrollment.id })
    .update({
      status: "completed",
      progress_percentage: 100,
      completed_at: new Date(),
    });

  return { message: "Program marked as completed" };
}

export async function getMyPrograms(orgId: number, userId: number) {
  const db = getDB();

  const enrollments = await db("wellness_enrollments as we")
    .join("wellness_programs as wp", "we.program_id", "wp.id")
    .where({ "we.organization_id": orgId, "we.user_id": userId })
    .select(
      "we.id as enrollment_id",
      "we.program_id",
      "we.status as enrollment_status",
      "we.progress_percentage",
      "we.completed_at",
      "we.created_at as enrolled_at",
      "wp.title",
      "wp.description",
      "wp.program_type",
      "wp.start_date",
      "wp.end_date",
      "wp.points_reward",
      "wp.is_active"
    )
    .orderBy("we.created_at", "desc");

  return enrollments;
}

// ---------------------------------------------------------------------------
// Daily Check-In
// ---------------------------------------------------------------------------

export async function dailyCheckIn(
  orgId: number,
  userId: number,
  data: WellnessCheckInInput
) {
  const db = getDB();

  const checkInDate = data.check_in_date || new Date().toISOString().split("T")[0];

  // Validate energy_level 1-5
  if (data.energy_level < 1 || data.energy_level > 5) {
    throw new ValidationError("Energy level must be between 1 and 5");
  }

  // Check for existing check-in on this date
  const existing = await db("wellness_check_ins")
    .where({ organization_id: orgId, user_id: userId, check_in_date: checkInDate })
    .first();

  if (existing) {
    // Update existing check-in
    await db("wellness_check_ins")
      .where({ id: existing.id })
      .update({
        mood: data.mood,
        energy_level: data.energy_level,
        sleep_hours: data.sleep_hours ?? null,
        exercise_minutes: data.exercise_minutes || 0,
        notes: data.notes ?? null,
      });

    return {
      id: existing.id,
      message: "Check-in updated",
      check_in_date: checkInDate,
    };
  }

  const [id] = await db("wellness_check_ins").insert({
    organization_id: orgId,
    user_id: userId,
    check_in_date: checkInDate,
    mood: data.mood,
    energy_level: data.energy_level,
    sleep_hours: data.sleep_hours ?? null,
    exercise_minutes: data.exercise_minutes || 0,
    notes: data.notes ?? null,
    created_at: new Date(),
  });

  return {
    id,
    message: "Check-in recorded",
    check_in_date: checkInDate,
  };
}

export async function getMyCheckIns(
  orgId: number,
  userId: number,
  params?: { start_date?: string; end_date?: string; page?: number; per_page?: number }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.per_page || 30;

  let query = db("wellness_check_ins")
    .where({ organization_id: orgId, user_id: userId });

  if (params?.start_date) {
    query = query.where("check_in_date", ">=", params.start_date);
  }
  if (params?.end_date) {
    query = query.where("check_in_date", "<=", params.end_date);
  }

  const countQuery = query.clone().count("id as count");
  const [{ count }] = await countQuery;

  const checkIns = await query
    .clone()
    .select("*")
    .orderBy("check_in_date", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    check_ins: checkIns,
    total: Number(count),
  };
}

// ---------------------------------------------------------------------------
// Check-In Trends (#1218)
// ---------------------------------------------------------------------------

export async function getCheckInTrends(
  orgId: number,
  userId: number,
  period: "daily" | "weekly" = "daily",
  days = 30
) {
  const db = getDB();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split("T")[0];

  const checkIns = await db("wellness_check_ins")
    .where({ organization_id: orgId, user_id: userId })
    .where("check_in_date", ">=", startStr)
    .orderBy("check_in_date", "asc");

  if (period === "weekly") {
    // Group by ISO week
    const weekMap = new Map<string, typeof checkIns>();
    for (const ci of checkIns) {
      const d = new Date(ci.check_in_date);
      // Get Monday of the week
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      const weekKey = monday.toISOString().split("T")[0];
      if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
      weekMap.get(weekKey)!.push(ci);
    }

    const trends = [];
    for (const [weekStart, entries] of weekMap) {
      const moodDist: Record<string, number> = {};
      let energySum = 0;
      for (const e of entries) {
        moodDist[e.mood] = (moodDist[e.mood] || 0) + 1;
        energySum += e.energy_level;
      }
      trends.push({
        period_start: weekStart,
        check_in_count: entries.length,
        mood_distribution: moodDist,
        avg_energy: Math.round((energySum / entries.length) * 10) / 10,
      });
    }
    return { period: "weekly", days, trends };
  }

  // Daily — group by date
  const dayMap = new Map<string, typeof checkIns>();
  for (const ci of checkIns) {
    const dateStr = new Date(ci.check_in_date).toISOString().split("T")[0];
    if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
    dayMap.get(dateStr)!.push(ci);
  }

  const trends = [];
  for (const [date, entries] of dayMap) {
    const moodDist: Record<string, number> = {};
    let energySum = 0;
    for (const e of entries) {
      moodDist[e.mood] = (moodDist[e.mood] || 0) + 1;
      energySum += e.energy_level;
    }
    trends.push({
      date,
      check_in_count: entries.length,
      mood_distribution: moodDist,
      avg_energy: Math.round((energySum / entries.length) * 10) / 10,
    });
  }

  return { period: "daily", days, trends };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export async function createGoal(
  orgId: number,
  userId: number,
  data: CreateWellnessGoalInput
) {
  const db = getDB();

  // Validate end_date is not before start_date
  if (data.start_date && data.end_date && new Date(data.end_date) < new Date(data.start_date)) {
    throw new ValidationError("End date cannot be before start date");
  }

  const [id] = await db("wellness_goals").insert({
    organization_id: orgId,
    user_id: userId,
    title: data.title,
    goal_type: data.goal_type || "custom",
    target_value: data.target_value,
    current_value: 0,
    unit: data.unit,
    frequency: data.frequency || "daily",
    status: "active",
    start_date: data.start_date,
    end_date: data.end_date || null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return getGoal(orgId, userId, id);
}

export async function getGoal(orgId: number, userId: number, goalId: number) {
  const db = getDB();

  const goal = await db("wellness_goals")
    .where({ id: goalId, organization_id: orgId, user_id: userId })
    .first();
  if (!goal) throw new NotFoundError("Wellness goal");

  return goal;
}

export async function updateGoalProgress(
  orgId: number,
  userId: number,
  goalId: number,
  data: UpdateWellnessGoalInput
) {
  const db = getDB();

  const goal = await db("wellness_goals")
    .where({ id: goalId, organization_id: orgId, user_id: userId })
    .first();
  if (!goal) throw new NotFoundError("Wellness goal");

  if (goal.status !== "active") {
    throw new ForbiddenError("Can only update active goals");
  }

  const updateData: Record<string, any> = { updated_at: new Date() };

  if (data.current_value !== undefined) {
    updateData.current_value = data.current_value;
    // Auto-complete if target reached
    if (data.current_value >= goal.target_value) {
      updateData.status = "completed";
    }
  }
  if (data.status !== undefined) {
    updateData.status = data.status;
  }
  if (data.title !== undefined) updateData.title = data.title;
  if (data.target_value !== undefined) updateData.target_value = data.target_value;

  await db("wellness_goals").where({ id: goalId }).update(updateData);

  return getGoal(orgId, userId, goalId);
}

export async function deleteGoal(orgId: number, userId: number, goalId: number) {
  const db = getDB();

  const goal = await db("wellness_goals")
    .where({ id: goalId, organization_id: orgId, user_id: userId })
    .first();
  if (!goal) throw new NotFoundError("Wellness goal");

  await db("wellness_goals").where({ id: goalId }).delete();
}

export async function getMyGoals(orgId: number, userId: number, status?: string) {
  const db = getDB();

  let query = db("wellness_goals")
    .where({ organization_id: orgId, user_id: userId });

  if (status) {
    query = query.where("status", status);
  }

  const goals = await query.orderBy("created_at", "desc");
  return goals;
}

// ---------------------------------------------------------------------------
// Dashboard — Org-wide (HR)
// ---------------------------------------------------------------------------

export async function getWellnessDashboard(orgId: number) {
  const db = getDB();

  // Program stats
  const [{ active_programs }] = await db("wellness_programs")
    .where({ organization_id: orgId, is_active: true })
    .count("id as active_programs");

  const [{ total_programs }] = await db("wellness_programs")
    .where({ organization_id: orgId })
    .count("id as total_programs");

  const [{ total_enrollments }] = await db("wellness_enrollments")
    .where({ organization_id: orgId })
    .count("id as total_enrollments");

  const [{ completed_enrollments }] = await db("wellness_enrollments")
    .where({ organization_id: orgId, status: "completed" })
    .count("id as completed_enrollments");

  // Check-in stats (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0];

  const [{ checkin_count }] = await db("wellness_check_ins")
    .where({ organization_id: orgId })
    .where("check_in_date", ">=", thirtyDaysStr)
    .count("id as checkin_count");

  // Average mood distribution (last 30 days)
  const moodDistribution = await db("wellness_check_ins")
    .where({ organization_id: orgId })
    .where("check_in_date", ">=", thirtyDaysStr)
    .select("mood")
    .count("id as count")
    .groupBy("mood");

  const moodDist: Record<string, number> = {};
  for (const row of moodDistribution) {
    moodDist[row.mood] = Number(row.count);
  }

  // Average energy level (last 30 days)
  const [energyRow] = await db("wellness_check_ins")
    .where({ organization_id: orgId })
    .where("check_in_date", ">=", thirtyDaysStr)
    .avg("energy_level as avg_energy");
  const avgEnergy = energyRow?.avg_energy
    ? Math.round(Number(energyRow.avg_energy) * 10) / 10
    : null;

  // Average exercise minutes (last 30 days)
  const [exerciseRow] = await db("wellness_check_ins")
    .where({ organization_id: orgId })
    .where("check_in_date", ">=", thirtyDaysStr)
    .avg("exercise_minutes as avg_exercise");
  const avgExercise = exerciseRow?.avg_exercise
    ? Math.round(Number(exerciseRow.avg_exercise))
    : null;

  // Goal completion rate
  const [{ total_goals }] = await db("wellness_goals")
    .where({ organization_id: orgId })
    .count("id as total_goals");

  const [{ completed_goals }] = await db("wellness_goals")
    .where({ organization_id: orgId, status: "completed" })
    .count("id as completed_goals");

  const goalCompletionRate =
    Number(total_goals) > 0
      ? Math.round((Number(completed_goals) / Number(total_goals)) * 100)
      : 0;

  // Unique participants (users who have at least one check-in in last 30 days)
  const [{ active_participants }] = await db("wellness_check_ins")
    .where({ organization_id: orgId })
    .where("check_in_date", ">=", thirtyDaysStr)
    .countDistinct("user_id as active_participants");

  // Wellness score: weighted average of mood (40%), energy (30%), exercise participation (30%)
  const moodScoreMap: Record<string, number> = {
    great: 100,
    good: 80,
    okay: 60,
    low: 40,
    stressed: 20,
  };
  const totalMoodCheckins = Object.values(moodDist).reduce((s, v) => s + v, 0);
  let avgMoodScore = 0;
  if (totalMoodCheckins > 0) {
    let weightedMood = 0;
    for (const [mood, cnt] of Object.entries(moodDist)) {
      weightedMood += (moodScoreMap[mood] || 50) * cnt;
    }
    avgMoodScore = weightedMood / totalMoodCheckins;
  }

  const energyScore = avgEnergy ? (avgEnergy / 5) * 100 : 0;
  const exerciseScore = avgExercise ? Math.min((avgExercise / 60) * 100, 100) : 0;

  const wellnessScore =
    totalMoodCheckins > 0
      ? Math.round(avgMoodScore * 0.4 + energyScore * 0.3 + exerciseScore * 0.3)
      : null;

  // Recent programs
  const recentPrograms = await db("wellness_programs")
    .where({ organization_id: orgId })
    .orderBy("created_at", "desc")
    .limit(5);

  // Top programs by enrollment
  const topPrograms = await db("wellness_programs")
    .where({ organization_id: orgId, is_active: true })
    .orderBy("enrolled_count", "desc")
    .limit(5);

  return {
    active_programs: Number(active_programs),
    total_programs: Number(total_programs),
    total_enrollments: Number(total_enrollments),
    completed_enrollments: Number(completed_enrollments),
    checkin_count_30d: Number(checkin_count),
    active_participants: Number(active_participants),
    mood_distribution: moodDist,
    avg_energy_level: avgEnergy,
    avg_exercise_minutes: avgExercise,
    total_goals: Number(total_goals),
    completed_goals: Number(completed_goals),
    goal_completion_rate: goalCompletionRate,
    wellness_score: wellnessScore,
    recent_programs: recentPrograms,
    top_programs: topPrograms,
  };
}

// ---------------------------------------------------------------------------
// My Wellness Summary (Personal)
// ---------------------------------------------------------------------------

export async function getMyWellnessSummary(orgId: number, userId: number) {
  const db = getDB();

  // My recent check-ins (last 14 days)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysStr = fourteenDaysAgo.toISOString().split("T")[0];

  const recentCheckIns = await db("wellness_check_ins")
    .where({ organization_id: orgId, user_id: userId })
    .where("check_in_date", ">=", fourteenDaysStr)
    .orderBy("check_in_date", "desc");

  // Mood trend (last 14 days)
  const moodTrend = recentCheckIns.map((c) => ({
    date: c.check_in_date,
    mood: c.mood,
    energy_level: c.energy_level,
    exercise_minutes: c.exercise_minutes,
    sleep_hours: c.sleep_hours,
  }));

  // Active goals
  const activeGoals = await db("wellness_goals")
    .where({ organization_id: orgId, user_id: userId, status: "active" })
    .orderBy("created_at", "desc");

  // Completed goals count
  const [{ completed_count }] = await db("wellness_goals")
    .where({ organization_id: orgId, user_id: userId, status: "completed" })
    .count("id as completed_count");

  // Enrolled programs
  const enrolledPrograms = await db("wellness_enrollments as we")
    .join("wellness_programs as wp", "we.program_id", "wp.id")
    .where({ "we.organization_id": orgId, "we.user_id": userId })
    .whereIn("we.status", ["enrolled", "in_progress"])
    .select(
      "we.id as enrollment_id",
      "we.program_id",
      "we.status as enrollment_status",
      "we.progress_percentage",
      "wp.title",
      "wp.program_type",
      "wp.points_reward"
    );

  // Check-in streak
  let streak = 0;
  const today = new Date();
  const allCheckIns = await db("wellness_check_ins")
    .where({ organization_id: orgId, user_id: userId })
    .orderBy("check_in_date", "desc")
    .select("check_in_date");

  const checkInDates = new Set(
    allCheckIns.map((c) => {
      const d = new Date(c.check_in_date);
      return d.toISOString().split("T")[0];
    })
  );

  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    if (checkInDates.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  // Total check-ins
  const [{ total_checkins }] = await db("wellness_check_ins")
    .where({ organization_id: orgId, user_id: userId })
    .count("id as total_checkins");

  // Average mood (recent)
  const avgMood = recentCheckIns.length > 0
    ? recentCheckIns[0].mood
    : null;

  // Average energy (recent)
  const avgEnergy = recentCheckIns.length > 0
    ? Math.round(
        (recentCheckIns.reduce((s, c) => s + c.energy_level, 0) /
          recentCheckIns.length) *
          10
      ) / 10
    : null;

  return {
    mood_trend: moodTrend,
    active_goals: activeGoals,
    completed_goals_count: Number(completed_count),
    enrolled_programs: enrolledPrograms,
    checkin_streak: streak,
    total_checkins: Number(total_checkins),
    latest_mood: avgMood,
    avg_energy_level: avgEnergy,
  };
}
