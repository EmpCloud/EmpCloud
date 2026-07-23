// =============================================================================
// EMP CLOUD — Server Configuration
// Loads environment variables and exports a typed config object.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

// Load .env by walking up from this file until we find one. The default
// `dotenvConfig()` (no args) reads <cwd>/.env, which silently misses the
// file when PM2's cwd isn't packages/server/ — and we've been bitten by
// exactly that (BASE_URL falling through to the localhost default in
// prod because the .env was never read). Walking up makes us independent
// of cwd whether we're run via tsx from src/ or node from dist/.
{
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) {
      dotenvConfig({ path: candidate });
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall through to default cwd-based load too, in case someone explicitly
  // arranged their deployment to rely on it (harmless no-op otherwise).
  dotenvConfig();
}

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function envInt(key: string, fallback?: number): number {
  const raw = process.env[key];
  if (raw !== undefined) return parseInt(raw, 10);
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

function envBool(key: string, fallback = false): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

export const config = {
  nodeEnv: env("NODE_ENV", "development"),
  port: envInt("PORT", 3000),
  baseUrl: env("BASE_URL", "http://localhost:3000"),
  isDev: env("NODE_ENV", "development") === "development",
  isProd: env("NODE_ENV", "development") === "production",

  db: {
    host: env("DB_HOST", "localhost"),
    port: envInt("DB_PORT", 3306),
    user: env("DB_USER", "root"),
    password: env("DB_PASSWORD", "secret"),
    name: env("DB_NAME", "empcloud"),
    autoMigrate: envBool("DB_AUTO_MIGRATE", true),
  },

  redis: {
    host: env("REDIS_HOST", "localhost"),
    port: envInt("REDIS_PORT", 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  chat: {
    // Org-id allowlist for the employee chat feature (comma-separated, e.g.
    // "3" or "3,7,12") to pilot chat with specific orgs before a general
    // rollout. Set CHAT_ENABLED_ORGS=all to enable for every org.
    // IMPORTANT: empty/unset/garbage => chat OFF for everyone (fail closed),
    // so a forgotten env var can't silently turn chat on org-wide.
    enableForAllOrgs: (process.env.CHAT_ENABLED_ORGS ?? "").trim().toLowerCase() === "all",
    enabledOrgIds: (process.env.CHAT_ENABLED_ORGS ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n)),
  },

  oauth: {
    privateKeyPath: env("RSA_PRIVATE_KEY_PATH", "./keys/private.pem"),
    publicKeyPath: env("RSA_PUBLIC_KEY_PATH", "./keys/public.pem"),
    accessTokenExpiry: env("ACCESS_TOKEN_EXPIRY", "15m"),
    refreshTokenExpiry: env("REFRESH_TOKEN_EXPIRY", "7d"),
    authCodeExpiry: env("AUTH_CODE_EXPIRY", "10m"),
    idTokenExpiry: env("ID_TOKEN_EXPIRY", "1h"),
    // Use JWT_ISSUER if set explicitly; otherwise derive from BASE_URL.
    // The old fallback hardcoded the TEST api URL when NODE_ENV=production,
    // which meant real prod JWTs carried `iss: test-empcloud-api…` until
    // ops remembered to set JWT_ISSUER. Drop the branch: BASE_URL is
    // already meant to be the environment's canonical external origin, so
    // deriving from it works for both dev and prod.
    issuer: env("JWT_ISSUER", env("BASE_URL", "http://localhost:3000")),
  },

  cors: {
    allowedOrigins: env(
      "ALLOWED_ORIGINS",
      "http://localhost:5173,http://localhost:5174,http://localhost:5175"
    ).split(","),
  },

  email: {
    // SendGrid API key — leave blank to fall through to the SMTP path
    // below. With neither SendGrid nor SMTP configured, sendEmail() is
    // a no-op (still logs the would-be delivery for debugging).
    sendgridApiKey: process.env.SENDGRID_API_KEY || "",
    fromEmail: env("SENDGRID_FROM_EMAIL", env("SMTP_FROM", "noreply@empcloud.com")),
    fromName: env("SENDGRID_FROM_NAME", "EMP Cloud"),
    // SMTP fallback — used when SENDGRID_API_KEY is empty but SMTP_HOST
    // is set. Lets local dev with Mailpit/MailHog (host=localhost,
    // port=1025, no auth) actually receive password-reset & invite
    // emails without provisioning a SendGrid account.
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: envInt("SMTP_PORT", 587),
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
      // STARTTLS by default; some providers (port 465) want implicit TLS.
      // Auto-pick implicit TLS for port 465; everything else upgrades.
      secure: envInt("SMTP_PORT", 587) === 465,
    },
    // Public URL of the EMP Cloud client — used to build the reset and
    // invitation links that end up in emails. Falls back to BASE_URL so
    // dev just works without another env var.
    appUrl: env("APP_URL", env("BASE_URL", "http://localhost:5173")),
  },

  rateLimit: {
    auth: {
      max: envInt("RATE_LIMIT_AUTH_MAX", 20),
      windowMs: envInt("RATE_LIMIT_AUTH_WINDOW_MS", 900000),
    },
    api: {
      max: envInt("RATE_LIMIT_API_MAX", 100),
      windowMs: envInt("RATE_LIMIT_API_WINDOW_MS", 60000),
    },
  },

  billing: {
    moduleUrl: env("BILLING_MODULE_URL", "http://localhost:4001"),
    apiKey: process.env.BILLING_API_KEY || "",
    gracePeriodDays: envInt("BILLING_GRACE_PERIOD_DAYS", 0),
  },

  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "", // For DeepSeek, Groq, Together, Ollama, etc.
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.AI_MODEL || "claude-sonnet-4-20250514",
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || "4096", 10),
  },

  // Telegram bot for the daily attendance report. One global platform bot;
  // orgs opt in and configure recipient chat IDs in Attendance Settings.
  // Empty token = bot disabled (no polling, no report delivery).
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
  },

  assistant: {
    openaiApiKey: process.env.ASSISTANT_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
    openaiBaseUrl: process.env.ASSISTANT_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "",
    openaiOrganization:
      process.env.ASSISTANT_OPENAI_ORGANIZATION || process.env.OPENAI_ORGANIZATION || "",
    openaiProject: process.env.ASSISTANT_OPENAI_PROJECT || process.env.OPENAI_PROJECT || "",
    useLegacyMaxTokens: env("ASSISTANT_USE_LEGACY_MAX_TOKENS", "false") === "true",
    model: env("ASSISTANT_MODEL", "gpt-5.6"),
    maxTokens: envInt("ASSISTANT_MAX_TOKENS", 2048),
    maxToolRounds: Math.min(envInt("ASSISTANT_MAX_TOOL_ROUNDS", 8), 8),
    providerMaxRetries: Math.min(Math.max(envInt("ASSISTANT_PROVIDER_MAX_RETRIES", 2), 0), 5),
    providerRetryBaseMs: Math.max(envInt("ASSISTANT_PROVIDER_RETRY_BASE_MS", 500), 100),
    moduleMaxRetries: Math.min(Math.max(envInt("ASSISTANT_MODULE_MAX_RETRIES", 2), 0), 5),
    moduleRetryBaseMs: Math.max(envInt("ASSISTANT_MODULE_RETRY_BASE_MS", 300), 100),
    payrollUrl: env("PAYROLL_MODULE_URL", "http://localhost:4000"),
    monitorUrl: env("MONITOR_MODULE_URL", "http://localhost:5000"),
    internalServiceSecret: process.env.INTERNAL_SERVICE_SECRET || "",
  },

  log: {
    level: env("LOG_LEVEL", "debug"),
    format: env("LOG_FORMAT", "pretty"),
  },

  nas: {
    sftp: {
      host: process.env.NAS_SFTP_HOST || "",
      port: envInt("NAS_SFTP_PORT", 22),
      user: process.env.NAS_SFTP_USER || "",
      password: process.env.NAS_SFTP_PASSWORD || "",
      basePath: process.env.NAS_SFTP_BASE_PATH || "",
    },
    projectName: process.env.NAS_PROJECT_NAME || "emp-biometric-user-profiles",
    // Shared secret that clients pass as `secretKey` on write/list endpoints.
    // Matches emp-monitor's `NAS_SECRET_KEY` so existing kiosk firmware can
    // use the same credential. Fail-closed: if unset, the middleware 503s
    // every call.
    secretKey: process.env.NAS_SECRET_KEY || "",
  },

  fieldTracking: {
    // Shared secret the EMP Field app sends as `secretKey` on every
    // /api/v3/hrms/* and /api/v3/user/fieldAllEmployeeList request. Mirrors
    // emp-monitor's `FIELD_TRACKING_SECRET_KEY` so the existing field client
    // works unchanged. Fail-closed: if unset, the middleware rejects every
    // call (unlike emp-monitor, whose `undefined === undefined` check let an
    // unset secret silently disable auth).
    secretKey: process.env.FIELD_TRACKING_SECRET_KEY || "",
  },
} as const;
