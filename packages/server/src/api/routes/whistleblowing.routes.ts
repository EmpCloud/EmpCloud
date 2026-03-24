// =============================================================================
// EMP CLOUD — Whistleblowing Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as wbService from "../../services/whistleblowing/whistleblowing.service.js";
import {
  submitWhistleblowerReportSchema,
  whistleblowerUpdateSchema,
  whistleblowerStatusSchema,
  whistleblowerEscalateSchema,
  whistleblowerAssignSchema,
  whistleblowerQuerySchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt, param } from "../../utils/params.js";

const router = Router();

// POST /api/v1/whistleblowing/reports — Submit report (any authenticated user)
router.post("/reports", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = submitWhistleblowerReportSchema.parse(req.body);
    const result = await wbService.submitReport(req.user!.org_id, req.user!.sub, data);

    await logAudit({
      organizationId: req.user!.org_id,
      userId: data.is_anonymous !== false ? null : req.user!.sub,
      action: AuditAction.WHISTLEBLOWER_REPORT_SUBMITTED,
      resourceType: "whistleblower_report",
      resourceId: String(result.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// GET /api/v1/whistleblowing/reports/my — My reports (hash match)
router.get("/reports/my", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reports = await wbService.getMyReports(req.user!.org_id, req.user!.sub);
    sendSuccess(res, reports);
  } catch (err) { next(err); }
});

// GET /api/v1/whistleblowing/reports/lookup/:case — Lookup by case number
router.get("/reports/lookup/:case", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caseNumber = param(req.params.case);
    const report = await wbService.getReportByCase(req.user!.org_id, caseNumber);
    sendSuccess(res, report);
  } catch (err) { next(err); }
});

// GET /api/v1/whistleblowing/dashboard — Dashboard stats (HR only)
router.get("/dashboard", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await wbService.getWhistleblowingDashboard(req.user!.org_id);
    sendSuccess(res, dashboard);
  } catch (err) { next(err); }
});

// GET /api/v1/whistleblowing/reports — All reports (HR/investigator only)
router.get("/reports", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page, status, category, severity, search } = whistleblowerQuerySchema.parse(req.query);
    const result = await wbService.listReports(req.user!.org_id, {
      page,
      perPage: per_page,
      status,
      category,
      severity,
      search,
    });
    sendPaginated(res, result.reports, result.total, page, per_page);
  } catch (err) { next(err); }
});

// GET /api/v1/whistleblowing/reports/:id — Report detail (HR only)
router.get("/reports/:id", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await wbService.getReport(req.user!.org_id, paramInt(req.params.id));
    sendSuccess(res, report);
  } catch (err) { next(err); }
});

// POST /api/v1/whistleblowing/reports/:id/assign — Assign investigator (HR)
router.post("/reports/:id/assign", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { investigator_id } = whistleblowerAssignSchema.parse(req.body);
    const report = await wbService.assignInvestigator(
      req.user!.org_id,
      paramInt(req.params.id),
      investigator_id
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.WHISTLEBLOWER_INVESTIGATOR_ASSIGNED,
      resourceType: "whistleblower_report",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, report);
  } catch (err) { next(err); }
});

// POST /api/v1/whistleblowing/reports/:id/update — Add update/note (HR)
router.post("/reports/:id/update", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = whistleblowerUpdateSchema.parse(req.body);
    const result = await wbService.addUpdate(
      req.user!.org_id,
      paramInt(req.params.id),
      req.user!.sub,
      data.content,
      data.update_type,
      data.is_visible_to_reporter ?? false
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.WHISTLEBLOWER_UPDATE_ADDED,
      resourceType: "whistleblower_update",
      resourceId: String(result.id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/whistleblowing/reports/:id/status — Change status (HR)
router.put("/reports/:id/status", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = whistleblowerStatusSchema.parse(req.body);
    const report = await wbService.updateStatus(
      req.user!.org_id,
      paramInt(req.params.id),
      data.status,
      data.resolution
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.WHISTLEBLOWER_STATUS_CHANGED,
      resourceType: "whistleblower_report",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, report);
  } catch (err) { next(err); }
});

// POST /api/v1/whistleblowing/reports/:id/escalate — Escalate externally (HR)
router.post("/reports/:id/escalate", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = whistleblowerEscalateSchema.parse(req.body);
    const report = await wbService.escalateReport(
      req.user!.org_id,
      paramInt(req.params.id),
      data.escalated_to
    );

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.WHISTLEBLOWER_ESCALATED,
      resourceType: "whistleblower_report",
      resourceId: String(paramInt(req.params.id)),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, report);
  } catch (err) { next(err); }
});

export default router;
