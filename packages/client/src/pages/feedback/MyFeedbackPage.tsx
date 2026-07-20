import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { MessageSquare, Clock, CheckCircle, AlertTriangle, Eye, Archive, Search, Pencil, X } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  new: { label: "New", color: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300", icon: Clock },
  acknowledged: { label: "Acknowledged", color: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300", icon: Eye },
  under_review: { label: "Under Review", color: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300", icon: Search },
  resolved: { label: "Resolved", color: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300", icon: CheckCircle },
  archived: { label: "Archived", color: "bg-muted text-muted-foreground", icon: Archive },
};

const CATEGORY_COLORS: Record<string, string> = {
  workplace: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  management: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300",
  process: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300",
  culture: "bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300",
  harassment: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  safety: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  suggestion: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  other: "bg-muted text-muted-foreground",
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
  const { t } = useTranslation();
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
      setEditError(err?.response?.data?.error?.message || t("myFeedback.error.updateFailed")),
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
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("myFeedback.page.title")}</h1>
      </div>

      <p className="text-[13px] text-muted-foreground mb-6">
        {t("myFeedback.page.subtitle")}
      </p>

      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-20 bg-muted rounded-full" />
                  <div className="h-5 w-16 bg-muted rounded-full" />
                </div>
                <div className="h-5 w-48 bg-muted rounded mb-2" />
                <div className="h-4 w-full bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : feedbackList.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-base font-medium text-muted-foreground mb-1">{t("myFeedback.empty.title")}</p>
            <p className="text-sm text-muted-foreground mb-4">{t("myFeedback.empty.description")}</p>
            <a
              href="/feedback/submit"
              className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700"
            >
              {t("myFeedback.empty.submitCta")}
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
                className="bg-card rounded-lg border border-border p-4 hover:border-brand-400 transition-colors duration-150"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-md ${catColor}`}>
                      {t(`myFeedback.category.${f.category}`, { defaultValue: f.category })}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-md ${statusCfg.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {t(`myFeedback.status.${f.status}`, { defaultValue: statusCfg.label })}
                    </span>
                    {f.is_urgent && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-md bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300">
                        <AlertTriangle className="h-3 w-3" />
                        {t("myFeedback.card.urgentBadge")}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                    {new Date(f.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-foreground mb-1">{f.subject}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">{f.message}</p>

                {canEdit(f) && (
                  <div className="mb-4">
                    <button
                      onClick={() => openEdit(f)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 border border-brand-200 dark:border-brand-800 px-3 py-1.5 rounded-md hover:bg-brand-50 dark:hover:bg-brand-950/40"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("myFeedback.card.editButton")}
                    </button>
                  </div>
                )}

                {f.admin_response && (
                  <div className="bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 rounded-lg p-4">
                    <p className="text-[11px] font-medium text-brand-700 dark:text-brand-300 mb-1">{t("myFeedback.card.hrResponseLabel")}</p>
                    <p className="text-[13px] text-brand-800 dark:text-brand-200">{f.admin_response}</p>
                    {f.responded_at && (
                      <p className="text-xs text-brand-500 mt-2">
                        {t("myFeedback.card.respondedOn", {
                          date: new Date(f.responded_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }),
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
          <div className="relative bg-card rounded-lg shadow-xl max-w-lg w-full p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{t("myFeedback.editModal.title")}</h3>
              <button
                onClick={() => setEditing(null)}
                className="text-muted-foreground hover:text-muted-foreground"
                disabled={updateMutation.isPending}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t("myFeedback.editModal.categoryLabel")}</label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{t(`myFeedback.category.${c.value}`, { defaultValue: c.label })}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t("myFeedback.editModal.subjectLabel")}</label>
                <input
                  type="text"
                  value={editForm.subject}
                  onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t("myFeedback.editModal.messageLabel")}</label>
                <textarea
                  value={editForm.message}
                  onChange={(e) => setEditForm({ ...editForm, message: e.target.value })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] min-h-[120px]"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={editForm.is_urgent}
                  onChange={(e) => setEditForm({ ...editForm, is_urgent: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-red-600 dark:text-red-400 focus:ring-red-500"
                />
                <AlertTriangle className="h-4 w-4 text-red-500" />
                {t("myFeedback.editModal.markUrgent")}
              </label>

              {editError && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                  {editError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditing(null)}
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-[13px] border border-border rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                {t("myFeedback.editModal.cancel")}
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
                className="bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {updateMutation.isPending ? t("myFeedback.editModal.saving") : t("myFeedback.editModal.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-muted-foreground">
            {t("myFeedback.pagination.summary", {
              page: meta.page,
              totalPages: meta.total_pages,
              total: meta.total,
            })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            >
              {t("myFeedback.pagination.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            >
              {t("myFeedback.pagination.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
