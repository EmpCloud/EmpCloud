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
        <div className="text-muted-foreground">{tx("loadingDashboard")}</div>
      </div>
    );
  }

  const stats = data || {};

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{tx("title")}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{tx("subtitle")}</p>
        </div>
        <Link
          to="/positions/list"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-[13px] font-medium rounded-md hover:bg-brand-700 transition-colors shrink-0"
        >
          <Briefcase className="h-4 w-4" />
          {tx("allPositions")}
        </Link>
      </div>

      {/* Stat tiles — compact KPI treatment; each deep-links to a filtered list. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <Link to="/positions/list" className="group bg-card rounded-lg border border-border p-3 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <Briefcase className="h-4 w-4" />
          </span>
          <p className="mt-2.5 text-2xl font-semibold tabular-nums leading-none text-foreground">{stats.total_positions || 0}</p>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{tx("totalPositions")}</p>
          <p className="mt-1 text-[11px] text-muted-foreground truncate">{tx("budgetHeadcount", { count: stats.total_budget || 0 })}</p>
        </Link>

        {/* #1553 — Filled card deep-links to the list filtered to status=filled
            so users actually see filled positions, not every position. The
            Total Positions card above stays unfiltered (that's the point). */}
        <Link to="/positions/list?status=filled" className="group bg-card rounded-lg border border-border p-3 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400">
            <Users className="h-4 w-4" />
          </span>
          <p className="mt-2.5 text-2xl font-semibold tabular-nums leading-none text-foreground">{stats.total_filled || 0}</p>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{tx("filled")}</p>
          <p className="mt-1 text-[11px] text-muted-foreground truncate">
            {stats.total_budget > 0
              ? tx("fillRate", { pct: Math.round((stats.total_filled / stats.total_budget) * 100) })
              : tx("noBudget")}
          </p>
        </Link>

        <Link to="/positions/vacancies" className="group bg-card rounded-lg border border-border p-3 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <TrendingUp className="h-4 w-4" />
          </span>
          <p className="mt-2.5 text-2xl font-semibold tabular-nums leading-none text-foreground">{stats.total_vacant || 0}</p>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{tx("vacant")}</p>
          <p className="mt-1 text-[11px] text-brand-600 dark:text-brand-400 group-hover:underline">{tx("viewVacancies")}</p>
        </Link>

        <Link to="/positions/vacancies" className="group bg-card rounded-lg border border-border p-3 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <p className="mt-2.5 text-2xl font-semibold tabular-nums leading-none text-foreground">{stats.critical_vacancies || 0}</p>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{tx("criticalVacancies")}</p>
          <p className="mt-1 text-[11px] text-muted-foreground truncate">{tx("unfilledCritical")}</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department Breakdown */}
        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <header className="px-4 py-2.5 border-b border-border">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tx("departmentBreakdown")}</h2>
          </header>
          <div className="p-4">
          {(stats.department_breakdown || []).length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{tx("noData")}</p>
          ) : (
            <div className="space-y-3">
              {(stats.department_breakdown || []).map((dept: any, i: number) => {
                const fillPct = dept.budget > 0 ? Math.round((dept.filled / dept.budget) * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-medium text-foreground truncate">{dept.department}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground shrink-0 ml-2">
                        {tx("filledVacantRatio", { filled: dept.filled, budget: dept.budget, vacant: dept.vacant })}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
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
        </section>

        {/* Headcount Plan Summary */}
        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <header className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tx("headcountPlanning")}</h2>
            <Link to="/positions/headcount-plans" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-0.5">
              {tx("viewPlans")} <ChevronRight className="h-3 w-3" />
            </Link>
          </header>
          <div className="grid grid-cols-2 gap-2.5 p-4">
            <div className="rounded-md border border-border bg-muted/50 px-3 py-3 text-center">
              <p className="text-2xl font-semibold tabular-nums leading-none text-foreground">
                {stats.headcount_plan_summary?.total_planned || 0}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mt-1.5">{tx("planned")}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/50 px-3 py-3 text-center">
              <p className="text-2xl font-semibold tabular-nums leading-none text-foreground">
                {stats.headcount_plan_summary?.total_approved || 0}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mt-1.5">{tx("approved")}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/50 px-3 py-3 text-center">
              <p className="text-2xl font-semibold tabular-nums leading-none text-foreground">
                {stats.headcount_plan_summary?.total_current || 0}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mt-1.5">{tx("current")}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/50 px-3 py-3 text-center">
              <p className="text-2xl font-semibold tabular-nums leading-none text-foreground">
                {stats.headcount_plan_summary?.plan_count || 0}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mt-1.5">{tx("activePlans")}</p>
            </div>
          </div>
        </section>
      </div>

      {/* Status Breakdown */}
      {/* #1543 — make each status row a Link so clicking it filters the list
          to that status. Previously rendered as inert spans. Whitelist of
          statuses matches positionStatusEnum on the backend. */}
      {(stats.status_breakdown || []).length > 0 && (
        <section className="mt-4 bg-card rounded-lg border border-border overflow-hidden">
          <header className="px-4 py-2.5 border-b border-border">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tx("positionStatus")}</h2>
          </header>
          <div className="flex flex-wrap gap-2 p-4">
            {(stats.status_breakdown || []).map((s: any) => (
              <Link
                key={s.status}
                to={`/positions/list?status=${encodeURIComponent(s.status)}`}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-950/30 transition-colors"
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    s.status === "active" ? "bg-green-500" : s.status === "frozen" ? "bg-amber-500" : "bg-gray-400"
                  }`}
                />
                {/* Reuse the localized status labels from positions.list so the
                    capitalized status word matches what the list page shows. */}
                <span className="text-[13px] text-muted-foreground">
                  {t(`positions.list.status${s.status.charAt(0).toUpperCase()}${s.status.slice(1)}`, { defaultValue: s.status }) as string}
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-foreground">{s.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
