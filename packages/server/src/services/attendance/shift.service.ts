// =============================================================================
// EMP CLOUD — Shift Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import type { CreateShiftInput, BulkAssignShiftInput, ShiftSwapRequestInput, UpdateShiftAssignmentInput } from "@empcloud/shared";

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
    working_days: data.working_days ?? "1,2,3,4,5",
    half_days: data.half_days ?? "",
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

  // #1957 — guard the partial-update case: a PATCH that only flips one of
  // (is_default, is_night_shift) wouldn't be caught by the validator's
  // both-fields-present refine, but combined with the existing row's value
  // could still end up with a shift that's both default AND night.
  const willBeDefault = data.is_default ?? !!shift.is_default;
  const willBeNight = data.is_night_shift ?? !!shift.is_night_shift;
  if (willBeDefault && willBeNight) {
    throw new ValidationError("A shift cannot be both the default shift and a night shift");
  }

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
  // #67 — Ensure the org has a "Week-off" sentinel shift so the Shift
  // Schedule UI's Edit Assignment modal can offer it as an option. Created
  // lazily on first list so existing orgs don't need a backfill step.
  await getOrCreateWeekoffShift(orgId);
  return db("shifts")
    .where({ organization_id: orgId, is_active: true })
    .orderBy("name", "asc");
}

/**
 * Resolve the per-org "Week-off" sentinel shift, creating it on first use.
 *
 * Modelled as a regular row in `shifts` with `is_weekoff=true` and zero
 * start/end times so the existing shift_assignments FK and join semantics
 * keep working unchanged. The Shift Schedule UI surfaces this row as a
 * distinct "Week-off" option in the Edit Assignment modal; assigning it
 * to a sub-range carves out a weekoff day while the surrounding shift
 * assignment is preserved by the existing sub-range split logic in
 * updateShiftAssignment.
 *
 * Idempotent: re-uses the existing row if one is found.
 */
export async function getOrCreateWeekoffShift(orgId: number) {
  const db = getDB();
  const existing = await db("shifts")
    .where({ organization_id: orgId, is_weekoff: true })
    .first();
  if (existing) {
    // Self-heal: an admin who hit "Delete shift" on the sentinel via the
    // generic shifts UI (the soft-delete sets is_active=false) would
    // otherwise lock the Mark-as-Week-off toggle out for the whole org
    // until the row was manually flipped back. Reactivate on read so the
    // toggle never goes dead.
    if (!existing.is_active) {
      await db("shifts")
        .where({ id: existing.id })
        .update({ is_active: true, updated_at: new Date() });
      return { ...existing, is_active: true };
    }
    return existing;
  }

  const [id] = await db("shifts").insert({
    organization_id: orgId,
    name: "Week-off",
    start_time: "00:00:00",
    end_time: "00:00:00",
    break_minutes: 0,
    grace_minutes_late: 0,
    grace_minutes_early: 0,
    is_night_shift: false,
    is_default: false,
    // The sentinel doesn't have a working-days CSV in the usual sense;
    // an empty string means "no working days" which the renderer treats
    // as Off regardless. Belt-and-braces alongside the is_weekoff flag.
    working_days: "",
    half_days: "",
    is_weekoff: true,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("shifts").where({ id }).first();
}

export async function deleteShift(orgId: number, shiftId: number) {
  const db = getDB();
  const shift = await db("shifts").where({ id: shiftId, organization_id: orgId }).first();
  if (!shift) throw new NotFoundError("Shift");

  // The "Week-off" sentinel is part of the Edit-Assignment UX -- soft-
  // deleting it would disable the Mark-as-Week-off toggle for the whole
  // org until someone manually reactivates. Refuse the delete (a future
  // listShifts call would self-heal it anyway via
  // getOrCreateWeekoffShift, but the explicit error here is a clearer
  // signal to admins that this row isn't user-deletable).
  if (shift.is_weekoff) {
    throw new ValidationError(
      "The Week-off shift is a system-managed row and cannot be deleted.",
    );
  }

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

  // Auto-end any overlapping open-ended assignments for this employee
  const newFrom = data.effective_from;
  const endDate = new Date(newFrom);
  endDate.setDate(endDate.getDate() - 1);
  const endStr = endDate.toISOString().split("T")[0];

  await db("shift_assignments")
    .where({ organization_id: orgId, user_id: data.user_id })
    .whereRaw("DATE(effective_from) <= ?", [newFrom])
    .where(function () {
      this.whereNull("effective_to").orWhereRaw("DATE(effective_to) >= ?", [newFrom]);
    })
    .update({ effective_to: endStr, updated_at: new Date() });

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
// Update Shift Assignment
// ---------------------------------------------------------------------------

export async function updateShiftAssignment(
  orgId: number,
  assignmentId: number,
  data: UpdateShiftAssignmentInput,
) {
  const db = getDB();

  const assignment = await db("shift_assignments")
    .where({ id: assignmentId, organization_id: orgId })
    .first();
  if (!assignment) throw new NotFoundError("Shift assignment");

  // If changing shift, verify new shift belongs to org
  if (data.shift_id && data.shift_id !== assignment.shift_id) {
    const shift = await db("shifts").where({ id: data.shift_id, organization_id: orgId, is_active: true }).first();
    if (!shift) throw new NotFoundError("Shift");
  }

  const updates: Record<string, any> = { updated_at: new Date() };
  if (data.shift_id !== undefined) updates.shift_id = data.shift_id;
  if (data.effective_from !== undefined) updates.effective_from = data.effective_from;
  if (data.effective_to !== undefined) updates.effective_to = data.effective_to;

  // ── Sub-range override split ────────────────────────────────────────────
  // When an admin clicks a single day in the schedule grid and saves the
  // edit modal, the request lands here as a PUT that shrinks effective_from
  // / effective_to to a tighter sub-range of the original assignment.
  // Without splitting, the naive update below would mutate the row in
  // place and silently destroy the surrounding tail dates — May 21 becomes
  // the override but [05-22, NULL] from the original bulk assignment is
  // gone, and the rest of the week visibly changes because other
  // overlapping assignments now win the find() race in the frontend.
  //
  // Detect that shape and split into three rows: left tail (old shift),
  // the override itself (whatever shift the PUT selected, new dates),
  // right tail (old shift, possibly open-ended).
  //
  // This fires whether the picked shift is the same or different from the
  // old shift. Same-shift edits are unusual (why click into the modal
  // just to re-pick the same shift?) but the user's intent when clicking
  // a single cell is always "this day's shift, leave the rest" — the
  // split preserves that intent regardless of the shift dropdown value.
  // Genuine "shorten the assignment" use cases should use DELETE on the
  // right tail or DELETE the whole assignment, not this endpoint.
  const oldFromStr = toDateString(assignment.effective_from);
  const oldToStr = assignment.effective_to ? toDateString(assignment.effective_to) : null;
  const newFromStr = data.effective_from !== undefined ? data.effective_from : oldFromStr;
  const newToStr =
    data.effective_to !== undefined ? (data.effective_to || null) : oldToStr;

  const shrinkingLeft = newFromStr > oldFromStr;
  const shrinkingRight =
    newToStr !== null && (oldToStr === null || newToStr < oldToStr);

  if (shrinkingLeft || shrinkingRight) {
    await db.transaction(async (trx) => {
      if (shrinkingLeft) {
        await trx("shift_assignments").insert({
          organization_id: orgId,
          user_id: assignment.user_id,
          shift_id: assignment.shift_id,
          effective_from: oldFromStr,
          effective_to: shiftPreviousDay(newFromStr),
          created_by: assignment.created_by,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
      if (shrinkingRight) {
        await trx("shift_assignments").insert({
          organization_id: orgId,
          user_id: assignment.user_id,
          shift_id: assignment.shift_id,
          effective_from: shiftNextDay(newToStr!),
          effective_to: oldToStr,
          created_by: assignment.created_by,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
      await trx("shift_assignments").where({ id: assignmentId }).update(updates);
    });
  } else {
    await db("shift_assignments").where({ id: assignmentId }).update(updates);
  }

  return db("shift_assignments as sa")
    .join("shifts as s", "sa.shift_id", "s.id")
    .join("users as u", "sa.user_id", "u.id")
    .where("sa.id", assignmentId)
    .select("sa.*", "s.name as shift_name", "u.first_name", "u.last_name", "u.email")
    .first();
}

function toDateString(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  // mysql2 returns DATE columns as a JS Date at midnight LOCAL time.
  // toISOString() would shift it by the TZ offset and silently move the
  // day backward in IST (and forward in time zones west of UTC), which
  // would make the left/right tails of the sub-range split land on the
  // wrong day. Use the local-component accessors instead.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function shiftPreviousDay(yyyyMmDd: string): string {
  const d = new Date(yyyyMmDd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function shiftNextDay(yyyyMmDd: string): string {
  const d = new Date(yyyyMmDd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Delete Shift Assignment
// ---------------------------------------------------------------------------

export async function deleteShiftAssignment(orgId: number, assignmentId: number) {
  const db = getDB();

  const assignment = await db("shift_assignments")
    .where({ id: assignmentId, organization_id: orgId })
    .first();
  if (!assignment) throw new NotFoundError("Shift assignment");

  await db("shift_assignments").where({ id: assignmentId }).delete();
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

  // Auto-end any overlapping open-ended assignments for these employees
  const newFrom = data.effective_from;
  const endDate = new Date(newFrom);
  endDate.setDate(endDate.getDate() - 1);
  const endStr = endDate.toISOString().split("T")[0];

  await db("shift_assignments")
    .where({ organization_id: orgId })
    .whereIn("user_id", data.user_ids)
    .whereRaw("DATE(effective_from) <= ?", [newFrom])
    .where(function () {
      this.whereNull("effective_to").orWhereRaw("DATE(effective_to) >= ?", [newFrom]);
    })
    .update({ effective_to: endStr, updated_at: new Date() });

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
    .whereRaw("DATE(sa.effective_from) <= ?", [params.end_date])
    .where(function () {
      this.whereNull("sa.effective_to").orWhereRaw("DATE(sa.effective_to) >= ?", [params.start_date]);
    })
    // Drop bogus rows where effective_to < effective_from (artifact of
    // an older sub-range split bug). Same guard as attendance grid.
    .whereRaw("(sa.effective_to IS NULL OR DATE(sa.effective_to) >= DATE(sa.effective_from))")
    // "Latest intent wins" -- the .find() in the FE cell render picks
    // the first array element matching the date. Order by most recently
    // created so newer assignments override older overlapping ones, and
    // the Attendance Grid + Shift Schedule + My Schedule all agree on
    // which assignment wins for any (user, date).
    .orderBy("sa.created_at", "desc")
    .orderBy("sa.id", "desc")
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
      "s.working_days",
      // #67 — Surface the weekoff flag so the schedule grid can render an
      // "Off" pill for the cell instead of the shift name.
      "s.is_weekoff",
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
    .whereRaw("DATE(sa.effective_from) <= ?", [endStr])
    .where(function () {
      this.whereNull("sa.effective_to").orWhereRaw("DATE(sa.effective_to) >= ?", [startStr]);
    })
    // Drop bogus rows where effective_to < effective_from, same guard
    // as the team-schedule and attendance-grid reads.
    .whereRaw("(sa.effective_to IS NULL OR DATE(sa.effective_to) >= DATE(sa.effective_from))")
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
      "s.working_days",
      // #67 — Same Off-pill rendering applies on the employee's own
      // schedule view, so surface the flag here too.
      "s.is_weekoff",
    )
    // "Latest intent wins" -- order so the most recently created
    // assignment is the first one the FE's .find() matches for any
    // overlapping date.
    .orderBy("sa.created_at", "desc")
    .orderBy("sa.id", "desc");

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
