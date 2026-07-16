import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-green-600 dark:text-green-400",
  neutral: "text-muted-foreground",
  negative: "text-red-600 dark:text-red-400",
};

const CATEGORIES = [
  "workplace", "management", "process", "culture", "harassment", "safety", "suggestion", "other",
];
const STATUSES = ["new", "acknowledged", "under_review", "resolved", "archived"];

export default function FeedbackListPage() {
  const { t } = useTranslation();
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
      setDeleteError(err?.response?.data?.error?.message || t("feedback.list.deleteFailed")),
  });

  const feedbackList = data?.data || [];
  const meta = data?.meta;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("feedback.list.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("feedback.list.subtitle")}</p>
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
              className={`bg-card rounded-xl border p-4 text-left transition-shadow hover:shadow-md ${
                active ? "border-brand-400 ring-1 ring-brand-200" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                  <Icon className="h-3 w-3" />
                  {t(`feedback.list.status.${s}`)}
                </span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {statusCounts[s] ?? 0}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4 mb-6">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" /> {t("feedback.list.filters")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="bg-card text-foreground px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">{t("feedback.list.allCategories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`feedback.list.category.${c}`)}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-card text-foreground px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">{t("feedback.list.allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`feedback.list.status.${s}`)}</option>
            ))}
          </select>

          <label className="bg-card text-foreground flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={urgentOnly}
              onChange={(e) => { setUrgentOnly(e.target.checked); setPage(1); }}
              className="h-4 w-4 rounded border-border text-red-600 dark:text-red-400 focus:ring-red-500"
            />
            <AlertTriangle className="h-4 w-4 text-red-500" />
            {t("feedback.list.urgentOnly")}
          </label>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder={t("feedback.list.searchPlaceholder")}
              className="bg-card text-foreground w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Feedback Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
            {t("feedback.list.loading")}
          </div>
        ) : feedbackList.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>{t("feedback.list.empty")}</p>
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
                className={`bg-card rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${
                  f.is_urgent ? "border-red-300" : "border-border"
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${catColor}`}>
                        {t(`feedback.list.category.${f.category}`, { defaultValue: f.category })}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${statusCfg.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {t(`feedback.list.status.${f.status}`, { defaultValue: statusCfg.label })}
                      </span>
                      <span className={`text-xs font-medium ${sentimentColor}`}>
                        {t(`feedback.list.sentiment.${f.sentiment}`, { defaultValue: f.sentiment })}
                      </span>
                      {f.is_urgent && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300">
                          <AlertTriangle className="h-3 w-3" />
                          {t("feedback.list.urgent")}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(f.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-foreground mb-1">{f.subject}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">{f.message}</p>

                  {f.admin_response && (
                    <div className="bg-brand-50 dark:bg-brand-950/40 border border-brand-200 rounded-lg p-3 mb-4">
                      <p className="text-xs font-medium text-brand-700 dark:text-brand-300 mb-1">{t("feedback.list.hrResponse")}</p>
                      <p className="text-sm text-brand-800 dark:text-brand-200">{f.admin_response}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setRespondingTo(f); setResponseText(f.admin_response || ""); }}
                      className="flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-950/40"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      {f.admin_response ? t("feedback.list.editResponse") : t("feedback.list.respond")}
                    </button>
                    <button
                      onClick={() => { setStatusUpdateId(f.id); setNewStatus(f.status); }}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted"
                    >
                      {t("feedback.list.updateStatus")}
                    </button>
                    {isHR && (
                      <button
                        onClick={() => { setDeleteTarget({ id: f.id, subject: f.subject }); setDeleteError(null); }}
                        className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("feedback.list.delete")}
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
          <p className="text-sm text-muted-foreground">
            {t("feedback.list.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-card text-foreground px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50"
            >
              {t("feedback.list.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="bg-card text-foreground px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50"
            >
              {t("feedback.list.next")}
            </button>
          </div>
        </div>
      )}

      {/* Respond Modal */}
      {respondingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRespondingTo(null)} />
          <div className="relative bg-card rounded-xl shadow-xl max-w-lg w-full p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{t("feedback.list.respondTitle")}</h3>
              <button onClick={() => setRespondingTo(null)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-4 bg-muted rounded-lg p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">{t(`feedback.list.category.${respondingTo.category}`, { defaultValue: respondingTo.category })} - {respondingTo.subject}</p>
              <p className="text-sm text-muted-foreground line-clamp-3">{respondingTo.message}</p>
            </div>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[120px] mb-4"
              placeholder={t("feedback.list.responsePlaceholder")}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRespondingTo(null)}
                className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:bg-muted"
              >
                {t("feedback.list.cancel")}
              </button>
              <button
                onClick={() => respondMutation.mutate({ id: respondingTo.id, admin_response: responseText })}
                disabled={respondMutation.isPending || !responseText.trim()}
                className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                <Reply className="h-4 w-4" />
                {respondMutation.isPending ? t("feedback.list.sending") : t("feedback.list.sendResponse")}
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
            className="w-full max-w-md rounded-xl bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{t("feedback.list.deleteTitle")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("feedback.list.deleteConfirm", { subject: deleteTarget.subject })}
                  </p>
                </div>
              </div>
            </div>
            {deleteError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-border bg-muted px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-card disabled:opacity-50"
              >
                {t("feedback.list.cancel")}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("feedback.list.deleting")}
                  </>
                ) : (
                  t("feedback.list.delete")
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
          <div className="relative bg-card rounded-xl shadow-xl max-w-sm w-full p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{t("feedback.list.updateStatusTitle")}</h3>
              <button onClick={() => setStatusUpdateId(null)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm mb-4"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{t(`feedback.list.status.${s}`)}</option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStatusUpdateId(null)}
                className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:bg-muted"
              >
                {t("feedback.list.cancel")}
              </button>
              <button
                onClick={() => statusMutation.mutate({ id: statusUpdateId, status: newStatus })}
                disabled={statusMutation.isPending}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {statusMutation.isPending ? t("feedback.list.updating") : t("feedback.list.update")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
