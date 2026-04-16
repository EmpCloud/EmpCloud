import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Briefcase, Users, AlertTriangle, TrendingUp, ChevronRight } from "lucide-react";
import api from "@/api/client";

export default function PositionDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["position-dashboard"],
    queryFn: () => api.get("/positions/dashboard").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  const stats = data || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Position Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of positions, headcount, and workforce planning.</p>
        </div>
        <Link
          to="/positions/list"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Briefcase className="h-4 w-4" />
          All Positions
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
              <p className="text-xs text-gray-500 uppercase font-medium">Total Positions</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_positions || 0}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">Budget: {stats.total_budget || 0} headcount</p>
        </Link>

        <Link to="/positions/list" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Filled</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_filled || 0}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            {stats.total_budget > 0
              ? `${Math.round((stats.total_filled / stats.total_budget) * 100)}% fill rate`
              : "No budget set"}
          </p>
        </Link>

        <Link to="/positions/vacancies" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Vacant</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_vacant || 0}</p>
            </div>
          </div>
          <span className="text-xs text-brand-600">View vacancies</span>
        </Link>

        <Link to="/positions/vacancies" className="block text-left w-full bg-white rounded-xl border border-gray-200 p-5 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Critical Vacancies</p>
              <p className="text-2xl font-bold text-gray-900">{stats.critical_vacancies || 0}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">Unfilled critical roles</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Department Breakdown</h2>
          {(stats.department_breakdown || []).length === 0 ? (
            <p className="text-sm text-gray-400">No data available</p>
          ) : (
            <div className="space-y-3">
              {(stats.department_breakdown || []).map((dept: any, i: number) => {
                const fillPct = dept.budget > 0 ? Math.round((dept.filled / dept.budget) * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{dept.department}</span>
                      <span className="text-xs text-gray-500">
                        {dept.filled}/{dept.budget} filled ({dept.vacant} vacant)
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
            <h2 className="text-lg font-semibold text-gray-900">Headcount Planning</h2>
            <Link to="/positions/headcount-plans" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              View Plans <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {stats.headcount_plan_summary?.total_planned || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Planned</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {stats.headcount_plan_summary?.total_approved || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Approved</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {stats.headcount_plan_summary?.total_current || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Current</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {stats.headcount_plan_summary?.plan_count || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Active Plans</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      {(stats.status_breakdown || []).length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Position Status</h2>
          <div className="flex gap-6">
            {(stats.status_breakdown || []).map((s: any) => (
              <div key={s.status} className="flex items-center gap-2">
                <span
                  className={`inline-block h-3 w-3 rounded-full ${
                    s.status === "active" ? "bg-green-500" : s.status === "frozen" ? "bg-amber-500" : "bg-gray-400"
                  }`}
                />
                <span className="text-sm text-gray-600 capitalize">{s.status}</span>
                <span className="text-sm font-semibold text-gray-900">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
