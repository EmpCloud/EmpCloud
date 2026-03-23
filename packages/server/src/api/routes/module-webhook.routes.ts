// =============================================================================
// EMP CLOUD — Module Webhook Routes
// Receives inbound lifecycle webhooks from sub-modules (recruit, exit,
// performance, rewards, etc.). NO AUTH — modules call this internally.
// This route must be mounted before auth middleware.
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { handleModuleWebhook } from "../../services/webhook/module-webhook.service.js";

const router = Router();

// POST /api/v1/webhooks/modules
router.post("/modules", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { event, data, source, timestamp } = req.body;

    if (!event || !data) {
      sendError(res, 400, "BAD_REQUEST", "Missing required fields: event, data");
      return;
    }

    logger.info(`Module webhook: ${event} from ${source || "unknown"}`, { timestamp });

    // Process asynchronously — acknowledge immediately
    handleModuleWebhook(event, data, source).catch((err) => {
      logger.error(`Module webhook processing failed: ${event}`, err);
    });

    sendSuccess(res, { received: true, event });
  } catch (err) {
    next(err);
  }
});

export default router;
