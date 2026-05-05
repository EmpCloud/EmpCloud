// =============================================================================
// EMP CLOUD — Attendance Service
//
// Multi-punch model (#1869): every tap (web button, biometric scan, mobile
// app) appends a row to attendance_punches. The denormalised check_in /
// check_out columns on attendance_records are derived: check_in = first
// punch of the day (locked), check_out = latest punch of the day (rolls
// forward on each new tap). All existing readers (reports, payroll,
// dashboard, leave) keep working unchanged because the columns they read
// still exist and stay correct.
//
// Old behavior removed:
//   - "Already checked in today" / "Already checked out today" errors —
//     the new model accepts any number of punches.
//   - "Must check in before checking out" — irrelevant; first punch is
//     always treated as the check-in regardless of which endpoint is hit.
//   - 5-minute "Session too short" reject (#1822 Bug 18) — drop, since
//     short turnarounds are normal in the punch-card flow.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { ValidationError } from "../../utils/errors.js";
import { calculateOvertime } from "../../utils/payroll-rules.js";
import { assertChannelAllowed } from "./attendance-settings.service.js";
import type { CheckInInput, CheckOutInput } from "@empcloud/shared";

interface PunchInput {
  source?: string;
  latitude?: number | null;
  longitude?: number | null;
  remarks?: string | null;
}

// Generous overtime buffer added on top of the shift's expected duration so
// a forgotten check-out OR legitimate OT doesn't roll over into a stray
// "new day" attendance row. Floor of 24h covers free-form attendance without
// a shift assignment; ceiling lets a 16h shift + 12h OT still close the
// original record (28h window) instead of opening a phantom second one.
const OVERTIME_BUFFER_HOURS = 12;
const MIN_ACTIVE_WINDOW_HOURS = 24;

/**
 * Find the user's currently-active attendance record — the one a "Check Out"
 * tap should land on. Prefers an OPEN record (check_in set, check_out null)
 * whose check_in is recent enough that the shift could still be ongoing.
 *
 * Returns null if no open record qualifies; caller then falls back to the
 * calendar-date lookup (which is correct for fresh-day check-ins).
 *
 * Why this exists: night shifts crossing midnight (e.g. 7 PM → 10 AM) used
 * to confuse the punch logic — at 00:01 the next day, today's date had no
 * row, so the system showed "Check In" again and created a phantom row at
 * the user's actual check-out time. Looking up by check-in freshness fixes
 * that.
 */
export async function findActiveAttendanceRecord(orgId: number, userId: number) {
  const db = getDB();
  const candidate = await db("attendance_records")
    .where({ organization_id: orgId, user_id: userId })
    .whereNotNull("check_in")
    .whereNull("check_out")
    .orderBy("check_in", "desc")
    .first();
  if (!candidate) return null;

  // Determine the staleness threshold:
  //   - If shift assigned: shift_duration_minutes + OVERTIME_BUFFER (with floor)
  //   - Else: MIN_ACTIVE_WINDOW_HOURS
  let allowedMinutes = MIN_ACTIVE_WINDOW_HOURS * 60;
  if (candidate.shift_id) {
    const shift = await db("shifts").where({ id: candidate.shift_id }).first();
    if (shift) {
      const [sh, sm] = String(shift.start_time).split(":").map(Number);
      const [eh, em] = String(shift.end_time).split(":").map(Number);
      let durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
      if (durationMinutes <= 0) durationMinutes += 1440; // crosses midnight

      // Overtime buffer — prefer the per-shift `max_overtime_minutes` config
      // when the org has set one (>0). Falls back to a generous 12h default
      // when unset so existing data keeps working.
      const otMinutes =
        Number(shift.max_overtime_minutes) > 0
          ? Number(shift.max_overtime_minutes)
          : OVERTIME_BUFFER_HOURS * 60;

      allowedMinutes = Math.max(
        durationMinutes + otMinutes,
        MIN_ACTIVE_WINDOW_HOURS * 60,
      );
    }
  }

  const checkInTime = new Date(candidate.check_in).getTime();
  const ageMinutes = (Date.now() - checkInTime) / 60000;
  if (ageMinutes > allowedMinutes) return null; // stale missed-checkout
  return candidate;
}

// Single shared path for every tap. checkIn / checkOut both call this so
// the system never has to ask "is this an in or an out?" — first punch of
// the day is always the in, latest is always the out, everything in
// between is just a punch.
async function recordPunch(orgId: number, userId: number, data: PunchInput) {
  const db = getDB();
  await assertChannelAllowed(orgId, userId, data.source);
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const source = data.source || "manual";
  const lat = data.latitude ?? null;
  const lng = data.longitude ?? null;

  // Prefer an active open record (handles cross-midnight night shifts where
  // the calendar date has rolled over but the shift is still ongoing). Falls
  // back to today's row for normal day-shift check-ins.
  let record =
    (await findActiveAttendanceRecord(orgId, userId)) ||
    (await db("attendance_records")
      .where({ organization_id: orgId, user_id: userId, date: today })
      .first());

  // First punch of the day → create the parent row + lock the late timer.
  if (!record) {
    const assignment = await db("shift_assignments")
      .where({ organization_id: orgId, user_id: userId })
      .whereRaw("DATE(effective_from) <= ?", [today])
      .where(function () {
        this.whereNull("effective_to").orWhereRaw("DATE(effective_to) >= ?", [today]);
      })
      .orderBy("effective_from", "desc")
      .first();

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

    const [id] = await db("attendance_records").insert({
      organization_id: orgId,
      user_id: userId,
      date: today,
      shift_id: assignment?.shift_id || null,
      check_in: now,
      check_in_source: source,
      check_in_lat: lat,
      check_in_lng: lng,
      // No check_out yet — single-punch days stay "checked_in" until a
      // second punch lands. That matches user intuition that one tap by
      // itself isn't a completed day.
      status: "checked_in",
      late_minutes: lateMinutes,
      worked_minutes: 0,
      remarks: data.remarks || null,
      created_at: now,
      updated_at: now,
    });

    record = await db("attendance_records").where({ id }).first();
  }

  await db("attendance_punches").insert({
    attendance_record_id: record.id,
    organization_id: orgId,
    user_id: userId,
    punch_time: now,
    source,
    latitude: lat,
    longitude: lng,
  });

  // Recompute denormalised fields from the punch list. Cheap because the
  // index is (attendance_record_id, punch_time) and a day has O(10)
  // punches even for the most active users.
  const punches: Array<{
    punch_time: Date | string;
    source: string;
    latitude: string | number | null;
    longitude: string | number | null;
  }> = await db("attendance_punches")
    .where({ attendance_record_id: record.id })
    .orderBy("punch_time", "asc")
    .select("punch_time", "source", "latitude", "longitude");

  const first = punches[0];
  const last = punches[punches.length - 1];
  const firstTime = new Date(first.punch_time);
  const lastTime = new Date(last.punch_time);
  const workedMinutes =
    punches.length > 1
      ? Math.max(0, Math.round((lastTime.getTime() - firstTime.getTime()) / 60000))
      : 0;

  let shiftDurationMinutes = 480;
  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;
  let lateMinutes = 0;

  // Resolve the applicable shift for late/OT/early-departure calc:
  //   - prefer the shift_id stored on the attendance row (if any)
  //   - fall back to the user's current shift_assignment for `today` so a
  //     row created without a shift (e.g. a leave row, or an admin-created
  //     row from before the assignment landed) still picks up the right
  //     shift on the first real punch
  let shift: any = null;
  if (record.shift_id) {
    shift = await db("shifts").where({ id: record.shift_id }).first();
  }
  if (!shift) {
    const assignment = await db("shift_assignments")
      .where({ organization_id: orgId, user_id: userId })
      .whereRaw("DATE(effective_from) <= ?", [today])
      .where(function () {
        this.whereNull("effective_to").orWhereRaw("DATE(effective_to) >= ?", [today]);
      })
      .orderBy("effective_from", "desc")
      .first();
    if (assignment) {
      shift = await db("shifts").where({ id: assignment.shift_id }).first();
    }
  }

  if (shift) {
    const [sh, sm] = shift.start_time.split(":").map(Number);
    const [eeh, eem] = shift.end_time.split(":").map(Number);
    let diff = eeh * 60 + eem - (sh * 60 + sm);
    if (diff <= 0) diff += 1440;
    shiftDurationMinutes = diff - (shift.break_minutes || 0);

    // Late on first punch — recomputed every time the row is touched so
    // that a row created before the shift was assigned (shift_id was null)
    // gets its late_minutes filled in once we can resolve a shift.
    const shiftStart = new Date(firstTime);
    shiftStart.setHours(sh, sm, 0, 0);
    // If the first punch is BEFORE today's shift-start hour (e.g. night
    // shift starting yesterday at 22:00 with first punch at 22:30 today
    // because the row carries a same-date shift), shift the start back a
    // day to keep the math sane.
    if (shift.is_night_shift && shiftStart.getTime() > firstTime.getTime()) {
      shiftStart.setDate(shiftStart.getDate() - 1);
    }
    const graceEnd = new Date(
      shiftStart.getTime() + (shift.grace_minutes_late || 0) * 60000,
    );
    if (firstTime > graceEnd) {
      lateMinutes = Math.round(
        (firstTime.getTime() - shiftStart.getTime()) / 60000,
      );
    }

    // Early-departure / OT only meaningful once we have a check-out
    // candidate (i.e. at least 2 punches). The latest punch is the one
    // we score against the shift end.
    if (punches.length > 1) {
      const shiftEnd = new Date(lastTime);
      shiftEnd.setHours(eeh, eem, 0, 0);
      if (shift.is_night_shift || shiftEnd.getTime() <= firstTime.getTime()) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }
      const graceStart = new Date(
        shiftEnd.getTime() - (shift.grace_minutes_early || 0) * 60000,
      );
      if (lastTime < graceStart) {
        earlyDepartureMinutes = Math.round(
          (shiftEnd.getTime() - lastTime.getTime()) / 60000,
        );
      } else if (lastTime > shiftEnd) {
        // Rule 5 (#1057): OT only counts after full shift hours are completed
        // Rule 6 (#1058): Auto-calculate OT from check-out vs shift end time
        const otResult = calculateOvertime(
          firstTime,
          lastTime,
          shift.start_time,
          shift.end_time,
          !!shift.is_night_shift,
          shift.break_minutes || 0,
        );
        overtimeMinutes = otResult.overtime_minutes;
      }
    }
  }

  const halfShift = Math.floor(shiftDurationMinutes / 2);
  // #1822 — Bug 17: quarter-shift floor — < 25% of shift → absent,
  // 25–50% → half_day, ≥ 50% → present.
  const quarterShift = Math.floor(shiftDurationMinutes / 4);

  // Single-punch day stays "checked_in" — the worker is in but hasn't
  // completed the day yet. Once a second punch lands, the day rolls into
  // a present/half_day/absent bucket based on worked minutes.
  let status: "present" | "absent" | "half_day" | "checked_in" = "checked_in";
  if (punches.length > 1) {
    if (workedMinutes < quarterShift) {
      status = "absent";
    } else if (workedMinutes < halfShift) {
      status = "half_day";
    } else {
      status = "present";
    }
  }

  await db("attendance_records").where({ id: record.id }).update({
    check_in: firstTime,
    check_in_source: first.source,
    check_in_lat: first.latitude,
    check_in_lng: first.longitude,
    check_out: punches.length > 1 ? lastTime : null,
    check_out_source: punches.length > 1 ? last.source : null,
    check_out_lat: punches.length > 1 ? last.latitude : null,
    check_out_lng: punches.length > 1 ? last.longitude : null,
    worked_minutes: workedMinutes,
    overtime_minutes: overtimeMinutes,
    early_departure_minutes: earlyDepartureMinutes,
    late_minutes: lateMinutes,
    // Persist the resolved shift_id back to the row so the next read /
    // recompute doesn't have to re-resolve via shift_assignments. Only
    // updates when the resolver actually found one — never wipes an
    // existing shift_id.
    ...(shift && !record.shift_id ? { shift_id: shift.id } : {}),
    status,
    updated_at: now,
  });

  return db("attendance_records").where({ id: record.id }).first();
}

export async function checkIn(orgId: number, userId: number, data: CheckInInput) {
  return recordPunch(orgId, userId, {
    source: data.source,
    latitude: data.latitude,
    longitude: data.longitude,
    remarks: data.remarks,
  });
}

export async function checkOut(orgId: number, userId: number, data: CheckOutInput) {
  return recordPunch(orgId, userId, {
    source: data.source,
    latitude: data.latitude,
    longitude: data.longitude,
  });
}

// Used by the admin Attendance page timeline. Authorisation lives at the
// route layer (HR sees any record in their org; non-HR only their own).
export async function listPunches(orgId: number, attendanceRecordId: number) {
  const db = getDB();
  // Confirm the record exists in this org so a tenant can't enumerate
  // someone else's punches by guessing IDs.
  const record = await db("attendance_records")
    .where({ id: attendanceRecordId, organization_id: orgId })
    .first();
  if (!record) {
    throw new ValidationError("Attendance record not found");
  }
  const punches = await db("attendance_punches")
    .where({ attendance_record_id: attendanceRecordId })
    .orderBy("punch_time", "asc")
    .select("id", "punch_time", "source", "latitude", "longitude", "created_at");
  return { record, punches };
}

export async function getMyToday(orgId: number, userId: number) {
  const db = getDB();
  // Mirror the punch logic: if a previous-day shift is still active (e.g.
  // night shift crossing midnight), surface that record so the UI shows
  // "Check Out" instead of an erroneous "Check In" button.
  const active = await findActiveAttendanceRecord(orgId, userId);
  if (active) return active;
  const today = new Date().toISOString().slice(0, 10);
  return (
    (await db("attendance_records")
      .where({ organization_id: orgId, user_id: userId, date: today })
      .first()) || null
  );
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
  params?: { page?: number; perPage?: number; month?: number; year?: number; date?: string; date_from?: string; date_to?: string; user_id?: number; user_ids?: number[]; department_id?: number }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  // #1382 — Use LEFT JOIN so attendance rows aren't lost when a user row is
  // inconsistent, and filter u.status with an IS NULL check so the query
  // doesn't silently drop records that legitimately exist.
  let query = db("attendance_records as ar")
    .leftJoin("users as u", function () {
      this.on("ar.user_id", "u.id").andOn("ar.organization_id", "u.organization_id");
    })
    .leftJoin("organization_departments as dept", "u.department_id", "dept.id")
    .where("ar.organization_id", orgId)
    .where(function () {
      this.where("u.status", 1).orWhereNull("u.id");
    });

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
  } else if (params?.user_ids && params.user_ids.length > 0) {
    query = query.whereIn("ar.user_id", params.user_ids);
  } else if (params?.user_ids && params.user_ids.length === 0) {
    // Explicit empty team — no records.
    query = query.where(db.raw("1 = 0"));
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
      "u.emp_code",
      "dept.name as department_name"
    )
    .orderBy("ar.date", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { records, total: Number(count) };
}

export async function getDashboard(orgId: number, userIds?: number[]) {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  // RBAC v1 — when caller is team-scoped, restrict every count to their
  // resolved team. An empty array short-circuits to all-zero counts (no
  // direct reports => nothing to show).
  const teamScoped = Array.isArray(userIds);
  const emptyTeam = teamScoped && userIds!.length === 0;

  const totalQuery = db("users").where({ organization_id: orgId, status: 1 });
  if (teamScoped) {
    if (emptyTeam) totalQuery.where(db.raw("1 = 0"));
    else totalQuery.whereIn("id", userIds!);
  }
  const [totalUsers] = await totalQuery.count("* as count");

  const scopedRecords = (qb: any) => {
    qb.where({ organization_id: orgId, date: today });
    if (teamScoped) {
      if (emptyTeam) qb.where(db.raw("1 = 0"));
      else qb.whereIn("user_id", userIds!);
    }
  };

  const [presentCount] = await db("attendance_records")
    .where(scopedRecords)
    .whereIn("status", ["present", "half_day", "checked_in"])
    .count("* as count");

  // #1928 — The dashboard "Late today" count must match the breakdown drilldown.
  // Breakdown only flags users whose record is present/half_day/checked_in AND
  // has positive late_minutes; counting ALL records with late_minutes>0 here
  // also pulled in stale rows whose status had since flipped to on_leave or
  // absent, which made the card count bigger than the drilldown list.
  const [lateCount] = await db("attendance_records")
    .where(scopedRecords)
    .whereIn("status", ["present", "half_day", "checked_in"])
    .where("late_minutes", ">", 0)
    .count("* as count");

  const [onLeaveCount] = await db("attendance_records")
    .where(scopedRecords)
    .where("status", "on_leave")
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

// ---------------------------------------------------------------------------
// Dashboard Breakdown — lists of employees grouped by attendance status
// Used by the "click stat card to view details" flow on the attendance dashboard.
// ---------------------------------------------------------------------------

export async function getDashboardBreakdown(orgId: number, date?: string, userIds?: number[]) {
  const db = getDB();
  const forDate = date || new Date().toISOString().slice(0, 10);

  const teamScoped = Array.isArray(userIds);
  const emptyTeam = teamScoped && userIds!.length === 0;

  const baseQuery = db("users as u")
    .leftJoin("organization_departments as d", "u.department_id", "d.id")
    .leftJoin("attendance_records as ar", function () {
      this.on("ar.user_id", "=", "u.id").andOnVal("ar.date", "=", forDate);
    })
    .where("u.organization_id", orgId)
    .where("u.status", 1);

  if (teamScoped) {
    if (emptyTeam) baseQuery.where(db.raw("1 = 0"));
    else baseQuery.whereIn("u.id", userIds!);
  }

  const employees = await baseQuery.select(
      "u.id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.designation",
      "d.name as department",
      "ar.status as attendance_status",
      "ar.check_in as check_in_time",
      "ar.check_out as check_out_time",
      "ar.late_minutes"
    )
    .orderBy(["u.first_name", "u.last_name"]);

  const present: typeof employees = [];
  const absent: typeof employees = [];
  const onLeave: typeof employees = [];
  const late: typeof employees = [];

  for (const emp of employees) {
    const status = emp.attendance_status;
    if (status === "present" || status === "half_day" || status === "checked_in") {
      present.push(emp);
      if (Number(emp.late_minutes) > 0) late.push(emp);
    } else if (status === "on_leave") {
      onLeave.push(emp);
    } else {
      absent.push(emp);
    }
  }

  return {
    date: forDate,
    present,
    absent,
    on_leave: onLeave,
    late,
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
