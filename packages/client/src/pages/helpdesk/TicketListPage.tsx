import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/api/client";
import {
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  high: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  urgent: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  in_progress: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  awaiting_response: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  resolved: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  closed: "bg-muted text-muted-foreground",
  reopened: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

const CATEGORIES = [
  "leave", "payroll", "benefits", "it", "facilities", "onboarding", "policy", "general",
];

const STATUSES = [
  "open", "in_progress", "awaiting_response", "resolved", "closed", "reopened",
];

const PRIORITIES = ["low", "medium", "high", "urgent"];

export default function TicketListPage() {
  const { t } = useTranslation();
  // Initial filters come from the URL so links from the dashboard (e.g.
  // `/helpdesk/tickets?status=open`) apply the filter automatically.
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [priority, setPriority] = useState(searchParams.get("priority") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [resolvedDate, setResolvedDate] = useState(searchParams.get("resolved_date") || "");

  // Keep the URL in sync with the active filters so the link stays shareable
  // and browser back/forward navigation restores the previous filter set.
  useEffect(() => {
    const next: Record<string, string> = {};
    if (status) next.status = status;
    if (category) next.category = category;
    if (priority) next.priority = priority;
    if (search) next.search = search;
    if (resolvedDate) next.resolved_date = resolvedDate;
    setSearchParams(next, { replace: true });
  }, [status, category, priority, search, resolvedDate, setSearchParams]);
  const { data, isLoading } = useQuery({
    queryKey: ["helpdesk-tickets", page, status, category, priority, search, resolvedDate],
    queryFn: () =>
      api
        .get("/helpdesk/tickets", {
          params: {
            page,
            per_page: 20,
            ...(status && { status }),
            ...(category && { category }),
            ...(priority && { priority }),
            ...(search && { search }),
            ...(resolvedDate && { resolved_date: resolvedDate }),
          },
        })
        .then((r) => r.data),
  });

  const allTickets = data?.data || [];
  const meta = data?.meta;

  // Optional client-side SLA filter driven by the `sla` query param (used by
  // the dashboard's "Overdue (SLA Breached)" card). Kept client-side because
  // SLA status is computed from sla_resolution_due and the current time.
  const slaFilter = searchParams.get("sla");
  const tickets = slaFilter
    ? allTickets.filter((ticket: any) => slaStatus(ticket) === slaFilter)
    : allTickets;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  function slaStatus(ticket: any) {
    if (["resolved", "closed"].includes(ticket.status)) return null;
    const now = new Date();
    const due = new Date(ticket.sla_resolution_due);
    if (now > due) return "breached";
    const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursLeft < 4) return "at-risk";
    return "on-track";
  }

  const SLA_BADGE: Record<string, string> = {
    breached: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
    "at-risk": "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
    "on-track": "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("helpdesk.list.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("helpdesk.list.subtitle")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("helpdesk.list.searchPlaceholder")}
                className="bg-card text-foreground w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
            >
              {t("helpdesk.list.search")}
            </button>
          </form>

          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="bg-card text-foreground px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">{t("helpdesk.list.allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`helpdesk.list.status.${s}`)}
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="bg-card text-foreground px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">{t("helpdesk.list.allCategories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`helpdesk.list.category.${c}`)}
              </option>
            ))}
          </select>

          <select
            value={priority}
            onChange={(e) => { setPriority(e.target.value); setPage(1); }}
            className="bg-card text-foreground px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">{t("helpdesk.list.allPriorities")}</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`helpdesk.list.priority.${p}`)}
              </option>
            ))}
          </select>
        </div>
        {resolvedDate && (
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 text-xs font-medium">
              {resolvedDate === "today" ? t("helpdesk.list.resolvedToday") : t("helpdesk.list.resolvedOn", { date: resolvedDate })}
              <button
                type="button"
                onClick={() => { setResolvedDate(""); setPage(1); }}
                className="hover:text-green-900 dark:hover:text-green-100"
                aria-label={t("helpdesk.list.clearResolvedFilter")}
              >
                ×
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Tickets Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">{t("helpdesk.list.loading")}</div>
        ) : tickets.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">{t("helpdesk.list.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("helpdesk.list.colId")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("helpdesk.list.colSubject")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("helpdesk.list.colCategory")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("helpdesk.list.colPriority")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("helpdesk.list.colStatus")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("helpdesk.list.colRaisedBy")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("helpdesk.list.colAssignedTo")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("helpdesk.list.colSla")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("helpdesk.list.colCreated")}</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket: any) => {
                  const sla = slaStatus(ticket);
                  return (
                    <tr
                      key={ticket.id}
                      className="border-b border-border hover:bg-muted transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/helpdesk/tickets/${ticket.id}`}
                          className="text-brand-600 dark:text-brand-400 font-medium hover:underline"
                        >
                          #{ticket.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/helpdesk/tickets/${ticket.id}`}
                          className="text-foreground hover:text-brand-600 font-medium truncate block max-w-[250px]"
                        >
                          {ticket.subject}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground">{t(`helpdesk.list.category.${ticket.category}`, { defaultValue: ticket.category })}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            PRIORITY_COLORS[ticket.priority] || ""
                          }`}
                        >
                          {t(`helpdesk.list.priority.${ticket.priority}`, { defaultValue: ticket.priority })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            STATUS_COLORS[ticket.status] || ""
                          }`}
                        >
                          {t(`helpdesk.list.status.${ticket.status}`, { defaultValue: ticket.status.replace(/_/g, " ") })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {ticket.raised_by_name || "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {ticket.assigned_to_name || (
                          <span className="text-muted-foreground italic">{t("helpdesk.list.unassigned")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {sla ? (
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded ${
                              SLA_BADGE[sla] || ""
                            }`}
                          >
                            {t(`helpdesk.list.sla.${sla}`, { defaultValue: sla.replace("-", " ") })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-muted-foreground">
            {t("helpdesk.list.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" /> {t("helpdesk.list.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-muted"
            >
              {t("helpdesk.list.next")} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
