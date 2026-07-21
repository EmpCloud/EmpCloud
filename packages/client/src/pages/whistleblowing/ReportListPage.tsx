import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { Link } from "react-router-dom";
import { ShieldAlert, Search, Filter } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  under_investigation: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  escalated: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  resolved: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  dismissed: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  medium: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  high: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  critical: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
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
          <ShieldAlert className="h-7 w-7 text-brand-600 dark:text-brand-400" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("whistleblowing.reports.title")}</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg shadow-sm border p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] text-muted-foreground">{t("whistleblowing.reports.filters")}</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-border rounded-md px-3 py-1.5 text-[13px] bg-card text-foreground"
          >
            <option value="">{t("whistleblowing.reports.allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`whistleblowing.reports.status.${s}`)}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="border border-border rounded-md px-3 py-1.5 text-[13px] bg-card text-foreground"
          >
            <option value="">{t("whistleblowing.reports.allCategories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`whistleblowing.reports.category.${c}`)}</option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
            className="border border-border rounded-md px-3 py-1.5 text-[13px] bg-card text-foreground"
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
              className="border border-border rounded-lg px-3 py-1.5 text-[13px] w-48 bg-card text-foreground"
            />
            <button
              onClick={() => { setSearch(searchInput); setPage(1); }}
              className="p-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
          </div>
        ) : reports.length > 0 ? (
          <>
            <table className="w-full">
              <thead className="bg-muted text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left">{t("whistleblowing.reports.colCase")}</th>
                  <th className="px-4 py-2.5 text-left">{t("whistleblowing.reports.colCategory")}</th>
                  <th className="px-4 py-2.5 text-left">{t("whistleblowing.reports.colSeverity")}</th>
                  <th className="px-4 py-2.5 text-left">{t("whistleblowing.reports.colSubject")}</th>
                  <th className="px-4 py-2.5 text-left">{t("whistleblowing.reports.colAnonymous")}</th>
                  <th className="px-4 py-2.5 text-left">{t("whistleblowing.reports.colInvestigator")}</th>
                  <th className="px-4 py-2.5 text-left">{t("whistleblowing.reports.colStatus")}</th>
                  <th className="px-4 py-2.5 text-left">{t("whistleblowing.reports.colDate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reports.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/whistleblowing/reports/${r.id}`}
                        className="font-mono text-[13px] tabular-nums text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        {r.case_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                      {t(`whistleblowing.reports.category.${r.category}`, { defaultValue: r.category.replace(/_/g, " ") })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${SEVERITY_BADGE[r.severity] || ""}`}>
                        {t(`whistleblowing.reports.severity.${r.severity}`, { defaultValue: r.severity })}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-foreground max-w-xs truncate">{r.subject}</td>
                    <td className="px-4 py-2.5 text-[13px]">
                      {r.is_anonymous ? (
                        <span className="text-green-600 dark:text-green-400 font-medium">{t("whistleblowing.reports.yes")}</span>
                      ) : (
                        <span className="text-muted-foreground">{t("whistleblowing.reports.no")}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                      {r.investigator_name || <span className="text-muted-foreground">{t("whistleblowing.reports.unassigned")}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_BADGE[r.status] || ""}`}>
                        {t(`whistleblowing.reports.status.${r.status}`, { defaultValue: r.status.replace(/_/g, " ") })}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {meta && meta.total_pages > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted">
                <p className="text-[13px] text-muted-foreground">
                  {t("whistleblowing.reports.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 text-[13px] bg-card border rounded-md disabled:opacity-50"
                  >
                    {t("whistleblowing.reports.previous")}
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= meta.total_pages}
                    className="px-3 py-1 text-[13px] bg-card border rounded-md disabled:opacity-50"
                  >
                    {t("whistleblowing.reports.next")}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center text-muted-foreground">{t("whistleblowing.reports.noReports")}</div>
        )}
      </div>
    </div>
  );
}
