// =============================================================================
// EMP CLOUD — Attendance Regularization Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors.js";

interface SubmitRegularizationInput {
  date: string;
  requested_check_in?: string | null;
  requested_check_out?: string | null;
  reason: string;
}

/**
 * Resolve the timezone an employee's wall-clock attendance times are in:
 * their location's timezone, then the org's, then UTC. Mirrors the check-in
 * pipeline (attendance.service.ts) so a regularized time is stored on the
 * same UTC basis as a biometric punch — otherwise the grid (which renders
 * stored timestamps back in the location TZ) shows the requested time
 * shifted by the TZ offset (e.g. a 3:00 PM IST request displayed as 8:30 PM).
 */
async function resolveUserTz(
  db: ReturnType<typeof getDB>,
  orgId: number,
  userId: number,
): Promise<string> {
  const u = await db("users").where({ id: userId }).select("location_id").first();
  if (u?.location_id) {
    const loc = await db("organization_locations")
      .where({ id: u.location_id })
      .select("timezone")
      .first();
    if (loc?.timezone) return loc.timezone;
  }
  const org = await db("organizations").where({ id: orgId }).select("timezone").first();
  if (org?.timezone) return org.timezone;
  return "UTC";
}

/**
 * Convert a wall-clock datetime interpreted in `tz` into the real instant it
 * represents, returned as a JS `Date`.
 *
 * Why a Date and NOT a pre-formatted "YYYY-MM-DD HH:mm:ss" UTC string:
 * mysql2 interprets DATETIME columns in the CONNECTION timezone (default
 * "local" = the Node process's tz). Prod runs in UTC, but a dev box in IST
 * does not. A pre-formatted UTC string written verbatim is then RE-READ in
 * the connection tz, double-shifting it (a 22:00 IST request stored as the
 * string "16:30" came back as 11:00). Passing a Date lets mysql2 do the tz
 * conversion symmetrically on write AND read, so the stored instant round-
 * trips correctly on any server tz — exactly how biometric `check_in` Dates
 * already behave.
 *
 * Accepts "YYYY-MM-DDTHH:mm[:ss]" or "YYYY-MM-DD HH:mm[:ss]". A value that
 * already carries a zone ("Z" or an explicit ±HH:MM offset) is a real instant
 * already and is parsed as-is — never double-shifted.
 */
function wallClockToInstant(value: string, tz: string): Date | null {
  const v = value.trim();
  const timePart = v.length > 11 ? v.slice(11) : "";
  if (/[zZ]$/.test(v) || /[+-]\d{2}:?\d{2}$/.test(timePart)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = v.replace("T", " ").match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null; // unrecognised shape — skip rather than corrupt it
  const [, y, mo, d, h, mi, s] = m;
  const asUtcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  // What wall-clock does that UTC instant show in tz? The gap is tz's offset.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(asUtcMs));
  const g = (t: string) => parseInt(parts.find((p) => p.type === t)?.value || "0", 10);
  let hh = g("hour");
  if (hh === 24) hh = 0;
  const tzAsUtcMs = Date.UTC(g("year"), g("month") - 1, g("day"), hh, g("minute"), g("second"));
  const offsetMs = tzAsUtcMs - asUtcMs; // tz ahead of UTC by this many ms
  return new Date(asUtcMs - offsetMs);
}

export async function submitRegularization(orgId: number, userId: number, data: SubmitRegularizationInput) {
  const db = getDB();

  // Find existing attendance record for the date
  const attendance = await db("attendance_records")
    .where({ organization_id: orgId, user_id: userId, date: data.date })
    .first();

  // The requested time is wall-clock in the employee's location/org timezone.
  // Convert it to UTC before storing so it lines up with biometric punches
  // (and renders correctly on the grid). Bare "HH:mm[:ss]" values are
  // anchored to the request date first.
  const tz = await resolveUserTz(db, orgId, userId);
  const toTimestamp = (value: string | null | undefined): Date | null => {
    if (!value) return null;
    let v = value.trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) v = `${data.date}T${v}`;
    return wallClockToInstant(v, tz);
  };

  const [id] = await db("attendance_regularizations").insert({
    organization_id: orgId,
    user_id: userId,
    attendance_id: attendance?.id || null,
    date: data.date,
    original_check_in: attendance?.check_in || null,
    original_check_out: attendance?.check_out || null,
    requested_check_in: toTimestamp(data.requested_check_in),
    requested_check_out: toTimestamp(data.requested_check_out),
    reason: data.reason,
    status: "pending",
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("attendance_regularizations").where({ id }).first();
}

export async function listRegularizations(
  orgId: number,
  params?: { page?: number; perPage?: number; status?: string; userIds?: number[]; locationId?: number; search?: string }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("attendance_regularizations as ar")
    .join("users as u", "ar.user_id", "u.id")
    .leftJoin("organization_locations as loc", "u.location_id", "loc.id")
    .leftJoin("organizations as org", "ar.organization_id", "org.id")
    .where("ar.organization_id", orgId);

  if (params?.status) {
    query = query.where("ar.status", params.status);
  }
  // Team scoping: undefined => no scope (org-wide); empty array => 0 rows;
  // populated array => whereIn.
  if (Array.isArray(params?.userIds)) {
    if (params.userIds.length === 0) {
      query = query.where(db.raw("1 = 0"));
    } else {
      query = query.whereIn("ar.user_id", params.userIds);
    }
  }
  if (params?.locationId) {
    query = query.where("u.location_id", params.locationId);
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
  const records = await query
    .select(
      "ar.*",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code",
      "loc.name as location_name",
      "loc.timezone as location_timezone",
      "org.timezone as organization_timezone",
    )
    .orderBy("ar.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { records, total: Number(count) };
}

/** Read a single regularization row scoped to the org. Used by the approve
 *  route to enforce team-scope on _team-only callers. */
export async function getRegularization(orgId: number, regularizationId: number) {
  const db = getDB();
  return db("attendance_regularizations")
    .where({ id: regularizationId, organization_id: orgId })
    .first();
}

export async function approveRegularization(orgId: number, regularizationId: number, approvedBy: number) {
  const db = getDB();
  const reg = await db("attendance_regularizations")
    .where({ id: regularizationId, organization_id: orgId })
    .first();
  if (!reg) throw new NotFoundError("Regularization request");
  if (reg.status !== "pending") throw new ValidationError("Request is already processed");

  // Block self-approval — even a manager / org_admin cannot approve their own
  // regularization request. Mirrors the leave-application policy. Force a
  // second-set-of-eyes signoff.
  if (Number(reg.user_id) === Number(approvedBy)) {
    throw new ForbiddenError("Cannot approve your own regularization request");
  }

  await db.transaction(async (trx) => {
    // Update regularization status
    await trx("attendance_regularizations").where({ id: regularizationId }).update({
      status: "approved",
      approved_by: approvedBy,
      approved_at: new Date(),
      updated_at: new Date(),
    });

    // Update or create attendance record
    if (reg.attendance_id) {
      // #1371 — Knex 3.x throws on undefined in update(). Build the object
      // conditionally so only fields the user actually regularized are touched.
      const attendanceUpdates: Record<string, any> = {
        status: "present",
        updated_at: new Date(),
      };
      if (reg.requested_check_in != null) {
        attendanceUpdates.check_in = reg.requested_check_in;
      }
      if (reg.requested_check_out != null) {
        attendanceUpdates.check_out = reg.requested_check_out;
      }
      await trx("attendance_records").where({ id: reg.attendance_id }).update(attendanceUpdates);

      // Recalculate worked minutes
      if (reg.requested_check_in && reg.requested_check_out) {
        const checkIn = new Date(reg.requested_check_in);
        const checkOut = new Date(reg.requested_check_out);
        const workedMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
        await trx("attendance_records").where({ id: reg.attendance_id }).update({
          worked_minutes: workedMinutes,
        });
      }
    } else {
      // Create new attendance record
      await trx("attendance_records").insert({
        organization_id: orgId,
        user_id: reg.user_id,
        date: reg.date,
        check_in: reg.requested_check_in || null,
        check_out: reg.requested_check_out || null,
        check_in_source: "manual",
        check_out_source: reg.requested_check_out ? "manual" : null,
        status: "present",
        worked_minutes: reg.requested_check_in && reg.requested_check_out
          ? Math.round((new Date(reg.requested_check_out).getTime() - new Date(reg.requested_check_in).getTime()) / 60000)
          : null,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  });

  return db("attendance_regularizations").where({ id: regularizationId }).first();
}

export async function rejectRegularization(
  orgId: number,
  regularizationId: number,
  approvedBy: number,
  rejectionReason?: string
) {
  const db = getDB();
  const reg = await db("attendance_regularizations")
    .where({ id: regularizationId, organization_id: orgId })
    .first();
  if (!reg) throw new NotFoundError("Regularization request");
  if (reg.status !== "pending") throw new ValidationError("Request is already processed");

  // Block self-rejection — symmetric with the approve path.
  if (Number(reg.user_id) === Number(approvedBy)) {
    throw new ForbiddenError("Cannot reject your own regularization request");
  }

  await db("attendance_regularizations").where({ id: regularizationId }).update({
    status: "rejected",
    approved_by: approvedBy,
    approved_at: new Date(),
    rejection_reason: rejectionReason || null,
    updated_at: new Date(),
  });

  return db("attendance_regularizations").where({ id: regularizationId }).first();
}

/**
 * Delete (withdraw) a regularization request. Only PENDING requests can be
 * removed — once approved/rejected the decision is part of the attendance
 * record's history. The owner may delete their own; privileged roles (HR /
 * attendance:manage) may delete anyone's pending request.
 */
export async function deleteRegularization(
  orgId: number,
  regularizationId: number,
  requesterId: number,
  isPrivileged: boolean,
) {
  const db = getDB();
  const reg = await db("attendance_regularizations")
    .where({ id: regularizationId, organization_id: orgId })
    .first();
  if (!reg) throw new NotFoundError("Regularization request");
  if (!isPrivileged && Number(reg.user_id) !== Number(requesterId)) {
    throw new ForbiddenError("You can only delete your own regularization requests");
  }
  if (reg.status !== "pending") {
    throw new ValidationError("Only pending requests can be deleted");
  }
  await db("attendance_regularizations").where({ id: regularizationId }).del();
  return { id: regularizationId, deleted: true };
}

export async function getMyRegularizations(
  orgId: number,
  userId: number,
  params?: { page?: number; perPage?: number }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  const query = db("attendance_regularizations as ar")
    .join("users as u", "ar.user_id", "u.id")
    .leftJoin("organization_locations as loc", "u.location_id", "loc.id")
    .leftJoin("organizations as org", "ar.organization_id", "org.id")
    .where({ "ar.organization_id": orgId, "ar.user_id": userId });

  const [{ count }] = await query.clone().count("* as count");
  const records = await query
    .select(
      "ar.*",
      "loc.name as location_name",
      "loc.timezone as location_timezone",
      "org.timezone as organization_timezone",
    )
    .orderBy("ar.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { records, total: Number(count) };
}
