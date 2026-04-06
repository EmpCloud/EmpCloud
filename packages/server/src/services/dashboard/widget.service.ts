// =============================================================================
// EMP CLOUD — Dashboard Widget Service
// Fetches summary data from subscribed module APIs (server-to-server).
// =============================================================================

import Redis from "ioredis";
import { config } from "../../config/index.js";
import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Redis client (lazy singleton)
// ---------------------------------------------------------------------------

let redis: Redis | null = null;

/* v8 ignore start */ // Redis + HTTP infrastructure-dependent code
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    redis.connect().catch((err) => {
      logger.warn("Redis connection failed — widget caching disabled", { error: err.message });
      redis = null;
    });
  }
  return redis!;
}

// ---------------------------------------------------------------------------
// Module endpoint mapping
// ---------------------------------------------------------------------------

interface ModuleEndpoint {
  slug: string;
  port: number;
  path: string;
  transform: (data: any) => Record<string, unknown> | null;
}

const MODULE_ENDPOINTS: ModuleEndpoint[] = [
  {
    slug: "emp-recruit",
    port: 4500,
    path: "/api/v1/analytics/overview",
    transform: (data) => ({
      openJobs: data.open_jobs ?? data.openJobs ?? 0,
      totalCandidates: data.total_candidates ?? data.totalCandidates ?? 0,
      recentHires: data.recent_hires ?? data.recentHires ?? 0,
    }),
  },
  {
    slug: "emp-performance",
    port: 4300,
    path: "/api/v1/analytics/overview",
    transform: (data) => ({
      activeCycles: data.active_cycles ?? data.activeCycles ?? 0,
      pendingReviews: data.pending_reviews ?? data.pendingReviews ?? 0,
      goalCompletion: data.goal_completion ?? data.goalCompletion ?? 0,
    }),
  },
  {
    slug: "emp-rewards",
    port: 4600,
    path: "/api/v1/analytics/overview",
    transform: (data) => ({
      totalKudos: data.total_kudos ?? data.totalKudos ?? 0,
      pointsDistributed: data.points_distributed ?? data.pointsDistributed ?? 0,
      badgesAwarded: data.badges_awarded ?? data.badgesAwarded ?? 0,
    }),
  },
  {
    slug: "emp-exit",
    port: 4400,
    path: "/api/v1/analytics/attrition",
    transform: (data) => ({
      attritionRate: data.attrition_rate ?? data.attritionRate ?? 0,
      activeExits: data.active_exits ?? data.activeExits ?? 0,
    }),
  },
  {
    slug: "emp-lms",
    port: 4700,
    path: "/api/v1/analytics/overview",
    transform: (data) => ({
      activeCourses: data.active_courses ?? data.activeCourses ?? 0,
      totalEnrollments: data.total_enrollments ?? data.totalEnrollments ?? 0,
      completionRate: data.completion_rate ?? data.completionRate ?? 0,
    }),
  },
];

const CACHE_TTL = 300; // 5 minutes in seconds
const FETCH_TIMEOUT = 3000; // 3 seconds

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Service": "empcloud-dashboard",
        "X-Internal-Secret": process.env.INTERNAL_SERVICE_SECRET || "",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json() as any;
    // Support both { data: ... } envelope and raw response
    return json.data ?? json;
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(orgId: number, slug: string): string {
  return `widget:${orgId}:${slug}`;
}

async function getCached(orgId: number, slug: string): Promise<Record<string, unknown> | undefined> {
  try {
    const r = getRedis();
    if (!r) return undefined;
    const raw = await r.get(cacheKey(orgId, slug));
    if (raw) return JSON.parse(raw);
  } catch {
    // cache miss — not critical
  }
  return undefined;
}

async function setCache(orgId: number, slug: string, data: Record<string, unknown>): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(cacheKey(orgId, slug), JSON.stringify(data), "EX", CACHE_TTL);
  } catch {
    // cache write failure — not critical
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WidgetData {
  [moduleKey: string]: Record<string, unknown> | null;
}

export async function getModuleWidgets(orgId: number, _userId: number): Promise<WidgetData> {
  const db = getDB();

  // Get all active/trial subscriptions for this org, joined with module info
  const subscriptions = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.organization_id": orgId })
    .whereIn("s.status", ["active", "trial"])
    .select("m.slug", "m.base_url");

  const subscribedSlugs = new Set(subscriptions.map((s: any) => s.slug));

  // Build a map of slug → base_url for modules that have a custom base_url
  const baseUrlMap = new Map<string, string>();
  for (const sub of subscriptions) {
    if (sub.base_url) baseUrlMap.set(sub.slug, sub.base_url);
  }

  // Only fetch widgets for modules the org is subscribed to
  const relevantEndpoints = MODULE_ENDPOINTS.filter((ep) => subscribedSlugs.has(ep.slug));

  const results: WidgetData = {};

  await Promise.all(
    relevantEndpoints.map(async (ep) => {
      // Derive a short key from slug: "emp-recruit" → "recruit"
      const key = ep.slug.replace(/^emp-/, "");

      // Try cache first
      const cached = await getCached(orgId, ep.slug);
      if (cached) {
        results[key] = cached;
        return;
      }

      // Determine the base URL: prefer DB base_url, fall back to localhost:port
      const base = baseUrlMap.get(ep.slug) || `http://localhost:${ep.port}`;
      const url = `${base}${ep.path}?organization_id=${orgId}`;

      try {
        const raw = await fetchWithTimeout(url, FETCH_TIMEOUT);
        const transformed = ep.transform(raw);
        if (transformed) {
          results[key] = transformed;
          await setCache(orgId, ep.slug, transformed);
        } else {
          results[key] = null;
        }
      } catch (err: any) {
        logger.warn(`Widget fetch failed for ${ep.slug}`, { error: err.message, url });
        results[key] = null;
      }
    })
  );

  return results;
}

/* v8 ignore stop */