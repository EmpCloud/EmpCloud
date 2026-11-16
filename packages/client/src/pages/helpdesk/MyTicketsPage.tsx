import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/api/client";
import RichTextEditor, { isRichTextEmpty, richTextToPlainText } from "@/components/ui/RichTextEditor";
import {
  ArrowDownUp,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  Plus,
  FileText,
  Filter,
  Headphones,
  MoreVertical,
  RefreshCw,
  Search,
  TicketCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserRound,
  X,
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
  in_progress: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  awaiting_response: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  closed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  reopened: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

const CATEGORIES = [
  "leave", "payroll", "benefits", "it", "facilities", "onboarding", "policy", "general",
];

const PRIORITIES = ["low", "medium", "high", "urgent"];

const STATUS_FILTERS = ["open", "in_progress", "resolved", "closed"] as const;
const PAGE_SIZE = 20;

type TicketStatus = (typeof STATUS_FILTERS)[number];
type TicketSort = "recent" | "oldest" | "priority";

function parsePageParam(value: string | null) {
  const parsed = Number(value || "");
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseStatusParam(value: string | null): TicketStatus | "" {
  return STATUS_FILTERS.includes(value as TicketStatus)
    ? (value as TicketStatus)
    : "";
}

function parsePriorityParam(value: string | null) {
  return value && PRIORITIES.includes(value) ? value : "";
}

function parseDateRangeParam(value: string | null) {
  return value === "7" || value === "30" || value === "90" ? value : "";
}

function parseSortParam(value: string | null): TicketSort {
  return value === "oldest" || value === "priority" ? value : "recent";
}

type Ticket = {
  id: number | string;
  subject: string;
  description?: string | null;
  priority: string;
  status: string;
  created_at: string;
  assigned_to_name?: string | null;
};

type TicketsResponse = {
  data: Ticket[];
  meta?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
};

function getInitials(name?: string | null) {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getStatusIcon(status: string) {
  if (status === "resolved") return CheckCircle2;
  if (status === "closed") return XCircle;
  if (status === "in_progress" || status === "reopened") return RefreshCw;
  if (status === "awaiting_response") return Clock3;
  return CircleDot;
}

function getTicketIconTone(status: string) {
  if (status === "resolved") {
    return "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (status === "closed") {
    return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  }
  if (status === "reopened") {
    return "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300";
  }
  return "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300";
}

async function getTicketCount(status?: TicketStatus) {
  const response = await api.get<TicketsResponse>("/helpdesk/tickets/my", {
    params: {
      page: 1,
      per_page: 1,
      ...(status && { status }),
    },
  });
  return response.data.meta?.total ?? response.data.data.length;
}

export default function MyTicketsPage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(() => parsePageParam(searchParams.get("page")));
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">(() =>
    parseStatusParam(searchParams.get("status")),
  );
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [dateRange, setDateRange] = useState(() =>
    parseDateRangeParam(searchParams.get("date_range")),
  );
  const [priorityFilter, setPriorityFilter] = useState(() =>
    parsePriorityParam(searchParams.get("priority")),
  );
  const [sort, setSort] = useState<TicketSort>(() =>
    parseSortParam(searchParams.get("sort")),
  );
  const [showForm, setShowForm] = useState(searchParams.get("create") === "1");
  const deferredSearch = useDeferredValue(search.trim());
  const syncingFromUrl = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const nextPage = parsePageParam(searchParams.get("page"));
    const nextStatus = parseStatusParam(searchParams.get("status"));
    const nextSearch = searchParams.get("search") || "";
    const nextDateRange = parseDateRangeParam(searchParams.get("date_range"));
    const nextPriority = parsePriorityParam(searchParams.get("priority"));
    const nextSort = parseSortParam(searchParams.get("sort"));
    const nextShowForm = searchParams.get("create") === "1";

    if (
      nextPage !== page ||
      nextStatus !== statusFilter ||
      nextSearch !== search ||
      nextDateRange !== dateRange ||
      nextPriority !== priorityFilter ||
      nextSort !== sort ||
      nextShowForm !== showForm
    ) {
      syncingFromUrl.current = true;
      setPage(nextPage);
      setStatusFilter(nextStatus);
      setSearch(nextSearch);
      setDateRange(nextDateRange);
      setPriorityFilter(nextPriority);
      setSort(nextSort);
      setShowForm(nextShowForm);
    }
  }, [searchParams]);

  useEffect(() => {
    if (syncingFromUrl.current) {
      syncingFromUrl.current = false;
      return;
    }

    const next: Record<string, string> = {};
    if (statusFilter) next.status = statusFilter;
    if (search) next.search = search;
    if (dateRange) next.date_range = dateRange;
    if (priorityFilter) next.priority = priorityFilter;
    if (sort !== "recent") next.sort = sort;
    if (page > 1) next.page = String(page);
    if (showForm) next.create = "1";
    setSearchParams(next, { replace: true });
  }, [
    statusFilter,
    search,
    dateRange,
    priorityFilter,
    sort,
    page,
    showForm,
    setSearchParams,
  ]);

  const openCreateForm = () => {
    setShowForm(true);
    const next = new URLSearchParams(searchParams);
    next.set("create", "1");
    setSearchParams(next);
  };

  const closeCreateForm = () => {
    setShowForm(false);
    if (searchParams.has("create")) {
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
  };

  // Form state
  const [formCategory, setFormCategory] = useState("general");
  const [formPriority, setFormPriority] = useState("medium");
  const [formSubject, setFormSubject] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const {
    data: ticketsResponse,
    isLoading,
    isError,
    refetch,
  } = useQuery<TicketsResponse>({
    queryKey: [
      "my-tickets",
      "list",
      statusFilter,
      deferredSearch,
      dateRange,
      priorityFilter,
      sort,
      page,
    ],
    queryFn: () =>
      api
        .get<TicketsResponse>("/helpdesk/tickets/my", {
          params: {
            page,
            per_page: PAGE_SIZE,
            ...(statusFilter && { status: statusFilter }),
            ...(deferredSearch && { search: deferredSearch }),
            ...(dateRange && { date_range: dateRange }),
            ...(priorityFilter && { priority: priorityFilter }),
            sort,
          },
        })
        .then((response) => response.data),
    placeholderData: (previousData) => previousData,
  });

  const countStatuses: Array<TicketStatus | undefined> = [
    undefined,
    ...STATUS_FILTERS,
  ];
  const ticketCountQueries = useQueries({
    queries: countStatuses.map((countStatus) => ({
      queryKey: ["my-tickets", "counts", countStatus || "all"],
      queryFn: () => getTicketCount(countStatus),
      staleTime: 60_000,
    })),
  });

  const createTicket = useMutation({
    mutationFn: (data: object) =>
      api.post("/helpdesk/tickets", data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
      closeCreateForm();
      setFormSubject("");
      setFormDescription("");
      setFormCategory("general");
      setFormPriority("medium");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createTicket.mutate({
      category: formCategory,
      priority: formPriority,
      subject: formSubject,
      description: formDescription,
    });
  };

  const counts = {
    all: ticketCountQueries[0]?.data,
    open: ticketCountQueries[1]?.data,
    in_progress: ticketCountQueries[2]?.data,
    resolved: ticketCountQueries[3]?.data,
    closed: ticketCountQueries[4]?.data,
  };

  const tickets = ticketsResponse?.data ?? [];
  const totalTickets = ticketsResponse?.meta?.total ?? tickets.length;
  const totalPages = Math.max(
    1,
    ticketsResponse?.meta?.total_pages ??
      Math.ceil(totalTickets / PAGE_SIZE),
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [],
  );

  const relativeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" }),
    [i18n.language],
  );

  const formatRelativeDate = (value: string) => {
    const created = new Date(value);
    const days = Math.round(
      (created.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    return relativeFormatter.format(days, "day");
  };

  const statCards = [
    {
      key: "all",
      label: t("helpdesk.myTicketsPage.totalTickets", {
        defaultValue: "Total Tickets",
      }),
      helper: t("helpdesk.myTicketsPage.allRaisedTickets", {
        defaultValue: "All raised tickets",
      }),
      value: counts.all,
      icon: FileText,
      tone:
        "border-blue-100 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/20",
      iconTone:
        "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
      valueTone: "text-foreground",
    },
    {
      key: "open",
      label: t("helpdesk.myTicketsPage.status.open"),
      helper: t("helpdesk.myTicketsPage.needsAttention", {
        defaultValue: "Needs attention",
      }),
      value: counts.open,
      icon: Clock3,
      tone:
        "border-amber-100 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20",
      iconTone:
        "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
      valueTone: "text-rose-700 dark:text-rose-300",
    },
    {
      key: "in_progress",
      label: t("helpdesk.myTicketsPage.status.in_progress"),
      helper: t("helpdesk.myTicketsPage.beingWorkedOn", {
        defaultValue: "Being worked on",
      }),
      value: counts.in_progress,
      icon: RefreshCw,
      tone:
        "border-sky-100 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/20",
      iconTone:
        "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300",
      valueTone: "text-foreground",
    },
    {
      key: "resolved",
      label: t("helpdesk.myTicketsPage.status.resolved"),
      helper: t("helpdesk.myTicketsPage.completed", {
        defaultValue: "Completed",
      }),
      value: counts.resolved,
      icon: CheckCircle2,
      tone:
        "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20",
      iconTone:
        "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
      valueTone: "text-foreground",
    },
    {
      key: "closed",
      label: t("helpdesk.myTicketsPage.status.closed"),
      helper: t("helpdesk.myTicketsPage.noLongerActive", {
        defaultValue: "No longer active",
      }),
      value: counts.closed,
      icon: XCircle,
      tone:
        "border-rose-100 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20",
      iconTone:
        "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300",
      valueTone: "text-rose-700 dark:text-rose-300",
    },
  ] as const;

  const statusTabs: Array<{
    status: TicketStatus | "";
    label: string;
    count: number | undefined;
  }> = [
    {
      status: "",
      label: t("helpdesk.myTicketsPage.tabAll"),
      count: counts.all,
    },
    ...STATUS_FILTERS.map((ticketStatus) => ({
      status: ticketStatus,
      label: t("helpdesk.myTicketsPage.status." + ticketStatus),
      count: counts[ticketStatus],
    })),
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/50">
            <Headphones className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-7 tracking-tight text-foreground">
              {t("helpdesk.myTicketsPage.title")}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("helpdesk.myTicketsPage.subtitle")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => (showForm ? closeCreateForm() : openCreateForm())}
          aria-expanded={showForm}
          aria-controls="ticket-create-form"
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("helpdesk.myTicketsPage.raiseTicket")}
        </button>
      </header>

      <section
        aria-label={t("helpdesk.myTicketsPage.ticketOverview", {
          defaultValue: "Ticket overview",
        })}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.key}
              className={[
                "flex min-h-[86px] items-center gap-3 rounded-xl border px-4 py-3 shadow-sm",
                card.tone,
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  card.iconTone,
                ].join(" ")}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p
                  className={[
                    "text-xl font-bold leading-none tabular-nums",
                    card.valueTone,
                  ].join(" ")}
                  aria-busy={card.value === undefined}
                >
                  {card.value ?? "\u2014"}
                </p>
                <h2 className="mt-1 text-xs font-semibold text-foreground">
                  {card.label}
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {card.helper}
                </p>
              </div>
            </article>
          );
        })}
      </section>

      {/* Create Ticket Form */}
      {showForm && (
        <section
          id="ticket-create-form"
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
          aria-labelledby="new-ticket-title"
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              id="new-ticket-title"
              className="text-base font-semibold text-foreground"
            >
              {t("helpdesk.myTicketsPage.newTicket")}
            </h2>
            <button
              type="button"
              onClick={closeCreateForm}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label={t("helpdesk.myTicketsPage.closeForm", {
                defaultValue: "Close new ticket form",
              })}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="new-ticket-category"
                  className="mb-1 block text-[13px] font-medium text-muted-foreground"
                >
                  {t("helpdesk.myTicketsPage.category")}
                </label>
                <select
                  id="new-ticket-category"
                  name="category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  autoComplete="off"
                  className="min-h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`helpdesk.myTicketsPage.cat.${c}`, { defaultValue: c })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="new-ticket-priority"
                  className="mb-1 block text-[13px] font-medium text-muted-foreground"
                >
                  {t("helpdesk.myTicketsPage.priorityLabel")}
                </label>
                <select
                  id="new-ticket-priority"
                  name="priority"
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                  autoComplete="off"
                  className="min-h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t(`helpdesk.myTicketsPage.priority.${p}`, { defaultValue: p })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="new-ticket-subject"
                className="mb-1 block text-[13px] font-medium text-muted-foreground"
              >
                {t("helpdesk.myTicketsPage.subject")}
              </label>
              <input
                id="new-ticket-subject"
                name="subject"
                type="text"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                autoComplete="off"
                className="min-h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                placeholder={t("helpdesk.myTicketsPage.subjectPlaceholder")}
                required
              />
            </div>

            <div role="group" aria-labelledby="new-ticket-description-label">
              <span
                id="new-ticket-description-label"
                className="mb-1 block text-[13px] font-medium text-muted-foreground"
              >
                {t("helpdesk.myTicketsPage.description")}
              </span>
              <RichTextEditor
                value={formDescription}
                onChange={setFormDescription}
                placeholder={t("helpdesk.myTicketsPage.descriptionPlaceholder")}
              />
            </div>

            {createTicket.isError && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {(createTicket.error as any)?.response?.data?.error?.message ||
                  t("helpdesk.myTicketsPage.createError", {
                    defaultValue: "The ticket could not be created. Please try again.",
                  })}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCreateForm}
                className="rounded-md border border-border px-4 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {t("helpdesk.myTicketsPage.cancel")}
              </button>
              <button
                type="submit"
                disabled={createTicket.isPending || !formSubject.trim() || isRichTextEmpty(formDescription)}
                className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <TicketCheck className="h-4 w-4" aria-hidden="true" />
                {createTicket.isPending ? t("helpdesk.myTicketsPage.submitting") : t("helpdesk.myTicketsPage.submit")}
              </button>
            </div>
          </form>
        </section>
      )}

      <section
        aria-label={t("helpdesk.myTicketsPage.ticketFilters", {
          defaultValue: "Ticket filters",
        })}
        className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] 2xl:items-center"
      >
        <div
          className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1"
          aria-label={t("helpdesk.myTicketsPage.filterByStatus", {
            defaultValue: "Filter tickets by status",
          })}
        >
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.status;
            return (
              <button
                key={tab.status || "all"}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.status);
                  setPage(1);
                }}
                aria-pressed={isActive}
                className={[
                  "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  isActive
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                ].join(" ")}
              >
                {tab.label}
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-card text-muted-foreground",
                  ].join(" ")}
                >
                  {tab.count ?? "\u2014"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[minmax(240px,1fr)_minmax(0,1.7fr)]">
          <div className="relative min-w-0">
            <label htmlFor="ticket-search" className="sr-only">
              {t("helpdesk.myTicketsPage.searchTickets", {
                defaultValue: "Search tickets",
              })}
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="ticket-search"
              name="search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={t("helpdesk.myTicketsPage.searchPlaceholder", {
                defaultValue: "Search by title, ID, or description…",
              })}
              autoComplete="off"
              className="min-h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="relative">
              <label htmlFor="ticket-date-range" className="sr-only">
                {t("helpdesk.myTicketsPage.dateRange", {
                  defaultValue: "Date range",
                })}
              </label>
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <select
                id="ticket-date-range"
                name="date_range"
                value={dateRange}
                onChange={(event) => {
                  setDateRange(event.target.value);
                  setPage(1);
                }}
                autoComplete="off"
                className="min-h-10 w-full appearance-none rounded-lg border border-border bg-card py-2 pl-9 pr-8 text-xs font-medium text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
              >
                <option value="">
                  {t("helpdesk.myTicketsPage.dateRange", {
                    defaultValue: "Date Range",
                  })}
                </option>
                <option value="7">
                  {t("helpdesk.myTicketsPage.lastSevenDays", {
                    defaultValue: "Last 7 days",
                  })}
                </option>
                <option value="30">
                  {t("helpdesk.myTicketsPage.lastThirtyDays", {
                    defaultValue: "Last 30 days",
                  })}
                </option>
                <option value="90">
                  {t("helpdesk.myTicketsPage.lastNinetyDays", {
                    defaultValue: "Last 90 days",
                  })}
                </option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>

            <div className="relative">
              <label htmlFor="ticket-priority-filter" className="sr-only">
                {t("helpdesk.myTicketsPage.filterByPriority", {
                  defaultValue: "Filter by priority",
                })}
              </label>
              <Filter
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <select
                id="ticket-priority-filter"
                name="priority"
                value={priorityFilter}
                onChange={(event) => {
                  setPriorityFilter(event.target.value);
                  setPage(1);
                }}
                autoComplete="off"
                className="min-h-10 w-full appearance-none rounded-lg border border-border bg-card py-2 pl-9 pr-8 text-xs font-medium text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
              >
                <option value="">
                  {t("helpdesk.myTicketsPage.filters", {
                    defaultValue: "Filters",
                  })}
                </option>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {t("helpdesk.myTicketsPage.priority." + priority, {
                      defaultValue: priority,
                    })}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>

            <div className="relative">
              <label htmlFor="ticket-sort" className="sr-only">
                {t("helpdesk.myTicketsPage.sortTickets", {
                  defaultValue: "Sort tickets",
                })}
              </label>
              <ArrowDownUp
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <select
                id="ticket-sort"
                name="sort"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as TicketSort);
                  setPage(1);
                }}
                autoComplete="off"
                className="min-h-10 w-full appearance-none rounded-lg border border-border bg-card py-2 pl-9 pr-8 text-xs font-medium text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
              >
                <option value="recent">
                  {t("helpdesk.myTicketsPage.sortRecent", {
                    defaultValue: "Sort: Recent",
                  })}
                </option>
                <option value="oldest">
                  {t("helpdesk.myTicketsPage.sortOldest", {
                    defaultValue: "Sort: Oldest",
                  })}
                </option>
                <option value="priority">
                  {t("helpdesk.myTicketsPage.sortPriority", {
                    defaultValue: "Sort: Priority",
                  })}
                </option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Tickets List */}
      <section className="space-y-2" aria-busy={isLoading}>
        <span className="sr-only" aria-live="polite">
          {isLoading
            ? t("helpdesk.myTicketsPage.loading", { defaultValue: "Loading tickets" })
            : isError
              ? t("helpdesk.myTicketsPage.loadError", {
                  defaultValue: "Tickets could not be loaded.",
                })
              : t("helpdesk.myTicketsPage.resultCount", {
                  count: tickets.length,
                  defaultValue: "{{count}} tickets shown",
                })}
        </span>
        {isLoading ? (
          <>
            <span className="sr-only">
              {t("helpdesk.myTicketsPage.loading", {
                defaultValue: "Loading tickets",
              })}
            </span>
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="grid animate-pulse grid-cols-1 gap-3 rounded-xl border border-border bg-card p-3 shadow-sm lg:grid-cols-[minmax(300px,1fr)_auto_auto_minmax(130px,auto)_minmax(130px,auto)_auto] lg:items-center"
                aria-hidden="true"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-muted" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-2.5 w-14 rounded bg-muted" />
                    <div className="h-3.5 w-2/3 rounded bg-muted" />
                    <div className="h-2.5 w-full rounded bg-muted" />
                  </div>
                </div>
                <div className="h-6 w-16 rounded-full bg-muted" />
                <div className="h-6 w-20 rounded-full bg-muted" />
                <div className="h-9 w-32 rounded bg-muted" />
                <div className="h-9 w-32 rounded bg-muted" />
                <div className="h-9 w-20 rounded bg-muted" />
              </div>
            ))}
          </>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-10 text-center" role="alert">
            <p className="text-sm text-muted-foreground">
              {t("helpdesk.myTicketsPage.loadError", {
                defaultValue: "Tickets could not be loaded.",
              })}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {t("common.retry", { defaultValue: "Retry" })}
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <TicketCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mb-1 text-base font-semibold text-foreground">
              {search || dateRange || priorityFilter || statusFilter
                ? t("helpdesk.myTicketsPage.noMatchingTickets", {
                    defaultValue: "No matching tickets",
                  })
                : t("helpdesk.myTicketsPage.noTickets")}
            </p>
            <p className="text-sm">
              {search || dateRange || priorityFilter || statusFilter
                ? t("helpdesk.myTicketsPage.adjustFilters", {
                    defaultValue: "Try adjusting or clearing your filters.",
                  })
                : t("helpdesk.myTicketsPage.noTicketsHint")}
            </p>
            {(search || dateRange || priorityFilter || statusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("");
                  setSearch("");
                  setDateRange("");
                  setPriorityFilter("");
                  setPage(1);
                }}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {t("helpdesk.myTicketsPage.clearFilters", {
                  defaultValue: "Clear filters",
                })}
              </button>
            )}
          </div>
        ) : (
          tickets.map((ticket) => {
            const StatusIcon = getStatusIcon(ticket.status);
            const detailsPath = "/helpdesk/tickets/" + ticket.id;
            const assignedName = ticket.assigned_to_name?.trim();

            return (
              <article
                key={ticket.id}
                className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-brand-200 hover:bg-muted/20 lg:grid-cols-[minmax(300px,1fr)_auto_auto_minmax(130px,auto)_minmax(130px,auto)_auto] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={[
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      getTicketIconTone(ticket.status),
                    ].join(" ")}
                  >
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-muted-foreground">
                      #{ticket.id}
                    </p>
                    <h2 className="truncate text-[13px] font-semibold text-foreground">
                      {ticket.subject}
                    </h2>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                      {richTextToPlainText(ticket.description || "") ||
                        t("helpdesk.myTicketsPage.noDescription", {
                          defaultValue: "No description provided",
                        })}
                    </p>
                  </div>
                </div>

                <span
                  className={[
                    "inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold capitalize",
                    PRIORITY_COLORS[ticket.priority] ||
                      "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                  {t("helpdesk.myTicketsPage.priority." + ticket.priority, {
                    defaultValue: ticket.priority,
                  })}
                </span>

                <span
                  className={[
                    "inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold",
                    STATUS_COLORS[ticket.status] ||
                      "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  <StatusIcon className="h-3 w-3" aria-hidden="true" />
                  {t("helpdesk.myTicketsPage.status." + ticket.status, {
                    defaultValue: ticket.status.replace(/_/g, " "),
                  })}
                </span>

                <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center lg:grid-cols-1">
                  <div className="flex items-center gap-2">
                    <CalendarDays
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-[11px] font-medium text-foreground">
                        {dateFormatter.format(new Date(ticket.created_at))}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {t("helpdesk.myTicketsPage.createdRelative", {
                          defaultValue: "Created {{relative}}",
                          relative: formatRelativeDate(ticket.created_at),
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center gap-2 lg:hidden">
                    {assignedName ? (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] font-semibold text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                        {getInitials(assignedName)}
                      </span>
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-foreground">
                        {assignedName ||
                          t("helpdesk.myTicketsPage.unassigned", {
                            defaultValue: "Unassigned",
                          })}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {assignedName
                          ? t("helpdesk.myTicketsPage.assignedLabel", {
                              defaultValue: "Assigned",
                            })
                          : t("helpdesk.myTicketsPage.noAssignee", {
                              defaultValue: "No assignee",
                            })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="hidden min-w-0 items-center gap-2 lg:flex">
                  {assignedName ? (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] font-semibold text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                      {getInitials(assignedName)}
                    </span>
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <UserRound className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="max-w-28 truncate text-[11px] font-medium text-foreground">
                      {assignedName ||
                        t("helpdesk.myTicketsPage.unassigned", {
                          defaultValue: "Unassigned",
                        })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {assignedName
                        ? t("helpdesk.myTicketsPage.assignedLabel", {
                            defaultValue: "Assigned",
                          })
                        : t("helpdesk.myTicketsPage.noAssignee", {
                            defaultValue: "No assignee",
                          })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1">
                  <Link
                    to={detailsPath}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-brand-600 shadow-sm transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300 dark:hover:bg-brand-950/30"
                  >
                    {t("helpdesk.myTicketsPage.view", {
                      defaultValue: "View",
                    })}
                  </Link>
                  <details className="group relative">
                    <summary
                      className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden"
                      aria-label={t(
                        "helpdesk.myTicketsPage.moreActionsForTicket",
                        {
                          defaultValue: "More actions for ticket #{{id}}",
                          id: ticket.id,
                        },
                      )}
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                    </summary>
                    <div className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-border bg-card p-1 shadow-lg">
                      <Link
                        to={detailsPath}
                        className="block rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {t("helpdesk.myTicketsPage.viewDetails", {
                          defaultValue: "View details",
                        })}
                      </Link>
                    </div>
                  </details>
                </div>
              </article>
            );
          })
        )}
      </section>

      {/* Pagination */}
      {totalTickets > PAGE_SIZE && (
        <nav
          className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between"
          aria-label={t("helpdesk.myTicketsPage.pagination", {
            defaultValue: "Ticket pagination",
          })}
        >
          <p className="text-sm text-muted-foreground">
            {t("helpdesk.myTicketsPage.pageOf", {
              page,
              total_pages: totalPages,
              total: totalTickets,
            })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("helpdesk.myTicketsPage.previous")}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {t("helpdesk.myTicketsPage.next")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
