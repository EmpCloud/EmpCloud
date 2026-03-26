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
    issuer: env("BASE_URL", "http://localhost:3000"),
  },

  cors: {
    allowedOrigins: env(
      "ALLOWED_ORIGINS",
      "http://localhost:5173,http://localhost:5174,http://localhost:5175"
    ).split(","),
  },

  smtp: {
    host: env("SMTP_HOST", "localhost"),
    port: envInt("SMTP_PORT", 1025),
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: env("SMTP_FROM", "noreply@empcloud.com"),
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
  },

  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "", // For DeepSeek, Groq, Together, Ollama, etc.
    model: process.env.AI_MODEL || "claude-sonnet-4-20250514",
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || "4096", 10),
  },

  log: {
    level: env("LOG_LEVEL", "debug"),
    format: env("LOG_FORMAT", "pretty"),
  },
} as const;
