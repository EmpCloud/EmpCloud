import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Briefcase, AlertTriangle, MapPin, CheckCircle2 } from "lucide-react";
import api from "@/api/client";

export default function VacanciesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["position-vacancies"],
    queryFn: () => api.get("/positions/vacancies").then((r) => r.data.data),
  });

  // #1468 — "Mark as Filled" button. The underlying backend already supports
  // status transitions via PUT /positions/:id with { status: "filled" }, so we
  // reuse that endpoint rather than introducing a new one. HR-only (same RBAC
  // as the vacancies list itself, which already requires HR).
  const markFilledMutation = useMutation({
    mutationFn: (positionId: number) =>
      api.put(`/positions/${positionId}`, { status: "filled" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position-vacancies"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["position-dashboard"] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error?.message || "Failed to mark position as filled");
    },
  });

  const vacancies = data || [];

  // Group by department
  const grouped: Record<string, any[]> = {};
  for (const v of vacancies) {
    const dept = v.department_name || "Unassigned";
    if (!grouped[dept]) grouped[dept] = [];
    grouped[dept].push(v);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Open Vacancies</h1>
          <p className="text-gray-500 mt-1">
            Positions where headcount is not yet filled.
            {vacancies.length > 0 && (
              <span className="ml-2 text-brand-600 font-medium">
                {vacancies.length} position{vacancies.length !== 1 ? "s" : ""} with openings
              </span>
            )}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading vacancies...</div>
        </div>
      ) : vacancies.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No Open Vacancies</h3>
          <p className="text-sm text-gray-500 mt-1">All positions are fully staffed.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([dept, positions]) => (
            <div key={dept}>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{dept}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {positions.map((pos: any) => (
                  <div
                    key={pos.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-300 hover:shadow-sm transition-all group"
                  >
                    <Link to={`/positions/${pos.id}`} className="block">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 group-hover:text-brand-600">
                            {pos.title}
                          </h3>
                          {pos.code && (
                            <span className="text-xs font-mono text-gray-400">{pos.code}</span>
                          )}
                        </div>
                        {pos.is_critical && (
                          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                        <span className="capitalize">{(pos.employment_type || "").replace("_", " ")}</span>
                        {pos.location_name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{pos.location_name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-lg font-bold text-amber-600">{pos.open_count}</span>
                          <span className="text-xs text-gray-500 ml-1">
                            opening{pos.open_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {pos.headcount_filled}/{pos.headcount_budget} filled
                        </span>
                      </div>

                      {(pos.min_salary || pos.max_salary) && (
                        <div className="mt-2 text-xs text-gray-400">
                          {pos.currency} {pos.min_salary ? (pos.min_salary / 100).toLocaleString() : "0"} - {pos.max_salary ? (pos.max_salary / 100).toLocaleString() : "0"}
                        </div>
                      )}
                    </Link>

                    {/* #1468 — Filled button: explicitly mark this position's status
                        as filled. Useful when a role is staffed through external
                        means (contractor, fill-by-merge, etc.) and HR wants to
                        stop showing it as open. Separate from the Link so the
                        click doesn't navigate. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (
                          confirm(
                            `Mark "${pos.title}" as filled? It will be removed from the open vacancies list.`
                          )
                        ) {
                          markFilledMutation.mutate(pos.id);
                        }
                      }}
                      disabled={markFilledMutation.isPending}
                      className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {markFilledMutation.isPending && markFilledMutation.variables === pos.id
                        ? "Marking..."
                        : "Mark as Filled"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
