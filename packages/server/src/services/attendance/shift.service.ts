// =============================================================================
// EMP CLOUD — Shift Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import type { CreateShiftInput, BulkAssignShiftInput, ShiftSwapRequestInput } from "@empcloud/shared";

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

export async function getShift(orgId: number, shiftId: number) {
  const db = getDB();
  const shift = await db("shifts")
    .where({ id: shiftId, organization_id: orgId, is_active: true })
    .first();
  if (!shift) throw new NotFoundError("Shift");
  return shift;
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

  // Rule: Prevent overlapping shift assignments for the same employee
  const overlapQuery = db("shift_assignments")
    .where({ organization_id: orgId, user_id: data.user_id })
    .where("effective_from", "<=", data.effective_to || "9999-12-31");
  if (data.effective_to) {
    overlapQuery.where(function () {
      this.whereNull("effective_to").orWhere("effective_to", ">=", data.effective_from);
    });
  } else {
    overlapQuery.where(function () {
      this.whereNull("effective_to").orWhere("effective_to", ">=", data.effective_from);
    });
  }
  const overlapping = await overlapQuery.first();
  if (overlapping) {
    throw new ValidationError(
      "Employee already has an overlapping shift assignment for this date range",
    );
  }

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

// ---------------------------------------------------------------------------
// Bulk Assign Shifts
// ---------------------------------------------------------------------------

export async function bulkAssignShifts(
  orgId: number,
  data: BulkAssignShiftInput,
  createdBy: number,
) {
  const db = getDB();

  // Verify shift belongs to org
  const shift = await db("shifts").where({ id: data.shift_id, organization_id: orgId }).first();
  if (!shift) throw new NotFoundError("Shift");

  // Verify all users belong to org
  const users = await db("users")
    .where({ organization_id: orgId })
    .whereIn("id", data.user_ids)
    .select("id");

  const foundIds = new Set(users.map((u: any) => u.id));
  const missingIds = data.user_ids.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    throw new ValidationError(`Users not found in organization: ${missingIds.join(", ")}`);
  }

  const rows = data.user_ids.map((userId) => ({
    organization_id: orgId,
    user_id: userId,
    shift_id: data.shift_id,
    effective_from: data.effective_from,
    effective_to: data.effective_to || null,
    created_by: createdBy,
    created_at: new Date(),
    updated_at: new Date(),
  }));

  await db("shift_assignments").insert(rows);

  return { assigned_count: data.user_ids.length, shift_id: data.shift_id };
}

// ---------------------------------------------------------------------------
// Shift Schedule (weekly/monthly view)
// ---------------------------------------------------------------------------

export async function getSchedule(
  orgId: number,
  params: { start_date: string; end_date: string; department_id?: number },
) {
  const db = getDB();

  let usersQuery = db("users")
    .where({ organization_id: orgId, status: 1 })
    .select("id", "first_name", "last_name", "email", "emp_code", "department_id");

  if (params.department_id) {
    usersQuery = usersQuery.where("department_id", params.department_id);
  }

  const users = await usersQuery.orderBy("first_name", "asc");

  const assignments = await db("shift_assignments as sa")
    .join("shifts as s", "sa.shift_id", "s.id")
    .where("sa.organization_id", orgId)
    .where("sa.effective_from", "<=", params.end_date)
    .where(function () {
      this.whereNull("sa.effective_to").orWhere("sa.effective_to", ">=", params.start_date);
    })
    .select(
      "sa.id as assignment_id",
      "sa.user_id",
      "sa.shift_id",
      "sa.effective_from",
      "sa.effective_to",
      "s.name as shift_name",
      "s.start_time",
      "s.end_time",
      "s.is_night_shift",
    );

  // Build a map of user_id -> assignments
  const userAssignments: Record<number, any[]> = {};
  for (const a of assignments) {
    if (!userAssignments[a.user_id]) userAssignments[a.user_id] = [];
    userAssignments[a.user_id].push(a);
  }

  const schedule = users.map((user: any) => ({
    user_id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    emp_code: user.emp_code,
    email: user.email,
    assignments: userAssignments[user.id] || [],
  }));

  return schedule;
}

// ---------------------------------------------------------------------------
// My Schedule
// ---------------------------------------------------------------------------

export async function getMySchedule(orgId: number, userId: number) {
  const db = getDB();
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfNextWeek = new Date(startOfWeek);
  endOfNextWeek.setDate(startOfWeek.getDate() + 13);

  const startStr = startOfWeek.toISOString().split("T")[0];
  const endStr = endOfNextWeek.toISOString().split("T")[0];

  const assignments = await db("shift_assignments as sa")
    .join("shifts as s", "sa.shift_id", "s.id")
    .where("sa.organization_id", orgId)
    .where("sa.user_id", userId)
    .where("sa.effective_from", "<=", endStr)
    .where(function () {
      this.whereNull("sa.effective_to").orWhere("sa.effective_to", ">=", startStr);
    })
    .select(
      "sa.id as assignment_id",
      "sa.shift_id",
      "sa.effective_from",
      "sa.effective_to",
      "s.name as shift_name",
      "s.start_time",
      "s.end_time",
      "s.is_night_shift",
      "s.break_minutes",
    )
    .orderBy("sa.effective_from", "asc");

  return {
    start_date: startStr,
    end_date: endStr,
    assignments,
  };
}

// ---------------------------------------------------------------------------
// Shift Swap Requests
// ---------------------------------------------------------------------------

export async function createSwapRequest(
  orgId: number,
  requesterId: number,
  data: ShiftSwapRequestInput,
) {
  const db = getDB();

  // Verify target employee belongs to org
  const targetUser = await db("users")
    .where({ id: data.target_employee_id, organization_id: orgId })
    .first();
  if (!targetUser) throw new NotFoundError("Target employee");

  // Verify both shift assignments exist and belong to org
  const requesterAssignment = await db("shift_assignments")
    .where({ id: data.shift_assignment_id, organization_id: orgId, user_id: requesterId })
    .first();
  if (!requesterAssignment) throw new NotFoundError("Your shift assignment");

  const targetAssignment = await db("shift_assignments")
    .where({ id: data.target_shift_assignment_id, organization_id: orgId, user_id: data.target_employee_id })
    .first();
  if (!targetAssignment) throw new NotFoundError("Target shift assignment");

  const [id] = await db("shift_swap_requests").insert({
    organization_id: orgId,
    requester_id: requesterId,
    target_employee_id: data.target_employee_id,
    shift_assignment_id: data.shift_assignment_id,
    target_shift_assignment_id: data.target_shift_assignment_id,
    date: data.date,
    reason: data.reason,
    status: "pending",
    created_at: new Date(),
    updated_at: new Date(),
  });

  return db("shift_swap_requests").where({ id }).first();
}

export async function listSwapRequests(
  orgId: number,
  params?: { status?: string },
) {
  const db = getDB();
  let query = db("shift_swap_requests as ssr")
    .where("ssr.organization_id", orgId)
    .join("users as requester", "ssr.requester_id", "requester.id")
    .join("users as target", "ssr.target_employee_id", "target.id")
    .join("shift_assignments as sa1", "ssr.shift_assignment_id", "sa1.id")
    .join("shifts as s1", "sa1.shift_id", "s1.id")
    .join("shift_assignments as sa2", "ssr.target_shift_assignment_id", "sa2.id")
    .join("shifts as s2", "sa2.shift_id", "s2.id")
    .select(
      "ssr.*",
      "requester.first_name as requester_first_name",
      "requester.last_name as requester_last_name",
      "target.first_name as target_first_name",
      "target.last_name as target_last_name",
      "s1.name as requester_shift_name",
      "s2.name as target_shift_name",
    );

  if (params?.status) {
    query = query.where("ssr.status", params.status);
  }

  return query.orderBy("ssr.created_at", "desc");
}

export async function approveSwapRequest(orgId: number, requestId: number, approvedBy: number) {
  const db = getDB();
  const request = await db("shift_swap_requests")
    .where({ id: requestId, organization_id: orgId, status: "pending" })
    .first();
  if (!request) throw new NotFoundError("Swap request");

  // Perform the swap: exchange shift_ids between the two assignments
  const assignment1 = await db("shift_assignments").where({ id: request.shift_assignment_id }).first();
  const assignment2 = await db("shift_assignments").where({ id: request.target_shift_assignment_id }).first();

  if (!assignment1 || !assignment2) throw new NotFoundError("Shift assignment");

  await db.transaction(async (trx) => {
    await trx("shift_assignments")
      .where({ id: assignment1.id })
      .update({ shift_id: assignment2.shift_id, updated_at: new Date() });

    await trx("shift_assignments")
      .where({ id: assignment2.id })
      .update({ shift_id: assignment1.shift_id, updated_at: new Date() });

    await trx("shift_swap_requests")
      .where({ id: requestId })
      .update({ status: "approved", approved_by: approvedBy, updated_at: new Date() });
  });

  return db("shift_swap_requests").where({ id: requestId }).first();
}

export async function rejectSwapRequest(orgId: number, requestId: number, rejectedBy: number) {
  const db = getDB();
  const request = await db("shift_swap_requests")
    .where({ id: requestId, organization_id: orgId, status: "pending" })
    .first();
  if (!request) throw new NotFoundError("Swap request");

  await db("shift_swap_requests")
    .where({ id: requestId })
    .update({ status: "rejected", approved_by: rejectedBy, updated_at: new Date() });

  return db("shift_swap_requests").where({ id: requestId }).first();
}
