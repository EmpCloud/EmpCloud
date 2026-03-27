// =============================================================================
// EMP CLOUD — Leave Type Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ConflictError } from "../../utils/errors.js";
import type { CreateLeaveTypeInput, LeaveType } from "@empcloud/shared";

export async function listLeaveTypes(orgId: number): Promise<LeaveType[]> {
  const db = getDB();
  const types = await db("leave_types")
    .where({ organization_id: orgId })
    .orderBy("name", "asc");

  // Normalize boolean fields — MySQL tinyint(1) may return 0/1 instead of true/false
  return types.map((t: any) => ({
    ...t,
    is_paid: !!t.is_paid,
    is_carry_forward: !!t.is_carry_forward,
    is_encashable: !!t.is_encashable,
    requires_approval: !!t.requires_approval,
    is_active: !!t.is_active,
  }));
}

export async function getLeaveType(orgId: number, id: number): Promise<LeaveType> {
  const db = getDB();
  const row = await db("leave_types")
    .where({ id, organization_id: orgId })
    .first();
  if (!row) throw new NotFoundError("Leave type");
  return row;
}

export async function createLeaveType(orgId: number, data: CreateLeaveTypeInput): Promise<LeaveType> {
  const db = getDB();

  const existing = await db("leave_types")
    .where({ organization_id: orgId, code: data.code })
    .first();
  if (existing) throw new ConflictError("Leave type code already exists");

  const [id] = await db("leave_types").insert({
    organization_id: orgId,
    name: data.name,
    code: data.code,
    description: data.description ?? null,
    is_paid: data.is_paid ?? true,
    is_carry_forward: data.is_carry_forward ?? false,
    max_carry_forward_days: data.max_carry_forward_days ?? 0,
    is_encashable: data.is_encashable ?? false,
    requires_approval: data.requires_approval ?? true,
    color: data.color ?? null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return getLeaveType(orgId, id);
}

export async function updateLeaveType(
  orgId: number,
  id: number,
  data: Partial<CreateLeaveTypeInput>,
): Promise<LeaveType> {
  const db = getDB();
  const existing = await db("leave_types")
    .where({ id, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Leave type");

  if (data.code && data.code !== existing.code) {
    const dup = await db("leave_types")
      .where({ organization_id: orgId, code: data.code })
      .whereNot({ id })
      .first();
    if (dup) throw new ConflictError("Leave type code already exists");
  }

  await db("leave_types")
    .where({ id })
    .update({ ...data, updated_at: new Date() });

  return getLeaveType(orgId, id);
}

export async function deleteLeaveType(orgId: number, id: number): Promise<void> {
  const db = getDB();
  const existing = await db("leave_types")
    .where({ id, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Leave type");

  await db("leave_types")
    .where({ id })
    .update({ is_active: false, updated_at: new Date() });
}
