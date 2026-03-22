// =============================================================================
// EMP CLOUD — Leave Application Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors.js";
import * as balanceService from "./leave-balance.service.js";
import type { LeaveApplication, ApplyLeaveInput } from "@empcloud/shared";

export async function applyLeave(
  orgId: number,
  userId: number,
  data: ApplyLeaveInput,
): Promise<LeaveApplication> {
  const db = getDB();

  // Validate leave type exists and is active
  const leaveType = await db("leave_types")
    .where({ id: data.leave_type_id, organization_id: orgId, is_active: true })
    .first();
  if (!leaveType) throw new NotFoundError("Leave type");

  // Validate balance
  const year = new Date(data.start_date).getFullYear();
  const balances = await balanceService.getBalances(orgId, userId, year);
  const balance = balances.find((b) => b.leave_type_id === data.leave_type_id);

  if (balance && Number(balance.balance) < data.days_count) {
    throw new ValidationError(
      `Insufficient balance. Available: ${balance.balance}, Requested: ${data.days_count}`,
    );
  }

  // Check for overlapping applications
  const overlap = await db("leave_applications")
    .where({ organization_id: orgId, user_id: userId })
    .whereIn("status", ["pending", "approved"])
    .where(function () {
      this.where("start_date", "<=", data.end_date).andWhere(
        "end_date",
        ">=",
        data.start_date,
      );
    })
    .first();

  if (overlap) {
    throw new ValidationError("Overlapping leave application exists");
  }

  // Find reporting manager as approver
  const user = await db("users")
    .where({ id: userId, organization_id: orgId })
    .first();
  const approverId = user?.reporting_manager_id ?? null;

  const [id] = await db("leave_applications").insert({
    organization_id: orgId,
    user_id: userId,
    leave_type_id: data.leave_type_id,
    start_date: data.start_date,
    end_date: data.end_date,
    days_count: data.days_count,
    is_half_day: data.is_half_day ?? false,
    half_day_type: data.half_day_type ?? null,
    reason: data.reason,
    status: leaveType.requires_approval ? "pending" : "approved",
    current_approver_id: approverId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // If no approval required, deduct balance immediately
  if (!leaveType.requires_approval) {
    await balanceService.deductBalance(orgId, userId, data.leave_type_id, data.days_count, year);
  }

  // Create approval record if approver exists
  if (approverId && leaveType.requires_approval) {
    await db("leave_approvals").insert({
      leave_application_id: id,
      approver_id: approverId,
      level: 1,
      status: "pending",
      created_at: new Date(),
    });
  }

  return getApplication(orgId, id);
}

export async function cancelLeave(
  orgId: number,
  userId: number,
  applicationId: number,
): Promise<LeaveApplication> {
  const db = getDB();

  const application = await db("leave_applications")
    .where({ id: applicationId, organization_id: orgId, user_id: userId })
    .first();
  if (!application) throw new NotFoundError("Leave application");

  if (application.status === "cancelled") {
    throw new ValidationError("Leave already cancelled");
  }

  const wasApproved = application.status === "approved";

  await db("leave_applications")
    .where({ id: applicationId })
    .update({ status: "cancelled", updated_at: new Date() });

  // Credit back balance if it was already approved
  if (wasApproved) {
    const year = new Date(application.start_date).getFullYear();
    await balanceService.creditBalance(
      orgId,
      userId,
      application.leave_type_id,
      Number(application.days_count),
      year,
    );
  }

  return getApplication(orgId, applicationId);
}

export async function approveLeave(
  orgId: number,
  approverId: number,
  applicationId: number,
  remarks?: string,
): Promise<LeaveApplication> {
  const db = getDB();

  const application = await db("leave_applications")
    .where({ id: applicationId, organization_id: orgId })
    .first();
  if (!application) throw new NotFoundError("Leave application");

  if (application.status !== "pending") {
    throw new ValidationError("Only pending applications can be approved");
  }

  // Verify the approver is authorized
  const approval = await db("leave_approvals")
    .where({ leave_application_id: applicationId, approver_id: approverId, status: "pending" })
    .first();

  // Allow HR/managers even if not listed as specific approver
  if (!approval) {
    const approverUser = await db("users").where({ id: approverId }).first();
    const isHR = approverUser && ["hr_admin", "hr_manager", "org_admin"].includes(approverUser.role);
    if (!isHR) throw new ForbiddenError("Not authorized to approve this application");
  }

  await db.transaction(async (trx) => {
    // Update application
    await trx("leave_applications")
      .where({ id: applicationId })
      .update({ status: "approved", updated_at: new Date() });

    // Update approval record
    if (approval) {
      await trx("leave_approvals")
        .where({ id: approval.id })
        .update({ status: "approved", remarks: remarks ?? null, acted_at: new Date() });
    } else {
      await trx("leave_approvals").insert({
        leave_application_id: applicationId,
        approver_id: approverId,
        level: 1,
        status: "approved",
        remarks: remarks ?? null,
        acted_at: new Date(),
        created_at: new Date(),
      });
    }

    // Deduct balance
    const year = new Date(application.start_date).getFullYear();
    const balance = await trx("leave_balances")
      .where({
        organization_id: orgId,
        user_id: application.user_id,
        leave_type_id: application.leave_type_id,
        year,
      })
      .first();

    if (balance) {
      await trx("leave_balances")
        .where({ id: balance.id })
        .update({
          total_used: Number(balance.total_used) + Number(application.days_count),
          balance: Number(balance.balance) - Number(application.days_count),
          updated_at: new Date(),
        });
    }
  });

  return getApplication(orgId, applicationId);
}

export async function rejectLeave(
  orgId: number,
  approverId: number,
  applicationId: number,
  remarks?: string,
): Promise<LeaveApplication> {
  const db = getDB();

  const application = await db("leave_applications")
    .where({ id: applicationId, organization_id: orgId })
    .first();
  if (!application) throw new NotFoundError("Leave application");

  if (application.status !== "pending") {
    throw new ValidationError("Only pending applications can be rejected");
  }

  await db.transaction(async (trx) => {
    await trx("leave_applications")
      .where({ id: applicationId })
      .update({ status: "rejected", updated_at: new Date() });

    const approval = await trx("leave_approvals")
      .where({ leave_application_id: applicationId, approver_id: approverId })
      .first();

    if (approval) {
      await trx("leave_approvals")
        .where({ id: approval.id })
        .update({ status: "rejected", remarks: remarks ?? null, acted_at: new Date() });
    } else {
      await trx("leave_approvals").insert({
        leave_application_id: applicationId,
        approver_id: approverId,
        level: 1,
        status: "rejected",
        remarks: remarks ?? null,
        acted_at: new Date(),
        created_at: new Date(),
      });
    }
  });

  return getApplication(orgId, applicationId);
}

export async function listApplications(
  orgId: number,
  params: {
    page?: number;
    perPage?: number;
    status?: string;
    leaveTypeId?: number;
    userId?: number;
  },
) {
  const db = getDB();
  const page = params.page || 1;
  const perPage = params.perPage || 20;

  let query = db("leave_applications").where({ organization_id: orgId });

  if (params.status) query = query.where({ status: params.status });
  if (params.leaveTypeId) query = query.where({ leave_type_id: params.leaveTypeId });
  if (params.userId) query = query.where({ user_id: params.userId });

  const [{ count }] = await query.clone().count("* as count");
  const applications = await query
    .select()
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { applications, total: Number(count) };
}

export async function getApplication(orgId: number, id: number): Promise<LeaveApplication> {
  const db = getDB();
  const row = await db("leave_applications")
    .where({ id, organization_id: orgId })
    .first();
  if (!row) throw new NotFoundError("Leave application");
  return row;
}

export async function getLeaveCalendar(
  orgId: number,
  month: number,
  year: number,
) {
  const db = getDB();

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const leaves = await db("leave_applications")
    .where({ organization_id: orgId, status: "approved" })
    .where("start_date", "<", endDate)
    .where("end_date", ">=", startDate)
    .join("users", "leave_applications.user_id", "users.id")
    .join("leave_types", "leave_applications.leave_type_id", "leave_types.id")
    .select(
      "leave_applications.*",
      "users.first_name",
      "users.last_name",
      "users.emp_code",
      "leave_types.name as leave_type_name",
      "leave_types.color as leave_type_color",
    );

  return leaves;
}
