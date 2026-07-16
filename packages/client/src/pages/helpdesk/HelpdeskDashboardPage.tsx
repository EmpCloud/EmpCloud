import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  leave: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  payroll: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  benefits: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  it: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  facilities: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  onboarding: "bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300",
  policy: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300",
  general: "bg-muted text-muted-foreground",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  high: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  urgent: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  in_progress: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  awaiting_response: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  resolved: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  closed: "bg-muted text-muted-foreground",
  reopened: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

function useDashboard() {
  return useQuery({
    queryKey: ["helpdesk-dashboard"],
    queryFn: () => api.get("/helpdesk/dashboard").then((r) => r.data.data),
  });
}

export default function HelpdeskDashboardPage() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">
          {t("helpdeskDashboard.loading")}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // Stat cards link to the ticket list with the matching filter so the
  // counts are clickable — fixes issue #1398.
  const statCards = [
    {
      label: t("helpdeskDashboard.stats.totalOpen"),
      value: stats.total_open,
      icon: Clock,
      color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40",
      href: "/helpdesk/tickets?status=open",
    },
    {
      label: t("helpdeskDashboard.stats.inProgress"),
      value: stats.in_progress + stats.awaiting_response,
      icon: Headphones,
      color: "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/40",
      href: "/helpdesk/tickets?status=in_progress",
    },
    {
      label: t("helpdeskDashboard.stats.overdue"),
      value: stats.overdue,
      icon: AlertTriangle,
      color: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40",
      href: "/helpdesk/tickets?sla=breached",
    },
    {
      label: t("helpdeskDashboard.stats.resolvedToday"),
      value: stats.resolved_today,
      icon: CheckCircle2,
      color: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40",
      href: "/helpdesk/tickets?resolved_date=today",
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
          <h1 className="text-2xl font-bold text-foreground">
            {t("helpdeskDashboard.title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("helpdeskDashboard.subtitle")}
          </p>
        </div>
        <Link
          to="/helpdesk/tickets"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          {t("helpdeskDashboard.viewAllTickets")} <ArrowRight className="h-4 w-4" />
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
              className="bg-card rounded-xl border border-border p-6 transition-colors hover:border-brand-400 hover:bg-brand-50/30 dark:hover:bg-brand-950/30 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* SLA & Metrics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* SLA Compliance */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> {t("helpdeskDashboard.sla.compliance")}
          </h3>
          <div className="flex items-center justify-center">
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  className="text-gray-200 dark:text-slate-700"
                  stroke="currentColor"
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
                <span className="text-2xl font-bold text-foreground">
                  {stats.sla_compliance}%
                </span>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3">
            {t("helpdeskDashboard.sla.resolvedWithinSla")}
          </p>
        </div>

        {/* Avg Resolution Time */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" /> {t("helpdeskDashboard.metrics.avgResolutionTime")}
          </h3>
          <div className="flex items-center justify-center mt-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-foreground">
                {stats.avg_resolution_hours}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("helpdeskDashboard.metrics.hours")}
              </p>
            </div>
          </div>
        </div>

        {/* Satisfaction */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
            <Star className="h-4 w-4" /> {t("helpdeskDashboard.satisfaction.title")}
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
                        : "text-gray-200 dark:text-slate-700"
                    }`}
                  />
                ))}
              </div>
              <p className="text-2xl font-bold text-foreground">
                {stats.avg_satisfaction ?? t("helpdeskDashboard.satisfaction.notAvailable")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("helpdeskDashboard.satisfaction.ratingCount", {
                  count: stats.rated_count,
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">
            {t("helpdeskDashboard.categoryBreakdown.title")}
          </h3>
          <div className="space-y-3">
            {stats.category_breakdown.map((cat: any) => (
              <div key={cat.category} className="flex items-center gap-3">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${
                    CATEGORY_COLORS[cat.category] || "bg-muted text-muted-foreground"
                  }`}
                >
                  {t(`helpdeskDashboard.category.${cat.category}`, {
                    defaultValue: cat.category,
                  })}
                </span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div
                    className="bg-brand-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${(cat.count / maxCategoryCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium text-muted-foreground w-8 text-right">
                  {cat.count}
                </span>
              </div>
            ))}
            {stats.category_breakdown.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("helpdeskDashboard.emptyState.noTickets")}
              </p>
            )}
          </div>
        </div>

        {/* Recent Tickets */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">
            {t("helpdeskDashboard.recentTickets.title")}
          </h3>
          <div className="space-y-3">
            {stats.recent_tickets.slice(0, 8).map((ticket: any) => (
              <Link
                key={ticket.id}
                to={`/helpdesk/tickets/${ticket.id}`}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    #{ticket.id} {ticket.subject}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.raised_by_name} &middot;{" "}
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      PRIORITY_COLORS[ticket.priority] || ""
                    }`}
                  >
                    {t(`helpdeskDashboard.priority.${ticket.priority}`, {
                      defaultValue: ticket.priority,
                    })}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      STATUS_COLORS[ticket.status] || ""
                    }`}
                  >
                    {t(`helpdeskDashboard.status.${ticket.status}`, {
                      defaultValue: ticket.status.replace("_", " "),
                    })}
                  </span>
                </div>
              </Link>
            ))}
            {stats.recent_tickets.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("helpdeskDashboard.emptyState.noTickets")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
