// =============================================================================
// EMP CLOUD — Dashboard Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import { getModuleWidgets } from "../../services/dashboard/widget.service.js";

const router = Router();

// GET /api/v1/dashboard/widgets — widget data for all subscribed modules
router.get("/widgets", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { org_id, sub: userId } = req.user!;
    const widgets = await getModuleWidgets(org_id, userId);
    sendSuccess(res, widgets);
  } catch (err) {
    next(err);
  }
});

export default router;
