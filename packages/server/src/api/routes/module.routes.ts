// =============================================================================
// EMP CLOUD — Module Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import * as moduleService from "../../services/module/module.service.js";
import { createModuleSchema, updateModuleSchema } from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

// GET /api/v1/modules — List all active modules (marketplace)
router.get("/", authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const modules = await moduleService.listModules();
    sendSuccess(res, modules);
  } catch (err) { next(err); }
});

// GET /api/v1/modules/:id
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mod = await moduleService.getModule(paramInt(req.params.id));
    sendSuccess(res, mod);
  } catch (err) { next(err); }
});

// GET /api/v1/modules/:id/features
router.get("/:id/features", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const features = await moduleService.getModuleFeatures(paramInt(req.params.id));
    sendSuccess(res, features);
  } catch (err) { next(err); }
});

// POST /api/v1/modules — Create module (super admin only)
router.post("/", authenticate, requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createModuleSchema.parse(req.body);
    const mod = await moduleService.createModule(data);
    sendSuccess(res, mod, 201);
  } catch (err) { next(err); }
});

// PUT /api/v1/modules/:id — Update module (super admin only)
router.put("/:id", authenticate, requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateModuleSchema.parse(req.body);
    const mod = await moduleService.updateModule(paramInt(req.params.id), data);
    sendSuccess(res, mod);
  } catch (err) { next(err); }
});

export default router;
