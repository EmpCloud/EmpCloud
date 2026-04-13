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

// Fallback ports only used when modules.api_url (and modules.base_url) are
// both NULL in the DB. Match the actual production deployment ports on the
// backend host — see docs/DEPLOYMENT.md Port Map. Update both here and in
// the DB when a module's port moves.
const MODULE_ENDPOINTS: ModuleEndpoint[] = [
  {
    slug: "emp-recruit",
    port: 6015,
    path: "/api/v1/analytics/overview",
    transform: (data) => ({
      openJobs: data.open_jobs ?? data.openJobs ?? 0,
      totalCandidates: data.total_candidates ?? data.totalCandidates ?? 0,
      recentHires: data.recent_hires ?? data.recentHires ?? 0,
    }),
  },
  {
    slug: "emp-performance",
    port: 6016,
    path: "/api/v1/analytics/overview",
    transform: (data) => ({
      activeCycles: data.active_cycles ?? data.activeCycles ?? 0,
      pendingReviews: data.pending_reviews ?? data.pendingReviews ?? 0,
      goalCompletion: data.goal_completion ?? data.goalCompletion ?? 0,
    }),
  },
  {
    slug: "emp-rewards",
    port: 6014,
    path: "/api/v1/analytics/overview",
    transform: (data) => ({
      totalKudos: data.total_kudos ?? data.totalKudos ?? 0,
      pointsDistributed: data.points_distributed ?? data.pointsDistributed ?? 0,
      badgesAwarded: data.badges_awarded ?? data.badgesAwarded ?? 0,
    }),
  },
  {
    slug: "emp-exit",
    port: 6010,
    path: "/api/v1/analytics/attrition",
    transform: (data) => ({
      attritionRate: data.attrition_rate ?? data.attritionRate ?? 0,
      activeExits: data.active_exits ?? data.activeExits ?? 0,
    }),
  },
  {
    slug: "emp-lms",
    port: 6008,
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

  // Get all active/trial subscriptions for this org, joined with module info.
  // Both api_url and base_url are selected:
  //   - api_url      is the private/internal URL used for server-to-server
  //                  calls (typically http://localhost:PORT on the same host).
  //   - base_url     is the public URL used by the user's browser for SSO
  //                  redirects (e.g. https://rewards.empcloud.com).
  // For the widget fetch we're a backend calling another backend, so we
  // prefer api_url. base_url is a safe fallback.
  const subscriptions = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.organization_id": orgId })
    .whereIn("s.status", ["active", "trial"])
    .select("m.slug", "m.api_url", "m.base_url");

  const subscribedSlugs = new Set(subscriptions.map((s: any) => s.slug));

  // slug → preferred URL for internal fetches
  const urlMap = new Map<string, string>();
  for (const sub of subscriptions) {
    const url = sub.api_url || sub.base_url;
    if (url) urlMap.set(sub.slug, String(url).replace(/\/+$/, ""));
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

      // Prefer DB api_url (internal), fall back to localhost:port from the
      // hardcoded MODULE_ENDPOINTS table. Both are internal URLs — the
      // public base_url must never be used here because the fetch would
      // hit the frontend nginx/TLS stack instead of the module backend.
      const base = urlMap.get(ep.slug) || `http://localhost:${ep.port}`;
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
    }),
  );

  return results;
}