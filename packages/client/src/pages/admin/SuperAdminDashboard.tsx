import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import {
  Building2,
  Users,
  CreditCard,
  TrendingUp,
  Activity,
  Crown,
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

const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#818cf8", "#6d28d9", "#4f46e5"];

function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function HealthBadge({ status }: { status: string }) {
  if (status === "healthy") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <span className="h-2 w-2 rounded-full bg-green-500" />
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

export default function SuperAdminDashboard() {
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api.get("/admin/overview").then((r) => r.data.data),
  });

  const { data: revenue } = useQuery({
    queryKey: ["admin-revenue"],
    queryFn: () => api.get("/admin/revenue").then((r) => r.data.data),
  });

  const { data: health } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => api.get("/admin/health").then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { data: adoption } = useQuery({
    queryKey: ["admin-module-adoption"],
    queryFn: () => api.get("/admin/module-adoption").then((r) => r.data.data),
  });

  const { data: orgsData } = useQuery({
    queryKey: ["admin-recent-orgs"],
    queryFn: () => api.get("/admin/organizations", { params: { page: 1, per_page: 5 } }).then((r) => r.data),
  });

  if (overviewLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading platform data...</div>
      </div>
    );
  }

  const recentOrgs = orgsData?.data || [];

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Crown className="h-7 w-7 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
            <p className="text-gray-500 mt-1">Platform-wide overview across all organizations.</p>
          </div>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <StatCard
          label="Total Organizations"
          value={overview?.total_organizations ?? 0}
          icon={Building2}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Total Users"
          value={overview?.total_users ?? 0}
          icon={Users}
          color="bg-green-50 text-green-600"
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
          icon={TrendingUp}
          color="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="ARR"
          value={formatINR(overview?.arr ?? 0)}
          icon={Activity}
          color="bg-indigo-50 text-indigo-600"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue by Module (Pie) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Module</h2>
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
                  label={({ name, percent }) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                >
                  {revenue.revenue_by_module.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatINR(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400">
              No revenue data yet
            </div>
          )}
        </div>

        {/* Module Adoption (Bar) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Module Adoption</h2>
          {adoption?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={adoption}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="org_count" name="Organizations" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total_seats" name="Total Seats" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400">
              No adoption data yet
            </div>
          )}
        </div>
      </div>

      {/* Revenue Trend + System Health Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue Trend (Line) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend (Monthly)</h2>
          {revenue?.revenue_trend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenue.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => formatINR(v)} />
                <Tooltip formatter={(value: number) => formatINR(value)} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400">
              No trend data yet
            </div>
          )}
        </div>

        {/* System Health */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Health</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {health?.modules?.map((mod: any) => (
              <div
                key={mod.slug}
                className={`rounded-lg border p-4 ${
                  mod.status === "healthy"
                    ? "border-green-200 bg-green-50/50"
                    : "border-red-200 bg-red-50/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">{mod.name}</p>
                  <HealthBadge status={mod.status} />
                </div>
                <p className="text-xs text-gray-500 mt-1">{mod.latency_ms}ms</p>
              </div>
            )) ?? (
              <div className="col-span-2 text-center text-gray-400 py-8">
                Checking health...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Organizations */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Organizations</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Organization</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Email</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Users</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Subscriptions</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Created</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrgs.map((org: any) => (
                <tr key={org.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">{org.name}</td>
                  <td className="py-3 px-4 text-gray-600">{org.email}</td>
                  <td className="py-3 px-4 text-gray-600">{org.user_count}</td>
                  <td className="py-3 px-4 text-gray-600">{org.subscription_count}</td>
                  <td className="py-3 px-4 text-gray-600">
                    {new Date(org.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        org.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {org.status}
                    </span>
                  </td>
                </tr>
              ))}
              {recentOrgs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    No organizations yet
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
