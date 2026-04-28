// =============================================================================
// EMP CLOUD — Attendance Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR, requireOrgAdmin, requireRole } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as shiftService from "../../services/attendance/shift.service.js";
import * as attendanceService from "../../services/attendance/attendance.service.js";
import * as geoFenceService from "../../services/attendance/geo-fence.service.js";
import * as regularizationService from "../../services/attendance/regularization.service.js";
import * as settingsService from "../../services/attendance/attendance-settings.service.js";
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
import type { UserRole } from "@empcloud/shared";
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
router.post("/shifts", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createShiftSchema.parse(req.body);
    const shift = await shiftService.createShift(req.user!.org_id, data);
    sendSuccess(res, shift, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/attendance/shifts/:id
router.put("/shifts/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateShiftSchema.parse(req.body);
    const shift = await shiftService.updateShift(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, shift);
  } catch (err) { next(err); }
});

// DELETE /api/v1/attendance/shifts/:id
router.delete("/shifts/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await shiftService.deleteShift(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Shift deactivated" });
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/shifts/assign
router.post("/shifts/assign", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = assignShiftSchema.parse(req.body);
    const assignment = await shiftService.assignShift(req.user!.org_id, data, req.user!.sub);
    sendSuccess(res, assignment, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/shifts/assignments
router.get("/shifts/assignments", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.query.user_id ? Number(req.query.user_id) : undefined;
    const shiftId = req.query.shift_id ? Number(req.query.shift_id) : undefined;
    const assignments = await shiftService.listShiftAssignments(req.user!.org_id, { user_id: userId, shift_id: shiftId });
    sendSuccess(res, assignments);
  } catch (err) { next(err); }
});

// PUT /api/v1/attendance/shifts/assignments/:id
router.put("/shifts/assignments/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
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
router.delete("/shifts/assignments/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
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
router.post("/shifts/bulk-assign", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
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
router.get("/shifts/schedule", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
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
router.get("/shifts/swap-requests", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const requests = await shiftService.listSwapRequests(req.user!.org_id, { status });
    sendSuccess(res, requests);
  } catch (err) { next(err); }
});

// POST /api/v1/attendance/shifts/swap-requests/:id/approve
router.post("/shifts/swap-requests/:id/approve", authenticate, requireRole("manager" as UserRole), async (req: Request, res: Response, next: NextFunction) => {
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
router.post("/shifts/swap-requests/:id/reject", authenticate, requireRole("manager" as UserRole), async (req: Request, res: Response, next: NextFunction) => {
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
router.post("/geo-fences", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createGeoFenceSchema.parse(req.body);
    const fence = await geoFenceService.createGeoFence(req.user!.org_id, data);
    sendSuccess(res, fence, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/attendance/geo-fences/:id
router.put("/geo-fences/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createGeoFenceSchema.partial().parse(req.body);
    const fence = await geoFenceService.updateGeoFence(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, fence);
  } catch (err) { next(err); }
});

// DELETE /api/v1/attendance/geo-fences/:id
router.delete("/geo-fences/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
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
router.get("/settings", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await settingsService.getSettings(req.user!.org_id);
    sendSuccess(res, settings);
  } catch (err) { next(err); }
});

// PUT /api/v1/attendance/settings — update org settings
router.put("/settings", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
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

// GET /api/v1/attendance/overrides/users/:userId — list overrides for one user
router.get(
  "/overrides/users/:userId",
  authenticate,
  requireOrgAdmin,
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
  requireOrgAdmin,
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
  requireOrgAdmin,
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
  requireOrgAdmin,
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
router.get("/me/today", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await attendanceService.getMyToday(req.user!.org_id, req.user!.sub);
    sendSuccess(res, record);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/me/history
router.get("/me/history", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = attendanceQuerySchema.parse(req.query);
    const result = await attendanceService.getMyHistory(req.user!.org_id, req.user!.sub, {
      page: params.page,
      perPage: params.per_page,
      month: params.month,
      year: params.year,
    });
    sendPaginated(res, result.records, result.total, params.page, params.per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/records
// HR+ sees all records; employees/managers only see their own
router.get("/records", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = attendanceQuerySchema.parse(req.query);
    const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];
    const isHR = HR_ROLES.includes(req.user!.role);
    const user_id = isHR ? (params.user_id || params.employee_id) : req.user!.sub;
    const department_id = isHR ? params.department_id : undefined;
    const result = await attendanceService.listRecords(req.user!.org_id, {
      page: params.page,
      perPage: params.per_page,
      month: params.month,
      year: params.year,
      date: params.date,
      date_from: params.date_from,
      date_to: params.date_to,
      user_id,
      department_id,
    });
    sendPaginated(res, result.records, result.total, params.page, params.per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/dashboard
router.get("/dashboard", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await attendanceService.getDashboard(req.user!.org_id);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/dashboard/breakdown?date=YYYY-MM-DD
// Returns the list of employees grouped by attendance status for the given date
// (defaults to today). Used by the "click stat card to view details" flow.
router.get("/dashboard/breakdown", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const breakdown = await attendanceService.getDashboardBreakdown(req.user!.org_id, date);
    sendSuccess(res, breakdown);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/monthly-report
router.get("/monthly-report", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();
    const userId = req.query.user_id ? Number(req.query.user_id) : undefined;
    const report = await attendanceService.getMonthlyReport(req.user!.org_id, { month, year, user_id: userId });
    sendSuccess(res, report);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/export — Export ALL attendance records (no pagination) for CSV/XLSX
router.get("/export", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (await import("../../db/connection.js")).getDB();
    const orgId = req.user!.org_id;
    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const dateFrom = req.query.date_from as string | undefined;
    const dateTo = req.query.date_to as string | undefined;
    const departmentId = req.query.department_id ? Number(req.query.department_id) : undefined;
    const employeeId = req.query.employee_id ? Number(req.query.employee_id) : undefined;
    const status = req.query.status as string | undefined;

    let query = db("attendance_records as ar")
      .join("users as u", function () { this.on("ar.user_id", "u.id").andOn("ar.organization_id", "u.organization_id"); })
      .leftJoin("organization_departments as dept", "u.department_id", "dept.id")
      .leftJoin("shifts as s", "ar.shift_id", "s.id")
      .where("ar.organization_id", orgId)
      .where("u.status", 1)
      .whereNot("u.role", "super_admin");

    if (dateFrom) {
      query = query.where("ar.date", ">=", dateFrom);
      if (dateTo) query = query.where("ar.date", "<=", dateTo);
    } else if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
      query = query.whereBetween("ar.date", [startDate, endDate]);
    }
    if (departmentId) query = query.where("u.department_id", departmentId);
    if (employeeId) query = query.where("ar.user_id", employeeId);
    if (status) query = query.where("ar.status", status);

    const records = await query.select(
      "ar.id",
      "ar.user_id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code",
      "dept.name as department_name",
      "u.designation",
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
    ).orderBy([{ column: "u.first_name", order: "asc" }, { column: "ar.date", order: "asc" }]);

    sendSuccess(res, records);
  } catch (err) { next(err); }
});

// GET /api/v1/attendance/export/consolidated — Consolidated employee-wise summary
router.get("/export/consolidated", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (await import("../../db/connection.js")).getDB();
    const orgId = req.user!.org_id;
    const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const departmentId = req.query.department_id ? Number(req.query.department_id) : undefined;

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
      .where("ar.organization_id", orgId)
      .where("u.status", 1)
      .whereNot("u.role", "super_admin")
      .whereBetween("ar.date", [startDate, endDate]);

    if (departmentId) query = query.where("u.department_id", departmentId);

    const records = await query.select(
      "ar.user_id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.emp_code",
      "u.designation",
      "dept.name as department_name",
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
    ).groupBy("ar.user_id", "u.first_name", "u.last_name", "u.email", "u.emp_code", "u.designation", "dept.name");

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
router.get("/regularizations", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const status = req.query.status as string | undefined;
    const result = await regularizationService.listRegularizations(req.user!.org_id, { page, perPage: per_page, status });
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
router.put("/regularizations/:id/approve", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, rejection_reason } = approveRegularizationSchema.parse(req.body);
    const regId = paramInt(req.params.id);

    let result;
    if (status === "approved") {
      result = await regularizationService.approveRegularization(req.user!.org_id, regId, req.user!.sub);
    } else {
      result = await regularizationService.rejectRegularization(req.user!.org_id, regId, req.user!.sub, rejection_reason);
    }

    sendSuccess(res, result);
  } catch (err) { next(err); }
});

export default router;
