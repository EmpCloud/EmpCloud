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
export function computeLateMinutes(
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

/**
 * Re-resolve persisted attendance after an admin changes a shift assignment.
 *
 * Attendance rows intentionally snapshot their shift and late minutes at punch
 * time. A retroactive assignment therefore has to refresh those snapshots or
 * reports keep showing the old shift (and old lateness) even though the
 * schedule UI shows the new one.
 */
export async function recalculateAttendanceForAssignmentWindow(
  orgId: number,
  userIds: number[],
  effectiveFrom: string,
  effectiveTo: string | null,
) {
  if (!userIds.length) return;
  const db = getDB();

  let recordsQuery = db("attendance_records")
    .where({ organization_id: orgId })
    .whereIn("user_id", userIds)
    .where("date", ">=", effectiveFrom)
    .whereNotNull("check_in")
    .select("id", "user_id", "date", "check_in");
  if (effectiveTo) recordsQuery = recordsQuery.where("date", "<=", effectiveTo);
  const records = await recordsQuery;

  const org = await db("organizations").where({ id: orgId }).select("timezone").first();
  const users = await db("users as u")
    .leftJoin("organization_locations as ol", "ol.id", "u.location_id")
    .where("u.organization_id", orgId)
    .whereIn("u.id", userIds)
    .select("u.id", "ol.timezone as location_timezone");
  const timezoneByUser = new Map<number, string>(
    users.map((user: any) => [
      Number(user.id),
      user.location_timezone || org?.timezone || "UTC",
    ]),
  );

  const defaultShift = await db("shifts")
    .where({ organization_id: orgId, is_default: true, is_active: true })
    .first();

  for (const record of records) {
    const date = typeof record.date === "string"
      ? record.date.slice(0, 10)
      : `${record.date.getFullYear()}-${String(record.date.getMonth() + 1).padStart(2, "0")}-${String(record.date.getDate()).padStart(2, "0")}`;
    const assignment = await db("shift_assignments")
      .where({ organization_id: orgId, user_id: record.user_id })
      .whereRaw("DATE(effective_from) <= ?", [date])
      .where(function () {
        this.whereNull("effective_to").orWhereRaw("DATE(effective_to) >= ?", [date]);
      })
      .orderBy("effective_from", "desc")
      .first();
    const shift = assignment
      ? await db("shifts").where({ id: assignment.shift_id, organization_id: orgId }).first()
      : defaultShift;

    let lateMinutes = 0;
    if (shift && !shift.is_weekoff) {
      const [hours, minutes] = String(shift.start_time).split(":").map(Number);
      lateMinutes = computeLateMinutes(
        new Date(record.check_in),
        hours * 60 + minutes,
        Number(shift.grace_minutes_late) || 0,
        !!shift.is_night_shift,
        timezoneByUser.get(Number(record.user_id)) || "UTC",
      );
    }

    await db("attendance_records").where({ id: record.id, organization_id: orgId }).update({
      shift_id: shift?.id ?? null,
      late_minutes: lateMinutes,
      updated_at: new Date(),
    });
  }
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

  const shift = candidate.shift_id
    ? await db("shifts").where({ id: candidate.shift_id }).first()
    : null;

  // Does this shift legitimately span midnight? Only such shifts may keep an
  // open (un-checked-out) record alive into the next calendar day.
  let durationMinutes = 0;
  let crossesMidnight = false;
  if (shift) {
    const [sh, sm] = String(shift.start_time).split(":").map(Number);
    const [eh, em] = String(shift.end_time).split(":").map(Number);
    durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
    crossesMidnight = !!shift.is_night_shift || durationMinutes <= 0;
    if (durationMinutes <= 0) durationMinutes += 1440;
  }

  // Day-shift guard. A plain day-shift record must be closed within its own
  // calendar day: a punch on a LATER date is a NEW day's check-in, not this
  // record's check-out. Returning null here makes recordPunch start a fresh
  // row instead of reopening yesterday's.
  //
  // Without this, the 24h active window below let the next morning's punch
  // (~24h later, near the same time) close the prior day's still-open record —
  // producing a bogus ~24h span and swallowing that morning's check-in. The
  // day-boundary is the correct cut-off; the age window alone (shift + 12h OT,
  // floored at 24h) reached right into the next day. Night/cross-midnight
  // shifts are exempt because their open record is *supposed* to carry over.
  if (!crossesMidnight) {
    const recDate =
      typeof candidate.date === "string"
        ? candidate.date.slice(0, 10)
        : new Date(candidate.date).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (recDate < today) return null; // prior day's open record — don't reopen
  }

  // Staleness threshold for same-day re-punches and night-shift carryover:
  //   - shift assigned: shift_duration + overtime buffer (floored)
  //   - else: MIN_ACTIVE_WINDOW_HOURS
  let allowedMinutes = MIN_ACTIVE_WINDOW_HOURS * 60;
  if (shift) {
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

  // Last-resort defaults ONLY — every `let` below is overwritten as soon as a
  // shift is resolved. Reached solely when the row has no shift, the user has
  // no assignment, AND the org has configured no default shift (i.e. the org
  // uses no shifts at all). With no shift there's no break data, so gross ==
  // net == a standard 8h working day.
  const FALLBACK_SHIFT_MINUTES = 8 * 60;
  let shiftDurationMinutes = FALLBACK_SHIFT_MINUTES;
  // Gross span (shift start→end, break INCLUDED). Used as the "full day"
  // present floor; shiftDurationMinutes is the net-of-break working time.
  let grossShiftMinutes = FALLBACK_SHIFT_MINUTES;
  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;
  let lateMinutes = 0;

  // Resolve the applicable shift for late/OT/early-departure + classification:
  //   1. the shift_id stored on the attendance row (if any)
  //   2. the user's current shift_assignment for `today` so a row created
  //      without a shift (a leave row, or an admin-created row from before the
  //      assignment landed) still picks up the right shift on the first punch
  //   3. the org's default shift (is_default) so a user with no explicit
  //      assignment still classifies against real configured hours rather than
  //      the invented 8h fallback above
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
  if (!shift) {
    shift = await db("shifts")
      .where({ organization_id: orgId, is_default: true })
      .first();
  }

  if (shift) {
    const [sh, sm] = shift.start_time.split(":").map(Number);
    const [eeh, eem] = shift.end_time.split(":").map(Number);
    const shiftStartMinutes = sh * 60 + sm;
    const shiftEndMinutes = eeh * 60 + eem;
    let diff = shiftEndMinutes - shiftStartMinutes;
    if (diff <= 0) diff += 1440;
    grossShiftMinutes = diff;
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

  // Attendance day classification. worked_minutes here is the check-in→
  // check-out SPAN (break included), so it's compared against the shift the
  // same way:
  //   • Half-day floor = half the NET working time (span − break).
  //     10:00–19:00 shift, 60-min break → net 8h, half-day floor = 4h.
  //   • Present floor  = the FULL shift span the employee is expected to be
  //     present for (start→end, break INCLUDED) less any early-leave grace —
  //     a full day for that shift is the whole 9h window.
  //   • Below the half-day floor → absent.
  // Net result: worked < 4h → absent, 4h ≤ worked < 9h → half_day, ≥ 9h →
  // present. (Was: <25% absent / 25–50% half / ≥50% present, which counted a
  // half-shift as a full present day — #1822 revisited.)
  const halfDayFloor = Math.floor(shiftDurationMinutes / 2);
  const presentFloor = Math.max(
    halfDayFloor,
    grossShiftMinutes - (shift?.grace_minutes_early || 0),
  );

  // Single-punch day stays "checked_in" — the worker is in but hasn't
  // completed the day yet. Once a second punch lands, the day rolls into
  // a present/half_day/absent bucket based on worked minutes.
  let status: "present" | "absent" | "half_day" | "checked_in" = "checked_in";
  if (punches.length > 1) {
    if (workedMinutes < halfDayFloor) {
      status = "absent";
    } else if (workedMinutes < presentFloor) {
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
      // Half-day flag for the matched leave. A record can be stamped
      // `on_leave` even when only HALF the day was taken as leave and the
      // employee actually worked the other half (e.g. Plash worked the first
      // half, EL second_half) -- the records page needs this to render
      // "Half Day (EL)" instead of a misleading full "On Leave (EL)".
      db.raw(
        `(SELECT la.is_half_day FROM leave_applications la
          WHERE la.user_id = ar.user_id
            AND la.organization_id = ar.organization_id
            AND la.status = 'approved'
            AND ar.date BETWEEN la.start_date AND la.end_date
          LIMIT 1) AS leave_is_half_day`,
      ),
      db.raw(
        `(SELECT la.half_day_type FROM leave_applications la
          WHERE la.user_id = ar.user_id
            AND la.organization_id = ar.organization_id
            AND la.status = 'approved'
            AND ar.date BETWEEN la.start_date AND la.end_date
          LIMIT 1) AS leave_half_day_type`,
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
    .leftJoin("organization_locations as loc", "u.location_id", "loc.id")
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
      "loc.name as location",
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

// ---------------------------------------------------------------------------
// Late counts over a date range — per-employee number of LATE days between
// date_from and date_to (inclusive). Drives the "Late" tab range view ("how
// many times was each employee late over the last 15 days / this month / a
// custom range"). Uses the SAME definition of late as the daily dashboard
// (#1928): a day counts as late only when the row is present/half_day/
// checked_in AND has positive late_minutes, so a stale late_minutes on a row
// later flipped to on_leave/absent never inflates the count. Every in-scope
// employee is returned (0-late included) so any employee is findable/searchable
// in the modal; ordered most-late first.
// ---------------------------------------------------------------------------
export async function getLateCounts(
  orgId: number,
  params: { date_from: string; date_to: string; department_id?: number; location_id?: number },
  userIds?: number[],
) {
  const db = getDB();
  const startDate = params.date_from;
  const endDate = params.date_to;

  const teamScoped = Array.isArray(userIds);
  const emptyTeam = teamScoped && userIds!.length === 0;

  // The gated "late day" predicate, reused for both the count and the minutes sum.
  const latePredicate =
    "ar.status IN ('present','half_day','checked_in') AND ar.late_minutes > 0";

  // The date window lives in the JOIN (not WHERE) so a LEFT JOIN still yields a
  // row for employees with zero attendance records in the range (late_count = 0),
  // instead of dropping them.
  const query = db("users as u")
    .leftJoin("organization_departments as d", "u.department_id", "d.id")
    .leftJoin("organization_locations as loc", "u.location_id", "loc.id")
    .leftJoin("attendance_records as ar", function () {
      this.on("ar.user_id", "=", "u.id").andOnBetween("ar.date", [startDate, endDate]);
    })
    .where("u.organization_id", orgId)
    .where("u.status", 1)
    .whereNot("u.role", "super_admin");

  if (params.department_id) query.where("u.department_id", params.department_id);
  if (params.location_id) query.where("u.location_id", params.location_id);
  if (teamScoped) {
    if (emptyTeam) query.where(db.raw("1 = 0"));
    else query.whereIn("u.id", userIds!);
  }

  const rows = await query
    .select(
      "u.id as user_id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code",
      "d.name as department",
      "loc.name as location",
      db.raw(`COUNT(CASE WHEN ${latePredicate} THEN 1 END) as late_count`),
      db.raw(`SUM(CASE WHEN ${latePredicate} THEN ar.late_minutes ELSE 0 END) as total_late_minutes`),
    )
    .groupBy("u.id", "u.first_name", "u.last_name", "u.email", "u.emp_code", "d.name", "loc.name")
    .orderByRaw("late_count DESC")
    .orderBy(["u.first_name", "u.last_name"]);

  const employees = rows.map((r: any) => ({
    ...r,
    late_count: Number(r.late_count) || 0,
    total_late_minutes: Number(r.total_late_minutes) || 0,
  }));

  return {
    date_from: startDate,
    date_to: endDate,
    total_late_employees: employees.filter((e) => e.late_count > 0).length,
    employees,
  };
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
// The grid trusts the stored status: half-day classification happens once, at
// punch time (see the present/half_day/absent thresholds above), and is
// persisted on the row. The grid renders that status verbatim (see codeFor)
// and does NOT re-derive it from worked_minutes.

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
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const isoLocal = (v: any): string => {
    if (typeof v === "string") return v.slice(0, 10);
    if (!(v instanceof Date)) v = new Date(v);
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  };
  const holidaySet = new Set<string>();
  // Sub-set of `holidaySet` — only the dates the org has marked as MANDATORY
  // (closed-office) holidays. A present employee on a mandatory holiday is
  // auto-classified as HOT; on an optional / restricted holiday they stay P
  // (Bakrid, Holi, Onam etc. — HR offers the day off, employee may work).
  // `is_mandatory` lives on company_events already; HR toggles it per row
  // from the Holidays edit form. The legacy organization_holidays table has
  // no such flag — its rows are treated as mandatory to preserve behaviour.
  const mandatoryHolidaySet = new Set<string>();

  // Holiday source (primary) — `company_events` with event_type='holiday'.
  // The HR Holidays page writes here (POST /events, event_type=holiday).
  // The grid previously read only the legacy `organization_holidays` table,
  // which is empty in live tenants, so HR-added holidays never appeared.
  // Holiday rows can span multiple days (start_date..end_date), so expand
  // each into the individual dates that fall inside this month.
  try {
    const eventRows: Array<{ start_date: any; end_date: any; is_mandatory: number }> = await db(
      "company_events",
    )
      .where({ organization_id: orgId, event_type: "holiday" })
      .where("start_date", "<=", `${monthEnd} 23:59:59`)
      .andWhere(function () {
        this.where("end_date", ">=", `${monthStart} 00:00:00`).orWhereNull("end_date");
      })
      .select("start_date", "end_date", "is_mandatory");
    for (const e of eventRows) {
      const startIso = isoLocal(e.start_date);
      const endIso = e.end_date ? isoLocal(e.end_date) : startIso;
      let cur = startIso < monthStart ? monthStart : startIso;
      const last = endIso > monthEnd ? monthEnd : endIso;
      const mandatory = !!Number(e.is_mandatory);
      while (cur <= last) {
        holidaySet.add(cur);
        if (mandatory) mandatoryHolidaySet.add(cur);
        const d = new Date(cur + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        cur = d.toISOString().split("T")[0];
      }
    }
  } catch {
    // company_events absent on older schemas — fall through to legacy table.
  }

  // Holiday source (legacy, backward-compat) — `organization_holidays`.
  // Retained so any tenant that populated the old table still works. Treated
  // as mandatory since the legacy table has no optional flag.
  try {
    const holidayRows: Array<{ holiday_date: any }> = await db("organization_holidays")
      .where("organization_id", orgId)
      .whereBetween("holiday_date", [monthStart, monthEnd])
      .select("holiday_date");
    for (const h of holidayRows) {
      const k = isoLocal(h.holiday_date);
      holidaySet.add(k);
      mandatoryHolidaySet.add(k);
    }
  } catch {
    // Older schemas without the table -- ignore.
  }

  const days: Array<{
    day: number;
    date: string;
    dow: number;
    defaultCode: "HO" | "";
    /**
     * True only when this date's holiday is mandatory (closed office).
     * Optional / restricted holidays still get defaultCode='HO' so the cell
     * paints as a holiday, but the auto-HOT rule below skips them so a
     * present employee stays P.
     */
    isMandatoryHoliday: boolean;
  }> = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    const defaultCode: "HO" | "" = holidaySet.has(dateStr) ? "HO" : "";
    days.push({
      day: d,
      date: dateStr,
      dow,
      defaultCode,
      isMandatoryHoliday: mandatoryHolidaySet.has(dateStr),
    });
  }

  // Department + location names are joined in so the grid page can filter
  // client-side without an extra round-trip per dropdown.
  //
  // Membership rule: include every ACTIVE user, plus any exited user whose
  // date_of_exit falls on or after the start of the queried month. That way
  // someone who left mid-May still shows up in the May grid (the per-cell
  // trim logic below uses `date_of_exit` to blank out days after they left),
  // but disappears from June onwards. Without this, exited employees vanish
  // from the grid the moment HR closes their record, even for months they
  // actually worked.
  const allUsers = await db("users as u")
    .leftJoin("organization_departments as dept", "u.department_id", "dept.id")
    .leftJoin("organization_locations as loc", "u.location_id", "loc.id")
    .where("u.organization_id", orgId)
    .whereNot("u.role", "super_admin")
    .where(function () {
      this.where("u.status", 1).orWhere("u.date_of_exit", ">=", monthStart);
    })
    .select(
      "u.id as user_id",
      "u.first_name",
      "u.last_name",
      "u.emp_code",
      "u.date_of_joining",
      "u.date_of_exit",
      "dept.name as department",
      "loc.name as location",
    );

  if (allUsers.length === 0) {
    return { days, employees: [], totalEmployees: 0, daysInMonth };
  }

  const rows = await db("attendance_records as ar")
    .leftJoin("shifts as attendance_shift", "attendance_shift.id", "ar.shift_id")
    .where("ar.organization_id", orgId)
    .whereIn(
      "ar.user_id",
      allUsers.map((u: any) => u.user_id),
    )
    .whereBetween("ar.date", [monthStart, monthEnd])
    .select(
      "ar.user_id",
      "ar.date",
      "ar.status",
      "ar.worked_minutes",
      "ar.shift_id",
      "attendance_shift.is_night_shift as attendance_shift_is_night",
    );

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
      "s.is_night_shift",
    );

  // userId -> dateIso -> "WO" | "WORK"  (always set when an assignment
  // covers the date so a later/older assignment can't "downgrade" a
  // verified working day into a weekoff).
  const userWeekoff: Record<number, Record<string, "WO" | "WORK">> = {};
  const userNightShift: Record<number, Record<string, "NIGHT" | "DAY">> = {};
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
    const isNightShift = !!a.is_night_shift;
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
      if (!userNightShift[uid]) userNightShift[uid] = {};
      userNightShift[uid][d.date] = isNightShift ? "NIGHT" : "DAY";
    }
  }
  // BUG-GridSatAsAbsent — Fill in dow-based fallback for dates NOT covered
  // by any shift assignment. The original behaviour was to leave such cells
  // blank, but the auto-Absent rule further down then turned a blank Sat/Sun
  // into an A (Vijay Patel May 22-31 — shift 1249 ended 21 May, next shift
  // started 1 Jun; the four Sat/Sun in that gap rendered as A). Payroll's
  // resolveCalendarLop already uses dow-based fallback for the same case
  // (Sat = 6, Sun = 0 → weekoff), so this makes the Grid agree with the
  // payslip when a shift assignment has gaps. Working days outside any
  // shift remain "WORK", so a Mon-Fri date with no record still correctly
  // shows as Absent — matching payroll's LOP for the same day.
  for (const u of allUsers) {
    const uid = Number(u.user_id);
    if (!userWeekoff[uid]) userWeekoff[uid] = {};
    for (const d of days) {
      if (userWeekoff[uid][d.date] !== undefined) continue;
      const off = d.dow === 0 || d.dow === 6;
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
      // Trust the stored status. We previously auto-downgraded a present
      // day to half-day when worked_minutes < threshold, but that made the
      // grid disagree with the attendance record itself: a day explicitly
      // marked / regularized as "present" (especially short, valid days —
      // a single-punch correction, a part-day approved by HR) showed as
      // "H" on the grid while every other view said present. If a day is a
      // genuine half-day it carries status = 'half_day' (rendered above);
      // the grid no longer second-guesses an explicit present status from
      // worked_minutes.
      return "P";
    }
    return "";
  };

  const byUser: Record<number, Record<string, AttendanceCode>> = {};
  const attendanceNightByUser: Record<number, Record<string, boolean>> = {};
  // Parallel "did the employee actually work this date" map. We need this
  // because a record can be stamped `on_leave` (codeFor -> "L") while still
  // carrying real punches / worked_minutes -- a HALF-day leave where the
  // other half was worked. Without it the leave-merge below can't tell that
  // an `on_leave` cell should become HPL rather than a flat L.
  const workedByUser: Record<number, Record<string, boolean>> = {};
  for (const r of rows) {
    const dStr = isoLocal(r.date);
    const uid = Number(r.user_id);
    if (!byUser[uid]) byUser[uid] = {};
    byUser[uid][dStr] = codeFor(
      r.status,
      r.worked_minutes != null ? Number(r.worked_minutes) : null,
      dStr,
    );
    if (!workedByUser[uid]) workedByUser[uid] = {};
    workedByUser[uid][dStr] =
      (r.worked_minutes != null && Number(r.worked_minutes) > 0) || !!r.check_in;
    if (r.shift_id != null) {
      if (!attendanceNightByUser[uid]) attendanceNightByUser[uid] = {};
      attendanceNightByUser[uid][dStr] = !!Number(r.attendance_shift_is_night);
    }
  }

  // Approved leaves overlapping the month, merged into the grid. The grid
  // previously read ONLY attendance_records, so a day with an approved
  // leave (especially a HALF-day leave the employee partly worked) showed
  // as plain "Present" with no sign of the leave. We now fold leaves in:
  //   - full-day leave                       -> L
  //   - half-day leave + other half worked   -> HPL (½ present + ½ leave)
  //   - half-day leave + half_day row (no
  //     punch — approveLeave's no-show marker) -> H  (½ paid + ½ unpaid)
  //   - half-day leave + nothing worked       -> L
  // and surface the leave type code (EL / CL / …) per date so the FE can
  // label it. Multi-day leaves are expanded across the month.
  const leaveByUser: Record<
    number,
    Record<string, { code: string; name: string; isHalf: boolean; halfType: string | null }>
  > = {};
  try {
    const leaveRows = await db("leave_applications as la")
      .join("leave_types as lt", "lt.id", "la.leave_type_id")
      .where("la.organization_id", orgId)
      .where("la.status", "approved")
      .whereIn(
        "la.user_id",
        allUsers.map((u: any) => u.user_id),
      )
      .where("la.start_date", "<=", monthEnd)
      .where("la.end_date", ">=", monthStart)
      .select(
        "la.user_id",
        "la.start_date",
        "la.end_date",
        "la.is_half_day",
        "la.half_day_type",
        "lt.code as leave_code",
        "lt.name as leave_name",
      );
    for (const lv of leaveRows) {
      const uid = Number(lv.user_id);
      const startIso = isoLocal(lv.start_date);
      const endIso = isoLocal(lv.end_date);
      let cur = startIso < monthStart ? monthStart : startIso;
      const last = endIso > monthEnd ? monthEnd : endIso;
      while (cur <= last) {
        if (!leaveByUser[uid]) leaveByUser[uid] = {};
        if (!leaveByUser[uid][cur]) {
          leaveByUser[uid][cur] = {
            code: lv.leave_code || "L",
            name: lv.leave_name || "Leave",
            isHalf: !!Number(lv.is_half_day),
            halfType: lv.half_day_type || null,
          };
        }
        const dd = new Date(cur + "T00:00:00Z");
        dd.setUTCDate(dd.getUTCDate() + 1);
        cur = dd.toISOString().split("T")[0];
      }
    }
  } catch {
    // leave tables absent on older schemas — skip leave merging.
  }

  const employees = allUsers.map((u: any) => {
    const userMap = byUser[u.user_id] || {};
    const offMap = userWeekoff[u.user_id] || {};
    // Employment window — used to synthesize Absent only for days the
    // employee was actually employed (don't paint pre-joining / post-exit
    // days red).
    const joinIso = u.date_of_joining ? isoLocal(u.date_of_joining) : null;
    const exitIso = u.date_of_exit ? isoLocal(u.date_of_exit) : null;
    const dayCodes: Record<string, AttendanceCode> = {};
    // Parallel map: which dates are this employee's shift-defined
    // weekoffs. Emitted alongside `days` so the FE can render a combined
    // badge like "P/WO", "A/WO", "H/WO" when the employee actually
    // worked / was marked on their off day -- typical overtime or
    // comp-off candidate. Pure "WO" is rendered for weekoff dates with
    // no attendance row.
    const weekoffDays: Record<string, true> = {};
    const leaveMap = leaveByUser[u.user_id] || {};
    // Parallel map: leave type + half-day flag per date, so the FE can
    // label the cell (e.g. "EL", "½ CL"). Cell code itself is set to
    // L / HPL below.
    const leaves: Record<string, { code: string; isHalf: boolean }> = {};
    const nightShiftDays: Record<string, true> = {};
    const extraDayDays: Record<string, true> = {};
    for (const d of days) {
      // Attendance code: real row if any, otherwise the date-level
      // default (HO / "").
      const real = userMap[d.date];
      const isWeekoff = offMap[d.date] === "WO";
      const isHoliday = d.defaultCode === "HO";
      let code = (real || (d.defaultCode as AttendanceCode)) as AttendanceCode;
      // A passed working day with no attendance row, no holiday and no
      // week-off is an Absent — match the employee's own "My Attendance"
      // view (which synthesizes Absent) instead of rendering a blank cell.
      // Today and future days stay blank (the day isn't over), and days
      // outside the employee's join–exit window are never marked absent.
      if (
        !real &&
        code === "" &&
        !isWeekoff &&
        d.date < todayIso &&
        (!joinIso || d.date >= joinIso) &&
        (!exitIso || d.date <= exitIso)
      ) {
        code = "A";
      }
      // Auto-overtime: a FULL present day worked on a MANDATORY holiday or a
      // week-off is shown as HOT / WOT automatically -- HR doesn't mark it
      // by hand. Optional / restricted holidays (Bakrid, Holi, Onam, etc.)
      // are skipped: the employee chose to work, so it's a normal Present.
      // Mandatory holiday wins when a date is both a holiday and a week-off.
      // Explicitly-set WOT/HOT (status weekoff_overtime/holiday_overtime)
      // already arrives as that code from codeFor() and is left as-is.
      // Payroll derives OT days the same way, so the grid and the payslip
      // stay consistent.
      const isMandatoryHoliday = (d as any).isMandatoryHoliday === true;
      if (real === "P") {
        if (isMandatoryHoliday) code = "HOT";
        else if (isWeekoff) code = "WOT";
      }
      // Approved leave on this date wins over a plain present/blank cell:
      //   full-day leave                       -> L
      //   half-day leave + other half worked   -> HPL (½ present + ½ leave)
      //   half-day leave + half_day row (no
      //     punch — approveLeave's no-show marker) -> H  (½ paid + ½ unpaid)
      //   half-day leave + nothing worked      -> L
      const lv = leaveMap[d.date];
      if (lv) {
        if (lv.isHalf) {
          // HPL ONLY when the OTHER half was genuinely worked: a full present
          // row, or any row carrying real punches / worked_minutes (this also
          // covers an `on_leave` row that still has punches — the classic
          // half-present-half-leave the stored status missed). A bare
          // `half_day` with NO punches is approveLeave's marker for a half-day
          // leave whose other half was NOT worked — it must read as H (½ paid
          // + ½ unpaid), never HPL (which would imply a full paid day).
          const workedOtherHalf =
            real === "P" || workedByUser[u.user_id]?.[d.date] === true;
          if (workedOtherHalf) code = "HPL";
          else if (real === "H") code = "H";
          else code = "L";
        } else {
          code = "L";
        }
        leaves[d.date] = { code: lv.code, isHalf: lv.isHalf };
      }
      dayCodes[d.date] = code;
      if (isWeekoff) {
        weekoffDays[d.date] = true;
      }
      const assignmentNight = userNightShift[u.user_id]?.[d.date];
      if (
        assignmentNight === "NIGHT" ||
        (assignmentNight === undefined && attendanceNightByUser[u.user_id]?.[d.date] === true)
      ) {
        nightShiftDays[d.date] = true;
      }
      if (code === "WOT" || code === "HOT" || (code === "M" && (isWeekoff || isMandatoryHoliday))) {
        extraDayDays[d.date] = true;
      }
    }
    let nightAllowanceCount = 0;
    let extraDayCount = 0;
    for (const d of days) {
      const code = dayCodes[d.date];
      if (extraDayDays[d.date]) extraDayCount += 1;
      if (nightShiftDays[d.date]) {
        if (code === "H" || code === "HPL") nightAllowanceCount += 0.5;
        else if (code === "P" || code === "M" || code === "WOT" || code === "HOT") {
          nightAllowanceCount += 1;
        }
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
      nightShiftDays,
      extraDayDays,
      nightAllowanceCount,
      extraDayCount,
      leaves,
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
  params: { userId: number; date: string; code: string; actorUserId?: number },
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
  // A Present or Absent override is authoritative over an approved leave. Reverse a
  // application date and restore its balance before saving attendance;
  // otherwise the monthly grid would merge the approved leave back to L on
  // every refresh. Multi-day applications are split around the worked date so
  // the rest of the approved leave remains intact.
  if (upper === "P" || upper === "A") {
    const approvedLeave = await db("leave_applications")
      .where({ organization_id: orgId, user_id: params.userId, status: "approved" })
      .where("start_date", "<=", params.date)
      .where("end_date", ">=", params.date)
      .first();
    if (approvedLeave) {
      const actor = params.actorUserId
        ? await db("users")
            .where({ id: params.actorUserId, organization_id: orgId })
            .select("first_name", "last_name")
            .first()
        : null;
      const actorName = actor
        ? `${actor.first_name || ""} ${actor.last_name || ""}`.trim() || `User #${params.actorUserId}`
        : "an administrator";
      const cancellationAudit = `[Leave cancelled by ${actorName} via Attendance Grid on ${params.date}]`;
      const start = String(approvedLeave.start_date).slice(0, 10);
      const end = String(approvedLeave.end_date).slice(0, 10);
      const refundDays = approvedLeave.is_half_day ? 0.5 : 1;
      await db.transaction(async (trx) => {
        const now = new Date();
        await trx("leave_applications").where({ id: approvedLeave.id }).update({
          status: "cancelled",
          reason: `${approvedLeave.reason ? `${approvedLeave.reason} ` : ""}${cancellationAudit}`,
          updated_at: now,
        });
        const ranges: Array<{ start_date: string; end_date: string }> = [];
        const before = new Date(`${params.date}T00:00:00Z`);
        before.setUTCDate(before.getUTCDate() - 1);
        const after = new Date(`${params.date}T00:00:00Z`);
        after.setUTCDate(after.getUTCDate() + 1);
        const beforeIso = before.toISOString().slice(0, 10);
        const afterIso = after.toISOString().slice(0, 10);
        if (start <= beforeIso) ranges.push({ start_date: start, end_date: beforeIso });
        if (afterIso <= end) ranges.push({ start_date: afterIso, end_date: end });

        // Preserve the remaining approved dates as up to two applications.
        // Allocate the original debit minus the one restored day across the
        // chronological segments; the final segment receives the exact
        // remainder, keeping total leave usage unchanged except for this day.
        let remainingDays = Math.max(0, Number(approvedLeave.days_count) - refundDays);
        const calendarDays = ranges.map(
          (range) => Math.floor((Date.parse(range.end_date) - Date.parse(range.start_date)) / 86400000) + 1,
        );
        let remainingCalendarDays = calendarDays.reduce((total, days) => total + days, 0);
        for (let index = 0; index < ranges.length && remainingDays > 0; index += 1) {
          const segmentDays = index === ranges.length - 1
            ? remainingDays
            : Math.min(
                remainingDays,
                Math.round((remainingDays * calendarDays[index] / remainingCalendarDays) * 2) / 2,
              );
          remainingDays = Math.max(0, remainingDays - segmentDays);
          remainingCalendarDays -= calendarDays[index];
          if (segmentDays <= 0) continue;
          const {
            id: _id,
            created_at: _createdAt,
            updated_at: _updatedAt,
            ...applicationCopy
          } = approvedLeave;
          await trx("leave_applications").insert({
            ...applicationCopy,
            ...ranges[index],
            days_count: segmentDays,
            status: "approved",
            reason: `${approvedLeave.reason} [Attendance override on ${params.date}]`,
            created_at: now,
            updated_at: now,
          });
        }
        const balance = await trx("leave_balances")
          .where({
            organization_id: orgId,
            user_id: params.userId,
            leave_type_id: approvedLeave.leave_type_id,
          })
          .orderBy("year", "desc")
          .first()
          .forUpdate();
        if (!balance) throw new ValidationError("Leave balance not found; override was not saved.");
        await trx("leave_balances").where({ id: balance.id }).update({
          total_used: Math.max(0, Number(balance.total_used) - refundDays),
          balance: Number(balance.balance) + refundDays,
          period_used: Math.max(0, Number(balance.period_used || 0) - refundDays),
          updated_at: now,
        });
        const attendance = await trx("attendance_records")
          .where({ user_id: params.userId, organization_id: orgId, date: params.date })
          .first();
        if (attendance) {
          await trx("attendance_records").where({ id: attendance.id }).update({ status, updated_at: now });
        } else {
          await trx("attendance_records").insert({
            user_id: params.userId,
            organization_id: orgId,
            date: params.date,
            status,
            created_at: now,
            updated_at: now,
          });
        }
      });
      return { ok: true, action: "updated", status, reversed_leave: true };
    }
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
