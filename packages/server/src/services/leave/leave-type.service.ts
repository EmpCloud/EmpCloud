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

/**
 * Return leave types that have at least one active policy applicable to the
 * given user. A policy applies when its `applicable_gender` is NULL/empty
 * (everyone) or matches the user's `gender` (case-insensitive). Used by the
 * employee self-service dashboard so a male employee does not see Maternity,
 * a female employee does not see Paternity, etc.
 */
export async function listLeaveTypesForUser(
  orgId: number,
  userId: number,
): Promise<LeaveType[]> {
  const db = getDB();
  const user = await db("users")
    .where({ id: userId, organization_id: orgId })
    .select("gender")
    .first();
  const userGender = (user?.gender ?? "").toString().toLowerCase() || null;

  const rows = await db("leave_types")
    .leftJoin("leave_policies", function () {
      this.on("leave_policies.leave_type_id", "=", "leave_types.id").andOn(
        "leave_policies.organization_id",
        "=",
        "leave_types.organization_id",
      );
    })
    .where("leave_types.organization_id", orgId)
    .andWhere((qb) => {
      // Either the type has no policy at all (legacy data) — keep it visible —
      // or it has at least one active policy whose gender constraint allows
      // this user.
      qb.whereNull("leave_policies.id").orWhere((q2) => {
        q2.where("leave_policies.is_active", true).andWhere((q3) => {
          q3.whereNull("leave_policies.applicable_gender").orWhere(
            "leave_policies.applicable_gender",
            "",
          );
          if (userGender) {
            q3.orWhereRaw("LOWER(leave_policies.applicable_gender) = ?", [userGender]);
          }
        });
      });
    })
    .select("leave_types.*")
    .groupBy("leave_types.id")
    .orderBy("leave_types.name", "asc");

  return rows.map((t: any) => ({
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

  // #1614 — Create the type and a matching default policy in one transaction
  // so the type is always usable. Previously the form let HR create a type
  // without a policy; the type would appear in the dropdown with 0
  // allocated, applyLeave (#1610) would reject every request, and HR had to
  // remember to add a policy as a separate step.
  const id = await db.transaction(async (trx) => {
    const [typeId] = await trx("leave_types").insert({
      organization_id: orgId,
      name: data.name,
      code: data.code,
      description: data.description ?? null,
      is_paid: data.is_paid ?? true,
      is_carry_forward: data.is_carry_forward ?? false,
      max_carry_forward_days: data.max_carry_forward_days ?? 0,
      is_encashable: data.is_encashable ?? false,
      requires_approval: data.requires_approval ?? true,
      allowed_during_probation: data.allowed_during_probation ?? false,
      color: data.color ?? null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // #1614 — annual_quota is required by createLeaveTypeSchema (so the
    // route always supplies it), but a few internal/test callers invoke the
    // service directly without it — fall back to 12 in that case so the
    // notNullable column is satisfied and the type is still usable.
    const quota = Number(data.annual_quota ?? 12);
    await trx("leave_policies").insert({
      organization_id: orgId,
      leave_type_id: typeId,
      name: `${data.name} Policy`,
      annual_quota: quota,
      accrual_type: "annual",
      applicable_from_months: 0,
      min_days_before_application: 0,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return typeId;
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

  // #1614 — annual_quota lives on leave_policies, not leave_types. The shared
  // updateLeaveTypeSchema is .partial() of createLeaveTypeSchema (which now
  // includes annual_quota), so accept it through the validator but never
  // pass it to the leave_types UPDATE — Knex would crash with "Unknown
  // column 'annual_quota'".
  const { annual_quota: _ignoredQuota, ...typeColumns } = data as typeof data & { annual_quota?: number };
  void _ignoredQuota;

  await db("leave_types")
    .where({ id })
    .update({ ...typeColumns, updated_at: new Date() });

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

// #1362 — Reactivate a deactivated leave type
export async function reactivateLeaveType(orgId: number, id: number): Promise<LeaveType> {
  const db = getDB();
  const existing = await db("leave_types")
    .where({ id, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Leave type");

  await db("leave_types")
    .where({ id })
    .update({ is_active: true, updated_at: new Date() });

  return getLeaveType(orgId, id);
}
