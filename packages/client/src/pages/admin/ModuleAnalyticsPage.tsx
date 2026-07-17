import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import {
  Package,
  Users,
  TrendingUp,
  Layers,
  Power,
} from "lucide-react";
import {
  BarChart,
  Bar,
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

function formatINR(paise: number): string {
  const value = paise / 100;
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function ModuleAnalyticsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: modules, isLoading } = useQuery({
    queryKey: ["admin-modules"],
    queryFn: () => api.get("/admin/modules").then((r) => r.data.data),
  });

  const toggleModuleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/admin/modules/${id}`, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-modules"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-modules"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 border-2 border-border border-t-gray-500 rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">{t("moduleAnalytics.loading")}</span>
        </div>
      </div>
    );
  }

  const totalSubscribers = (modules || []).reduce((sum: number, m: any) => sum + m.subscriber_count, 0);
  const totalSeats = (modules || []).reduce((sum: number, m: any) => sum + m.total_seats, 0);
  const totalRevenue = (modules || []).reduce((sum: number, m: any) => sum + m.revenue, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
            <Package className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("moduleAnalytics.title")}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {t("moduleAnalytics.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("moduleAnalytics.stats.activeModules")}</p>
              <p className="text-xl font-bold text-foreground">{(modules || []).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 dark:bg-green-950/40 flex items-center justify-center">
              <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("moduleAnalytics.stats.totalSubscribers")}</p>
              <p className="text-xl font-bold text-foreground">{totalSubscribers}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
              <Layers className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("moduleAnalytics.stats.totalSeats")}</p>
              <p className="text-xl font-bold text-foreground">{totalSeats.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("moduleAnalytics.stats.totalModuleRevenue")}</p>
              <p className="text-xl font-bold text-foreground">{formatINR(totalRevenue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue by Module (Bar) */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("moduleAnalytics.charts.revenueByModule")}</h2>
          {modules?.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={modules.filter((m: any) => m.revenue > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} angle={-20} textAnchor="end" height={70} stroke="hsl(var(--border))" />
                <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip formatter={(value: any) => formatINR(Number(value))} />
                <Bar dataKey="revenue" name={t("moduleAnalytics.charts.revenueSeries")} fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
              {t("moduleAnalytics.charts.noRevenueData")}
            </div>
          )}
        </div>

        {/* Subscribers by Module (Pie) */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("moduleAnalytics.charts.subscriberDistribution")}</h2>
          {modules?.filter((m: any) => m.subscriber_count > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={modules.filter((m: any) => m.subscriber_count > 0)}
                  dataKey="subscriber_count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={55}
                  label={({ name, percent }: any) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                >
                  {modules
                    .filter((m: any) => m.subscriber_count > 0)
                    .map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))", borderRadius: "0.5rem" }} labelStyle={{ color: "hsl(var(--foreground))" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
              {t("moduleAnalytics.charts.noSubscriberData")}
            </div>
          )}
        </div>
      </div>

      {/* Module Cards Grid */}
      <h2 className="text-lg font-semibold text-foreground mb-4">{t("moduleAnalytics.details.heading")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {(modules || []).map((mod: any) => (
          <div
            key={mod.id}
            className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground">{mod.name}</h3>
                <p className="text-xs text-muted-foreground font-mono">{mod.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    mod.subscriber_count > 0
                      ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {mod.subscriber_count > 0
                    ? t("moduleAnalytics.details.orgCount", { count: mod.subscriber_count })
                    : t("moduleAnalytics.details.noSubscribers")}
                </span>
                <button
                  onClick={() => toggleModuleMut.mutate({ id: mod.id, is_active: false })}
                  disabled={toggleModuleMut.isPending}
                  className="p-1 text-green-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors"
                  title={t("moduleAnalytics.details.disableModule")}
                >
                  <Power className="h-4 w-4" />
                </button>
              </div>
            </div>
            {mod.description && (
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{mod.description}</p>
            )}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border">
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{mod.subscriber_count}</p>
                <p className="text-xs text-muted-foreground">{t("moduleAnalytics.details.subscribers")}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">
                  {mod.used_seats}
                  <span className="text-sm text-muted-foreground">/{mod.total_seats}</span>
                </p>
                <p className="text-xs text-muted-foreground">{t("moduleAnalytics.details.seats")}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{formatINR(mod.revenue)}</p>
                <p className="text-xs text-muted-foreground">{t("moduleAnalytics.details.revenue")}</p>
              </div>
            </div>
            {/* Seat utilization bar */}
            {mod.total_seats > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{t("moduleAnalytics.details.seatUtilization")}</span>
                  <span>{mod.seat_utilization}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      mod.seat_utilization > 80
                        ? "bg-red-500"
                        : mod.seat_utilization > 50
                          ? "bg-amber-500"
                          : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(100, mod.seat_utilization)}%` }}
                  />
                </div>
              </div>
            )}
            {/* Tier distribution */}
            {Object.keys(mod.tier_distribution || {}).length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">{t("moduleAnalytics.details.planDistribution")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(mod.tier_distribution).map(([tier, count]) => (
                    <span
                      key={tier}
                      className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 capitalize"
                    >
                      {tier}: {count as number}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detailed Table */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">{t("moduleAnalytics.table.heading")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("moduleAnalytics.table.module")}</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("moduleAnalytics.table.slug")}</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">{t("moduleAnalytics.table.subscribers")}</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">{t("moduleAnalytics.table.totalSeats")}</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">{t("moduleAnalytics.table.usedSeats")}</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">{t("moduleAnalytics.table.utilization")}</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">{t("moduleAnalytics.table.revenue")}</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">{t("moduleAnalytics.table.status")}</th>
              </tr>
            </thead>
            <tbody>
              {(modules || []).map((mod: any) => (
                <tr key={mod.id} className="border-b border-border hover:bg-muted/50">
                  <td className="py-3 px-4 font-medium text-foreground">{mod.name}</td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{mod.slug}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{mod.subscriber_count}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{mod.total_seats.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{mod.used_seats.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`font-medium ${
                        mod.seat_utilization > 80
                          ? "text-red-600 dark:text-red-400"
                          : mod.seat_utilization > 50
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-green-600 dark:text-green-400"
                      }`}
                    >
                      {mod.seat_utilization}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-foreground">
                    {formatINR(mod.revenue)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => toggleModuleMut.mutate({ id: mod.id, is_active: false })}
                      disabled={toggleModuleMut.isPending}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 rounded-lg transition-colors"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {t("moduleAnalytics.status.active")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
