import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import {
  MessageSquare,
  Clock,
  CheckCircle,
  AlertTriangle,
  Eye,
  Archive,
  Search,
  Filter,
  Reply,
  Trash2,
  Loader2,
  X,
} from "lucide-react";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-700", icon: Clock },
  acknowledged: { label: "Acknowledged", color: "bg-yellow-100 text-yellow-700", icon: Eye },
  under_review: { label: "Under Review", color: "bg-purple-100 text-purple-700", icon: Search },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-700", icon: CheckCircle },
  archived: { label: "Archived", color: "bg-gray-100 text-gray-600", icon: Archive },
};

const CATEGORY_COLORS: Record<string, string> = {
  workplace: "bg-blue-50 text-blue-700",
  management: "bg-indigo-50 text-indigo-700",
  process: "bg-cyan-50 text-cyan-700",
  culture: "bg-pink-50 text-pink-700",
  harassment: "bg-red-50 text-red-700",
  safety: "bg-orange-50 text-orange-700",
  suggestion: "bg-green-50 text-green-700",
  other: "bg-gray-50 text-gray-600",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-green-600",
  neutral: "text-gray-500",
  negative: "text-red-600",
};

const CATEGORIES = [
  "workplace", "management", "process", "culture", "harassment", "safety", "suggestion", "other",
];
const STATUSES = ["new", "acknowledged", "under_review", "resolved", "archived"];

export default function FeedbackListPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isHR = !!(user && HR_ROLES.includes(user.role));
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Respond modal state
  const [respondingTo, setRespondingTo] = useState<any>(null);
  const [responseText, setResponseText] = useState("");

  // Status update modal state
  const [statusUpdateId, setStatusUpdateId] = useState<number | null>(null);
  const [newStatus, setNewStatus] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; subject: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["feedback-list", page, categoryFilter, statusFilter, urgentOnly, searchTerm],
    queryFn: () =>
      api
        .get("/feedback", {
          params: {
            page,
            category: categoryFilter || undefined,
            status: statusFilter || undefined,
            is_urgent: urgentOnly ? true : undefined,
            search: searchTerm || undefined,
          },
        })
        .then((r) => r.data),
  });

  const { data: dashboardData } = useQuery({
    queryKey: ["feedback-list-stats"],
    queryFn: () => api.get("/feedback/dashboard").then((r) => r.data),
  });

  const statusCounts: Record<string, number> = {};
  const byStatus = dashboardData?.data?.byStatus || [];
  for (const row of byStatus) {
    statusCounts[row.status] = Number(row.count) || 0;
  }

  const respondMutation = useMutation({
    mutationFn: ({ id, admin_response }: { id: number; admin_response: string }) =>
      api.post(`/feedback/${id}/respond`, { admin_response }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback-list"] });
      qc.invalidateQueries({ queryKey: ["feedback-list-stats"] });
      setRespondingTo(null);
      setResponseText("");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.put(`/feedback/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback-list"] });
      qc.invalidateQueries({ queryKey: ["feedback-list-stats"] });
      setStatusUpdateId(null);
      setNewStatus("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/feedback/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback-list"] });
      qc.invalidateQueries({ queryKey: ["feedback-list-stats"] });
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: (err: any) =>
      setDeleteError(err?.response?.data?.error?.message || "Failed to delete feedback"),
  });

  const feedbackList = data?.data || [];
  const meta = data?.meta;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Feedback</h1>
          <p className="text-gray-500 mt-1">Anonymous feedback from employees. No identities are revealed.</p>
        </div>
      </div>

      {/* Status Count Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(["new", "acknowledged", "under_review", "resolved"] as const).map((s) => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatusFilter(active ? "" : s);
                setPage(1);
              }}
              className={`bg-white rounded-xl border p-4 text-left transition-shadow hover:shadow-md ${
                active ? "border-brand-400 ring-1 ring-brand-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                  <Icon className="h-3 w-3" />
                  {cfg.label}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {statusCounts[s] ?? 0}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
          <Filter className="h-4 w-4" /> Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={urgentOnly}
              onChange={(e) => { setUrgentOnly(e.target.checked); setPage(1); }}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Urgent Only
          </label>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Search feedback..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Feedback Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            Loading feedback...
          </div>
        ) : feedbackList.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>No feedback matches the current filters.</p>
          </div>
        ) : (
          feedbackList.map((f: any) => {
            const statusCfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.new;
            const StatusIcon = statusCfg.icon;
            const catColor = CATEGORY_COLORS[f.category] || CATEGORY_COLORS.other;
            const sentimentColor = SENTIMENT_COLORS[f.sentiment] || SENTIMENT_COLORS.neutral;

            return (
              <div
                key={f.id}
                className={`bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${
                  f.is_urgent ? "border-red-300" : "border-gray-200"
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${catColor}`}>
                        {f.category}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${statusCfg.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </span>
                      <span className={`text-xs font-medium ${sentimentColor}`}>
                        {f.sentiment}
                      </span>
                      {f.is_urgent && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
                          <AlertTriangle className="h-3 w-3" />
                          Urgent
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(f.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-gray-900 mb-1">{f.subject}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">{f.message}</p>

                  {f.admin_response && (
                    <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 mb-4">
                      <p className="text-xs font-medium text-brand-700 mb-1">HR Response</p>
                      <p className="text-sm text-brand-800">{f.admin_response}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setRespondingTo(f); setResponseText(f.admin_response || ""); }}
                      className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      {f.admin_response ? "Edit Response" : "Respond"}
                    </button>
                    <button
                      onClick={() => { setStatusUpdateId(f.id); setNewStatus(f.status); }}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                    >
                      Update Status
                    </button>
                    {isHR && (
                      <button
                        onClick={() => { setDeleteTarget({ id: f.id, subject: f.subject }); setDeleteError(null); }}
                        className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.total_pages} ({meta.total} total)
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

      {/* Respond Modal */}
      {respondingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRespondingTo(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Respond to Feedback</h3>
              <button onClick={() => setRespondingTo(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-4 bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 mb-1">{respondingTo.category} - {respondingTo.subject}</p>
              <p className="text-sm text-gray-700 line-clamp-3">{respondingTo.message}</p>
            </div>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[120px] mb-4"
              placeholder="Write your response. This will be visible to the anonymous submitter."
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRespondingTo(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => respondMutation.mutate({ id: respondingTo.id, admin_response: responseText })}
                disabled={respondMutation.isPending || !responseText.trim()}
                className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                <Reply className="h-4 w-4" />
                {respondMutation.isPending ? "Sending..." : "Send Response"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteMutation.isPending && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Delete feedback?</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Delete{" "}
                    <span className="font-medium text-gray-700">{deleteTarget.subject}</span>?
                    This cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            {deleteError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {statusUpdateId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setStatusUpdateId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Update Status</h3>
              <button onClick={() => setStatusUpdateId(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStatusUpdateId(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => statusMutation.mutate({ id: statusUpdateId, status: newStatus })}
                disabled={statusMutation.isPending}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {statusMutation.isPending ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
