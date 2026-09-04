// =============================================================================
// EMP CLOUD — Super Admin Service
// Platform-level analytics and management (no org_id filter — super_admin sees all)
// =============================================================================

import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";
import type { AdminOrganizationCommentSummary } from "@empcloud/shared";
import type { Knex } from "knex";
// Single source of truth for module health (DB-driven, per-environment URLs).
// health-check.service does not import this file, so there is no cycle.
import { getServiceHealth } from "./health-check.service.js";
import { getOrganizationPaymentSummaries } from "./admin-billing.service.js";
import {
  ACCESS_SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_ATTENTION_STATUSES,
  SUBSCRIPTION_PORTFOLIO_STATUSES,
  emptyOrganizationSubscriptionSummary,
  summarizeSubscriptionsByOrganization,
  type OrganizationPaymentSummary,
} from "./organization-analytics.js";

// ---------------------------------------------------------------------------
// Platform Overview
// ---------------------------------------------------------------------------

export async function getPlatformOverview() {
  const db = getDB();

  // Exclude org_id=0 (platform sentinel) and the super_admin users on
  // it from every aggregate -- they're internal, not real tenants /
  // employees, and would inflate every overview KPI by 1.
  const [orgCount] = await db("organizations").where("id", ">", 0).count("id as count");
  const [userCount] = await db("users").where("organization_id", ">", 0).count("id as count");
  const [activeSubCount] = await db("org_subscriptions")
    .where("organization_id", ">", 0)
    .whereIn("status", ["active", "trial"])
    .count("id as count");

  // MRR = SUM(price_per_seat * total_seats / months_in_cycle).
  // price_per_seat is now the EFFECTIVE per-cycle price (not the monthly
  // base it used to be). Normalise to monthly by dividing by the cycle's
  // months_in_cycle so an annual ₹4,800/seat doesn't masquerade as
  // ₹4,800/month. LEFT JOIN with COALESCE(...,1) keeps the math defined
  // for any subscription on an unknown cycle string.
  const [mrrResult] = await db("org_subscriptions as s")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .whereIn("s.status", ["active", "trial"])
    .where("s.organization_id", ">", 0)
    .select(
      db.raw(
        "COALESCE(SUM((s.price_per_seat * s.total_seats) / COALESCE(b.months_in_cycle, 1)), 0) as mrr",
      ),
    );

  const mrr = Number(mrrResult.mrr);

  // New orgs this month — same sentinel guard as above.
  const [newOrgsThisMonth] = await db("organizations")
    .where("id", ">", 0)
    .where("created_at", ">=", db.raw("DATE_FORMAT(NOW(), '%Y-%m-01')"))
    .count("id as count");

  // New users this month
  const [newUsersThisMonth] = await db("users")
    .where("organization_id", ">", 0)
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
// Organization Stats (headline counters for the super-admin org list)
// ---------------------------------------------------------------------------

/**
 * Headline counters for /admin/organizations. All windows are computed in the
 * DB's timezone off `organizations.created_at`, and every count applies the
 * same `id > 0` sentinel guard as the rest of this service so the reserved
 * platform org never inflates a number.
 *
 * Week starts Monday (MySQL WEEKDAY() is 0 for Monday).
 */
export async function getOrgStats() {
  const db = getDB();
  const orgs = () => db("organizations").where("id", ">", 0);

  const [total] = await orgs().count("id as count");
  const [active] = await orgs().where("is_active", true).count("id as count");
  const [inactive] = await orgs().where("is_active", false).count("id as count");
  const [today] = await orgs().where("created_at", ">=", db.raw("CURDATE()")).count("id as count");
  const [thisWeek] = await orgs()
    .where("created_at", ">=", db.raw("DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)"))
    .count("id as count");
  const [thisMonth] = await orgs()
    .where("created_at", ">=", db.raw("DATE_FORMAT(NOW(), '%Y-%m-01')"))
    .count("id as count");
  const [thisYear] = await orgs()
    .where("created_at", ">=", db.raw("DATE_FORMAT(NOW(), '%Y-01-01')"))
    .count("id as count");

  const [userCount] = await db("users").where("organization_id", ">", 0).count("id as count");

  // Same MRR normalisation as getPlatformOverview: price_per_seat is the
  // effective per-cycle amount, so divide by months_in_cycle for true MRR.
  const [mrrResult] = await db("org_subscriptions as s")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .whereIn("s.status", ["active", "trial"])
    .where("s.organization_id", ">", 0)
    .select(
      db.raw(
        "COALESCE(SUM((s.price_per_seat * s.total_seats) / COALESCE(b.months_in_cycle, 1)), 0) as mrr",
      ),
    );

  const [withSub] = await db("org_subscriptions")
    .where("organization_id", ">", 0)
    .whereIn("status", ACCESS_SUBSCRIPTION_STATUSES)
    .countDistinct("organization_id as count");

  const [seatTotals] = await db("org_subscriptions")
    .where("organization_id", ">", 0)
    .whereIn("status", ACCESS_SUBSCRIPTION_STATUSES)
    .select(
      db.raw("COALESCE(SUM(total_seats), 0) as total_seats"),
      db.raw("COALESCE(SUM(used_seats), 0) as used_seats"),
    );

  const mrrByCurrency = await db("org_subscriptions as s")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .where("s.organization_id", ">", 0)
    .whereIn("s.status", ACCESS_SUBSCRIPTION_STATUSES)
    .groupBy("s.currency")
    .select(
      "s.currency",
      db.raw(
        "COALESCE(SUM((CASE WHEN s.is_free = 1 THEN 0 ELSE s.price_per_seat * s.total_seats END) / COALESCE(b.months_in_cycle, 1)), 0) as amount",
      ),
    )
    .orderBy("s.currency", "asc");

  const planDistribution = await db("org_subscriptions")
    .where("organization_id", ">", 0)
    .whereIn("status", ACCESS_SUBSCRIPTION_STATUSES)
    .groupBy("plan_tier")
    .select("plan_tier")
    .countDistinct("organization_id as organization_count")
    .orderBy("organization_count", "desc");

  const subscriptionStatusDistribution = await db("org_subscriptions")
    .where("organization_id", ">", 0)
    .whereIn("status", SUBSCRIPTION_PORTFOLIO_STATUSES)
    .groupBy("status")
    .select("status")
    .countDistinct("organization_id as organization_count")
    .orderBy("organization_count", "desc");

  const [trialOrganizations] = await db("org_subscriptions")
    .where("organization_id", ">", 0)
    .where("status", "trial")
    .countDistinct("organization_id as count");
  const [subscriptionAttentionOrganizations] = await db("org_subscriptions")
    .where("organization_id", ">", 0)
    .whereIn("status", SUBSCRIPTION_ATTENTION_STATUSES)
    .countDistinct("organization_id as count");
  const [expiringNext30Days] = await db("org_subscriptions")
    .where("organization_id", ">", 0)
    .where("status", "active")
    .where("auto_renew", true)
    .where("current_period_end", ">=", db.raw("NOW()"))
    .where("current_period_end", "<", db.raw("DATE_ADD(NOW(), INTERVAL 30 DAY)"))
    .countDistinct("organization_id as count");
  const [freeOrganizations] = await db("org_subscriptions")
    .where("organization_id", ">", 0)
    .whereIn("status", ACCESS_SUBSCRIPTION_STATUSES)
    .where(function () {
      this.where("is_free", true).orWhere("plan_tier", "free");
    })
    .countDistinct("organization_id as count");

  const organizationIds = (await orgs().select("id")).map((row: any) => Number(row.id));
  const paymentSummaries = await getOrganizationPaymentSummaries(organizationIds);
  const paymentStatusCounts = new Map<string, number>();
  for (const summary of paymentSummaries.values()) {
    paymentStatusCounts.set(
      summary.status,
      (paymentStatusCounts.get(summary.status) ?? 0) + 1,
    );
  }
  const unavailablePaymentCount = paymentStatusCounts.get("unavailable") ?? 0;
  const paymentAttentionOrganizations =
    (paymentStatusCounts.get("unpaid") ?? 0) +
    (paymentStatusCounts.get("overdue") ?? 0);

  const totalOrgs = Number(total.count);
  const subscribed = Number(withSub.count);
  const totalSeats = Number(seatTotals.total_seats);
  const usedSeats = Number(seatTotals.used_seats);

  return {
    total: totalOrgs,
    active: Number(active.count),
    inactive: Number(inactive.count),
    today: Number(today.count),
    this_week: Number(thisWeek.count),
    this_month: Number(thisMonth.count),
    this_year: Number(thisYear.count),
    total_users: Number(userCount.count),
    mrr: Number(mrrResult.mrr),
    with_subscription: subscribed,
    without_subscription: Math.max(0, totalOrgs - subscribed),
    total_licenses: totalSeats,
    used_licenses: usedSeats,
    available_licenses: Math.max(0, totalSeats - usedSeats),
    license_utilization: totalSeats ? Math.round((usedSeats / totalSeats) * 100) : 0,
    trial_organizations: Number(trialOrganizations.count),
    payment_attention_organizations: paymentAttentionOrganizations,
    subscription_attention_organizations: Number(subscriptionAttentionOrganizations.count),
    payment_analytics_available: unavailablePaymentCount === 0,
    expiring_next_30_days: Number(expiringNext30Days.count),
    free_organizations: Number(freeOrganizations.count),
    mrr_by_currency: mrrByCurrency.map((row: any) => ({
      currency: row.currency,
      amount: Math.round(Number(row.amount)),
    })),
    plan_distribution: planDistribution.map((row: any) => ({
      plan_tier: row.plan_tier,
      organization_count: Number(row.organization_count),
    })),
    subscription_status_distribution: subscriptionStatusDistribution.map((row: any) => ({
      status: row.status,
      organization_count: Number(row.organization_count),
    })),
    payment_status_distribution: Array.from(paymentStatusCounts)
      .map(([status, organization_count]) => ({ status, organization_count }))
      .sort((a, b) => b.organization_count - a.organization_count),
  };
}

// ---------------------------------------------------------------------------
// Organization List (paginated, searchable, sortable)
// ---------------------------------------------------------------------------

export async function getLatestOrganizationComments(
  db: Knex | Knex.Transaction,
  organizationIds: number[],
): Promise<Map<number, AdminOrganizationCommentSummary>> {
  if (!organizationIds.length) return new Map();

  // Match the detail-page definition of "latest": newest created_at first,
  // then highest id when timestamps are equal. The NOT EXISTS form works on
  // MySQL versions without window functions and keeps this as one set query.
  const rows = await db("organization_comments as oc")
    .whereIn("oc.organization_id", organizationIds)
    .whereNotExists(
      db
        .select(db.raw("1"))
        .from("organization_comments as newer")
        .whereRaw("newer.organization_id = oc.organization_id")
        .whereRaw(`
          (
            (newer.created_at IS NOT NULL AND oc.created_at IS NULL)
            OR newer.created_at > oc.created_at
            OR (newer.created_at <=> oc.created_at AND newer.id > oc.id)
          )
        `),
    )
    .select(
      "oc.id",
      "oc.organization_id",
      "oc.comment",
      "oc.edited_at",
      "oc.created_at",
      "oc.updated_at",
    );

  return new Map(
    rows.map((comment: any) => [
      Number(comment.organization_id),
      comment as AdminOrganizationCommentSummary,
    ]),
  );
}

export async function getOrgList(params: {
  page?: number;
  per_page?: number;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  /** "active" | "inactive" — maps onto organizations.is_active */
  status?: string;
  /** Registration window (YYYY-MM-DD). date_to is inclusive of the whole day. */
  date_from?: string;
  date_to?: string;
  /** ISO country code stored on organizations.country (e.g. "IN") */
  country?: string;
  /** "true" = has a current subscription, "false" = has none */
  has_subscription?: string;
  /** Filter organizations that have at least one subscription on this tier. */
  plan_tier?: string;
  /** Filter organizations that have at least one subscription in this lifecycle state. */
  subscription_status?: string;
  /** Authoritative invoice status returned by EMP Billing. */
  payment_status?: string;
}) {
  const db = getDB();
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(100, Math.max(1, params.per_page || 20));
  const offset = (page - 1) * perPage;

  // Hide the platform sentinel org (id=0) from every super-admin org
  // listing. It's the reserved row that super_admin users live on so
  // they don't leak into tenant lists, and it satisfies the
  // oauth_access_tokens.organization_id FK -- it is NOT a real customer
  // tenant, so it must not appear here, in the org count, or in
  // monthly-spend rollups. Anything else (id > 0) is a real org.
  let baseQuery = db("organizations as o").where("o.id", ">", 0);

  if (params.search) {
    baseQuery = baseQuery.where(function () {
      this.where("o.name", "like", `%${params.search}%`)
        .orWhere("o.email", "like", `%${params.search}%`);
    });
  }

  // --- Filters -------------------------------------------------------------
  // Activation status (organizations stores this as the boolean is_active).
  if (params.status === "active") baseQuery = baseQuery.where("o.is_active", true);
  else if (params.status === "inactive") baseQuery = baseQuery.where("o.is_active", false);

  // Registration window. date_to is inclusive of the whole day, so compare
  // against the following midnight rather than truncating created_at.
  if (params.date_from) baseQuery = baseQuery.where("o.created_at", ">=", params.date_from);
  if (params.date_to) {
    baseQuery = baseQuery.where(
      "o.created_at",
      "<",
      db.raw("DATE_ADD(?, INTERVAL 1 DAY)", [params.date_to]),
    );
  }

  if (params.country) baseQuery = baseQuery.where("o.country", params.country);

  // Has a current subscription (EXISTS keeps the row count intact —
  // a join here would multiply orgs by their subscription rows). Built as an
  // explicit correlated sub-query (not a callback) so it does not depend on
  // knex binding the builder to `this`.
  if (params.has_subscription === "true" || params.has_subscription === "false") {
    const subQuery = db
      .select(db.raw("1"))
      .from("org_subscriptions as s2")
      .whereRaw("s2.organization_id = o.id")
      .whereIn("s2.status", ACCESS_SUBSCRIPTION_STATUSES);
    baseQuery =
      params.has_subscription === "true"
        ? baseQuery.whereExists(subQuery)
        : baseQuery.whereNotExists(subQuery);
  }

  if (params.plan_tier) {
    baseQuery = baseQuery.whereExists(
      db
        .select(db.raw("1"))
        .from("org_subscriptions as plan_sub")
        .whereRaw("plan_sub.organization_id = o.id")
        .where("plan_sub.plan_tier", params.plan_tier)
        .whereIn("plan_sub.status", ACCESS_SUBSCRIPTION_STATUSES),
    );
  }

  if (params.subscription_status) {
    const statusQuery = db
      .select(db.raw("1"))
      .from("org_subscriptions as status_sub")
      .whereRaw("status_sub.organization_id = o.id");
    if (params.subscription_status === "attention") {
      statusQuery.whereIn("status_sub.status", SUBSCRIPTION_ATTENTION_STATUSES);
    } else {
      statusQuery.where("status_sub.status", params.subscription_status);
    }
    baseQuery = baseQuery.whereExists(statusQuery);
  }

  let filteredPaymentSummaries: Map<number, OrganizationPaymentSummary> | null = null;
  if (params.payment_status) {
    const candidateIds = (await baseQuery.clone().select("o.id")).map((row: any) => Number(row.id));
    filteredPaymentSummaries = await getOrganizationPaymentSummaries(candidateIds);
    const acceptedStatuses = params.payment_status === "attention"
      ? new Set(["unpaid", "overdue"])
      : new Set([params.payment_status]);
    const matchingIds = candidateIds.filter((orgId) => {
      const summary = filteredPaymentSummaries?.get(orgId);
      return summary ? acceptedStatuses.has(summary.status) : false;
    });
    baseQuery = matchingIds.length
      ? baseQuery.whereIn("o.id", matchingIds)
      : baseQuery.whereRaw("1 = 0");
  }

  const [totalResult] = await baseQuery.clone().count("o.id as count");
  const total = Number(totalResult.count);

  // Determine sort column
  const allowedSorts: Record<string, string> = {
    name: "o.name",
    created_at: "o.created_at",
    user_count: "user_count",
    subscription_count: "subscription_count",
    total_licenses: "total_licenses",
    used_licenses: "used_licenses",
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
        .whereIn("status", ACCESS_SUBSCRIPTION_STATUSES)
        .count("id as sub_count")
        .sum("total_seats as total_licenses")
        .sum("used_seats as used_licenses")
        .groupBy("organization_id")
        .as("sc"),
      "o.id",
      "sc.organization_id"
    )
    .select(
      "o.id",
      "o.name",
      "o.email",
      "o.contact_number",
      "o.country",
      "o.currency",
      "o.timezone",
      "o.is_active",
      "o.login_blocked",
      "o.payment_block_enabled",
      "o.created_at",
      db.raw("COALESCE(uc.user_count, 0) as user_count"),
      db.raw("COALESCE(sc.sub_count, 0) as subscription_count"),
      db.raw("COALESCE(sc.total_licenses, 0) as total_licenses"),
      db.raw("COALESCE(sc.used_licenses, 0) as used_licenses")
    )
    .orderBy(sortCol, sortOrder)
    .limit(perPage)
    .offset(offset);

  const organizationIds = orgs.map((org: any) => Number(org.id));
  const latestComments = await getLatestOrganizationComments(db, organizationIds);
  const subscriptionRows = organizationIds.length
    ? await db("org_subscriptions as s")
        .join("modules as m", "s.module_id", "m.id")
        .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
        .whereIn("s.organization_id", organizationIds)
        .select(
          "s.id",
          "s.organization_id",
          "s.module_id",
          "m.name as module_name",
          "m.slug as module_slug",
          "s.plan_tier",
          "s.status",
          "s.total_seats",
          "s.used_seats",
          "s.billing_cycle",
          "s.price_per_seat",
          "s.currency",
          db.raw("COALESCE(b.months_in_cycle, 1) as months_in_cycle"),
          "s.trial_ends_at",
          "s.current_period_start",
          "s.current_period_end",
          "s.auto_renew",
          "s.is_free",
        )
        .orderBy("m.name", "asc")
    : [];
  const subscriptionSummaries = summarizeSubscriptionsByOrganization(subscriptionRows as any[]);
  const paymentSummaries = filteredPaymentSummaries
    ?? await getOrganizationPaymentSummaries(organizationIds);

  return {
    data: orgs.map((o: any) => {
      const subscriptionSummary =
        subscriptionSummaries.get(Number(o.id)) ?? emptyOrganizationSubscriptionSummary();
      // Preserve the legacy scalar only when it is meaningful. A value from
      // multiple currencies must never be added together; modern clients use
      // monthly_spend_by_currency instead.
      const legacyMonthlySpend =
        subscriptionSummary.monthly_spend_by_currency.length === 1
          ? subscriptionSummary.monthly_spend_by_currency[0].amount
          : 0;
      const paymentSummary = paymentSummaries.get(Number(o.id)) ?? {
        status: "not_configured" as const,
        outstanding_by_currency: [],
        overdue_invoice_count: 0,
        unpaid_invoice_count: 0,
        latest_invoice: null,
      };
      return {
        ...o,
        login_blocked: Boolean(o.login_blocked),
        payment_block_enabled: Boolean(o.payment_block_enabled),
        payment_block_active:
          Boolean(o.payment_block_enabled)
          && (paymentSummary.status === "overdue" || paymentSummary.overdue_invoice_count > 0),
        // The organizations table stores activation as the boolean `is_active`,
        // but the org-list UI renders a status pill via i18n key
        // `orgList.status.<status>`. Derive a string status here so the pill
        // resolves ("active"/"inactive") instead of showing the raw key.
        status: o.is_active ? "active" : "inactive",
        user_count: Number(o.user_count),
        subscription_count: Number(o.subscription_count),
        monthly_spend: legacyMonthlySpend,
        ...subscriptionSummary,
        payment_summary: paymentSummary,
        latest_comment: latestComments.get(Number(o.id)) ?? null,
      };
    }),
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
    .select("id", "first_name", "last_name", "email", "role", "status", "created_at")
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

  // Monthly revenue from this org. Normalised by months_in_cycle so
  // annual/quarterly subs are reported at their true monthly cost.
  const [revenueResult] = await db("org_subscriptions as s")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .where({ "s.organization_id": orgId })
    .whereIn("s.status", ["active", "trial"])
    .select(
      db.raw(
        "COALESCE(SUM((s.price_per_seat * s.total_seats) / COALESCE(b.months_in_cycle, 1)), 0) as monthly_revenue",
      ),
    );

  // Total all-time revenue estimate (all subs including cancelled)
  const [totalSpendResult] = await db("org_subscriptions")
    .where({ organization_id: orgId })
    .select(db.raw("COALESCE(SUM(price_per_seat * total_seats), 0) as total_spend"));

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
      // Per-module revenue. price_per_seat is per-cycle; divide by
      // months_in_cycle for true MRR. LEFT JOIN with COALESCE keeps the
      // calc defined when a subscription is on an unknown cycle string.
      db("org_subscriptions as os")
        .leftJoin("billing_cycle_discounts as b", "os.billing_cycle", "b.cycle")
        .whereIn("os.status", ["active", "trial"])
        .select("os.module_id")
        .count("os.id as subscriber_count")
        .sum("os.total_seats as total_seats")
        .sum("os.used_seats as used_seats")
        .select(
          db.raw(
            "COALESCE(SUM((os.price_per_seat * os.total_seats) / COALESCE(b.months_in_cycle, 1)), 0) as revenue",
          ),
        )
        .groupBy("os.module_id")
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

  // MRR — every revenue total in this analytics block normalises
  // (price_per_seat × seats) by months_in_cycle so annual/quarterly
  // subscriptions don't masquerade as 12×/3× their actual monthly
  // recurring revenue. LEFT JOIN with COALESCE(b.months_in_cycle, 1)
  // is the same shape used in getPlatformOverview and the org list.
  const mrrExpr =
    "COALESCE(SUM((s.price_per_seat * s.total_seats) / COALESCE(b.months_in_cycle, 1)), 0)";

  const [mrrResult] = await db("org_subscriptions as s")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .whereIn("s.status", ["active", "trial"])
    .select(db.raw(`${mrrExpr} as mrr`));
  const mrr = Number(mrrResult.mrr);

  // Previous month MRR for growth calculation
  const [prevMrrResult] = await db("org_subscriptions as s")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .whereIn("s.status", ["active", "trial"])
    .where("s.created_at", "<", db.raw("DATE_FORMAT(NOW(), '%Y-%m-01')"))
    .select(db.raw(`${mrrExpr} as mrr`));
  const prevMrr = Number(prevMrrResult.mrr);
  const mrrGrowth = prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 100) : 0;

  // Revenue by module (pie chart) — MRR per module
  const revenueByModule = await db("org_subscriptions as s")
    .join("modules as m", "s.module_id", "m.id")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .whereIn("s.status", ["active", "trial"])
    .groupBy("m.id", "m.name", "m.slug")
    .select("m.name", "m.slug", db.raw(`${mrrExpr} as revenue`))
    .orderBy("revenue", "desc");

  // Revenue trend by month (last N months based on subscription creation)
  const months = period === "6m" ? 6 : 12;
  const revenueTrend = await db("org_subscriptions as s")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .whereIn("s.status", ["active", "trial", "cancelled"])
    .where("s.created_at", ">=", db.raw(`DATE_SUB(NOW(), INTERVAL ${months} MONTH)`))
    .select(
      db.raw("DATE_FORMAT(s.created_at, '%Y-%m') as month"),
      db.raw(`${mrrExpr} as revenue`),
    )
    .groupByRaw("DATE_FORMAT(s.created_at, '%Y-%m')")
    .orderBy("month", "asc");

  // Revenue by plan tier
  const revenueByTier = await db("org_subscriptions as s")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .whereIn("s.status", ["active", "trial"])
    .groupBy("s.plan_tier")
    .select(
      "s.plan_tier",
      db.raw(`${mrrExpr} as revenue`),
      db.raw("COUNT(s.id) as count"),
    )
    .orderBy("revenue", "desc");

  // Billing cycle distribution
  const billingCycleDistribution = await db("org_subscriptions")
    .whereIn("status", ["active", "trial"])
    .groupBy("billing_cycle")
    .select(
      "billing_cycle",
      db.raw("COUNT(id) as count"),
      db.raw("COALESCE(SUM(price_per_seat * total_seats), 0) as revenue")
    );

  // Top 10 customers by monthly spend (MRR per customer). Same
  // months_in_cycle normalisation so annual customers don't dominate
  // by 12x their real monthly rate.
  const topCustomers = await db("org_subscriptions as s")
    .join("organizations as o", "s.organization_id", "o.id")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .whereIn("s.status", ["active", "trial"])
    .groupBy("o.id", "o.name", "o.email")
    .select(
      "o.id",
      "o.name",
      "o.email",
      db.raw(`${mrrExpr} as total_spend`),
      db.raw("COUNT(s.id) as subscription_count"),
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
  const [activeUsers] = await db("users").where({ status: 1 }).count("id as count");
  const [inactiveUsers] = await db("users").whereNot({ status: 1 }).count("id as count");

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
// System Health — summary for the super-admin Overview dashboard widget
// ---------------------------------------------------------------------------

/**
 * Summary view of module health for the Overview dashboard widget
 * (GET /api/v1/admin/health).
 *
 * This used to run its own health check against a HARDCODED list of dev ports
 * (empcloud:3000, recruit:4500, payroll:4100, billing:4200, ...). Those ports
 * only exist on a developer laptop, so on test/prod every call was refused
 * instantly (~5ms -- far too fast to be a timeout) and the widget reported
 * EVERY module as "Down" while the services were perfectly healthy. The
 * detailed Service Health page never had this problem because it uses the
 * DB-driven checker, which reads each module's real per-environment address.
 *
 * There is now a single source of truth: we delegate to getServiceHealth() and
 * map its richer result onto this endpoint's original response shape, so the
 * existing widget keeps working unchanged. Do NOT reintroduce a hardcoded
 * endpoint list here.
 */
export async function getSystemHealth() {
  const detailed = await getServiceHealth();

  // The widget's badge is two-state (healthy | everything-else-is-red), so a
  // "degraded" module (e.g. reachable but returning 404) collapses to "down"
  // here. The Service Health page still shows the precise state.
  const modules = detailed.modules.map((m) => ({
    name: m.name,
    slug: m.slug,
    port: m.port,
    status: m.status === "healthy" ? "healthy" : "down",
    latency_ms: m.responseTime ?? 0,
    error: m.error,
  }));

  const healthyCount = modules.filter((m) => m.status === "healthy").length;
  const totalCount = modules.length;

  return {
    modules,
    healthy_count: healthyCount,
    total_count: totalCount,
    overall_status: healthyCount === totalCount ? "all_healthy" : healthyCount > 0 ? "degraded" : "down",
  };
}

// ---------------------------------------------------------------------------
// #984 — Overdue Organizations (past_due / suspended subscriptions)
// ---------------------------------------------------------------------------

export async function getOverdueOrganizations() {
  const db = getDB();

  const orgs = await db("org_subscriptions as s")
    .join("organizations as o", "s.organization_id", "o.id")
    .join("modules as m", "s.module_id", "m.id")
    .leftJoin("billing_cycle_discounts as b", "s.billing_cycle", "b.cycle")
    .whereIn("s.status", ["past_due", "suspended", "deactivated"])
    .select(
      "o.id as org_id",
      "o.name as org_name",
      "o.email as org_email",
      "s.id as subscription_id",
      "m.name as module_name",
      "m.slug as module_slug",
      "s.status",
      "s.plan_tier",
      "s.total_seats",
      "s.price_per_seat",
      "s.billing_cycle",
      // Carry the cycle length so the JS-side per-row monthly_amount
      // calc can normalise (price_per_seat is per-cycle).
      "b.months_in_cycle as months_in_cycle",
      "s.current_period_end",
      "s.dunning_stage",
      "s.updated_at",
    )
    .orderBy("s.current_period_end", "asc");

  const now = new Date();
  return orgs.map((row: any) => {
    const periodEnd = new Date(row.current_period_end);
    const overdueDays = Math.max(
      0,
      Math.floor((now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24)),
    );
    return {
      org_id: row.org_id,
      org_name: row.org_name,
      org_email: row.org_email,
      subscription_id: row.subscription_id,
      module_name: row.module_name,
      module_slug: row.module_slug,
      status: row.status,
      plan_tier: row.plan_tier,
      total_seats: row.total_seats,
      price_per_seat: Number(row.price_per_seat),
      // price_per_seat is per-cycle; divide by months_in_cycle for
      // a truthful monthly amount.
      monthly_amount: Math.round(
        (Number(row.price_per_seat) * row.total_seats) /
          Math.max(1, Number(row.months_in_cycle) || 1),
      ),
      current_period_end: row.current_period_end,
      overdue_days: overdueDays,
      dunning_stage: row.dunning_stage || "current",
      last_updated: row.updated_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Module Adoption (kept for backward compat)
// ---------------------------------------------------------------------------

export async function getModuleAdoption() {
  const db = getDB();

  const adoption = await db("modules as m")
    .leftJoin(
      // Per-module MRR. Same per-cycle → monthly normalisation pattern.
      db("org_subscriptions as os")
        .leftJoin("billing_cycle_discounts as b", "os.billing_cycle", "b.cycle")
        .whereIn("os.status", ["active", "trial"])
        .select("os.module_id")
        .count("os.id as org_count")
        .sum("os.total_seats as total_seats")
        .select(
          db.raw(
            "COALESCE(SUM((os.price_per_seat * os.total_seats) / COALESCE(b.months_in_cycle, 1)), 0) as revenue",
          ),
        )
        .groupBy("os.module_id")
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
