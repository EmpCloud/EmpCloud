import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import {
  Package,
  Users,
  TrendingUp,
  Layers,
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

function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function ModuleAnalyticsPage() {
  const { data: modules, isLoading } = useQuery({
    queryKey: ["admin-modules"],
    queryFn: () => api.get("/admin/modules").then((r) => r.data.data),
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

  const totalSubscribers = (modules || []).reduce((sum: number, m: any) => sum + m.subscriber_count, 0);
  const totalSeats = (modules || []).reduce((sum: number, m: any) => sum + m.total_seats, 0);
  const totalRevenue = (modules || []).reduce((sum: number, m: any) => sum + m.revenue, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <Package className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Module Analytics</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              Detailed metrics for each module across the platform.
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Modules</p>
              <p className="text-xl font-bold text-gray-900">{(modules || []).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Subscribers</p>
              <p className="text-xl font-bold text-gray-900">{totalSubscribers}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Layers className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Seats</p>
              <p className="text-xl font-bold text-gray-900">{totalSeats.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Module Revenue</p>
              <p className="text-xl font-bold text-gray-900">{formatINR(totalRevenue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue by Module (Bar) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Module</h2>
          {modules?.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={modules.filter((m: any) => m.revenue > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={70} />
                <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: any) => formatINR(Number(value))} />
                <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-gray-400 text-sm">
              No revenue data
            </div>
          )}
        </div>

        {/* Subscribers by Module (Pie) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscriber Distribution</h2>
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
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-gray-400 text-sm">
              No subscriber data
            </div>
          )}
        </div>
      </div>

      {/* Module Cards Grid */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Module Details</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {(modules || []).map((mod: any) => (
          <div
            key={mod.id}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{mod.name}</h3>
                <p className="text-xs text-gray-400 font-mono">{mod.slug}</p>
              </div>
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                  mod.subscriber_count > 0
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {mod.subscriber_count > 0 ? `${mod.subscriber_count} orgs` : "No subscribers"}
              </span>
            </div>
            {mod.description && (
              <p className="text-sm text-gray-500 mb-4 line-clamp-2">{mod.description}</p>
            )}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-100">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{mod.subscriber_count}</p>
                <p className="text-xs text-gray-500">Subscribers</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">
                  {mod.used_seats}
                  <span className="text-sm text-gray-400">/{mod.total_seats}</span>
                </p>
                <p className="text-xs text-gray-500">Seats</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{formatINR(mod.revenue)}</p>
                <p className="text-xs text-gray-500">Revenue</p>
              </div>
            </div>
            {/* Seat utilization bar */}
            {mod.total_seats > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Seat Utilization</span>
                  <span>{mod.seat_utilization}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
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
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Plan Distribution</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(mod.tier_distribution).map(([tier, count]) => (
                    <span
                      key={tier}
                      className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 capitalize"
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
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Detailed Metrics</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Module</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Slug</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Subscribers</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Total Seats</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Used Seats</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Utilization</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(modules || []).map((mod: any) => (
                <tr key={mod.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-3 px-4 font-medium text-gray-900">{mod.name}</td>
                  <td className="py-3 px-4 text-gray-500 font-mono text-xs">{mod.slug}</td>
                  <td className="py-3 px-4 text-right text-gray-700">{mod.subscriber_count}</td>
                  <td className="py-3 px-4 text-right text-gray-700">{mod.total_seats.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-gray-700">{mod.used_seats.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`font-medium ${
                        mod.seat_utilization > 80
                          ? "text-red-600"
                          : mod.seat_utilization > 50
                            ? "text-amber-600"
                            : "text-green-600"
                      }`}
                    >
                      {mod.seat_utilization}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-gray-900">
                    {formatINR(mod.revenue)}
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
