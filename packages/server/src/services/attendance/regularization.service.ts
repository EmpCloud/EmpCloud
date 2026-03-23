// =============================================================================
// EMP CLOUD — Attendance Regularization Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";

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
  params?: { page?: number; perPage?: number; status?: string }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("attendance_regularizations as ar")
    .join("users as u", "ar.user_id", "u.id")
    .where("ar.organization_id", orgId);

  if (params?.status) {
    query = query.where("ar.status", params.status);
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
    .orderBy("ar.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { records, total: Number(count) };
}

export async function approveRegularization(orgId: number, regularizationId: number, approvedBy: number) {
  const db = getDB();
  const reg = await db("attendance_regularizations")
    .where({ id: regularizationId, organization_id: orgId })
    .first();
  if (!reg) throw new NotFoundError("Regularization request");
  if (reg.status !== "pending") throw new ValidationError("Request is already processed");

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
      await trx("attendance_records").where({ id: reg.attendance_id }).update({
        check_in: reg.requested_check_in || undefined,
        check_out: reg.requested_check_out || undefined,
        status: "present",
        updated_at: new Date(),
      });

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

  const query = db("attendance_regularizations")
    .where({ organization_id: orgId, user_id: userId });

  const [{ count }] = await query.clone().count("* as count");
  const records = await query
    .select()
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { records, total: Number(count) };
}
