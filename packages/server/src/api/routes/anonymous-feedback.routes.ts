// =============================================================================
// EMP CLOUD — Anonymous Feedback Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as feedbackService from "../../services/feedback/anonymous-feedback.service.js";
import {
  submitFeedbackSchema,
  respondFeedbackSchema,
  updateFeedbackStatusSchema,
  feedbackQuerySchema,
  paginationSchema,
  AuditAction,
  ROLE_HIERARCHY,
} from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";
import { ForbiddenError } from "../../utils/errors.js";

const router = Router();

// POST /api/v1/feedback — Submit anonymous feedback (any authenticated user)
router.post(
  "/",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = submitFeedbackSchema.parse(req.body);
      const feedback = await feedbackService.submitFeedback(
        req.user!.org_id,
        req.user!.sub,
        data
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: null, // intentionally null — do NOT log user identity
        action: AuditAction.FEEDBACK_SUBMITTED,
        resourceType: "anonymous_feedback",
        resourceId: String((feedback as any).id),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, feedback, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/feedback/my — My submitted feedback (matched by hash)
router.get(
  "/my",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, per_page } = paginationSchema.parse(req.query);
      const result = await feedbackService.getMyFeedback(
        req.user!.org_id,
        req.user!.sub,
        { page, perPage: per_page }
      );
      sendPaginated(res, result.feedback, result.total, page, per_page);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/feedback/dashboard — Stats dashboard (HR only)
router.get(
  "/dashboard",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await feedbackService.getFeedbackDashboard(
        req.user!.org_id
      );
      sendSuccess(res, stats);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/feedback — All feedback (HR only, NO user identity)
router.get(
  "/",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = feedbackQuerySchema.parse(req.query);
      const result = await feedbackService.listFeedback(
        req.user!.org_id,
        {
          page: filters.page,
          perPage: filters.per_page,
          category: filters.category,
          status: filters.status,
          sentiment: filters.sentiment,
          is_urgent:
            filters.is_urgent !== undefined
              ? filters.is_urgent === true || (filters.is_urgent as any) === "true"
              : undefined,
          search: filters.search,
        }
      );
      sendPaginated(res, result.feedback, result.total, filters.page, filters.per_page);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/feedback/:id — Single feedback (HR or owner)
router.get(
  "/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const feedback = await feedbackService.getFeedbackById(
        req.user!.org_id,
        paramInt(req.params.id)
      );

      // Allow HR+ roles to view any feedback
      const userRoleLevel = ROLE_HIERARCHY[req.user!.role as UserRole] ?? 0;
      const hrLevel = ROLE_HIERARCHY["hr_admin" as UserRole] ?? 60;
      const isHR = userRoleLevel >= hrLevel;

      // Allow owner to view their own feedback (matched by anonymous hash)
      const isOwner = await feedbackService.isOwner(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub
      );

      if (!isHR && !isOwner) {
        throw new ForbiddenError("You do not have access to this feedback");
      }

      sendSuccess(res, feedback);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/feedback/:id/respond — Respond to feedback (HR only)
router.post(
  "/:id/respond",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = respondFeedbackSchema.parse(req.body);
      const feedback = await feedbackService.respondToFeedback(
        req.user!.org_id,
        paramInt(req.params.id),
        data.admin_response,
        req.user!.sub
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.FEEDBACK_RESPONDED,
        resourceType: "anonymous_feedback",
        resourceId: String(paramInt(req.params.id)),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, feedback);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/v1/feedback/:id/status — Update status (HR only)
router.put(
  "/:id/status",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateFeedbackStatusSchema.parse(req.body);
      const feedback = await feedbackService.updateStatus(
        req.user!.org_id,
        paramInt(req.params.id),
        data.status
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.FEEDBACK_STATUS_UPDATED,
        resourceType: "anonymous_feedback",
        resourceId: String(paramInt(req.params.id)),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, feedback);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
