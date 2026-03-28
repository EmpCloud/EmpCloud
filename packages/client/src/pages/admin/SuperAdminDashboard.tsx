import { useQuery } from "@tanstack/react-query";
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`h-12 w-12 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-6 w-6" />
        </div>
        {trend && trendValue && (
          <div
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
              trend === "up"
                ? "bg-green-50 text-green-600"
                : trend === "down"
                  ? "bg-red-50 text-red-600"
                  : "bg-gray-50 text-gray-500"
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
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-1">{label}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function HealthBadge({ status }: { status: string }) {
  if (status === "healthy") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        Healthy
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      Down
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
      className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
    >
      <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 truncate">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
    </Link>
  );
}

export default function SuperAdminDashboard() {
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
          <div className="text-gray-400 text-sm">Loading platform data...</div>
        </div>
      </div>
    );
  }

  if (overviewError && !overview) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-center">
          <Activity className="h-8 w-8 text-red-400" />
          <div className="text-gray-600 font-medium">Failed to load dashboard data</div>
          <div className="text-gray-400 text-sm">Please try refreshing the page</div>
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
            <h1 className="text-2xl font-bold text-gray-900">Platform Dashboard</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              Real-time overview of the entire EMP Cloud platform.
            </p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard
          label="Total Organizations"
          value={overview?.total_organizations ?? 0}
          subtitle={`+${overview?.new_orgs_this_month ?? 0} this month`}
          icon={Building2}
          color="bg-blue-50 text-blue-600"
          trend={overview?.new_orgs_this_month > 0 ? "up" : "neutral"}
          trendValue={overview?.new_orgs_this_month > 0 ? `+${overview.new_orgs_this_month}` : "0"}
        />
        <StatCard
          label="Total Users"
          value={overview?.total_users ?? 0}
          subtitle={`+${overview?.new_users_this_month ?? 0} this month`}
          icon={Users}
          color="bg-green-50 text-green-600"
          trend={overview?.new_users_this_month > 0 ? "up" : "neutral"}
          trendValue={overview?.new_users_this_month > 0 ? `+${overview.new_users_this_month}` : "0"}
        />
        <StatCard
          label="Active Subscriptions"
          value={overview?.active_subscriptions ?? 0}
          icon={CreditCard}
          color="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="MRR"
          value={formatINR(overview?.mrr ?? 0)}
          subtitle="Monthly Recurring Revenue"
          icon={TrendingUp}
          color="bg-amber-50 text-amber-600"
          trend={revenue?.mrr_growth_percent > 0 ? "up" : revenue?.mrr_growth_percent < 0 ? "down" : "neutral"}
          trendValue={revenue?.mrr_growth_percent != null ? `${revenue.mrr_growth_percent}%` : undefined}
        />
        <StatCard
          label="ARR"
          value={formatINR(overview?.arr ?? 0)}
          subtitle="Annual Recurring Revenue"
          icon={DollarSign}
          color="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="System Health"
          value={`${healthyCount}/${totalModules}`}
          subtitle={
            health?.overall_status === "all_healthy"
              ? "All systems operational"
              : health?.overall_status === "degraded"
                ? "Some systems degraded"
                : "Systems offline"
          }
          icon={Heart}
          color={
            health?.overall_status === "all_healthy"
              ? "bg-green-50 text-green-600"
              : health?.overall_status === "degraded"
                ? "bg-yellow-50 text-yellow-600"
                : "bg-red-50 text-red-600"
          }
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <QuickLinkCard
          to="/admin/organizations"
          icon={Building2}
          label="Organizations"
          description="View and manage all organizations"
          color="bg-blue-50 text-blue-600"
        />
        <QuickLinkCard
          to="/admin/modules"
          icon={Package}
          label="Module Analytics"
          description="Subscribers, seats, revenue per module"
          color="bg-purple-50 text-purple-600"
        />
        <QuickLinkCard
          to="/admin/revenue"
          icon={BarChart3}
          label="Revenue Analytics"
          description="MRR, ARR, trends, top customers"
          color="bg-amber-50 text-amber-600"
        />
        <QuickLinkCard
          to="/admin/subscriptions"
          icon={CreditCard}
          label="Subscription Metrics"
          description="Plans, utilization, billing cycles"
          color="bg-green-50 text-green-600"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue Trend (Line) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Revenue Trend</h2>
            <Link to="/admin/revenue" className="text-xs text-brand-600 hover:underline">
              View details
            </Link>
          </div>
          {revenue?.revenue_trend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenue.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11 }} />
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
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
              No revenue data yet
            </div>
          )}
        </div>

        {/* Revenue by Module (Pie) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Revenue by Module</h2>
            <Link to="/admin/modules" className="text-xs text-brand-600 hover:underline">
              View details
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
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
              No revenue data yet
            </div>
          )}
        </div>
      </div>

      {/* Module Adoption + Growth Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Module Adoption (Bar) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Module Adoption</h2>
          {adoption?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={adoption}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="org_count" name="Organizations" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total_seats" name="Total Seats" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
              No adoption data yet
            </div>
          )}
        </div>

        {/* Org & User Growth */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Growth Trends</h2>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="new_orgs" name="New Orgs" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="new_users" name="New Users" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
              No growth data yet
            </div>
          )}
        </div>
      </div>

      {/* System Health + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">System Health</h2>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                health?.overall_status === "all_healthy"
                  ? "bg-green-100 text-green-700"
                  : health?.overall_status === "degraded"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              {health?.overall_status === "all_healthy"
                ? "All Operational"
                : health?.overall_status === "degraded"
                  ? "Degraded"
                  : "Checking..."}
            </span>
          </div>
          <div className="space-y-3">
            {health?.modules?.map((mod: any) => (
              <div
                key={mod.slug}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  mod.status === "healthy"
                    ? "border-green-200 bg-green-50/50"
                    : "border-red-200 bg-red-50/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      mod.status === "healthy" ? "bg-green-500 animate-pulse" : "bg-red-500"
                    }`}
                  />
                  <p className="text-sm font-medium text-gray-900">{mod.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{mod.latency_ms}ms</span>
                  <HealthBadge status={mod.status} />
                </div>
              </div>
            )) ?? (
              <div className="text-center text-gray-400 py-8 text-sm">
                Checking health...
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-0 max-h-[420px] overflow-y-auto">
            {activity?.length > 0 ? (
              activity.map((event: any) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0"
                >
                  <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Activity className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">
                        {event.user_name || event.user_email || "System"}
                      </span>{" "}
                      <span className="text-gray-600">{event.action}</span>{" "}
                      {event.entity_type && (
                        <span className="text-gray-500">
                          {event.entity_type}
                          {event.entity_id ? ` #${event.entity_id}` : ""}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {event.org_name && (
                        <span className="text-xs text-gray-400">{event.org_name}</span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-400 py-8 text-sm">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
