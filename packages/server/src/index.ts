// =============================================================================
// EMP CLOUD — Server Entry Point
// =============================================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { initDB, closeDB } from "./db/connection.js";
import { loadKeys } from "./services/oauth/jwt.service.js";
import { errorHandler } from "./api/middleware/error.middleware.js";
import { sendSuccess } from "./utils/response.js";

// Docs
import { swaggerUIHandler, openapiHandler } from "./api/docs/index.js";

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
import policyRoutes from "./api/routes/policy.routes.js";
import notificationRoutes from "./api/routes/notification.routes.js";
import dashboardRoutes from "./api/routes/dashboard.routes.js";
import billingWebhookRoutes from "./api/routes/billing-webhook.routes.js";
import moduleWebhookRoutes from "./api/routes/module-webhook.routes.js";
import billingRoutes from "./api/routes/billing.routes.js";
import adminRoutes from "./api/routes/admin.routes.js";
import onboardingRoutes from "./api/routes/onboarding.routes.js";
import biometricsRoutes from "./api/routes/biometrics.routes.js";
import helpdeskRoutes from "./api/routes/helpdesk.routes.js";
import surveyRoutes from "./api/routes/survey.routes.js";
import assetRoutes from "./api/routes/asset.routes.js";
import positionRoutes from "./api/routes/position.routes.js";
import feedbackRoutes from "./api/routes/anonymous-feedback.routes.js";
import eventRoutes from "./api/routes/event.routes.js";
import whistleblowingRoutes from "./api/routes/whistleblowing.routes.js";
import chatbotRoutes from "./api/routes/chatbot.routes.js";
import forumRoutes from "./api/routes/forum.routes.js";
import wellnessRoutes from "./api/routes/wellness.routes.js";
import managerRoutes from "./api/routes/manager.routes.js";
import customFieldRoutes from "./api/routes/custom-field.routes.js";
import aiConfigRoutes from "./api/routes/ai-config.routes.js";

async function main() {
  // Initialize database
  await initDB();

  // Auto-migrate if enabled
  if (config.db.autoMigrate) {
    const { up: m001 } = await import("./db/migrations/001_identity_schema.js");
    const { up: m002 } = await import("./db/migrations/002_modules_subscriptions.js");
    const { up: m003 } = await import("./db/migrations/003_oauth2.js");
    const { up: m004 } = await import("./db/migrations/004_audit_invitations.js");
    const { getDB } = await import("./db/connection.js");
    const db = getDB();
    await m001(db);
    await m002(db);
    await m003(db);
    await m004(db);
    // HRMS migrations
    const { up: m005 } = await import("./db/migrations/005_employee_profiles.js");
    const { up: m006 } = await import("./db/migrations/006_attendance.js");
    const { up: m007 } = await import("./db/migrations/007_leave.js");
    const { up: m008 } = await import("./db/migrations/008_documents.js");
    const { up: m009 } = await import("./db/migrations/009_announcements.js");
    const { up: m010 } = await import("./db/migrations/010_policies.js");
    await m005(db);
    await m006(db);
    await m007(db);
    await m008(db);
    await m009(db);
    await m010(db);
    const { up: m011 } = await import("./db/migrations/011_notifications.js");
    await m011(db);
    const { up: m012 } = await import("./db/migrations/012_billing_integration.js");
    await m012(db);
    const { up: m013 } = await import("./db/migrations/013_onboarding.js");
    await m013(db);
    const { up: m015 } = await import("./db/migrations/015_biometrics.js");
    await m015(db);
    const { up: m016 } = await import("./db/migrations/016_helpdesk.js");
    await m016(db);
    const { up: m017 } = await import("./db/migrations/017_surveys.js");
    await m017(db);
    const { up: m018 } = await import("./db/migrations/018_assets.js");
    await m018(db);
    const { up: m019 } = await import("./db/migrations/019_positions.js");
    await m019(db);
    const { up: m020 } = await import("./db/migrations/020_anonymous_feedback.js");
    await m020(db);
    const { up: m021 } = await import("./db/migrations/021_events.js");
    await m021(db);
    const { up: m022 } = await import("./db/migrations/022_whistleblowing.js");
    await m022(db);
    const { up: m023 } = await import("./db/migrations/023_chatbot.js");
    await m023(db);
    const { up: m024 } = await import("./db/migrations/024_social_intranet.js");
    await m024(db);
    const { up: m025 } = await import("./db/migrations/025_wellness.js");
    await m025(db);
    const { up: m026 } = await import("./db/migrations/026_shift_swap_requests.js");
    await m026(db);
    const { up: m027 } = await import("./db/migrations/027_custom_fields.js");
    await m027(db);
    const { up: m028 } = await import("./db/migrations/028_ai_config.js");
    await m028(db);
    const { up: m029 } = await import("./db/migrations/029_kb_article_ratings.js");
    await m029(db);
    // Note: EMP Cloud uses auto-migrate with hasTable/hasColumn guards instead of
    // a migration tracking table (like knex_migrations). This is by design — each
    // migration is idempotent and safe to re-run on every startup.
    logger.info("Auto-migration complete (including HRMS + billing + onboarding + biometrics + helpdesk + surveys + assets + positions + feedback + events + whistleblowing + chatbot + forum + wellness + shift-swaps + custom-fields + ai-config + kb-ratings)");
  }

  // Load RSA keys
  loadKeys();

  // Create Express app
  const app = express();

  // Trust proxy (behind Nginx)
  app.set("trust proxy", 1);

  // Global middleware
  app.use(helmet());
  app.use(cors({
    origin: config.cors.allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-EmpCloud-API-Key", "X-Device-API-Key"],
  }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting
  const authLimiter = rateLimit({
    windowMs: config.rateLimit.auth.windowMs,
    max: config.rateLimit.auth.max,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: config.rateLimit.api.windowMs,
    max: config.rateLimit.api.max,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Health check
  app.get("/health", (_req, res) => {
    sendSuccess(res, {
      status: "healthy",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  });

  // OIDC Discovery (must be at root)
  app.use("/", oauthRoutes);

  // Webhooks (unauthenticated — modules send these directly)
  app.use("/api/v1/webhooks", billingWebhookRoutes);
  app.use("/api/v1/webhooks", moduleWebhookRoutes);

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
  app.use("/api/v1/policies", apiLimiter, policyRoutes);
  app.use("/api/v1/notifications", apiLimiter, notificationRoutes);
  app.use("/api/v1/dashboard", apiLimiter, dashboardRoutes);
  app.use("/api/v1/billing", apiLimiter, billingRoutes);
  app.use("/api/v1/admin", apiLimiter, adminRoutes);
  app.use("/api/v1/admin/ai-config", apiLimiter, aiConfigRoutes);
  app.use("/api/v1/onboarding", apiLimiter, onboardingRoutes);
  app.use("/api/v1/biometrics", apiLimiter, biometricsRoutes);
  app.use("/api/v1/helpdesk", apiLimiter, helpdeskRoutes);
  app.use("/api/v1/surveys", apiLimiter, surveyRoutes);
  app.use("/api/v1/assets", apiLimiter, assetRoutes);
  app.use("/api/v1/positions", apiLimiter, positionRoutes);
  app.use("/api/v1/feedback", apiLimiter, feedbackRoutes);
  app.use("/api/v1/events", apiLimiter, eventRoutes);
  app.use("/api/v1/whistleblowing", apiLimiter, whistleblowingRoutes);
  app.use("/api/v1/chatbot", apiLimiter, chatbotRoutes);
  app.use("/api/v1/forum", apiLimiter, forumRoutes);
  app.use("/api/v1/wellness", apiLimiter, wellnessRoutes);
  app.use("/api/v1/manager", apiLimiter, managerRoutes);
  app.use("/api/v1/custom-fields", apiLimiter, customFieldRoutes);

  // API Documentation
  app.get("/api/docs", swaggerUIHandler);
  app.get("/api/docs/openapi.json", openapiHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  // Start server
  const server = app.listen(config.port, () => {
    logger.info(`EMP Cloud server running on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`OIDC Discovery: ${config.baseUrl}/.well-known/openid-configuration`);
    logger.info(`OAuth Authorize: ${config.baseUrl}/oauth/authorize`);
    logger.info(`API Docs: ${config.baseUrl}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
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
