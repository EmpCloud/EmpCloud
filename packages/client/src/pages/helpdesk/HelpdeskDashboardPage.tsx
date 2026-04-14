import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  Headphones,
  Clock,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Star,
  ArrowRight,
} from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  leave: "bg-blue-100 text-blue-700",
  payroll: "bg-green-100 text-green-700",
  benefits: "bg-purple-100 text-purple-700",
  it: "bg-orange-100 text-orange-700",
  facilities: "bg-yellow-100 text-yellow-700",
  onboarding: "bg-teal-100 text-teal-700",
  policy: "bg-indigo-100 text-indigo-700",
  general: "bg-gray-100 text-gray-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  awaiting_response: "bg-purple-100 text-purple-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  reopened: "bg-red-100 text-red-700",
};

function useDashboard() {
  return useQuery({
    queryKey: ["helpdesk-dashboard"],
    queryFn: () => api.get("/helpdesk/dashboard").then((r) => r.data.data),
  });
}

export default function HelpdeskDashboardPage() {
  const { data: stats, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading helpdesk dashboard...</div>
      </div>
    );
  }

  if (!stats) return null;

  // Stat cards link to the ticket list with the matching filter so the
  // counts are clickable — fixes issue #1398.
  const statCards = [
    {
      label: "Total Open",
      value: stats.total_open,
      icon: Clock,
      color: "text-blue-600 bg-blue-50",
      href: "/helpdesk/tickets?status=open",
    },
    {
      label: "In Progress",
      value: stats.in_progress + stats.awaiting_response,
      icon: Headphones,
      color: "text-yellow-600 bg-yellow-50",
      href: "/helpdesk/tickets?status=in_progress",
    },
    {
      label: "Overdue (SLA Breached)",
      value: stats.overdue,
      icon: AlertTriangle,
      color: "text-red-600 bg-red-50",
      href: "/helpdesk/tickets?sla=breached",
    },
    {
      label: "Resolved Today",
      value: stats.resolved_today,
      icon: CheckCircle2,
      color: "text-green-600 bg-green-50",
      href: "/helpdesk/tickets?status=resolved",
    },
  ];

  const maxCategoryCount = Math.max(
    ...stats.category_breakdown.map((c: any) => c.count),
    1
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Helpdesk Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Overview of HR helpdesk tickets and SLA performance.
          </p>
        </div>
        <Link
          to="/helpdesk/tickets"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          View All Tickets <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.href}
              className="bg-white rounded-xl border border-gray-200 p-6 transition-colors hover:border-brand-400 hover:bg-brand-50/30 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* SLA & Metrics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* SLA Compliance */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> SLA Compliance
          </h3>
          <div className="flex items-center justify-center">
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="10"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke={stats.sla_compliance >= 80 ? "#22c55e" : stats.sla_compliance >= 60 ? "#f59e0b" : "#ef4444"}
                  strokeWidth="10"
                  strokeDasharray={`${(stats.sla_compliance / 100) * 314} 314`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">
                  {stats.sla_compliance}%
                </span>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-gray-500 mt-3">
            Tickets resolved within SLA
          </p>
        </div>

        {/* Avg Resolution Time */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Average Resolution Time
          </h3>
          <div className="flex items-center justify-center mt-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-gray-900">
                {stats.avg_resolution_hours}
              </p>
              <p className="text-sm text-gray-500 mt-1">hours</p>
            </div>
          </div>
        </div>

        {/* Satisfaction */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Star className="h-4 w-4" /> Satisfaction Rating
          </h3>
          <div className="flex items-center justify-center mt-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-6 w-6 ${
                      stats.avg_satisfaction && star <= Math.round(stats.avg_satisfaction)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-200"
                    }`}
                  />
                ))}
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {stats.avg_satisfaction ?? "N/A"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.rated_count} rating{stats.rated_count !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Tickets by Category
          </h3>
          <div className="space-y-3">
            {stats.category_breakdown.map((cat: any) => (
              <div key={cat.category} className="flex items-center gap-3">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${
                    CATEGORY_COLORS[cat.category] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  {cat.category}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-brand-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${(cat.count / maxCategoryCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700 w-8 text-right">
                  {cat.count}
                </span>
              </div>
            ))}
            {stats.category_breakdown.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                No tickets yet
              </p>
            )}
          </div>
        </div>

        {/* Recent Tickets */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Recent Tickets
          </h3>
          <div className="space-y-3">
            {stats.recent_tickets.slice(0, 8).map((t: any) => (
              <Link
                key={t.id}
                to={`/helpdesk/tickets/${t.id}`}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    #{t.id} {t.subject}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t.raised_by_name} &middot;{" "}
                    {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      PRIORITY_COLORS[t.priority] || ""
                    }`}
                  >
                    {t.priority}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      STATUS_COLORS[t.status] || ""
                    }`}
                  >
                    {t.status.replace("_", " ")}
                  </span>
                </div>
              </Link>
            ))}
            {stats.recent_tickets.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                No tickets yet
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
