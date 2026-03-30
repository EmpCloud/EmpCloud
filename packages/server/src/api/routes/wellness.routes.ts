// =============================================================================
// EMP CLOUD — Wellness Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as wellnessService from "../../services/wellness/wellness.service.js";
import {
  createWellnessProgramSchema,
  updateWellnessProgramSchema,
  wellnessCheckInSchema,
  createWellnessGoalSchema,
  updateWellnessGoalSchema,
  wellnessQuerySchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// ---------------------------------------------------------------------------
// Personal routes (must come before parameterized routes)
// ---------------------------------------------------------------------------

// GET /api/v1/wellness/my — My enrolled programs
router.get("/my", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const programs = await wellnessService.getMyPrograms(
      req.user!.org_id,
      req.user!.sub
    );
    sendSuccess(res, programs);
  } catch (err) { next(err); }
});

// GET /api/v1/wellness/summary — My wellness summary
router.get("/summary", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await wellnessService.getMyWellnessSummary(
      req.user!.org_id,
      req.user!.sub
    );
    sendSuccess(res, summary);
  } catch (err) { next(err); }
});

// GET /api/v1/wellness/dashboard — Org dashboard (HR)
router.get("/dashboard", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await wellnessService.getWellnessDashboard(req.user!.org_id);
    sendSuccess(res, dashboard);
  } catch (err) { next(err); }
});

// POST /api/v1/wellness/check-in — Daily check-in
router.post("/check-in", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = wellnessCheckInSchema.parse(req.body);
    const result = await wellnessService.dailyCheckIn(
      req.user!.org_id,
      req.user!.sub,
      data
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.WELLNESS_CHECK_IN,
      resourceType: "wellness_check_in",
      resourceId: String(result.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/wellness/trends — Aggregated check-in trends
router.get("/trends", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const period = typeof req.query.period === "string" ? req.query.period : "daily";
    const days = req.query.days ? Number(req.query.days) : 30;
    const trends = await wellnessService.getCheckInTrends(
      req.user!.org_id,
      req.user!.sub,
      period as "daily" | "weekly",
      days
    );
    sendSuccess(res, trends);
  } catch (err) { next(err); }
});

// GET /api/v1/wellness/check-ins — My check-in history
router.get("/check-ins", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = paginationSchema.parse(req.query);
    const startDate = typeof req.query.start_date === "string" ? req.query.start_date : undefined;
    const endDate = typeof req.query.end_date === "string" ? req.query.end_date : undefined;

    const result = await wellnessService.getMyCheckIns(
      req.user!.org_id,
      req.user!.sub,
      { start_date: startDate, end_date: endDate, page: params.page, per_page: params.per_page }
    );
    sendPaginated(res, result.check_ins, result.total, params.page, params.per_page);
  } catch (err) { next(err); }
});

// POST /api/v1/wellness/goals — Create goal
router.post("/goals", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createWellnessGoalSchema.parse(req.body);
    const goal = await wellnessService.createGoal(
      req.user!.org_id,
      req.user!.sub,
      data
    );
    sendSuccess(res, goal, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/wellness/goals — My goals
router.get("/goals", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const goals = await wellnessService.getMyGoals(
      req.user!.org_id,
      req.user!.sub,
      status
    );
    sendSuccess(res, goals);
  } catch (err) { next(err); }
});

// DELETE /api/v1/wellness/goals/:id — Delete own goal
router.delete("/goals/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await wellnessService.deleteGoal(
      req.user!.org_id,
      req.user!.sub,
      paramInt(req.params.id)
    );
    sendSuccess(res, { message: "Goal deleted" });
  } catch (err) { next(err); }
});

// PUT /api/v1/wellness/goals/:id — Update goal progress
router.put("/goals/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateWellnessGoalSchema.parse(req.body);
    const goal = await wellnessService.updateGoalProgress(
      req.user!.org_id,
      req.user!.sub,
      paramInt(req.params.id),
      data
    );
    sendSuccess(res, goal);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Program routes
// ---------------------------------------------------------------------------

// GET /api/v1/wellness/programs — List programs
router.get("/programs", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = wellnessQuerySchema.parse(req.query);
    const result = await wellnessService.listPrograms(
      req.user!.org_id,
      params
    );
    sendPaginated(res, result.programs, result.total, params.page, params.per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/wellness/programs/:id — Program detail
router.get("/programs/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const program = await wellnessService.getProgram(
      req.user!.org_id,
      paramInt(req.params.id)
    );
    sendSuccess(res, program);
  } catch (err) { next(err); }
});

// POST /api/v1/wellness/programs — Create program (HR)
router.post("/programs", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createWellnessProgramSchema.parse(req.body);
    const program = await wellnessService.createProgram(
      req.user!.org_id,
      req.user!.sub,
      data
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.WELLNESS_PROGRAM_CREATED,
      resourceType: "wellness_program",
      resourceId: String((program as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, program, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/wellness/programs/:id — Update program (HR)
router.put("/programs/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateWellnessProgramSchema.parse(req.body);
    const program = await wellnessService.updateProgram(
      req.user!.org_id,
      paramInt(req.params.id),
      data
    );
    sendSuccess(res, program);
  } catch (err) { next(err); }
});

// POST /api/v1/wellness/programs/:id/enroll — Enroll in program
router.post("/programs/:id/enroll", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await wellnessService.enrollInProgram(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.WELLNESS_ENROLLED,
      resourceType: "wellness_enrollment",
      resourceId: String(result.enrollment_id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// POST /api/v1/wellness/programs/:id/complete — Complete program
router.post("/programs/:id/complete", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await wellnessService.completeProgram(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub
    );
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

export default router;
