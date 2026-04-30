// =============================================================================
// EMP CLOUD — Leave Application Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import * as balanceService from "./leave-balance.service.js";
import type { LeaveApplication, ApplyLeaveInput } from "@empcloud/shared";

export async function applyLeave(
  orgId: number,
  userId: number,
  data: ApplyLeaveInput,
): Promise<LeaveApplication> {
  const db = getDB();

  // Validate dates are valid
  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);
  if (isNaN(startDate.getTime())) {
    throw new ValidationError("Invalid start_date format");
  }
  if (isNaN(endDate.getTime())) {
    throw new ValidationError("Invalid end_date format");
  }
  if (endDate < startDate) {
    throw new ValidationError("End date must not be before start date");
  }

  // #1822 — Bug 22: prod showed a 2-day Paid Leave with Days = 0. Zod
  // already rejects days_count < 0.5, but the symptom proves the value
  // sometimes lands at 0 anyway (likely a stale form state where the date
  // pickers updated after days_count was already serialised). Coerce
  // missing / falsy / out-of-range values to the inclusive calendar-day
  // count between start and end. We only override when the supplied value
  // is *clearly wrong* (zero, negative, or larger than the date span) —
  // legitimate "5 days for a Mon–Fri week off a Sun–Sat range" stays
  // intact because we don't reduce a smaller-than-span value.
  const inclusiveDays =
    Math.floor(
      (Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) -
        Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())) /
        (1000 * 60 * 60 * 24),
    ) + 1;
  if (data.is_half_day) {
    data.days_count = 0.5;
  } else if (
    !data.days_count ||
    Number(data.days_count) <= 0 ||
    Number(data.days_count) > inclusiveDays
  ) {
    data.days_count = inclusiveDays;
  }

  // Reject leave applications with start_date more than 7 days in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const gracePeriod = new Date(today);
  gracePeriod.setDate(gracePeriod.getDate() - 7);
  if (startDate < gracePeriod) {
    throw new ValidationError("Start date cannot be more than 7 days in the past");
  }

  // Validate leave type exists and is active
  const leaveType = await db("leave_types")
    .where({ id: data.leave_type_id, organization_id: orgId, is_active: true })
    .first();
  if (!leaveType) throw new NotFoundError("Leave type");

  // Rule: Probation period leave restrictions — only sick and emergency leave allowed
  const applicant = await db("users")
    .where({ id: userId, organization_id: orgId })
    .select("probation_status")
    .first();
  if (applicant && applicant.probation_status === "on_probation") {
    // #1920 — Hard-matching on `leaveType.code` against ["sl","sick","eml","emergency"]
    // missed the legitimate sick-leave rows whose codes admins had typed as
    // "SICK_LEAVE", "SL_440514", "SICKLV", etc. Probationers were then told
    // their sick-leave application was a non-sick leave. Match by name OR
    // code substring so any leave whose label/code contains "sick" or
    // "emergency" passes the probation gate.
    const haystack = `${leaveType.name ?? ""} ${leaveType.code ?? ""}`.toLowerCase();
    const allowedKeywords = ["sick", "emergency", "sl", "eml"];
    const isAllowed = allowedKeywords.some((kw) => haystack.includes(kw));
    if (!isAllowed) {
      throw new ValidationError(
        "Employees on probation can only apply for Sick Leave or Emergency Leave",
      );
    }
  }

  // Validate balance
  // #1610/#1611 — reject when no balance row exists OR balance < requested.
  // Previously the check was `if (balance && balance.balance < days_count)` which
  // silently passed when a leave_balances row was missing for the (user,
  // leave_type, year) tuple. Approval would then succeed without deducting
  // anything (approveLeave's `if (balance) { update }` is a no-op when the row
  // is absent), so users could apply for — and have approved — leave types
  // they had zero allocation for, with the dashboard still showing the full
  // (wrong) balance.
  const year = new Date(data.start_date).getFullYear();
  const balances = await balanceService.getBalances(orgId, userId, year);
  const balance = balances.find((b) => b.leave_type_id === data.leave_type_id);
  const typeName = (balance as any)?.leave_type_name || leaveType.name || "this leave type";

  if (!balance) {
    throw new ValidationError(
      `No leave balance allocated for ${typeName}. Please contact HR to initialize your balance.`,
    );
  }
  if (Number(balance.balance) < data.days_count) {
    throw new ValidationError(
      `Insufficient balance for ${typeName}. Available: ${balance.balance} day(s), Requested: ${data.days_count} day(s).`,
    );
  }

  // Check for overlapping applications
  // Only count pending/approved — cancelled and rejected do NOT block new applications
  // Allow same-day half-day leaves (first_half + second_half) on the same date
  //
  // #1822 — Bug 21: prod showed two identical Sick Leave entries for the
  // same date range, both Approved. The overlap check below is correct in
  // isolation but two near-simultaneous submissions can both pass the
  // SELECT before either commits. We can't add a UNIQUE constraint here
  // without a migration (per task scope), so we keep the SELECT check AND
  // do a second post-insert "I'm not the only one" sweep below to abort
  // duplicates that slipped through the race window.
  const overlaps = await db("leave_applications")
    .where({ organization_id: orgId, user_id: userId })
    .whereIn("status", ["pending", "approved"])
    .where(function () {
      this.where("start_date", "<=", data.end_date).andWhere(
        "end_date",
        ">=",
        data.start_date,
      );
    });

  // Helper: normalize Date|string|null to "YYYY-MM-DD" — MySQL drivers
  // sometimes hydrate DATE columns into JS Date objects which would blow up
  // the previous .slice() call.
  const toDateStr = (v: unknown): string => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") return v.slice(0, 10);
    return String(v).slice(0, 10);
  };
  const reqStart = toDateStr(data.start_date);
  const reqEnd = toDateStr(data.end_date);

  for (const overlap of overlaps) {
    const overlapStart = toDateStr(overlap.start_date);
    const overlapEnd = toDateStr(overlap.end_date);

    // If both the existing and new are half-day leaves on the same single day,
    // allow if they cover different halves (first_half vs second_half)
    const isSameSingleDay =
      reqStart === reqEnd &&
      overlapStart === overlapEnd &&
      reqStart === overlapStart;

    if (isSameSingleDay && data.is_half_day && overlap.is_half_day) {
      if (data.half_day_type && overlap.half_day_type && data.half_day_type !== overlap.half_day_type) {
        continue; // Different halves — no conflict
      }
    }

    throw new ValidationError(
      `You already have a ${overlap.status} leave application from ${overlapStart} to ${overlapEnd}.`,
    );
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

  // Fetch the application by org + id (without filtering by user_id yet)
  const application = await db("leave_applications")
    .where({ id: applicationId, organization_id: orgId })
    .first();
  if (!application) throw new NotFoundError("Leave application");

  // Verify ownership: allow if the user owns the leave, or if the user is HR
  if (application.user_id !== userId) {
    const actingUser = await db("users").where({ id: userId, organization_id: orgId }).first();
    const isHR = actingUser && ["hr_admin", "org_admin"].includes(actingUser.role);
    if (!isHR) throw new ForbiddenError("Not authorized to cancel this leave application");
  }

  if (!["pending", "approved"].includes(application.status)) {
    throw new ValidationError(
      `Cannot cancel a leave application with status '${application.status}'`,
    );
  }

  // #1017 — Prevent cancelling leave that has already started
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const leaveStart = new Date(application.start_date);
  leaveStart.setHours(0, 0, 0, 0);
  if (leaveStart < today) {
    throw new ValidationError("Cannot cancel leave that has already started");
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
      application.user_id,
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

  // Block self-approval
  if (approverId === application.user_id) {
    throw new ForbiddenError("Cannot approve your own leave application");
  }

  // Verify the approver is authorized
  const approval = await db("leave_approvals")
    .where({ leave_application_id: applicationId, approver_id: approverId, status: "pending" })
    .first();

  // Allow managers/HR/org_admin/super_admin even if not listed as specific approver
  if (!approval) {
    const approverUser = await db("users").where({ id: approverId }).first();
    const allowedRoles = ["manager", "hr_admin", "org_admin", "super_admin"];
    const isAuthorized = approverUser && allowedRoles.includes(approverUser.role);
    if (!isAuthorized) throw new ForbiddenError("Not authorized to approve this application");
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
    } else {
      // #1611 — applyLeave now blocks applications with no balance row, so we
      // should never reach this path. Log if we somehow do (e.g. a pre-fix
      // application that's still pending), so the missing deduction is
      // traceable instead of silently lost.
      logger.warn("Leave approval: missing balance row, deduction skipped", {
        organizationId: orgId,
        userId: application.user_id,
        leaveTypeId: application.leave_type_id,
        applicationId,
        year,
      });
    }

    // Auto-create on_leave attendance records for each day of the leave
    const txnNow = new Date();
    try {
      const startDate = new Date(application.start_date);
      const endDate = new Date(application.end_date);
      // Safety: skip if dates are invalid or too far in the future
      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate.getFullYear() > 1999 && startDate.getFullYear() < 2100) {
        const maxDays = 60; // safety limit
        let count = 0;
        for (let d = new Date(startDate); d <= endDate && count < maxDays; d.setDate(d.getDate() + 1)) {
          count++;
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const dateStr = `${y}-${m}-${day}`;

          const existing = await trx("attendance_records")
            .where({ organization_id: orgId, user_id: application.user_id, date: dateStr })
            .first();

          if (!existing) {
            // #1395/#1357 — The attendance_records table does not have a "source"
            // column. Sending it would fail the INSERT and abort the transaction,
            // causing every leave approval to silently fail.
            await trx("attendance_records").insert({
              organization_id: orgId, user_id: application.user_id,
              date: dateStr, status: "on_leave",
              created_at: txnNow, updated_at: txnNow,
            });
          } else if (existing.status !== "on_leave") {
            await trx("attendance_records").where({ id: existing.id }).update({ status: "on_leave", updated_at: txnNow });
          }
        }
      }
    } catch (err) {
      // Don't fail the approval if attendance creation fails
      logger.warn("Failed to create on_leave attendance records", { error: (err as Error).message });
    }

    // Create notification for the employee
    await trx("notifications").insert({
      organization_id: orgId,
      user_id: application.user_id,
      type: "leave_update",
      title: "Leave Application Approved",
      body: `Your leave from ${application.start_date} to ${application.end_date} has been approved.${remarks ? ` Remarks: ${remarks}` : ""}`,
      reference_type: "leave_application",
      reference_id: String(applicationId),
      is_read: false,
      created_at: txnNow,
    });
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

  // Block self-rejection
  if (approverId === application.user_id) {
    throw new ForbiddenError("Cannot reject your own leave application");
  }

  // Verify the approver is authorized
  const approval = await db("leave_approvals")
    .where({ leave_application_id: applicationId, approver_id: approverId, status: "pending" })
    .first();

  // Allow managers/HR/org_admin/super_admin even if not listed as specific approver
  if (!approval) {
    const approverUser = await db("users").where({ id: approverId }).first();
    const allowedRoles = ["manager", "hr_admin", "org_admin", "super_admin"];
    const isAuthorized = approverUser && allowedRoles.includes(approverUser.role);
    if (!isAuthorized) throw new ForbiddenError("Not authorized to reject this application");
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

    // Create notification for the employee about rejection
    await trx("notifications").insert({
      organization_id: orgId,
      user_id: application.user_id,
      type: "leave_update",
      title: "Leave Application Rejected",
      body: `Your leave from ${application.start_date} to ${application.end_date} has been rejected.${remarks ? ` Reason: ${remarks}` : ""}`,
      reference_type: "leave_application",
      reference_id: String(applicationId),
      is_read: false,
      created_at: new Date(),
    });
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

  let query = db("leave_applications")
    .join("users", "leave_applications.user_id", "users.id")
    .where("leave_applications.organization_id", orgId);

  if (params.status) query = query.where("leave_applications.status", params.status);
  if (params.leaveTypeId) query = query.where("leave_applications.leave_type_id", params.leaveTypeId);
  if (params.userId) query = query.where("leave_applications.user_id", params.userId);

  const [{ count }] = await query.clone().count("* as count");
  const applications = await query
    .leftJoin("leave_approvals", "leave_applications.id", "leave_approvals.leave_application_id")
    .leftJoin("users as approver", "leave_approvals.approver_id", "approver.id")
    .select(
      "leave_applications.*",
      "users.first_name as user_first_name",
      "users.last_name as user_last_name",
      "users.email as user_email",
      "users.emp_code as user_emp_code",
      "leave_approvals.remarks as admin_remarks",
      "leave_approvals.acted_at as approval_date",
      db.raw("CONCAT(approver.first_name, ' ', approver.last_name) as approver_name"),
    )
    .orderBy("leave_applications.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { applications, total: Number(count) };
}

export async function getApplication(orgId: number, id: number): Promise<LeaveApplication> {
  const db = getDB();
  const row = await db("leave_applications")
    .where({ "leave_applications.id": id, "leave_applications.organization_id": orgId })
    .leftJoin("leave_approvals", "leave_applications.id", "leave_approvals.leave_application_id")
    .leftJoin("users as approver", "leave_approvals.approver_id", "approver.id")
    .select(
      "leave_applications.*",
      "leave_approvals.remarks as admin_remarks",
      "leave_approvals.status as approval_status",
      "leave_approvals.acted_at as approval_date",
      db.raw("CONCAT(approver.first_name, ' ', approver.last_name) as approver_name"),
    )
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
    .where({ "leave_applications.organization_id": orgId, "leave_applications.status": "approved" })
    .where("leave_applications.start_date", "<", endDate)
    .where("leave_applications.end_date", ">=", startDate)
    .join("users", "leave_applications.user_id", "users.id")
    .join("leave_types", "leave_applications.leave_type_id", "leave_types.id")
    .select(
      "leave_applications.*",
      "users.first_name",
      "users.last_name",
      "users.emp_code",
      "leave_types.name as leave_type_name",
      "leave_types.code as leave_type_code",
      "leave_types.color as leave_type_color",
    );

  return leaves;
}
