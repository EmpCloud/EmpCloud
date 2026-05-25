import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Briefcase, Users, AlertTriangle, TrendingUp, ChevronRight } from "lucide-react";
import api from "@/api/client";

export default function PositionDashboardPage() {
  const { t } = useTranslation();
  const tx = (k: string, opts?: Record<string, unknown>) =>
    t(`positions.dashboard.${k}`, opts ?? {});
  const { data, isLoading } = useQuery({
    queryKey: ["position-dashboard"],
    queryFn: () => api.get("/positions/dashboard").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">{tx("loadingDashboard")}</div>
      </div>
    );
  }

  const stats = data || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{tx("title")}</h1>
          <p className="text-gray-500 mt-1">{tx("subtitle")}</p>
        </div>
        <Link
          to="/positions/list"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Briefcase className="h-4 w-4" />
          {tx("allPositions")}
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link to="/positions/list" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">{tx("totalPositions")}</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_positions || 0}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">{tx("budgetHeadcount", { count: stats.total_budget || 0 })}</p>
        </Link>

        {/* #1553 — Filled card deep-links to the list filtered to status=filled
            so users actually see filled positions, not every position. The
            Total Positions card above stays unfiltered (that's the point). */}
        <Link to="/positions/list?status=filled" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">{tx("filled")}</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_filled || 0}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            {stats.total_budget > 0
              ? tx("fillRate", { pct: Math.round((stats.total_filled / stats.total_budget) * 100) })
              : tx("noBudget")}
          </p>
        </Link>

        <Link to="/positions/vacancies" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">{tx("vacant")}</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_vacant || 0}</p>
            </div>
          </div>
          <span className="text-xs text-brand-600">{tx("viewVacancies")}</span>
        </Link>

        <Link to="/positions/vacancies" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">{tx("criticalVacancies")}</p>
              <p className="text-2xl font-bold text-gray-900">{stats.critical_vacancies || 0}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">{tx("unfilledCritical")}</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{tx("departmentBreakdown")}</h2>
          {(stats.department_breakdown || []).length === 0 ? (
            <p className="text-sm text-gray-400">{tx("noData")}</p>
          ) : (
            <div className="space-y-3">
              {(stats.department_breakdown || []).map((dept: any, i: number) => {
                const fillPct = dept.budget > 0 ? Math.round((dept.filled / dept.budget) * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{dept.department}</span>
                      <span className="text-xs text-gray-500">
                        {tx("filledVacantRatio", { filled: dept.filled, budget: dept.budget, vacant: dept.vacant })}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          fillPct >= 90 ? "bg-green-500" : fillPct >= 60 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Headcount Plan Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{tx("headcountPlanning")}</h2>
            <Link to="/positions/headcount-plans" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              {tx("viewPlans")} <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {stats.headcount_plan_summary?.total_planned || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">{tx("planned")}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {stats.headcount_plan_summary?.total_approved || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">{tx("approved")}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {stats.headcount_plan_summary?.total_current || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">{tx("current")}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {stats.headcount_plan_summary?.plan_count || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">{tx("activePlans")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      {/* #1543 — make each status row a Link so clicking it filters the list
          to that status. Previously rendered as inert spans. Whitelist of
          statuses matches positionStatusEnum on the backend. */}
      {(stats.status_breakdown || []).length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{tx("positionStatus")}</h2>
          <div className="flex flex-wrap gap-3">
            {(stats.status_breakdown || []).map((s: any) => (
              <Link
                key={s.status}
                to={`/positions/list?status=${encodeURIComponent(s.status)}`}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <span
                  className={`inline-block h-3 w-3 rounded-full ${
                    s.status === "active" ? "bg-green-500" : s.status === "frozen" ? "bg-amber-500" : "bg-gray-400"
                  }`}
                />
                {/* Reuse the localized status labels from positions.list so the
                    capitalized status word matches what the list page shows. */}
                <span className="text-sm text-gray-600">
                  {t(`positions.list.status${s.status.charAt(0).toUpperCase()}${s.status.slice(1)}`, { defaultValue: s.status }) as string}
                </span>
                <span className="text-sm font-semibold text-gray-900">{s.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
