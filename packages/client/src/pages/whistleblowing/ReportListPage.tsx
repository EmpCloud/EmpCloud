import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { Link } from "react-router-dom";
import { ShieldAlert, Search, Filter } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  under_investigation: "bg-yellow-100 text-yellow-700",
  escalated: "bg-orange-100 text-orange-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-600",
  closed: "bg-gray-100 text-gray-500",
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const STATUSES = ["submitted", "under_investigation", "escalated", "resolved", "dismissed", "closed"];
const CATEGORIES = [
  "fraud", "corruption", "harassment", "discrimination", "safety_violation",
  "data_breach", "financial_misconduct", "environmental", "retaliation", "other",
];
const SEVERITIES = ["low", "medium", "high", "critical"];

export default function ReportListPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["whistleblowing-reports", page, statusFilter, categoryFilter, severityFilter, search],
    queryFn: () =>
      api
        .get("/whistleblowing/reports", {
          params: {
            page,
            per_page: 20,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(categoryFilter ? { category: categoryFilter } : {}),
            ...(severityFilter ? { severity: severityFilter } : {}),
            ...(search ? { search } : {}),
          },
        })
        .then((r) => r.data),
  });

  const reports = data?.data || [];
  const meta = data?.meta;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t("whistleblowing.reports.title")}</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-500">{t("whistleblowing.reports.filters")}</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">{t("whistleblowing.reports.allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`whistleblowing.reports.status.${s}`)}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">{t("whistleblowing.reports.allCategories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`whistleblowing.reports.category.${c}`)}</option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">{t("whistleblowing.reports.allSeverities")}</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{t(`whistleblowing.reports.severity.${s}`)}</option>
            ))}
          </select>
          <div className="flex gap-2 ml-auto">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
              placeholder={t("whistleblowing.reports.search")}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48"
            />
            <button
              onClick={() => { setSearch(searchInput); setPage(1); }}
              className="p-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
          </div>
        ) : reports.length > 0 ? (
          <>
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">{t("whistleblowing.reports.colCase")}</th>
                  <th className="px-5 py-3 text-left">{t("whistleblowing.reports.colCategory")}</th>
                  <th className="px-5 py-3 text-left">{t("whistleblowing.reports.colSeverity")}</th>
                  <th className="px-5 py-3 text-left">{t("whistleblowing.reports.colSubject")}</th>
                  <th className="px-5 py-3 text-left">{t("whistleblowing.reports.colAnonymous")}</th>
                  <th className="px-5 py-3 text-left">{t("whistleblowing.reports.colInvestigator")}</th>
                  <th className="px-5 py-3 text-left">{t("whistleblowing.reports.colStatus")}</th>
                  <th className="px-5 py-3 text-left">{t("whistleblowing.reports.colDate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reports.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <Link
                        to={`/whistleblowing/reports/${r.id}`}
                        className="font-mono text-sm text-brand-600 hover:underline"
                      >
                        {r.case_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700">
                      {t(`whistleblowing.reports.category.${r.category}`, { defaultValue: r.category.replace(/_/g, " ") })}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_BADGE[r.severity] || ""}`}>
                        {t(`whistleblowing.reports.severity.${r.severity}`, { defaultValue: r.severity })}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-900 max-w-xs truncate">{r.subject}</td>
                    <td className="px-5 py-3 text-sm">
                      {r.is_anonymous ? (
                        <span className="text-green-600 font-medium">{t("whistleblowing.reports.yes")}</span>
                      ) : (
                        <span className="text-gray-500">{t("whistleblowing.reports.no")}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700">
                      {r.investigator_name || <span className="text-gray-400">{t("whistleblowing.reports.unassigned")}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] || ""}`}>
                        {t(`whistleblowing.reports.status.${r.status}`, { defaultValue: r.status.replace(/_/g, " ") })}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {meta && meta.total_pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50">
                <p className="text-sm text-gray-500">
                  {t("whistleblowing.reports.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm bg-white border rounded-lg disabled:opacity-50"
                  >
                    {t("whistleblowing.reports.previous")}
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= meta.total_pages}
                    className="px-3 py-1 text-sm bg-white border rounded-lg disabled:opacity-50"
                  >
                    {t("whistleblowing.reports.next")}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center text-gray-400">{t("whistleblowing.reports.noReports")}</div>
        )}
      </div>
    </div>
  );
}
