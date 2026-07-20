import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  new: { label: "New", color: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300", icon: Clock },
  acknowledged: { label: "Acknowledged", color: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300", icon: Eye },
  under_review: { label: "Under Review", color: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300", icon: Search },
  resolved: { label: "Resolved", color: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300", icon: CheckCircle },
  archived: { label: "Archived", color: "bg-muted text-muted-foreground", icon: Archive },
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
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["feedback-dashboard"],
    queryFn: () => api.get("/feedback/dashboard").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground mb-6">{t("feedbackDashboard.title")}</h1>
        <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
          {t("feedbackDashboard.loading")}
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("feedbackDashboard.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("feedbackDashboard.subtitle")}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Link to="/feedback" className="block text-left w-full bg-card rounded-lg border border-border p-4 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums leading-none text-foreground">{stats.total}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("feedbackDashboard.stats.totalFeedback")}</p>
            </div>
          </div>
        </Link>

        <Link to="/feedback" className="block text-left w-full bg-card rounded-lg border border-border p-4 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-md bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums leading-none text-foreground">{stats.urgentCount}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("feedbackDashboard.stats.urgentItems")}</p>
            </div>
          </div>
        </Link>

        <Link to="/feedback" className="block text-left w-full bg-card rounded-lg border border-border p-4 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-md bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
              <Reply className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums leading-none text-foreground">{stats.responseRate}%</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("feedbackDashboard.stats.responseRate")}</p>
            </div>
          </div>
        </Link>

        <Link to="/feedback" className="block text-left w-full bg-card rounded-lg border border-border p-4 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-md bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums leading-none text-foreground">
                {stats.byStatus.find((s: any) => s.status === "new")?.count || 0}
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("feedbackDashboard.stats.newUnread")}</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Category Breakdown */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t("feedbackDashboard.sections.byCategory")}</h2>
          {stats.byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("feedbackDashboard.empty.noData")}</p>
          ) : (
            <div className="space-y-3">
              {stats.byCategory.map((item: any) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground capitalize">{t(`feedbackDashboard.category.${item.category}`, { defaultValue: item.category })}</span>
                    <span className="font-medium text-foreground">{item.count}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
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
        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t("feedbackDashboard.sections.sentimentDistribution")}</h2>
          {stats.bySentiment.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("feedbackDashboard.empty.noData")}</p>
          ) : (
            <div className="space-y-3">
              {stats.bySentiment.map((item: any) => (
                <div key={item.sentiment}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground capitalize">{t(`feedbackDashboard.sentiment.${item.sentiment || "unset"}`, { defaultValue: item.sentiment || "unset" })}</span>
                    <span className="font-medium text-foreground">{item.count}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
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
      <div className="bg-card rounded-lg border border-border p-4 mb-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t("feedbackDashboard.sections.byStatus")}</h2>
        <div className="flex flex-wrap gap-3">
          {stats.byStatus.map((item: any) => {
            const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.new;
            const StatusIcon = cfg.icon;
            return (
              <div
                key={item.status}
                className={`flex items-center gap-2 px-4 py-2 rounded-md ${cfg.color}`}
              >
                <StatusIcon className="h-4 w-4" />
                <span className="text-sm font-medium">{t(`feedbackDashboard.status.${item.status}`, { defaultValue: cfg.label })}</span>
                <span className="text-sm font-bold">{item.count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Feedback */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t("feedbackDashboard.sections.recentFeedback")}</h2>
        {stats.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("feedbackDashboard.empty.noFeedback")}</p>
        ) : (
          <div className="space-y-3">
            {stats.recent.map((f: any) => {
              const statusCfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.new;
              const StatusIcon = statusCfg.icon;
              return (
                <div
                  key={f.id}
                  className={`flex items-center gap-4 p-3 rounded-md border ${
                    f.is_urgent ? "border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/30" : "border-border"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground capitalize">{t(`feedbackDashboard.category.${f.category}`, { defaultValue: f.category })}</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] ${statusCfg.color} px-2 py-0.5 rounded-md`}>
                        <StatusIcon className="h-3 w-3" />
                        {t(`feedbackDashboard.status.${f.status}`, { defaultValue: statusCfg.label })}
                      </span>
                      {f.is_urgent && (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{f.subject}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
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
