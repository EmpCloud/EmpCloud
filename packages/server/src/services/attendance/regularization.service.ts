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

export async function submitRegularization(orgId: number, userId: number, data: SubmitRegularizationInput) {
  const db = getDB();

  // Find existing attendance record for the date
  const attendance = await db("attendance_records")
    .where({ organization_id: orgId, user_id: userId, date: data.date })
    .first();

  // Helper: if value looks like a bare time (HH:mm or HH:mm:ss), prefix with the date
  const toTimestamp = (value: string | null | undefined): string | null => {
    if (!value) return null;
    // Already a full datetime / ISO string
    if (value.includes("T") || value.length > 10) return value;
    // Bare time like "09:00" → combine with request date
    return `${data.date}T${value}`;
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
