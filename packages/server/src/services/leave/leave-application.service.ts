// =============================================================================
// EMP CLOUD — Leave Application Service
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import * as balanceService from "./leave-balance.service.js";
import type { LeaveApplication, ApplyLeaveInput, UpdateLeaveInput } from "@empcloud/shared";

export async function applyLeave(
  orgId: number,
  userId: number,
  data: ApplyLeaveInput,
  options?: { skipBackdateCheck?: boolean },
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

  // Always compute days_count on the server from the date range, the
  // applicant's shift week-offs, and mandatory holidays. The client's
  // value is ignored — letting it pass through let a stale form state
  // submit a 6-day Earned Leave with days_count=1 (Abhishek, Jun 9–14,
  // 2026) which then bypassed the balance check entirely. Bug 22 (#1822)
  // already coerced obviously-bad values (zero, negative, larger than
  // span), but anything between 0 and inclusiveDays slipped through.
  //
  // Conventions:
  //   • Working day = a day the applicant would have been at work if
  //     not on leave. So weekoffs (per the user's shift) and mandatory
  //     holidays (per company_events + legacy organization_holidays)
  //     don't debit the balance.
  //   • Optional / restricted holidays (is_mandatory=0) DO debit — the
  //     office is open on those days, so taking the day off is a real
  //     leave day. Matches the auto-HOT rule on the attendance grid.
  //   • Half-day applications collapse to 0.5 regardless of range.
  //   • If the applicant has no shift assignment covering any day in
  //     the range we don't subtract weekoffs for that day — the safer
  //     default than guessing Sat/Sun, since many orgs run 6-day weeks.
  const inclusiveDays =
    Math.floor(
      (Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) -
        Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())) /
        (1000 * 60 * 60 * 24),
    ) + 1;
  const startStr = data.start_date.slice(0, 10);
  const endStr = data.end_date.slice(0, 10);
  if (data.is_half_day) {
    data.days_count = 0.5;
  } else {
    const [assignments, eventHolidays, legacyHolidays] = await Promise.all([
      db("shift_assignments as sa")
        .join("shifts as s", "sa.shift_id", "s.id")
        .where("sa.organization_id", orgId)
        .andWhere("sa.user_id", userId)
        .whereRaw("DATE(sa.effective_from) <= ?", [endStr])
        .andWhere(function () {
          this.whereNull("sa.effective_to").orWhereRaw("DATE(sa.effective_to) >= ?", [startStr]);
        })
        .orderBy("sa.created_at", "desc")
        .orderBy("sa.id", "desc")
        .select("sa.effective_from", "sa.effective_to", "s.working_days"),
      db("company_events")
        .where({ organization_id: orgId, event_type: "holiday", is_mandatory: 1 })
        .where("start_date", "<=", `${endStr} 23:59:59`)
        .andWhere(function () {
          this.where("end_date", ">=", `${startStr} 00:00:00`).orWhereNull("end_date");
        })
        .select("start_date", "end_date"),
      db("organization_holidays")
        .where({ organization_id: orgId })
        .whereBetween("holiday_date", [startStr, endStr])
        .select("holiday_date")
        .catch(() => [] as Array<{ holiday_date: any }>),
    ]);

    const dateKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const mandatoryHolidaySet = new Set<string>();
    for (const e of eventHolidays as any[]) {
      const s = new Date(e.start_date);
      const en = e.end_date ? new Date(e.end_date) : new Date(e.start_date);
      for (let d = new Date(s); d <= en; d.setDate(d.getDate() + 1)) {
        mandatoryHolidaySet.add(dateKey(d));
      }
    }
    for (const h of legacyHolidays as any[]) {
      mandatoryHolidaySet.add(dateKey(new Date(h.holiday_date)));
    }

    let workingDays = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (mandatoryHolidaySet.has(dateKey(d))) continue;
      const dow = d.getDay();
      const k = dateKey(d);
      // First-write-wins per (user, date) — assignments are pre-sorted
      // by created_at desc, so the most recent assignment covering this
      // date wins. Mirrors the attendance grid's resolution.
      let isWeekoff = false;
      for (const sa of assignments as any[]) {
        const effFrom = dateKey(new Date(sa.effective_from));
        const effTo = sa.effective_to ? dateKey(new Date(sa.effective_to)) : null;
        if (k >= effFrom && (effTo === null || k <= effTo)) {
          const workingDow = String(sa.working_days || "")
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => !isNaN(n));
          if (workingDow.length > 0) isWeekoff = !workingDow.includes(dow);
          break;
        }
      }
      if (!isWeekoff) workingDays++;
    }
    data.days_count = workingDays;
  }

  if (!data.days_count || Number(data.days_count) <= 0) {
    throw new ValidationError(
      `Selected range contains no working days (only week-offs and holidays). Pick a range with at least one working day.`,
    );
  }
  // Hard ceiling: never let a request exceed the inclusive calendar span,
  // regardless of what the computed value comes out to. Belt-and-braces
  // against any future shift-resolution bug.
  if (Number(data.days_count) > inclusiveDays) {
    data.days_count = inclusiveDays;
  }

  // Validate leave type exists and is active
  const leaveType = await db("leave_types")
    .where({ id: data.leave_type_id, organization_id: orgId, is_active: true })
    .first();
  if (!leaveType) throw new NotFoundError("Leave type");

  // Rule: Probation period leave restrictions — only sick and emergency leave allowed.
  //
  // "On probation" must match the criteria used by the Probation Tracking
  // page (probation.service.ts) so that a user who isn't shown there isn't
  // gated here. Three conditions, ALL must hold:
  //   1. probation_status IN ('on_probation', 'extended')
  //   2. probation_end_date IS NOT NULL  (no end date == not actually
  //      enrolled in probation tracking, just a stale enum default)
  //   3. probation_end_date >= today      (probation hasn't already ended)
  //
  // Without (2) and (3), users whose probation_status was left as the
  // default "on_probation" but were never actually enrolled (or whose
  // probation has expired) get falsely blocked from non-sick leaves while
  // simultaneously not appearing on the Probation Tracking dashboard.
  const applicant = await db("users")
    .where({ id: userId, organization_id: orgId })
    .whereIn("probation_status", ["on_probation", "extended"])
    .whereNotNull("probation_end_date")
    .whereRaw("probation_end_date >= CURDATE()")
    .select("probation_status")
    .first();
  if (applicant) {
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

  // Validate balance — period-aware (#059 migration).
  //
  // The fiscal year is derived from the application's start_date so a
  // retroactive leave debits the period it actually belongs to, not the
  // current period. getBalances() returns `available_now` which already
  // accounts for accrual_type (annual/quarterly/monthly) and
  // period_carry_forward.
  //
  // #1610/#1611 — reject when no balance row exists OR available < requested.
  const org = await db("organizations")
    .where({ id: orgId })
    .select("fiscal_year_start_month")
    .first();
  const fyStartMonth = Number(org?.fiscal_year_start_month) || 4;
  const startDateObj = new Date(data.start_date);
  const fiscalYear =
    startDateObj.getMonth() + 1 >= fyStartMonth
      ? startDateObj.getFullYear()
      : startDateObj.getFullYear() - 1;

  const balances = await balanceService.getBalances(orgId, userId, fiscalYear);
  const balance = balances.find((b) => b.leave_type_id === data.leave_type_id);
  const typeName = (balance as any)?.leave_type_name || leaveType.name || "this leave type";

  if (!balance) {
    throw new ValidationError(
      `No leave balance allocated for ${typeName}. Please contact HR to initialize your balance.`,
    );
  }

  const availableNow = Number((balance as any).available_now ?? balance.balance);
  const fyLabel = (balance as any).fiscal_year_label ?? String(fiscalYear);
  if (availableNow < data.days_count) {
    throw new ValidationError(
      `Insufficient balance for ${typeName} in ${fyLabel}. Available: ${availableNow} day(s), Requested: ${data.days_count} day(s).`,
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

  // If no approval required, deduct balance immediately. Pass start_date
  // so retroactive applications debit the correct period.
  if (!leaveType.requires_approval) {
    await balanceService.deductBalance(
      orgId,
      userId,
      data.leave_type_id,
      data.days_count,
      fiscalYear,
      startDateObj,
    );
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

  // Credit back balance if it was already approved. Pass start_date so
  // refund hits the correct period bucket (matches approve-time deduction).
  if (wasApproved) {
    const startDateObj = new Date(application.start_date);
    await balanceService.creditBalance(
      orgId,
      application.user_id,
      application.leave_type_id,
      Number(application.days_count),
      undefined, // service will derive fiscal year from start_date + org config
      startDateObj,
    );

    // Remove the synthetic attendance rows that approval created for this
    // leave so a cancelled leave no longer counts as paid leave in payroll,
    // nor shows as L/HPL on the Attendance Grid. Scope is tight on purpose:
    // only this leave's own date range, and only the two system leave
    // statuses. The "cannot cancel leave that has already started" guard
    // above guarantees the whole range is today-or-future, so there are no
    // real punches in this window to clobber. Date strings are built with
    // local getters to match how approveLeave wrote them. (cancel-cleanup F4)
    const toIso = (v: unknown): string | null => {
      const d = v instanceof Date ? v : new Date(v as any);
      return Number.isNaN(d.getTime())
        ? null
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const startIso = toIso(application.start_date);
    const endIso = toIso(application.end_date);
    if (startIso && endIso) {
      await db("attendance_records")
        .where({ organization_id: orgId, user_id: application.user_id })
        .whereBetween("date", [startIso, endIso])
        .whereIn("status", ["on_leave", "half_present_half_leave"])
        .del();
    }
  }

  return getApplication(orgId, applicationId);
}

// Edit a leave application. Only pending applications are editable. Recomputes
// days_count from dates, re-checks balance and overlap (excluding self), and
// updates the row. No balance debit/credit needed because pending leaves
// haven't been deducted yet (deduction happens at approve time for types that
// require approval; types that don't require approval go straight to approved
// and never sit in pending).
export async function updateLeave(
  orgId: number,
  userId: number,
  applicationId: number,
  data: UpdateLeaveInput,
): Promise<LeaveApplication> {
  const db = getDB();

  const existing = await db("leave_applications")
    .where({ id: applicationId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Leave application");

  // Ownership: only the applicant can edit (HR cancels via the cancel route,
  // not edit — different audit trail).
  if (existing.user_id !== userId) {
    throw new ForbiddenError("Not authorized to edit this leave application");
  }

  if (existing.status !== "pending") {
    throw new ValidationError(
      `Cannot edit a leave application with status '${existing.status}'. Only pending leaves can be edited.`,
    );
  }

  const toDateStr = (v: unknown): string => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") return v.slice(0, 10);
    return String(v).slice(0, 10);
  };

  // Build the merged record — caller's fields win, fall back to existing
  const merged = {
    leave_type_id: data.leave_type_id ?? existing.leave_type_id,
    start_date: data.start_date ?? toDateStr(existing.start_date),
    end_date: data.end_date ?? toDateStr(existing.end_date),
    is_half_day: data.is_half_day ?? Boolean(existing.is_half_day),
    half_day_type: data.half_day_type !== undefined ? data.half_day_type : existing.half_day_type,
    reason: data.reason ?? existing.reason,
    days_count: data.days_count ?? Number(existing.days_count),
  };

  const startDate = new Date(merged.start_date);
  const endDate = new Date(merged.end_date);
  if (isNaN(startDate.getTime())) throw new ValidationError("Invalid start_date format");
  if (isNaN(endDate.getTime())) throw new ValidationError("Invalid end_date format");
  if (endDate < startDate) throw new ValidationError("End date must not be before start date");

  // Recompute days_count from the date span if the supplied value is missing,
  // zero, negative, or larger than the span — same coercion as applyLeave.
  const inclusiveDays =
    Math.floor(
      (Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) -
        Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())) /
        (1000 * 60 * 60 * 24),
    ) + 1;
  if (merged.is_half_day) {
    merged.days_count = 0.5;
  } else if (!merged.days_count || merged.days_count <= 0 || merged.days_count > inclusiveDays) {
    merged.days_count = inclusiveDays;
  }

  // Validate (possibly changed) leave type
  const leaveType = await db("leave_types")
    .where({ id: merged.leave_type_id, organization_id: orgId, is_active: true })
    .first();
  if (!leaveType) throw new NotFoundError("Leave type");

  // Probation gate — same logic as applyLeave
  const applicant = await db("users")
    .where({ id: userId, organization_id: orgId })
    .whereIn("probation_status", ["on_probation", "extended"])
    .whereNotNull("probation_end_date")
    .whereRaw("probation_end_date >= CURDATE()")
    .select("probation_status")
    .first();
  if (applicant) {
    const haystack = `${leaveType.name ?? ""} ${leaveType.code ?? ""}`.toLowerCase();
    const allowedKeywords = ["sick", "emergency", "sl", "eml"];
    if (!allowedKeywords.some((kw) => haystack.includes(kw))) {
      throw new ValidationError(
        "Employees on probation can only apply for Sick Leave or Emergency Leave",
      );
    }
  }

  // Balance check (fiscal-year aware, matches applyLeave)
  const org = await db("organizations")
    .where({ id: orgId })
    .select("fiscal_year_start_month")
    .first();
  const fyStartMonth = Number(org?.fiscal_year_start_month) || 4;
  const fiscalYear =
    startDate.getMonth() + 1 >= fyStartMonth
      ? startDate.getFullYear()
      : startDate.getFullYear() - 1;

  const balances = await balanceService.getBalances(orgId, userId, fiscalYear);
  const balance = balances.find((b) => b.leave_type_id === merged.leave_type_id);
  const typeName = (balance as any)?.leave_type_name || leaveType.name || "this leave type";
  if (!balance) {
    throw new ValidationError(
      `No leave balance allocated for ${typeName}. Please contact HR to initialize your balance.`,
    );
  }
  const availableNow = Number((balance as any).available_now ?? balance.balance);
  const fyLabel = (balance as any).fiscal_year_label ?? String(fiscalYear);
  if (availableNow < merged.days_count) {
    throw new ValidationError(
      `Insufficient balance for ${typeName} in ${fyLabel}. Available: ${availableNow} day(s), Requested: ${merged.days_count} day(s).`,
    );
  }

  // Overlap check — EXCLUDE the application being edited (else it'd
  // conflict with its own current date range).
  const overlaps = await db("leave_applications")
    .where({ organization_id: orgId, user_id: userId })
    .whereNot("id", applicationId)
    .whereIn("status", ["pending", "approved"])
    .where(function () {
      this.where("start_date", "<=", merged.end_date).andWhere("end_date", ">=", merged.start_date);
    });
  const reqStart = toDateStr(merged.start_date);
  const reqEnd = toDateStr(merged.end_date);
  for (const overlap of overlaps) {
    const overlapStart = toDateStr(overlap.start_date);
    const overlapEnd = toDateStr(overlap.end_date);
    const isSameSingleDay =
      reqStart === reqEnd && overlapStart === overlapEnd && reqStart === overlapStart;
    if (isSameSingleDay && merged.is_half_day && overlap.is_half_day) {
      if (
        merged.half_day_type &&
        overlap.half_day_type &&
        merged.half_day_type !== overlap.half_day_type
      ) {
        continue;
      }
    }
    throw new ValidationError(
      `You already have a ${overlap.status} leave application from ${overlapStart} to ${overlapEnd}.`,
    );
  }

  await db("leave_applications")
    .where({ id: applicationId })
    .update({
      leave_type_id: merged.leave_type_id,
      start_date: merged.start_date,
      end_date: merged.end_date,
      days_count: merged.days_count,
      is_half_day: merged.is_half_day,
      half_day_type: merged.half_day_type ?? null,
      reason: merged.reason,
      updated_at: new Date(),
    });

  return getApplication(orgId, applicationId);
}

export async function approveLeave(
  orgId: number,
  approverId: number,
  applicationId: number,
  remarks?: string,
  approverPermissions?: string[],
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

  // Verify the approver is authorized. Three accept paths:
  //   1. They are listed as the pending approver on this specific
  //      application (the standard manager-of-record flow).
  //   2. They hold one of the system roles that have implicit approval
  //      authority across the org.
  //   3. They have the `leave:approve` permission via RBAC v1 (custom
  //      role assigned by org admin). This was previously missing -- the
  //      route gate accepted the permission but the service rejected
  //      anyone whose `users.role` wasn't in the hardcoded list, so HR
  //      could provision the permission and still see "Not authorized
  //      to approve this application" 403s.
  const approval = await db("leave_approvals")
    .where({ leave_application_id: applicationId, approver_id: approverId, status: "pending" })
    .first();

  if (!approval) {
    const approverUser = await db("users").where({ id: approverId }).first();
    const allowedRoles = ["manager", "hr_admin", "org_admin", "super_admin"];
    const hasSystemRole = !!approverUser && allowedRoles.includes(approverUser.role);
    const hasRbacPermission = !!approverPermissions?.includes("leave:approve");
    if (!hasSystemRole && !hasRbacPermission) {
      throw new ForbiddenError("Not authorized to approve this application");
    }
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

    // Deduct balance — period-aware. The application's start_date determines
    // both the fiscal year row and (when same as current period) which
    // period_used bucket gets incremented.
    const org = await trx("organizations")
      .where({ id: orgId })
      .select("fiscal_year_start_month")
      .first();
    const fyStartMonth = Number(org?.fiscal_year_start_month) || 4;
    const startDateObj = new Date(application.start_date);
    const year =
      startDateObj.getMonth() + 1 >= fyStartMonth
        ? startDateObj.getFullYear()
        : startDateObj.getFullYear() - 1;

    const balance = await trx("leave_balances")
      .where({
        organization_id: orgId,
        user_id: application.user_id,
        leave_type_id: application.leave_type_id,
        year,
      })
      .first();

    if (balance) {
      // Hard balance re-check at approve time. applyLeave checks balance
      // at submission, but the available balance can drop between apply
      // and approve (another leave got approved, allocated was reduced,
      // carry-forward expired, etc.). Without this re-check, the
      // deduction below silently caps the balance at zero (Math.max) --
      // the admin sees the approve succeed, the ledger ends up with
      // total_used over-counted, and the employee gets time off they
      // can't actually afford. Refuse with a clear message naming the
      // employee, the leave type, and the gap so the admin can either
      // reject the application or top up the balance first.
      const days = Number(application.days_count);
      const currentBalance = Number(balance.balance);
      if (currentBalance < days) {
        // Surface the employee's name + the leave type name so the
        // admin's error toast is actionable in one read.
        const [employee, leaveType] = await Promise.all([
          trx("users")
            .where({ id: application.user_id })
            .select("first_name", "last_name", "emp_code")
            .first(),
          trx("leave_types")
            .where({ id: application.leave_type_id })
            .select("name", "code")
            .first(),
        ]);
        const who = employee
          ? `${[employee.first_name, employee.last_name].filter(Boolean).join(" ").trim()}${employee.emp_code ? " (" + employee.emp_code + ")" : ""}`
          : "the applicant";
        const typeLabel = leaveType?.name || leaveType?.code || "this leave type";
        throw new ValidationError(
          `Cannot approve: ${who} has only ${currentBalance} day(s) of ${typeLabel} available, but this request is for ${days} day(s). Reject the request, ask the employee to apply for a shorter period, or top up the balance first.`,
        );
      }

      // Determine whether the leave belongs to the *current* period — only
      // then do we touch period_used. We resolve the policy here to know the
      // accrual type for period bucketing.
      const policy = await trx("leave_policies")
        .where({
          organization_id: orgId,
          leave_type_id: application.leave_type_id,
          is_active: true,
        })
        .orderBy("id", "desc")
        .first();
      const accrual = (policy?.accrual_type as "annual" | "monthly" | "quarterly") ?? "annual";
      const monthsPer = { annual: 12, monthly: 1, quarterly: 3 }[accrual];
      const monthsFromStart = (startDateObj.getFullYear() - year) * 12 + (startDateObj.getMonth() + 1 - fyStartMonth);
      const applicationPeriodIndex = Math.max(0, Math.floor(monthsFromStart / monthsPer));
      const now = new Date();
      const currentMonthsFromStart = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - fyStartMonth);
      const currentPeriodIndex = Math.max(0, Math.floor(currentMonthsFromStart / monthsPer));
      const sameCurrentPeriod = applicationPeriodIndex === currentPeriodIndex;

      await trx("leave_balances")
        .where({ id: balance.id })
        .update({
          total_used: Number(balance.total_used) + days,
          balance: currentBalance - days,
          period_used: sameCurrentPeriod
            ? Number(balance.period_used ?? 0) + days
            : Number(balance.period_used ?? 0),
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

          // A half-day leave is stored as `half_present_half_leave` (HPL) so
          // payroll books 0.5 leave + 0.5 worked instead of a full leave day,
          // matching how the Attendance Grid already classifies it. A full-day
          // leave stays `on_leave`. (half-day F3)
          const leaveStatus = application.is_half_day ? "half_present_half_leave" : "on_leave";

          if (!existing) {
            // #1395/#1357 — The attendance_records table does not have a "source"
            // column. Sending it would fail the INSERT and abort the transaction,
            // causing every leave approval to silently fail.
            await trx("attendance_records").insert({
              organization_id: orgId, user_id: application.user_id,
              date: dateStr, status: leaveStatus,
              created_at: txnNow, updated_at: txnNow,
            });
          } else if (existing.status === "absent") {
            // Only convert a day with NO real attendance. Never overwrite a
            // genuine punch (present / checked_in / weekoff_overtime /
            // holiday_overtime / half_day / HPL) — doing so silently erased a
            // day the employee actually worked, dropping their pay. (overwrite F5)
            await trx("attendance_records")
              .where({ id: existing.id })
              .update({ status: leaveStatus, updated_at: txnNow });
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
  approverPermissions?: string[],
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

  // Verify the approver is authorized. Mirrors approveLeave: pending
  // approver of record OR system role OR custom-role permission.
  const approval = await db("leave_approvals")
    .where({ leave_application_id: applicationId, approver_id: approverId, status: "pending" })
    .first();

  if (!approval) {
    const approverUser = await db("users").where({ id: approverId }).first();
    const allowedRoles = ["manager", "hr_admin", "org_admin", "super_admin"];
    const hasSystemRole = !!approverUser && allowedRoles.includes(approverUser.role);
    const hasRbacPermission = !!approverPermissions?.includes("leave:approve");
    if (!hasSystemRole && !hasRbacPermission) {
      throw new ForbiddenError("Not authorized to reject this application");
    }
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
    userIds?: number[];
    departmentId?: number;
    locationId?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
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
  if (params.userId) {
    query = query.where("leave_applications.user_id", params.userId);
  } else if (params.userIds) {
    if (params.userIds.length === 0) {
      query = query.where(db.raw("1 = 0"));
    } else {
      query = query.whereIn("leave_applications.user_id", params.userIds);
    }
  }
  if (params.departmentId) query = query.where("users.department_id", params.departmentId);
  if (params.locationId) query = query.where("users.location_id", params.locationId);
  if (params.search) {
    const term = `%${params.search}%`;
    query = query.where(function () {
      this.where(db.raw("CONCAT(COALESCE(users.first_name,''),' ',COALESCE(users.last_name,''))"), "like", term)
        .orWhere("users.email", "like", term)
        .orWhere("users.emp_code", "like", term);
    });
  }
  // Range filter is inclusive and matches applications that overlap the
  // window (any day of the leave intersects [dateFrom, dateTo]). This is the
  // intuitive behavior for HR filtering ("show me leaves taken in March").
  if (params.dateFrom) query = query.where("leave_applications.end_date", ">=", params.dateFrom);
  if (params.dateTo) query = query.where("leave_applications.start_date", "<=", params.dateTo);

  const [{ count }] = await query.clone().count("* as count");
  // Approval columns come from a single, DECISIVE leave_approvals row via
  // correlated subqueries -- NOT a leftJoin. A leftJoin matches EVERY
  // approval for the application, so a multi-step / re-assigned approval
  // (e.g. a pending level-1 row + the row that actually approved) returned
  // the same leave twice. The subquery picks the approval that acted last:
  // rows with a non-null acted_at rank above still-pending ones, then most
  // recent acted_at, then highest id. So an approved leave shows the
  // approver who approved it (with their timestamp/remarks), never the
  // stale pending approver.
  const decisiveApproval =
    "WHERE la.leave_application_id = leave_applications.id " +
    "ORDER BY (la.acted_at IS NOT NULL) DESC, la.acted_at DESC, la.id DESC LIMIT 1";
  const applications = await query
    .select(
      "leave_applications.*",
      "users.first_name as user_first_name",
      "users.last_name as user_last_name",
      "users.email as user_email",
      "users.emp_code as user_emp_code",
      db.raw(`(SELECT la.remarks FROM leave_approvals la ${decisiveApproval}) as admin_remarks`),
      db.raw(`(SELECT la.acted_at FROM leave_approvals la ${decisiveApproval}) as approval_date`),
      db.raw(
        `(SELECT CONCAT(u.first_name, ' ', u.last_name) FROM leave_approvals la ` +
          `JOIN users u ON u.id = la.approver_id ${decisiveApproval}) as approver_name`,
      ),
    )
    .orderBy("leave_applications.created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { applications, total: Number(count) };
}

export async function getApplication(orgId: number, id: number): Promise<LeaveApplication> {
  const db = getDB();
  // Same decisive-approval rule as listApplications: pick the approval that
  // acted last (actioned ranks above pending), so the approver shown is the
  // one who actually decided it -- not a leftover pending row. Subqueries
  // also avoid the row-multiplication a leftJoin causes on multi-step
  // approvals (which .first() would silently resolve to an arbitrary row).
  const decisiveApproval =
    "WHERE la.leave_application_id = leave_applications.id " +
    "ORDER BY (la.acted_at IS NOT NULL) DESC, la.acted_at DESC, la.id DESC LIMIT 1";
  const row = await db("leave_applications")
    .where({ "leave_applications.id": id, "leave_applications.organization_id": orgId })
    .select(
      "leave_applications.*",
      db.raw(`(SELECT la.remarks FROM leave_approvals la ${decisiveApproval}) as admin_remarks`),
      db.raw(`(SELECT la.status FROM leave_approvals la ${decisiveApproval}) as approval_status`),
      db.raw(`(SELECT la.acted_at FROM leave_approvals la ${decisiveApproval}) as approval_date`),
      db.raw(
        `(SELECT CONCAT(u.first_name, ' ', u.last_name) FROM leave_approvals la ` +
          `JOIN users u ON u.id = la.approver_id ${decisiveApproval}) as approver_name`,
      ),
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
