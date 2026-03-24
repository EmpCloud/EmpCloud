import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Calendar,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#818cf8",
  "#6d28d9", "#4f46e5", "#7c3aed", "#5b21b6", "#4338ca",
];

const TIER_COLORS: Record<string, string> = {
  free: "#94a3b8",
  basic: "#3b82f6",
  professional: "#8b5cf6",
  enterprise: "#f59e0b",
};

function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function RevenueAnalyticsPage() {
  const { data: revenue, isLoading } = useQuery({
    queryKey: ["admin-revenue-full"],
    queryFn: () => api.get("/admin/revenue", { params: { period: "12m" } }).then((r) => r.data.data),
  });

  const { data: subscriptions } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: () => api.get("/admin/subscriptions").then((r) => r.data.data),
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

  const mrrGrowth = revenue?.mrr_growth_percent ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Revenue Analytics</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              Financial overview and revenue breakdown.
            </p>
          </div>
        </div>
      </div>

      {/* Top Revenue Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            {mrrGrowth !== 0 && (
              <span
                className={`flex items-center gap-0.5 text-xs font-medium px-2 py-1 rounded-full ${
                  mrrGrowth > 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                }`}
              >
                {mrrGrowth > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(mrrGrowth)}%
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-3">{formatINR(revenue?.mrr ?? 0)}</p>
          <p className="text-sm text-gray-500 mt-1">Monthly Recurring Revenue</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-3">{formatINR(revenue?.arr ?? 0)}</p>
          <p className="text-sm text-gray-500 mt-1">Annual Recurring Revenue</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-3">
            {subscriptions?.overall_utilization ?? 0}%
          </p>
          <p className="text-sm text-gray-500 mt-1">Seat Utilization</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {subscriptions?.used_seats?.toLocaleString() ?? 0} / {subscriptions?.total_seats?.toLocaleString() ?? 0} seats
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-3">
            {(revenue?.top_customers || []).length}
          </p>
          <p className="text-sm text-gray-500 mt-1">Paying Customers</p>
        </div>
      </div>

      {/* Revenue Trend + Revenue by Module */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Monthly Revenue Trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend (Last 12 Months)</h2>
          {revenue?.revenue_trend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={revenue.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
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
            <div className="flex items-center justify-center h-[320px] text-gray-400 text-sm">
              No trend data yet
            </div>
          )}
        </div>

        {/* Revenue by Module */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Module</h2>
          {revenue?.revenue_by_module?.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revenue.revenue_by_module}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: any) => formatINR(Number(value))} />
                <Bar dataKey="revenue" name="Revenue" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[320px] text-gray-400 text-sm">
              No data
            </div>
          )}
        </div>
      </div>

      {/* Revenue by Tier + Billing Cycle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue by Plan Tier (Pie) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Plan Tier</h2>
          {revenue?.revenue_by_tier?.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="60%" height={280}>
                <PieChart>
                  <Pie
                    data={revenue.revenue_by_tier}
                    dataKey="revenue"
                    nameKey="plan_tier"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                  >
                    {revenue.revenue_by_tier.map((entry: any, i: number) => (
                      <Cell key={i} fill={TIER_COLORS[entry.plan_tier] || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatINR(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {revenue.revenue_by_tier.map((tier: any, i: number) => (
                  <div key={tier.plan_tier} className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: TIER_COLORS[tier.plan_tier] || COLORS[i % COLORS.length] }}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 capitalize">{tier.plan_tier}</p>
                      <p className="text-xs text-gray-500">
                        {tier.count} subs - {formatINR(tier.revenue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
              No data
            </div>
          )}
        </div>

        {/* Billing Cycle Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Billing Cycle Distribution</h2>
          {revenue?.billing_cycle_distribution?.length > 0 ? (
            <div className="space-y-4 pt-4">
              {revenue.billing_cycle_distribution.map((cycle: any) => {
                const totalCount = revenue.billing_cycle_distribution.reduce(
                  (sum: number, c: any) => sum + c.count,
                  0
                );
                const pct = totalCount > 0 ? Math.round((cycle.count / totalCount) * 100) : 0;
                return (
                  <div key={cycle.billing_cycle}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {cycle.billing_cycle}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">{cycle.count} subs</span>
                        <span className="text-sm font-medium text-gray-900">{formatINR(cycle.revenue)}</span>
                      </div>
                    </div>
                    <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{pct}% of subscriptions</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
              No data
            </div>
          )}
        </div>
      </div>

      {/* Top 10 Customers */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Customers by Revenue</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-500">#</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Organization</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Email</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Subscriptions</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Monthly Spend</th>
              </tr>
            </thead>
            <tbody>
              {(revenue?.top_customers || []).map((customer: any, index: number) => (
                <tr key={customer.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold ${
                        index === 0
                          ? "bg-amber-100 text-amber-700"
                          : index === 1
                            ? "bg-gray-200 text-gray-700"
                            : index === 2
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      to={`/admin/organizations/${customer.id}`}
                      className="font-medium text-gray-900 hover:text-brand-600"
                    >
                      {customer.name}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{customer.email}</td>
                  <td className="py-3 px-4 text-right text-gray-700">{customer.subscription_count}</td>
                  <td className="py-3 px-4 text-right font-bold text-gray-900">
                    {formatINR(customer.total_spend)}
                  </td>
                </tr>
              ))}
              {(!revenue?.top_customers || revenue.top_customers.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    No customer data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
