// =============================================================================
// EMP CLOUD — Super Admin Service
// Platform-level analytics and management (no org_id filter — super_admin sees all)
// =============================================================================

import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Platform Overview
// ---------------------------------------------------------------------------

export async function getPlatformOverview() {
  const db = getDB();

  const [orgCount] = await db("organizations").count("id as count");
  const [userCount] = await db("users").count("id as count");
  const [activeSubCount] = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .count("id as count");

  // MRR = SUM(price_per_seat * total_seats) for active subscriptions
  const [mrrResult] = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .select(db.raw("COALESCE(SUM(price_per_seat * total_seats), 0) as mrr"));

  // Module adoption — count subscriptions per module
  const moduleAdoption = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .whereIn("s.status", ["active", "trial"])
    .groupBy("m.id", "m.name", "m.slug")
    .select("m.name", "m.slug")
    .count("s.id as subscription_count");

  return {
    total_organizations: Number(orgCount.count),
    total_users: Number(userCount.count),
    active_subscriptions: Number(activeSubCount.count),
    mrr: Number(mrrResult.mrr),
    arr: Number(mrrResult.mrr) * 12,
    module_adoption: moduleAdoption.map((row: any) => ({
      name: row.name,
      slug: row.slug,
      subscription_count: Number(row.subscription_count),
    })),
  };
}

// ---------------------------------------------------------------------------
// Organization List (paginated)
// ---------------------------------------------------------------------------

export async function getOrgList(params: {
  page?: number;
  per_page?: number;
  search?: string;
}) {
  const db = getDB();
  const page = params.page || 1;
  const perPage = params.per_page || 20;
  const offset = (page - 1) * perPage;

  let baseQuery = db("organizations as o");

  if (params.search) {
    baseQuery = baseQuery.where("o.name", "like", `%${params.search}%`);
  }

  const [totalResult] = await baseQuery.clone().count("o.id as count");
  const total = Number(totalResult.count);

  const orgs = await baseQuery
    .clone()
    .leftJoin(
      db("users")
        .select("organization_id")
        .count("id as user_count")
        .groupBy("organization_id")
        .as("uc"),
      "o.id",
      "uc.organization_id"
    )
    .leftJoin(
      db("org_subscriptions")
        .select("organization_id")
        .whereIn("status", ["active", "trial"])
        .count("id as sub_count")
        .groupBy("organization_id")
        .as("sc"),
      "o.id",
      "sc.organization_id"
    )
    .select(
      "o.id",
      "o.name",
      "o.slug",
      "o.email",
      "o.status",
      "o.created_at",
      db.raw("COALESCE(uc.user_count, 0) as user_count"),
      db.raw("COALESCE(sc.sub_count, 0) as subscription_count")
    )
    .orderBy("o.created_at", "desc")
    .limit(perPage)
    .offset(offset);

  return {
    data: orgs.map((o: any) => ({
      ...o,
      user_count: Number(o.user_count),
      subscription_count: Number(o.subscription_count),
    })),
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage),
  };
}

// ---------------------------------------------------------------------------
// Organization Detail
// ---------------------------------------------------------------------------

export async function getOrgDetail(orgId: number) {
  const db = getDB();

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) throw new Error("Organization not found");

  const users = await db("users")
    .where({ organization_id: orgId })
    .select("id", "first_name", "last_name", "email", "role", "is_active", "created_at")
    .orderBy("created_at", "desc");

  const subscriptions = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .where({ "s.organization_id": orgId })
    .select(
      "s.id",
      "s.status",
      "s.plan_tier",
      "s.total_seats",
      "s.used_seats",
      "s.price_per_seat",
      "s.billing_cycle",
      "s.current_period_start",
      "s.current_period_end",
      "s.created_at",
      "m.name as module_name",
      "m.slug as module_slug"
    )
    .orderBy("s.created_at", "desc");

  // Revenue from this org
  const [revenueResult] = await db("org_subscriptions")
    .where({ organization_id: orgId })
    .whereIn("status", ["active", "trial"])
    .select(db.raw("COALESCE(SUM(price_per_seat * total_seats), 0) as monthly_revenue"));

  return {
    organization: org,
    users,
    subscriptions,
    monthly_revenue: Number(revenueResult.monthly_revenue),
  };
}

// ---------------------------------------------------------------------------
// Revenue Metrics
// ---------------------------------------------------------------------------

export async function getRevenueMetrics() {
  const db = getDB();

  // MRR
  const [mrrResult] = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .select(db.raw("COALESCE(SUM(price_per_seat * total_seats), 0) as mrr"));

  const mrr = Number(mrrResult.mrr);

  // Revenue by module (pie chart data)
  const revenueByModule = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .whereIn("s.status", ["active", "trial"])
    .groupBy("m.id", "m.name", "m.slug")
    .select(
      "m.name",
      "m.slug",
      db.raw("COALESCE(SUM(s.price_per_seat * s.total_seats), 0) as revenue")
    );

  // Revenue trend by month (last 12 months based on subscription creation)
  const revenueTrend = await db("org_subscriptions as s")
    .whereIn("s.status", ["active", "trial", "cancelled"])
    .where("s.created_at", ">=", db.raw("DATE_SUB(NOW(), INTERVAL 12 MONTH)"))
    .select(
      db.raw("DATE_FORMAT(s.created_at, '%Y-%m') as month"),
      db.raw("COALESCE(SUM(s.price_per_seat * s.total_seats), 0) as revenue")
    )
    .groupByRaw("DATE_FORMAT(s.created_at, '%Y-%m')")
    .orderBy("month", "asc");

  return {
    mrr,
    arr: mrr * 12,
    revenue_by_module: revenueByModule.map((r: any) => ({
      name: r.name,
      slug: r.slug,
      revenue: Number(r.revenue),
    })),
    revenue_trend: revenueTrend.map((r: any) => ({
      month: r.month,
      revenue: Number(r.revenue),
    })),
  };
}

// ---------------------------------------------------------------------------
// System Health — check module servers
// ---------------------------------------------------------------------------

const MODULE_HEALTH_ENDPOINTS = [
  { name: "EMP Cloud", slug: "empcloud", url: "http://localhost:3000/health" },
  { name: "EMP Recruit", slug: "emp-recruit", url: "http://localhost:4500/health" },
  { name: "EMP Performance", slug: "emp-performance", url: "http://localhost:4300/health" },
  { name: "EMP Rewards", slug: "emp-rewards", url: "http://localhost:4600/health" },
  { name: "EMP Exit", slug: "emp-exit", url: "http://localhost:4400/health" },
  { name: "EMP Payroll", slug: "emp-payroll", url: "http://localhost:4100/health" },
  { name: "EMP Billing", slug: "emp-billing", url: "http://localhost:4200/health" },
];

async function checkHealth(url: string): Promise<{ status: "healthy" | "down"; latency_ms: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const latency = Date.now() - start;
    if (response.ok) {
      return { status: "healthy", latency_ms: latency };
    }
    return { status: "down", latency_ms: latency };
  } catch {
    return { status: "down", latency_ms: Date.now() - start };
  }
}

export async function getSystemHealth() {
  const results = await Promise.all(
    MODULE_HEALTH_ENDPOINTS.map(async (ep) => {
      const health = await checkHealth(ep.url);
      return {
        name: ep.name,
        slug: ep.slug,
        url: ep.url,
        ...health,
      };
    })
  );

  return { modules: results };
}

// ---------------------------------------------------------------------------
// Module Adoption
// ---------------------------------------------------------------------------

export async function getModuleAdoption() {
  const db = getDB();

  const adoption = await db("modules as m")
    .leftJoin(
      db("org_subscriptions")
        .whereIn("status", ["active", "trial"])
        .select("module_id")
        .count("id as org_count")
        .sum("total_seats as total_seats")
        .sum(db.raw("price_per_seat * total_seats as revenue"))
        .groupBy("module_id")
        .as("s"),
      "m.id",
      "s.module_id"
    )
    .where({ "m.is_active": true })
    .select(
      "m.id",
      "m.name",
      "m.slug",
      db.raw("COALESCE(s.org_count, 0) as org_count"),
      db.raw("COALESCE(s.total_seats, 0) as total_seats"),
      db.raw("COALESCE(s.revenue, 0) as revenue")
    )
    .orderBy("m.name", "asc");

  return adoption.map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    org_count: Number(row.org_count),
    total_seats: Number(row.total_seats),
    revenue: Number(row.revenue),
  }));
}
