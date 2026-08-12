// =============================================================================
// EMP CLOUD — Attendance Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as shiftService from "../../services/attendance/shift.service.js";
import * as attendanceService from "../../services/attendance/attendance.service.js";
import * as leaveApplicationService from "../../services/leave/leave-application.service.js";
import * as leaveBalanceService from "../../services/leave/leave-balance.service.js";
import * as geoFenceService from "../../services/attendance/geo-fence.service.js";
import * as regularizationService from "../../services/attendance/regularization.service.js";
import * as settingsService from "../../services/attendance/attendance-settings.service.js";
import * as attendanceReportService from "../../services/attendance/attendance-report.service.js";
import {
  createShiftSchema,
  updateShiftSchema,
  assignShiftSchema,
  bulkAssignShiftSchema,
  updateShiftAssignmentSchema,
  shiftSwapRequestSchema,
  shiftScheduleQuerySchema,
  createGeoFenceSchema,
  checkInSchema,
  checkOutSchema,
  createRegularizationSchema,
  approveRegularizationSchema,
  attendanceQuerySchema,
  paginationSchema,
  updateAttendanceSettingsSchema,
  createUserAttendanceOverrideSchema,
  updateUserAttendanceOverrideSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// =============================================================================
// SHIFTS
// =============================================================================

// GET /api/v1/attendance/shifts
router.get("/shifts", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shifts = await shiftService.listShifts(req.user!.org_id);
    sendSuccess(res, shifts);
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/shifts
router.post("/shifts", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createShiftSchema.parse(req.body);
    const shift = await shiftService.createShift(req.user!.org_id, data);
    sendSuccess(res, shift, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/attendance/shifts/:id
router.put("/shifts/:id", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateShiftSchema.parse(req.body);
    const shift = await shiftService.updateShift(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, shift);
  } catch (err) { next(err); }
});

// DELETE /api/v1/attendance/shifts/:id
router.delete("/shifts/:id", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await shiftService.deleteShift(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Shift deactivated" });
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/shifts/assign
router.post("/shifts/assign", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = assignShiftSchema.parse(req.body);
    const assignment = await shiftService.assignShift(req.user!.org_id, data, req.user!.sub);
    sendSuccess(res, assignment, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/shifts/assignments
router.get("/shifts/assignments", authenticate, requirePermission("attendance:view_all", "attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.query.user_id ? Number(req.query.user_id) : undefined;
    const shiftId = req.query.shift_id ? Number(req.query.shift_id) : undefined;
    const assignments = await shiftService.listShiftAssignments(req.user!.org_id, { user_id: userId, shift_id: shiftId });
    sendSuccess(res, assignments);
  } catch (err) { next(err); }
});

// PUT /api/v1/attendance/shifts/assignments/:id
router.put("/shifts/assignments/:id", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateShiftAssignmentSchema.parse(req.body);
    const assignment = await shiftService.updateShiftAssignment(req.user!.org_id, paramInt(req.params.id), data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SHIFT_ASSIGNMENT_UPDATED,
      resourceType: "shift_assignment",
      resourceId: String(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, assignment);
  } catch (err) { next(err); }
});

// DELETE /api/v1/attendance/shifts/assignments/:id
router.delete("/shifts/assignments/:id", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await shiftService.deleteShiftAssignment(req.user!.org_id, paramInt(req.params.id));

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SHIFT_ASSIGNMENT_DELETED,
      resourceType: "shift_assignment",
      resourceId: String(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, { message: "Shift assignment removed" });
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/shifts/bulk-assign
router.post("/shifts/bulk-assign", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = bulkAssignShiftSchema.parse(req.body);
    const result = await shiftService.bulkAssignShifts(req.user!.org_id, data, req.user!.sub);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SHIFT_BULK_ASSIGNED,
      resourceType: "shift_assignment",
      resourceId: String(data.shift_id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/shifts/schedule
router.get("/shifts/schedule", authenticate, requirePermission("attendance:view_all", "attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = shiftScheduleQuerySchema.parse(req.query);
    const schedule = await shiftService.getSchedule(req.user!.org_id, params);
    sendSuccess(res, schedule);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/shifts/my-schedule
router.get("/shifts/my-schedule", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await shiftService.getMySchedule(req.user!.org_id, req.user!.sub);
    sendSuccess(res, schedule);
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/shifts/swap-request
router.post("/shifts/swap-request", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = shiftSwapRequestSchema.parse(req.body);
    const result = await shiftService.createSwapRequest(req.user!.org_id, req.user!.sub, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SHIFT_SWAP_REQUESTED,
      resourceType: "shift_swap_request",
      resourceId: String(result.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/shifts/swap-requests
router.get("/shifts/swap-requests", authenticate, requirePermission("attendance:view_all", "attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const requests = await shiftService.listSwapRequests(req.user!.org_id, { status });
    sendSuccess(res, requests);
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/shifts/swap-requests/:id/approve
router.post("/shifts/swap-requests/:id/approve", authenticate, requirePermission("attendance:approve_regularization_team", "attendance:approve_regularization_all", "attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await shiftService.approveSwapRequest(req.user!.org_id, paramInt(req.params.id), req.user!.sub);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SHIFT_SWAP_APPROVED,
      resourceType: "shift_swap_request",
      resourceId: String(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/shifts/swap-requests/:id/reject
router.post("/shifts/swap-requests/:id/reject", authenticate, requirePermission("attendance:approve_regularization_team", "attendance:approve_regularization_all", "attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await shiftService.rejectSwapRequest(req.user!.org_id, paramInt(req.params.id), req.user!.sub);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SHIFT_SWAP_REJECTED,
      resourceType: "shift_swap_request",
      resourceId: String(req.params.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/shifts/:id
router.get("/shifts/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shift = await shiftService.getShift(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, shift);
  } catch (err) { next(err); }
});

// =============================================================================
// GEO-FENCES
// =============================================================================

// GET /api/v1/attendance/geo-fences
router.get("/geo-fences", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fences = await geoFenceService.listGeoFences(req.user!.org_id);
    sendSuccess(res, fences);
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/geo-fences
router.post("/geo-fences", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createGeoFenceSchema.parse(req.body);
    const fence = await geoFenceService.createGeoFence(req.user!.org_id, data);
    sendSuccess(res, fence, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/attendance/geo-fences/:id
router.put("/geo-fences/:id", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createGeoFenceSchema.partial().parse(req.body);
    const fence = await geoFenceService.updateGeoFence(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, fence);
  } catch (err) { next(err); }
});

// DELETE /api/v1/attendance/geo-fences/:id
router.delete("/geo-fences/:id", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await geoFenceService.deleteGeoFence(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Geo-fence deactivated" });
  } catch (err) { next(err); }
});

// =============================================================================
// ATTENDANCE SETTINGS — channels + geofence delivery
//
// `/me/policy` is the resolver-backed endpoint the EmpCloud mobile app calls
// on launch (and before each check-in tap) to learn which channels are
// allowed for the signed-in user and which geofences to validate against
// locally. Server does NOT enforce distance — it only enforces channel.
// =============================================================================

// GET /api/v1/attendance/me/policy
router.get("/me/policy", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const policy = await settingsService.resolveAttendancePolicy(req.user!.org_id, req.user!.sub, date);
    sendSuccess(res, policy);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/settings — org settings (HR / org_admin)
router.get("/settings", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await settingsService.getSettings(req.user!.org_id);
    sendSuccess(res, settings);
  } catch (err) { next(err); }
});

// PUT /api/v1/attendance/settings — update org settings
router.put("/settings", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateAttendanceSettingsSchema.parse(req.body);
    const settings = await settingsService.updateSettings(req.user!.org_id, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.ATTENDANCE_SETTINGS_UPDATED,
      resourceType: "attendance_settings",
      details: data,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, settings);
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/settings/telegram/test — send the daily attendance
// report to this org's configured chats right now. Defaults to the last
// completed day, i.e. exactly what the midnight cron would deliver.
router.post(
  "/settings/telegram/test",
  authenticate,
  requirePermission("attendance:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const date = typeof req.body?.date === "string" ? req.body.date : undefined;
      const result = await attendanceReportService.sendTestReportForOrg(req.user!.org_id, date);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// GET /api/v1/attendance/overrides/users/:userId — list overrides for one user
router.get(
  "/overrides/users/:userId",
  authenticate,
  requirePermission("attendance:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const overrides = await settingsService.listUserOverrides(
        req.user!.org_id,
        paramInt(req.params.userId),
      );
      sendSuccess(res, overrides);
    } catch (err) { next(err); }
  },
);

// POST /api/v1/attendance/overrides/users/:userId — create a new override
router.post(
  "/overrides/users/:userId",
  authenticate,
  requirePermission("attendance:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createUserAttendanceOverrideSchema.parse(req.body);
      const userId = paramInt(req.params.userId);
      const created = await settingsService.createUserOverride(
        req.user!.org_id,
        userId,
        req.user!.sub,
        data,
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.ATTENDANCE_OVERRIDE_CREATED,
        resourceType: "attendance_override",
        resourceId: String(created!.id),
        details: { user_id: userId, ...data },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, created, 201);
    } catch (err) { next(err); }
  },
);

// PUT /api/v1/attendance/overrides/:id — edit an override
router.put(
  "/overrides/:id",
  authenticate,
  requirePermission("attendance:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateUserAttendanceOverrideSchema.parse(req.body);
      const id = paramInt(req.params.id);
      const updated = await settingsService.updateUserOverride(req.user!.org_id, id, data);

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.ATTENDANCE_OVERRIDE_UPDATED,
        resourceType: "attendance_override",
        resourceId: String(id),
        details: data,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, updated);
    } catch (err) { next(err); }
  },
);

// DELETE /api/v1/attendance/overrides/:id — drop an override (immediate fallback)
router.delete(
  "/overrides/:id",
  authenticate,
  requirePermission("attendance:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = paramInt(req.params.id);
      await settingsService.deleteUserOverride(req.user!.org_id, id);

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.ATTENDANCE_OVERRIDE_DELETED,
        resourceType: "attendance_override",
        resourceId: String(id),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, { message: "Override deleted" });
    } catch (err) { next(err); }
  },
);

// =============================================================================
// ATTENDANCE RECORDS
// =============================================================================

// POST /api/v1/attendance/check-in
router.post("/check-in", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = checkInSchema.parse(req.body);
    const record = await attendanceService.checkIn(req.user!.org_id, req.user!.sub, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.ATTENDANCE_CHECKIN,
      resourceType: "attendance",
      resourceId: String((record as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, record, 201);
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/check-out
router.post("/check-out", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = checkOutSchema.parse(req.body);
    const record = await attendanceService.checkOut(req.user!.org_id, req.user!.sub, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.ATTENDANCE_CHECKOUT,
      resourceType: "attendance",
      resourceId: String((record as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, record);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/me/today
router.get("/me/today", authenticate, requirePermission("attendance:view", "attendance:view_team", "attendance:view_all", "attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await attendanceService.getMyToday(req.user!.org_id, req.user!.sub);
    sendSuccess(res, record);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/me/history
//
// Returns one row per calendar day in the requested month (defaults to the
// current month). Days with no attendance_records row come back synthesized
// with status="absent" so the My Attendance page never has gaps. Because
// the response is bounded (28-31 days), pagination is no-op here — we emit
// total_pages=1 by setting per_page = records.length.
router.get("/me/history", authenticate, requirePermission("attendance:view", "attendance:view_team", "attendance:view_all", "attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = attendanceQuerySchema.parse(req.query);
    const result = await attendanceService.getMyHistory(req.user!.org_id, req.user!.sub, {
      month: params.month,
      year: params.year,
    });
    sendPaginated(res, result.records, result.total, 1, Math.max(result.records.length, 1));
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/records
//
// RBAC v1 — three scope tiers, evaluated against the JWT permissions claim:
//   - attendance:view_all (or HR role)              -> any record in the org
//   - attendance:view_team / approve_regularization -> caller's direct + additional reports
//   - everyone else                                 -> own records only
router.get("/records", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = attendanceQuerySchema.parse(req.query);
    const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];
    const isHR = HR_ROLES.includes(req.user!.role);
    const perms = (req.user as any).permissions as string[] | undefined;
    const has = (k: string) => Array.isArray(perms) && perms.includes(k);

    // Scope is driven ONLY by the view_* permissions. `manage` and
    // `approve_regularization` are action permissions — they say what the
    // user can do, not how broadly they can see. So a custom role with
    // (view_team + manage) sees only their team's records but can act on
    // them. (HR roles still have implicit org-wide visibility.)
    const canSeeAll = isHR || has("attendance:view_all");
    const canSeeTeam = has("attendance:view_team");

    let user_id: number | undefined;
    let department_id: number | undefined;
    let user_ids: number[] | undefined;

    if (canSeeAll) {
      user_id = params.user_id || params.employee_id;
      department_id = params.department_id;
    } else if (canSeeTeam) {
      // Resolve the caller's team (primary reports + additional managers)
      // and scope the query to that set. If the caller passed a user_id,
      // require it to be in their team.
      const { resolveTeamMemberIds } = await import(
        "../../services/team/team-resolver.service.js"
      );
      const teamIds = await resolveTeamMemberIds(req.user!.org_id, req.user!.sub);
      const requested = params.user_id || params.employee_id;
      if (requested != null) {
        user_id = teamIds.includes(Number(requested)) ? Number(requested) : -1;
      } else if (teamIds.length === 0) {
        user_id = -1; // no reports → no records
      } else {
        user_ids = teamIds;
      }
    } else {
      user_id = req.user!.sub;
    }

    const result = await attendanceService.listRecords(req.user!.org_id, {
      page: params.page,
      perPage: params.per_page,
      month: params.month,
      year: params.year,
      date: params.date,
      date_from: params.date_from,
      date_to: params.date_to,
      user_id,
      user_ids,
      department_id,
      location_id: params.location_id,
      role: params.role,
      search: params.search,
    });
    sendPaginated(res, result.records, result.total, params.page, params.per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/records/:id/punches
// Returns the multi-punch timeline for a single attendance record.
// Access tiers (RBAC v1):
//   - HR / view_all / manage      -> any record in the org
//   - view_team                   -> records belonging to caller's team
//                                    (direct + additional reports)
//   - everyone else               -> own records only
router.get("/records/:id/punches", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recordId = paramInt(req.params.id);
    const result = await attendanceService.listPunches(req.user!.org_id, recordId);
    const targetUserId = Number(result.record.user_id);

    const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];
    const isHR = HR_ROLES.includes(req.user!.role);
    const perms = (req.user as any).permissions as string[] | undefined;
    const has = (k: string) => Array.isArray(perms) && perms.includes(k);

    let allowed = isHR
      || has("attendance:view_all")
      || has("attendance:manage")
      || targetUserId === Number(req.user!.sub);

    if (!allowed && has("attendance:view_team")) {
      const { isManagerOf } = await import(
        "../../services/team/team-resolver.service.js"
      );
      allowed = await isManagerOf(req.user!.org_id, req.user!.sub, targetUserId);
    }

    if (!allowed) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Cannot view another user's punches" } });
    }
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Helper: resolve the user_ids the caller is allowed to see for attendance.
// Returns null when the caller can see everyone (org-wide). Returns an array
// (possibly empty) when the caller is team-scoped. Used by /dashboard and
// /dashboard/breakdown so the metric cards reflect the same scope as the
// records grid.
async function resolveAttendanceScope(req: Request): Promise<number[] | null> {
  const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];
  const isHR = HR_ROLES.includes(req.user!.role);
  const perms = (req.user as any).permissions as string[] | undefined;
  const has = (k: string) => Array.isArray(perms) && perms.includes(k);
  if (isHR || has("attendance:view_all")) return null; // org-wide
  if (has("attendance:view_team")) {
    const { resolveTeamMemberIds } = await import(
      "../../services/team/team-resolver.service.js"
    );
    return resolveTeamMemberIds(req.user!.org_id, req.user!.sub);
  }
  return [req.user!.sub];
}

// GET /api/v1/attendance/dashboard
router.get(
  "/dashboard",
  authenticate,
  requirePermission(
    "attendance:view_all",
    "attendance:view_team",
    "attendance:approve_regularization_team", "attendance:approve_regularization_all",
    "attendance:manage",
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userIds = await resolveAttendanceScope(req);
      const stats = await attendanceService.getDashboard(req.user!.org_id, userIds ?? undefined);
      sendSuccess(res, stats);
    } catch (err) { next(err); }
  },
);

// GET /api/v1/attendance/dashboard/breakdown?date=YYYY-MM-DD
// Returns the list of employees grouped by attendance status for the given date
// (defaults to today). Used by the "click stat card to view details" flow.
router.get(
  "/dashboard/breakdown",
  authenticate,
  requirePermission(
    "attendance:view_all",
    "attendance:view_team",
    "attendance:approve_regularization_team", "attendance:approve_regularization_all",
    "attendance:manage",
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const date = typeof req.query.date === "string" ? req.query.date : undefined;
      const userIds = await resolveAttendanceScope(req);
      const breakdown = await attendanceService.getDashboardBreakdown(
        req.user!.org_id,
        date,
        userIds ?? undefined,
      );
      sendSuccess(res, breakdown);
    } catch (err) { next(err); }
  },
);

// GET /api/v1/attendance/monthly-report
router.get("/monthly-report", authenticate, requirePermission("attendance:view_all"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();
    const userId = req.query.user_id ? Number(req.query.user_id) : undefined;
    const report = await attendanceService.getMonthlyReport(req.user!.org_id, { month, year, user_id: userId });
    sendSuccess(res, report);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/late-counts?date_from=&date_to=&department_id=&location_id=
// Per-employee count of LATE days in the given date range — drives the "Late"
// tab range view (Last 15 days / This month / custom). Same "late" definition
// and scope resolution as /dashboard so it stays consistent with the card.
// Defaults to the current calendar month when the range is not supplied.
router.get(
  "/late-counts",
  authenticate,
  requirePermission(
    "attendance:view_all",
    "attendance:view_team",
    "attendance:approve_regularization_team", "attendance:approve_regularization_all",
    "attendance:manage",
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
      const monthEnd = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      // Basic YYYY-MM-DD guard; fall back to the current month on missing/garbage.
      const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
      const dateFrom = isDate(req.query.date_from) ? req.query.date_from : monthStart;
      const dateTo = isDate(req.query.date_to) ? req.query.date_to : monthEnd;
      const departmentId = req.query.department_id ? Number(req.query.department_id) : undefined;
      const locationId = req.query.location_id ? Number(req.query.location_id) : undefined;
      const userIds = await resolveAttendanceScope(req);
      const result = await attendanceService.getLateCounts(
        req.user!.org_id,
        { date_from: dateFrom, date_to: dateTo, department_id: departmentId, location_id: locationId },
        userIds ?? undefined,
      );
      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// GET /api/v1/attendance/grid?month=&year= — per-employee per-day matrix.
// Powers the new Attendance Grid page (date columns 1..31 with single-letter
// status codes P / A / H / L / WO / HO).
router.get("/grid", authenticate, requirePermission("attendance:view_all", "attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();
    const grid = await attendanceService.getMonthlyGrid(req.user!.org_id, { month, year });
    sendSuccess(res, grid);
  } catch (err) { next(err); }
});

// PUT /api/v1/attendance/cell — upsert a single (user, date) attendance row.
// Body: { user_id: number, date: "YYYY-MM-DD", code: "P"|"A"|"H"|"L"|"" }
router.put("/cell", authenticate, requirePermission("attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, date, code } = req.body || {};
    if (!user_id || !date) throw new Error("user_id and date are required");
    const result = await attendanceService.updateAttendanceCell(req.user!.org_id, {
      userId: Number(user_id),
      date: String(date),
      actorUserId: req.user!.sub,
      code: String(code ?? ""),
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/grid/leave-context?user_id=X&date=YYYY-MM-DD
// Powers the cell editor popover on the Attendance Grid -- returns the
// org's active leave types with the user's available balance, plus any
// existing leave applications that overlap the selected date.
router.get(
  "/grid/leave-context",
  authenticate,
  requirePermission("attendance:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.query.user_id);
      const date = String(req.query.date || "");
      if (!userId || !date) throw new Error("user_id and date are required");
      const orgId = req.user!.org_id;
      const db = (await import("../../db/connection.js")).getDB();

      const [types, balances, existing] = await Promise.all([
        db("leave_types")
          .where({ organization_id: orgId, is_active: true })
          .select("id", "name", "code", "color", "requires_approval")
          .orderBy("name", "asc"),
        leaveBalanceService.getBalances(orgId, userId),
        db("leave_applications")
          .leftJoin("leave_types", "leave_applications.leave_type_id", "leave_types.id")
          .where({
            "leave_applications.organization_id": orgId,
            "leave_applications.user_id": userId,
          })
          .whereNotIn("leave_applications.status", ["cancelled", "rejected"])
          .where("leave_applications.start_date", "<=", date)
          .where("leave_applications.end_date", ">=", date)
          .select(
            "leave_applications.id",
            "leave_applications.leave_type_id",
            "leave_applications.status",
            "leave_applications.start_date",
            "leave_applications.end_date",
            "leave_applications.days_count",
            "leave_applications.is_half_day",
            "leave_applications.half_day_type",
            "leave_applications.reason",
            "leave_types.name as leave_type_name",
            "leave_types.color as leave_type_color",
          ),
      ]);

      // Merge balance into each type. Use .find() (first match) instead of
      // a Map (which overwrites with the last) so the popover sees the same
      // balance row that applyLeave will validate against -- otherwise a
      // duplicate balance row produces "1 left" in the popover but
      // "0 available" on submit.
      const balanceFor = (id: number) =>
        balances.find((b: any) => Number(b.leave_type_id) === id);
      const merged = types.map((t: any) => {
        const b = balanceFor(Number(t.id));
        return {
          id: t.id,
          name: t.name,
          code: t.code,
          color: t.color,
          requires_approval: !!t.requires_approval,
          available_now: b ? Number((b as any).available_now ?? b.balance ?? 0) : 0,
          fiscal_year_label: b ? (b as any).fiscal_year_label : null,
        };
      });

      sendSuccess(res, { leaveTypes: merged, existingApplications: existing });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/attendance/grid/apply-leave
// HR applies a single-day leave on behalf of an employee from the grid.
// Creates a leave application then immediately approves it -- the existing
// approveLeave path handles balance deduction and writes
// attendance_records.status = 'on_leave' for the date.
router.post(
  "/grid/apply-leave",
  authenticate,
  requirePermission("attendance:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, date, leave_type_id, is_half_day, half_day_type } = req.body || {};
      if (!user_id || !date || !leave_type_id) {
        throw new Error("user_id, date and leave_type_id are required");
      }
      const orgId = req.user!.org_id;
      const halfDay = Boolean(is_half_day);
      // Whitelist the half_day_type — only the two enum values are accepted.
      // Anything else (including legacy callers that omit it) falls back to
      // "first_half" so back-compat is preserved.
      const resolvedHalf: "first_half" | "second_half" =
        half_day_type === "second_half" ? "second_half" : "first_half";

      // Capture WHO applied this so HR can audit later (the original
      // "Applied by HR via Attendance Grid" was anonymous).
      const actorFirst = (req.user as any).first_name || "";
      const actorLast = (req.user as any).last_name || "";
      const actorName = `${actorFirst} ${actorLast}`.trim() || "an admin";
      const actorRole = (req.user as any).role
        ? String((req.user as any).role).replace(/_/g, " ")
        : "admin";
      const reasonText = `Applied by ${actorName} (${actorRole}) via Attendance Grid`;

      const application = await leaveApplicationService.applyLeave(
        orgId,
        Number(user_id),
        {
          leave_type_id: Number(leave_type_id),
          start_date: String(date),
          end_date: String(date),
          days_count: halfDay ? 0.5 : 1,
          is_half_day: halfDay,
          half_day_type: halfDay ? resolvedHalf : undefined,
          reason: reasonText,
        } as any,
        // HR is recording attendance on behalf, often retroactively (an
        // employee brings sick-leave documentation a week or two later).
        // The 7-day employee-side guard does not apply here.
        { skipBackdateCheck: true },
      );

      const approved = await leaveApplicationService.approveLeave(
        orgId,
        req.user!.sub,
        Number((application as any).id),
        `Approved on behalf by ${actorName} via Attendance Grid`,
        (req.user as any).permissions,
      );

      sendSuccess(res, { application: approved });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/attendance/export — Export ALL attendance records (no pagination) for CSV/XLSX.
//
// Builds a USER × DATE matrix rather than just listing rows from
// attendance_records. This is the difference between an HR-grade
// "who-worked-when" report and a raw event log:
//
//   - The old query inner-joined attendance_records → users, so any
//     employee with zero check-ins for the period was silently dropped
//     from the sheet. If nobody in an org had punched yet (new tenant,
//     biometric outage, holiday week), the export came back EMPTY.
//   - The matrix approach enumerates every active employee for every
//     date in the range and LEFT JOINs the attendance row. Days with
//     no record fall through to a synthetic "absent" row with empty
//     shift / check-in / check-out -- exactly the "user is on the list
//     but didn't punch" semantics HR / payroll expect.
//
// Future dates are skipped so opening an export for "this month" on
// the 15th doesn't pre-mark the 16th-31st as absent for everyone.
router.get("/export", authenticate, requirePermission("attendance:view_all"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (await import("../../db/connection.js")).getDB();
    const orgId = req.user!.org_id;
    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const dateFromRaw = req.query.date_from as string | undefined;
    const dateToRaw = req.query.date_to as string | undefined;
    const departmentId = req.query.department_id ? Number(req.query.department_id) : undefined;
    const locationId = req.query.location_id ? Number(req.query.location_id) : undefined;
    const employeeId = req.query.employee_id ? Number(req.query.employee_id) : undefined;
    const status = req.query.status as string | undefined;

    // Resolve the date window. Custom range wins; otherwise fall back
    // to the month/year pair; otherwise default to the current month.
    let startDate: string;
    let endDate: string;
    if (dateFromRaw) {
      startDate = String(dateFromRaw);
      endDate = String(dateToRaw || dateFromRaw);
    } else if (month && year) {
      startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const last = new Date(year, month, 0).getDate();
      endDate = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    } else {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      startDate = `${y}-${String(m).padStart(2, "0")}-01`;
      const last = new Date(y, m, 0).getDate();
      endDate = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    }

    // Local-tz YYYY-MM-DD formatter (avoids the UTC-shift trap from
    // toISOString around midnight).
    const isoLocal = (d: Date): string => {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${mo}-${day}`;
    };
    const todayIso = isoLocal(new Date());

    // Generate the date list. Cap at today so future dates don't
    // appear as "absent" for everyone -- that's nonsensical for
    // forward-looking ranges and would pollute month-end exports run
    // mid-month.
    const dates: string[] = [];
    if (startDate && endDate) {
      let cursor = new Date(`${startDate}T00:00:00`);
      const stop = new Date(`${endDate}T00:00:00`);
      while (cursor <= stop) {
        const iso = isoLocal(cursor);
        if (iso <= todayIso) dates.push(iso);
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    // Active employees in scope. Filters are applied at the USER level
    // (not the attendance_record level) because we want absent rows for
    // them too.
    let userQuery = db("users as u")
      .leftJoin("organization_departments as dept", "u.department_id", "dept.id")
      .leftJoin("organization_locations as loc", "u.location_id", "loc.id")
      .where("u.organization_id", orgId)
      .where("u.status", 1)
      .whereNot("u.role", "super_admin");
    if (departmentId) userQuery = userQuery.where("u.department_id", departmentId);
    if (locationId) userQuery = userQuery.where("u.location_id", locationId);
    if (employeeId) userQuery = userQuery.where("u.id", employeeId);
    const users = await userQuery.select(
      "u.id as user_id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code",
      "u.designation",
      "dept.name as department_name",
      "loc.name as location_name",
    );

    // Existing attendance rows for the same (users × dates) window.
    let recordQuery = db("attendance_records as ar")
      .leftJoin("shifts as s", "ar.shift_id", "s.id")
      .where("ar.organization_id", orgId);
    if (dates.length > 0) {
      recordQuery = recordQuery.whereBetween("ar.date", [dates[0], dates[dates.length - 1]]);
    } else {
      // Empty matrix -- nothing to export. Short-circuit.
      sendSuccess(res, []);
      return;
    }
    if (users.length > 0) {
      recordQuery = recordQuery.whereIn("ar.user_id", users.map((u: any) => u.user_id));
    }
    const records = await recordQuery.select(
      "ar.id",
      "ar.user_id",
      "ar.date",
      "ar.check_in",
      "ar.check_out",
      "ar.worked_minutes",
      "ar.overtime_minutes",
      "ar.late_minutes",
      "ar.early_departure_minutes",
      "ar.status",
      "s.name as shift_name",
      "s.start_time as shift_start",
      "s.end_time as shift_end",
    );

    // Build (uid, dateIso) -> record. Date is stored as a DATE column
    // so the JS driver may return either a Date instance or a string
    // depending on driver flags -- normalise via isoLocal.
    const recordMap = new Map<string, any>();
    for (const r of records as any[]) {
      const dateIso =
        typeof r.date === "string" ? r.date.slice(0, 10) : isoLocal(new Date(r.date));
      recordMap.set(`${r.user_id}|${dateIso}`, { ...r, date: dateIso });
    }

    // Cartesian product: for every employee, for every date in the
    // window, emit either the real attendance row OR a synthetic
    // "absent" placeholder. The placeholder has the same shape as a
    // real row so the FE Excel mapper is unchanged.
    const fullRows: any[] = [];
    for (const u of users as any[]) {
      for (const d of dates) {
        const key = `${u.user_id}|${d}`;
        const rec = recordMap.get(key);
        if (rec) {
          fullRows.push({
            id: rec.id,
            user_id: u.user_id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            emp_code: u.emp_code,
            department_name: u.department_name,
            location_name: u.location_name,
            designation: u.designation,
            date: rec.date,
            check_in: rec.check_in,
            check_out: rec.check_out,
            worked_minutes: rec.worked_minutes,
            overtime_minutes: rec.overtime_minutes,
            late_minutes: rec.late_minutes,
            early_departure_minutes: rec.early_departure_minutes,
            status: rec.status,
            shift_name: rec.shift_name,
            shift_start: rec.shift_start,
            shift_end: rec.shift_end,
          });
        } else {
          // No record for (user, date) -- treat as absent. Shift /
          // check-in / check-out fields stay null so the Excel cell
          // renders blank rather than "-" or "0" (worked minutes etc.
          // are 0 since the employee logged no time at all).
          fullRows.push({
            id: null,
            user_id: u.user_id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            emp_code: u.emp_code,
            department_name: u.department_name,
            location_name: u.location_name,
            designation: u.designation,
            date: d,
            check_in: null,
            check_out: null,
            worked_minutes: 0,
            overtime_minutes: 0,
            late_minutes: 0,
            early_departure_minutes: 0,
            status: "absent",
            shift_name: null,
            shift_start: null,
            shift_end: null,
          });
        }
      }
    }

    // Apply status filter post-matrix so the user's "Status = absent"
    // filter still works against the synthetic rows (which is the whole
    // point -- without this, status=absent on an empty DB would have
    // matched the same zero rows as before).
    const filtered = status ? fullRows.filter((r) => r.status === status) : fullRows;

    // Order: by employee then by date so each person's row block is
    // contiguous in the sheet.
    filtered.sort((a, b) => {
      const an = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
      const bn = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
      const cmp = an.localeCompare(bn);
      if (cmp !== 0) return cmp;
      return (a.date || "").localeCompare(b.date || "");
    });

    sendSuccess(res, filtered);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/export/consolidated — Consolidated employee-wise summary
router.get("/export/consolidated", authenticate, requirePermission("attendance:view_all"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (await import("../../db/connection.js")).getDB();
    const orgId = req.user!.org_id;
    const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const departmentId = req.query.department_id ? Number(req.query.department_id) : undefined;
    const locationId = req.query.location_id ? Number(req.query.location_id) : undefined;

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
    // #1822 — Bug 19: Working Days previously used calendar days
    // (`new Date(year, month, 0).getDate()` = last day of month). That made
    // every employee show "Working Days = 22" even when a 30-day month was
    // selected, and totally ignored weekends. Switch to "weekdays in month"
    // (Mon–Fri) which matches what users mean by "working days" in the
    // absence of a per-shift calendar. (We don't yet exclude org holidays
    // here — see #1804 follow-up.)
    const lastDay = new Date(year, month, 0).getDate();
    let workingDays = 0;
    for (let d = 1; d <= lastDay; d += 1) {
      const dow = new Date(year, month - 1, d).getDay(); // 0=Sun, 6=Sat
      if (dow !== 0 && dow !== 6) workingDays += 1;
    }
    const totalWorkingDays = workingDays;

    let query = db("attendance_records as ar")
      .join("users as u", "ar.user_id", "u.id")
      .leftJoin("organization_departments as dept", "u.department_id", "dept.id")
      .leftJoin("organization_locations as loc", "u.location_id", "loc.id")
      .where("ar.organization_id", orgId)
      .where("u.status", 1)
      .whereNot("u.role", "super_admin")
      .whereBetween("ar.date", [startDate, endDate]);

    if (departmentId) query = query.where("u.department_id", departmentId);
    if (locationId) query = query.where("u.location_id", locationId);

    const records = await query.select(
      "ar.user_id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code",
      "u.designation",
      "dept.name as department_name",
      "loc.name as location_name",
      db.raw("COUNT(*) as total_records"),
      db.raw("SUM(CASE WHEN ar.status IN ('present','checked_in') THEN 1 ELSE 0 END) as present_days"),
      db.raw("SUM(CASE WHEN ar.status = 'half_day' THEN 1 ELSE 0 END) as half_days"),
      db.raw("SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_days"),
      db.raw("SUM(CASE WHEN ar.status = 'on_leave' THEN 1 ELSE 0 END) as leave_days"),
      db.raw("SUM(COALESCE(ar.worked_minutes, 0)) as total_worked_minutes"),
      db.raw("SUM(COALESCE(ar.overtime_minutes, 0)) as total_overtime_minutes"),
      db.raw("SUM(COALESCE(ar.late_minutes, 0)) as total_late_minutes"),
      db.raw("SUM(COALESCE(ar.early_departure_minutes, 0)) as total_early_departure_minutes"),
      db.raw("COUNT(CASE WHEN ar.late_minutes > 0 THEN 1 END) as late_count"),
      db.raw("AVG(CASE WHEN ar.worked_minutes > 0 THEN ar.worked_minutes END) as avg_worked_minutes"),
    ).groupBy("ar.user_id", "u.first_name", "u.last_name", "u.email", "u.emp_code", "u.designation", "dept.name", "loc.name");

    // #1822 — Bug 19: Per-employee Present + Absent did not add up to the
    // org's total Working Days because days with NO attendance row at all
    // were silently dropped. Compute "no_record_days" = working days for
    // which the user has no row (and is not on leave / present / absent /
    // half_day). The previous behaviour (silent drop) would show e.g.
    // "4 Present + 4 Absent = 8 of 22 working days" with 14 days
    // unaccounted for — the user reasonably called that a mismatch.
    //
    // We expose no_record_days as a separate column so the dashboard can
    // show "Present X • Absent Y • No Record Z" rather than rolling
    // missing days into Absent (which would inflate absences for new
    // hires whose joining date is mid-month).
    const enriched = records.map((r: any) => {
      const accounted =
        Number(r.present_days || 0) +
        Number(r.half_days || 0) +
        Number(r.absent_days || 0) +
        Number(r.leave_days || 0);
      const noRecord = Math.max(0, totalWorkingDays - accounted);
      return { ...r, no_record_days: noRecord };
    });

    sendSuccess(res, { month, year, total_working_days: totalWorkingDays, report: enriched });
  } catch (err) { next(err); }
});

// =============================================================================
// REGULARIZATIONS
// =============================================================================

// POST /api/v1/attendance/regularizations
router.post("/regularizations", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createRegularizationSchema.parse(req.body);
    const reg = await regularizationService.submitRegularization(req.user!.org_id, req.user!.sub, data);
    sendSuccess(res, reg, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/regularizations
router.get("/regularizations", authenticate, requirePermission("attendance:view_all", "attendance:approve_regularization_team", "attendance:approve_regularization_all", "attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const status = req.query.status as string | undefined;
    const rawLocation = req.query.location_id;
    const locationId = rawLocation && Number(rawLocation) > 0 ? Number(rawLocation) : undefined;
    const rawSearch = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
    const search = rawSearch.length > 0 ? rawSearch : undefined;
    // Scope: callers with _all (or view_all / manage / HR) see every
    // regularization in the org. Callers with only _team see requests from
    // their direct + additional reports. Empty team -> 0 rows.
    const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];
    const isHR = HR_ROLES.includes(req.user!.role);
    const perms = (req.user as any).permissions as string[] | undefined;
    const has = (k: string) => Array.isArray(perms) && perms.includes(k);
    let userIds: number[] | undefined;
    if (
      !isHR &&
      !has("attendance:view_all") &&
      !has("attendance:manage") &&
      !has("attendance:approve_regularization_all")
    ) {
      const { resolveTeamMemberIds } = await import(
        "../../services/team/team-resolver.service.js"
      );
      userIds = await resolveTeamMemberIds(req.user!.org_id, req.user!.sub);
    }
    const result = await regularizationService.listRegularizations(req.user!.org_id, { page, perPage: per_page, status, userIds, locationId, search });
    sendPaginated(res, result.records, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/regularizations/me
router.get("/regularizations/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const result = await regularizationService.getMyRegularizations(req.user!.org_id, req.user!.sub, { page, perPage: per_page });
    sendPaginated(res, result.records, result.total, page, per_page);
  } catch (err) { next(err); }
});

// PUT /api/v1/attendance/regularizations/:id/approve
router.put("/regularizations/:id/approve", authenticate, requirePermission("attendance:approve_regularization_team", "attendance:approve_regularization_all", "attendance:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, rejection_reason } = approveRegularizationSchema.parse(req.body);
    const regId = paramInt(req.params.id);

    // Scope enforcement: a caller with only _team (no _all / view_all /
    // manage / HR) can approve only their own team's regularizations.
    // Reject 403 if the regularization belongs to someone outside their team.
    const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];
    const isHR = HR_ROLES.includes(req.user!.role);
    const perms = (req.user as any).permissions as string[] | undefined;
    const has = (k: string) => Array.isArray(perms) && perms.includes(k);
    const teamOnly =
      !isHR &&
      !has("attendance:view_all") &&
      !has("attendance:manage") &&
      !has("attendance:approve_regularization_all") &&
      has("attendance:approve_regularization_team");
    if (teamOnly) {
      const reg = await regularizationService.getRegularization(req.user!.org_id, regId);
      if (!reg) {
        return next(new Error("Regularization not found"));
      }
      const { isManagerOf } = await import(
        "../../services/team/team-resolver.service.js"
      );
      const inTeam = await isManagerOf(req.user!.org_id, req.user!.sub, Number(reg.user_id));
      if (!inTeam) {
        const { sendError } = await import("../../utils/response.js");
        sendError(res, 403, "FORBIDDEN", "You can only approve regularizations from your own team");
        return;
      }
    }

    let result;
    if (status === "approved") {
      result = await regularizationService.approveRegularization(req.user!.org_id, regId, req.user!.sub);
    } else {
      result = await regularizationService.rejectRegularization(req.user!.org_id, regId, req.user!.sub, rejection_reason);
    }

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// DELETE /api/v1/attendance/regularizations/:id
// Withdraw a PENDING regularization request. The owner can delete their own;
// HR / attendance:manage can delete anyone's pending request.
router.delete("/regularizations/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const regId = paramInt(req.params.id);
    const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];
    const perms = (req.user as any).permissions as string[] | undefined;
    const isPrivileged =
      HR_ROLES.includes(req.user!.role) ||
      (Array.isArray(perms) &&
        (perms.includes("attendance:manage") ||
          perms.includes("attendance:approve_regularization_all")));
    const result = await regularizationService.deleteRegularization(
      req.user!.org_id,
      regId,
      req.user!.sub,
      isPrivileged,
    );
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

export default router;
