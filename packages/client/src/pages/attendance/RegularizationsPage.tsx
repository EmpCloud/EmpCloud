import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUpDown,
  CalendarDays,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Hourglass,
  LayoutGrid,
  List,
  MapPin,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useStickyLocationFilter } from "@/lib/use-sticky-location";
import { showToast } from "@/components/ui/Toast";
import { useDepartments } from "@/api/hooks";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/DateRangePicker";

type RegRow = {
  id: number;
  date: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  rejection_reason?: string | null;
  original_check_in?: string | null;
  original_check_out?: string | null;
  requested_check_in?: string | null;
  requested_check_out?: string | null;
  first_name?: string;
  last_name?: string;
  emp_code?: string;
  email?: string;
  // Joined from the user's assigned location → falls back to the org-level
  // timezone, then to the viewer's browser zone. We display the requested
  // and original punches in this zone so a manager in IST viewing a record
  // raised against a Singapore shift sees the times the employee actually
  // intended (08:09 SGT), not the UTC translation (00:09).
  location_name?: string | null;
  location_timezone?: string | null;
  organization_timezone?: string | null;
  department_name?: string | null;
};

// `original_check_in/out` are real punch timestamps captured server-side in
// UTC, so we shift them into the location's timezone for display.
function fmtTimeAtTZ(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: tz || undefined,
    }).format(new Date(iso));
  } catch {
    // Bad / unrecognised tz string — fall back to viewer-local rendering.
    return new Date(iso).toLocaleTimeString();
  }
}

function fmtDateTimeAtTZ(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: tz || undefined,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function fmtCompactTimeAtTZ(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: tz || undefined,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

function fmtCompactRange(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
  tz?: string | null,
): string {
  if (!checkIn && !checkOut) return "-";
  return `${fmtCompactTimeAtTZ(checkIn, tz)} - ${fmtCompactTimeAtTZ(checkOut, tz)}`;
}

function requestDate(value: string): Date {
  const dateOnly = value.slice(0, 10);
  return new Date(`${dateOnly}T00:00:00`);
}

function fmtRequestDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(requestDate(value));
}

function fmtRequestWeekday(value: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(requestDate(value));
}

function initialsFor(row: RegRow): string {
  return `${row.first_name?.[0] ?? "R"}${row.last_name?.[0] ?? ""}`.toUpperCase();
}

function TableHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <ArrowUpDown aria-hidden="true" className="h-3 w-3 text-slate-400" />
    </span>
  );
}

// `requested_check_in/out` are now stored server-side as real UTC instants
// (matching biometric punches), so they render through the same
// fmtTimeAtTZ / fmtDateTimeAtTZ helpers in the row's location timezone. The
// old "strip the Z and show wall-clock verbatim" helpers were removed: with
// instants, that approach showed the UTC clock (e.g. 20:30 IST as 15:00).
function rowTZ(r: { location_timezone?: string | null; organization_timezone?: string | null }) {
  return r.location_timezone || r.organization_timezone || undefined;
}

export default function RegularizationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"pending" | "all" | "my">("pending");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showForm, setShowForm] = useState(false);
  const [locationId, setLocationId] = useStickyLocationFilter();
  const [departmentId, setDepartmentId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  useEffect(() => {
    const h = window.setTimeout(() => {
      setAppliedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(h);
  }, [search]);
  // Filters apply only to the manager-side queues. The "my" tab is the
  // current user's own list — filtering by location/employee there would
  // either return zero rows or be meaningless.
  const filtersActive = tab !== "my";

  const { data: locations = [] } = useQuery({
    queryKey: ["org-locations"],
    queryFn: () => api.get("/organizations/me/locations").then((r) => r.data.data),
    staleTime: 60000,
    enabled: filtersActive,
  });
  const { data: departments = [] } = useDepartments();
  const [form, setForm] = useState({ date: "", requested_check_in: "", requested_check_out: "", reason: "" });
  // #1559 — Inline validation error so users see why the form wasn't submitted
  // (e.g. check-out earlier than check-in) without a jarring native alert.
  const [formError, setFormError] = useState<string | null>(null);
  // #1629 — Detail modal for the row that was clicked. The reason cell is
  // truncated at 200px so admins couldn't read longer explanations; the
  // modal shows the full record (employee, times, reason, rejection note).
  const [selectedRow, setSelectedRow] = useState<RegRow | null>(null);
  // Reject modal — replaces the native window.prompt() that was used to
  // collect the rejection reason (jarring, unstyled, blocks the page, and
  // inconsistent with the rest of the UI). `rejectTarget` holds the row id
  // being rejected; `rejectReason` is the textarea value.
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ["regularizations", "pending", page, locationId, departmentId, dateFrom, dateTo, appliedSearch, sortOrder],
    queryFn: () =>
      api
        .get("/attendance/regularizations", {
          params: {
            page,
            status: "pending",
            location_id: locationId || undefined,
            department_id: departmentId || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            search: appliedSearch || undefined,
            sort_order: sortOrder === "oldest" ? "asc" : "desc",
          },
        })
        .then((r) => r.data),
    enabled: tab === "pending",
  });

  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ["regularizations", "all", page, locationId, departmentId, dateFrom, dateTo, appliedSearch, sortOrder],
    queryFn: () =>
      api
        .get("/attendance/regularizations", {
          params: {
            page,
            location_id: locationId || undefined,
            department_id: departmentId || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            search: appliedSearch || undefined,
            sort_order: sortOrder === "oldest" ? "asc" : "desc",
          },
        })
        .then((r) => r.data),
    enabled: tab === "all",
  });

  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ["regularizations", "my", page, sortOrder],
    queryFn: () => api.get("/attendance/regularizations/me", { params: { page, sort_order: sortOrder === "oldest" ? "asc" : "desc" } }).then((r) => r.data),
    enabled: tab === "my",
  });

  const { data: summary } = useQuery({
    queryKey: ["regularizations", "summary"],
    queryFn: async () => {
      const [pending, approved, rejected, all, mine] = await Promise.all([
        api.get("/attendance/regularizations", { params: { page: 1, per_page: 1, status: "pending" } }),
        api.get("/attendance/regularizations", { params: { page: 1, per_page: 1, status: "approved" } }),
        api.get("/attendance/regularizations", { params: { page: 1, per_page: 1, status: "rejected" } }),
        api.get("/attendance/regularizations", { params: { page: 1, per_page: 1 } }),
        api.get("/attendance/regularizations/me", { params: { page: 1, per_page: 1 } }),
      ]);
      return {
        pending: Number(pending.data?.meta?.total ?? 0),
        approved: Number(approved.data?.meta?.total ?? 0),
        rejected: Number(rejected.data?.meta?.total ?? 0),
        total: Number(all.data?.meta?.total ?? 0),
        mine: Number(mine.data?.meta?.total ?? 0),
      };
    },
  });

  const submitReg = useMutation({
    mutationFn: (data: typeof form) => api.post("/attendance/regularizations", {
      date: data.date,
      requested_check_in: data.requested_check_in || null,
      requested_check_out: data.requested_check_out || null,
      reason: data.reason,
    }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regularizations"] });
      setShowForm(false);
      setForm({ date: "", requested_check_in: "", requested_check_out: "", reason: "" });
      setFormError(null);
      showToast("success", t("attendance.regularizations.submitSuccess"));
    },
    // The inline formError only covers client-side validation; API submit
    // failures were previously swallowed silently, so surface them as a toast.
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? t("attendance.regularizations.submitError")),
  });

  const processReg = useMutation({
    mutationFn: ({ id, status, rejection_reason }: { id: number; status: "approved" | "rejected"; rejection_reason?: string }) =>
      api.put(`/attendance/regularizations/${id}/approve`, { status, rejection_reason }).then((r) => r.data.data),
    onSuccess: async (_data, variables) => {
      // BUG-22: the pending list didn't drop the approved/rejected row until a
      // manual refresh. invalidateQueries by default only refetches ACTIVE
      // queries and resolves immediately without awaiting; await it with an
      // explicit refetchType: "all" so every regularization query (pending /
      // all / my) is refetched right away and the row disappears reactively.
      await qc.invalidateQueries({ queryKey: ["regularizations"], refetchType: "all" });
      // Close the reject modal once the rejection lands.
      setRejectTarget(null);
      setRejectReason("");
      showToast(
        "success",
        variables.status === "approved"
          ? t("attendance.regularizations.approveSuccess")
          : t("attendance.regularizations.rejectSuccess"),
      );
    },
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? "Action failed."),
  });

  const handleApprove = (id: number) => processReg.mutate({ id, status: "approved" });
  // Open the reject modal instead of a native prompt(). The actual reject
  // fires from the modal's Confirm button below.
  const handleReject = (id: number) => {
    setRejectReason("");
    setRejectTarget(id);
  };
  const confirmReject = () => {
    if (rejectTarget == null) return;
    processReg.mutate({
      id: rejectTarget,
      status: "rejected",
      rejection_reason: rejectReason.trim() || undefined,
    });
  };

  const currentData = tab === "pending" ? pendingData : tab === "all" ? allData : myData;
  const isLoading = tab === "pending" ? pendingLoading : tab === "all" ? allLoading : myLoading;
  const records = currentData?.data || [];
  const meta = currentData?.meta;
  const displayRecords = records as RegRow[];
  const allVisibleSelected = displayRecords.length > 0 && displayRecords.every((row) => selectedIds.has(row.id));
  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) displayRecords.forEach((row) => next.delete(row.id));
      else displayRecords.forEach((row) => next.add(row.id));
      return next;
    });
  };
  const resetFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setLocationId(undefined);
    setDepartmentId("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    // #1559 — Reject check-out earlier than or equal to check-in. The backend
    // may also validate this, but catching it client-side gives an immediate,
    // focused error message instead of a generic API failure.
    if (form.requested_check_in && form.requested_check_out) {
      if (new Date(form.requested_check_out).getTime() <= new Date(form.requested_check_in).getTime()) {
        setFormError(t('attendance.regularizations.checkoutAfterCheckin'));
        return;
      }
    }
    submitReg.mutate(form);
  };

  const setField = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // When the user picks the regularization Date, auto-prefill the date part
  // of the check-in / check-out datetime-local pickers so they only need to
  // type the time -- the date is almost always the same as the regularization
  // date itself. If the user has already typed a time, we preserve it and
  // just swap the date prefix; if either field is empty, we seed it with a
  // sensible default (09:00 in / 18:00 out) that the user can edit.
  // `<input type="datetime-local">` value format is "YYYY-MM-DDTHH:MM"
  // (with optional seconds) -- splitting on the "T" lets us replace the
  // date portion without losing the time the user already entered.
  const handleDateChange = (newDate: string) => {
    setForm((f) => {
      const swap = (existing: string, fallback: string) => {
        if (!newDate) return existing;
        if (!existing) return `${newDate}T${fallback}`;
        const idx = existing.indexOf("T");
        const time = idx >= 0 ? existing.slice(idx + 1) : fallback;
        return `${newDate}T${time}`;
      };
      return {
        ...f,
        date: newDate,
        requested_check_in: swap(f.requested_check_in, "09:00"),
        requested_check_out: swap(f.requested_check_out, "18:00"),
      };
    });
  };

  const tabs = [
    { key: "pending" as const, labelKey: "attendance.regularizations.tabs.pending" },
    { key: "all" as const, labelKey: "attendance.regularizations.tabs.all" },
    { key: "my" as const, labelKey: "attendance.regularizations.tabs.my" },
  ];

  return (
    <div className="space-y-4 px-2">
      <div className="flex -translate-y-2 flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
            <CalendarClock aria-hidden="true" className="h-9 w-9" />
          </span>
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">{t('attendance.regularizations.title')}</h1>
            <p className="mt-1 text-[14px] text-muted-foreground">{t('attendance.regularizations.subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          aria-expanded={showForm}
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-600 px-6 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
        >
          <Plus aria-hidden="true" className="h-4 w-4" /> {t('attendance.regularizations.newRequest')}
        </button>
      </div>

      <div className="!mt-1.5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: t("attendance.regularizations.pendingRequests", { defaultValue: "Pending Requests" }),
            value: summary?.pending ?? 0,
            detail: t("attendance.regularizations.awaitingApproval", { defaultValue: "Awaiting approval" }),
            icon: Hourglass,
            card: "border-amber-100 dark:border-amber-900/50",
            iconBox: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
            blob: "bg-amber-100/70 dark:bg-amber-900/20",
            detailClass: "text-muted-foreground",
          },
          {
            label: t("attendance.regularizations.approvedRequests", { defaultValue: "Approved Requests" }),
            value: summary?.approved ?? 0,
            detail: summary?.total ? `${Math.round(((summary.approved ?? 0) / summary.total) * 100)}% of total` : "0% of total",
            icon: CheckCircle2,
            card: "border-emerald-100 dark:border-emerald-900/50",
            iconBox: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
            blob: "bg-emerald-100/70 dark:bg-emerald-900/20",
            detailClass: "text-emerald-600 dark:text-emerald-400",
          },
          {
            label: t("attendance.regularizations.rejectedRequests", { defaultValue: "Rejected Requests" }),
            value: summary?.rejected ?? 0,
            detail: summary?.total ? `${Math.round(((summary.rejected ?? 0) / summary.total) * 100)}% of total` : "0% of total",
            icon: X,
            card: "border-rose-100 dark:border-rose-900/50",
            iconBox: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
            blob: "bg-rose-100/70 dark:bg-rose-900/20",
            detailClass: "text-rose-600 dark:text-rose-400",
          },
          {
            label: t("attendance.regularizations.totalRequests", { defaultValue: "Total Requests" }),
            value: summary?.total ?? 0,
            detail: t("attendance.regularizations.allTime", { defaultValue: "All time" }),
            icon: FileText,
            card: "border-blue-100 dark:border-blue-900/50",
            iconBox: "bg-blue-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300",
            blob: "bg-blue-100/70 dark:bg-blue-900/20",
            detailClass: "text-muted-foreground",
          },
        ].map(({ label, value, detail, icon: Icon, card, iconBox, blob, detailClass }) => (
          <section key={String(label)} className={cn("relative h-[102px] overflow-hidden rounded-xl border bg-card p-5 shadow-sm", card)}>
            <span aria-hidden="true" className={cn("absolute -bottom-12 -right-5 h-24 w-36 -rotate-12 rounded-[50%]", blob)} />
            <div className="relative z-10 flex items-center gap-5">
              <span className={cn("inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl", iconBox)}>
                <Icon aria-hidden="true" className="h-8 w-8" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{label}</p>
                <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-foreground">{value}</p>
                <p className={cn("mt-1.5 text-[12px] font-medium", detailClass)}>{detail}</p>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Submit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-base font-semibold text-foreground mb-3">{t('attendance.regularizations.submitTitle')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t('attendance.regularizations.date')} <span className="text-red-500">*</span></label>
              <input type="date" value={form.date} onChange={(e) => handleDateChange(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]" required />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t('attendance.regularizations.reason')} <span className="text-red-500">*</span></label>
              <input type="text" value={form.reason} onChange={(e) => setField("reason", e.target.value)} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]" placeholder={t('attendance.regularizations.reasonPlaceholder')} required />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t('attendance.regularizations.requestedCheckIn')}</label>
              <input type="datetime-local" value={form.requested_check_in} onChange={(e) => setField("requested_check_in", e.target.value)} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t('attendance.regularizations.requestedCheckOut')}</label>
              {/* #1559 — `min` ties the check-out picker to the current check-in value
                  so users can't even pick an earlier time from the popover; the
                  handleSubmit check below is the authoritative enforcement. */}
              <input
                type="datetime-local"
                value={form.requested_check_out}
                min={form.requested_check_in || undefined}
                onChange={(e) => setField("requested_check_out", e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
              />
            </div>
          </div>
          {formError && (
            <div className="mt-3 rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">
              {formError}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={submitReg.isPending} className="bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">{t('attendance.regularizations.submit')}</button>
            <button type="button" onClick={() => { setShowForm(false); setFormError(null); }} className="bg-card text-foreground px-4 py-2 border border-border rounded-md text-[13px] hover:bg-muted transition-colors">{t('common.cancel')}</button>
          </div>
        </form>
      )}

      {/* Tabs and filters */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div role="tablist" aria-label={t('attendance.regularizations.title')} className="flex gap-2 overflow-x-auto border-b border-border px-4">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            role="tab"
            aria-selected={tab === tabItem.key}
            onClick={() => { setTab(tabItem.key); setPage(1); }}
            className={`inline-flex h-14 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
              tab === tabItem.key ? "border-brand-600 text-brand-600" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tabItem.labelKey)}
            <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] tabular-nums", tab === tabItem.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>
              {tabItem.key === "pending" ? summary?.pending ?? 0 : tabItem.key === "all" ? summary?.total ?? 0 : summary?.mine ?? 0}
            </span>
          </button>
        ))}
      </div>

      {filtersActive && (
        <div className="grid grid-cols-1 items-end gap-4 px-4 pb-2 pt-3 md:grid-cols-2 xl:grid-cols-[minmax(300px,2fr)_minmax(160px,.9fr)_minmax(160px,.9fr)_minmax(220px,1fr)_130px_168px]">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              name="regularization_employee_search"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("attendance.regularizations.searchEmployee", { defaultValue: "Search employee" })}
              placeholder={t("attendance.regularizations.searchPlaceholder", { defaultValue: "Search by employee name, email or code…" })}
              className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-[14px] text-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <label className="block min-w-0">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{t("attendance.regularizations.location", { defaultValue: "Location" })}</span>
            <select
              value={locationId ?? ""}
              onChange={(e) => { setLocationId(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
              aria-label={t("attendance.regularizations.location", { defaultValue: "Location" })}
              className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">{t("attendance.regularizations.allLocations", { defaultValue: "All locations" })}</option>
              {locations.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{t("attendance.regularizations.department", { defaultValue: "Department" })}</span>
            <select
              value={departmentId}
              onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}
              aria-label={t("attendance.regularizations.department", { defaultValue: "Department" })}
              className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">{t("attendance.regularizations.allDepartments", { defaultValue: "All departments" })}</option>
              {departments.map((department: any) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </label>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            label={t("attendance.regularizations.dateRange", { defaultValue: "Date Range" })}
            allowEmpty
            onApply={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
              setPage(1);
            }}
            onClear={() => {
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
            className="block w-full [&>button]:h-11 [&>button]:w-full [&>button]:justify-between [&>button]:text-[14px]"
          />
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-[13px] font-semibold text-brand-600 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            {t("attendance.regularizations.reset", { defaultValue: "Reset" })}
          </button>
          <button
            type="button"
            onClick={() => { setAppliedSearch(search.trim()); setPage(1); }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          >
            <Filter aria-hidden="true" className="h-4 w-4" />
            {t("attendance.regularizations.applyFilters", { defaultValue: "Apply Filters" })}
          </button>
        </div>
      )}
      </section>

      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-1.5 shadow-sm", viewMode === "table" && "rounded-b-none")}>
        <div className="flex items-center gap-2">
          <Clock aria-hidden="true" className="h-5 w-5 text-brand-600" />
          <h2 className="text-[18px] font-semibold text-foreground">
            {tab === "pending"
              ? t("attendance.regularizations.pendingRequests", { defaultValue: "Pending Requests" })
              : tab === "all"
                ? t("attendance.regularizations.allRequests", { defaultValue: "All Requests" })
                : t("attendance.regularizations.myRequests", { defaultValue: "My Requests" })}
            <span className="ml-1 tabular-nums">({meta?.total ?? displayRecords.length})</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[13px] text-muted-foreground" htmlFor="regularization-sort">{t("attendance.regularizations.sortBy", { defaultValue: "Sort by" })}</label>
          <select
            id="regularization-sort"
            value={sortOrder}
            onChange={(e) => { setSortOrder(e.target.value as "newest" | "oldest"); setPage(1); }}
            className="h-9 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="newest">{t("attendance.regularizations.dateNewest", { defaultValue: "Date (Newest)" })}</option>
            <option value="oldest">{t("attendance.regularizations.dateOldest", { defaultValue: "Date (Oldest)" })}</option>
          </select>
          <div className="inline-flex rounded-lg border border-border bg-card p-1" role="group" aria-label={t("attendance.regularizations.view", { defaultValue: "View" })}>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-pressed={viewMode === "table"}
              aria-label={t("attendance.regularizations.tableView", { defaultValue: "Table view" })}
              className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30", viewMode === "table" ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-muted")}
            >
              <List aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              aria-label={t("attendance.regularizations.gridView", { defaultValue: "Grid view" })}
              className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30", viewMode === "grid" ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-muted")}
            >
              <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      {viewMode === "table" ? <div className="!mt-0 overflow-x-auto rounded-b-xl border border-t-0 border-border bg-card shadow-sm">
        <table className="min-w-[1120px] w-full">
          <caption className="sr-only">{t('attendance.regularizations.title')}</caption>
          <thead className="border-b border-border bg-slate-50/80 dark:bg-slate-900/50">
            <tr>
              <th scope="col" className="w-12 px-4 py-1.5 text-left">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label={t("attendance.regularizations.selectAll", { defaultValue: "Select all visible requests" })}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                />
              </th>
              {tab !== "my" && <th scope="col" className="px-4 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"><TableHeading>{t('attendance.regularizations.table.employee')}</TableHeading></th>}
              <th scope="col" className="px-4 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"><TableHeading>{t('attendance.regularizations.table.date')}</TableHeading></th>
              <th scope="col" className="px-4 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"><TableHeading>{t('attendance.regularizations.table.originalInOut')}</TableHeading></th>
              <th scope="col" className="px-4 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"><TableHeading>{t('attendance.regularizations.table.requestedInOut')}</TableHeading></th>
              <th scope="col" className="px-4 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"><TableHeading>{t('attendance.regularizations.table.reason')}</TableHeading></th>
              <th scope="col" className="px-4 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"><TableHeading>{t('attendance.regularizations.table.status')}</TableHeading></th>
              {tab === "pending" && <th scope="col" className="px-4 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"><TableHeading>{t('attendance.regularizations.table.actions')}</TableHeading></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-[13px] text-muted-foreground">{t('common.loading')}</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-[13px] text-muted-foreground">{t('attendance.regularizations.noRecords')}</td></tr>
            ) : (
              displayRecords.map((r: RegRow) => (
                <tr key={r.id} className="h-[58px] transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => setSelectedIds((current) => {
                        const next = new Set(current);
                        if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                        return next;
                      })}
                      aria-label={t("attendance.regularizations.selectRequest", { defaultValue: `Select request ${r.id}` })}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                    />
                  </td>
                  {tab !== "my" && (
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[13px] font-bold text-brand-600 dark:bg-brand-950/50 dark:text-brand-300">
                          {initialsFor(r)}
                        </span>
                        <div className="min-w-0">
                        <button type="button" onClick={() => setSelectedRow(r)} className="block max-w-[190px] truncate text-left text-[14px] font-semibold text-foreground hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30">{r.first_name} {r.last_name}</button>
                        <p className="max-w-[210px] truncate text-[12px] text-muted-foreground">{r.emp_code || r.email}{r.department_name ? ` · ${r.department_name}` : ""}</p>
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-2 text-[13px] tabular-nums text-foreground">
                    <div className="font-medium">{fmtRequestDate(r.date)}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{fmtRequestWeekday(r.date)}</div>
                  </td>
                  <td className="px-4 py-2 text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                    <div>{fmtTimeAtTZ(r.original_check_in, rowTZ(r))}</div>
                    <div>{fmtTimeAtTZ(r.original_check_out, rowTZ(r))}</div>
                  </td>
                  <td className="px-4 py-2 text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                    <div>{fmtTimeAtTZ(r.requested_check_in, rowTZ(r))}</div>
                    <div>{fmtTimeAtTZ(r.requested_check_out, rowTZ(r))}</div>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300">{r.reason}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                      r.status === "pending" ? "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"
                        : r.status === "approved" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                        : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                    }`}>
                      {r.status === "pending" ? <Clock aria-hidden="true" className="h-3 w-3" /> : r.status === "approved" ? <Check aria-hidden="true" className="h-3 w-3" /> : <X aria-hidden="true" className="h-3 w-3" />}
                      {r.status === "pending" ? t('attendance.regularizations.statusPending') : r.status === "approved" ? t('attendance.regularizations.statusApproved') : t('attendance.regularizations.statusRejected')}
                    </span>
                    {r.rejection_reason && <p className="text-[11px] text-red-500 mt-1 max-w-[200px] truncate">{r.rejection_reason}</p>}
                  </td>
                  {tab === "pending" && (
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(r.id)}
                          disabled={processReg.isPending}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-green-50 px-4 text-[12px] font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-950/40"
                        >
                          <Check aria-hidden="true" className="h-3 w-3" /> {t('attendance.regularizations.approve')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(r.id)}
                          disabled={processReg.isPending}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-50 px-4 text-[12px] font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          <X aria-hidden="true" className="h-3 w-3" /> {t('attendance.regularizations.reject')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedRow(r)}
                          aria-label={t("attendance.regularizations.viewDetails")}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                        >
                          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div> : (
        <div className="!mt-2 grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full rounded-xl border border-border bg-card px-6 py-12 text-center text-[13px] text-muted-foreground">{t('common.loading')}</div>
          ) : displayRecords.length === 0 ? (
            <div className="col-span-full rounded-xl border border-border bg-card px-6 py-12 text-center text-[13px] text-muted-foreground">{t('attendance.regularizations.noRecords')}</div>
          ) : displayRecords.map((r) => (
            <article key={r.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
              <div className="px-4 pt-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[13px] font-bold text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
                    {initialsFor(r)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => setSelectedRow(r)} className="max-w-full truncate text-left text-[14px] font-semibold text-foreground hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30">
                      {r.first_name || r.last_name ? `${r.first_name || ""} ${r.last_name || ""}`.trim() : t("attendance.regularizations.request", { defaultValue: "Regularization request" })}
                    </button>
                    <p className="text-[12px] text-muted-foreground">{r.emp_code || r.email || `#${r.id}`}</p>
                  </div>
                  {r.location_name && <p className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><MapPin aria-hidden="true" className="h-3.5 w-3.5" />{r.location_name}</p>}
                  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold", r.status === "pending" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : r.status === "approved" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300")}>
                    {r.status === "pending" ? <Clock aria-hidden="true" className="h-3 w-3" /> : r.status === "approved" ? <Check aria-hidden="true" className="h-3 w-3" /> : <X aria-hidden="true" className="h-3 w-3" />}
                    {r.status === "pending" ? t('attendance.regularizations.statusPending') : r.status === "approved" ? t('attendance.regularizations.statusApproved') : t('attendance.regularizations.statusRejected')}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 divide-x divide-border border-y border-border py-2">
                  <div className="pr-2">
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CalendarDays aria-hidden="true" className="h-4 w-4" />{t('attendance.regularizations.requestDate', { defaultValue: 'Request Date' })}</p>
                    <p className="mt-1 text-[12px] font-semibold tabular-nums text-foreground">{fmtRequestDate(r.date)}</p>
                  </div>
                  <div className="px-2">
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock aria-hidden="true" className="h-4 w-4" />{t('attendance.regularizations.table.originalInOut')}</p>
                    <p className="mt-1 whitespace-nowrap text-[11px] tabular-nums text-foreground">{fmtCompactRange(r.original_check_in, r.original_check_out, rowTZ(r))}</p>
                  </div>
                  <div className="pl-2">
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock aria-hidden="true" className="h-4 w-4" />{t('attendance.regularizations.table.requestedInOut')}</p>
                    <p className="mt-1 whitespace-nowrap text-[11px] tabular-nums text-foreground">{fmtCompactRange(r.requested_check_in, r.requested_check_out, rowTZ(r))}</p>
                  </div>
                </div>
                <p className="mt-2 flex min-h-5 items-center gap-2 truncate pb-2 text-[12px] text-muted-foreground" title={r.reason}>
                  <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />{r.reason || "—"}
                </p>
              </div>
              {tab === "pending" && (
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-border p-1.5">
                  <button type="button" onClick={() => handleApprove(r.id)} disabled={processReg.isPending} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-emerald-50 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-300"><Check aria-hidden="true" className="h-3.5 w-3.5" />{t('attendance.regularizations.approve')}</button>
                  <button type="button" onClick={() => handleReject(r.id)} disabled={processReg.isPending} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-rose-50 text-[12px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:bg-rose-950/40 dark:text-rose-300"><X aria-hidden="true" className="h-3.5 w-3.5" />{t('attendance.regularizations.reject')}</button>
                  <button type="button" onClick={() => setSelectedRow(r)} aria-label={t('attendance.regularizations.viewDetails')} className="inline-flex h-8 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
          <p className="text-[13px] tabular-nums text-muted-foreground">{t('attendance.pagination', { page: meta.page, totalPages: meta.total_pages, total: meta.total })}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md disabled:opacity-50 hover:bg-muted transition-colors">{t('attendance.previous')}</button>
            <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= meta.total_pages} className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md disabled:opacity-50 hover:bg-muted transition-colors">{t('attendance.next')}</button>
          </div>
        </div>
      )}

      {/* #1629 — Detail modal: opens on row click so the full reason and any
          rejection note are readable in full instead of being truncated. */}
      {selectedRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">{t('attendance.regularizations.detailTitle')}</h3>
                <p className="text-xs tabular-nums text-muted-foreground mt-0.5">{new Date(selectedRow.date).toLocaleDateString()}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label={t('common.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="divide-y divide-border text-[13px]">
              {tab !== "my" && (selectedRow.first_name || selectedRow.last_name) && (
                <div className="grid grid-cols-3 gap-4 px-6 py-3">
                  <dt className="text-muted-foreground">{t('attendance.regularizations.table.employee')}</dt>
                  <dd className="col-span-2 text-foreground">
                    {selectedRow.first_name} {selectedRow.last_name}
                    {(selectedRow.emp_code || selectedRow.email) && (
                      <span className="text-xs text-muted-foreground ml-2">({selectedRow.emp_code || selectedRow.email})</span>
                    )}
                  </dd>
                </div>
              )}
              {selectedRow.location_name && (
                <div className="grid grid-cols-3 gap-4 px-6 py-3">
                  <dt className="text-muted-foreground">Location</dt>
                  <dd className="col-span-2 text-foreground">
                    {selectedRow.location_name}
                    {selectedRow.location_timezone && (
                      <span className="ml-2 text-xs text-muted-foreground">{selectedRow.location_timezone}</span>
                    )}
                  </dd>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 px-6 py-3">
                <dt className="text-muted-foreground">{t('attendance.regularizations.table.originalInOut')}</dt>
                <dd className="col-span-2 text-foreground">
                  <div>{fmtDateTimeAtTZ(selectedRow.original_check_in, rowTZ(selectedRow))}</div>
                  <div className="text-muted-foreground">{fmtDateTimeAtTZ(selectedRow.original_check_out, rowTZ(selectedRow))}</div>
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-4 px-6 py-3">
                <dt className="text-muted-foreground">{t('attendance.regularizations.table.requestedInOut')}</dt>
                <dd className="col-span-2 text-foreground">
                  <div>{fmtDateTimeAtTZ(selectedRow.requested_check_in, rowTZ(selectedRow))}</div>
                  <div className="text-muted-foreground">{fmtDateTimeAtTZ(selectedRow.requested_check_out, rowTZ(selectedRow))}</div>
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-4 px-6 py-3">
                <dt className="text-muted-foreground">{t('attendance.regularizations.table.reason')}</dt>
                <dd className="col-span-2 text-foreground whitespace-pre-wrap break-words">{selectedRow.reason || "-"}</dd>
              </div>
              <div className="grid grid-cols-3 gap-4 px-6 py-3">
                <dt className="text-muted-foreground">{t('attendance.regularizations.table.status')}</dt>
                <dd className="col-span-2">
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium ${
                    selectedRow.status === "pending" ? "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"
                      : selectedRow.status === "approved" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                      : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                  }`}>
                    {selectedRow.status === "pending" ? <Clock aria-hidden="true" className="h-3 w-3" /> : selectedRow.status === "approved" ? <Check aria-hidden="true" className="h-3 w-3" /> : <X aria-hidden="true" className="h-3 w-3" />}
                    {selectedRow.status === "pending" ? t('attendance.regularizations.statusPending') : selectedRow.status === "approved" ? t('attendance.regularizations.statusApproved') : t('attendance.regularizations.statusRejected')}
                  </span>
                </dd>
              </div>
              {selectedRow.rejection_reason && (
                <div className="grid grid-cols-3 gap-4 px-6 py-3">
                  <dt className="text-muted-foreground">{t('attendance.regularizations.rejectionReason')}</dt>
                  <dd className="col-span-2 text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">{selectedRow.rejection_reason}</dd>
                </div>
              )}
            </dl>
            <div className="flex justify-end gap-2 rounded-b-lg border-t border-border bg-muted px-6 py-3">
              {selectedRow.status === "pending" && tab === "pending" && (
                <>
                  <button
                    type="button"
                    onClick={() => { handleReject(selectedRow.id); setSelectedRow(null); }}
                    disabled={processReg.isPending}
                    className="flex items-center gap-1 text-[13px] bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> {t('attendance.regularizations.reject')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleApprove(selectedRow.id); setSelectedRow(null); }}
                    disabled={processReg.isPending}
                    className="flex items-center gap-1 text-[13px] bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-md hover:bg-green-100 dark:hover:bg-green-950/40 disabled:opacity-50 transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" /> {t('attendance.regularizations.approve')}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="px-3 py-1.5 text-[13px] border border-border rounded-md hover:bg-card transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal — replaces the native window.prompt() for collecting the
          rejection reason. Styled to match the rest of the UI, with a textarea
          (multi-line, unlike prompt), a Cancel, and a Confirm that fires the
          rejection. The reason is optional. */}
      {rejectTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <X className="h-5 w-5 text-red-600 dark:text-red-400" />
              {t('attendance.regularizations.reject')}
            </h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t('attendance.regularizations.rejectionPrompt')}
            </p>
            <textarea
              autoFocus
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('attendance.regularizations.rejectionPlaceholder')}
              className="mt-3 w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-[13px] focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRejectTarget(null); setRejectReason(""); }}
                disabled={processReg.isPending}
                className="px-3 py-1.5 text-[13px] border border-border rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={processReg.isPending}
                className="px-3 py-1.5 text-[13px] bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {processReg.isPending ? t('common.loading') : t('attendance.regularizations.reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
