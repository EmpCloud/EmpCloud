// =============================================================================
// EMP CLOUD — Module Webhook Routes
// Receives inbound lifecycle webhooks from sub-modules (recruit, exit,
// performance, rewards, etc.).
// Authenticated via BILLING_API_KEY shared secret in x-api-key header.
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { handleModuleWebhook } from "../../services/webhook/module-webhook.service.js";
import { config } from "../../config/index.js";

const router = Router();

// POST /api/v1/webhooks/modules
router.post("/modules", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify module API key (modules share the BILLING_API_KEY for internal communication)
    const apiKey = req.headers["x-api-key"] as string;
    const expectedKey = config.billing.apiKey;

    if (!expectedKey) {
      logger.error("BILLING_API_KEY not configured — rejecting module webhook");
      sendError(res, 500, "SERVER_ERROR", "Webhook authentication not configured");
      return;
    }

    if (!apiKey || apiKey !== expectedKey) {
      logger.warn(`Module webhook rejected: invalid or missing API key from ${req.body?.source || "unknown"}`);
      sendError(res, 401, "UNAUTHORIZED", "Invalid or missing API key");
      return;
    }

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
