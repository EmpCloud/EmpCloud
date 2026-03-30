// =============================================================================
// EMP CLOUD — Attendance Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { calculateOvertime } from "../../utils/payroll-rules.js";
import type { CheckInInput, CheckOutInput } from "@empcloud/shared";

export async function checkIn(orgId: number, userId: number, data: CheckInInput) {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  // Check for existing record today
  const existing = await db("attendance_records")
    .where({ organization_id: orgId, user_id: userId, date: today })
    .first();

  if (existing && existing.check_in) {
    throw new ConflictError("Already checked in today");
  }

  // Get current shift assignment
  const assignment = await db("shift_assignments")
    .where({ organization_id: orgId, user_id: userId })
    .where("effective_from", "<=", today)
    .where(function () {
      this.whereNull("effective_to").orWhere("effective_to", ">=", today);
    })
    .orderBy("effective_from", "desc")
    .first();

  const now = new Date();

  // Calculate late minutes if shift assigned
  let lateMinutes = 0;
  if (assignment) {
    const shift = await db("shifts").where({ id: assignment.shift_id }).first();
    if (shift) {
      const [h, m] = shift.start_time.split(":").map(Number);
      const shiftStart = new Date(now);
      shiftStart.setHours(h, m, 0, 0);
      const graceEnd = new Date(shiftStart.getTime() + (shift.grace_minutes_late || 0) * 60000);
      if (now > graceEnd) {
        lateMinutes = Math.round((now.getTime() - shiftStart.getTime()) / 60000);
      }
    }
  }

  if (existing) {
    // Update existing record
    await db("attendance_records").where({ id: existing.id }).update({
      check_in: now,
      check_in_source: data.source || "manual",
      check_in_lat: data.latitude || null,
      check_in_lng: data.longitude || null,
      late_minutes: lateMinutes,
      status: "present",
      updated_at: now,
    });
    return db("attendance_records").where({ id: existing.id }).first();
  }

  const [id] = await db("attendance_records").insert({
    organization_id: orgId,
    user_id: userId,
    date: today,
    shift_id: assignment?.shift_id || null,
    check_in: now,
    check_in_source: data.source || "manual",
    check_in_lat: data.latitude || null,
    check_in_lng: data.longitude || null,
    status: "present",
    late_minutes: lateMinutes,
    remarks: data.remarks || null,
    created_at: now,
    updated_at: now,
  });

  return db("attendance_records").where({ id }).first();
}

export async function checkOut(orgId: number, userId: number, data: CheckOutInput) {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  const record = await db("attendance_records")
    .where({ organization_id: orgId, user_id: userId, date: today })
    .first();

  if (!record) throw new NotFoundError("No check-in record for today");
  if (!record.check_in) throw new ValidationError("Must check in before checking out");
  if (record.check_out) throw new ConflictError("Already checked out today");

  const now = new Date();
  const checkInTime = new Date(record.check_in);
  const workedMinutes = Math.round((now.getTime() - checkInTime.getTime()) / 60000);

  // Calculate early departure and overtime if shift assigned
  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;
  if (record.shift_id) {
    const shift = await db("shifts").where({ id: record.shift_id }).first();
    if (shift) {
      const [eh, em] = shift.end_time.split(":").map(Number);
      const shiftEnd = new Date(now);
      shiftEnd.setHours(eh, em, 0, 0);

      // For night shifts, shift end is the next day
      if (shift.is_night_shift || shiftEnd.getTime() <= checkInTime.getTime()) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }

      const graceStart = new Date(shiftEnd.getTime() - (shift.grace_minutes_early || 0) * 60000);

      if (now < graceStart) {
        earlyDepartureMinutes = Math.round((shiftEnd.getTime() - now.getTime()) / 60000);
      } else if (now > shiftEnd) {
        // Rule 5 (#1057): OT only counts after full shift hours are completed
        // Rule 6 (#1058): Auto-calculate OT from check-out vs shift end time
        const otResult = calculateOvertime(
          checkInTime,
          now,
          shift.start_time,
          shift.end_time,
          !!shift.is_night_shift,
          shift.break_minutes || 0,
        );
        overtimeMinutes = otResult.overtime_minutes;
      }
    }
  }

  // Determine status based on worked hours
  // Minimum 5 minutes required to count as any attendance; below that treat as absent
  let status = "present";
  if (workedMinutes < 5) {
    status = "absent";
  } else if (workedMinutes < 240) {
    status = "half_day";
  }

  await db("attendance_records").where({ id: record.id }).update({
    check_out: now,
    check_out_source: data.source || "manual",
    check_out_lat: data.latitude || null,
    check_out_lng: data.longitude || null,
    worked_minutes: workedMinutes,
    overtime_minutes: overtimeMinutes,
    early_departure_minutes: earlyDepartureMinutes,
    status,
    updated_at: now,
  });

  return db("attendance_records").where({ id: record.id }).first();
}

export async function getMyToday(orgId: number, userId: number) {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);
  return db("attendance_records")
    .where({ organization_id: orgId, user_id: userId, date: today })
    .first() || null;
}

export async function getMyHistory(
  orgId: number,
  userId: number,
  params?: { page?: number; perPage?: number; month?: number; year?: number }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

  let query = db("attendance_records")
    .where({ organization_id: orgId, user_id: userId })
    .whereBetween("date", [startDate, endDate]);

  const [{ count }] = await query.clone().count("* as count");
  const records = await query
    .select()
    .orderBy("date", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { records, total: Number(count) };
}

export async function listRecords(
  orgId: number,
  params?: { page?: number; perPage?: number; month?: number; year?: number; date?: string; date_from?: string; date_to?: string; user_id?: number; department_id?: number }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("attendance_records as ar")
    .join("users as u", "ar.user_id", "u.id")
    .where("ar.organization_id", orgId);

  if (params?.date) {
    // Exact date filter takes priority over month/year
    query = query.where("ar.date", params.date);
  } else if (params?.date_from || params?.date_to) {
    // Date range filter takes priority over month/year
    if (params.date_from) {
      query = query.where("ar.date", ">=", params.date_from);
    }
    if (params.date_to) {
      query = query.where("ar.date", "<=", params.date_to);
    }
  } else {
    const now = new Date();
    const month = params?.month || now.getMonth() + 1;
    const year = params?.year || now.getFullYear();
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
    query = query.whereBetween("ar.date", [startDate, endDate]);
  }

  if (params?.user_id) {
    query = query.where("ar.user_id", params.user_id);
  }
  if (params?.department_id) {
    query = query.where("u.department_id", params.department_id);
  }

  const [{ count }] = await query.clone().count("* as count");
  const records = await query
    .select(
      "ar.*",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code"
    )
    .orderBy("ar.date", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { records, total: Number(count) };
}

export async function getDashboard(orgId: number) {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  const [totalUsers] = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .count("* as count");

  const [presentCount] = await db("attendance_records")
    .where({ organization_id: orgId, date: today })
    .whereIn("status", ["present", "half_day"])
    .count("* as count");

  const [lateCount] = await db("attendance_records")
    .where({ organization_id: orgId, date: today })
    .where("late_minutes", ">", 0)
    .count("* as count");

  const [onLeaveCount] = await db("attendance_records")
    .where({ organization_id: orgId, date: today, status: "on_leave" })
    .count("* as count");

  const total = Number(totalUsers.count);
  const present = Number(presentCount.count);
  const late = Number(lateCount.count);
  const onLeave = Number(onLeaveCount.count);
  const absent = total - present - onLeave;

  return {
    total_employees: total,
    present,
    absent: absent > 0 ? absent : 0,
    late,
    on_leave: onLeave,
    date: today,
  };
}

export async function getMonthlyReport(
  orgId: number,
  params: { month: number; year: number; user_id?: number }
) {
  const db = getDB();
  const startDate = `${params.year}-${String(params.month).padStart(2, "0")}-01`;
  const endDate = new Date(params.year, params.month, 0).toISOString().slice(0, 10);

  let query = db("attendance_records as ar")
    .join("users as u", "ar.user_id", "u.id")
    .where("ar.organization_id", orgId)
    .whereBetween("ar.date", [startDate, endDate]);

  if (params.user_id) {
    query = query.where("ar.user_id", params.user_id);
  }

  const records = await query.select(
    "ar.user_id",
    "u.first_name",
    "u.last_name",
    "u.emp_code",
    db.raw("COUNT(*) as total_days"),
    db.raw("SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present_days"),
    db.raw("SUM(CASE WHEN ar.status = 'half_day' THEN 1 ELSE 0 END) as half_days"),
    db.raw("SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_days"),
    db.raw("SUM(CASE WHEN ar.status = 'on_leave' THEN 1 ELSE 0 END) as leave_days"),
    db.raw("SUM(COALESCE(ar.worked_minutes, 0)) as total_worked_minutes"),
    db.raw("SUM(COALESCE(ar.overtime_minutes, 0)) as total_overtime_minutes"),
    db.raw("SUM(COALESCE(ar.late_minutes, 0)) as total_late_minutes")
  ).groupBy("ar.user_id", "u.first_name", "u.last_name", "u.emp_code");

  return { month: params.month, year: params.year, report: records };
}
