// =============================================================================
// EMP CLOUD — Email Template Routes
// Admin-customizable, org-scoped email templates (currently the probation
// confirmation email). Gated by probation:manage — the same permission that
// governs confirming probations, so no new RBAC seeding is required.
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import { param } from "../../utils/params.js";
import { logAudit } from "../../services/audit/audit.service.js";
import { AuditAction, upsertEmailTemplateSchema } from "@empcloud/shared";
import * as emailTemplateService from "../../services/email-template/email-template.service.js";

const router = Router();

// GET /api/v1/email-templates/:key — the org's template, or the built-in default
router.get(
  "/:key",
  authenticate,
  requirePermission("probation:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tpl = await emailTemplateService.getTemplateOrDefault(req.user!.org_id, param(req.params.key));
      sendSuccess(res, tpl);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/email-templates/:key — create/customize the org's template
router.put(
  "/:key",
  authenticate,
  requirePermission("probation:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = upsertEmailTemplateSchema.parse(req.body);
      const tpl = await emailTemplateService.upsertTemplate(
        req.user!.org_id,
        param(req.params.key),
        data,
        req.user!.sub,
      );
      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.PROFILE_UPDATED,
        resourceType: "email_template",
        resourceId: param(req.params.key),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      sendSuccess(res, tpl);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
