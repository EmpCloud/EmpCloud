// =============================================================================
// EMP CLOUD — Super Admin Routes
// Platform-level admin endpoints (super_admin only)
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import {
  getPlatformOverview,
  getOrgList,
  getOrgDetail,
  getRevenueMetrics,
  getSystemHealth,
  getModuleAdoption,
} from "../../services/admin/super-admin.service.js";

const router = Router();

// All routes require super_admin
router.use(authenticate, requireSuperAdmin);

// GET /api/v1/admin/overview — platform overview
router.get("/overview", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const overview = await getPlatformOverview();
    sendSuccess(res, overview);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/organizations — paginated org list
router.get("/organizations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const perPage = parseInt(req.query.per_page as string, 10) || 20;
    const search = (req.query.search as string) || undefined;

    const result = await getOrgList({ page, per_page: perPage, search });
    sendPaginated(res, result.data, result.total, result.page, result.per_page);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/organizations/:id — org detail
router.get("/organizations/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const detail = await getOrgDetail(orgId);
    sendSuccess(res, detail);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/revenue — revenue metrics
router.get("/revenue", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await getRevenueMetrics();
    sendSuccess(res, metrics);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/health — system health check
router.get("/health", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await getSystemHealth();
    sendSuccess(res, health);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/module-adoption — module adoption stats
router.get("/module-adoption", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adoption = await getModuleAdoption();
    sendSuccess(res, adoption);
  } catch (err) {
    next(err);
  }
});

export default router;
