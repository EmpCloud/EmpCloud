// =============================================================================
// EMP CLOUD — Manager Self-Service (MSS) Service
// =============================================================================

import { getDB } from "../../db/connection.js";

/**
 * Get direct reports for a manager.
 */
export async function getMyTeam(orgId: number, managerId: number) {
  const db = getDB();
  const team = await db("users")
    .where({ organization_id: orgId, reporting_manager_id: managerId, status: 1 })
    .select(
      "id",
      "first_name",
      "last_name",
      "email",
      "emp_code",
      "role",
      "department_id",
      "designation",
      "photo_path",
      "date_of_joining",
    )
    .orderBy("first_name", "asc");

  return team;
}

/**
 * Get today's attendance for direct reports.
 */
export async function getTeamAttendanceToday(orgId: number, managerId: number) {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  // Get team member IDs
  const teamIds = await db("users")
    .where({ organization_id: orgId, reporting_manager_id: managerId, status: 1 })
    .pluck("id");

  if (teamIds.length === 0) {
    return { team_size: 0, present: [], absent_ids: [], on_leave: [], date: today };
  }

  // Get attendance records for today
  const records = await db("attendance_records as ar")
    .join("users as u", "ar.user_id", "u.id")
    .where("ar.organization_id", orgId)
    .where("ar.date", today)
    .whereIn("ar.user_id", teamIds)
    .select(
      "ar.*",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code",
    );

  const presentIds = records
    .filter((r: any) => ["present", "half_day"].includes(r.status))
    .map((r: any) => r.user_id);

  const onLeaveIds = records
    .filter((r: any) => r.status === "on_leave")
    .map((r: any) => r.user_id);

  const absentIds = teamIds.filter(
    (id: number) => !presentIds.includes(id) && !onLeaveIds.includes(id),
  );

  // Get names for absent members
  const absentMembers = absentIds.length > 0
    ? await db("users")
        .whereIn("id", absentIds)
        .select("id", "first_name", "last_name", "email", "emp_code")
    : [];

  return {
    team_size: teamIds.length,
    present: records.filter((r: any) => ["present", "half_day"].includes(r.status)),
    absent: absentMembers,
    on_leave: records.filter((r: any) => r.status === "on_leave"),
    date: today,
  };
}

/**
 * Get pending leave requests for manager's direct reports.
 */
export async function getTeamPendingLeaves(orgId: number, managerId: number) {
  const db = getDB();

  const teamIds = await db("users")
    .where({ organization_id: orgId, reporting_manager_id: managerId, status: 1 })
    .pluck("id");

  if (teamIds.length === 0) return [];

  const pending = await db("leave_applications as la")
    .join("users as u", "la.user_id", "u.id")
    .leftJoin("leave_types as lt", "la.leave_type_id", "lt.id")
    .where("la.organization_id", orgId)
    .where("la.status", "pending")
    .whereIn("la.user_id", teamIds)
    .select(
      "la.*",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code",
      "lt.name as leave_type_name",
      "lt.code as leave_type_code",
    )
    .orderBy("la.created_at", "desc");

  return pending;
}

/**
 * Get team leave calendar for a date range.
 */
export async function getTeamLeaveCalendar(
  orgId: number,
  managerId: number,
  startDate: string,
  endDate: string,
) {
  const db = getDB();

  const teamIds = await db("users")
    .where({ organization_id: orgId, reporting_manager_id: managerId, status: 1 })
    .pluck("id");

  if (teamIds.length === 0) return [];

  const leaves = await db("leave_applications as la")
    .join("users as u", "la.user_id", "u.id")
    .leftJoin("leave_types as lt", "la.leave_type_id", "lt.id")
    .where("la.organization_id", orgId)
    .where("la.status", "approved")
    .whereIn("la.user_id", teamIds)
    .where(function () {
      this.where("la.start_date", "<=", endDate).andWhere("la.end_date", ">=", startDate);
    })
    .select(
      "la.id",
      "la.user_id",
      "la.start_date",
      "la.end_date",
      "la.days_count",
      "la.is_half_day",
      "la.half_day_type",
      "u.first_name",
      "u.last_name",
      "u.emp_code",
      "lt.name as leave_type_name",
      "lt.code as leave_type_code",
      "lt.color as leave_type_color",
    )
    .orderBy("la.start_date", "asc");

  return leaves;
}

/**
 * Combined manager dashboard stats.
 */
export async function getManagerDashboard(orgId: number, managerId: number) {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  const teamIds = await db("users")
    .where({ organization_id: orgId, reporting_manager_id: managerId, status: 1 })
    .pluck("id");

  const teamSize = teamIds.length;

  if (teamSize === 0) {
    return {
      team_size: 0,
      present_today: 0,
      absent_today: 0,
      on_leave_today: 0,
      late_today: 0,
      pending_leave_requests: 0,
      pending_comp_off_requests: 0,
    };
  }

  // Today's attendance
  const attendanceToday = await db("attendance_records")
    .where({ organization_id: orgId, date: today })
    .whereIn("user_id", teamIds)
    .select("user_id", "status", "late_minutes");

  const presentCount = attendanceToday.filter(
    (a: any) => ["present", "half_day"].includes(a.status),
  ).length;

  const onLeaveCount = attendanceToday.filter(
    (a: any) => a.status === "on_leave",
  ).length;

  const lateCount = attendanceToday.filter(
    (a: any) => a.late_minutes > 0,
  ).length;

  const absentCount = Math.max(0, teamSize - presentCount - onLeaveCount);

  // Pending leave requests
  const [{ count: pendingLeaves }] = await db("leave_applications")
    .where({ organization_id: orgId, status: "pending" })
    .whereIn("user_id", teamIds)
    .count("* as count");

  // Pending comp-off requests
  const [{ count: pendingCompOffs }] = await db("comp_off_requests")
    .where({ organization_id: orgId, status: "pending" })
    .whereIn("user_id", teamIds)
    .count("* as count");

  return {
    team_size: teamSize,
    present_today: presentCount,
    absent_today: absentCount,
    on_leave_today: onLeaveCount,
    late_today: lateCount,
    pending_leave_requests: Number(pendingLeaves),
    pending_comp_off_requests: Number(pendingCompOffs),
  };
}
