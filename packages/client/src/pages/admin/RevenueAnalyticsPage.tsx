import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

/** Format paise → readable INR (all monetary values from the API are in paise) */
function formatINR(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(2)} Cr`;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(2)} L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`;
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export default function RevenueAnalyticsPage() {
  const { t } = useTranslation();
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
          <div className="h-6 w-6 border-2 border-border border-t-gray-500 rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">{t("revenueAnalytics.loading")}</span>
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
          <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("revenueAnalytics.title")}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {t("revenueAnalytics.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* Top Revenue Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-start justify-between">
            <div className="h-10 w-10 rounded-lg bg-green-50 dark:bg-green-950/40 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            {mrrGrowth !== 0 && (
              <span
                className={`flex items-center gap-0.5 text-xs font-medium px-2 py-1 rounded-full ${
                  mrrGrowth > 0 ? "bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400" : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                }`}
              >
                {mrrGrowth > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(mrrGrowth)}%
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-foreground mt-3">{formatINR(revenue?.mrr ?? 0)}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("revenueAnalytics.stats.mrr")}</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <div className="h-10 w-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-foreground mt-3">{formatINR(revenue?.arr ?? 0)}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("revenueAnalytics.stats.arr")}</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <div className="h-10 w-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-foreground mt-3">
            {subscriptions?.overall_utilization ?? 0}%
          </p>
          <p className="text-sm text-muted-foreground mt-1">{t("revenueAnalytics.stats.seatUtilization")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("revenueAnalytics.stats.seats", {
              used: subscriptions?.used_seats?.toLocaleString() ?? 0,
              total: subscriptions?.total_seats?.toLocaleString() ?? 0,
            })}
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-foreground mt-3">
            {(revenue?.top_customers || []).length}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{t("revenueAnalytics.stats.payingCustomers")}</p>
        </div>
      </div>

      {/* Revenue Trend + Revenue by Module */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Monthly Revenue Trend */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("revenueAnalytics.charts.revenueTrend.title")}</h2>
          {revenue?.revenue_trend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={revenue.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
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
            <div className="flex items-center justify-center h-[320px] text-muted-foreground text-sm">
              {t("revenueAnalytics.charts.revenueTrend.empty")}
            </div>
          )}
        </div>

        {/* Revenue by Module */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("revenueAnalytics.charts.revenueByModule.title")}</h2>
          {revenue?.revenue_by_module?.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revenue.revenue_by_module}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} angle={-15} textAnchor="end" height={60} stroke="hsl(var(--border))" />
                <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip formatter={(value: any) => formatINR(Number(value))} />
                <Bar dataKey="revenue" name={t("revenueAnalytics.charts.revenueByModule.series")} fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[320px] text-muted-foreground text-sm">
              {t("revenueAnalytics.charts.empty")}
            </div>
          )}
        </div>
      </div>

      {/* Revenue by Tier + Billing Cycle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue by Plan Tier (Pie) */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("revenueAnalytics.charts.revenueByTier.title")}</h2>
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
                      <p className="text-sm font-medium text-foreground capitalize">{tier.plan_tier}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("revenueAnalytics.charts.revenueByTier.subsLabel", { count: tier.count, revenue: formatINR(tier.revenue) })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              {t("revenueAnalytics.charts.empty")}
            </div>
          )}
        </div>

        {/* Billing Cycle Distribution */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("revenueAnalytics.charts.billingCycle.title")}</h2>
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
                      <span className="text-sm font-medium text-foreground capitalize">
                        {cycle.billing_cycle}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{t("revenueAnalytics.charts.billingCycle.subs", { count: cycle.count })}</span>
                        <span className="text-sm font-medium text-foreground">{formatINR(cycle.revenue)}</span>
                      </div>
                    </div>
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("revenueAnalytics.charts.billingCycle.percentOfSubscriptions", { percent: pct })}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              {t("revenueAnalytics.charts.empty")}
            </div>
          )}
        </div>
      </div>

      {/* Top 10 Customers */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">{t("revenueAnalytics.topCustomers.title")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("revenueAnalytics.topCustomers.columns.rank")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("revenueAnalytics.topCustomers.columns.organization")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("revenueAnalytics.topCustomers.columns.email")}</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">{t("revenueAnalytics.topCustomers.columns.subscriptions")}</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">{t("revenueAnalytics.topCustomers.columns.monthlySpend")}</th>
              </tr>
            </thead>
            <tbody>
              {(revenue?.top_customers || []).map((customer: any, index: number) => (
                <tr key={customer.id} className="border-b border-border hover:bg-muted/50">
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold ${
                        index === 0
                          ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                          : index === 1
                            ? "bg-muted text-muted-foreground"
                            : index === 2
                              ? "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300"
                              : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      to={`/admin/organizations/${customer.id}`}
                      className="font-medium text-foreground hover:text-brand-600"
                    >
                      {customer.name}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{customer.email}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{customer.subscription_count}</td>
                  <td className="py-3 px-4 text-right font-bold text-foreground">
                    {formatINR(customer.total_spend)}
                  </td>
                </tr>
              ))}
              {(!revenue?.top_customers || revenue.top_customers.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    {t("revenueAnalytics.topCustomers.empty")}
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
