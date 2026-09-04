// =============================================================================
// EMP CLOUD — Super Admin Routes
// Platform-level admin endpoints (super_admin only)
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { getDB } from "../../db/connection.js";
import { config } from "../../config/index.js";
import {
  getPlatformOverview,
  getOrgList,
  getOrgStats,
  getOrgDetail,
  getRevenueAnalytics,
  getSystemHealth,
  getModuleAdoption,
  getModuleAnalytics,
  getUserGrowth,
  getSubscriptionMetrics,
  getRecentActivity,
  getOverdueOrganizations,
} from "../../services/admin/super-admin.service.js";
import {
  getServiceHealth,
  forceHealthCheck,
} from "../../services/admin/health-check.service.js";
import {
  runSanityCheck,
  runAutoFix,
} from "../../services/admin/data-sanity.service.js";
import {
  createSystemNotification,
  listSystemNotifications,
  deactivateSystemNotification,
} from "../../services/admin/system-notification.service.js";
import * as planPricingAdmin from "../../services/admin/plan-pricing-admin.service.js";
import * as subscriptionAdmin from "../../services/admin/subscription-admin.service.js";
import * as orgAdmin from "../../services/admin/org-admin.service.js";
import { logAudit } from "../../services/audit/audit.service.js";
import {
  adminOrganizationAccessControlsSchema,
  adminOrganizationCommentParamsSchema,
  adminOrganizationCommentSchema,
  adminOrganizationListQuerySchema,
  AuditAction,
  idParamSchema,
} from "@empcloud/shared";
import * as adminBilling from "../../services/admin/admin-billing.service.js";
import { billingFetchRaw } from "../../services/billing/billing-integration.service.js";
import { hashPassword } from "../../utils/crypto.js";

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
    const query = adminOrganizationListQuerySchema.parse(req.query);
    const result = await getOrgList(query);
    sendPaginated(res, result.data, result.total, result.page, result.per_page);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/organizations/stats — headline counters for the org list.
// MUST stay above "/organizations/:id", otherwise Express matches "stats" as
// the :id param and this 404s.
router.get("/organizations/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getOrgStats();
    sendSuccess(res, stats);
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

// PATCH /api/v1/admin/organizations/:id/access-controls — immediately apply
// tenant-wide login and overdue-payment restrictions.
router.patch(
  "/organizations/:id/access-controls",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = idParamSchema.parse(req.params).id;
      const data = adminOrganizationAccessControlsSchema.parse(req.body);
      const controls = await orgAdmin.updateOrganizationAccessControls({
        orgId,
        loginBlocked: data.login_blocked,
        paymentBlockEnabled: data.payment_block_enabled,
      });

      await logAudit({
        organizationId: orgId,
        userId: req.user!.sub,
        action: AuditAction.ORG_UPDATED,
        resourceType: "organization_access_controls",
        resourceId: String(orgId),
        details: controls,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });

      sendSuccess(res, controls);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Organization comments — operator notes kept against a tenant
// ---------------------------------------------------------------------------

// GET /api/v1/admin/organizations/:id/comments
router.get("/organizations/:id/comments", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = idParamSchema.parse(req.params).id;
    const comments = await orgAdmin.listOrgComments(orgId);
    sendSuccess(res, comments);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/organizations/:id/comments
router.post("/organizations/:id/comments", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = idParamSchema.parse(req.params).id;
    const data = adminOrganizationCommentSchema.parse(req.body);
    const comment = await orgAdmin.addOrgComment({
      orgId,
      authorUserId: req.user!.sub,
      comment: data.comment,
    });
    await logAudit({
      organizationId: orgId,
      userId: req.user!.sub,
      action: AuditAction.ORG_COMMENT_ADDED,
      resourceType: "organization_comment",
      resourceId: String(comment.id),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    sendSuccess(res, comment, 201);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/organizations/:id/comments/:commentId
router.put(
  "/organizations/:id/comments/:commentId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: orgId, commentId } = adminOrganizationCommentParamsSchema.parse(req.params);
      const data = adminOrganizationCommentSchema.parse(req.body);
      const comment = await orgAdmin.updateOrgComment({
        orgId,
        commentId,
        comment: data.comment,
      });
      await logAudit({
        organizationId: orgId,
        userId: req.user!.sub,
        action: AuditAction.ORG_COMMENT_UPDATED,
        resourceType: "organization_comment",
        resourceId: String(commentId),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      sendSuccess(res, comment);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/admin/organizations/:id/comments/:commentId
router.delete(
  "/organizations/:id/comments/:commentId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: orgId, commentId } = adminOrganizationCommentParamsSchema.parse(req.params);
      await orgAdmin.deleteOrgComment({ orgId, commentId });
      await logAudit({
        organizationId: orgId,
        userId: req.user!.sub,
        action: AuditAction.ORG_COMMENT_DELETED,
        resourceType: "organization_comment",
        resourceId: String(commentId),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      sendSuccess(res, { id: commentId });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Organization deletion
// ---------------------------------------------------------------------------

// GET /api/v1/admin/organizations/:id/deletion-impact — blast radius preview
router.get(
  "/organizations/:id/deletion-impact",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const impact = await orgAdmin.getOrgDeletionImpact(parseInt(String(req.params.id), 10));
      sendSuccess(res, impact);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/admin/organizations/:id — permanently delete a tenant.
// Body must carry `confirm_name` matching the org name exactly.
router.delete("/organizations/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = parseInt(String(req.params.id), 10);

    const result = await orgAdmin.deleteOrganization({
      orgId,
      confirmName: req.body?.confirm_name,
      actingSuperAdminId: req.user!.sub,
    });

    // Audit AFTER the delete succeeds — logging first would leave a false
    // "org deleted" record behind every rejected confirmation. `organizationId`
    // is null because the tenant no longer exists; `details` is what preserves
    // which one it was.
    await logAudit({
      organizationId: null,
      userId: req.user!.sub,
      action: AuditAction.ORG_DELETED,
      resourceType: "organization",
      resourceId: String(orgId),
      details: {
        organization_id: orgId,
        name: result.name,
        users_deleted: result.users_deleted,
        rows_cleared: result.rows_cleared,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    sendSuccess(res, result);
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

// GET /api/v1/admin/overdue-organizations — #984 orgs with overdue subscriptions
router.get("/overdue-organizations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getOverdueOrganizations();
    sendSuccess(res, data);
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
    const emailConfigured = !!config.email.sendgridApiKey;

    const info = {
      server: {
        version: "1.0.0",
        node_version: process.version,
        uptime_seconds: uptimeSeconds,
        environment: config.nodeEnv,
      },
      email: {
        configured: emailConfigured,
        provider: emailConfigured ? "sendgrid" : "-",
        from: config.email.fromEmail || "-",
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

// =========================================================================
// Cross-Org Audit Logs (#1225)
// =========================================================================

// GET /api/v1/admin/audit — cross-org audit logs with filters
router.get("/audit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    const page = parseInt(req.query.page as string, 10) || 1;
    const perPage = Math.min(parseInt(req.query.per_page as string, 10) || 20, 100);

    let query = db("audit_logs");

    // Filters
    if (req.query.org_id) {
      query = query.where("organization_id", Number(req.query.org_id));
    }
    if (req.query.user_id) {
      query = query.where("user_id", Number(req.query.user_id));
    }
    if (req.query.action) {
      query = query.where("action", req.query.action as string);
    }
    if (req.query.start_date) {
      query = query.where("created_at", ">=", req.query.start_date as string);
    }
    if (req.query.end_date) {
      const endDate = new Date(req.query.end_date as string);
      endDate.setDate(endDate.getDate() + 1);
      query = query.where("created_at", "<", endDate.toISOString().slice(0, 10));
    }

    const [{ count }] = await query.clone().count("* as count");
    const logs = await query
      .orderBy("created_at", "desc")
      .limit(perPage)
      .offset((page - 1) * perPage);

    sendPaginated(res, logs, Number(count), page, perPage);
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// User Management across orgs (super_admin)
// =========================================================================

// PUT /api/v1/admin/organizations/:orgId/users/:userId/deactivate — deactivate a user
router.put("/organizations/:orgId/users/:userId/deactivate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    const orgId = parseInt(String(req.params.orgId), 10);
    const userId = parseInt(String(req.params.userId), 10);

    const user = await db("users").where({ id: userId, organization_id: orgId }).first();
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }

    await db("users").where({ id: userId }).update({ status: 0, updated_at: new Date() });
    sendSuccess(res, { message: "User deactivated" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/organizations/:orgId/users/:userId/activate — activate a user
router.put("/organizations/:orgId/users/:userId/activate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    const orgId = parseInt(String(req.params.orgId), 10);
    const userId = parseInt(String(req.params.userId), 10);

    const user = await db("users").where({ id: userId, organization_id: orgId }).first();
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }

    await db("users").where({ id: userId }).update({ status: 1, updated_at: new Date() });
    sendSuccess(res, { message: "User activated" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/organizations/:orgId/users/:userId/reset-password — reset password
router.put("/organizations/:orgId/users/:userId/reset-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    const orgId = parseInt(String(req.params.orgId), 10);
    const userId = parseInt(String(req.params.userId), 10);
    const { new_password } = req.body;

    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ success: false, error: { message: "Password must be at least 8 characters" } });
    }

    const user = await db("users").where({ id: userId, organization_id: orgId }).first();
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }

    const hashed = await hashPassword(new_password);
    await db("users").where({ id: userId }).update({ password: hashed, updated_at: new Date() });
    sendSuccess(res, { message: "Password reset successfully" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/organizations/:orgId/users/:userId/role — change role
router.put("/organizations/:orgId/users/:userId/role", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    const orgId = parseInt(String(req.params.orgId), 10);
    const userId = parseInt(String(req.params.userId), 10);
    const { role } = req.body;

    const validRoles = ["employee", "manager", "hr_admin", "org_admin"];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: { message: `Role must be one of: ${validRoles.join(", ")}` } });
    }

    const user = await db("users").where({ id: userId, organization_id: orgId }).first();
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }

    await db("users").where({ id: userId }).update({ role, updated_at: new Date() });
    sendSuccess(res, { message: "Role updated", role });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// System Notifications (super_admin)
// =========================================================================

// GET /api/v1/admin/notifications — list system notifications
router.get("/notifications", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const perPage = parseInt(req.query.per_page as string, 10) || 20;
    const activeOnly = req.query.active_only === "true";
    const result = await listSystemNotifications({ page, perPage, activeOnly });
    sendPaginated(res, result.notifications, result.total, page, perPage);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/notifications — create system notification
router.post("/notifications", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, message, target_type, target_org_id, notification_type, scheduled_at, expires_at } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, error: { message: "title and message are required" } });
    }
    if (target_type && !["all", "org"].includes(target_type)) {
      return res.status(400).json({ success: false, error: { message: "target_type must be 'all' or 'org'" } });
    }
    if (target_type === "org" && !target_org_id) {
      return res.status(400).json({ success: false, error: { message: "target_org_id is required when target_type is 'org'" } });
    }

    const notification = await createSystemNotification({
      title,
      message,
      target_type: target_type || "all",
      target_org_id: target_org_id || null,
      notification_type: notification_type || "info",
      created_by: req.user!.sub,
      scheduled_at: scheduled_at || null,
      expires_at: expires_at || null,
    });

    sendSuccess(res, notification, 201);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/notifications/:id/deactivate — deactivate notification
router.put("/notifications/:id/deactivate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const result = await deactivateSystemNotification(id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// Module Management (super_admin)
// =========================================================================

// PUT /api/v1/admin/modules/:id — enable/disable a module and/or set its api_url.
//
// api_url is the per-environment base the platform uses to reach the module
// (health checks, module-sync, dashboard widgets). It used to be settable only
// by editing the DB directly, which is how prod ended up stuck on migration
// 040's local-dev defaults. Both fields are optional; send either or both.
router.put("/modules/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDB();
    const moduleId = parseInt(String(req.params.id), 10);
    const { is_active, api_url } = req.body;

    if (is_active === undefined && api_url === undefined) {
      return res
        .status(400)
        .json({ success: false, error: { message: "Provide is_active and/or api_url" } });
    }
    if (is_active !== undefined && typeof is_active !== "boolean") {
      return res.status(400).json({ success: false, error: { message: "is_active must be a boolean" } });
    }
    if (api_url !== undefined && api_url !== null && typeof api_url !== "string") {
      return res
        .status(400)
        .json({ success: false, error: { message: "api_url must be a string or null" } });
    }
    // Reject anything the health check / sync callers can't actually fetch —
    // a bad value here silently marks a healthy module as "down".
    const trimmedUrl = typeof api_url === "string" ? api_url.trim() : api_url;
    if (typeof trimmedUrl === "string" && trimmedUrl !== "") {
      try {
        const u = new URL(trimmedUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
      } catch {
        return res.status(400).json({
          success: false,
          error: { message: "api_url must be an absolute http(s) URL, e.g. http://localhost:6003/api/v1" },
        });
      }
    }

    const mod = await db("modules").where({ id: moduleId }).first();
    if (!mod) {
      return res.status(404).json({ success: false, error: { message: "Module not found" } });
    }

    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (is_active !== undefined) patch.is_active = is_active;
    // "" / null clears it, which lets the env bootstrap re-seed it on restart.
    if (api_url !== undefined) patch.api_url = trimmedUrl === "" || trimmedUrl === null ? null : trimmedUrl;

    await db("modules").where({ id: moduleId }).update(patch);

    const updated = await db("modules").where({ id: moduleId }).first();
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// PRICING MANAGEMENT (super_admin)
// Tiers (custom plan tiers beyond free / basic / professional /
// enterprise) and pricing rows (currency x tier x volume band x
// effective_from).
// =========================================================================

// ─── Tiers ────────────────────────────────────────────────────────────────

router.get("/pricing/tiers", async (req, res, next) => {
  try { sendSuccess(res, await planPricingAdmin.listTiers()); } catch (err) { next(err); }
});

router.post("/pricing/tiers", async (req, res, next) => {
  try { sendSuccess(res, await planPricingAdmin.createTier(req.body || {})); } catch (err) { next(err); }
});

router.put("/pricing/tiers/:id", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await planPricingAdmin.updateTier(id, req.body || {}));
  } catch (err) { next(err); }
});

router.delete("/pricing/tiers/:id", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await planPricingAdmin.deleteTier(id));
  } catch (err) { next(err); }
});

// ─── Pricing rows ────────────────────────────────────────────────────────

router.get("/pricing/rows", async (req, res, next) => {
  try {
    const { tier_id, currency } = req.query as any;
    sendSuccess(res, await planPricingAdmin.listPricing({
      tier_id: tier_id ? Number(tier_id) : undefined,
      currency: currency ? String(currency) : undefined,
    }));
  } catch (err) { next(err); }
});

router.post("/pricing/rows", async (req, res, next) => {
  try {
    sendSuccess(res, await planPricingAdmin.createPricing({
      ...(req.body || {}),
      updated_by: req.user!.sub,
    }));
  } catch (err) { next(err); }
});

router.put("/pricing/rows/:id", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await planPricingAdmin.updatePricing(id, {
      ...(req.body || {}),
      updated_by: req.user!.sub,
    }));
  } catch (err) { next(err); }
});

router.delete("/pricing/rows/:id", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await planPricingAdmin.deletePricing(id));
  } catch (err) { next(err); }
});

// ─── Billing cycles ──────────────────────────────────────────────────────

router.get("/pricing/billing-cycles", async (req, res, next) => {
  try { sendSuccess(res, await planPricingAdmin.listBillingCycles()); } catch (err) { next(err); }
});

router.post("/pricing/billing-cycles", async (req, res, next) => {
  try { sendSuccess(res, await planPricingAdmin.createBillingCycle(req.body || {})); } catch (err) { next(err); }
});

router.put("/pricing/billing-cycles/:id", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await planPricingAdmin.updateBillingCycle(id, req.body || {}));
  } catch (err) { next(err); }
});

router.delete("/pricing/billing-cycles/:id", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await planPricingAdmin.deleteBillingCycle(id));
  } catch (err) { next(err); }
});

// =========================================================================
// SUBSCRIPTION MANAGEMENT (super_admin)
// Full per-subscription edit surface: list / detail / update any field /
// status quick actions / comp (free) / record manual invoice intent.
//
// NOTE: the existing GET /admin/subscriptions returns aggregate METRICS
// for backward compatibility. The new endpoints live under
// /admin/subscriptions/list and /admin/subscriptions/:id so they don't
// collide.
// =========================================================================

router.get("/subscriptions/list", async (req, res, next) => {
  try {
    const { status, plan_tier, currency, module_id, organization_id, q, page, limit } = req.query as any;
    const out = await subscriptionAdmin.listSubscriptions({
      status,
      plan_tier,
      currency,
      module_id: module_id ? Number(module_id) : undefined,
      organization_id: organization_id ? Number(organization_id) : undefined,
      q,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    sendSuccess(res, out);
  } catch (err) { next(err); }
});

router.get("/subscriptions/detail/:id", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await subscriptionAdmin.getSubscription(id));
  } catch (err) { next(err); }
});

router.put("/subscriptions/detail/:id", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await subscriptionAdmin.updateSubscription(id, req.body || {}, req.user!.sub));
  } catch (err) { next(err); }
});

router.post("/subscriptions/detail/:id/suspend", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await subscriptionAdmin.suspendSubscription(id, req.user!.sub));
  } catch (err) { next(err); }
});

router.post("/subscriptions/detail/:id/activate", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await subscriptionAdmin.activateSubscription(id, req.user!.sub));
  } catch (err) { next(err); }
});

router.post("/subscriptions/detail/:id/cancel", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await subscriptionAdmin.cancelSubscription(id, req.user!.sub));
  } catch (err) { next(err); }
});

router.post("/subscriptions/detail/:id/free", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { reason } = req.body || {};
    sendSuccess(res, await subscriptionAdmin.markFree(id, String(reason || ""), req.user!.sub));
  } catch (err) { next(err); }
});

router.post("/subscriptions/detail/:id/unfree", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await subscriptionAdmin.unmarkFree(id, req.user!.sub));
  } catch (err) { next(err); }
});

router.post("/subscriptions/detail/:id/manual-invoice", async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    sendSuccess(res, await subscriptionAdmin.recordManualInvoiceIntent(id, req.body || {}, req.user!.sub));
  } catch (err) { next(err); }
});

// =========================================================================
// ADMIN BILLING (super_admin) — invoice mgmt + subscribe-on-behalf
// All endpoints proxy to emp-billing under the hood. Failures here mean
// emp-billing is unreachable or the BILLING_API_KEY is wrong.
// =========================================================================

// GET /admin/billing/invoices — list all invoices across all orgs
router.get("/billing/invoices", async (req, res, next) => {
  try {
    const { status, client_id, organization_id, q, page, limit } = req.query as any;
    sendSuccess(res, await adminBilling.listInvoices({
      status,
      client_id,
      organization_id: organization_id ? Number(organization_id) : undefined,
      q,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }));
  } catch (err) { next(err); }
});

// POST /admin/billing/invoices/:id/mark-paid
router.post("/billing/invoices/:id/mark-paid", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    sendSuccess(res, await adminBilling.markInvoicePaid(id, req.body || {}, req.user!.sub));
  } catch (err) { next(err); }
});

// POST /admin/billing/invoices/:id/send
router.post("/billing/invoices/:id/send", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    sendSuccess(res, await adminBilling.sendInvoiceEmail(id, req.user!.sub));
  } catch (err) { next(err); }
});

// GET /admin/billing/invoices/:id/pdf — pipes the PDF stream from emp-billing
router.get("/billing/invoices/:id/pdf", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    // Fetch PDF stream from emp-billing and pipe through
    const billingUrl = (process.env.BILLING_MODULE_URL || "") + `/api/v1/invoices/${id}/pdf`;
    const r = await fetch(billingUrl, {
      headers: { Authorization: `Bearer ${process.env.BILLING_API_KEY}` },
    });
    if (!r.ok) {
      res.status(r.status).json({ success: false, error: { message: "PDF unavailable" } });
      return;
    }
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      r.headers.get("content-disposition") || `inline; filename="invoice-${id}.pdf"`,
    );
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (err) { next(err); }
});

// POST /admin/billing/subscribe-on-behalf — body { organization_id, module_id,
//   plan_tier, total_seats, billing_cycle?, trial_days? }
router.post("/billing/subscribe-on-behalf", async (req, res, next) => {
  try {
    sendSuccess(res, await adminBilling.subscribeOnBehalf(req.body || {}, req.user!.sub));
  } catch (err) { next(err); }
});

// GET /admin/billing/invoices/:id — single invoice detail
router.get("/billing/invoices/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const result = await billingFetchRaw("GET", `/invoices/${id}`);
    if (!result) {
      res.status(404).json({ success: false, error: { message: "Invoice not found" } });
      return;
    }
    sendSuccess(res, result.data ?? result);
  } catch (err) { next(err); }
});

export default router;
