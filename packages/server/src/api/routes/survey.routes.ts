// =============================================================================
// EMP CLOUD — Survey Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as surveyService from "../../services/survey/survey.service.js";
import {
  createSurveySchema,
  updateSurveySchema,
  submitSurveyResponseSchema,
  surveyQuerySchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// GET /api/v1/surveys/active — Active surveys for employee to respond
router.get("/active", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const surveys = await surveyService.getActiveSurveys(
      req.user!.org_id,
      req.user!.sub
    );
    sendSuccess(res, surveys);
  } catch (err) { next(err); }
});

// GET /api/v1/surveys/dashboard — Survey analytics dashboard (HR)
router.get("/dashboard", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await surveyService.getSurveyDashboard(req.user!.org_id);
    sendSuccess(res, dashboard);
  } catch (err) { next(err); }
});

// GET /api/v1/surveys/my-responses — Employee's past responses
router.get("/my-responses", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const responses = await surveyService.getMyResponses(
      req.user!.org_id,
      req.user!.sub
    );
    sendSuccess(res, responses);
  } catch (err) { next(err); }
});

// GET /api/v1/surveys — List surveys
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page, status, type } = surveyQuerySchema.parse(req.query);
    const result = await surveyService.listSurveys(
      req.user!.org_id,
      { page, perPage: per_page, status, type }
    );
    sendPaginated(res, result.surveys, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/surveys/:id — Get survey detail
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const survey = await surveyService.getSurvey(
      req.user!.org_id,
      paramInt(req.params.id)
    );
    sendSuccess(res, survey);
  } catch (err) { next(err); }
});

// POST /api/v1/surveys — Create survey (HR only)
router.post("/", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSurveySchema.parse(req.body);
    const survey = await surveyService.createSurvey(
      req.user!.org_id,
      req.user!.sub,
      data
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SURVEY_CREATED,
      resourceType: "survey",
      resourceId: String((survey as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, survey, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/surveys/:id — Update survey (HR, draft only)
router.put("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateSurveySchema.parse(req.body);
    const survey = await surveyService.updateSurvey(
      req.user!.org_id,
      paramInt(req.params.id),
      data
    );
    sendSuccess(res, survey);
  } catch (err) { next(err); }
});

// POST /api/v1/surveys/:id/publish — Publish survey (HR)
router.post("/:id/publish", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const survey = await surveyService.publishSurvey(
      req.user!.org_id,
      paramInt(req.params.id)
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SURVEY_PUBLISHED,
      resourceType: "survey",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, survey);
  } catch (err) { next(err); }
});

// POST /api/v1/surveys/:id/close — Close survey (HR)
router.post("/:id/close", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const survey = await surveyService.closeSurvey(
      req.user!.org_id,
      paramInt(req.params.id)
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SURVEY_CLOSED,
      resourceType: "survey",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, survey);
  } catch (err) { next(err); }
});

// DELETE /api/v1/surveys/:id — Delete draft survey (HR)
router.delete("/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await surveyService.deleteSurvey(
      req.user!.org_id,
      paramInt(req.params.id)
    );
    sendSuccess(res, { message: "Survey deleted" });
  } catch (err) { next(err); }
});

// POST /api/v1/surveys/:id/respond — Submit response (any auth user)
router.post("/:id/respond", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = submitSurveyResponseSchema.parse(req.body);
    const result = await surveyService.submitResponse(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
      data.answers
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.SURVEY_RESPONDED,
      resourceType: "survey_response",
      resourceId: String(result.response_id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/surveys/:id/results — Get aggregated results (HR)
router.get("/:id/results", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await surveyService.getSurveyResults(
      req.user!.org_id,
      paramInt(req.params.id)
    );
    sendSuccess(res, results);
  } catch (err) { next(err); }
});

export default router;
