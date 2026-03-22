// =============================================================================
// EMP CLOUD — Comp-Off Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors.js";

interface CompOffRequest {
  id: number;
  organization_id: number;
  user_id: number;
  worked_date: string;
  expires_on: string;
  reason: string;
  days: number;
  status: string;
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function requestCompOff(
  orgId: number,
  userId: number,
  data: { worked_date: string; expires_on: string; reason: string; days?: number },
): Promise<CompOffRequest> {
  const db = getDB();

  // Check for duplicate request on same date
  const existing = await db("comp_off_requests")
    .where({ organization_id: orgId, user_id: userId, worked_date: data.worked_date })
    .whereNot({ status: "rejected" })
    .first();

  if (existing) {
    throw new ValidationError("Comp-off request already exists for this date");
  }

  const [id] = await db("comp_off_requests").insert({
    organization_id: orgId,
    user_id: userId,
    worked_date: data.worked_date,
    expires_on: data.expires_on,
    reason: data.reason,
    days: data.days ?? 1,
    status: "pending",
    created_at: new Date(),
    updated_at: new Date(),
  });

  return getCompOff(orgId, id);
}

export async function listCompOffs(
  orgId: number,
  params: { page?: number; perPage?: number; userId?: number; status?: string },
) {
  const db = getDB();
  const page = params.page || 1;
  const perPage = params.perPage || 20;

  let query = db("comp_off_requests").where({ organization_id: orgId });
  if (params.userId) query = query.where({ user_id: params.userId });
  if (params.status) query = query.where({ status: params.status });

  const [{ count }] = await query.clone().count("* as count");
  const requests = await query
    .select()
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { requests, total: Number(count) };
}

export async function getCompOff(orgId: number, id: number): Promise<CompOffRequest> {
  const db = getDB();
  const row = await db("comp_off_requests")
    .where({ id, organization_id: orgId })
    .first();
  if (!row) throw new NotFoundError("Comp-off request");
  return row;
}

export async function approveCompOff(
  orgId: number,
  approverId: number,
  id: number,
): Promise<CompOffRequest> {
  const db = getDB();

  const request = await db("comp_off_requests")
    .where({ id, organization_id: orgId })
    .first();
  if (!request) throw new NotFoundError("Comp-off request");

  if (request.status !== "pending") {
    throw new ValidationError("Only pending requests can be approved");
  }

  // Verify the approver has HR role
  const approver = await db("users").where({ id: approverId }).first();
  const isHR = approver && ["hr_admin", "hr_manager", "org_admin"].includes(approver.role);
  const isManager =
    approver &&
    (await db("users")
      .where({ id: request.user_id, reporting_manager_id: approverId })
      .first());

  if (!isHR && !isManager) {
    throw new ForbiddenError("Not authorized to approve this request");
  }

  await db("comp_off_requests")
    .where({ id })
    .update({
      status: "approved",
      approved_by: approverId,
      approved_at: new Date(),
      updated_at: new Date(),
    });

  // Credit comp-off balance to user
  // Find or create a comp-off leave type balance
  const compOffType = await db("leave_types")
    .where({ organization_id: orgId, code: "COMP_OFF" })
    .first();

  if (compOffType) {
    const year = new Date(request.worked_date).getFullYear();
    const balance = await db("leave_balances")
      .where({
        organization_id: orgId,
        user_id: request.user_id,
        leave_type_id: compOffType.id,
        year,
      })
      .first();

    if (balance) {
      await db("leave_balances")
        .where({ id: balance.id })
        .update({
          total_allocated: Number(balance.total_allocated) + Number(request.days),
          balance: Number(balance.balance) + Number(request.days),
          updated_at: new Date(),
        });
    } else {
      await db("leave_balances").insert({
        organization_id: orgId,
        user_id: request.user_id,
        leave_type_id: compOffType.id,
        year,
        total_allocated: Number(request.days),
        total_used: 0,
        total_carry_forward: 0,
        balance: Number(request.days),
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  return getCompOff(orgId, id);
}

export async function rejectCompOff(
  orgId: number,
  approverId: number,
  id: number,
  reason?: string,
): Promise<CompOffRequest> {
  const db = getDB();

  const request = await db("comp_off_requests")
    .where({ id, organization_id: orgId })
    .first();
  if (!request) throw new NotFoundError("Comp-off request");

  if (request.status !== "pending") {
    throw new ValidationError("Only pending requests can be rejected");
  }

  await db("comp_off_requests")
    .where({ id })
    .update({
      status: "rejected",
      approved_by: approverId,
      rejection_reason: reason ?? null,
      updated_at: new Date(),
    });

  return getCompOff(orgId, id);
}
