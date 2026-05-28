import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { Link, useSearchParams } from "react-router-dom";
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
          <h1 className="text-2xl font-bold text-gray-900">{t("surveys.list.title")}</h1>
          <p className="text-gray-500 mt-1">{t("surveys.list.subtitle")}</p>
        </div>
        <Link
          to="/surveys/builder"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t("surveys.list.new")}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveys.list.colTitle")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveys.list.colType")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveys.list.colStatus")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveys.list.colAnonymous")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveys.list.colResponses")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveys.list.colDates")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveys.list.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">{t("surveys.list.loading")}</td>
                </tr>
              ) : surveys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    {t("surveys.list.empty")}
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
                        {t(`surveys.list.type.${s.type}`, { defaultValue: s.type })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] || STATUS_BADGE.draft}`}>
                        {t(`surveys.list.status.${s.status}`, { defaultValue: s.status })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {s.is_anonymous ? t("surveys.list.yes") : t("surveys.list.no")}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{s.response_count}</td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {s.start_date && <div>{t("surveys.list.start", { date: new Date(s.start_date).toLocaleDateString() })}</div>}
                      {s.end_date && <div>{t("surveys.list.end", { date: new Date(s.end_date).toLocaleDateString() })}</div>}
                      {!s.start_date && !s.end_date && <span>-</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {s.status === "draft" && (
                          <>
                            <Link
                              to={`/surveys/builder?id=${s.id}`}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                              title={t("surveys.list.titleEdit")}
                            >
                              <Edit className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => publishMutation.mutate(s.id)}
                              disabled={publishMutation.isPending}
                              className="p-1.5 rounded hover:bg-green-50 text-green-600 hover:text-green-700"
                              title={t("surveys.list.titlePublish")}
                            >
                              <Play className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(t("surveys.list.confirmDelete"))) {
                                  deleteMutation.mutate(s.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-700"
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
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                              title={t("surveys.list.titleViewResults")}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => closeMutation.mutate(s.id)}
                              disabled={closeMutation.isPending}
                              className="p-1.5 rounded hover:bg-orange-50 text-orange-500 hover:text-orange-700"
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
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                              title={t("surveys.list.titleViewResults")}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => publishMutation.mutate(s.id)}
                              disabled={publishMutation.isPending}
                              className="p-1.5 rounded hover:bg-green-50 text-green-600 hover:text-green-700"
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
          <p className="text-sm text-gray-500">
            {t("surveys.list.showing", { shown: surveys.length, total: meta.total, page: meta.page, total_pages: meta.total_pages })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              {t("surveys.list.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              {t("surveys.list.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
