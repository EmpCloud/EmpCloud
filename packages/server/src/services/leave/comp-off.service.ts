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

  // Normalize worked_date to YYYY-MM-DD
  const workedDate = new Date(data.worked_date).toISOString().slice(0, 10);

  // Check for duplicate request on same date (allow re-request only if previous was rejected)
  const existing = await db("comp_off_requests")
    .where({ organization_id: orgId, user_id: userId })
    .whereRaw("DATE(worked_date) = ?", [workedDate])
    .whereIn("status", ["pending", "approved"])
    .first();

  if (existing) {
    throw new ValidationError(
      existing.status === "pending"
        ? "A comp-off request for this date is already pending approval"
        : "A comp-off request for this date has already been approved"
    );
  }

  const [id] = await db("comp_off_requests").insert({
    organization_id: orgId,
    user_id: userId,
    worked_date: workedDate,
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

  let countQuery = db("comp_off_requests").where({ organization_id: orgId });
  if (params.userId) countQuery = countQuery.where({ user_id: params.userId });
  if (params.status) countQuery = countQuery.where({ status: params.status });

  // #1932 — admin/HR view rendered "User #<id>" because the request rows
  // weren't joined with users; surface first_name / last_name / email so the
  // pending-approvals table can show real names.
  let query = db("comp_off_requests as r")
    .leftJoin("users as u", "r.user_id", "u.id")
    .where("r.organization_id", orgId);
  if (params.userId) query = query.where("r.user_id", params.userId);
  if (params.status) query = query.where("r.status", params.status);

  const [{ count }] = await countQuery.count("* as count");
  const requests = await query
    .select(
      "r.*",
      "u.first_name as user_first_name",
      "u.last_name as user_last_name",
      "u.email as user_email",
    )
    .orderBy("r.created_at", "desc")
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
  const isHR = approver && ["hr_admin", "org_admin"].includes(approver.role);
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

// #1933 — admin credit/debit of an employee's comp-off balance without
// going through the request-approve flow (e.g. carry-forward at year start,
// one-off goodwill grant, correcting a stale balance). Days can be negative
// to debit. Creates the COMP_OFF leave_type row on demand if the org is
// missing one, mirroring the behaviour of approveCompOff.
export async function adjustCompOffBalance(
  orgId: number,
  targetUserId: number,
  days: number,
  // `reason` is captured by the route audit log; the leave_balances table
  // has no remarks column, so we don't persist it on the row itself.
  _reason?: string,
): Promise<{ balance: number; total_allocated: number; year: number }> {
  if (!Number.isFinite(days) || days === 0) {
    throw new ValidationError("Days must be a non-zero number");
  }
  const db = getDB();
  const targetUser = await db("users")
    .where({ id: targetUserId, organization_id: orgId })
    .first();
  if (!targetUser) throw new NotFoundError("Employee");

  let compOffType = await db("leave_types")
    .where({ organization_id: orgId, code: "COMP_OFF" })
    .first();
  if (!compOffType) {
    const [id] = await db("leave_types").insert({
      organization_id: orgId,
      name: "Compensatory Off",
      code: "COMP_OFF",
      is_paid: true,
      is_carry_forward: true,
      max_carry_forward_days: 30,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    compOffType = await db("leave_types").where({ id }).first();
  }

  const year = new Date().getFullYear();
  const balance = await db("leave_balances")
    .where({
      organization_id: orgId,
      user_id: targetUserId,
      leave_type_id: compOffType.id,
      year,
    })
    .first();

  if (balance) {
    const nextAllocated = Number(balance.total_allocated) + days;
    const nextBalance = Number(balance.balance) + days;
    if (nextBalance < 0) {
      throw new ValidationError(
        `Adjustment would make balance negative (current: ${balance.balance} day(s), requested: ${days})`,
      );
    }
    await db("leave_balances").where({ id: balance.id }).update({
      total_allocated: nextAllocated,
      balance: nextBalance,
      updated_at: new Date(),
    });
    return {
      balance: nextBalance,
      total_allocated: nextAllocated,
      year,
    };
  } else {
    if (days < 0) {
      throw new ValidationError("Cannot debit comp-off balance — no balance allocated yet");
    }
    await db("leave_balances").insert({
      organization_id: orgId,
      user_id: targetUserId,
      leave_type_id: compOffType.id,
      year,
      total_allocated: days,
      total_used: 0,
      total_carry_forward: 0,
      balance: days,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return { balance: days, total_allocated: days, year };
  }
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
