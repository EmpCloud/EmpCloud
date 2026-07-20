import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  Building2,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  PlusCircle,
  X,
  Users,
  IndianRupee,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";

function formatINR(paise: number): string {
  const value = paise / 100;
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

type SortField = "name" | "created_at" | "user_count" | "subscription_count" | "monthly_spend";

/** Registration-window presets. "custom" reveals the two date inputs. */
type Period = "all" | "today" | "week" | "month" | "year" | "custom";

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Resolve a preset to a {from,to} date pair (local time, inclusive both ends).
 * Week starts Monday to match the server-side stats (MySQL WEEKDAY()).
 */
function periodRange(p: Period): { from?: string; to?: string } {
  const now = new Date();
  const today = isoDate(now);
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday of this week
      return { from: isoDate(d), to: today };
    }
    case "month":
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: today };
    case "year":
      return { from: `${now.getFullYear()}-01-01`, to: today };
    default:
      return {};
  }
}

/** Shared input/select styling so every filter control matches the table card. */
const FIELD_CLS =
  "bg-card text-foreground rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500";

const TONES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400",
};

/**
 * Headline counter. When `onClick` is supplied the card doubles as a filter
 * shortcut (e.g. "Registered Today" applies the today window) and shows a ring
 * while that filter is the active one.
 */
function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value?: number | string;
  tone?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      aria-pressed={clickable ? Boolean(active) : undefined}
      className={`flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors ${
        active ? "border-brand-500 ring-1 ring-brand-500" : "border-border"
      } ${clickable ? "cursor-pointer hover:bg-muted/50" : "cursor-default"}`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONES[tone || "blue"] || TONES.blue}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-foreground">
          {value === undefined || value === null ? "—" : value}
        </p>
      </div>
    </button>
  );
}

export default function OrgListPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  // Filters
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [country, setCountry] = useState("");
  const [hasSub, setHasSub] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    org_name: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    org_country: "IN",
    org_timezone: "Asia/Kolkata",
  });
  const [createError, setCreateError] = useState("");

  const createOrg = useMutation({
    mutationFn: (data: typeof createForm) =>
      api.post("/auth/register", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["admin-org-stats"] });
      setShowCreateModal(false);
      setCreateForm({
        org_name: "",
        email: "",
        first_name: "",
        last_name: "",
        password: "",
        org_country: "IN",
        org_timezone: "Asia/Kolkata",
      });
      setCreateError("");
    },
    onError: (err: any) => {
      setCreateError(
        err?.response?.data?.error?.message || t("orgList.modal.error")
      );
    },
  });

  // Presets resolve to a date range; "custom" uses the two date inputs.
  const range =
    period === "custom"
      ? { from: customFrom || undefined, to: customTo || undefined }
      : periodRange(period);

  const { data, isLoading } = useQuery({
    queryKey: [
      "admin-orgs",
      page,
      search,
      sortBy,
      sortOrder,
      status,
      period,
      customFrom,
      customTo,
      country,
      hasSub,
    ],
    queryFn: () =>
      api
        .get("/admin/organizations", {
          params: {
            page,
            per_page: 20,
            search: search || undefined,
            sort_by: sortBy,
            sort_order: sortOrder,
            status: status || undefined,
            date_from: range.from,
            date_to: range.to,
            country: country || undefined,
            has_subscription: hasSub || undefined,
          },
        })
        .then((r) => r.data),
  });

  // Headline counters are platform-wide (not affected by the filters above).
  const { data: statsRes } = useQuery({
    queryKey: ["admin-org-stats"],
    queryFn: () => api.get("/admin/organizations/stats").then((r) => r.data),
  });
  const stats = statsRes?.data;

  const orgs = data?.data || [];
  const meta = data?.meta || { page: 1, total_pages: 1, total: 0 };

  const filtersActive = Boolean(status || period !== "all" || country || hasSub || search);

  /** Every filter change resets to page 1 so you never land on an empty page. */
  function changeFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  function clearFilters() {
    setStatus("");
    setPeriod("all");
    setCustomFrom("");
    setCustomTo("");
    setCountry("");
    setHasSub("");
    setSearch("");
    setSearchInput("");
    setPage(1);
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field)
      return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("orgList.title")}</h1>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {t("orgList.subtitle", { count: meta.total })}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <PlusCircle className="h-4 w-4" /> {t("orgList.createButton")}
          </button>
        </div>
      </div>

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-card rounded-xl shadow-xl w-full max-w-lg mx-4 z-50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{t("orgList.modal.title")}</h2>
              <button
                onClick={() => { setShowCreateModal(false); setCreateError(""); }}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCreateError("");
                createOrg.mutate(createForm);
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.orgName")} *</label>
                <input
                  type="text"
                  value={createForm.org_name}
                  onChange={(e) => setCreateForm({ ...createForm, org_name: e.target.value })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Acme Corp"
                  required
                  minLength={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.firstName")} *</label>
                  <input
                    type="text"
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="John"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.lastName")} *</label>
                  <input
                    type="text"
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.email")} *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="admin@acme.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.password")} *</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder={t("orgList.modal.placeholders.password")}
                  required
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground mt-1">{t("orgList.modal.passwordHint")}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.country")}</label>
                  <input
                    type="text"
                    value={createForm.org_country}
                    onChange={(e) => setCreateForm({ ...createForm, org_country: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="IN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.timezone")}</label>
                  <input
                    type="text"
                    value={createForm.org_timezone}
                    onChange={(e) => setCreateForm({ ...createForm, org_timezone: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="Asia/Kolkata"
                  />
                </div>
              </div>
              {createError && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300 text-sm rounded-lg px-4 py-3">
                  {createError}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setCreateError(""); }}
                  className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted"
                >
                  {t("orgList.modal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createOrg.isPending}
                  className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4" />
                  {createOrg.isPending ? t("orgList.modal.submitting") : t("orgList.modal.submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats — platform-wide counters. The date/status ones double as filter
          shortcuts, so clicking "Registered Today" filters the table below. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          tone="blue"
          label={t("orgList.stats.total", { defaultValue: "Total Organizations" })}
          value={stats?.total}
          active={period === "all" && !status}
          onClick={() => changeFilter(() => { setPeriod("all"); setStatus(""); })}
        />
        <StatCard
          icon={CalendarDays}
          tone="emerald"
          label={t("orgList.stats.today", { defaultValue: "Registered Today" })}
          value={stats?.today}
          active={period === "today"}
          onClick={() => changeFilter(() => setPeriod(period === "today" ? "all" : "today"))}
        />
        <StatCard
          icon={CalendarRange}
          tone="violet"
          label={t("orgList.stats.thisWeek", { defaultValue: "Registered This Week" })}
          value={stats?.this_week}
          active={period === "week"}
          onClick={() => changeFilter(() => setPeriod(period === "week" ? "all" : "week"))}
        />
        <StatCard
          icon={CalendarClock}
          tone="amber"
          label={t("orgList.stats.thisMonth", { defaultValue: "Registered This Month" })}
          value={stats?.this_month}
          active={period === "month"}
          onClick={() => changeFilter(() => setPeriod(period === "month" ? "all" : "month"))}
        />
        <StatCard
          icon={CheckCircle2}
          tone="emerald"
          label={t("orgList.stats.active", { defaultValue: "Active" })}
          value={stats?.active}
          active={status === "active"}
          onClick={() => changeFilter(() => setStatus(status === "active" ? "" : "active"))}
        />
        <StatCard
          icon={XCircle}
          tone="rose"
          label={t("orgList.stats.inactive", { defaultValue: "Inactive" })}
          value={stats?.inactive}
          active={status === "inactive"}
          onClick={() => changeFilter(() => setStatus(status === "inactive" ? "" : "inactive"))}
        />
        <StatCard
          icon={Users}
          tone="sky"
          label={t("orgList.stats.totalEmployees", { defaultValue: "Total Employees" })}
          value={stats?.total_users}
        />
        <StatCard
          icon={IndianRupee}
          tone="brand"
          label={t("orgList.stats.mrr", { defaultValue: "Monthly Recurring Revenue" })}
          value={stats ? formatINR(stats.mrr) : undefined}
        />
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={handleSearch} className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("orgList.filters.search", { defaultValue: "Search" })}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("orgList.search.placeholder")}
                className={`${FIELD_CLS} w-full pl-10`}
              />
            </div>
          </form>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("orgList.filters.registered", { defaultValue: "Registered" })}
            </label>
            <select
              value={period}
              onChange={(e) => changeFilter(() => setPeriod(e.target.value as Period))}
              className={FIELD_CLS}
            >
              <option value="all">{t("orgList.filters.period.all", { defaultValue: "All time" })}</option>
              <option value="today">{t("orgList.filters.period.today", { defaultValue: "Today" })}</option>
              <option value="week">{t("orgList.filters.period.week", { defaultValue: "This week" })}</option>
              <option value="month">{t("orgList.filters.period.month", { defaultValue: "This month" })}</option>
              <option value="year">{t("orgList.filters.period.year", { defaultValue: "This year" })}</option>
              <option value="custom">{t("orgList.filters.period.custom", { defaultValue: "Custom range" })}</option>
            </select>
          </div>

          {period === "custom" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("orgList.filters.from", { defaultValue: "From" })}
                </label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => changeFilter(() => setCustomFrom(e.target.value))}
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("orgList.filters.to", { defaultValue: "To" })}
                </label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => changeFilter(() => setCustomTo(e.target.value))}
                  className={FIELD_CLS}
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("orgList.table.headers.status")}
            </label>
            <select
              value={status}
              onChange={(e) => changeFilter(() => setStatus(e.target.value))}
              className={FIELD_CLS}
            >
              <option value="">{t("orgList.filters.statusAll", { defaultValue: "All statuses" })}</option>
              <option value="active">{t("orgList.status.active")}</option>
              <option value="inactive">{t("orgList.status.inactive")}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("orgList.filters.subscription", { defaultValue: "Subscription" })}
            </label>
            <select
              value={hasSub}
              onChange={(e) => changeFilter(() => setHasSub(e.target.value))}
              className={FIELD_CLS}
            >
              <option value="">{t("orgList.filters.subAll", { defaultValue: "All" })}</option>
              <option value="true">{t("orgList.filters.subWith", { defaultValue: "With subscription" })}</option>
              <option value="false">{t("orgList.filters.subWithout", { defaultValue: "Without subscription" })}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("orgList.filters.country", { defaultValue: "Country" })}
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => changeFilter(() => setCountry(e.target.value.toUpperCase().slice(0, 2)))}
              placeholder="IN"
              maxLength={2}
              className={`${FIELD_CLS} w-20`}
            />
          </div>

          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("orgList.filters.clear", { defaultValue: "Clear" })}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 border-2 border-border border-t-gray-500 rounded-full animate-spin" />
              <span className="text-sm">{t("orgList.loading")}</span>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th
                      className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-1.5">
                        {t("orgList.table.headers.organization")}
                        <SortIcon field="name" />
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgList.table.headers.adminEmail")}</th>
                    <th
                      className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("user_count")}
                    >
                      <div className="flex items-center gap-1.5">
                        {t("orgList.table.headers.employees")}
                        <SortIcon field="user_count" />
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("subscription_count")}
                    >
                      <div className="flex items-center gap-1.5">
                        {t("orgList.table.headers.activeModules")}
                        <SortIcon field="subscription_count" />
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("monthly_spend")}
                    >
                      <div className="flex items-center gap-1.5">
                        {t("orgList.table.headers.monthlySpend")}
                        <SortIcon field="monthly_spend" />
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t("orgList.table.headers.status")}</th>
                    <th
                      className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("created_at")}
                    >
                      <div className="flex items-center gap-1.5">
                        {t("orgList.table.headers.joined")}
                        <SortIcon field="created_at" />
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org: any) => (
                    <tr
                      key={org.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link
                          to={`/admin/organizations/${org.id}`}
                          className="font-medium text-foreground hover:text-brand-600 transition-colors"
                        >
                          {org.name}
                        </Link>
                        {org.slug && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{org.slug}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{org.email}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                          {org.user_count}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                          {org.subscription_count}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-muted-foreground font-medium">
                          {formatINR(org.monthly_spend)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            org.status === "active"
                              ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {t(`orgList.status.${org.status}`, { defaultValue: org.status })}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {new Date(org.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          to={`/admin/organizations/${org.id}`}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-all"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {orgs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted-foreground">
                        {t("orgList.empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta.total_pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  {t("orgList.pagination.summary", {
                    page: meta.page,
                    totalPages: meta.total_pages,
                    total: meta.total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
                    disabled={page >= meta.total_pages}
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
