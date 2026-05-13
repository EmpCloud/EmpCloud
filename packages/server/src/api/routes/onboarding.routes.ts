// =============================================================================
// EMP CLOUD — Onboarding Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  getOnboardingStatus,
  completeStep,
  completeOnboarding,
} from "../../services/onboarding/onboarding.service.js";
import { sendSuccess } from "../../utils/response.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

const router = Router();

// All onboarding routes require authentication
router.use(authenticate);

// GET /api/v1/onboarding/status — readable by anyone in the org so the
// dashboard can show the onboarding banner / next step prompts.
router.get("/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getOnboardingStatus(req.user!.org_id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/onboarding/step/:step — org-level setup, restricted to admins
router.post("/step/:step", requirePermission("org_settings:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const step = parseInt(String(req.params.step), 10);
    const result = await completeStep(req.user!.org_id, req.user!.sub, step, req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/onboarding/complete
router.post("/complete", requirePermission("org_settings:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await completeOnboarding(req.user!.org_id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

export default router;
