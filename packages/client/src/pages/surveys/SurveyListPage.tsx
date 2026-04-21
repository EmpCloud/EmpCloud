import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { Link } from "react-router-dom";
import { Plus, Trash2, Play, Square, Eye, Edit } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  closed: "bg-blue-100 text-blue-700",
  archived: "bg-gray-100 text-gray-500",
};

const TYPE_BADGE: Record<string, string> = {
  pulse: "bg-purple-100 text-purple-700",
  enps: "bg-indigo-100 text-indigo-700",
  engagement: "bg-teal-100 text-teal-700",
  custom: "bg-gray-100 text-gray-700",
  onboarding: "bg-orange-100 text-orange-700",
  exit_survey: "bg-red-100 text-red-700",
};

export default function SurveyListPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["surveys", page, statusFilter, typeFilter],
    queryFn: () =>
      api
        .get("/surveys", {
          params: {
            page,
            per_page: 20,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(typeFilter ? { type: typeFilter } : {}),
          },
        })
        .then((r) => r.data),
  });

  const publishMutation = useMutation({
    mutationFn: (id: number) => api.post(`/surveys/${id}/publish`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/surveys/${id}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/surveys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
    },
  });

  const surveys = data?.data || [];
  const meta = data?.meta;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Surveys</h1>
          <p className="text-gray-500 mt-1">Manage your employee surveys.</p>
        </div>
        <Link
          to="/surveys/builder"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New Survey
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Types</option>
          <option value="pulse">Pulse</option>
          <option value="enps">eNPS</option>
          <option value="engagement">Engagement</option>
          <option value="custom">Custom</option>
          <option value="onboarding">Onboarding</option>
          <option value="exit_survey">Exit Survey</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Anonymous</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Responses</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Dates</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">Loading...</td>
                </tr>
              ) : surveys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    No surveys found. Create your first survey to get started.
                  </td>
                </tr>
              ) : (
                surveys.map((s: any) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{s.title}</p>
                      {s.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{s.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE[s.type] || TYPE_BADGE.custom}`}>
                        {s.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] || STATUS_BADGE.draft}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {s.is_anonymous ? "Yes" : "No"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{s.response_count}</td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {s.start_date && <div>Start: {new Date(s.start_date).toLocaleDateString()}</div>}
                      {s.end_date && <div>End: {new Date(s.end_date).toLocaleDateString()}</div>}
                      {!s.start_date && !s.end_date && <span>-</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {s.status === "draft" && (
                          <>
                            <Link
                              to={`/surveys/builder?id=${s.id}`}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => publishMutation.mutate(s.id)}
                              disabled={publishMutation.isPending}
                              className="p-1.5 rounded hover:bg-green-50 text-green-600 hover:text-green-700"
                              title="Publish"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm("Delete this draft survey?")) {
                                  deleteMutation.mutate(s.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-700"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {s.status === "active" && (
                          <>
                            <Link
                              to={`/surveys/${s.id}/results`}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                              title="View Results"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => closeMutation.mutate(s.id)}
                              disabled={closeMutation.isPending}
                              className="p-1.5 rounded hover:bg-orange-50 text-orange-500 hover:text-orange-700"
                              title="Close Survey"
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {s.status === "closed" && (
                          <>
                            <Link
                              to={`/surveys/${s.id}/results`}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                              title="View Results"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => publishMutation.mutate(s.id)}
                              disabled={publishMutation.isPending}
                              className="p-1.5 rounded hover:bg-green-50 text-green-600 hover:text-green-700"
                              title="Re-publish"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          {/* #1533 — Show the per-page count alongside the total so admins can
              tell at a glance how many surveys are in view, not just the total. */}
          <p className="text-sm text-gray-500">
            Showing {surveys.length} of {meta.total} surveys &middot; Page {meta.page} of {meta.total_pages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
