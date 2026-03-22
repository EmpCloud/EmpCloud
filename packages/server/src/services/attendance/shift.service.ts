// =============================================================================
// EMP CLOUD — Shift Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";
import type { CreateShiftInput } from "@empcloud/shared";

export async function createShift(orgId: number, data: CreateShiftInput) {
  const db = getDB();

  // If this shift is set as default, unset other defaults
  if (data.is_default) {
    await db("shifts")
      .where({ organization_id: orgId, is_default: true })
      .update({ is_default: false, updated_at: new Date() });
  }

  const [id] = await db("shifts").insert({
    organization_id: orgId,
    name: data.name,
    start_time: data.start_time,
    end_time: data.end_time,
    break_minutes: data.break_minutes ?? 0,
    grace_minutes_late: data.grace_minutes_late ?? 0,
    grace_minutes_early: data.grace_minutes_early ?? 0,
    is_night_shift: data.is_night_shift ?? false,
    is_default: data.is_default ?? false,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("shifts").where({ id }).first();
}

export async function updateShift(orgId: number, shiftId: number, data: Partial<CreateShiftInput>) {
  const db = getDB();
  const shift = await db("shifts").where({ id: shiftId, organization_id: orgId }).first();
  if (!shift) throw new NotFoundError("Shift");

  if (data.is_default) {
    await db("shifts")
      .where({ organization_id: orgId, is_default: true })
      .whereNot({ id: shiftId })
      .update({ is_default: false, updated_at: new Date() });
  }

  await db("shifts").where({ id: shiftId }).update({ ...data, updated_at: new Date() });
  return db("shifts").where({ id: shiftId }).first();
}

export async function listShifts(orgId: number) {
  const db = getDB();
  return db("shifts")
    .where({ organization_id: orgId, is_active: true })
    .orderBy("name", "asc");
}

export async function deleteShift(orgId: number, shiftId: number) {
  const db = getDB();
  const shift = await db("shifts").where({ id: shiftId, organization_id: orgId }).first();
  if (!shift) throw new NotFoundError("Shift");

  await db("shifts").where({ id: shiftId }).update({ is_active: false, updated_at: new Date() });
}

export async function assignShift(
  orgId: number,
  data: { user_id: number; shift_id: number; effective_from: string; effective_to?: string | null },
  createdBy: number
) {
  const db = getDB();

  // Verify shift belongs to org
  const shift = await db("shifts").where({ id: data.shift_id, organization_id: orgId }).first();
  if (!shift) throw new NotFoundError("Shift");

  // Verify user belongs to org
  const user = await db("users").where({ id: data.user_id, organization_id: orgId }).first();
  if (!user) throw new NotFoundError("User");

  const [id] = await db("shift_assignments").insert({
    organization_id: orgId,
    user_id: data.user_id,
    shift_id: data.shift_id,
    effective_from: data.effective_from,
    effective_to: data.effective_to || null,
    created_by: createdBy,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("shift_assignments").where({ id }).first();
}

export async function listShiftAssignments(orgId: number, params?: { user_id?: number; shift_id?: number }) {
  const db = getDB();
  let query = db("shift_assignments as sa")
    .join("shifts as s", "sa.shift_id", "s.id")
    .join("users as u", "sa.user_id", "u.id")
    .where("sa.organization_id", orgId)
    .select(
      "sa.*",
      "s.name as shift_name",
      "u.first_name",
      "u.last_name",
      "u.email"
    );

  if (params?.user_id) {
    query = query.where("sa.user_id", params.user_id);
  }
  if (params?.shift_id) {
    query = query.where("sa.shift_id", params.shift_id);
  }

  return query.orderBy("sa.effective_from", "desc");
}
