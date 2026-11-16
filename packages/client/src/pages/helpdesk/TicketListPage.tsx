import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/api/client";
import { richTextToPlainText } from "@/components/ui/RichTextEditor";
import {
  ArrowUp,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  Search,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  ChevronsDown,
  ChevronsUp,
  FileText,
  Headphones,
  MoreVertical,
  Plus,
  RotateCcw,
  UserRound,
  XCircle,
} from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  high: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  awaiting_response: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  closed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  reopened: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

const CATEGORY_COLORS: Record<string, string> = {
  leave: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  payroll: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  benefits: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  it: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  facilities: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  onboarding: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  policy: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  general: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const SLA_BADGE: Record<string, string> = {
  breached: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  "at-risk": "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  "on-track": "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const CATEGORIES = [
  "leave", "payroll", "benefits", "it", "facilities", "onboarding", "policy", "general",
];

const STATUSES = [
  "open", "in_progress", "awaiting_response", "resolved", "closed", "reopened",
];

const PRIORITIES = ["low", "medium", "high", "urgent"];

type SortKey =
  | "id"
  | "subject"
  | "category"
  | "priority"
  | "status"
  | "raised_by_name"
  | "assigned_to_name"
  | "sla"
  | "created_at";

type SortDirection = "asc" | "desc";
const SERVER_SORT_KEYS: SortKey[] = [
  "id",
  "subject",
  "category",
  "priority",
  "status",
  "created_at",
];

function parsePageParam(value: string | null) {
  const parsed = Number(value || "");
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseSortKey(value: string | null): SortKey {
  return SERVER_SORT_KEYS.includes(value as SortKey)
    ? (value as SortKey)
    : "created_at";
}

function parseSortDirection(value: string | null): SortDirection {
  return value === "asc" || value === "desc" ? value : "desc";
}

type DashboardStats = {
  total_open?: number;
  open: number;
  in_progress: number;
  awaiting_response: number;
  resolved: number;
  closed: number;
  reopened: number;
};

function getSlaStatus(ticket: any) {
  if (["resolved", "closed"].includes(ticket.status) || !ticket.sla_resolution_due) {
    return null;
  }
  const now = new Date();
  const due = new Date(ticket.sla_resolution_due);
  if (now > due) return "breached";
  const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursLeft < 4) return "at-risk";
  return "on-track";
}

function getInitials(name?: string | null) {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getLocalDateInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : new Date(Number.NaN);
}

function parseDateFilter(value: string | null, allowToday = false) {
  if (!value) return "";
  if (allowToday && value === "today") return value;
  return Number.isNaN(parseCalendarDate(value).getTime()) ? "" : value;
}

export default function TicketListPage() {
  const { t, i18n } = useTranslation();
  // Initial filters come from the URL so links from the dashboard (e.g.
  // `/helpdesk/tickets?status=open`) apply the filter automatically.
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(() => parsePageParam(searchParams.get("page")));
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [priority, setPriority] = useState(searchParams.get("priority") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [createdDate, setCreatedDate] = useState(() =>
    parseDateFilter(searchParams.get("created_date")),
  );
  const [resolvedDate, setResolvedDate] = useState(() =>
    parseDateFilter(searchParams.get("resolved_date"), true),
  );
  const [slaFilter, setSlaFilter] = useState(searchParams.get("sla") || "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>(() =>
    parseSortKey(searchParams.get("sort_by")),
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>(() =>
    parseSortDirection(searchParams.get("sort_direction")),
  );
  const syncingFromUrl = useRef(false);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [],
  );
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [i18n.language],
  );

  // Rehydrate filters when browser navigation changes the query string.
  useEffect(() => {
    const nextStatus = searchParams.get("status") || "";
    const nextCategory = searchParams.get("category") || "";
    const nextPriority = searchParams.get("priority") || "";
    const nextSearch = searchParams.get("search") || "";
    const nextCreatedDate = parseDateFilter(searchParams.get("created_date"));
    const nextResolvedDate = parseDateFilter(
      searchParams.get("resolved_date"),
      true,
    );
    const nextSla = searchParams.get("sla") || "";
    const nextPage = parsePageParam(searchParams.get("page"));
    const nextSortKey = parseSortKey(searchParams.get("sort_by"));
    const nextSortDirection = parseSortDirection(
      searchParams.get("sort_direction"),
    );

    if (
      nextStatus !== status ||
      nextCategory !== category ||
      nextPriority !== priority ||
      nextSearch !== search ||
      nextCreatedDate !== createdDate ||
      nextResolvedDate !== resolvedDate ||
      nextSla !== slaFilter ||
      nextPage !== page ||
      nextSortKey !== sortKey ||
      nextSortDirection !== sortDirection
    ) {
      syncingFromUrl.current = true;
      setStatus(nextStatus);
      setCategory(nextCategory);
      setPriority(nextPriority);
      setSearch(nextSearch);
      setSearchInput(nextSearch);
      setCreatedDate(nextCreatedDate);
      setResolvedDate(nextResolvedDate);
      setSlaFilter(nextSla);
      setPage(nextPage);
      setSortKey(nextSortKey);
      setSortDirection(nextSortDirection);
    }
  }, [searchParams]);

  // Keep the URL in sync with the active filters so the link stays shareable
  // and browser back/forward navigation restores the previous filter set.
  useEffect(() => {
    if (syncingFromUrl.current) {
      syncingFromUrl.current = false;
      return;
    }
    const next: Record<string, string> = {};
    if (status) next.status = status;
    if (category) next.category = category;
    if (priority) next.priority = priority;
    if (search) next.search = search;
    if (createdDate) next.created_date = createdDate;
    if (resolvedDate) next.resolved_date = resolvedDate;
    if (slaFilter) next.sla = slaFilter;
    if (page > 1) next.page = String(page);
    if (sortKey !== "created_at" || sortDirection !== "desc") {
      next.sort_by = sortKey;
      next.sort_direction = sortDirection;
    }
    setSearchParams(next, { replace: true });
  }, [status, category, priority, search, createdDate, resolvedDate, slaFilter, page, sortKey, sortDirection, setSearchParams]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, status, category, priority, search, createdDate, resolvedDate, slaFilter, sortKey, sortDirection]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "helpdesk-tickets",
      page,
      status,
      category,
      priority,
      search,
      createdDate,
      resolvedDate,
      slaFilter,
      sortKey,
      sortDirection,
    ],
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
            ...(createdDate && { created_date: createdDate }),
            ...(resolvedDate && { resolved_date: resolvedDate }),
            ...(slaFilter && { sla: slaFilter }),
            ...(SERVER_SORT_KEYS.includes(sortKey) && { sort_by: sortKey }),
            sort_direction: sortDirection,
          },
        })
        .then((r) => r.data),
  });

  const { data: dashboardStats } = useQuery<DashboardStats>({
    queryKey: ["helpdesk-dashboard"],
    queryFn: () => api.get("/helpdesk/dashboard").then((r) => r.data.data),
  });

  const allTickets = data?.data || [];
  const meta = data?.meta;

  useEffect(() => {
    if (!meta) return;
    const lastPage = Math.max(1, meta.total_pages || 1);
    if (page > lastPage) setPage(lastPage);
  }, [meta, page]);

  const tickets = allTickets;

  const totalTickets = dashboardStats
    ? dashboardStats.open +
      dashboardStats.in_progress +
      dashboardStats.awaiting_response +
      dashboardStats.resolved +
      dashboardStats.closed +
      dashboardStats.reopened
    : meta?.total || 0;
  const openTickets = dashboardStats
    ? dashboardStats.open + dashboardStats.reopened
    : undefined;
  const inProgressTickets = dashboardStats
    ? dashboardStats.in_progress + dashboardStats.awaiting_response
    : undefined;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const resetFilters = () => {
    setStatus("");
    setCategory("");
    setPriority("");
    setSearch("");
    setSearchInput("");
    setCreatedDate("");
    setResolvedDate("");
    setSlaFilter("");
    setPage(1);
    setSortKey("created_at");
    setSortDirection("desc");
  };

  const toggleSort = (key: SortKey) => {
    if (!SERVER_SORT_KEYS.includes(key)) return;
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      setPage(1);
      return;
    }
    setSortKey(key);
    setSortDirection(key === "created_at" ? "desc" : "asc");
    setPage(1);
  };

  const allVisibleSelected =
    tickets.length > 0 && tickets.every((ticket: any) => selectedIds.has(String(ticket.id)));

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        tickets.forEach((ticket: any) => next.delete(String(ticket.id)));
      } else {
        tickets.forEach((ticket: any) => next.add(String(ticket.id)));
      }
      return next;
    });
  };

  const toggleTicket = (ticketId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const statCards = [
    {
      label: t("helpdesk.list.totalTickets", { defaultValue: "Total Tickets" }),
      value: totalTickets,
      helper: t("helpdesk.list.acrossOrganization", { defaultValue: "Across organization" }),
      icon: FileText,
      tone: "border-blue-100 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/20",
      iconTone: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
      valueTone: "text-foreground",
    },
    {
      label: t("helpdesk.list.status.open"),
      value: openTickets ?? "—",
      helper: t("helpdesk.list.needsAttention", { defaultValue: "Needs attention" }),
      icon: Clock3,
      tone: "border-amber-100 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20",
      iconTone: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
      valueTone: "text-rose-700 dark:text-rose-300",
    },
    {
      label: t("helpdesk.list.status.in_progress"),
      value: inProgressTickets ?? "—",
      helper: t("helpdesk.list.beingWorkedOn", { defaultValue: "Being worked on" }),
      icon: CircleDot,
      tone: "border-sky-100 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/20",
      iconTone: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300",
      valueTone: "text-foreground",
    },
    {
      label: t("helpdesk.list.status.resolved"),
      value: dashboardStats?.resolved ?? "—",
      helper: t("helpdesk.list.successfullyClosed", { defaultValue: "Successfully closed" }),
      icon: CheckCircle2,
      tone: "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20",
      iconTone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
      valueTone: "text-foreground",
    },
    {
      label: t("helpdesk.list.status.closed"),
      value: dashboardStats?.closed ?? "—",
      helper: t("helpdesk.list.noLongerActive", { defaultValue: "No longer active" }),
      icon: XCircle,
      tone: "border-rose-100 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20",
      iconTone: "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300",
      valueTone: "text-rose-700 dark:text-rose-300",
    },
  ];

  const tableColumns: Array<{ key: SortKey; label: string; width: string }> = [
    { key: "id", label: t("helpdesk.list.colId"), width: "w-[76px]" },
    { key: "subject", label: t("helpdesk.list.colSubject"), width: "w-[240px]" },
    { key: "category", label: t("helpdesk.list.colCategory"), width: "w-[104px]" },
    { key: "priority", label: t("helpdesk.list.colPriority"), width: "w-[104px]" },
    { key: "status", label: t("helpdesk.list.colStatus"), width: "w-[118px]" },
    { key: "raised_by_name", label: t("helpdesk.list.colRaisedBy"), width: "w-[150px]" },
    { key: "assigned_to_name", label: t("helpdesk.list.colAssignedTo"), width: "w-[150px]" },
    { key: "sla", label: t("helpdesk.list.colSla"), width: "w-[108px]" },
    { key: "created_at", label: t("helpdesk.list.colCreated"), width: "w-[118px]" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/50">
            <Headphones className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold leading-7 tracking-tight text-foreground">
              {t("helpdesk.list.title")}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("helpdesk.list.subtitle")}
            </p>
          </div>
        </div>
        <Link
          to="/helpdesk/my-tickets?create=1"
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("helpdesk.myTicketsPage.raiseTicket")}
        </Link>
      </header>

      <section
        aria-label={t("helpdesk.list.ticketSummary", { defaultValue: "Ticket summary" })}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className={"flex min-h-[86px] items-center gap-3 rounded-xl border p-3.5 shadow-sm " + card.tone}
            >
              <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " + card.iconTone}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className={"text-xl font-bold leading-none tabular-nums " + card.valueTone}>
                  {card.value}
                </p>
                <h2 className="mt-1 text-xs font-semibold text-foreground">{card.label}</h2>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{card.helper}</p>
              </div>
            </article>
          );
        })}
      </section>

      <section aria-label={t("helpdesk.list.filters", { defaultValue: "Ticket filters" })}>
        <form
          onSubmit={handleSearch}
          className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-3 shadow-sm sm:grid-cols-2 xl:grid-cols-4 2xl:flex 2xl:items-center"
        >
            <label className="relative min-w-0 sm:col-span-2 xl:col-span-4 2xl:flex-1">
              <span className="sr-only">{t("helpdesk.list.searchPlaceholder")}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                name="search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("helpdesk.list.searchPlaceholderDetailed", {
                  defaultValue: "Search tickets by ID, subject, or keyword...",
                })}
                autoComplete="off"
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>

          <label>
            <span className="sr-only">{t("helpdesk.list.allStatuses")}</span>
            <select
              name="status"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="h-10 w-full min-w-[142px] rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 xl:w-auto"
            >
              <option value="">{t("helpdesk.list.allStatuses")}</option>
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item === "open"
                    ? t("helpdesk.list.openAndActive", { defaultValue: "Open & active" })
                    : t("helpdesk.list.status." + item)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="sr-only">{t("helpdesk.list.allCategories")}</span>
            <select
              name="category"
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="h-10 w-full min-w-[148px] rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 xl:w-auto"
            >
              <option value="">{t("helpdesk.list.allCategories")}</option>
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {t("helpdesk.list.category." + item)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="sr-only">{t("helpdesk.list.allPriorities")}</span>
            <select
              name="priority"
              value={priority}
              onChange={(e) => { setPriority(e.target.value); setPage(1); }}
              className="h-10 w-full min-w-[138px] rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 xl:w-auto"
            >
              <option value="">{t("helpdesk.list.allPriorities")}</option>
              {PRIORITIES.map((item) => (
                <option key={item} value={item}>
                  {t("helpdesk.list.priority." + item)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="sr-only">{t("helpdesk.list.allSlas", { defaultValue: "All SLAs" })}</span>
            <select
              name="sla"
              value={slaFilter}
              onChange={(e) => { setSlaFilter(e.target.value); setPage(1); }}
              className="h-10 w-full min-w-[120px] rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 xl:w-auto"
            >
              <option value="">{t("helpdesk.list.allSlas", { defaultValue: "All SLAs" })}</option>
              {["on-track", "at-risk", "breached"].map((item) => (
                <option key={item} value={item}>
                  {t("helpdesk.list.sla." + item)}
                </option>
              ))}
            </select>
          </label>

          <label className="relative">
            <span className="sr-only">{t("helpdesk.list.createdDate", { defaultValue: "Created date" })}</span>
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            {!createdDate && (
              <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm text-foreground">
                {t("helpdesk.list.createdDateLabel", { defaultValue: "Created Date" })}
              </span>
            )}
            <input
              name="created_date"
              type="date"
              value={createdDate}
              max={getLocalDateInputValue()}
              onChange={(e) => { setCreatedDate(e.target.value); setPage(1); }}
              className={
                "h-10 w-full min-w-[150px] appearance-none rounded-lg border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 xl:w-auto [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 " +
                (createdDate
                  ? "text-foreground"
                  : "text-transparent [&::-webkit-datetime-edit]:opacity-0")
              }
            />
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          </label>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("common.reset", { defaultValue: "Reset" })}
          </button>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {t("helpdesk.list.search")}
          </button>
        </form>
      </section>

      {resolvedDate && (
        <div className="flex items-center">
          <span className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {resolvedDate === "today"
              ? t("helpdesk.list.resolvedToday")
              : t("helpdesk.list.resolvedOn", {
                  date: dateFormatter.format(parseCalendarDate(resolvedDate)),
                })}
            <button
              type="button"
              onClick={() => {
                setResolvedDate("");
                setPage(1);
              }}
              aria-label={t("helpdesk.list.clearResolvedFilter")}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-900/50 dark:hover:text-emerald-100"
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        </div>
      )}

      {/* Tickets Table */}
      <section
        aria-label={t("helpdesk.list.title")}
        className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground" role="status">
            {t("helpdesk.list.loading")}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center" role="alert">
            <p className="text-sm text-muted-foreground">
              {t("helpdesk.list.loadError", { defaultValue: "Tickets could not be loaded." })}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {t("common.retry", { defaultValue: "Retry" })}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] table-fixed text-sm">
              <caption className="sr-only">{t("helpdesk.list.title")}</caption>
              <thead>
                <tr className="border-b border-border bg-muted/70">
                  <th className="w-11 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(element) => {
                        if (element) {
                          element.indeterminate =
                            selectedIds.size > 0 && !allVisibleSelected;
                        }
                      }}
                      aria-checked={
                        selectedIds.size > 0 && !allVisibleSelected
                          ? "mixed"
                          : allVisibleSelected
                      }
                      onChange={toggleAllVisible}
                      aria-label={t("helpdesk.list.selectAll", { defaultValue: "Select all visible tickets" })}
                      className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  {tableColumns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        SERVER_SORT_KEYS.includes(column.key)
                          ? sortKey === column.key
                            ? sortDirection === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                          : undefined
                      }
                      className={column.width + " px-2.5 py-2.5 text-left"}
                    >
                      {SERVER_SORT_KEYS.includes(column.key) ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          {column.label}
                          <span className="text-[9px]" aria-hidden="true">
                            {sortKey === column.key
                              ? sortDirection === "asc"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {column.label}
                        </span>
                      )}
                    </th>
                  ))}
                  <th scope="col" className="w-14 px-2.5 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("common.actions", { defaultValue: "Actions" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableColumns.length + 2}
                      className="h-28 px-4 text-center text-sm text-muted-foreground"
                    >
                      {t("helpdesk.list.empty")}
                    </td>
                  </tr>
                ) : tickets.map((ticket: any) => {
                  const sla = getSlaStatus(ticket);
                  const ticketId = String(ticket.id);
                  const isSelected = selectedIds.has(ticketId);
                  const createdAt = new Date(ticket.created_at);
                  const description = richTextToPlainText(ticket.description || "");
                  const StatusIcon =
                    ticket.status === "resolved"
                      ? CheckCircle2
                      : ticket.status === "closed"
                        ? XCircle
                        : ticket.status === "in_progress" || ticket.status === "awaiting_response"
                          ? Clock3
                          : CircleDot;
                  return (
                    <tr
                      key={ticket.id}
                      className={
                        "border-b border-border transition-colors last:border-b-0 hover:bg-muted/40 " +
                        (isSelected ? "bg-brand-50/60 dark:bg-brand-950/20" : "")
                      }
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTicket(ticketId)}
                          aria-label={t("helpdesk.list.selectTicket", {
                            id: ticket.id,
                            defaultValue: "Select ticket #{{id}}",
                          })}
                          className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      <td className="px-2.5 py-2">
                        <Link
                          to={"/helpdesk/tickets/" + ticket.id}
                          className="font-semibold text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400"
                        >
                          #{ticket.id}
                        </Link>
                      </td>
                      <td className="px-2.5 py-2">
                        <Link
                          to={"/helpdesk/tickets/" + ticket.id}
                          title={ticket.subject}
                          className="block truncate font-semibold text-foreground transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          {ticket.subject}
                        </Link>
                        {description && (
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {description}
                          </p>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        <span
                          className={
                            "inline-flex rounded-md px-2 py-1 text-[11px] font-medium " +
                            (CATEGORY_COLORS[ticket.category] || CATEGORY_COLORS.general)
                          }
                        >
                          {t("helpdesk.list.category." + ticket.category, {
                            defaultValue: ticket.category,
                          })}
                        </span>
                      </td>
                      <td className="px-2.5 py-2">
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium " +
                            (PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.low)
                          }
                        >
                          {ticket.priority === "low" ? (
                            <ChevronsDown className="h-3 w-3" aria-hidden="true" />
                          ) : ticket.priority === "medium" ? (
                            <ArrowUp className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ChevronsUp className="h-3 w-3" aria-hidden="true" />
                          )}
                          {t("helpdesk.list.priority." + ticket.priority, {
                            defaultValue: ticket.priority,
                          })}
                        </span>
                      </td>
                      <td className="px-2.5 py-2">
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium " +
                            (STATUS_COLORS[ticket.status] || STATUS_COLORS.open)
                          }
                        >
                          <StatusIcon className="h-3 w-3" aria-hidden="true" />
                          {t("helpdesk.list.status." + ticket.status, {
                            defaultValue: ticket.status.replace(/_/g, " "),
                          })}
                        </span>
                      </td>
                      <td className="px-2.5 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                            {getInitials(ticket.raised_by_name) || "?"}
                          </span>
                          <span className="truncate text-xs text-foreground">
                            {ticket.raised_by_name || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-2.5 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {ticket.assigned_to_name ? (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                              {getInitials(ticket.assigned_to_name)}
                            </span>
                          ) : (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                          )}
                          <span className={"truncate text-xs " + (ticket.assigned_to_name ? "text-foreground" : "text-muted-foreground")}>
                            {ticket.assigned_to_name || t("helpdesk.list.unassigned")}
                          </span>
                        </div>
                      </td>
                      <td className="px-2.5 py-2">
                        {sla ? (
                          <span
                            className={
                              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium " +
                              (SLA_BADGE[sla] || "")
                            }
                          >
                            <Clock3 className="h-3 w-3" aria-hidden="true" />
                            {t("helpdesk.list.sla." + sla, {
                              defaultValue: sla.replace("-", " "),
                            })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-xs text-muted-foreground">
                        <time dateTime={createdAt.toISOString()} className="block leading-tight">
                          <span className="block text-foreground">{dateFormatter.format(createdAt)}</span>
                          <span className="text-[10px]">{timeFormatter.format(createdAt)}</span>
                        </time>
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <Link
                          to={"/helpdesk/tickets/" + ticket.id}
                          aria-label={t("helpdesk.list.viewTicket", {
                            id: ticket.id,
                            defaultValue: "View ticket #{{id}}",
                          })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <nav
          aria-label={t("helpdesk.list.pagination", { defaultValue: "Ticket pagination" })}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-xs text-muted-foreground">
            {t("helpdesk.list.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("helpdesk.list.previous")}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {t("helpdesk.list.next")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
