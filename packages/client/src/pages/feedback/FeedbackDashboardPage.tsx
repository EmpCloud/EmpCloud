import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  Reply,
  Clock,
  CheckCircle,
  Eye,
  Archive,
  Search,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-700", icon: Clock },
  acknowledged: { label: "Acknowledged", color: "bg-yellow-100 text-yellow-700", icon: Eye },
  under_review: { label: "Under Review", color: "bg-purple-100 text-purple-700", icon: Search },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-700", icon: CheckCircle },
  archived: { label: "Archived", color: "bg-gray-100 text-gray-600", icon: Archive },
};

const CATEGORY_COLORS: Record<string, string> = {
  workplace: "bg-blue-500",
  management: "bg-indigo-500",
  process: "bg-cyan-500",
  culture: "bg-pink-500",
  harassment: "bg-red-500",
  safety: "bg-orange-500",
  suggestion: "bg-green-500",
  other: "bg-gray-400",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-green-500",
  neutral: "bg-gray-400",
  negative: "bg-red-500",
};

export default function FeedbackDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["feedback-dashboard"],
    queryFn: () => api.get("/feedback/dashboard").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Feedback Dashboard</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          Loading dashboard...
        </div>
      </div>
    );
  }

  const stats = data || {
    total: 0,
    urgentCount: 0,
    responseRate: 0,
    byCategory: [],
    bySentiment: [],
    byStatus: [],
    recent: [],
  };

  const maxCategoryCount = Math.max(1, ...stats.byCategory.map((c: any) => c.count));
  const maxSentimentCount = Math.max(1, ...stats.bySentiment.map((s: any) => s.count));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feedback Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of anonymous employee feedback.</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link to="/feedback" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total Feedback</p>
            </div>
          </div>
        </Link>

        <Link to="/feedback" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.urgentCount}</p>
              <p className="text-xs text-gray-500">Urgent Items</p>
            </div>
          </div>
        </Link>

        <Link to="/feedback" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Reply className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.responseRate}%</p>
              <p className="text-xs text-gray-500">Response Rate</p>
            </div>
          </div>
        </Link>

        <Link to="/feedback" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {stats.byStatus.find((s: any) => s.status === "new")?.count || 0}
              </p>
              <p className="text-xs text-gray-500">New / Unread</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Category Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">By Category</h2>
          {stats.byCategory.length === 0 ? (
            <p className="text-sm text-gray-400">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.byCategory.map((item: any) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700 capitalize">{item.category}</span>
                    <span className="font-medium text-gray-900">{item.count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${CATEGORY_COLORS[item.category] || "bg-gray-400"}`}
                      style={{ width: `${(item.count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sentiment Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Sentiment Distribution</h2>
          {stats.bySentiment.length === 0 ? (
            <p className="text-sm text-gray-400">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.bySentiment.map((item: any) => (
                <div key={item.sentiment}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700 capitalize">{item.sentiment || "unset"}</span>
                    <span className="font-medium text-gray-900">{item.count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${SENTIMENT_COLORS[item.sentiment] || "bg-gray-400"}`}
                      style={{ width: `${(item.count / maxSentimentCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">By Status</h2>
        <div className="flex flex-wrap gap-3">
          {stats.byStatus.map((item: any) => {
            const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.new;
            const StatusIcon = cfg.icon;
            return (
              <div
                key={item.status}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${cfg.color}`}
              >
                <StatusIcon className="h-4 w-4" />
                <span className="text-sm font-medium">{cfg.label}</span>
                <span className="text-sm font-bold">{item.count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Feedback */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Recent Feedback</h2>
        {stats.recent.length === 0 ? (
          <p className="text-sm text-gray-400">No feedback yet.</p>
        ) : (
          <div className="space-y-3">
            {stats.recent.map((f: any) => {
              const statusCfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.new;
              const StatusIcon = statusCfg.icon;
              return (
                <div
                  key={f.id}
                  className={`flex items-center gap-4 p-3 rounded-lg border ${
                    f.is_urgent ? "border-red-200 bg-red-50/30" : "border-gray-100"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500 capitalize">{f.category}</span>
                      <span className={`inline-flex items-center gap-1 text-xs ${statusCfg.color} px-2 py-0.5 rounded-full`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </span>
                      {f.is_urgent && (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{f.subject}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(f.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
