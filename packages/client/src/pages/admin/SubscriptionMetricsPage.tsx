import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import {
  CreditCard,
  Layers,
  PieChart as PieChartIcon,
  BarChart3,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const TIER_COLORS: Record<string, string> = {
  free: "#94a3b8",
  basic: "#3b82f6",
  professional: "#8b5cf6",
  enterprise: "#f59e0b",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#10b981",
  trial: "#3b82f6",
  cancelled: "#ef4444",
  expired: "#6b7280",
  pending: "#f59e0b",
};

const CYCLE_COLORS: Record<string, string> = {
  monthly: "#6366f1",
  yearly: "#8b5cf6",
  annual: "#8b5cf6",
  quarterly: "#a78bfa",
};

export default function SubscriptionMetricsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: () => api.get("/admin/subscriptions").then((r) => r.data.data),
  });

  const { data: growth } = useQuery({
    queryKey: ["admin-growth"],
    queryFn: () => api.get("/admin/growth").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-green-50 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Subscription Metrics</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              Plan distribution, seat utilization, and billing metrics.
            </p>
          </div>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Layers className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Seats</p>
              <p className="text-xl font-bold text-gray-900">{(data?.total_seats ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Layers className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Used Seats</p>
              <p className="text-xl font-bold text-gray-900">{(data?.used_seats ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <PieChartIcon className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Seat Utilization</p>
              <p className="text-xl font-bold text-gray-900">{data?.overall_utilization ?? 0}%</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Users</p>
              <p className="text-xl font-bold text-gray-900">
                {(growth?.active_users ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-400">
                {growth?.inactive_users ?? 0} inactive
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Plan Tier Distribution (Pie) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Plan Tier Distribution</h2>
          {data?.tier_distribution?.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={data.tier_distribution}
                    dataKey="count"
                    nameKey="plan_tier"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={45}
                    label={({ plan_tier, percent }: any) =>
                      `${plan_tier} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                  >
                    {data.tier_distribution.map((entry: any, i: number) => (
                      <Cell key={i} fill={TIER_COLORS[entry.plan_tier] || `#${((i * 4567) % 0xffffff).toString(16).padStart(6, "0")}`} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4">
                {data.tier_distribution.map((tier: any) => (
                  <div key={tier.plan_tier} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: TIER_COLORS[tier.plan_tier] || "#6366f1" }}
                      />
                      <span className="capitalize text-gray-700">{tier.plan_tier}</span>
                    </div>
                    <span className="font-medium text-gray-900">{tier.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">
              No data
            </div>
          )}
        </div>

        {/* Subscription Status (Pie) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription Status</h2>
          {data?.status_distribution?.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={data.status_distribution}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={45}
                    label={({ status, percent }: any) =>
                      `${status} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                  >
                    {data.status_distribution.map((entry: any, i: number) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.status] || `#${((i * 3456) % 0xffffff).toString(16).padStart(6, "0")}`} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4">
                {data.status_distribution.map((item: any) => (
                  <div key={item.status} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[item.status] || "#6366f1" }}
                      />
                      <span className="capitalize text-gray-700">{item.status}</span>
                    </div>
                    <span className="font-medium text-gray-900">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">
              No data
            </div>
          )}
        </div>

        {/* Billing Cycle (Pie) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Billing Cycle</h2>
          {data?.cycle_distribution?.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={data.cycle_distribution}
                    dataKey="count"
                    nameKey="billing_cycle"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={45}
                    label={({ billing_cycle, percent }: any) =>
                      `${billing_cycle} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                  >
                    {data.cycle_distribution.map((entry: any, i: number) => (
                      <Cell key={i} fill={CYCLE_COLORS[entry.billing_cycle] || `#${((i * 5678) % 0xffffff).toString(16).padStart(6, "0")}`} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4">
                {data.cycle_distribution.map((item: any) => (
                  <div key={item.billing_cycle} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: CYCLE_COLORS[item.billing_cycle] || "#6366f1" }}
                      />
                      <span className="capitalize text-gray-700">{item.billing_cycle}</span>
                    </div>
                    <span className="font-medium text-gray-900">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">
              No data
            </div>
          )}
        </div>
      </div>

      {/* Seat Utilization by Tier */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Seat Utilization by Plan Tier</h2>
        {data?.tier_distribution?.length > 0 ? (
          <div className="space-y-4">
            {data.tier_distribution.map((tier: any) => (
              <div key={tier.plan_tier}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: TIER_COLORS[tier.plan_tier] || "#6366f1" }}
                    />
                    <span className="text-sm font-medium text-gray-900 capitalize">{tier.plan_tier}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500">
                      {tier.used_seats.toLocaleString()} / {tier.total_seats.toLocaleString()} seats
                    </span>
                    <span
                      className={`font-medium ${
                        tier.utilization > 80
                          ? "text-red-600"
                          : tier.utilization > 50
                            ? "text-amber-600"
                            : "text-green-600"
                      }`}
                    >
                      {tier.utilization}%
                    </span>
                  </div>
                </div>
                <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      tier.utilization > 80
                        ? "bg-red-500"
                        : tier.utilization > 50
                          ? "bg-amber-500"
                          : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(100, tier.utilization)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            No tier data
          </div>
        )}
      </div>

      {/* Churn */}
      {growth?.churn?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription Churn</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={growth.churn}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Cancelled" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
