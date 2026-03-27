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

  // MRR = SUM(price_per_seat * used_seats) for active subscriptions
  const [mrrResult] = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .select(db.raw("COALESCE(SUM(price_per_seat * used_seats), 0) as mrr"));

  const mrr = Number(mrrResult.mrr);

  // New orgs this month
  const [newOrgsThisMonth] = await db("organizations")
    .where("created_at", ">=", db.raw("DATE_FORMAT(NOW(), '%Y-%m-01')"))
    .count("id as count");

  // New users this month
  const [newUsersThisMonth] = await db("users")
    .where("created_at", ">=", db.raw("DATE_FORMAT(NOW(), '%Y-%m-01')"))
    .count("id as count");

  return {
    total_organizations: Number(orgCount.count),
    total_users: Number(userCount.count),
    active_subscriptions: Number(activeSubCount.count),
    mrr,
    arr: mrr * 12,
    new_orgs_this_month: Number(newOrgsThisMonth.count),
    new_users_this_month: Number(newUsersThisMonth.count),
  };
}

// ---------------------------------------------------------------------------
// Organization List (paginated, searchable, sortable)
// ---------------------------------------------------------------------------

export async function getOrgList(params: {
  page?: number;
  per_page?: number;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}) {
  const db = getDB();
  const page = params.page || 1;
  const perPage = params.per_page || 20;
  const offset = (page - 1) * perPage;

  let baseQuery = db("organizations as o");

  if (params.search) {
    baseQuery = baseQuery.where(function () {
      this.where("o.name", "like", `%${params.search}%`)
        .orWhere("o.email", "like", `%${params.search}%`);
    });
  }

  const [totalResult] = await baseQuery.clone().count("o.id as count");
  const total = Number(totalResult.count);

  // Determine sort column
  const allowedSorts: Record<string, string> = {
    name: "o.name",
    created_at: "o.created_at",
    user_count: "user_count",
    subscription_count: "subscription_count",
    monthly_spend: "monthly_spend",
  };
  const sortCol = allowedSorts[params.sort_by || "created_at"] || "o.created_at";
  const sortOrder = params.sort_order === "asc" ? "asc" : "desc";

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
    .leftJoin(
      db("org_subscriptions")
        .select("organization_id")
        .whereIn("status", ["active", "trial"])
        .sum(db.raw("price_per_seat * used_seats as spend"))
        .groupBy("organization_id")
        .as("sp"),
      "o.id",
      "sp.organization_id"
    )
    .select(
      "o.id",
      "o.name",
      "o.slug",
      "o.email",
      "o.status",
      "o.created_at",
      db.raw("COALESCE(uc.user_count, 0) as user_count"),
      db.raw("COALESCE(sc.sub_count, 0) as subscription_count"),
      db.raw("COALESCE(sp.spend, 0) as monthly_spend")
    )
    .orderBy(sortCol, sortOrder)
    .limit(perPage)
    .offset(offset);

  return {
    data: orgs.map((o: any) => ({
      ...o,
      user_count: Number(o.user_count),
      subscription_count: Number(o.subscription_count),
      monthly_spend: Number(o.monthly_spend),
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
    .select("id", "first_name", "last_name", "email", "role", "is_active", "status", "created_at")
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
      "s.currency",
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
    .select(db.raw("COALESCE(SUM(price_per_seat * used_seats), 0) as monthly_revenue"));

  // Total all-time revenue estimate (all subs including cancelled)
  const [totalSpendResult] = await db("org_subscriptions")
    .where({ organization_id: orgId })
    .select(db.raw("COALESCE(SUM(price_per_seat * used_seats), 0) as total_spend"));

  // Audit log for this org (last 50)
  let auditLogs: any[] = [];
  try {
    auditLogs = await db("audit_logs")
      .where({ organization_id: orgId })
      .orderBy("created_at", "desc")
      .limit(50)
      .select("id", "action", "resource_type", "resource_id", "user_id", "ip_address", "created_at");
  } catch {
    // audit_logs table may not exist
  }

  return {
    organization: org,
    users,
    subscriptions,
    monthly_revenue: Number(revenueResult.monthly_revenue),
    total_spend: Number(totalSpendResult.total_spend),
    audit_logs: auditLogs,
  };
}

// ---------------------------------------------------------------------------
// Module Analytics
// ---------------------------------------------------------------------------

export async function getModuleAnalytics() {
  const db = getDB();

  const modules = await db("modules as m")
    .leftJoin(
      db("org_subscriptions")
        .whereIn("status", ["active", "trial"])
        .select("module_id")
        .count("id as subscriber_count")
        .sum("total_seats as total_seats")
        .sum("used_seats as used_seats")
        .sum(db.raw("price_per_seat * used_seats as revenue"))
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
      "m.description",
      db.raw("COALESCE(s.subscriber_count, 0) as subscriber_count"),
      db.raw("COALESCE(s.total_seats, 0) as total_seats"),
      db.raw("COALESCE(s.used_seats, 0) as used_seats"),
      db.raw("COALESCE(s.revenue, 0) as revenue")
    )
    .orderBy("revenue", "desc");

  // Plan tier distribution per module
  const tierDistribution = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .whereIn("s.status", ["active", "trial"])
    .groupBy("m.slug", "s.plan_tier")
    .select("m.slug", "s.plan_tier")
    .count("s.id as count");

  // Build a map of slug -> tier distribution
  const tierMap: Record<string, Record<string, number>> = {};
  for (const row of tierDistribution as any[]) {
    if (!tierMap[row.slug]) tierMap[row.slug] = {};
    tierMap[row.slug][row.plan_tier] = Number(row.count);
  }

  return modules.map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    subscriber_count: Number(row.subscriber_count),
    total_seats: Number(row.total_seats),
    used_seats: Number(row.used_seats),
    revenue: Number(row.revenue),
    seat_utilization: Number(row.total_seats) > 0
      ? Math.round((Number(row.used_seats) / Number(row.total_seats)) * 100)
      : 0,
    tier_distribution: tierMap[row.slug] || {},
  }));
}

// ---------------------------------------------------------------------------
// Revenue Analytics
// ---------------------------------------------------------------------------

export async function getRevenueAnalytics(period: string = "12m") {
  const db = getDB();

  // MRR
  const [mrrResult] = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .select(db.raw("COALESCE(SUM(price_per_seat * used_seats), 0) as mrr"));
  const mrr = Number(mrrResult.mrr);

  // Previous month MRR for growth calculation
  const [prevMrrResult] = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .where("created_at", "<", db.raw("DATE_FORMAT(NOW(), '%Y-%m-01')"))
    .select(db.raw("COALESCE(SUM(price_per_seat * used_seats), 0) as mrr"));
  const prevMrr = Number(prevMrrResult.mrr);
  const mrrGrowth = prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 100) : 0;

  // Revenue by module (pie chart)
  const revenueByModule = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .whereIn("s.status", ["active", "trial"])
    .groupBy("m.id", "m.name", "m.slug")
    .select(
      "m.name",
      "m.slug",
      db.raw("COALESCE(SUM(s.price_per_seat * s.used_seats), 0) as revenue")
    )
    .orderBy("revenue", "desc");

  // Revenue trend by month (last 12 months based on subscription creation)
  const months = period === "6m" ? 6 : 12;
  const revenueTrend = await db("org_subscriptions as s")
    .whereIn("s.status", ["active", "trial", "cancelled"])
    .where("s.created_at", ">=", db.raw(`DATE_SUB(NOW(), INTERVAL ${months} MONTH)`))
    .select(
      db.raw("DATE_FORMAT(s.created_at, '%Y-%m') as month"),
      db.raw("COALESCE(SUM(s.price_per_seat * s.used_seats), 0) as revenue")
    )
    .groupByRaw("DATE_FORMAT(s.created_at, '%Y-%m')")
    .orderBy("month", "asc");

  // Revenue by plan tier
  const revenueByTier = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .groupBy("plan_tier")
    .select(
      "plan_tier",
      db.raw("COALESCE(SUM(price_per_seat * used_seats), 0) as revenue"),
      db.raw("COUNT(id) as count")
    )
    .orderBy("revenue", "desc");

  // Billing cycle distribution
  const billingCycleDistribution = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .groupBy("billing_cycle")
    .select(
      "billing_cycle",
      db.raw("COUNT(id) as count"),
      db.raw("COALESCE(SUM(price_per_seat * used_seats), 0) as revenue")
    );

  // Top 10 customers by spend
  const topCustomers = await db("org_subscriptions as s")
    .join("organizations as o", "s.organization_id", "o.id")
    .whereIn("s.status", ["active", "trial"])
    .groupBy("o.id", "o.name", "o.email")
    .select(
      "o.id",
      "o.name",
      "o.email",
      db.raw("COALESCE(SUM(s.price_per_seat * s.used_seats), 0) as total_spend"),
      db.raw("COUNT(s.id) as subscription_count")
    )
    .orderBy("total_spend", "desc")
    .limit(10);

  return {
    mrr,
    arr: mrr * 12,
    mrr_growth_percent: mrrGrowth,
    revenue_by_module: revenueByModule.map((r: any) => ({
      name: r.name,
      slug: r.slug,
      revenue: Number(r.revenue),
    })),
    revenue_trend: revenueTrend.map((r: any) => ({
      month: r.month,
      revenue: Number(r.revenue),
    })),
    revenue_by_tier: revenueByTier.map((r: any) => ({
      plan_tier: r.plan_tier,
      revenue: Number(r.revenue),
      count: Number(r.count),
    })),
    billing_cycle_distribution: billingCycleDistribution.map((r: any) => ({
      billing_cycle: r.billing_cycle,
      count: Number(r.count),
      revenue: Number(r.revenue),
    })),
    top_customers: topCustomers.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      total_spend: Number(r.total_spend),
      subscription_count: Number(r.subscription_count),
    })),
  };
}

// ---------------------------------------------------------------------------
// User & Org Growth
// ---------------------------------------------------------------------------

export async function getUserGrowth(period: string = "12m") {
  const db = getDB();
  const months = period === "6m" ? 6 : 12;

  // New orgs by month
  const orgGrowth = await db("organizations")
    .where("created_at", ">=", db.raw(`DATE_SUB(NOW(), INTERVAL ${months} MONTH)`))
    .select(
      db.raw("DATE_FORMAT(created_at, '%Y-%m') as month"),
      db.raw("COUNT(id) as count")
    )
    .groupByRaw("DATE_FORMAT(created_at, '%Y-%m')")
    .orderBy("month", "asc");

  // New users by month
  const userGrowth = await db("users")
    .where("created_at", ">=", db.raw(`DATE_SUB(NOW(), INTERVAL ${months} MONTH)`))
    .select(
      db.raw("DATE_FORMAT(created_at, '%Y-%m') as month"),
      db.raw("COUNT(id) as count")
    )
    .groupByRaw("DATE_FORMAT(created_at, '%Y-%m')")
    .orderBy("month", "asc");

  // Churn: cancelled subscriptions by month
  const churn = await db("org_subscriptions")
    .where("status", "cancelled")
    .where("updated_at", ">=", db.raw(`DATE_SUB(NOW(), INTERVAL ${months} MONTH)`))
    .select(
      db.raw("DATE_FORMAT(updated_at, '%Y-%m') as month"),
      db.raw("COUNT(id) as count")
    )
    .groupByRaw("DATE_FORMAT(updated_at, '%Y-%m')")
    .orderBy("month", "asc");

  // Active vs inactive users
  const [activeUsers] = await db("users").where({ is_active: true }).count("id as count");
  const [inactiveUsers] = await db("users").where({ is_active: false }).count("id as count");

  return {
    org_growth: orgGrowth.map((r: any) => ({ month: r.month, count: Number(r.count) })),
    user_growth: userGrowth.map((r: any) => ({ month: r.month, count: Number(r.count) })),
    churn: churn.map((r: any) => ({ month: r.month, count: Number(r.count) })),
    active_users: Number(activeUsers.count),
    inactive_users: Number(inactiveUsers.count),
  };
}

// ---------------------------------------------------------------------------
// Subscription Metrics
// ---------------------------------------------------------------------------

export async function getSubscriptionMetrics() {
  const db = getDB();

  // Plan tier distribution
  const tierDistribution = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .groupBy("plan_tier")
    .select(
      "plan_tier",
      db.raw("COUNT(id) as count"),
      db.raw("COALESCE(SUM(total_seats), 0) as total_seats"),
      db.raw("COALESCE(SUM(used_seats), 0) as used_seats")
    )
    .orderBy("count", "desc");

  // Billing cycle distribution
  const cycleDistribution = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .groupBy("billing_cycle")
    .select(
      "billing_cycle",
      db.raw("COUNT(id) as count")
    );

  // Status distribution
  const statusDistribution = await db("org_subscriptions")
    .groupBy("status")
    .select(
      "status",
      db.raw("COUNT(id) as count")
    );

  // Overall seat utilization
  const [seatTotals] = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .select(
      db.raw("COALESCE(SUM(total_seats), 0) as total_seats"),
      db.raw("COALESCE(SUM(used_seats), 0) as used_seats")
    );

  const totalSeats = Number(seatTotals.total_seats);
  const usedSeats = Number(seatTotals.used_seats);

  return {
    tier_distribution: tierDistribution.map((r: any) => ({
      plan_tier: r.plan_tier,
      count: Number(r.count),
      total_seats: Number(r.total_seats),
      used_seats: Number(r.used_seats),
      utilization: Number(r.total_seats) > 0
        ? Math.round((Number(r.used_seats) / Number(r.total_seats)) * 100)
        : 0,
    })),
    cycle_distribution: cycleDistribution.map((r: any) => ({
      billing_cycle: r.billing_cycle,
      count: Number(r.count),
    })),
    status_distribution: statusDistribution.map((r: any) => ({
      status: r.status,
      count: Number(r.count),
    })),
    total_seats: totalSeats,
    used_seats: usedSeats,
    overall_utilization: totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Recent Activity (audit log across all orgs)
// ---------------------------------------------------------------------------

export async function getRecentActivity(limit: number = 30) {
  const db = getDB();

  try {
    const logs = await db("audit_logs as a")
      .leftJoin("users as u", "a.user_id", "u.id")
      .leftJoin("organizations as o", "a.organization_id", "o.id")
      .orderBy("a.created_at", "desc")
      .limit(limit)
      .select(
        "a.id",
        "a.action",
        "a.resource_type",
        "a.resource_id",
        "a.ip_address",
        "a.created_at",
        "u.first_name",
        "u.last_name",
        "u.email as user_email",
        "o.name as org_name"
      );

    return logs.map((l: any) => ({
      id: l.id,
      action: l.action,
      resource_type: l.resource_type,
      resource_id: l.resource_id,
      ip_address: l.ip_address,
      created_at: l.created_at,
      user_name: l.first_name ? `${l.first_name} ${l.last_name}` : null,
      user_email: l.user_email,
      org_name: l.org_name,
    }));
  } catch {
    // audit_logs table may not exist
    return [];
  }
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

  const healthyCount = results.filter((r) => r.status === "healthy").length;
  const totalCount = results.length;

  return {
    modules: results,
    healthy_count: healthyCount,
    total_count: totalCount,
    overall_status: healthyCount === totalCount ? "all_healthy" : healthyCount > 0 ? "degraded" : "down",
  };
}

// ---------------------------------------------------------------------------
// Module Adoption (kept for backward compat)
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
        .sum(db.raw("price_per_seat * used_seats as revenue"))
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
