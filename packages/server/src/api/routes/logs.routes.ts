// =============================================================================
// EMP CLOUD — Log Dashboard Routes (Super Admin only)
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import {
  getLogSummary,
  getRecentErrors,
  getSlowQueries,
  getAuthEvents,
  getModuleHealth,
} from "../../services/admin/log-analysis.service.js";

const router = Router();

// All routes require super_admin
router.use(authenticate, requireSuperAdmin);

// GET /api/v1/admin/logs/summary — Last 24h summary
router.get("/summary", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await getLogSummary();
    sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/logs/errors — Recent errors (paginated)
router.get("/errors", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const perPage = parseInt(req.query.per_page as string, 10) || 20;
    const result = await getRecentErrors(page, perPage);
    sendPaginated(res, result.data, result.total, result.page, result.per_page);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/logs/slow-queries — Slow queries log
router.get("/slow-queries", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const perPage = parseInt(req.query.per_page as string, 10) || 20;
    const result = await getSlowQueries(page, perPage);
    sendPaginated(res, result.data, result.total, result.page, result.per_page);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/logs/auth-events — Auth events (login/failed/password changes)
router.get("/auth-events", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const perPage = parseInt(req.query.per_page as string, 10) || 30;
    const result = await getAuthEvents(page, perPage);
    sendPaginated(res, result.data, result.total, result.page, result.per_page);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/logs/health — Module health (PM2 status)
router.get("/health", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await getModuleHealth();
    sendSuccess(res, health);
  } catch (err) {
    next(err);
  }
});

export default router;
