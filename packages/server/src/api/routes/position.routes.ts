// =============================================================================
// EMP CLOUD — Position Management Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as positionService from "../../services/position/position.service.js";
import {
  createPositionSchema,
  updatePositionSchema,
  assignPositionSchema,
  createHeadcountPlanSchema,
  updateHeadcountPlanSchema,
  positionQuerySchema,
  headcountPlanQuerySchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// ---- Dashboard (must come before /:id) ----

// GET /api/v1/positions/dashboard — Position dashboard stats
router.get("/dashboard", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await positionService.getPositionDashboard(req.user!.org_id);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
});

// GET /api/v1/positions/vacancies — Open vacancies
router.get("/vacancies", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vacancies = await positionService.getVacancies(req.user!.org_id);
    sendSuccess(res, vacancies);
  } catch (err) { next(err); }
});

// GET /api/v1/positions/hierarchy — Position hierarchy tree
router.get("/hierarchy", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tree = await positionService.getPositionHierarchy(req.user!.org_id);
    sendSuccess(res, tree);
  } catch (err) { next(err); }
});

// ---- Headcount Plans (must come before /:id) ----

// POST /api/v1/positions/headcount-plans
router.post("/headcount-plans", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createHeadcountPlanSchema.parse(req.body);
    const plan = await positionService.createHeadcountPlan(req.user!.org_id, req.user!.sub, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.HEADCOUNT_PLAN_CREATED,
      resourceType: "headcount_plan",
      resourceId: String((plan as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, plan, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/positions/headcount-plans
router.get("/headcount-plans", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = headcountPlanQuerySchema.parse(req.query);
    const result = await positionService.listHeadcountPlans(req.user!.org_id, {
      page: query.page,
      perPage: query.per_page,
      fiscal_year: query.fiscal_year,
      status: query.status,
      department_id: query.department_id,
    });
    sendPaginated(res, result.plans, result.total, query.page, query.per_page);
  } catch (err) { next(err); }
});

// PUT /api/v1/positions/headcount-plans/:id
router.put("/headcount-plans/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateHeadcountPlanSchema.parse(req.body);
    const plan = await positionService.updateHeadcountPlan(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, plan);
  } catch (err) { next(err); }
});

// POST /api/v1/positions/headcount-plans/:id/approve
router.post("/headcount-plans/:id/approve", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await positionService.approveHeadcountPlan(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.HEADCOUNT_PLAN_APPROVED,
      resourceType: "headcount_plan",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, plan);
  } catch (err) { next(err); }
});

// POST /api/v1/positions/headcount-plans/:id/reject
router.post("/headcount-plans/:id/reject", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await positionService.rejectHeadcountPlan(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
      req.body.reason
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.HEADCOUNT_PLAN_REJECTED,
      resourceType: "headcount_plan",
      resourceId: String(paramInt(req.params.id)),
      details: req.body.reason ? { reason: req.body.reason } : undefined,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, plan);
  } catch (err) { next(err); }
});

// ---- Assignments (must come before /:id) ----

// DELETE /api/v1/positions/assignments/:id
router.delete("/assignments/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await positionService.removeUserFromPosition(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Assignment ended" });
  } catch (err) { next(err); }
});

// ---- CRUD ----

// POST /api/v1/positions
router.post("/", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createPositionSchema.parse(req.body);
    const position = await positionService.createPosition(req.user!.org_id, req.user!.sub, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.POSITION_CREATED,
      resourceType: "position",
      resourceId: String((position as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, position, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/positions
router.get("/", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = positionQuerySchema.parse(req.query);
    const result = await positionService.listPositions(req.user!.org_id, {
      page: query.page,
      perPage: query.per_page,
      department_id: query.department_id,
      status: query.status,
      employment_type: query.employment_type,
      search: query.search,
    });
    sendPaginated(res, result.positions, result.total, query.page, query.per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/positions/:id
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const position = await positionService.getPosition(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, position);
  } catch (err) { next(err); }
});

// PUT /api/v1/positions/:id
router.put("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updatePositionSchema.parse(req.body);
    const position = await positionService.updatePosition(req.user!.org_id, paramInt(req.params.id), data);
    sendSuccess(res, position);
  } catch (err) { next(err); }
});

// DELETE /api/v1/positions/:id
router.delete("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await positionService.deletePosition(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, { message: "Position closed" });
  } catch (err) { next(err); }
});

// POST /api/v1/positions/:id/assign
router.post("/:id/assign", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = assignPositionSchema.parse(req.body);
    const assignment = await positionService.assignUserToPosition(
      req.user!.org_id,
      paramInt(req.params.id),
      data.user_id,
      data
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.POSITION_ASSIGNED,
      resourceType: "position_assignment",
      resourceId: String((assignment as any).id),
      details: { position_id: paramInt(req.params.id), assigned_user_id: data.user_id },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, assignment, 201);
  } catch (err) { next(err); }
});

export default router;
