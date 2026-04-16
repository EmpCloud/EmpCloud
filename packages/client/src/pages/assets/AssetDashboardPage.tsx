import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  Package,
  UserCheck,
  Box,
  Wrench,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock,
} from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  created: "text-green-600",
  assigned: "text-blue-600",
  returned: "text-purple-600",
  sent_to_repair: "text-yellow-600",
  repaired: "text-yellow-600",
  retired: "text-gray-600",
  lost: "text-red-600",
  found: "text-green-600",
  damaged: "text-orange-600",
  updated: "text-indigo-600",
};

function useDashboard() {
  return useQuery({
    queryKey: ["asset-dashboard"],
    queryFn: () => api.get("/assets/dashboard").then((r) => r.data.data),
  });
}

export default function AssetDashboardPage() {
  const { data: stats, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading asset dashboard...</div>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: "Total Assets", value: stats.total, icon: Package, color: "text-gray-900 bg-gray-50", to: "/assets" },
    { label: "Available", value: stats.available, icon: Box, color: "text-green-700 bg-green-50", to: "/assets" },
    { label: "Assigned", value: stats.assigned, icon: UserCheck, color: "text-blue-700 bg-blue-50", to: "/assets" },
    { label: "In Repair", value: stats.in_repair, icon: Wrench, color: "text-yellow-700 bg-yellow-50", to: "/assets" },
    { label: "Lost / Damaged", value: (stats.lost || 0) + (stats.damaged || 0), icon: AlertTriangle, color: "text-red-700 bg-red-50", to: "/assets" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">IT equipment and asset overview</p>
        </div>
        <Link
          to="/assets"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
        >
          View All Assets
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.to}
              className="block text-left w-full bg-white rounded-xl border border-gray-200 p-4 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                  <p className="text-xs text-gray-500">{card.label}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Expiring Warranties Alert */}
      {stats.expiring_warranties && stats.expiring_warranties.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">
              Warranties Expiring Soon ({stats.expiring_warranties.length})
            </h2>
          </div>
          <div className="space-y-2">
            {stats.expiring_warranties.slice(0, 5).map((asset: any) => (
              <div key={asset.id} className="flex items-center justify-between text-sm">
                <div>
                  <Link
                    to={`/assets/${asset.id}`}
                    className="font-medium text-amber-900 hover:underline"
                  >
                    {asset.asset_tag} - {asset.name}
                  </Link>
                  {asset.assigned_to_name && (
                    <span className="text-amber-700 ml-2">({asset.assigned_to_name})</span>
                  )}
                </div>
                <span className="text-amber-600">
                  Expires {new Date(asset.warranty_expiry).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">By Category</h2>
          </div>
          {stats.category_breakdown && stats.category_breakdown.length > 0 ? (
            <div className="space-y-3">
              {stats.category_breakdown.map((cat: any) => {
                const pct = stats.total > 0 ? Math.round((cat.count / stats.total) * 100) : 0;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700">{cat.category}</span>
                      <span className="text-gray-500">{cat.count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No assets yet</p>
          )}
        </div>

        {/* Top Assignees */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Top Assignees</h2>
          </div>
          {stats.top_assignees && stats.top_assignees.length > 0 ? (
            <div className="space-y-3">
              {stats.top_assignees.map((assignee: any, idx: number) => (
                <Link
                  key={assignee.user_id}
                  to={`/assets?assigned_to=${assignee.user_id}`}
                  className="flex items-center justify-between rounded-lg p-2 -m-2 transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-700">
                      {idx + 1}
                    </div>
                    <span className="text-sm text-gray-700">{assignee.name}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{assignee.count} assets</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No assignments yet</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        {stats.recent_activity && stats.recent_activity.length > 0 ? (
          <div className="space-y-3">
            {stats.recent_activity.map((activity: any) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 text-sm border-b border-gray-50 pb-3 last:border-0"
              >
                <div className={`mt-0.5 font-medium capitalize ${ACTION_COLORS[activity.action] || "text-gray-600"}`}>
                  {activity.action}
                </div>
                <div className="flex-1">
                  <Link
                    to={`/assets/${activity.asset_id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {activity.asset_tag} - {activity.asset_name}
                  </Link>
                  {activity.notes && (
                    <p className="text-gray-500 text-xs mt-0.5">{activity.notes}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(activity.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No recent activity</p>
        )}
      </div>
    </div>
  );
}
