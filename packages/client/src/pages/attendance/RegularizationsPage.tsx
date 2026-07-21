import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X, Clock, Plus } from "lucide-react";
import { useStickyLocationFilter } from "@/lib/use-sticky-location";
import { showToast } from "@/components/ui/Toast";

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
  const [showForm, setShowForm] = useState(false);
  const [locationId, setLocationId] = useStickyLocationFilter();
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
    queryKey: ["regularizations", "pending", page, locationId, appliedSearch],
    queryFn: () =>
      api
        .get("/attendance/regularizations", {
          params: {
            page,
            status: "pending",
            location_id: locationId || undefined,
            search: appliedSearch || undefined,
          },
        })
        .then((r) => r.data),
    enabled: tab === "pending",
  });

  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ["regularizations", "all", page, locationId, appliedSearch],
    queryFn: () =>
      api
        .get("/attendance/regularizations", {
          params: {
            page,
            location_id: locationId || undefined,
            search: appliedSearch || undefined,
          },
        })
        .then((r) => r.data),
    enabled: tab === "all",
  });

  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ["regularizations", "my", page],
    queryFn: () => api.get("/attendance/regularizations/me", { params: { page } }).then((r) => r.data),
    enabled: tab === "my",
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t('attendance.regularizations.title')}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t('attendance.regularizations.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> {t('attendance.regularizations.newRequest')}
        </button>
      </div>

      {/* Submit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-border p-4 mb-4">
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

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1 w-fit">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => { setTab(tabItem.key); setPage(1); }}
            className={`px-4 py-2 text-[13px] font-medium rounded-md transition-colors ${
              tab === tabItem.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      {filtersActive && (
        <div className="bg-card rounded-lg border border-border p-3 mb-4 flex flex-wrap items-end gap-2.5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Search employee</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, code"
              className="bg-card text-foreground px-3 py-2 border border-border rounded-md text-[13px] w-56"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Location</label>
            <select
              value={locationId ?? ""}
              onChange={(e) => { setLocationId(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
              className="bg-card text-foreground px-3 py-2 border border-border rounded-md text-[13px]"
            >
              <option value="">All locations</option>
              {locations.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          {(locationId || search) && (
            <button
              type="button"
              onClick={() => { setLocationId(undefined); setSearch(""); setAppliedSearch(""); setPage(1); }}
              className="px-3 py-2 text-[13px] text-muted-foreground border border-border rounded-md hover:bg-muted transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {tab !== "my" && <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.regularizations.table.employee')}</th>}
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.regularizations.table.date')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.regularizations.table.originalInOut')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.regularizations.table.requestedInOut')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.regularizations.table.reason')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.regularizations.table.status')}</th>
              {tab === "pending" && <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.regularizations.table.actions')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t('common.loading')}</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t('attendance.regularizations.noRecords')}</td></tr>
            ) : (
              records.map((r: RegRow) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedRow(r)}
                  className="hover:bg-muted/50 transition-colors cursor-pointer"
                  title={t('attendance.regularizations.viewDetails')}
                >
                  {tab !== "my" && (
                    <td className="px-4 py-2.5">
                      <div>
                        <p className="text-[13px] font-medium text-foreground">{r.first_name} {r.last_name}</p>
                        <p className="text-[11px] text-muted-foreground">{r.emp_code || r.email}</p>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-[13px] tabular-nums text-foreground">
                    {new Date(r.date).toLocaleDateString()}
                    {r.location_name && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">{r.location_name}{r.location_timezone ? ` · ${r.location_timezone}` : ""}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-muted-foreground">
                    <div>{fmtTimeAtTZ(r.original_check_in, rowTZ(r))}</div>
                    <div>{fmtTimeAtTZ(r.original_check_out, rowTZ(r))}</div>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-muted-foreground">
                    <div>{fmtTimeAtTZ(r.requested_check_in, rowTZ(r))}</div>
                    <div>{fmtTimeAtTZ(r.requested_check_out, rowTZ(r))}</div>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground max-w-[200px] truncate">{r.reason}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium ${
                      r.status === "pending" ? "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"
                        : r.status === "approved" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                        : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                    }`}>
                      {r.status === "pending" ? <Clock className="h-3 w-3" /> : r.status === "approved" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {r.status === "pending" ? t('attendance.regularizations.statusPending') : r.status === "approved" ? t('attendance.regularizations.statusApproved') : t('attendance.regularizations.statusRejected')}
                    </span>
                    {r.rejection_reason && <p className="text-[11px] text-red-500 mt-1 max-w-[200px] truncate">{r.rejection_reason}</p>}
                  </td>
                  {tab === "pending" && (
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(r.id)}
                          disabled={processReg.isPending}
                          className="flex items-center gap-1 text-[11px] bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-md hover:bg-green-100 dark:hover:bg-green-950/40 disabled:opacity-50 transition-colors"
                        >
                          <Check className="h-3 w-3" /> {t('attendance.regularizations.approve')}
                        </button>
                        <button
                          onClick={() => handleReject(r.id)}
                          disabled={processReg.isPending}
                          className="flex items-center gap-1 text-[11px] bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                        >
                          <X className="h-3 w-3" /> {t('attendance.regularizations.reject')}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
            <p className="text-[13px] tabular-nums text-muted-foreground">{t('attendance.pagination', { page: meta.page, totalPages: meta.total_pages, total: meta.total })}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md disabled:opacity-50 hover:bg-muted transition-colors">{t('attendance.previous')}</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.total_pages} className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md disabled:opacity-50 hover:bg-muted transition-colors">{t('attendance.next')}</button>
            </div>
          </div>
        )}
      </div>

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
                    {selectedRow.status === "pending" ? <Clock className="h-3 w-3" /> : selectedRow.status === "approved" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
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
