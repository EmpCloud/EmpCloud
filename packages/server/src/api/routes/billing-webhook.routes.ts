// =============================================================================
// EMP CLOUD — Billing Webhook Routes
// Receives inbound webhooks from EMP Billing.
// Authenticated via BILLING_API_KEY shared secret in x-billing-api-key header.
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger.js";
import { sendSuccess } from "../../utils/response.js";
import { sendError } from "../../utils/response.js";
import { handleWebhook } from "../../services/billing/webhook-handler.service.js";
import { config } from "../../config/index.js";

const router = Router();

// POST /api/v1/webhooks/billing
router.post("/billing", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify billing API key
    const apiKey = req.headers["x-billing-api-key"] as string;
    const expectedKey = config.billing.apiKey;

    if (!expectedKey) {
      logger.error("BILLING_API_KEY not configured — rejecting webhook");
      sendError(res, 500, "SERVER_ERROR", "Webhook authentication not configured");
      return;
    }

    if (!apiKey || apiKey !== expectedKey) {
      logger.warn("Billing webhook rejected: invalid or missing API key");
      sendError(res, 401, "UNAUTHORIZED", "Invalid or missing billing API key");
      return;
    }

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
