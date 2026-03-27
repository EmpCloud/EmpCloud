// =============================================================================
// EMP CLOUD — Module Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import * as moduleService from "../../services/module/module.service.js";
import { createModuleSchema, updateModuleSchema, ROLE_HIERARCHY } from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";

const router = Router();

/** Strip internal fields (base_url, webhook_secret) from module data for non-admin users */
function sanitizeModule(mod: any, userRole: string): any {
  const adminLevel = ROLE_HIERARCHY["org_admin" as UserRole] ?? 80;
  const userLevel = ROLE_HIERARCHY[userRole as UserRole] ?? 0;
  if (userLevel >= adminLevel) return mod;
  const { base_url, webhook_secret, ...safe } = mod;
  return safe;
}

// GET /api/v1/modules — List all active modules (marketplace)
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const modules = await moduleService.listModules();
    sendSuccess(res, modules.map((m: any) => sanitizeModule(m, req.user!.role)));
  } catch (err) { next(err); }
});

// GET /api/v1/modules/:id
router.get("/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mod = await moduleService.getModule(paramInt(req.params.id));
    sendSuccess(res, sanitizeModule(mod, req.user!.role));
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
