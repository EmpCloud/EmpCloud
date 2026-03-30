// =============================================================================
// EMP CLOUD — AI Configuration Routes
// Super admin only — manage AI provider settings from the UI.
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import {
  getAIConfig,
  updateAIConfig,
  getActiveProvider,
  testProvider,
} from "../../services/admin/ai-config.service.js";

const router = Router();

// All routes require super_admin
router.use(authenticate, requireSuperAdmin);

// GET /api/v1/admin/ai-config — Get all config (keys masked)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = await getAIConfig();
    sendSuccess(res, configs);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/ai-config/status — Get current active provider + status
router.get("/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await getActiveProvider();
    sendSuccess(res, status);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/ai-config/:key — Update a config value
router.put("/:key", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = String(req.params.key);
    const { value } = req.body;

    const ALLOWED_KEYS = [
      "anthropic_api_key",
      "openai_api_key",
      "openai_base_url",
      "gemini_api_key",
      "ai_model",
      "ai_max_tokens",
      "active_provider",
    ];

    if (!ALLOWED_KEYS.includes(key)) {
      return sendError(res, 400, "INVALID_KEY", `Invalid config key: ${key}`);
    }

    // Validate active_provider value
    if (key === "active_provider") {
      const validProviders = [
        "anthropic",
        "openai",
        "gemini",
        "deepseek",
        "groq",
        "ollama",
        "openai-compatible",
        "custom",
        "none",
      ];
      if (!validProviders.includes(value)) {
        return sendError(
          res,
          400,
          "INVALID_PROVIDER",
          `Invalid provider. Must be one of: ${validProviders.join(", ")}`
        );
      }
    }

    // Validate ai_max_tokens
    if (key === "ai_max_tokens") {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 256 || num > 32768) {
        return sendError(
          res,
          400,
          "INVALID_VALUE",
          "ai_max_tokens must be between 256 and 32768"
        );
      }
    }

    const userId = (req as any).user?.id || 0;
    const result = await updateAIConfig(key, value ?? null, userId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/ai-config/test — Test a provider connection
router.post("/test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider, api_key, model, base_url } = req.body;

    if (!provider) {
      return sendError(res, 400, "MISSING_PROVIDER", "Provider is required");
    }

    if (provider !== "ollama" && !api_key) {
      return sendError(res, 400, "MISSING_KEY", "API key is required for this provider");
    }

    const result = await testProvider(provider, api_key || "", model || "", base_url);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

export default router;
