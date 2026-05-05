// =============================================================================
// EMP CLOUD — Leave Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated, sendError } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import { ValidationError } from "../../utils/errors.js";
import * as leaveTypeService from "../../services/leave/leave-type.service.js";
import * as leavePolicyService from "../../services/leave/leave-policy.service.js";
import * as leaveBalanceService from "../../services/leave/leave-balance.service.js";
import * as leaveApplicationService from "../../services/leave/leave-application.service.js";
import * as leaveConfigService from "../../services/leave/leave-config.service.js";
import * as compOffService from "../../services/leave/comp-off.service.js";
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  createLeavePolicySchema,
  applyLeaveSchema,
  approveLeaveSchema,
  createCompOffSchema,
  leaveQuerySchema,
  initializeBalancesSchema,
  updateLeaveOrgConfigSchema,
  overrideLeaveBalanceSchema,
  bulkOverrideLeaveBalanceSchema,
  resetPeriodUsageSchema,
  employeeLeavesQuerySchema,
  AuditAction,
  ROLE_HIERARCHY,
} from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

/** Check if user role is plain employee (below manager level) */
function isEmployeeRole(role: string): boolean {
  const level = ROLE_HIERARCHY[role as UserRole] ?? 0;
  return level < (ROLE_HIERARCHY["manager" as UserRole] ?? 20);
}

const router = Router();

// ===========================================================================
// Leave Types
// ===========================================================================

// GET /api/v1/leave/types
router.get("/types", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const types = await leaveTypeService.listLeaveTypes(req.user!.org_id);
    sendSuccess(res, types);
  } catch (err) { next(err); }
});

// GET /api/v1/leave/types/:id
router.get("/types/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = await leaveTypeService.getLeaveType(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, type);
  } catch (err) { next(err); }
});

// POST /api/v1/leave/types
router.post("/types", authenticate, requirePermission("leave:manage_policies"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createLeaveTypeSchema.parse(req.body);
    const type = await leaveTypeService.createLeaveType(req.user!.org_id, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.LEAVE_APPLIED,
      resourceType: "leave_type",
      resourceId: String(type.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, type, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/leave/types/:id
router.put("/types/:id", authenticate, requirePermission("leave:manage_policies"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateLeaveTypeSchema.parse(req.body);
    const type = await leaveTypeService.updateLeaveType(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, type);
  } catch (err) { next(err); }
});

// DELETE /api/v1/leave/types/:id
router.delete("/types/:id", authenticate, requirePermission("leave:manage_policies"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await leaveTypeService.deleteLeaveType(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Leave type deactivated" });
  } catch (err) { next(err); }
});

// #1362 — POST /api/v1/leave/types/:id/reactivate
router.post("/types/:id/reactivate", authenticate, requirePermission("leave:manage_policies"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = await leaveTypeService.reactivateLeaveType(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, type);
  } catch (err) { next(err); }
});

// ===========================================================================
// Leave Policies
// ===========================================================================

// GET /api/v1/leave/policies
router.get("/policies", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await leavePolicyService.listLeavePolicies(req.user!.org_id);
    sendSuccess(res, policies);
  } catch (err) { next(err); }
});

// GET /api/v1/leave/policies/:id
router.get("/policies/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policy = await leavePolicyService.getLeavePolicy(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, policy);
  } catch (err) { next(err); }
});

// POST /api/v1/leave/policies
router.post("/policies", authenticate, requirePermission("leave:manage_policies"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createLeavePolicySchema.parse(req.body);
    const policy = await leavePolicyService.createLeavePolicy(req.user!.org_id, data);
    sendSuccess(res, policy, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/leave/policies/:id
router.put("/policies/:id", authenticate, requirePermission("leave:manage_policies"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createLeavePolicySchema.partial().parse(req.body);
    const policy = await leavePolicyService.updateLeavePolicy(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, policy);
  } catch (err) { next(err); }
});

// DELETE /api/v1/leave/policies/:id
router.delete("/policies/:id", authenticate, requirePermission("leave:manage_policies"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await leavePolicyService.deleteLeavePolicy(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Leave policy deactivated" });
  } catch (err) { next(err); }
});

// ===========================================================================
// Leave Balances
// ===========================================================================

// GET /api/v1/leave/balances
router.get("/balances", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedUserId = req.query.user_id ? Number(req.query.user_id) : req.user!.sub;
    // RBAC: if requesting another user's balance, require HR+ role
    if (requestedUserId !== req.user!.sub) {
      const userRoleLevel = ROLE_HIERARCHY[req.user!.role as UserRole] ?? 0;
      const hrLevel = ROLE_HIERARCHY["hr_admin" as UserRole] ?? 60;
      if (userRoleLevel < hrLevel) {
        return sendError(res, 403, "FORBIDDEN", "Only HR or above can view other users' leave balances");
      }
    }
    const year = req.query.year ? Number(req.query.year) : undefined;
    const balances = await leaveBalanceService.getBalances(req.user!.org_id, requestedUserId, year);
    sendSuccess(res, balances);
  } catch (err) { next(err); }
});

// POST /api/v1/leave/balances/initialize
router.post("/balances/initialize", authenticate, requirePermission("leave:override_balance"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year } = initializeBalancesSchema.parse(req.body);
    const created = await leaveBalanceService.initializeBalances(req.user!.org_id, year);
    sendSuccess(res, { initialized: created }, 201);
  } catch (err) { next(err); }
});

// ===========================================================================
// Leave Balances — /me shortcut
// ===========================================================================

// GET /api/v1/leave/balances/me — shortcut for current user's balances
router.get("/balances/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const balances = await leaveBalanceService.getBalances(req.user!.org_id, req.user!.sub, year);
    sendSuccess(res, balances);
  } catch (err) { next(err); }
});

// ===========================================================================
// Leave Applications
// ===========================================================================

// GET /api/v1/leave/applications/me — current user's applications
router.get("/applications/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page, status, leave_type_id } = leaveQuerySchema.parse(req.query);
    const result = await leaveApplicationService.listApplications(req.user!.org_id, {
      page,
      perPage: per_page,
      status,
      leaveTypeId: leave_type_id,
      userId: req.user!.sub,
    });
    sendPaginated(res, result.applications, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/leave/applications
router.get("/applications", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page, status, leave_type_id, user_id } = leaveQuerySchema.parse(req.query);

    // RBAC: employees can only view their own leave applications
    const effectiveUserId = isEmployeeRole(req.user!.role) ? req.user!.sub : user_id;

    const result = await leaveApplicationService.listApplications(req.user!.org_id, {
      page,
      perPage: per_page,
      status,
      leaveTypeId: leave_type_id,
      userId: effectiveUserId,
    });
    sendPaginated(res, result.applications, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/leave/applications/:id
router.get("/applications/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const application = await leaveApplicationService.getApplication(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, application);
  } catch (err) { next(err); }
});

// POST /api/v1/leave/applications
router.post("/applications", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = applyLeaveSchema.parse(req.body);
    const application = await leaveApplicationService.applyLeave(req.user!.org_id, req.user!.sub, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.LEAVE_APPLIED,
      resourceType: "leave_application",
      resourceId: String(application.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, application, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/leave/applications/:id — update (cancel) a leave application
router.put("/applications/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (status !== "cancelled") {
      throw new ValidationError(
        "Only status 'cancelled' is supported via this endpoint",
      );
    }

    const application = await leaveApplicationService.cancelLeave(
      req.user!.org_id,
      req.user!.sub,
      paramInt(req.params.id),
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.LEAVE_CANCELLED,
      resourceType: "leave_application",
      resourceId: String(application.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, application);
  } catch (err) { next(err); }
});

// PUT /api/v1/leave/applications/:id/approve
router.put("/applications/:id/approve", authenticate, requirePermission("leave:approve"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { remarks } = approveLeaveSchema.parse({ ...req.body, status: "approved" });
    const application = await leaveApplicationService.approveLeave(
      req.user!.org_id,
      req.user!.sub,
      paramInt(req.params.id),
      remarks,
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.LEAVE_APPROVED,
      resourceType: "leave_application",
      resourceId: String(application.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, application);
  } catch (err) { next(err); }
});

// PUT /api/v1/leave/applications/:id/reject
router.put("/applications/:id/reject", authenticate, requirePermission("leave:approve"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { remarks } = approveLeaveSchema.parse({ ...req.body, status: "rejected" });
    const application = await leaveApplicationService.rejectLeave(
      req.user!.org_id,
      req.user!.sub,
      paramInt(req.params.id),
      remarks,
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.LEAVE_REJECTED,
      resourceType: "leave_application",
      resourceId: String(application.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, application);
  } catch (err) { next(err); }
});

// PUT /api/v1/leave/applications/:id/cancel
router.put("/applications/:id/cancel", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const application = await leaveApplicationService.cancelLeave(
      req.user!.org_id,
      req.user!.sub,
      paramInt(req.params.id),
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.LEAVE_CANCELLED,
      resourceType: "leave_application",
      resourceId: String(application.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, application);
  } catch (err) { next(err); }
});

// GET /api/v1/leave/calendar
router.get("/calendar", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const calendar = await leaveApplicationService.getLeaveCalendar(req.user!.org_id, month, year);
    sendSuccess(res, calendar);
  } catch (err) { next(err); }
});

// ===========================================================================
// Leave Configuration (org-level, HR-only)
// ===========================================================================

// GET /api/v1/leave/config — fiscal year start month + current FY label
router.get("/config", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await leaveConfigService.getLeaveOrgConfig(req.user!.org_id);
    sendSuccess(res, config);
  } catch (err) { next(err); }
});

// PUT /api/v1/leave/config — update fiscal year start month
router.put("/config", authenticate, requirePermission("leave:manage_policies"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateLeaveOrgConfigSchema.parse(req.body);
    const config = await leaveConfigService.updateLeaveOrgConfig(req.user!.org_id, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.LEAVE_CONFIG_UPDATED,
      resourceType: "leave_config",
      resourceId: String(req.user!.org_id),
      details: { fiscal_year_start_month: data.fiscal_year_start_month },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, config);
  } catch (err) { next(err); }
});

// ===========================================================================
// Admin — Employee Leaves (HR view + override)
// ===========================================================================

// GET /api/v1/leave/admin/employees — paginated employee balance summary
router.get("/admin/employees", authenticate, requirePermission("leave:view_all"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page, search, department_id, year } = employeeLeavesQuerySchema.parse(req.query);
    const result = await leaveBalanceService.listEmployeeBalances(req.user!.org_id, {
      page,
      perPage: per_page,
      search,
      departmentId: department_id,
      year,
    });
    sendPaginated(res, result.employees, result.total, page, per_page);
  } catch (err) { next(err); }
});

// PUT /api/v1/leave/admin/balances/:balanceId — adjust extra_allocated and/or total_used
router.put("/admin/balances/:balanceId", authenticate, requirePermission("leave:override_balance"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = overrideLeaveBalanceSchema.parse(req.body);
    const { before, after } = await leaveBalanceService.overrideBalance(
      req.user!.org_id,
      paramInt(req.params.balanceId),
      req.user!.sub,
      data,
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.LEAVE_BALANCE_OVERRIDDEN,
      resourceType: "leave_balance",
      resourceId: String(after.id),
      details: {
        target_user_id: after.user_id,
        leave_type_id: after.leave_type_id,
        before: {
          extra_allocated: before.extra_allocated,
          total_used: before.total_used,
        },
        after: {
          extra_allocated: after.extra_allocated,
          total_used: after.total_used,
        },
        reason: data.reason,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, after);
  } catch (err) { next(err); }
});

// POST /api/v1/leave/admin/balances/bulk — bulk grant/remove extra_allocated
router.post("/admin/balances/bulk", authenticate, requirePermission("leave:override_balance"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = bulkOverrideLeaveBalanceSchema.parse(req.body);
    const affected = await leaveBalanceService.bulkOverrideBalance(
      req.user!.org_id,
      req.user!.sub,
      data,
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.LEAVE_BALANCE_BULK_OVERRIDDEN,
      resourceType: "leave_balance",
      resourceId: `bulk:${affected.length}`,
      details: {
        leave_type_id: data.leave_type_id,
        extra_allocated_delta: data.extra_allocated_delta,
        affected_user_ids: affected,
        reason: data.reason,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, { affected });
  } catch (err) { next(err); }
});

// POST /api/v1/leave/admin/balances/:balanceId/reset-period — reset period_used
router.post(
  "/admin/balances/:balanceId/reset-period",
  authenticate,
  requirePermission("leave:override_balance"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = resetPeriodUsageSchema.parse(req.body);
      const result = await leaveBalanceService.resetPeriodUsage(
        req.user!.org_id,
        paramInt(req.params.balanceId),
        req.user!.sub,
        data.reason,
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.LEAVE_PERIOD_RESET,
        resourceType: "leave_balance",
        resourceId: String(result.id),
        details: { reason: data.reason },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// ===========================================================================
// Comp-Off
// ===========================================================================

// GET /api/v1/leave/comp-off/my — My comp-off requests
router.get("/comp-off/my", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 20;
    const status = req.query.status as string | undefined;
    const result = await compOffService.listCompOffs(req.user!.org_id, { page, perPage, userId: req.user!.sub, status });
    sendPaginated(res, result.requests, result.total, page, perPage);
  } catch (err) { next(err); }
});

// GET /api/v1/leave/comp-off/pending — Pending comp-off approvals (HR/manager only)
router.get("/comp-off/pending", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 20;

    // RBAC: employees can only see their own pending comp-offs
    const effectiveUserId = isEmployeeRole(req.user!.role) ? req.user!.sub : undefined;

    const result = await compOffService.listCompOffs(req.user!.org_id, { page, perPage, status: "pending", userId: effectiveUserId });
    sendPaginated(res, result.requests, result.total, page, perPage);
  } catch (err) { next(err); }
});

// POST /api/v1/leave/comp-off/balance/adjust — HR-only manual credit/debit
// of an employee's comp-off balance (bypasses the request/approve flow).
// #1933 — admins had no way to grant comp-off without an employee request.
router.post("/comp-off/balance/adjust", authenticate, requirePermission("leave:override_balance"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.body.user_id);
    const days = Number(req.body.days);
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() || undefined : undefined;
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new ValidationError("user_id is required");
    }
    const result = await compOffService.adjustCompOffBalance(req.user!.org_id, userId, days, reason);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.LEAVE_BALANCE_ADJUSTED,
      resourceType: "leave_balance",
      resourceId: `comp_off:user:${userId}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      details: { days, reason: reason ?? null, ...result },
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// GET /api/v1/leave/comp-off/balance — My comp-off leave balance
router.get("/comp-off/balance", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (await import("../../db/connection.js")).getDB();
    const year = Number(req.query.year) || new Date().getFullYear();
    const compOffType = await db("leave_types")
      .where({ organization_id: req.user!.org_id, code: "COMP_OFF" })
      .first();
    if (!compOffType) {
      sendSuccess(res, { balance: 0, total_allocated: 0, total_used: 0, year });
      return;
    }
    const balance = await db("leave_balances")
      .where({
        organization_id: req.user!.org_id,
        user_id: req.user!.sub,
        leave_type_id: compOffType.id,
        year,
      })
      .first();
    sendSuccess(res, balance || { balance: 0, total_allocated: 0, total_used: 0, year });
  } catch (err) { next(err); }
});

// GET /api/v1/leave/comp-off
router.get("/comp-off", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 20;
    const userId = req.query.user_id ? Number(req.query.user_id) : undefined;
    const status = req.query.status as string | undefined;

    // RBAC: employees can only see their own comp-off requests
    const effectiveUserId = isEmployeeRole(req.user!.role) ? req.user!.sub : userId;

    const result = await compOffService.listCompOffs(req.user!.org_id, { page, perPage, userId: effectiveUserId, status });
    sendPaginated(res, result.requests, result.total, page, perPage);
  } catch (err) { next(err); }
});

// POST /api/v1/leave/comp-off — Request comp-off
router.post("/comp-off", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createCompOffSchema.parse(req.body);
    const request = await compOffService.requestCompOff(req.user!.org_id, req.user!.sub, data);
    sendSuccess(res, request, 201);
  } catch (err) { next(err); }
});

// POST /api/v1/leave/comp-off/request — Alias for requesting comp-off
router.post("/comp-off/request", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createCompOffSchema.parse(req.body);
    const request = await compOffService.requestCompOff(req.user!.org_id, req.user!.sub, data);
    sendSuccess(res, request, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/leave/comp-off/:id/approve
router.put("/comp-off/:id/approve", authenticate, requirePermission("leave:approve"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const request = await compOffService.approveCompOff(req.user!.org_id, req.user!.sub, paramInt(req.params.id));
    sendSuccess(res, request);
  } catch (err) { next(err); }
});

// PUT /api/v1/leave/comp-off/:id/reject
router.put("/comp-off/:id/reject", authenticate, requirePermission("leave:approve"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reason = req.body.reason as string | undefined;
    const request = await compOffService.rejectCompOff(req.user!.org_id, req.user!.sub, paramInt(req.params.id), reason);
    sendSuccess(res, request);
  } catch (err) { next(err); }
});

export default router;
