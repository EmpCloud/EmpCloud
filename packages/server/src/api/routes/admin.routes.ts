// =============================================================================
// EMP CLOUD — Super Admin Routes
// Platform-level admin endpoints (super_admin only)
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { config } from "../../config/index.js";
import {
  getPlatformOverview,
  getOrgList,
  getOrgDetail,
  getRevenueAnalytics,
  getSystemHealth,
  getModuleAdoption,
  getModuleAnalytics,
  getUserGrowth,
  getSubscriptionMetrics,
  getRecentActivity,
} from "../../services/admin/super-admin.service.js";
import {
  getServiceHealth,
  forceHealthCheck,
} from "../../services/admin/health-check.service.js";
import {
  runSanityCheck,
  runAutoFix,
} from "../../services/admin/data-sanity.service.js";

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
    const sortBy = (req.query.sort_by as string) || undefined;
    const sortOrder = (req.query.sort_order as string) as "asc" | "desc" | undefined;

    const result = await getOrgList({ page, per_page: perPage, search, sort_by: sortBy, sort_order: sortOrder });
    sendPaginated(res, result.data, result.total, result.page, result.per_page);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/organizations/:id — org detail
router.get("/organizations/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = parseInt(String(req.params.id), 10);
    const detail = await getOrgDetail(orgId);
    sendSuccess(res, detail);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/modules — module analytics
router.get("/modules", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analytics = await getModuleAnalytics();
    sendSuccess(res, analytics);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/revenue — revenue analytics
router.get("/revenue", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const period = (req.query.period as string) || "12m";
    const metrics = await getRevenueAnalytics(period);
    sendSuccess(res, metrics);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/growth — user/org growth metrics
router.get("/growth", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const period = (req.query.period as string) || "12m";
    const growth = await getUserGrowth(period);
    sendSuccess(res, growth);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/subscriptions — subscription metrics
router.get("/subscriptions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await getSubscriptionMetrics();
    sendSuccess(res, metrics);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/activity — recent platform activity
router.get("/activity", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 30;
    const activity = await getRecentActivity(Math.min(limit, 100));
    sendSuccess(res, activity);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/health — system health check (basic, backward compat)
router.get("/health", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await getSystemHealth();
    sendSuccess(res, health);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/service-health — detailed service health dashboard
router.get("/service-health", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await getServiceHealth();
    sendSuccess(res, health);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/service-health/check — force immediate health check
router.post("/service-health/check", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await forceHealthCheck();
    sendSuccess(res, health);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/module-adoption — module adoption stats (backward compat)
router.get("/module-adoption", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adoption = await getModuleAdoption();
    sendSuccess(res, adoption);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/platform-info — non-sensitive platform configuration
router.get("/platform-info", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uptimeSeconds = Math.floor(process.uptime());
    const smtpConfigured = !!(config.smtp.host && config.smtp.host !== "localhost");

    const info = {
      server: {
        version: "1.0.0",
        node_version: process.version,
        uptime_seconds: uptimeSeconds,
        environment: config.nodeEnv,
      },
      email: {
        configured: smtpConfigured,
        host: config.smtp.host || "-",
        from: config.smtp.from || "-",
      },
      security: {
        bcrypt_rounds: 12,
        access_token_expiry: config.oauth.accessTokenExpiry,
        refresh_token_expiry: config.oauth.refreshTokenExpiry,
        rate_limit_auth: `${config.rateLimit.auth.max} req / ${Math.round(config.rateLimit.auth.windowMs / 60000)}min`,
        rate_limit_api: `${config.rateLimit.api.max} req / ${Math.round(config.rateLimit.api.windowMs / 60000)}min`,
      },
    };

    sendSuccess(res, info);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/data-sanity — run cross-module data sanity check
router.get("/data-sanity", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await runSanityCheck();
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/data-sanity/fix — auto-fix data issues
router.post("/data-sanity/fix", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await runAutoFix();
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
});

export default router;
