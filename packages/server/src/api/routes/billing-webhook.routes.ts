// =============================================================================
// EMP CLOUD — Billing Webhook Routes
// Receives inbound webhooks from EMP Billing. NO AUTH — Billing sends these
// directly, so this route must be mounted before auth middleware.
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger.js";
import { sendSuccess } from "../../utils/response.js";
import { sendError } from "../../utils/response.js";
import { handleWebhook } from "../../services/billing/webhook-handler.service.js";

const router = Router();

// POST /api/v1/webhooks/billing
router.post("/billing", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { event, data, orgId, timestamp } = req.body;

    if (!event || !data) {
      sendError(res, 400, "BAD_REQUEST", "Missing required fields: event, data");
      return;
    }

    logger.info(`Billing webhook: ${event}`, { orgId, timestamp });

    // Process asynchronously — acknowledge immediately
    handleWebhook(event, data, orgId).catch((err) => {
      logger.error(`Billing webhook processing failed: ${event}`, err);
    });

    sendSuccess(res, { received: true, event });
  } catch (err) {
    next(err);
  }
});

export default router;
