import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Trash2, Play, Square, Eye, Edit } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  closed: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  archived: "bg-muted text-muted-foreground",
};

const TYPE_BADGE: Record<string, string> = {
  pulse: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  enps: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300",
  engagement: "bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300",
  custom: "bg-muted text-muted-foreground",
  onboarding: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  exit_survey: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

export default function SurveyListPage() {
  const { t } = useTranslation();
  // #1532 — Seed statusFilter from ?status= so deep-links from the Survey
  // Dashboard top cards land on the matching filter instead of the full list.
  // Whitelisted against known values.
  const [searchParams] = useSearchParams();
  const initialStatus = (() => {
    const raw = searchParams.get("status") || "";
    return ["draft", "active", "closed", "archived"].includes(raw) ? raw : "";
  })();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [typeFilter, setTypeFilter] = useState("");
  // Confirm-delete dialog state (replaces window.confirm for deleting a draft).
  const [deleteSurveyId, setDeleteSurveyId] = useState<number | null>(null);
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
      setDeleteSurveyId(null);
    },
  });

  const surveys = data?.data || [];
  const meta = data?.meta;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("surveys.list.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("surveys.list.subtitle")}</p>
        </div>
        <Link
          to="/surveys/builder"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t("surveys.list.new")}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-card text-foreground px-3 py-2 border border-border rounded-md text-[13px]"
        >
          <option value="">{t("surveys.list.allStatuses")}</option>
          <option value="draft">{t("surveys.list.status.draft")}</option>
          <option value="active">{t("surveys.list.status.active")}</option>
          <option value="closed">{t("surveys.list.status.closed")}</option>
          <option value="archived">{t("surveys.list.status.archived")}</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-card text-foreground px-3 py-2 border border-border rounded-md text-[13px]"
        >
          <option value="">{t("surveys.list.allTypes")}</option>
          <option value="pulse">{t("surveys.list.type.pulse")}</option>
          <option value="enps">{t("surveys.list.type.enps")}</option>
          <option value="engagement">{t("surveys.list.type.engagement")}</option>
          <option value="custom">{t("surveys.list.type.custom")}</option>
          <option value="onboarding">{t("surveys.list.type.onboarding")}</option>
          <option value="exit_survey">{t("surveys.list.type.exit_survey")}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveys.list.colTitle")}</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveys.list.colType")}</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveys.list.colStatus")}</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveys.list.colAnonymous")}</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveys.list.colResponses")}</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveys.list.colDates")}</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("surveys.list.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">{t("surveys.list.loading")}</td>
                </tr>
              ) : surveys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                    {t("surveys.list.empty")}
                  </td>
                </tr>
              ) : (
                surveys.map((s: any) => (
                  <tr key={s.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{s.title}</p>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md ${TYPE_BADGE[s.type] || TYPE_BADGE.custom}`}>
                        {t(`surveys.list.type.${s.type}`, { defaultValue: s.type })}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md ${STATUS_BADGE[s.status] || STATUS_BADGE.draft}`}>
                        {t(`surveys.list.status.${s.status}`, { defaultValue: s.status })}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {s.is_anonymous ? t("surveys.list.yes") : t("surveys.list.no")}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.response_count}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {s.start_date && <div>{t("surveys.list.start", { date: new Date(s.start_date).toLocaleDateString() })}</div>}
                      {s.end_date && <div>{t("surveys.list.end", { date: new Date(s.end_date).toLocaleDateString() })}</div>}
                      {!s.start_date && !s.end_date && <span>-</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {s.status === "draft" && (
                          <>
                            <Link
                              to={`/surveys/builder?id=${s.id}`}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title={t("surveys.list.titleEdit")}
                            >
                              <Edit className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => publishMutation.mutate(s.id)}
                              disabled={publishMutation.isPending}
                              className="p-1.5 rounded hover:bg-green-50 dark:hover:bg-green-950/40 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                              title={t("surveys.list.titlePublish")}
                            >
                              <Play className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteSurveyId(s.id)}
                              disabled={deleteMutation.isPending}
                              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 hover:text-red-700 dark:hover:text-red-300"
                              title={t("surveys.list.titleDelete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {s.status === "active" && (
                          <>
                            <Link
                              to={`/surveys/${s.id}/results`}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title={t("surveys.list.titleViewResults")}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => closeMutation.mutate(s.id)}
                              disabled={closeMutation.isPending}
                              className="p-1.5 rounded hover:bg-orange-50 dark:hover:bg-orange-950/40 text-orange-500 hover:text-orange-700 dark:hover:text-orange-300"
                              title={t("surveys.list.titleClose")}
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {s.status === "closed" && (
                          <>
                            <Link
                              to={`/surveys/${s.id}/results`}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title={t("surveys.list.titleViewResults")}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => publishMutation.mutate(s.id)}
                              disabled={publishMutation.isPending}
                              className="p-1.5 rounded hover:bg-green-50 dark:hover:bg-green-950/40 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                              title={t("surveys.list.titleRepublish")}
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
          <p className="text-[13px] tabular-nums text-muted-foreground">
            {t("surveys.list.showing", { shown: surveys.length, total: meta.total, page: meta.page, total_pages: meta.total_pages })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            >
              {t("surveys.list.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            >
              {t("surveys.list.next")}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteSurveyId !== null}
        title="Delete this draft survey?"
        description="This draft survey will be permanently removed. This cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteSurveyId !== null && deleteMutation.mutate(deleteSurveyId)}
        onCancel={() => setDeleteSurveyId(null)}
      />
    </div>
  );
}
