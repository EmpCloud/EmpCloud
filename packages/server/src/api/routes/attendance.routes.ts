// =============================================================================
// EMP CLOUD — Attendance Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as shiftService from "../../services/attendance/shift.service.js";
import * as attendanceService from "../../services/attendance/attendance.service.js";
import * as geoFenceService from "../../services/attendance/geo-fence.service.js";
import * as regularizationService from "../../services/attendance/regularization.service.js";
import {
  createShiftSchema,
  updateShiftSchema,
  assignShiftSchema,
  bulkAssignShiftSchema,
  shiftSwapRequestSchema,
  shiftScheduleQuerySchema,
  createGeoFenceSchema,
  checkInSchema,
  checkOutSchema,
  createRegularizationSchema,
  approveRegularizationSchema,
  attendanceQuerySchema,
  paginationSchema,
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
router.post("/shifts/swap-requests/:id/approve", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
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
router.post("/shifts/swap-requests/:id/reject", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
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
    const HR_ROLES = ["hr_admin", "hr_manager", "org_admin", "super_admin"];
    const isHR = HR_ROLES.includes(req.user!.role);
    const user_id = isHR ? params.user_id : req.user!.sub;
    const department_id = isHR ? params.department_id : undefined;
    const result = await attendanceService.listRecords(req.user!.org_id, {
      page: params.page,
      perPage: params.per_page,
      month: params.month,
      year: params.year,
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
