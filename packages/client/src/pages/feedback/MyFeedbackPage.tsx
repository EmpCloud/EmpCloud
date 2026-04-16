import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { MessageSquare, Clock, CheckCircle, AlertTriangle, Eye, Archive, Search, Pencil, X } from "lucide-react";

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

const CATEGORIES = [
  { value: "workplace", label: "Workplace" },
  { value: "management", label: "Management" },
  { value: "process", label: "Process" },
  { value: "culture", label: "Culture" },
  { value: "harassment", label: "Harassment" },
  { value: "safety", label: "Safety" },
  { value: "suggestion", label: "Suggestion" },
  { value: "other", label: "Other" },
];

// Only feedback that hasn't been responded to yet and is still in an early
// status is user-editable.
function canEdit(f: any): boolean {
  if (f?.admin_response) return false;
  return f?.status === "new" || f?.status === "acknowledged";
}

export default function MyFeedbackPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    category: "workplace",
    subject: "",
    message: "",
    is_urgent: false,
  });
  const [editError, setEditError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-feedback", page],
    queryFn: () => api.get("/feedback/my", { params: { page } }).then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: any }) =>
      api.put(`/feedback/${payload.id}`, payload.data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-feedback"] });
      setEditing(null);
      setEditError(null);
    },
    onError: (err: any) =>
      setEditError(err?.response?.data?.error?.message || "Failed to update feedback"),
  });

  const openEdit = (f: any) => {
    setEditing(f);
    setEditForm({
      category: f.category,
      subject: f.subject,
      message: f.message,
      is_urgent: !!f.is_urgent,
    });
    setEditError(null);
  };

  const feedbackList = data?.data || [];
  const meta = data?.meta;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Feedback</h1>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        View the status of your anonymously submitted feedback and any responses from HR.
      </p>

      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-20 bg-gray-200 rounded-full" />
                  <div className="h-5 w-16 bg-gray-200 rounded-full" />
                </div>
                <div className="h-5 w-48 bg-gray-200 rounded mb-2" />
                <div className="h-4 w-full bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : feedbackList.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-500 mb-1">No feedback submitted yet</p>
            <p className="text-sm text-gray-400 mb-4">Share your thoughts anonymously with HR.</p>
            <a
              href="/feedback/submit"
              className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              Submit Feedback
            </a>
          </div>
        ) : (
          feedbackList.map((f: any) => {
            const statusCfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.new;
            const StatusIcon = statusCfg.icon;
            const catColor = CATEGORY_COLORS[f.category] || CATEGORY_COLORS.other;

            return (
              <div
                key={f.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${catColor}`}>
                      {f.category}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${statusCfg.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusCfg.label}
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
                    })}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-gray-900 mb-1">{f.subject}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">{f.message}</p>

                {canEdit(f) && (
                  <div className="mb-4">
                    <button
                      onClick={() => openEdit(f)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </div>
                )}

                {f.admin_response && (
                  <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
                    <p className="text-xs font-medium text-brand-700 mb-1">HR Response</p>
                    <p className="text-sm text-brand-800">{f.admin_response}</p>
                    {f.responded_at && (
                      <p className="text-xs text-brand-500 mt-2">
                        Responded on{" "}
                        {new Date(f.responded_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => !updateMutation.isPending && setEditing(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Feedback</h3>
              <button
                onClick={() => setEditing(null)}
                className="text-gray-400 hover:text-gray-600"
                disabled={updateMutation.isPending}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={editForm.subject}
                  onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={editForm.message}
                  onChange={(e) => setEditForm({ ...editForm, message: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[120px]"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editForm.is_urgent}
                  onChange={(e) => setEditForm({ ...editForm, is_urgent: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Mark as urgent
              </label>

              {editError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {editError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditing(null)}
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  updateMutation.mutate({
                    id: editing.id,
                    data: {
                      category: editForm.category,
                      subject: editForm.subject,
                      message: editForm.message,
                      is_urgent: editForm.is_urgent,
                    },
                  })
                }
                disabled={
                  updateMutation.isPending ||
                  !editForm.subject.trim() ||
                  !editForm.message.trim()
                }
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
