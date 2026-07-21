import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { ShieldAlert, FileText, Clock, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-blue-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  under_investigation: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  escalated: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  resolved: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  dismissed: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
};

export default function WhistleblowingDashboardPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["whistleblowing-dashboard"],
    queryFn: () => api.get("/whistleblowing/dashboard").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-brand-600 dark:text-brand-400" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("whistleblowingDashboard.header.title")}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">{t("whistleblowingDashboard.header.subtitle")}</p>
          </div>
        </div>
        <Link
          to="/whistleblowing/reports"
          className="px-4 py-2 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition text-[13px] font-medium"
        >
          {t("whistleblowingDashboard.header.viewAllReports")}
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Link to="/whistleblowing/reports" className="block text-left w-full bg-card rounded-lg shadow-sm border p-5 hover:border-brand-400 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <span className="text-[13px] text-muted-foreground">{t("whistleblowingDashboard.stats.totalReports")}</span>
          </div>
          <p className="text-3xl font-semibold tabular-nums text-foreground">{data.total}</p>
        </Link>
        <Link to="/whistleblowing/reports" className="block text-left w-full bg-card rounded-lg shadow-sm border p-5 hover:border-brand-400 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            <span className="text-[13px] text-muted-foreground">{t("whistleblowingDashboard.stats.open")}</span>
          </div>
          <p className="text-3xl font-semibold tabular-nums text-yellow-600 dark:text-yellow-400">{data.open}</p>
        </Link>
        <Link to="/whistleblowing/reports" className="block text-left w-full bg-card rounded-lg shadow-sm border p-5 hover:border-brand-400 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-[13px] text-muted-foreground">{t("whistleblowingDashboard.stats.resolved")}</span>
          </div>
          <p className="text-3xl font-semibold tabular-nums text-green-600 dark:text-green-400">{data.resolved}</p>
        </Link>
        <Link to="/whistleblowing/reports" className="block text-left w-full bg-card rounded-lg shadow-sm border p-5 hover:border-brand-400 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-5 w-5 text-brand-500" />
            <span className="text-[13px] text-muted-foreground">{t("whistleblowingDashboard.stats.avgResolution")}</span>
          </div>
          <p className="text-3xl font-semibold tabular-nums text-foreground">
            {data.avg_resolution_days !== null
              ? t("whistleblowingDashboard.stats.avgResolutionDays", { count: data.avg_resolution_days })
              : t("whistleblowingDashboard.stats.noValue")}
          </p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* By Severity */}
        <div className="bg-card rounded-lg shadow-sm border p-5">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t("whistleblowingDashboard.section.bySeverity")}</h3>
          <div className="space-y-3">
            {data.by_severity?.map((item: { severity: string; count: number }) => (
              <div key={item.severity} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${SEVERITY_COLOR[item.severity] || "bg-muted-foreground/40"}`} />
                  <span className="text-[13px] text-muted-foreground capitalize">{t(`whistleblowingDashboard.severity.${item.severity}`, { defaultValue: item.severity })}</span>
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-foreground">{Number(item.count)}</span>
              </div>
            ))}
            {(!data.by_severity || data.by_severity.length === 0) && (
              <p className="text-[13px] text-muted-foreground">{t("whistleblowingDashboard.empty.noData")}</p>
            )}
          </div>
        </div>

        {/* By Category */}
        <div className="bg-card rounded-lg shadow-sm border p-5">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">{t("whistleblowingDashboard.section.byCategory")}</h3>
          <div className="space-y-3">
            {data.by_category?.map((item: { category: string; count: number }) => (
              <div key={item.category} className="flex items-center justify-between">
                <span className="text-[13px] text-muted-foreground capitalize">{t(`whistleblowingDashboard.category.${item.category}`, { defaultValue: item.category.replace(/_/g, " ") })}</span>
                <span className="text-[13px] font-semibold tabular-nums text-foreground">{Number(item.count)}</span>
              </div>
            ))}
            {(!data.by_category || data.by_category.length === 0) && (
              <p className="text-[13px] text-muted-foreground">{t("whistleblowingDashboard.empty.noData")}</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Reports */}
      <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
        <div className="p-5 border-b">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("whistleblowingDashboard.section.recentReports")}</h3>
        </div>
        {data.recent && data.recent.length > 0 ? (
          <table className="w-full">
            <thead className="bg-muted text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5 text-left">{t("whistleblowingDashboard.table.caseNumber")}</th>
                <th className="px-4 py-2.5 text-left">{t("whistleblowingDashboard.table.category")}</th>
                <th className="px-4 py-2.5 text-left">{t("whistleblowingDashboard.table.severity")}</th>
                <th className="px-4 py-2.5 text-left">{t("whistleblowingDashboard.table.subject")}</th>
                <th className="px-4 py-2.5 text-left">{t("whistleblowingDashboard.table.status")}</th>
                <th className="px-4 py-2.5 text-left">{t("whistleblowingDashboard.table.date")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.recent.map((r: { id: number; case_number: string; category: string; severity: string; subject: string; status: string; created_at: string }) => (
                <tr key={r.id} className="hover:bg-muted">
                  <td className="px-4 py-2.5">
                    <Link to={`/whistleblowing/reports/${r.id}`} className="font-mono text-[13px] tabular-nums text-brand-600 dark:text-brand-400 hover:underline">
                      {r.case_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground capitalize">{t(`whistleblowingDashboard.category.${r.category}`, { defaultValue: r.category.replace(/_/g, " ") })}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      r.severity === "critical" ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300" :
                      r.severity === "high" ? "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300" :
                      r.severity === "medium" ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300" :
                      "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                    }`}>
                      {t(`whistleblowingDashboard.severity.${r.severity}`, { defaultValue: r.severity })}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-foreground max-w-xs truncate">{r.subject}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_BADGE[r.status] || ""}`}>
                      {t(`whistleblowingDashboard.status.${r.status}`, { defaultValue: r.status.replace(/_/g, " ") })}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>{t("whistleblowingDashboard.empty.noReports")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
