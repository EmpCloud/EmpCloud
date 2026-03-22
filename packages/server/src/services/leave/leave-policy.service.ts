// =============================================================================
// EMP CLOUD — Leave Policy Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";
import type { LeavePolicy } from "@empcloud/shared";

interface CreateLeavePolicyInput {
  leave_type_id: number;
  name: string;
  annual_quota: number;
  accrual_type?: string;
  accrual_rate?: number | null;
  applicable_from_months?: number;
  applicable_gender?: string | null;
  applicable_employment_types?: string | null;
  max_consecutive_days?: number | null;
  min_days_before_application?: number;
}

export async function listLeavePolicies(orgId: number): Promise<LeavePolicy[]> {
  const db = getDB();
  return db("leave_policies")
    .where({ organization_id: orgId })
    .orderBy("name", "asc");
}

export async function getLeavePolicy(orgId: number, id: number): Promise<LeavePolicy> {
  const db = getDB();
  const row = await db("leave_policies")
    .where({ id, organization_id: orgId })
    .first();
  if (!row) throw new NotFoundError("Leave policy");
  return row;
}

export async function createLeavePolicy(orgId: number, data: CreateLeavePolicyInput): Promise<LeavePolicy> {
  const db = getDB();

  const [id] = await db("leave_policies").insert({
    organization_id: orgId,
    leave_type_id: data.leave_type_id,
    name: data.name,
    annual_quota: data.annual_quota,
    accrual_type: data.accrual_type ?? "annual",
    accrual_rate: data.accrual_rate ?? null,
    applicable_from_months: data.applicable_from_months ?? 0,
    applicable_gender: data.applicable_gender ?? null,
    applicable_employment_types: data.applicable_employment_types ?? null,
    max_consecutive_days: data.max_consecutive_days ?? null,
    min_days_before_application: data.min_days_before_application ?? 0,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return getLeavePolicy(orgId, id);
}

export async function updateLeavePolicy(
  orgId: number,
  id: number,
  data: Partial<CreateLeavePolicyInput>,
): Promise<LeavePolicy> {
  const db = getDB();
  const existing = await db("leave_policies")
    .where({ id, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Leave policy");

  await db("leave_policies")
    .where({ id })
    .update({ ...data, updated_at: new Date() });

  return getLeavePolicy(orgId, id);
}

export async function deleteLeavePolicy(orgId: number, id: number): Promise<void> {
  const db = getDB();
  const existing = await db("leave_policies")
    .where({ id, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Leave policy");

  await db("leave_policies")
    .where({ id })
    .update({ is_active: false, updated_at: new Date() });
}
