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
  device_identifier?: string | null;
}

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------
//
// Shifts are configured with wall-clock times in the org's local timezone
// (e.g. "10:00" in Asia/Kolkata). The server runs in UTC. Comparing a
// punch's UTC timestamp directly against `setHours(10, 0)` (server-local =
// UTC) silently mis-interprets the shift, so a 13:41 IST punch against a
// 10:00 IST shift looked "early" instead of 3h 41m late.
//
// Both helpers convert via Intl.DateTimeFormat — no extra dependency.

/** Return the wall-clock day (YYYY-MM-DD) and minute-of-day for a Date in `tz`. */
function wallClockInTZ(date: Date, tz: string): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  // Intl can render hour as "24" for midnight in some locales; normalise to 0.
  const hourRaw = parseInt(get("hour"), 10);
  const hour = hourRaw === 24 ? 0 : hourRaw;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + parseInt(get("minute"), 10),
  };
}

/**
 * Compute late minutes for a check-in against a shift, both expressed in
 * the org's wall-clock time. Day shifts (start < end) use punch-day-anchored
 * comparison; night shifts (start >= end) anchor to the previous day when
 * the punch lands in the small hours of the morning.
 */
function computeLateMinutes(
  firstPunch: Date,
  shiftStartMinutes: number,
  graceMinutesLate: number,
  isNightShift: boolean,
  tz: string,
): number {
  const punch = wallClockInTZ(firstPunch, tz);
  let diff = punch.minutes - shiftStartMinutes;
  if (isNightShift && diff < -12 * 60) {
    // e.g. shift starts 22:00, punch is 02:30 next day — wall-clock minutes
    // go from 1320 to 150, which would compute as -1170. Roll over.
    diff += 24 * 60;
  }
  if (diff <= graceMinutesLate) return 0;
  return diff;
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
    device_identifier: data.device_identifier ?? null,
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
    const shiftStartMinutes = sh * 60 + sm;
    const shiftEndMinutes = eeh * 60 + eem;
    let diff = shiftEndMinutes - shiftStartMinutes;
    if (diff <= 0) diff += 1440;
    shiftDurationMinutes = diff - (shift.break_minutes || 0);

    // Resolve the timezone the shift's wall-clock times should be interpreted
    // in. Source of truth is the user's assigned location (which has its own
    // timezone — e.g. a Mumbai branch and a Bangalore branch could share an
    // org but observe different shift starts on a DST boundary). Fall back
    // up the chain so a user without a location still gets a sensible answer.
    const userRow = await db("users").where({ id: userId }).select("location_id").first();
    let shiftTz: string | null = null;
    if (userRow?.location_id) {
      const loc = await db("organization_locations")
        .where({ id: userRow.location_id })
        .select("timezone")
        .first();
      if (loc?.timezone) shiftTz = loc.timezone;
    }
    if (!shiftTz) {
      const orgRow = await db("organizations")
        .where({ id: orgId })
        .select("timezone")
        .first();
      if (orgRow?.timezone) shiftTz = orgRow.timezone;
    }
    if (!shiftTz) shiftTz = "UTC";

    // Late on first punch — recomputed every time the row is touched so
    // that a row created before the shift was assigned (shift_id was null)
    // gets its late_minutes filled in once we can resolve a shift.
    // Wall-clock comparison in the shift's timezone, NOT server-local.
    lateMinutes = computeLateMinutes(
      firstTime,
      shiftStartMinutes,
      shift.grace_minutes_late || 0,
      !!shift.is_night_shift,
      shiftTz,
    );

    // Early-departure / OT only meaningful once we have a check-out
    // candidate (i.e. at least 2 punches). The latest punch is the one
    // we score against the shift end.
    if (punches.length > 1) {
      const lastWall = wallClockInTZ(lastTime, shiftTz);
      let endDiff = lastWall.minutes - shiftEndMinutes;
      // Night shifts: punch at 06:30 against shift_end 06:00 — same wall-clock
      // day. Punch at 07:30 against shift_end 22:00 — wraps. Use the same
      // 12h-window heuristic as late-calc.
      if (shift.is_night_shift && endDiff > 12 * 60) endDiff -= 24 * 60;
      if (endDiff < -(shift.grace_minutes_early || 0)) {
        earlyDepartureMinutes = -endDiff; // positive minutes left early
      } else if (endDiff > 0) {
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
    device_identifier: data.device_identifier,
  });
}

export async function checkOut(orgId: number, userId: number, data: CheckOutInput) {
  return recordPunch(orgId, userId, {
    source: data.source,
    latitude: data.latitude,
    longitude: data.longitude,
    device_identifier: data.device_identifier,
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
    .select("id", "punch_time", "source", "latitude", "longitude", "device_identifier", "created_at");
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
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  // Normalize date values (driver may hydrate to Date or string) to YYYY-MM-DD
  // for stable keying when we merge calendar days against fetched rows.
  const toDateKey = (v: unknown): string => {
    if (v instanceof Date) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, "0");
      const d = String(v.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return String(v).slice(0, 10);
  };

  // Fetch existing records + holidays from BOTH sources + the user's shift
  // assignments in parallel.
  //
  // Holidays:
  //   - `company_events` rows where event_type='holiday' is the canonical
  //     source (powers /events/holidays).
  //   - `organization_holidays` is a legacy table the Attendance Grid still
  //     reads. We union both so a holiday stored only in the legacy table
  //     still shows up here (parity with the Grid).
  //
  // Shift:
  //   - Match the Grid's lookup exactly — order by created_at desc (latest
  //     intent wins), tiebreak on id desc — and surface `is_weekoff` so the
  //     per-assignment "Mark as Week-off" toggle is honored. The Grid then
  //     uses first-write-wins per (user, date). We replicate that here for
  //     a single user.
  const [existing, eventHolidays, legacyHolidays, assignments] = await Promise.all([
    db("attendance_records")
      .where({ organization_id: orgId, user_id: userId })
      .whereBetween("date", [startDate, endDate])
      .select(),
    db("company_events")
      .where({ organization_id: orgId, event_type: "holiday" })
      // overlap with [startDate, endDate]: start_date <= endDate AND (end_date >= startDate OR end_date IS NULL)
      .where("start_date", "<=", `${endDate} 23:59:59`)
      .andWhere(function () {
        this.where("end_date", ">=", `${startDate} 00:00:00`).orWhereNull("end_date");
      })
      .select("title", "start_date", "end_date"),
    // Legacy fallback table. Some older deployments still write here only.
    // Returning [] on schema-mismatch / missing-table is what the Grid does
    // too — see getMonthlyGrid above.
    db("organization_holidays")
      .where({ organization_id: orgId })
      .whereBetween("holiday_date", [startDate, endDate])
      .select("holiday_date", "holiday_name")
      .catch(() => [] as Array<{ holiday_date: any; holiday_name: string }>),
    db("shift_assignments as sa")
      .join("shifts as s", "sa.shift_id", "s.id")
      .where("sa.organization_id", orgId)
      .andWhere("sa.user_id", userId)
      .whereRaw("DATE(sa.effective_from) <= ?", [endDate])
      .andWhere(function () {
        this.whereNull("sa.effective_to").orWhereRaw("DATE(sa.effective_to) >= ?", [startDate]);
      })
      .whereRaw("(sa.effective_to IS NULL OR DATE(sa.effective_to) >= DATE(sa.effective_from))")
      .orderBy("sa.created_at", "desc")
      .orderBy("sa.id", "desc")
      .select("sa.effective_from", "sa.effective_to", "s.working_days", "s.is_weekoff"),
  ]);

  const byDate = new Map<string, any>();
  for (const row of existing) {
    byDate.set(toDateKey(row.date), row);
  }

  // Expand each holiday's [start_date, end_date] range into per-day entries
  // so a multi-day holiday flags every day it covers. If end_date is NULL,
  // treat it as a single-day holiday. The expansion is clamped to the
  // requested [startDate, endDate] window so we don't iterate beyond what
  // we'll render.
  const holidayByDate = new Map<string, string>();
  const monthStartDate = new Date(year, month - 1, 1);
  const monthEndDate = new Date(year, month - 1, daysInMonth);
  for (const h of eventHolidays as any[]) {
    const start = new Date(h.start_date);
    const end = h.end_date ? new Date(h.end_date) : new Date(h.start_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    const from = start < monthStartDate ? new Date(monthStartDate) : new Date(start);
    const to = end > monthEndDate ? new Date(monthEndDate) : new Date(end);
    from.setHours(0, 0, 0, 0);
    to.setHours(0, 0, 0, 0);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      // First-write-wins so if two holidays overlap (rare but possible) the
      // earlier-inserted name sticks instead of flickering.
      const key = `${yy}-${mm}-${dd}`;
      if (!holidayByDate.has(key)) holidayByDate.set(key, h.title);
    }
  }
  // Layer the legacy table on top — only fills gaps so company_events wins
  // when both have the same date.
  for (const h of legacyHolidays as any[]) {
    const key = toDateKey(h.holiday_date);
    if (!holidayByDate.has(key)) holidayByDate.set(key, h.holiday_name);
  }

  // Per-day week-off resolution — matches getMonthlyGrid (lines ~995-1070):
  // walk assignments in created_at-desc order and write the (user, date) slot
  // first-write-wins. An assignment marks a date as week-off when either:
  //   - is_weekoff flag is set on the assignment (the "Mark as Week-off"
  //     toggle on the Shift Schedule's Edit Assignment modal), or
  //   - the day-of-week is NOT in the shift's `working_days` CSV.
  // Days with no covering assignment get NO synthesized week_off (matching
  // the Grid's behavior — see the "no shift → blank cell" comment there).
  const weekOffByDate = new Map<string, boolean>();
  for (const a of assignments as any[]) {
    const from = toDateKey(a.effective_from);
    const to = a.effective_to ? toDateKey(a.effective_to) : null;
    const workingDays = String(a.working_days || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s));
    const isWeekoffShift = !!a.is_weekoff;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dateKey < from) continue;
      if (to && dateKey > to) continue;
      if (weekOffByDate.has(dateKey)) continue; // first-write-wins
      const dow = new Date(year, month - 1, d).getDay();
      const off =
        isWeekoffShift || (workingDays.length > 0 && !workingDays.includes(dow));
      weekOffByDate.set(dateKey, off);
    }
  }

  // Today key for the "don't render future days" guard. Computed in the
  // server's local tz; close enough for HR display purposes and matches
  // how the rest of this file treats dates.
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Walk every calendar day in the month. Days with a real record use it as-is;
  // missing days get classified as holiday > week_off > absent. We use a
  // unique negative `id` per synthesized row (derived from the date) so the
  // client can use it as a React key without collisions and so its
  // `expandedRowId === r.id` predicate doesn't accidentally match `null` for
  // every synthesized row.
  const records: any[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    // Hide ALL future dates — the user only wants to see days they've
    // actually lived (or are living right now). Future weekends, holidays,
    // and absent days all get skipped. Past holidays/week-offs still
    // render since those happened.
    if (dateKey > todayKey) continue;

    const existingRow = byDate.get(dateKey);
    if (existingRow) {
      records.push(existingRow);
      continue;
    }

    const holidayName = holidayByDate.get(dateKey);
    const isWeekOff = weekOffByDate.get(dateKey) === true;

    let synthStatus: "holiday" | "week_off" | "absent";
    if (holidayName) {
      synthStatus = "holiday";
    } else if (isWeekOff) {
      synthStatus = "week_off";
    } else {
      synthStatus = "absent";
    }

    records.push({
      // Negative pseudo-id derived from YYYYMMDD so React keys are unique and
      // the client doesn't expand every synthesized row when the default
      // expandedRowId is null.
      id: -(year * 10000 + month * 100 + d),
      organization_id: orgId,
      user_id: userId,
      date: dateKey,
      shift_id: null,
      check_in: null,
      check_out: null,
      check_in_source: null,
      check_out_source: null,
      check_in_lat: null,
      check_in_lng: null,
      check_out_lat: null,
      check_out_lng: null,
      status: synthStatus,
      holiday_name: holidayName ?? null,
      worked_minutes: null,
      overtime_minutes: null,
      late_minutes: null,
      early_departure_minutes: null,
      synthesized: true,
    });
  }

  // Ascending by date — 1st of the month at the top, last day at the bottom.
  records.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { records, total: records.length };
}

export async function listRecords(
  orgId: number,
  params?: { page?: number; perPage?: number; month?: number; year?: number; date?: string; date_from?: string; date_to?: string; user_id?: number; user_ids?: number[]; department_id?: number; location_id?: number; role?: string; search?: string }
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
  if (params?.location_id) {
    query = query.where("u.location_id", params.location_id);
  }
  if (params?.role) {
    query = query.where("u.role", params.role);
  }
  if (params?.search) {
    const term = `%${params.search}%`;
    query = query.where(function () {
      this.where(db.raw("CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))"), "like", term)
        .orWhere("u.email", "like", term)
        .orWhere("u.emp_code", "like", term);
    });
  }

  const [{ count }] = await query.clone().count("* as count");
  // For status='on_leave' rows, surface the actual leave type so the records
  // page can show "On Leave (CL)" instead of just "On Leave". Correlated
  // sub-selects only fire for the page (limit 20) so cost stays bounded.
  // If multiple approved applications somehow overlap a date, MySQL picks
  // one -- not data we expect to see, but won't crash either way.
  const records = await query
    .select(
      "ar.*",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code",
      "dept.name as department_name",
      db.raw(
        `(SELECT lt.name FROM leave_applications la
          JOIN leave_types lt ON la.leave_type_id = lt.id
          WHERE la.user_id = ar.user_id
            AND la.organization_id = ar.organization_id
            AND la.status = 'approved'
            AND ar.date BETWEEN la.start_date AND la.end_date
          LIMIT 1) AS leave_type_name`,
      ),
      db.raw(
        `(SELECT lt.code FROM leave_applications la
          JOIN leave_types lt ON la.leave_type_id = lt.id
          WHERE la.user_id = ar.user_id
            AND la.organization_id = ar.organization_id
            AND la.status = 'approved'
            AND ar.date BETWEEN la.start_date AND la.end_date
          LIMIT 1) AS leave_type_code`,
      ),
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

// =============================================================================
// MONTHLY GRID — per-employee per-day attendance matrix
// =============================================================================
//
// Drives the new Attendance Grid page (Excel-style date columns 1..31, one
// row per employee, single-letter status codes). Bakes WO (week-off) and
// HO (holiday) cells into the response so the page can render from a
// single round-trip; cells without a stored row fall back to "" / WO / HO
// based on calendar + organization_holidays.
//
// Half-day auto-classification: rows where status = 'present' but
// `worked_minutes` < halfDayThresholdMinutes get reclassified as 'H'
// (half day) in the grid. This way a 4-hour shift correctly shows as
// half day even if the check-in/out path stored it as 'present'.

// HPL ("Half Present + Half Leave") records the case where the employee was
// physically present for half the workday and on leave for the other half
// (e.g. an afternoon doctor's appointment counted against sick balance).
// Distinct from H (half day, other half unworked / LOP) and from L
// (full-day leave). Counts as 0.5 day present for payroll attendance and
// 0.5 day leave for leave-balance accounting.
// WOT / HOT — worked on a week-off / holiday (overtime). Distinct from a
// plain P so payroll can pay the configured overtime premium for the day.
export type AttendanceCode = "P" | "A" | "H" | "L" | "HPL" | "WO" | "HO" | "WOT" | "HOT" | "M" | "";

export async function getMonthlyGrid(
  orgId: number,
  params: { month: number; year: number; halfDayThresholdMinutes?: number },
) {
  const db = getDB();
  const { month, year } = params;
  const halfDayThreshold = params.halfDayThresholdMinutes ?? 240; // 4hrs default
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const isoLocal = (v: any): string => {
    if (typeof v === "string") return v.slice(0, 10);
    if (!(v instanceof Date)) v = new Date(v);
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  };
  const holidaySet = new Set<string>();

  // Holiday source (primary) — `company_events` with event_type='holiday'.
  // The HR Holidays page writes here (POST /events, event_type=holiday).
  // The grid previously read only the legacy `organization_holidays` table,
  // which is empty in live tenants, so HR-added holidays never appeared.
  // Holiday rows can span multiple days (start_date..end_date), so expand
  // each into the individual dates that fall inside this month.
  try {
    const eventRows: Array<{ start_date: any; end_date: any }> = await db("company_events")
      .where({ organization_id: orgId, event_type: "holiday" })
      .where("start_date", "<=", `${monthEnd} 23:59:59`)
      .andWhere(function () {
        this.where("end_date", ">=", `${monthStart} 00:00:00`).orWhereNull("end_date");
      })
      .select("start_date", "end_date");
    for (const e of eventRows) {
      const startIso = isoLocal(e.start_date);
      const endIso = e.end_date ? isoLocal(e.end_date) : startIso;
      let cur = startIso < monthStart ? monthStart : startIso;
      const last = endIso > monthEnd ? monthEnd : endIso;
      while (cur <= last) {
        holidaySet.add(cur);
        const d = new Date(cur + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        cur = d.toISOString().split("T")[0];
      }
    }
  } catch {
    // company_events absent on older schemas — fall through to legacy table.
  }

  // Holiday source (legacy, backward-compat) — `organization_holidays`.
  // Retained so any tenant that populated the old table still works.
  try {
    const holidayRows: Array<{ holiday_date: any }> = await db("organization_holidays")
      .where("organization_id", orgId)
      .whereBetween("holiday_date", [monthStart, monthEnd])
      .select("holiday_date");
    for (const h of holidayRows) holidaySet.add(isoLocal(h.holiday_date));
  } catch {
    // Older schemas without the table -- ignore.
  }

  const days: Array<{
    day: number;
    date: string;
    dow: number;
    defaultCode: "HO" | "";
  }> = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    // Only holidays are a date-level default now. Week-offs are entirely
    // driven by the per-user shift assignment computed below -- no
    // Sat/Sun hardcode, since real orgs run 6-day weeks, rotating shifts,
    // Tue-Sat shifts, etc. and the old default was painting WO for every
    // employee regardless of their shift.
    const defaultCode: "HO" | "" = holidaySet.has(dateStr) ? "HO" : "";
    days.push({ day: d, date: dateStr, dow, defaultCode });
  }

  // Department + location names are joined in so the grid page can filter
  // client-side without an extra round-trip per dropdown.
  const allUsers = await db("users as u")
    .leftJoin("organization_departments as dept", "u.department_id", "dept.id")
    .leftJoin("organization_locations as loc", "u.location_id", "loc.id")
    .where({ "u.organization_id": orgId, "u.status": 1 })
    .whereNot("u.role", "super_admin")
    .select(
      "u.id as user_id",
      "u.first_name",
      "u.last_name",
      "u.emp_code",
      "dept.name as department",
      "loc.name as location",
    );

  if (allUsers.length === 0) {
    return { days, employees: [], totalEmployees: 0, daysInMonth };
  }

  const rows = await db("attendance_records")
    .where("organization_id", orgId)
    .whereIn(
      "user_id",
      allUsers.map((u: any) => u.user_id),
    )
    .whereBetween("date", [monthStart, monthEnd])
    .select("user_id", "date", "status", "worked_minutes");

  // Per-user weekoff resolution -- the single source of truth for WO
  // cells. Week-offs come entirely from the employee's shift assignment,
  // never from a hardcoded calendar rule:
  //   1. Per-assignment `is_weekoff` flag (the "Mark as Week-off" toggle
  //      on the Shift Schedule's Edit Assignment modal -- carves out a
  //      sub-range as off, e.g. swapping Tuesday off for a long weekend).
  //   2. The shift's `working_days` CSV (e.g. "1,2,3,4,5" = Mon-Fri off
  //      on Sat+Sun; an employee on a Tue-Sat shift gets Sun+Mon WO; a
  //      6-day shift gets only Sun WO; etc.).
  // Employees with no shift assignment for a date get NO WO from this
  // grid -- the cell renders blank rather than incorrectly marking
  // someone off just because today is Saturday. When overlapping
  // assignments exist (legacy or sub-range split), the LATER
  // `effective_from` wins -- ORDER BY DESC + first-write-wins.
  const assignments = await db("shift_assignments as sa")
    .join("shifts as s", "sa.shift_id", "s.id")
    .where("sa.organization_id", orgId)
    .whereIn(
      "sa.user_id",
      allUsers.map((u: any) => u.user_id),
    )
    .whereRaw("DATE(sa.effective_from) <= ?", [monthEnd])
    .where(function () {
      this.whereNull("sa.effective_to").orWhereRaw("DATE(sa.effective_to) >= ?", [monthStart]);
    })
    // Defensive: drop rows where someone has stored effective_to before
    // effective_from (artifact of an older sub-range split bug --
    // observed on Atul Sharma id=440 in prod data).
    .whereRaw("(sa.effective_to IS NULL OR DATE(sa.effective_to) >= DATE(sa.effective_from))")
    // "Latest intent wins" -- when HR assigns a new shift, the freshly
    // created row should claim every date in its range even if an older
    // assignment also covers it. Ordering by created_at DESC means the
    // newer row writes into the per-(user,date) slot first and the
    // first-write-wins guard below blocks the older one. Tiebreak on
    // id DESC for assignments created in the same second (e.g. the
    // sub-range split inserts left+override+right in a single
    // transaction).
    .orderBy("sa.created_at", "desc")
    .orderBy("sa.id", "desc")
    .select(
      "sa.user_id",
      "sa.effective_from",
      "sa.effective_to",
      "s.working_days",
      "s.is_weekoff",
    );

  // userId -> dateIso -> "WO" | "WORK"  (always set when an assignment
  // covers the date so a later/older assignment can't "downgrade" a
  // verified working day into a weekoff).
  const userWeekoff: Record<number, Record<string, "WO" | "WORK">> = {};
  for (const a of assignments as any[]) {
    const uid = Number(a.user_id);
    const from = isoLocal(a.effective_from);
    const to = a.effective_to ? isoLocal(a.effective_to) : null;
    const workingDays = String(a.working_days || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s));
    const isWeekoffShift = !!a.is_weekoff;
    for (const d of days) {
      if (d.date < from) continue;
      if (to && d.date > to) continue;
      // assignments are ordered by effective_from DESC, so the first
      // assignment to claim a (user, date) slot wins -- skip on conflict.
      if (userWeekoff[uid] && userWeekoff[uid][d.date] !== undefined) continue;
      const off =
        isWeekoffShift ||
        (workingDays.length > 0 && !workingDays.includes(d.dow));
      if (!userWeekoff[uid]) userWeekoff[uid] = {};
      userWeekoff[uid][d.date] = off ? "WO" : "WORK";
    }
  }

  // ISO date for "today" so a single-punch row on a past date doesn't get
  // silently rewarded with a Present mark just because the worker forgot to
  // check out -- HR sees an explicit M (missed check-out) on the grid and
  // can override via the double-click cell editor.
  const todayIso = isoLocal(new Date());
  const codeFor = (
    status: string | null | undefined,
    workedMinutes: number | null,
    dateIso: string,
  ): AttendanceCode => {
    const s = (status || "").toLowerCase();
    if (s === "half_day") return "H";
    if (s === "half_present_half_leave") return "HPL";
    if (s === "weekoff_overtime") return "WOT";
    if (s === "holiday_overtime") return "HOT";
    if (s === "absent") return "A";
    if (s === "on_leave") return "L";
    if (s === "checked_in") {
      // Today: still in progress, render as P. Past date: missed check-out
      // -- distinct M code so it doesn't inflate the Present total.
      if (dateIso < todayIso) return "M";
      return "P";
    }
    if (s === "present") {
      // Auto-reclassify short shifts as half-day so a 4hr workday isn't
      // accidentally counted as a full present day.
      if (workedMinutes != null && workedMinutes > 0 && workedMinutes < halfDayThreshold) {
        return "H";
      }
      return "P";
    }
    return "";
  };

  const byUser: Record<number, Record<string, AttendanceCode>> = {};
  for (const r of rows) {
    const dStr = isoLocal(r.date);
    const uid = Number(r.user_id);
    if (!byUser[uid]) byUser[uid] = {};
    byUser[uid][dStr] = codeFor(
      r.status,
      r.worked_minutes != null ? Number(r.worked_minutes) : null,
      dStr,
    );
  }

  const employees = allUsers.map((u: any) => {
    const userMap = byUser[u.user_id] || {};
    const offMap = userWeekoff[u.user_id] || {};
    const dayCodes: Record<string, AttendanceCode> = {};
    // Parallel map: which dates are this employee's shift-defined
    // weekoffs. Emitted alongside `days` so the FE can render a combined
    // badge like "P/WO", "A/WO", "H/WO" when the employee actually
    // worked / was marked on their off day -- typical overtime or
    // comp-off candidate. Pure "WO" is rendered for weekoff dates with
    // no attendance row.
    const weekoffDays: Record<string, true> = {};
    for (const d of days) {
      // Attendance code: real row if any, otherwise the date-level
      // default (HO / "").
      const real = userMap[d.date];
      const isWeekoff = offMap[d.date] === "WO";
      const isHoliday = d.defaultCode === "HO";
      let code = (real || (d.defaultCode as AttendanceCode)) as AttendanceCode;
      // Auto-overtime: a FULL present day worked on a holiday or week-off
      // is shown as HOT / WOT automatically -- HR doesn't mark it by hand.
      // Holiday wins when a date is both a holiday and a week-off. An
      // explicitly-set WOT/HOT (status weekoff_overtime/holiday_overtime)
      // already arrives as that code from codeFor() and is left as-is.
      // Payroll derives OT days the same way (present on a rest day), so
      // the grid and the payslip stay consistent.
      if (real === "P") {
        if (isHoliday) code = "HOT";
        else if (isWeekoff) code = "WOT";
      }
      dayCodes[d.date] = code;
      if (isWeekoff) {
        weekoffDays[d.date] = true;
      }
    }
    return {
      user_id: u.user_id,
      first_name: u.first_name,
      last_name: u.last_name,
      emp_code: u.emp_code,
      department: u.department || null,
      location: u.location || null,
      days: dayCodes,
      weekoffDays,
    };
  });

  return { days, employees, totalEmployees: employees.length, daysInMonth };
}

// Update a single attendance cell from the grid's double-click edit.
// Codes accepted: P / A / H / L / "" (revert -> deletes the row so the
// day falls back to its default WO / HO / blank). WO and HO are NOT
// directly settable -- they're calendar-derived defaults.
export async function updateAttendanceCell(
  orgId: number,
  params: { userId: number; date: string; code: string },
) {
  const db = getDB();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const map: Record<string, string> = {
    P: "present",
    A: "absent",
    H: "half_day",
    L: "on_leave",
    // HPL = "half present + half leave". Recorded on the attendance row
    // alone for now -- the matching leave_application / leave_balance side
    // is intentionally not auto-managed here; HR can apply a half-day leave
    // via the existing /grid/apply-leave flow if they need balance
    // deduction. TODO(half-day-leave): auto-create / link a 0.5-day leave
    // application for the date so leave balances reconcile without HR
    // having to do two clicks.
    HPL: "half_present_half_leave",
    // Overtime on a rest day. HR marks these on a week-off / holiday cell
    // to record that the employee worked; payroll pays the configured
    // overtime premium per such day.
    WOT: "weekoff_overtime",
    HOT: "holiday_overtime",
  };
  const upper = (params.code || "").toUpperCase();
  if (upper === "" || upper === "WO" || upper === "HO" || upper === "-") {
    await db("attendance_records")
      .where({ user_id: params.userId, organization_id: orgId, date: params.date })
      .del();
    return { ok: true, action: "deleted" };
  }
  const status = map[upper];
  if (!status) {
    throw new Error(
      `Unknown status code "${params.code}". Use P / A / H / L / HPL / WOT / HOT / WO / HO.`,
    );
  }
  const existing = await db("attendance_records")
    .where({ user_id: params.userId, organization_id: orgId, date: params.date })
    .first();
  const now = new Date();
  if (existing) {
    await db("attendance_records").where({ id: existing.id }).update({ status, updated_at: now });
    return { ok: true, action: "updated", status };
  }
  await db("attendance_records").insert({
    user_id: params.userId,
    organization_id: orgId,
    date: params.date,
    status,
    created_at: now,
    updated_at: now,
  });
  return { ok: true, action: "created", status };
}
