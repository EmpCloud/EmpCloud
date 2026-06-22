// =============================================================================
// EMP CLOUD — Field Tracking Legacy Service
//
// Drop-in compatibility layer for the EMP Field app. Paths, request bodies and
// response envelopes mirror emp-monitor's field-tracking endpoints
// (v3/hrms/* + v3/user/fieldAllEmployeeList) so the existing field client
// keeps working unchanged, but every handler maps onto EmpCloud's NATIVE HRMS
// tables and services instead of emp_monitor.
//
// Identity mapping: emp-monitor sent `employee_id` (its employees.id) and
// `organization_id`. EmpCloud's equivalent identity is `users.id`, so the
// field client's `employee_id` is treated as the EmpCloud user id. Unlike
// emp-monitor — which trusted whatever ids the body carried — every lookup
// here is scoped by organization_id (resolveOrgUser), so the shared secret
// can't be used to read or mutate another tenant's data by id-guessing.
//
// Reused services (business logic, validation and tenant isolation live there):
//   - attendance.service           checkIn / getMyToday
//   - regularization.service       submitRegularization
//   - leave-application.service    applyLeave / updateLeave / cancelLeave
//
// The read endpoints (employee directory, attendance sheet, holidays, leave
// list, leave types) are shaped directly here so the JSON payload matches
// emp-monitor's field responses key-for-key (see the per-function notes).
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import * as attendanceService from "../attendance/attendance.service.js";
import * as regularizationService from "../attendance/regularization.service.js";
import * as leaveApplicationService from "../leave/leave-application.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render `value` as "YYYY-MM-DD HH:mm:ss" wall-clock in `tz` (UTC fallback). */
function formatInTz(value: Date | string | null | undefined, tz?: string | null): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  const timeZone = tz || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    let hh = get("hour");
    if (hh === "24") hh = "00";
    return `${get("year")}-${get("month")}-${get("day")} ${hh}:${get("minute")}:${get("second")}`;
  } catch {
    // Invalid timezone string — degrade to UTC rather than 500.
    return d.toISOString().slice(0, 19).replace("T", " ");
  }
}

/** "YYYY-MM-DD" for the given Date|string (UTC calendar date). */
function toDateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Resolve { month, year } for the attendance-sheet endpoints. Accepts either
 * emp-monitor's `date` ("YYYYMM") or a `start_date`; falls back to the current
 * month so a bare request still returns something sensible.
 */
function resolveMonthYear(body: { date?: unknown; start_date?: unknown; end_date?: unknown }): {
  month: number;
  year: number;
} {
  const rawDate = body.date != null ? String(body.date) : "";
  if (/^\d{6}$/.test(rawDate)) {
    return { year: Number(rawDate.slice(0, 4)), month: Number(rawDate.slice(4, 6)) };
  }
  const ref = body.start_date ?? body.end_date;
  if (ref != null) {
    const d = new Date(String(ref));
    if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Map emp-monitor's numeric `day_type` to EmpCloud's half-day shape.
 *   1 → First Half, 3 → Second Half, anything else → full day.
 */
function dayTypeToHalfDay(dayType: unknown): {
  is_half_day: boolean;
  half_day_type: "first_half" | "second_half" | null;
} {
  const dt = Number(dayType);
  if (dt === 1) return { is_half_day: true, half_day_type: "first_half" };
  if (dt === 3) return { is_half_day: true, half_day_type: "second_half" };
  return { is_half_day: false, half_day_type: null };
}

/** Inclusive list of "YYYY-MM-DD" calendar dates between start and end. */
function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return out;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * emp-monitor stored leave `status` as a number: 0 = pending, 1 = approved,
 * 2 = rejected. EmpCloud uses string statuses; map them back so the field
 * client's numeric comparisons keep working. (cancelled collapses to rejected,
 * matching emp-monitor which had no separate cancelled code.)
 */
function leaveStatusCode(status: string | null | undefined): number {
  switch (status) {
    case "approved":
      return 1;
    case "rejected":
    case "cancelled":
      return 2;
    default:
      return 0; // pending
  }
}

/**
 * Look up the user the field client is acting on, scoped to the org. Throws
 * NotFoundError if the id doesn't belong to that organization — this is the
 * tenant-isolation guard emp-monitor's field endpoints lacked.
 */
async function resolveOrgUser(orgId: number, employeeId: unknown) {
  const id = Number(employeeId);
  if (!orgId || !Number.isInteger(id) || id <= 0) {
    throw new ValidationError("organization_id and employee_id are required");
  }
  const user = await getDB()("users").where({ id, organization_id: orgId }).first();
  if (!user) throw new NotFoundError("Employee");
  return user;
}

// ---------------------------------------------------------------------------
// /user/fieldAllEmployeeList — directory of employees for the field app
// ---------------------------------------------------------------------------

export async function listFieldEmployees(body: {
  orgId?: unknown;
  department_id?: unknown;
  location_id?: unknown;
  role_id?: unknown;
  name?: unknown;
  status?: unknown;
  skip?: unknown;
  limit?: unknown;
}) {
  const db = getDB();
  const orgId = Number(body.orgId);
  if (!orgId) throw new ValidationError("orgId is required");

  const skip = Number(body.skip) || 0;
  const limit = Number(body.limit) || 0;

  let query = db("users as u")
    .leftJoin("organization_departments as dept", "u.department_id", "dept.id")
    .leftJoin("organization_locations as loc", "u.location_id", "loc.id")
    .where("u.organization_id", orgId)
    .whereNot("u.role", "super_admin");

  if (body.department_id) query = query.where("u.department_id", Number(body.department_id));
  if (body.location_id) query = query.where("u.location_id", Number(body.location_id));
  // role_id is a numeric role id → filter via user_roles (a subquery, so the
  // main query stays one-row-per-user and ONLY_FULL_GROUP_BY-safe).
  if (body.role_id) {
    query = query.whereIn(
      "u.id",
      db("user_roles").where("role_id", Number(body.role_id)).select("user_id"),
    );
  }
  if (body.status !== undefined && body.status !== null && body.status !== "") {
    query = query.where("u.status", Number(body.status));
  }
  if (body.name) {
    const term = `%${String(body.name)}%`;
    query = query.where(function () {
      this.where(db.raw("CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))"), "like", term)
        .orWhere("u.email", "like", term)
        .orWhere("u.emp_code", "like", term);
    });
  }

  // emp-monitor returned a window COUNT(*) OVER() as `total_count` on every
  // row (the filtered total, before paging). Compute it once and stamp it on
  // each row below.
  const [{ count }] = await query.clone().count("u.id as count");
  const totalCount = Number(count);

  let rowsQuery = query.clone().orderBy("u.first_name", "asc");
  if (limit > 0) rowsQuery = rowsQuery.limit(limit).offset(skip);

  const rows = await rowsQuery.select(
    "u.id",
    "u.first_name",
    "u.last_name",
    "u.email",
    "u.emp_code",
    "u.contact_number as phone",
    "u.address",
    "u.photo_path",
    "u.designation",
    "u.status",
    "u.organization_id",
    "u.department_id",
    "dept.name as department",
    "u.location_id",
    "loc.name as location",
    "u.role",
    // `users` has no timezone column — the employee's timezone comes from their
    // work location (organization_locations.timezone), already joined as `loc`.
    "loc.timezone as timezone",
    "u.date_of_joining as date_join",
  );

  // Roles per user, fetched separately and merged in (mirrors emp-monitor's
  // getRolesByUserId + per-user filter) so the directory join can't multiply
  // rows.
  const userIds = rows.map((r: any) => r.id);
  const roleRows = userIds.length
    ? await db("user_roles as ur")
        .join("roles as rn", "rn.id", "ur.role_id")
        .whereIn("ur.user_id", userIds)
        .select("ur.user_id", "ur.role_id", "rn.name as role", "rn.type as role_type")
    : [];
  const rolesByUser = new Map<number, Array<{ role_id: number; role: string; role_type: number }>>();
  for (const rr of roleRows as any[]) {
    const list = rolesByUser.get(rr.user_id) ?? [];
    list.push({ role_id: rr.role_id, role: rr.role, role_type: rr.role_type });
    rolesByUser.set(rr.user_id, list);
  }

  // Reproduce the exact key set userListNoLimitField + the controller
  // returned. EMP Monitor desktop-agent fields (software_version,
  // computer_name, username, domain, tracking_mode/_rule_type,
  // shift_name/_data) and EmpCloud-absent fields (project_name) are emitted as
  // null to keep the shape identical. `password`/`encriptedpassword` stay
  // null — emp-monitor returned decrypted plaintext; EmpCloud bcrypt is
  // one-way and is never exposed.
  return rows.map((r: any) => {
    const roles = rolesByUser.get(r.id) ?? [];
    const primary = roles[0];
    const roleName = primary?.role ?? r.role ?? null;
    return {
      id: r.id,
      u_id: r.id,
      first_name: r.first_name,
      name: r.first_name, // emp-monitor aliased first_name AS name
      last_name: r.last_name,
      email: r.email,
      phone: r.phone ?? null,
      date_join: toDateOnly(r.date_join),
      address: r.address ?? null,
      photo_path: r.photo_path ?? null,
      status: r.status,
      organization_id: r.organization_id,
      location_id: r.location_id ?? null,
      location: r.location ?? null,
      department_id: r.department_id ?? null,
      department: r.department ?? null,
      emp_code: r.emp_code ?? null,
      shift_id: null,
      timezone: r.timezone ?? null,
      tracking_mode: null,
      tracking_rule_type: null,
      role_id: primary?.role_id ?? null,
      role: roleName,
      role_type: primary?.role_type ?? null,
      total_count: totalCount,
      full_name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
      software_version: null,
      password: null,
      computer_name: null,
      username: null,
      domain: null,
      shift_name: null,
      shift_data: null,
      employee_unique_id: r.email,
      project_name: null,
      roles,
      encriptedpassword: null,
      assigned: [],
    };
  });
}

// ---------------------------------------------------------------------------
// /hrms/getAttendanceField + /hrms/attendance-fieldtracking
// ---------------------------------------------------------------------------

export async function getAttendanceSheet(body: {
  organization_id?: unknown;
  date?: unknown;
  start_date?: unknown;
  end_date?: unknown;
}) {
  const orgId = Number(body.organization_id);
  if (!orgId) throw new ValidationError("organization_id is required");
  const db = getDB();

  // Resolve the [start, end] window: explicit start_date/end_date win;
  // otherwise the whole month derived from `date` (YYYYMM) / current month.
  let start = toDateOnly(body.start_date as string);
  let end = toDateOnly(body.end_date as string);
  if (!start || !end) {
    const { month, year } = resolveMonthYear(body);
    start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }
  const range = eachDate(start, end);

  // Field employees (org directory, minus super_admin).
  const employees = await db("users as u")
    .leftJoin("organization_departments as dept", "u.department_id", "dept.id")
    .leftJoin("organization_locations as loc", "u.location_id", "loc.id")
    .where("u.organization_id", orgId)
    .whereNot("u.role", "super_admin")
    .orderBy("u.first_name", "asc")
    .select(
      "u.id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code",
      "u.status",
      "u.organization_id",
      "u.department_id",
      "dept.name as department",
      "u.location_id",
      "loc.name as location",
      "u.date_of_joining as date_join",
      // `users` has no timezone column — use the joined work-location timezone.
      "loc.timezone as timezone",
    );

  const totalCount = employees.length;
  if (!totalCount) return [] as any[];
  const userIds = employees.map((e: any) => e.id);

  // Attendance records for the window, keyed user → date.
  const records = await db("attendance_records")
    .where("organization_id", orgId)
    .whereIn("user_id", userIds)
    .whereBetween("date", [start, end])
    .select("id", "user_id", "date", "check_in", "check_out", "status", "worked_minutes");
  const recByUser = new Map<number, Map<string, any>>();
  for (const r of records as any[]) {
    const uid = Number(r.user_id);
    const key = toDateOnly(r.date);
    if (!key) continue;
    if (!recByUser.has(uid)) recByUser.set(uid, new Map());
    recByUser.get(uid)!.set(key, r);
  }

  // Holidays for the window → date → name (company_events + legacy table).
  const holidayByDate = new Map<string, string>();
  try {
    const ev = await db("company_events")
      .where({ organization_id: orgId, event_type: "holiday" })
      .where("start_date", "<=", `${end} 23:59:59`)
      .andWhere(function () {
        this.where("end_date", ">=", `${start} 00:00:00`).orWhere("start_date", ">=", `${start} 00:00:00`);
      })
      .select("title", "start_date", "end_date");
    for (const h of ev as any[]) {
      const s = toDateOnly(h.start_date) ?? start;
      const e2 = toDateOnly(h.end_date) ?? s;
      for (const d of eachDate(s < start ? start : s, e2 > end ? end : e2)) {
        if (!holidayByDate.has(d)) holidayByDate.set(d, h.title);
      }
    }
  } catch {
    /* company_events absent on older schemas */
  }
  try {
    const leg = await db("organization_holidays")
      .where({ organization_id: orgId })
      .whereBetween("holiday_date", [start, end])
      .select("holiday_name", "holiday_date");
    for (const h of leg as any[]) {
      const d = toDateOnly(h.holiday_date);
      if (d && !holidayByDate.has(d)) holidayByDate.set(d, h.holiday_name);
    }
  } catch {
    /* legacy table absent */
  }

  // Approved/pending leaves overlapping the window → user → date → leave info.
  const leaveRows = await db("leave_applications as la")
    .leftJoin("leave_types as lt", "la.leave_type_id", "lt.id")
    .where("la.organization_id", orgId)
    .whereIn("la.user_id", userIds)
    .whereIn("la.status", ["approved", "pending"])
    .where("la.start_date", "<=", end)
    .andWhere("la.end_date", ">=", start)
    .select("la.user_id", "la.start_date", "la.end_date", "la.leave_type_id", "lt.name as leave_name", "la.is_half_day");
  const leaveByUser = new Map<number, Map<string, any>>();
  for (const lv of leaveRows as any[]) {
    const uid = Number(lv.user_id);
    const s = toDateOnly(lv.start_date);
    const e2 = toDateOnly(lv.end_date);
    if (!s || !e2) continue;
    if (!leaveByUser.has(uid)) leaveByUser.set(uid, new Map());
    for (const d of eachDate(s < start ? start : s, e2 > end ? end : e2)) {
      if (!leaveByUser.get(uid)!.has(d)) {
        leaveByUser.get(uid)!.set(d, {
          leave_type: lv.leave_type_id,
          leave_name: lv.leave_name,
          half: !!lv.is_half_day,
        });
      }
    }
  }

  // Build each employee's per-day attendance cells. emp-monitor's cell keys:
  // {employee_id, attendance_id, date, active_time, office_time, total_time,
  //  logged_duration, status, min_hours, is_manual_attendance} plus
  // holiday_status/holiday_name on holidays and leave_type/leave_name/
  // half_day_status on leave days. active_time/office_time/logged_duration are
  // EMP Monitor desktop-agent metrics with no EmpCloud source → 0.
  return employees.map((emp: any) => {
    const recs = recByUser.get(emp.id) ?? new Map();
    const lvs = leaveByUser.get(emp.id) ?? new Map();
    const attendance = range.map((date) => {
      const rec = recs.get(date);
      const workedSeconds = rec?.worked_minutes != null ? Number(rec.worked_minutes) * 60 : 0;
      const present = rec && ["present", "checked_in", "half_day"].includes(rec.status) ? 1 : 0;
      const cell: any = {
        employee_id: emp.id,
        attendance_id: rec?.id ?? null,
        date,
        active_time: 0,
        office_time: 0,
        total_time: workedSeconds,
        logged_duration: workedSeconds,
        status: present,
        min_hours: 0,
        is_manual_attendance: 0,
      };
      const holidayName = holidayByDate.get(date);
      if (holidayName) {
        cell.holiday_status = 1;
        cell.holiday_name = holidayName;
      }
      const lv = lvs.get(date);
      if (lv) {
        cell.leave_type = lv.leave_type;
        cell.leave_name = lv.leave_name;
        if (lv.half) cell.half_day_status = 1;
      }
      return cell;
    });
    return {
      id: emp.id,
      first_name: emp.first_name,
      name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email,
      emp_code: emp.emp_code ?? null,
      full_name: `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim(),
      status: emp.status,
      organization_id: emp.organization_id,
      department_id: emp.department_id ?? null,
      department: emp.department ?? null,
      location_id: emp.location_id ?? null,
      location: emp.location ?? null,
      date_join: toDateOnly(emp.date_join),
      timezone: emp.timezone ?? null,
      total_count: totalCount,
      attendance_colors: null,
      manual_clock_in: 0,
      data: 0,
      attendance,
    };
  });
}

// ---------------------------------------------------------------------------
// /hrms/markAttendanceField — check-in / check-out punch
// ---------------------------------------------------------------------------

export async function markAttendance(body: {
  organization_id?: unknown;
  employee_id?: unknown;
  timezone?: unknown;
}): Promise<{ status: "checked_in" | "checked_out"; time: string | null }> {
  const orgId = Number(body.organization_id);
  const user = await resolveOrgUser(orgId, body.employee_id);
  const tz = (body.timezone as string) || user.timezone || null;

  // EmpCloud's punch model: first punch of the day is the check-in, every
  // subsequent punch rolls the check-out forward (attendance.service.ts).
  // So a single checkIn() call here is the correct "toggle" — we read the
  // resulting record to tell the client which side it landed on.
  const record = await attendanceService.checkIn(orgId, user.id, { source: "app" });
  const checkedOut = !!record?.check_out;
  const punchTime = checkedOut ? record.check_out : record.check_in;
  return {
    status: checkedOut ? "checked_out" : "checked_in",
    time: formatInTz(punchTime, tz),
  };
}

// ---------------------------------------------------------------------------
// /hrms/fetch-attendance-field — today's check-in / check-out
// ---------------------------------------------------------------------------

export async function fetchTodayAttendance(body: {
  organization_id?: unknown;
  employee_id?: unknown;
  timezone?: unknown;
}): Promise<{ check_in: string | null; check_out: string | null }> {
  const orgId = Number(body.organization_id);
  const user = await resolveOrgUser(orgId, body.employee_id);
  const tz = (body.timezone as string) || user.timezone || null;

  const record = await attendanceService.getMyToday(orgId, user.id);
  if (!record) return { check_in: null, check_out: null };
  return {
    check_in: formatInTz(record.check_in, tz),
    check_out: formatInTz(record.check_out, tz),
  };
}

// ---------------------------------------------------------------------------
// /hrms/attendance-field-request — attendance regularization request
// ---------------------------------------------------------------------------

export async function submitAttendanceRequest(body: {
  organization_id?: unknown;
  employee_id?: unknown;
  date?: unknown;
  check_in?: unknown;
  check_out?: unknown;
  reason?: unknown;
}) {
  const orgId = Number(body.organization_id);
  const user = await resolveOrgUser(orgId, body.employee_id);

  const date = toDateOnly(body.date as string);
  if (!date) throw new ValidationError("date is required");
  if (!body.reason) throw new ValidationError("reason is required");

  // emp-monitor parity: regularization is only for past days. Today/future
  // dates are rejected (you can't retro-fix a day that hasn't ended).
  const today = new Date().toISOString().slice(0, 10);
  if (date >= today) {
    throw new ValidationError("Not allowed to request attendance for today/upcoming dates");
  }

  return regularizationService.submitRegularization(orgId, user.id, {
    date,
    requested_check_in: (body.check_in as string) ?? null,
    requested_check_out: (body.check_out as string) ?? null,
    reason: String(body.reason),
  });
}

// ---------------------------------------------------------------------------
// /hrms/fetch-holidays — current-year holidays for the org
// ---------------------------------------------------------------------------

export async function getHolidays(body: { organization_id?: unknown }) {
  const orgId = Number(body.organization_id);
  if (!orgId) throw new ValidationError("organization_id is required");
  const db = getDB();
  const year = new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  // Primary source — company_events (event_type='holiday'), what the HR
  // Holidays page writes. Expand nothing here; the field client only needs
  // the per-holiday rows for the year. Mirrors biometric-legacy.getHolidays'
  // {holiday_name, holiday_date, ...} mapping.
  const eventRows: Array<{
    id: number;
    organization_id: number;
    title: string;
    description: string | null;
    start_date: Date | string;
  }> = await db("company_events")
    .where({ organization_id: orgId, event_type: "holiday" })
    .where("start_date", "<=", `${end} 23:59:59`)
    .andWhere(function () {
      this.where("end_date", ">=", `${start} 00:00:00`).orWhere("start_date", ">=", `${start} 00:00:00`);
    })
    .orderBy("start_date", "asc")
    .select("id", "organization_id", "title", "description", "start_date");

  // emp-monitor's `SELECT * FROM holidays` returned exactly these four
  // columns; match that key set (no `description`) for byte parity.
  const holidays = eventRows.map((r) => ({
    id: r.id,
    holiday_name: r.title,
    holiday_date: toDateOnly(r.start_date),
    organization_id: r.organization_id,
  }));

  // Legacy fallback — organization_holidays (empty in live tenants, kept for
  // older deployments). Append any rows not already covered by an event.
  try {
    const legacy: Array<{
      id: number;
      organization_id: number;
      holiday_name: string;
      holiday_date: Date | string;
      description: string | null;
    }> = await db("organization_holidays")
      .where({ organization_id: orgId })
      .whereBetween("holiday_date", [start, end])
      .select("id", "organization_id", "holiday_name", "holiday_date", "description");
    const seen = new Set(holidays.map((h) => h.holiday_date));
    for (const h of legacy) {
      const d = toDateOnly(h.holiday_date);
      if (d && !seen.has(d)) {
        holidays.push({
          id: h.id,
          holiday_name: h.holiday_name,
          holiday_date: d,
          organization_id: h.organization_id,
        });
      }
    }
  } catch {
    // Table absent on newer schemas — company_events is the source of truth.
  }

  holidays.sort((a, b) => (a.holiday_date ?? "").localeCompare(b.holiday_date ?? ""));
  return holidays;
}

// ---------------------------------------------------------------------------
// /hrms/fetch-leaves — a field employee's leaves over a date range
// ---------------------------------------------------------------------------

export async function fetchFieldLeaves(body: {
  organization_id?: unknown;
  employee_id?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}) {
  const orgId = Number(body.organization_id);
  const user = await resolveOrgUser(orgId, body.employee_id);
  const db = getDB();

  let query = db("leave_applications as la")
    .join("users as u", "la.user_id", "u.id")
    .leftJoin("leave_types as lt", "la.leave_type_id", "lt.id")
    .where("la.organization_id", orgId)
    .andWhere("la.user_id", user.id);

  const startDate = toDateOnly(body.startDate as string);
  const endDate = toDateOnly(body.endDate as string);
  if (startDate && endDate) {
    // Overlap: leave intersects [startDate, endDate].
    query = query.where("la.start_date", "<=", endDate).andWhere("la.end_date", ">=", startDate);
  }

  const rows = await query
    .orderBy("la.start_date", "desc")
    .select(
      "la.id",
      "u.emp_code as emp_id",
      "la.user_id as employee_id",
      db.raw("CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')) as employee_name"),
      "la.start_date",
      "la.end_date",
      "la.status",
      "la.days_count as number_of_days",
      "la.is_half_day",
      "la.half_day_type",
      "la.leave_type_id as leave_type",
      "lt.name",
      "la.reason",
    );

  return rows.map((r: any) => {
    // Re-derive emp-monitor's numeric day_type from the half-day shape.
    let day_type = 2; // full day
    if (r.is_half_day) day_type = r.half_day_type === "second_half" ? 3 : 1;

    // emp-monitor exposed `status` as a number and carried a per-day
    // `day_status` JSON array (one {date, status} entry per calendar day of
    // the leave) plus a `leave_status` rollup. EmpCloud tracks status per
    // application, not per day, so every day inherits the application's status
    // code — reproduced here so the field client's parsing stays identical.
    const code = leaveStatusCode(r.status);
    const start = toDateOnly(r.start_date);
    const end = toDateOnly(r.end_date);
    const days = start && end ? eachDate(start, end).map((date) => ({ date, status: code })) : [];
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const d of days) {
      if (d.status === 0) pending++;
      else if (d.status === 1) approved++;
      else if (d.status === 2) rejected++;
    }

    return {
      id: r.id,
      emp_id: r.emp_id,
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      start_date: start,
      end_date: end,
      status: code,
      number_of_days: Number(r.number_of_days),
      day_type,
      leave_type: r.leave_type,
      name: r.name,
      reason: r.reason,
      day_status: JSON.stringify(days),
      leave_status: { pending_leaves: pending, approved_leaves: approved, rejected_leaves: rejected },
    };
  });
}

// ---------------------------------------------------------------------------
// /hrms/field-leave-type — leave types for the org
// ---------------------------------------------------------------------------

export async function getFieldLeaveTypes(body: { organization_id?: unknown }) {
  const orgId = Number(body.organization_id);
  if (!orgId) throw new ValidationError("organization_id is required");
  const db = getDB();

  // emp-monitor returned exactly {id, name, duration, number_of_days,
  // carry_forward} from organization_leave_types. EmpCloud splits these across
  // leave_types (id, name, is_carry_forward) and leave_policies (annual_quota),
  // so we join to reproduce the same key set. `duration` has no EmpCloud
  // equivalent → null (key kept for shape parity).
  const rows = await db("leave_types as lt")
    .leftJoin("leave_policies as lp", function () {
      this.on("lp.leave_type_id", "=", "lt.id").andOn("lp.organization_id", "=", "lt.organization_id");
    })
    .where("lt.organization_id", orgId)
    .andWhere("lt.is_active", true)
    .groupBy("lt.id")
    .orderBy("lt.name", "asc")
    .select("lt.id", "lt.name", "lt.is_carry_forward", db.raw("MAX(lp.annual_quota) as number_of_days"));

  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    duration: null,
    number_of_days: r.number_of_days != null ? Number(r.number_of_days) : 0,
    carry_forward: r.is_carry_forward ? 1 : 0,
  }));
}

// ---------------------------------------------------------------------------
// /hrms/create-field-leaves — apply for leave
// ---------------------------------------------------------------------------

export async function createFieldLeave(body: {
  organization_id?: unknown;
  employee_id?: unknown;
  leave_type?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  reason?: unknown;
  day_type?: unknown;
  timezone?: unknown;
}) {
  const orgId = Number(body.organization_id);
  const user = await resolveOrgUser(orgId, body.employee_id);
  const { is_half_day, half_day_type } = dayTypeToHalfDay(body.day_type);

  const application = await leaveApplicationService.applyLeave(orgId, user.id, {
    leave_type_id: Number(body.leave_type),
    start_date: String(body.start_date),
    end_date: String(body.end_date),
    reason: String(body.reason ?? ""),
    is_half_day,
    half_day_type,
    // days_count is required by the type but recomputed server-side from the
    // date range + the user's week-offs/holidays; this value is ignored.
    days_count: 1,
  });

  return {
    leave: {
      leave_id: application.id,
      number_of_days: Number(application.days_count),
      timezone: (body.timezone as string) ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// /hrms/update-field-leaves — edit a pending leave
// ---------------------------------------------------------------------------

export async function updateFieldLeave(body: {
  organization_id?: unknown;
  employee_id?: unknown;
  leave_id?: unknown;
  leave_type?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  reason?: unknown;
  day_type?: unknown;
}) {
  const orgId = Number(body.organization_id);
  const user = await resolveOrgUser(orgId, body.employee_id);
  const leaveId = Number(body.leave_id);
  if (!leaveId) throw new ValidationError("leave_id is required");
  const { is_half_day, half_day_type } = dayTypeToHalfDay(body.day_type);

  const application = await leaveApplicationService.updateLeave(orgId, user.id, leaveId, {
    leave_type_id: Number(body.leave_type),
    start_date: String(body.start_date),
    end_date: String(body.end_date),
    reason: String(body.reason ?? ""),
    is_half_day,
    half_day_type,
    days_count: 1,
  });

  return {
    leave: {
      leave_id: application.id,
      number_of_days: Number(application.days_count),
    },
  };
}

// ---------------------------------------------------------------------------
// /hrms/delete-field-leaves — cancel a leave
// ---------------------------------------------------------------------------

export async function deleteFieldLeave(body: {
  organization_id?: unknown;
  employee_id?: unknown;
  leave_id?: unknown;
}) {
  const orgId = Number(body.organization_id);
  const user = await resolveOrgUser(orgId, body.employee_id);
  const leaveId = Number(body.leave_id);
  if (!leaveId) throw new ValidationError("leave_id is required");
  await leaveApplicationService.cancelLeave(orgId, user.id, leaveId);
}
