import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  Building2,
  Users,
  CreditCard,
  TrendingUp,
  Activity,
  Crown,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  DollarSign,
  BarChart3,
  Heart,
  ChevronRight,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#818cf8",
  "#6d28d9", "#4f46e5", "#7c3aed", "#5b21b6", "#4338ca",
];

function formatINR(valueInPaise: number): string {
  // API returns monetary values in smallest currency unit (paise) per architecture rules
  const value = valueInPaise / 100;
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  color,
  trend,
  trendValue,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`h-12 w-12 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-6 w-6" />
        </div>
        {trend && trendValue && (
          <div
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
              trend === "up"
                ? "bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400"
                : trend === "down"
                  ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {trend === "up" ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : trend === "down" ? (
              <ArrowDownRight className="h-3 w-3" />
            ) : null}
            {trendValue}
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function HealthBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "healthy") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300">
        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        {t("superAdminDashboard.healthBadge.healthy")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      {t("superAdminDashboard.healthBadge.down")}
    </span>
  );
}

function QuickLinkCard({
  to,
  icon: Icon,
  label,
  description,
  color,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  color: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-border hover:shadow-sm transition-all group"
    >
      <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
    </Link>
  );
}

export default function SuperAdminDashboard() {
  const { t } = useTranslation();
  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api.get("/admin/overview").then((r) => r.data.data),
    retry: 2,
  });

  const { data: revenue } = useQuery({
    queryKey: ["admin-revenue"],
    queryFn: () => api.get("/admin/revenue").then((r) => r.data.data),
    retry: 2,
  });

  const { data: health } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => api.get("/admin/health").then((r) => r.data.data),
    refetchInterval: 30000,
    retry: 2,
  });

  const { data: adoption } = useQuery({
    queryKey: ["admin-module-adoption"],
    queryFn: () => api.get("/admin/module-adoption").then((r) => r.data.data),
    retry: 2,
  });

  const { data: activity } = useQuery({
    queryKey: ["admin-activity"],
    queryFn: () => api.get("/admin/activity", { params: { limit: 20 } }).then((r) => r.data.data),
    retry: 2,
  });

  const { data: growth } = useQuery({
    queryKey: ["admin-growth"],
    queryFn: () => api.get("/admin/growth").then((r) => r.data.data),
    retry: 2,
  });

  if (overviewLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <div className="text-muted-foreground text-sm">{t("superAdminDashboard.loading")}</div>
        </div>
      </div>
    );
  }

  if (overviewError && !overview) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-center">
          <Activity className="h-8 w-8 text-red-400" />
          <div className="text-muted-foreground font-medium">{t("superAdminDashboard.error.title")}</div>
          <div className="text-muted-foreground text-sm">{t("superAdminDashboard.error.retryHint")}</div>
        </div>
      </div>
    );
  }

  const healthyCount = health?.healthy_count ?? 0;
  const totalModules = health?.total_count ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <Crown className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("superAdminDashboard.title")}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {t("superAdminDashboard.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard
          label={t("superAdminDashboard.stats.totalOrganizations")}
          value={overview?.total_organizations ?? 0}
          subtitle={t("superAdminDashboard.stats.newThisMonth", { count: overview?.new_orgs_this_month ?? 0 })}
          icon={Building2}
          color="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
          trend={overview?.new_orgs_this_month > 0 ? "up" : "neutral"}
          trendValue={overview?.new_orgs_this_month > 0 ? `+${overview.new_orgs_this_month}` : "0"}
        />
        <StatCard
          label={t("superAdminDashboard.stats.totalUsers")}
          value={overview?.total_users ?? 0}
          subtitle={t("superAdminDashboard.stats.newThisMonth", { count: overview?.new_users_this_month ?? 0 })}
          icon={Users}
          color="bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400"
          trend={overview?.new_users_this_month > 0 ? "up" : "neutral"}
          trendValue={overview?.new_users_this_month > 0 ? `+${overview.new_users_this_month}` : "0"}
        />
        <StatCard
          label={t("superAdminDashboard.stats.activeSubscriptions")}
          value={overview?.active_subscriptions ?? 0}
          icon={CreditCard}
          color="bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400"
        />
        <StatCard
          label={t("superAdminDashboard.stats.mrr")}
          value={formatINR(overview?.mrr ?? 0)}
          subtitle={t("superAdminDashboard.stats.mrrSubtitle")}
          icon={TrendingUp}
          color="bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
          trend={revenue?.mrr_growth_percent > 0 ? "up" : revenue?.mrr_growth_percent < 0 ? "down" : "neutral"}
          trendValue={revenue?.mrr_growth_percent != null ? `${revenue.mrr_growth_percent}%` : undefined}
        />
        <StatCard
          label={t("superAdminDashboard.stats.arr")}
          value={formatINR(overview?.arr ?? 0)}
          subtitle={t("superAdminDashboard.stats.arrSubtitle")}
          icon={DollarSign}
          color="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
        />
        <StatCard
          label={t("superAdminDashboard.stats.systemHealth")}
          value={`${healthyCount}/${totalModules}`}
          subtitle={
            health?.overall_status === "all_healthy"
              ? t("superAdminDashboard.systemHealthStatus.allHealthy")
              : health?.overall_status === "degraded"
                ? t("superAdminDashboard.systemHealthStatus.degraded")
                : t("superAdminDashboard.systemHealthStatus.offline")
          }
          icon={Heart}
          color={
            health?.overall_status === "all_healthy"
              ? "bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400"
              : health?.overall_status === "degraded"
                ? "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-600 dark:text-yellow-400"
                : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
          }
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <QuickLinkCard
          to="/admin/organizations"
          icon={Building2}
          label={t("superAdminDashboard.quickLinks.organizations.label")}
          description={t("superAdminDashboard.quickLinks.organizations.description")}
          color="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
        />
        <QuickLinkCard
          to="/admin/modules"
          icon={Package}
          label={t("superAdminDashboard.quickLinks.moduleAnalytics.label")}
          description={t("superAdminDashboard.quickLinks.moduleAnalytics.description")}
          color="bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400"
        />
        <QuickLinkCard
          to="/admin/revenue"
          icon={BarChart3}
          label={t("superAdminDashboard.quickLinks.revenueAnalytics.label")}
          description={t("superAdminDashboard.quickLinks.revenueAnalytics.description")}
          color="bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
        />
        <QuickLinkCard
          to="/admin/subscriptions"
          icon={CreditCard}
          label={t("superAdminDashboard.quickLinks.subscriptionMetrics.label")}
          description={t("superAdminDashboard.quickLinks.subscriptionMetrics.description")}
          color="bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue Trend (Line) */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">{t("superAdminDashboard.charts.revenueTrend.title")}</h2>
            <Link to="/admin/revenue" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
              {t("superAdminDashboard.charts.viewDetails")}
            </Link>
          </div>
          {revenue?.revenue_trend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenue.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
                <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip formatter={(value: any) => formatINR(Number(value))} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#6366f1" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              {t("superAdminDashboard.empty.revenue")}
            </div>
          )}
        </div>

        {/* Revenue by Module (Pie) */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">{t("superAdminDashboard.charts.revenueByModule.title")}</h2>
            <Link to="/admin/modules" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
              {t("superAdminDashboard.charts.viewDetails")}
            </Link>
          </div>
          {revenue?.revenue_by_module?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={revenue.revenue_by_module}
                  dataKey="revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  label={({ name, percent }: any) =>
                    `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                  }
                >
                  {revenue.revenue_by_module.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatINR(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              {t("superAdminDashboard.empty.revenue")}
            </div>
          )}
        </div>
      </div>

      {/* Module Adoption + Growth Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Module Adoption (Bar) */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("superAdminDashboard.charts.moduleAdoption.title")}</h2>
          {adoption?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={adoption}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} angle={-15} textAnchor="end" height={60} stroke="hsl(var(--border))" />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} stroke="hsl(var(--border))" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))", borderRadius: "0.5rem" }} labelStyle={{ color: "hsl(var(--foreground))" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
                <Legend />
                <Bar dataKey="org_count" name={t("superAdminDashboard.charts.legend.organizations")} fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total_seats" name={t("superAdminDashboard.charts.legend.totalSeats")} fill="#a78bfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              {t("superAdminDashboard.empty.adoption")}
            </div>
          )}
        </div>

        {/* Org & User Growth */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("superAdminDashboard.charts.growthTrends.title")}</h2>
          {growth?.org_growth?.length > 0 || growth?.user_growth?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={(() => {
                  const months = new Set<string>();
                  growth.org_growth?.forEach((g: any) => months.add(g.month));
                  growth.user_growth?.forEach((g: any) => months.add(g.month));
                  const orgMap = Object.fromEntries(
                    (growth.org_growth || []).map((g: any) => [g.month, g.count])
                  );
                  const userMap = Object.fromEntries(
                    (growth.user_growth || []).map((g: any) => [g.month, g.count])
                  );
                  return Array.from(months)
                    .sort()
                    .map((m) => ({
                      month: m,
                      new_orgs: orgMap[m] || 0,
                      new_users: userMap[m] || 0,
                    }));
                })()}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} stroke="hsl(var(--border))" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))", borderRadius: "0.5rem" }} labelStyle={{ color: "hsl(var(--foreground))" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
                <Legend />
                <Bar dataKey="new_orgs" name={t("superAdminDashboard.charts.legend.newOrgs")} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="new_users" name={t("superAdminDashboard.charts.legend.newUsers")} fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              {t("superAdminDashboard.empty.growth")}
            </div>
          )}
        </div>
      </div>

      {/* System Health + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">{t("superAdminDashboard.systemHealth.title")}</h2>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                health?.overall_status === "all_healthy"
                  ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                  : health?.overall_status === "degraded"
                    ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"
                    : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300"
              }`}
            >
              {health?.overall_status === "all_healthy"
                ? t("superAdminDashboard.systemHealth.badge.allOperational")
                : health?.overall_status === "degraded"
                  ? t("superAdminDashboard.systemHealth.badge.degraded")
                  : t("superAdminDashboard.systemHealth.badge.checking")}
            </span>
          </div>
          <div className="space-y-3">
            {health?.modules?.map((mod: any) => (
              <div
                key={mod.slug}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  mod.status === "healthy"
                    ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/30"
                    : "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      mod.status === "healthy" ? "bg-green-500 animate-pulse" : "bg-red-500"
                    }`}
                  />
                  <p className="text-sm font-medium text-foreground">{mod.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{mod.latency_ms}ms</span>
                  <HealthBadge status={mod.status} />
                </div>
              </div>
            )) ?? (
              <div className="text-center text-muted-foreground py-8 text-sm">
                {t("superAdminDashboard.systemHealth.checkingModules")}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("superAdminDashboard.activity.title")}</h2>
          <div className="space-y-0 max-h-[420px] overflow-y-auto">
            {activity?.length > 0 ? (
              activity.map((event: any) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 py-3 border-b border-border last:border-0"
                >
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">
                        {event.user_name || event.user_email || t("superAdminDashboard.activity.systemActor")}
                      </span>{" "}
                      <span className="text-muted-foreground">{event.action}</span>{" "}
                      {event.entity_type && (
                        <span className="text-muted-foreground">
                          {event.entity_type}
                          {event.entity_id ? ` #${event.entity_id}` : ""}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {event.org_name && (
                        <span className="text-xs text-muted-foreground">{event.org_name}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8 text-sm">
                {t("superAdminDashboard.empty.activity")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
