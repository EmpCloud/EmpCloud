// =============================================================================
// EMP CLOUD — Health Check Service
// Checks health of all modules, MySQL, and Redis every 60 seconds with caching
// =============================================================================

import { getDB } from "../../db/connection.js";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import Redis from "ioredis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModuleHealth {
  name: string;
  slug: string;
  port: number;
  status: "healthy" | "degraded" | "down";
  responseTime: number;
  lastChecked: string;
  uptime?: string;
  version?: string;
  error?: string;
}

export interface InfraHealth {
  name: string;
  status: "connected" | "disconnected";
  responseTime: number;
  lastChecked: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface EndpointStatus {
  module: string;
  endpoint: string;
  method: string;
  status: "healthy" | "down";
  responseTime: number;
  statusCode?: number;
  lastChecked: string;
}

export interface HealthCheckResult {
  overall_status: "operational" | "degraded" | "major_outage";
  modules: ModuleHealth[];
  infrastructure: InfraHealth[];
  endpoints: EndpointStatus[];
  healthy_count: number;
  degraded_count: number;
  down_count: number;
  total_count: number;
  last_full_check: string;
}

// ---------------------------------------------------------------------------
// Module definitions
// ---------------------------------------------------------------------------

const MODULES = [
  { name: "EMP Cloud", slug: "empcloud", url: "http://localhost:3000/health", port: 3000 },
  { name: "EMP Recruit", slug: "emp-recruit", url: "http://localhost:4500/health", port: 4500 },
  { name: "EMP Performance", slug: "emp-performance", url: "http://localhost:4300/health", port: 4300 },
  { name: "EMP Rewards", slug: "emp-rewards", url: "http://localhost:4600/health", port: 4600 },
  { name: "EMP Exit", slug: "emp-exit", url: "http://localhost:4400/health", port: 4400 },
  { name: "EMP Billing", slug: "emp-billing", url: "http://localhost:4001/health", port: 4001 },
  { name: "EMP LMS", slug: "emp-lms", url: "http://localhost:4700/health", port: 4700 },
  { name: "EMP Payroll", slug: "emp-payroll", url: "http://localhost:4000/health", port: 4000 },
  { name: "EMP Projects", slug: "emp-projects", url: "http://localhost:3100/health", port: 3100 },
  { name: "EMP Monitor", slug: "emp-monitor", url: "http://localhost:5000/health", port: 5000 },
];

// Key API endpoints to test per module
const KEY_ENDPOINTS = [
  { module: "EMP Cloud", endpoint: "/health", method: "GET", url: "http://localhost:3000/health" },
  { module: "EMP Recruit", endpoint: "/health", method: "GET", url: "http://localhost:4500/health" },
  { module: "EMP Performance", endpoint: "/health", method: "GET", url: "http://localhost:4300/health" },
  { module: "EMP Rewards", endpoint: "/health", method: "GET", url: "http://localhost:4600/health" },
  { module: "EMP Exit", endpoint: "/health", method: "GET", url: "http://localhost:4400/health" },
  { module: "EMP Billing", endpoint: "/health", method: "GET", url: "http://localhost:4001/health" },
  { module: "EMP LMS", endpoint: "/health", method: "GET", url: "http://localhost:4700/health" },
  { module: "EMP Payroll", endpoint: "/health", method: "GET", url: "http://localhost:4000/health" },
  { module: "EMP Projects", endpoint: "/health", method: "GET", url: "http://localhost:3100/health" },
  { module: "EMP Monitor", endpoint: "/health", method: "GET", url: "http://localhost:5000/health" },
];

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedResult: HealthCheckResult | null = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds
let checkInterval: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Health check helpers
// ---------------------------------------------------------------------------

async function checkModuleHealth(mod: typeof MODULES[number]): Promise<ModuleHealth> {
  const start = Date.now();
  const lastChecked = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(mod.url, { signal: controller.signal });
    clearTimeout(timer);

    const responseTime = Date.now() - start;

    if (!response.ok) {
      return {
        name: mod.name,
        slug: mod.slug,
        port: mod.port,
        status: "degraded",
        responseTime,
        lastChecked,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    // Try to parse response body for version/uptime
    let uptime: string | undefined;
    let version: string | undefined;
    try {
      const body = (await response.json()) as Record<string, any>;
      if (body.uptime) uptime = formatUptime(body.uptime);
      if (body.version) version = body.version;
      if (body.data?.uptime) uptime = formatUptime(body.data.uptime);
      if (body.data?.version) version = body.data.version;
    } catch {
      // Response may not be JSON, that's fine
    }

    // Determine status based on response time
    const status: "healthy" | "degraded" = responseTime > 2000 ? "degraded" : "healthy";

    return {
      name: mod.name,
      slug: mod.slug,
      port: mod.port,
      status,
      responseTime,
      lastChecked,
      uptime,
      version,
    };
  } catch (err: any) {
    return {
      name: mod.name,
      slug: mod.slug,
      port: mod.port,
      status: "down",
      responseTime: Date.now() - start,
      lastChecked,
      error: err.name === "AbortError" ? "Request timed out (5s)" : (err.message || "Connection refused"),
    };
  }
}

async function checkMySQLHealth(): Promise<InfraHealth> {
  const start = Date.now();
  const lastChecked = new Date().toISOString();

  try {
    const db = getDB();
    const [row] = await db.raw("SELECT 1 as ok");
    const responseTime = Date.now() - start;

    // Get additional DB info
    let details: Record<string, unknown> = {};
    try {
      const [versionResult] = await db.raw("SELECT VERSION() as version");
      const [threadResult] = await db.raw("SHOW STATUS LIKE 'Threads_connected'");
      details = {
        version: versionResult?.[0]?.version || versionResult?.version,
        threads_connected: threadResult?.[0]?.Value || threadResult?.Value,
        host: `${config.db.host}:${config.db.port}`,
        database: config.db.name,
      };
    } catch {
      // Non-critical, skip
    }

    return {
      name: "MySQL",
      status: "connected",
      responseTime,
      lastChecked,
      details,
    };
  } catch (err: any) {
    return {
      name: "MySQL",
      status: "disconnected",
      responseTime: Date.now() - start,
      lastChecked,
      error: err.message || "Cannot connect to MySQL",
    };
  }
}

async function checkRedisHealth(): Promise<InfraHealth> {
  const start = Date.now();
  const lastChecked = new Date().toISOString();

  let client: Redis | null = null;

  try {
    client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });

    await client.connect();

    const pong = await client.ping();
    const responseTime = Date.now() - start;

    // Get Redis info
    let details: Record<string, unknown> = {};
    try {
      const info = await client.info("server");
      const versionMatch = info.match(/redis_version:(.+)/);
      const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);
      details = {
        version: versionMatch ? versionMatch[1].trim() : undefined,
        uptime: uptimeMatch ? formatUptime(parseInt(uptimeMatch[1], 10)) : undefined,
        host: `${config.redis.host}:${config.redis.port}`,
      };
    } catch {
      // Non-critical
    }

    await client.quit();

    return {
      name: "Redis",
      status: pong === "PONG" ? "connected" : "disconnected",
      responseTime,
      lastChecked,
      details,
    };
  } catch (err: any) {
    try {
      if (client) await client.quit();
    } catch {
      // Ignore disconnect errors
    }

    return {
      name: "Redis",
      status: "disconnected",
      responseTime: Date.now() - start,
      lastChecked,
      error: err.message || "Cannot connect to Redis",
    };
  }
}

async function checkEndpoint(ep: typeof KEY_ENDPOINTS[number]): Promise<EndpointStatus> {
  const start = Date.now();
  const lastChecked = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(ep.url, { signal: controller.signal });
    clearTimeout(timer);

    const responseTime = Date.now() - start;

    return {
      module: ep.module,
      endpoint: ep.endpoint,
      method: ep.method,
      status: response.ok ? "healthy" : "down",
      statusCode: response.status,
      responseTime,
      lastChecked,
    };
  } catch {
    return {
      module: ep.module,
      endpoint: ep.endpoint,
      method: ep.method,
      status: "down",
      responseTime: Date.now() - start,
      lastChecked,
    };
  }
}

// ---------------------------------------------------------------------------
// Main check function
// ---------------------------------------------------------------------------

async function performFullHealthCheck(): Promise<HealthCheckResult> {
  logger.info("Performing full health check...");

  // Run all checks in parallel
  const [moduleResults, mysqlHealth, redisHealth, endpointResults] = await Promise.all([
    Promise.all(MODULES.map(checkModuleHealth)),
    checkMySQLHealth(),
    checkRedisHealth(),
    Promise.all(KEY_ENDPOINTS.map(checkEndpoint)),
  ]);

  const healthyCount = moduleResults.filter((m) => m.status === "healthy").length;
  const degradedCount = moduleResults.filter((m) => m.status === "degraded").length;
  const downCount = moduleResults.filter((m) => m.status === "down").length;
  const totalCount = moduleResults.length;

  // Determine overall status
  let overall_status: HealthCheckResult["overall_status"] = "operational";
  if (downCount > 0 && healthyCount === 0) {
    overall_status = "major_outage";
  } else if (downCount > 0 || degradedCount > 0) {
    overall_status = "degraded";
  }

  // If MySQL or Redis is down, degrade further
  if (mysqlHealth.status === "disconnected" || redisHealth.status === "disconnected") {
    overall_status = overall_status === "operational" ? "degraded" : overall_status;
  }

  const result: HealthCheckResult = {
    overall_status,
    modules: moduleResults,
    infrastructure: [mysqlHealth, redisHealth],
    endpoints: endpointResults,
    healthy_count: healthyCount,
    degraded_count: degradedCount,
    down_count: downCount,
    total_count: totalCount,
    last_full_check: new Date().toISOString(),
  };

  cachedResult = result;
  lastCheckTime = Date.now();

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the health check result. Returns cached result if within TTL,
 * otherwise performs a fresh check.
 */
export async function getServiceHealth(): Promise<HealthCheckResult> {
  const now = Date.now();
  if (cachedResult && now - lastCheckTime < CACHE_TTL_MS) {
    return cachedResult;
  }
  return performFullHealthCheck();
}

/**
 * Force an immediate health check, bypassing cache.
 */
export async function forceHealthCheck(): Promise<HealthCheckResult> {
  return performFullHealthCheck();
}

/**
 * Start the background health check interval (every 60 seconds).
 * Called once on server startup.
 */
export function startHealthCheckInterval(): void {
  if (checkInterval) return; // Already running

  // Run an initial check
  performFullHealthCheck().catch((err) => {
    logger.error("Initial health check failed", { error: err.message });
  });

  checkInterval = setInterval(() => {
    performFullHealthCheck().catch((err) => {
      logger.error("Background health check failed", { error: err.message });
    });
  }, CACHE_TTL_MS);

  logger.info("Health check interval started (every 60s)");
}

/**
 * Stop the background health check interval.
 */
export function stopHealthCheckInterval(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    logger.info("Health check interval stopped");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
  if (typeof seconds !== "number" || isNaN(seconds)) return "N/A";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(" ") : "< 1m";
}
