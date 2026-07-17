import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          <div className="h-6 w-6 border-2 border-border border-t-gray-500 rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">{t("subscriptionMetrics.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-green-50 dark:bg-green-950/40 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("subscriptionMetrics.title")}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {t("subscriptionMetrics.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("subscriptionMetrics.stats.totalSeats")}</p>
              <p className="text-xl font-bold text-foreground">{(data?.total_seats ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 dark:bg-green-950/40 flex items-center justify-center">
              <Layers className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("subscriptionMetrics.stats.usedSeats")}</p>
              <p className="text-xl font-bold text-foreground">{(data?.used_seats ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
              <PieChartIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("subscriptionMetrics.stats.seatUtilization")}</p>
              <p className="text-xl font-bold text-foreground">{data?.overall_utilization ?? 0}%</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("subscriptionMetrics.stats.activeUsers")}</p>
              <p className="text-xl font-bold text-foreground">
                {(growth?.active_users ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("subscriptionMetrics.stats.inactive", { count: growth?.inactive_users ?? 0 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Plan Tier Distribution (Pie) */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("subscriptionMetrics.charts.planTierDistribution")}</h2>
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
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))", borderRadius: "0.5rem" }} labelStyle={{ color: "hsl(var(--foreground))" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
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
                      <span className="capitalize text-muted-foreground">{tier.plan_tier}</span>
                    </div>
                    <span className="font-medium text-foreground">{tier.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
              {t("subscriptionMetrics.empty.noData")}
            </div>
          )}
        </div>

        {/* Subscription Status (Pie) */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("subscriptionMetrics.charts.subscriptionStatus")}</h2>
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
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))", borderRadius: "0.5rem" }} labelStyle={{ color: "hsl(var(--foreground))" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
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
                      <span className="capitalize text-muted-foreground">{item.status}</span>
                    </div>
                    <span className="font-medium text-foreground">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
              {t("subscriptionMetrics.empty.noData")}
            </div>
          )}
        </div>

        {/* Billing Cycle (Pie) */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("subscriptionMetrics.charts.billingCycle")}</h2>
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
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))", borderRadius: "0.5rem" }} labelStyle={{ color: "hsl(var(--foreground))" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
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
                      <span className="capitalize text-muted-foreground">{item.billing_cycle}</span>
                    </div>
                    <span className="font-medium text-foreground">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
              {t("subscriptionMetrics.empty.noData")}
            </div>
          )}
        </div>
      </div>

      {/* Seat Utilization by Tier */}
      <div className="bg-card rounded-xl border border-border p-6 mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">{t("subscriptionMetrics.charts.seatUtilizationByTier")}</h2>
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
                    <span className="text-sm font-medium text-foreground capitalize">{tier.plan_tier}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      {t("subscriptionMetrics.seats", { count: tier.total_seats, used: tier.used_seats.toLocaleString(), total: tier.total_seats.toLocaleString() })}
                    </span>
                    <span
                      className={`font-medium ${
                        tier.utilization > 80
                          ? "text-red-600 dark:text-red-400"
                          : tier.utilization > 50
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-green-600 dark:text-green-400"
                      }`}
                    >
                      {tier.utilization}%
                    </span>
                  </div>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
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
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            {t("subscriptionMetrics.empty.noTierData")}
          </div>
        )}
      </div>

      {/* Churn */}
      {growth?.churn?.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("subscriptionMetrics.charts.subscriptionChurn")}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={growth.churn}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
              <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} stroke="hsl(var(--border))" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))", borderRadius: "0.5rem" }} labelStyle={{ color: "hsl(var(--foreground))" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
              <Bar dataKey="count" name={t("subscriptionMetrics.churn.cancelledSeries")} fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
