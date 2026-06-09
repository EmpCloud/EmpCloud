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

// Modules are loaded from the `modules` DB table at check time (migration
// 040 added `api_url`, which is populated per environment by the admin
// "Module Registry" page). Previously this list was hardcoded with
// http://localhost:<dev_port>/health URLs, so prod -- where modules live on
// totally different ports / behind public HTTPS domains -- saw every
// service as "stopped" because the dev-port localhost calls all timed out.
// Reading from the DB makes the dashboard correct across local, test, and
// prod with no code change per environment.

type DbModule = {
  name: string;
  slug: string;
  api_url: string;
  port: number;
  health_url: string;
};

/**
 * Derive a base health URL from a module's stored api_url.
 *
 *   https://payroll-api.empcloud.com/api/v1   ->  https://payroll-api.empcloud.com/health
 *   http://localhost:4000/api/v1              ->  http://localhost:4000/health
 *   https://project-api.empcloud.com/v1       ->  https://project-api.empcloud.com/health
 */
function deriveHealthUrl(apiUrl: string): string | null {
  try {
    const u = new URL(apiUrl);
    return `${u.protocol}//${u.host}/health`;
  } catch {
    return null;
  }
}

async function loadModulesFromDb(): Promise<DbModule[]> {
  const db = getDB();
  const rows = await db("modules")
    .where({ is_active: true })
    .whereNotNull("api_url")
    .select("name", "slug", "api_url");

  // Also include EMP Cloud Core itself. It isn't usually a row in `modules`
  // (it IS the host that owns the table), so we add it explicitly so the
  // dashboard surfaces the host's own health. Hits the same process via
  // localhost, which is the cheapest possible check.
  const selfPort = config.port ?? 3000;
  const selfUrl = `http://localhost:${selfPort}/health`;

  const out: DbModule[] = [
    {
      name: "EMP Cloud",
      slug: "empcloud",
      api_url: selfUrl,
      port: selfPort,
      health_url: selfUrl,
    },
  ];

  for (const r of rows) {
    const healthUrl = deriveHealthUrl(String(r.api_url));
    if (!healthUrl) continue;
    let port = 0;
    try {
      const u = new URL(String(r.api_url));
      port = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
    } catch {
      port = 0;
    }
    out.push({
      name: r.name,
      slug: r.slug,
      api_url: String(r.api_url),
      port,
      health_url: healthUrl,
    });
  }

  return out;
}

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

async function checkModuleHealth(mod: DbModule): Promise<ModuleHealth> {
  const start = Date.now();
  const lastChecked = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(mod.health_url, { signal: controller.signal });
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

async function checkEndpoint(mod: DbModule): Promise<EndpointStatus> {
  const start = Date.now();
  const lastChecked = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(mod.health_url, { signal: controller.signal });
    clearTimeout(timer);

    const responseTime = Date.now() - start;

    return {
      module: mod.name,
      endpoint: "/health",
      method: "GET",
      status: response.ok ? "healthy" : "down",
      statusCode: response.status,
      responseTime,
      lastChecked,
    };
  } catch {
    return {
      module: mod.name,
      endpoint: "/health",
      method: "GET",
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

  // Load the active module set from the DB. If the query fails (DB
  // outage), fall back to an empty list -- the infra block below will
  // still surface the MySQL outage so the dashboard shows the real
  // cause rather than a spurious "no modules" silence.
  let dbModules: DbModule[] = [];
  try {
    dbModules = await loadModulesFromDb();
  } catch (err: any) {
    logger.warn("Health check: could not load modules from DB", { error: err?.message });
  }

  // Run all checks in parallel
  const [moduleResults, mysqlHealth, redisHealth, endpointResults] = await Promise.all([
    Promise.all(dbModules.map(checkModuleHealth)),
    checkMySQLHealth(),
    checkRedisHealth(),
    Promise.all(dbModules.map(checkEndpoint)),
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
