// =============================================================================
// EMP CLOUD — Server Configuration
// Loads environment variables and exports a typed config object.
// =============================================================================

import { config as dotenvConfig } from "dotenv";
dotenvConfig();

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
    // SendGrid API key — leave blank in local/dev to silently no-op
    // all sends while still logging what would have been delivered.
    sendgridApiKey: process.env.SENDGRID_API_KEY || "",
    fromEmail: env("SENDGRID_FROM_EMAIL", "noreply@empcloud.com"),
    fromName: env("SENDGRID_FROM_NAME", "EMP Cloud"),
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
} as const;
