// =============================================================================
// EMP CLOUD — Server Entry Point
// =============================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { initDB, closeDB } from "./db/connection.js";
import { loadKeys } from "./services/oauth/jwt.service.js";
import { attachChatRealtime } from "./realtime/io.js";
import { errorHandler } from "./api/middleware/error.middleware.js";
import { requestIdMiddleware } from "./api/middleware/request-id.middleware.js";
import { sendSuccess } from "./utils/response.js";
import { startHealthCheckInterval, stopHealthCheckInterval } from "./services/admin/health-check.service.js";
import { startTrialExpirationInterval, stopTrialExpirationInterval } from "./services/subscription/trial-expiration.interval.js";
import { initTelegramBot, stopTelegramBot } from "./services/telegram/telegram.service.js";
import { startAttendanceReportCron, stopAttendanceReportCron } from "./services/attendance/attendance-report.interval.js";

// Docs
import { swaggerUIHandler, openapiHandler } from "./api/docs/index.js";
import { recordMounts } from "./api/docs/route-recorder.js";

// Self-hosted Swagger UI assets — served same-origin so the proxy CSP ('self')
// allows them. The old unpkg.com CDN is blocked by the nginx/Cloudflare CSP
// that overrides the app's own per-response CSP (browser enforces the
// intersection, and the proxy policy lacks the CDN host).
const swaggerUiAssetPath = createRequire(import.meta.url)("swagger-ui-dist").getAbsoluteFSPath();

// Route imports
import authRoutes from "./api/routes/auth.routes.js";
import oauthRoutes from "./api/routes/oauth.routes.js";
import orgRoutes from "./api/routes/org.routes.js";
import userRoutes from "./api/routes/user.routes.js";
import moduleRoutes from "./api/routes/module.routes.js";
import subscriptionRoutes from "./api/routes/subscription.routes.js";
import auditRoutes from "./api/routes/audit.routes.js";
// HRMS routes
import employeeRoutes from "./api/routes/employee.routes.js";
import attendanceRoutes from "./api/routes/attendance.routes.js";
import leaveRoutes from "./api/routes/leave.routes.js";
import documentRoutes from "./api/routes/document.routes.js";
import announcementRoutes from "./api/routes/announcement.routes.js";
import emailTemplateRoutes from "./api/routes/email-template.routes.js";
import policyRoutes from "./api/routes/policy.routes.js";
import notificationRoutes from "./api/routes/notification.routes.js";
import dashboardRoutes from "./api/routes/dashboard.routes.js";
import billingWebhookRoutes from "./api/routes/billing-webhook.routes.js";
import moduleWebhookRoutes from "./api/routes/module-webhook.routes.js";
import billingRoutes from "./api/routes/billing.routes.js";
import adminRoutes from "./api/routes/admin.routes.js";
import onboardingRoutes from "./api/routes/onboarding.routes.js";
import biometricLegacyRoutes from "./api/routes/biometric-legacy.routes.js";
import fieldLegacyRoutes from "./api/routes/field-legacy.routes.js";
import nasRoutes from "./api/routes/nas.routes.js";
import helpdeskRoutes from "./api/routes/helpdesk.routes.js";
import surveyRoutes from "./api/routes/survey.routes.js";
import assetRoutes from "./api/routes/asset.routes.js";
import positionRoutes from "./api/routes/position.routes.js";
import feedbackRoutes from "./api/routes/anonymous-feedback.routes.js";
import eventRoutes from "./api/routes/event.routes.js";
import whistleblowingRoutes from "./api/routes/whistleblowing.routes.js";
import chatbotRoutes from "./api/routes/chatbot.routes.js";
import chatRoutes from "./api/routes/chat.routes.js";
import forumRoutes from "./api/routes/forum.routes.js";
import wellnessRoutes from "./api/routes/wellness.routes.js";
import managerRoutes from "./api/routes/manager.routes.js";
import customFieldRoutes from "./api/routes/custom-field.routes.js";
import aiConfigRoutes from "./api/routes/ai-config.routes.js";
import logRoutes from "./api/routes/logs.routes.js";
import roleRoutes from "./api/routes/role.routes.js";
import apiKeyRoutes from "./api/routes/api-key.routes.js";
import assistantRoutes from "./api/routes/assistant.routes.js";

async function main() {
  // Initialize database
  await initDB();

  // Auto-migrate if enabled
  if (config.db.autoMigrate) {
    const { getDB } = await import("./db/connection.js");
    const { runAllMigrations } = await import("./db/run-migrations.js");
    const db = getDB();
    await runAllMigrations(db);
  }

  // Bootstrap module api_url from env vars. A set <MODULE>_MODULE_URL is
  // AUTHORITATIVE: it overwrites whatever is stored, rather than only filling
  // NULLs as this used to.
  //
  // Why: migration 040 seeds api_url with LOCAL-DEV defaults (localhost:4000,
  // :4500, ...) on every environment, and it runs before this block. So on test
  // and prod nothing was ever NULL by the time we got here, this bootstrap
  // silently no-opped, and the dev ports stuck forever — the health dashboard
  // then called ports nothing listens on and reported every module "down"
  // (instant ECONNREFUSED, ~5ms), while the services were actually fine. The
  // same stale URLs also feed module-sync and the dashboard widgets.
  //
  // Env vars are per-environment by definition, so letting them win is what
  // makes these addresses correct on local, test and prod with no code change.
  // Slugs with no env var set are left untouched.
  {
    const { getDB } = await import("./db/connection.js");
    const db = getDB();

    /** `http://host:6003` + `/api/v1` -> `http://host:6003/api/v1` (no double slash). */
    const withPath = (baseUrl: string | undefined, apiPath: string): string | undefined =>
      baseUrl ? `${baseUrl.replace(/\/+$/, "")}${apiPath}` : undefined;

    const moduleUrls: Record<string, string | undefined> = {
      "emp-billing": withPath(process.env.BILLING_MODULE_URL, "/api/v1"),
      "emp-payroll": withPath(process.env.PAYROLL_MODULE_URL, "/api/v1"),
      "emp-recruit": withPath(process.env.RECRUIT_MODULE_URL, "/api/v1"),
      "emp-performance": withPath(process.env.PERFORMANCE_MODULE_URL, "/api/v1"),
      "emp-rewards": withPath(process.env.REWARDS_MODULE_URL, "/api/v1"),
      "emp-exit": withPath(process.env.EXIT_MODULE_URL, "/api/v1"),
      "emp-lms": withPath(process.env.LMS_MODULE_URL, "/api/v1"),
      "emp-field": withPath(process.env.FIELD_MODULE_URL, "/api/v1"),
      "emp-projects": withPath(process.env.PROJECT_MODULE_URL, "/v1"),
      "emp-monitor": withPath(process.env.MONITOR_MODULE_URL, "/api/v3"),
    };

    for (const [slug, apiUrl] of Object.entries(moduleUrls)) {
      if (!apiUrl) continue;
      try {
        const row = await db("modules").where({ slug }).first();
        // Only write when it actually differs, so a correct config is a no-op
        // and the log line below only appears when something was fixed.
        if (!row || row.api_url === apiUrl) continue;
        await db("modules").where({ slug }).update({ api_url: apiUrl, updated_at: new Date() });
        logger.info(`Module api_url set from env: ${slug} -> ${apiUrl} (was ${row.api_url ?? "null"})`);
      } catch {
        /* never block startup on this */
      }
    }
  }

  // Load RSA keys
  loadKeys();

  // Create Express app
  const app = express();

  // Record route mounts for OpenAPI auto-discovery — must run before any
  // app.use(prefix, router) calls below so the docs reflect the full API.
  recordMounts(app);

  // Trust proxy (behind Nginx)
  app.set("trust proxy", 1);

  // Global middleware
  app.use(requestIdMiddleware);
  const helmetDefault = helmet();
  const helmetNoCSP = helmet({ contentSecurityPolicy: false });
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/docs")) return helmetNoCSP(req, res, next);
    return helmetDefault(req, res, next);
  });
  app.use(cors({
    origin: config.cors.allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-EmpCloud-API-Key", "X-Device-API-Key", "X-Request-ID"],
  }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Serve bundled public assets (e.g. the logo embedded in transactional
  // emails). Resolved relative to this file so it works whether running
  // from src/ via tsx or from dist/ via node — both sit one level under
  // packages/server/, so ../public points at the same committed folder.
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
  app.use(
    "/static",
    express.static(publicDir, {
      maxAge: "30d",
      immutable: false,
    }),
  );

  // Rate limiting (disabled when RATE_LIMIT_DISABLED=true)
  const disabled = process.env.RATE_LIMIT_DISABLED === "true";
  const authLimiter = disabled
    ? (_req: any, _res: any, next: any) => next()
    : rateLimit({
        windowMs: config.rateLimit.auth.windowMs,
        max: config.rateLimit.auth.max,
        standardHeaders: true,
        legacyHeaders: false,
      });

  const apiLimiter = disabled
    ? (_req: any, _res: any, next: any) => next()
    : rateLimit({
        windowMs: config.rateLimit.api.windowMs,
        max: config.rateLimit.api.max,
        standardHeaders: true,
        legacyHeaders: false,
      });

  if (disabled) logger.info("Rate limiting DISABLED (RATE_LIMIT_DISABLED=true)");

  // Health check
  app.get("/health", (_req, res) => {
    const data: Record<string, string> = {
      status: "healthy",
      timestamp: new Date().toISOString(),
    };
    // Only expose version in non-production environments
    if (!config.isProd) {
      data.version = "1.0.0";
    }
    sendSuccess(res, data);
  });

  // OIDC Discovery (must be at root)
  app.use("/", oauthRoutes);

  // Webhooks (unauthenticated — modules send these directly)
  app.use("/api/v1/webhooks", billingWebhookRoutes);
  app.use("/api/v1/webhooks", moduleWebhookRoutes);

  // Client error reporting (unauthenticated — errors may happen before login)
  app.post("/api/v1/logs/client-error", apiLimiter, (req, res) => {
    const { message, stack, url, component, userId, userAgent, timestamp, level } = req.body;
    if (!message) {
      res.status(400).json({ success: false, error: "message is required" });
      return;
    }
    logger.error(`CLIENT_ERROR: ${String(message).substring(0, 500)}`, {
      source: "frontend",
      errorMessage: String(message).substring(0, 1000),
      stack: stack ? String(stack).substring(0, 2000) : undefined,
      url: url || undefined,
      component: component || undefined,
      userId: userId || null,
      userAgent: userAgent || req.headers["user-agent"],
      clientTimestamp: timestamp || new Date().toISOString(),
      errorLevel: level || "error",
      ip: req.ip,
    });
    res.json({ success: true });
  });

  // API routes
  app.use("/api/v1/auth", authLimiter, authRoutes);
  app.use("/oauth", authLimiter, oauthRoutes);
  app.use("/api/v1/organizations", apiLimiter, orgRoutes);
  app.use("/api/v1/users", apiLimiter, userRoutes);
  app.use("/api/v1/modules", apiLimiter, moduleRoutes);
  app.use("/api/v1/subscriptions", apiLimiter, subscriptionRoutes);
  app.use("/api/v1/audit", apiLimiter, auditRoutes);
  // HRMS routes
  app.use("/api/v1/employees", apiLimiter, employeeRoutes);
  app.use("/api/v1/attendance", apiLimiter, attendanceRoutes);
  app.use("/api/v1/leave", apiLimiter, leaveRoutes);
  app.use("/api/v1/documents", apiLimiter, documentRoutes);
  app.use("/api/v1/announcements", apiLimiter, announcementRoutes);
  app.use("/api/v1/email-templates", apiLimiter, emailTemplateRoutes);
  app.use("/api/v1/policies", apiLimiter, policyRoutes);
  app.use("/api/v1/notifications", apiLimiter, notificationRoutes);
  app.use("/api/v1/dashboard", apiLimiter, dashboardRoutes);
  app.use("/api/v1/billing", apiLimiter, billingRoutes);
  app.use("/api/v1/admin", apiLimiter, adminRoutes);
  app.use("/api/v1/admin/ai-config", apiLimiter, aiConfigRoutes);
  app.use("/api/v1/admin/logs", apiLimiter, logRoutes);
  app.use("/api/v1/onboarding", apiLimiter, onboardingRoutes);
  // Legacy emp-monitor kiosk surface — same paths/responses as
  // emp-monitor's v3/bioMetric router, backed by EmpCloud tables.
  app.use("/api/v3/biometric", apiLimiter, biometricLegacyRoutes);
  // Legacy emp-monitor EMP Field surface — same paths/responses as
  // emp-monitor's v3/hrms/* + v3/user/fieldAllEmployeeList field-tracking
  // endpoints, gated by FIELD_TRACKING_SECRET_KEY, backed by EmpCloud tables.
  app.use("/api/v3", apiLimiter, fieldLegacyRoutes);
  // Legacy emp-monitor NAS (SFTP file storage) surface.
  app.use("/api/v3/nas", apiLimiter, nasRoutes);
  app.use("/api/v1/helpdesk", apiLimiter, helpdeskRoutes);
  app.use("/api/v1/surveys", apiLimiter, surveyRoutes);
  app.use("/api/v1/assets", apiLimiter, assetRoutes);
  app.use("/api/v1/positions", apiLimiter, positionRoutes);
  app.use("/api/v1/feedback", apiLimiter, feedbackRoutes);
  app.use("/api/v1/events", apiLimiter, eventRoutes);
  app.use("/api/v1/whistleblowing", apiLimiter, whistleblowingRoutes);
  app.use("/api/v1/chatbot", apiLimiter, chatbotRoutes);
  app.use("/api/v1/chat", apiLimiter, chatRoutes);
  app.use("/api/v1/forum", apiLimiter, forumRoutes);
  app.use("/api/v1/wellness", apiLimiter, wellnessRoutes);
  app.use("/api/v1/manager", apiLimiter, managerRoutes);
  app.use("/api/v1/custom-fields", apiLimiter, customFieldRoutes);
  app.use("/api/v1/roles", apiLimiter, roleRoutes);
  app.use("/api/v1/api-keys", apiLimiter, apiKeyRoutes);
  app.use("/api/v1/assistant", apiLimiter, assistantRoutes);

  // API Documentation
  app.use("/api/docs/ui", express.static(swaggerUiAssetPath, { maxAge: "7d", immutable: true }));
  app.get("/api/docs", swaggerUIHandler);
  app.get("/api/docs/openapi.json", openapiHandler);

  // Catch-all 404 for unmatched API routes (returns JSON instead of HTML)
  app.use("/api", (_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Endpoint not found" },
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  // Start background health check interval (every 60s)
  startHealthCheckInterval();

  // Start hourly trial expiration sweep (flips trial → active when trial_ends_at passes)
  startTrialExpirationInterval();

  // Telegram bot (replies to /start with the chat id) + the 00:00 daily
  // attendance report cron. Both no-op when TELEGRAM_BOT_TOKEN is unset.
  initTelegramBot();
  startAttendanceReportCron();

  // Start server
  const server = app.listen(config.port, () => {
    logger.info(`EMP Cloud server running on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`OIDC Discovery: ${config.baseUrl}/.well-known/openid-configuration`);
    logger.info(`OAuth Authorize: ${config.baseUrl}/oauth/authorize`);
    logger.info(`API Docs: ${config.baseUrl}/health`);
  });

  // Attach the chat realtime gateway (socket.io) to the same http.Server.
  // Failure here must not take the HTTP server down — chat degrades to polling.
  const io = await attachChatRealtime(server).catch((err) => {
    logger.error("Failed to attach chat realtime gateway — chat falls back to polling", err);
    return null;
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    // Close sockets first, else open WebSockets stall server.close().
    if (io) await io.close().catch(() => {});
    server.close(async () => {
      stopHealthCheckInterval();
      stopTrialExpirationInterval();
      stopAttendanceReportCron();
      stopTelegramBot();
      await closeDB();
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
