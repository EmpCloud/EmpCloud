// =============================================================================
// EMP CLOUD — Audit Log Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../middleware/rbac.middleware.js";
import { sendPaginated } from "../../utils/response.js";
import { getAuditLogs } from "../../services/audit/audit.service.js";
import { paginationSchema } from "@empcloud/shared";

const router = Router();

// GET /api/v1/audit
router.get("/", authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, per_page } = paginationSchema.parse(req.query);
    const action = req.query.action as string | undefined;
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

    const result = await getAuditLogs({
      organizationId: req.user!.org_id,
      page,
      perPage: per_page,
      action,
      startDate,
      endDate,
    });

    sendPaginated(res, result.logs, result.total, page, per_page);
  } catch (err) { next(err); }
});

export default router;
