import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { useState, useEffect, useRef, Fragment } from "react";
import {
  LogIn,
  LogOut,
  Clock,
  AlertCircle,
  PlusCircle,
  Lock,
  Eye,
  Pencil,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Trash2,
  Fingerprint,
  Smartphone,
  Monitor,
} from "lucide-react";
import { useAttendancePolicy } from "@/lib/use-attendance-policy";
import { showToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// Mirrors the admin dashboard's punch-timeline shape so the drill-down here
// renders identically. The records/:id/punches endpoint is shared.
interface PunchRow {
  id: number;
  punch_time: string;
  source: string;
  latitude: number | string | null;
  longitude: number | string | null;
  device_identifier: string | null;
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function sourceMeta(source: string, t: TFn): { label: string; Icon: typeof Fingerprint; cls: string } {
  if (source === "biometric") return { label: t("attendance.my.sourceBiometric"), Icon: Fingerprint, cls: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300" };
  if (source === "app") return { label: t("attendance.my.sourceApp"), Icon: Smartphone, cls: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" };
  if (source === "dashboard") return { label: t("attendance.my.sourceWeb"), Icon: Monitor, cls: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" };
  return { label: source || t("attendance.my.sourceManual"), Icon: Monitor, cls: "bg-muted text-muted-foreground" };
}

// Punch label for position in a day's timeline (first = check in, last = check out).
function punchLabel(idx: number, len: number, t: TFn): string {
  if (idx === 0) return t("attendance.my.punchCheckIn");
  if (idx === len - 1 && len > 1) return t("attendance.my.punchCheckOut");
  return t("attendance.my.punch");
}

function fmtPunchTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function useToday() {
  const [today, setToday] = useState(() => new Date());
  // Re-check the date on window focus so we never show a stale day after midnight
  useEffect(() => {
    const onFocus = () => {
      const fresh = new Date();
      if (fresh.toDateString() !== today.toDateString()) setToday(fresh);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [today]);
  return today;
}

export default function AttendancePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const now = useToday();
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [page, setPage] = useState(1);

  const { data: todayRecord, isLoading: todayLoading } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () => api.get("/attendance/me/today").then((r) => r.data.data),
    refetchOnWindowFocus: true,
  });

  const { data: historyData, isLoading: histLoading } = useQuery({
    queryKey: ["attendance-history", month, year, page],
    queryFn: () => api.get("/attendance/me/history", { params: { month, year, page } }).then((r) => r.data),
  });

  // #1919 — Employees had no way to see what they'd already submitted
  // (pending / approved / rejected) without bouncing to the admin
  // Regularizations page, which most employees can't reach. Surface their
  // own request history right under the Request Regularization form.
  const { data: regHistoryData, isLoading: regHistLoading } = useQuery({
    queryKey: ["my-regularizations"],
    queryFn: () => api.get("/attendance/regularizations/me", { params: { per_page: 10 } }).then((r) => r.data),
  });
  const myRegRequests: any[] = regHistoryData?.data || [];

  const onAttendanceError = (err: any) =>
    showToast(
      "error",
      err?.response?.data?.error?.message ?? t("attendance.my.errorRecord"),
    );
  const checkIn = useMutation({
    mutationFn: () => api.post("/attendance/check-in", { source: "manual" }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
      qc.invalidateQueries({ queryKey: ["attendance-me-policy"] });
    },
    onError: onAttendanceError,
  });

  const checkOut = useMutation({
    mutationFn: () => api.post("/attendance/check-out", { source: "manual" }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
      qc.invalidateQueries({ queryKey: ["attendance-me-policy"] });
    },
    onError: onAttendanceError,
  });

  const [showRegForm, setShowRegForm] = useState(false);
  const [regForm, setRegForm] = useState({
    date: "",
    requested_check_in: "",
    requested_check_out: "",
    reason: "",
  });
  // Inline validation message — surfaced before we even hit the API when
  // the form is missing fields or check-out is not strictly after check-in.
  const [regFormError, setRegFormError] = useState<string | null>(null);

  const submitRegularization = useMutation({
    mutationFn: (data: typeof regForm) =>
      api
        .post("/attendance/regularizations", {
          date: data.date,
          requested_check_in: data.requested_check_in || null,
          requested_check_out: data.requested_check_out || null,
          reason: data.reason,
        })
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
      qc.invalidateQueries({ queryKey: ["my-regularizations"] });
      setShowRegForm(false);
      setRegForm({ date: "", requested_check_in: "", requested_check_out: "", reason: "" });
      setRegFormError(null);
      showToast("success", t("attendance.my.regSuccess"));
    },
    // Submit errors are already surfaced inline under the form (see the
    // regFormError / submitRegularization.isError blocks in the JSX), so we
    // don't also raise an error toast here to avoid double-messaging.
  });

  // Withdraw a still-pending regularization request. Only pending rows expose
  // this; the server also enforces pending + ownership.
  const deleteRegularization = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/attendance/regularizations/${id}`).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-regularizations"] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
      setDeleteRegId(null);
    },
    onError: (err: any) =>
      showToast("error", err?.response?.data?.error?.message ?? t("attendance.my.errorDelete")),
  });

  const setRegField = (key: keyof typeof regForm, value: string) =>
    setRegForm((f) => ({ ...f, [key]: value }));

  // The regularization form lives above the history table; clicking the
  // per-row pencil scrolls it back into view after we prefill it.
  const regFormRef = useRef<HTMLFormElement | null>(null);

  // Local-time YYYY-MM-DD from a record's `date` (which may be an ISO
  // timestamp or a plain date string depending on the driver).
  const toDateInput = (v: string | null | undefined): string => {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v).slice(0, 10);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // Local-time YYYY-MM-DDTHH:mm for a <input type="datetime-local">.
  const toDatetimeLocal = (v: string | null | undefined): string => {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Open the regularization form for a specific history row. The date is
  // auto-selected from the row; the requested check-in/out are prefilled
  // with the actual punch when it exists, otherwise the SAME date with a
  // sensible placeholder time (so the date is always populated and the
  // employee only has to adjust the time for a missed punch).
  const openRegularizeFor = (record: any) => {
    const dateStr = toDateInput(record?.date);
    const checkIn = record?.check_in
      ? toDatetimeLocal(record.check_in)
      : dateStr
        ? `${dateStr}T09:00`
        : "";
    const checkOut = record?.check_out
      ? toDatetimeLocal(record.check_out)
      : dateStr
        ? `${dateStr}T18:00`
        : "";
    setRegForm({
      date: dateStr,
      requested_check_in: checkIn,
      requested_check_out: checkOut,
      reason: "",
    });
    setRegFormError(null);
    setShowRegForm(true);
    // Defer the scroll a tick so the form is mounted before we scroll.
    setTimeout(() => {
      regFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const handleRegSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegFormError(null);
    if (!regForm.date || !regForm.reason) return;
    if (regForm.requested_check_in && regForm.requested_check_out) {
      if (
        new Date(regForm.requested_check_out).getTime() <=
        new Date(regForm.requested_check_in).getTime()
      ) {
        setRegFormError(t("attendance.my.errorCheckoutAfter"));
        return;
      }
    }
    submitRegularization.mutate(regForm);
  };

  const records = historyData?.data || [];
  const meta = historyData?.meta;

  // Drill-down state — one expanded row at a time, plus a single modal target.
  // Mirrors the admin dashboard's behaviour so My Attendance feels consistent.
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [detailRecord, setDetailRecord] = useState<any | null>(null);
  // Confirm-delete dialog state (replaces window.confirm for deleting a
  // pending regularization request). Holds the id awaiting confirmation.
  const [deleteRegId, setDeleteRegId] = useState<number | null>(null);

  const hasCheckedIn = !!todayRecord?.check_in;
  const hasCheckedOut = !!todayRecord?.check_out;
  const { dashboardAllowed } = useAttendancePolicy();

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i).toLocaleString("default", { month: "long" }),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("attendance.my.title")}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t("attendance.my.subtitle")}</p>
        </div>
      </div>

      {/* Today's Status + Actions */}
      <div className="bg-card rounded-lg border border-border p-4 mb-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("attendance.my.today", { date: now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) })}</h2>
        <div className="flex flex-wrap items-center gap-4">
          {todayLoading ? (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-9 w-28 bg-muted rounded-lg" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{t("attendance.my.checkInLabel")}: <span className="tabular-nums">{todayRecord?.check_in ? new Date(todayRecord.check_in).toLocaleTimeString() : t("attendance.my.notYet")}</span></span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{t("attendance.my.checkOutLabel")}: <span className="tabular-nums">{todayRecord?.check_out ? new Date(todayRecord.check_out).toLocaleTimeString() : t("attendance.my.notYet")}</span></span>
              </div>
              {todayRecord?.worked_minutes != null && (
                <div className="text-[13px] tabular-nums text-muted-foreground">
                  {t("attendance.my.workedLabel")}: {Math.floor(todayRecord.worked_minutes / 60)}h {todayRecord.worked_minutes % 60}m
                </div>
              )}
              {todayRecord?.status && (
                <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                  todayRecord.status === "present" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                    : todayRecord.status === "checked_in" ? "bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300"
                    : todayRecord.status === "half_day" ? "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {t(`attendance.my.status.${todayRecord.status}`, { defaultValue: todayRecord.status.replace(/_/g, " ") })}
                </span>
              )}
            </>
          )}
          <div className="ml-auto flex gap-2">
            {!dashboardAllowed && !hasCheckedOut ? (
              <span
                className="inline-flex items-center gap-2 text-[11px] text-muted-foreground bg-muted border border-border px-3 py-2 rounded-md"
                title={t("attendance.my.webDisabledTooltip")}
              >
                <Lock className="h-3.5 w-3.5" />
                {t("attendance.my.webDisabled")}
              </span>
            ) : (
              <>
                {!hasCheckedIn && (
                  <button
                    onClick={() => checkIn.mutate()}
                    disabled={checkIn.isPending}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <LogIn className="h-4 w-4" /> {t("attendance.my.checkIn")}
                  </button>
                )}
                {hasCheckedIn && !hasCheckedOut && (
                  <button
                    onClick={() => checkOut.mutate()}
                    disabled={checkOut.isPending}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    <LogOut className="h-4 w-4" /> {t("attendance.my.checkOut")}
                  </button>
                )}
                {hasCheckedOut && (
                  <span className="text-[13px] text-muted-foreground py-2">{t("attendance.my.completed")}</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Request Regularization */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowRegForm(!showRegForm)}
          className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-amber-700 transition-colors"
        >
          {showRegForm ? <AlertCircle className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
          {showRegForm ? t("attendance.my.cancel") : t("attendance.my.requestRegularization")}
        </button>
      </div>

      {showRegForm && (
        <form ref={regFormRef} onSubmit={handleRegSubmit} className="bg-card rounded-lg border border-amber-200 dark:border-amber-900/40 p-4 mb-4">
          <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            {t("attendance.my.regFormTitle")}
          </h2>
          <p className="text-[13px] text-muted-foreground mb-4">
            {t("attendance.my.regFormHint")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">
                {t("attendance.my.fieldDate")} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={regForm.date}
                onChange={(e) => setRegField("date", e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">
                {t("attendance.my.fieldReason")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={regForm.reason}
                onChange={(e) => setRegField("reason", e.target.value)}
                placeholder={t("attendance.my.reasonPlaceholder")}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">
                {t("attendance.my.fieldRequestedCheckIn")}
              </label>
              <input
                type="datetime-local"
                value={regForm.requested_check_in}
                onChange={(e) => setRegField("requested_check_in", e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">
                {t("attendance.my.fieldRequestedCheckOut")}
              </label>
              {/* `min` ties the check-out picker to the current check-in value so users
                  can't even pick an earlier moment from the popover; the handleRegSubmit
                  check above is the authoritative enforcement. */}
              <input
                type="datetime-local"
                value={regForm.requested_check_out}
                min={regForm.requested_check_in || undefined}
                onChange={(e) => setRegField("requested_check_out", e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
              />
            </div>
          </div>
          {regFormError && (
            <div className="mt-3 rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">
              {regFormError}
            </div>
          )}
          {submitRegularization.isError && !regFormError && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-[13px] rounded-md px-4 py-3 mt-4">
              {(submitRegularization.error && typeof submitRegularization.error === "object" && "response" in submitRegularization.error
                ? (submitRegularization.error as any).response?.data?.error?.message
                : null) || t("attendance.my.errorSubmit")}
            </div>
          )}
          <div className="flex justify-end mt-4">
            <button
              type="submit"
              disabled={submitRegularization.isPending}
              className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {submitRegularization.isPending ? t("attendance.my.submitting") : t("attendance.my.submitRequest")}
            </button>
          </div>
        </form>
      )}

      {/* My Regularization Requests — #1919 */}
      <div className="bg-card rounded-lg border border-border mb-4">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("attendance.my.myRequests")}</h2>
          {myRegRequests.length > 0 && (
            <span className="text-[11px] text-muted-foreground">{t("attendance.my.showingLatest", { count: myRegRequests.length })}</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colDate")}</th>
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colReason")}</th>
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5 whitespace-nowrap">{t("attendance.my.colRequestedCheckIn")}</th>
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5 whitespace-nowrap">{t("attendance.my.colRequestedCheckOut")}</th>
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colStatus")}</th>
                <th className="text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {regHistLoading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-[13px] text-muted-foreground">{t("attendance.my.loading")}</td></tr>
              ) : myRegRequests.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-[13px] text-muted-foreground">{t("attendance.my.noRequests")}</td></tr>
              ) : (
                myRegRequests.map((r) => {
                  // requested_check_in/out come back as proper UTC instants
                  // (ISO strings). Render them in the viewer's local time —
                  // NOT a regex slice of the raw string, which showed the UTC
                  // wall-clock (e.g. 16:30) instead of the entered 22:00.
                  const fmtTime = (v?: string | null) => {
                    if (!v) return "-";
                    const d = new Date(v);
                    return isNaN(d.getTime())
                      ? String(v)
                      : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  };
                  return (
                    <tr key={r.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-2.5 text-[13px] tabular-nums font-medium text-foreground whitespace-nowrap">
                        {r.date ? new Date(r.date).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-muted-foreground max-w-xs truncate" title={r.reason}>
                        {r.reason || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] tabular-nums text-muted-foreground whitespace-nowrap">{fmtTime(r.requested_check_in)}</td>
                      <td className="px-4 py-2.5 text-[13px] tabular-nums text-muted-foreground whitespace-nowrap">{fmtTime(r.requested_check_out)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                          r.status === "approved" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                            : r.status === "rejected" ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                            : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                        }`}>{t(`attendance.my.reqStatus.${r.status}`, { defaultValue: r.status })}</span>
                        {r.rejection_reason && (
                          <p className="text-[11px] text-red-500 mt-1" title={r.rejection_reason}>
                            {r.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => setDeleteRegId(r.id)}
                            disabled={deleteRegularization.isPending}
                            className="inline-flex items-center justify-center p-1.5 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                            aria-label={t("attendance.my.deletePendingAria")}
                            title={t("attendance.my.deleteRequestTitle")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Month/Year Filters */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={month}
          onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }}
          className="bg-card text-foreground px-3 py-2 border border-border rounded-md text-[13px]"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
          className="bg-card text-foreground px-3 py-2 border border-border rounded-md text-[13px]"
        >
          {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* History Table */}
      <div className="bg-card rounded-lg border border-border overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-3 py-2.5 w-10"></th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colDate")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colCheckIn")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colCheckOut")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colWorked")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colStatus")}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colLate")}</th>
              <th className="text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("attendance.my.colDetails")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {histLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-3 py-2.5"><div className="h-4 w-4 bg-muted rounded" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-20 bg-muted rounded" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-16 bg-muted rounded" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-16 bg-muted rounded" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-12 bg-muted rounded" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-16 bg-muted rounded-full" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-10 bg-muted rounded" /></td>
                    <td className="px-4 py-2.5"><div className="h-4 w-6 bg-muted rounded ml-auto" /></td>
                  </tr>
                ))}
              </>
            ) : records.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">{t("attendance.my.noRecords")}</td></tr>
            ) : (
              records.map((r: any) => {
                // Synthesized rows (holiday / week_off / absent with no real
                // attendance_records row) have no punches timeline to show,
                // so we hide the chevron entirely. The server marks them with
                // `synthesized: true`; we also fall back to a negative-id
                // check in case an older response lacks that flag.
                const isSynth = r.synthesized === true || (typeof r.id === "number" && r.id < 0);
                const canExpand = !isSynth;
                const expanded = canExpand && expandedRowId === r.id;
                return (
                  <Fragment key={r.id}>
                  <tr className="hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2.5 w-10">
                      {canExpand && (
                        <button
                          type="button"
                          onClick={() => setExpandedRowId(expanded ? null : r.id)}
                          className="inline-flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:bg-muted"
                          aria-label={expanded ? t("attendance.my.collapseTimeline") : t("attendance.my.expandTimeline")}
                          title={expanded ? t("attendance.my.hideTimeline") : t("attendance.my.showTimeline")}
                          aria-expanded={expanded}
                        >
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] tabular-nums font-medium text-foreground">{new Date(r.date).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-[13px] tabular-nums text-muted-foreground">{r.check_in ? new Date(r.check_in).toLocaleTimeString() : "-"}</td>
                    <td className="px-4 py-2.5 text-[13px] tabular-nums text-muted-foreground">{r.check_out ? new Date(r.check_out).toLocaleTimeString() : "-"}</td>
                    <td className="px-4 py-2.5 text-[13px] tabular-nums text-muted-foreground">
                      {r.worked_minutes != null ? `${Math.floor(r.worked_minutes / 60)}h ${r.worked_minutes % 60}m` : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                        r.status === "present" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                          : r.status === "checked_in" ? "bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300"
                          : r.status === "half_day" ? "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"
                          : r.status === "on_leave" ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                          : r.status === "holiday" ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300"
                          : r.status === "week_off" ? "bg-muted text-muted-foreground"
                          : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                      }`}>
                        {r.status === "holiday" && r.holiday_name
                          ? r.holiday_name
                          : t(`attendance.my.status.${r.status}`, { defaultValue: r.status.replace(/_/g, " ") })}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] tabular-nums text-muted-foreground">{r.late_minutes ? `${Math.floor(r.late_minutes / 60)}h ${r.late_minutes % 60}m` : "-"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openRegularizeFor(r)}
                          className="inline-flex items-center justify-center p-1.5 rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                          aria-label={t("attendance.my.regularizeDay")}
                          title={t("attendance.my.regularizeDay")}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {/* View-details opens the modal that fetches the
                            punches timeline by record id; synthesized rows
                            have no real id, so the modal would 404. Hide it. */}
                        {canExpand && (
                          <button
                            type="button"
                            onClick={() => setDetailRecord(r)}
                            className="inline-flex items-center justify-center p-1.5 rounded-md text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors"
                            aria-label={t("attendance.my.viewDetailsAria")}
                            title={t("attendance.my.viewDetailsTitle")}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && <InlinePunchTimelineRow recordId={r.id} colSpan={8} />}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
            <p className="text-[13px] tabular-nums text-muted-foreground">{t("attendance.my.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md disabled:opacity-50 hover:bg-muted transition-colors">{t("attendance.my.previous")}</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.total_pages} className="bg-card text-foreground px-3 py-1.5 text-[13px] border border-border rounded-md disabled:opacity-50 hover:bg-muted transition-colors">{t("attendance.my.next")}</button>
            </div>
          </div>
        )}
      </div>

      {detailRecord && (
        <AttendanceDetailModal
          record={detailRecord}
          onClose={() => setDetailRecord(null)}
        />
      )}

      <ConfirmDialog
        open={deleteRegId !== null}
        title={t("attendance.my.deleteDialogTitle")}
        description={t("attendance.my.deleteDialogDesc")}
        confirmText={t("attendance.my.delete")}
        variant="danger"
        loading={deleteRegularization.isPending}
        onConfirm={() => deleteRegId !== null && deleteRegularization.mutate(deleteRegId)}
        onCancel={() => setDeleteRegId(null)}
      />
    </div>
  );
}

// =============================================================================
// Inline punch timeline + detail modal — mirrors the admin dashboard so that
// the My Attendance drill-down shows the same per-day check-in / check-out
// breakdown HR sees. Both components hit the existing
// /attendance/records/:id/punches endpoint lazily.
// =============================================================================

function InlinePunchTimelineRow({ recordId, colSpan }: { recordId: number; colSpan: number }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance-punches", recordId],
    queryFn: () =>
      api.get(`/attendance/records/${recordId}/punches`).then((res) => res.data.data),
    staleTime: 60_000,
  });
  return (
    <tr className="bg-muted">
      <td colSpan={colSpan} className="px-4 py-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("attendance.my.loadingTimeline")}
          </div>
        ) : isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{t("attendance.my.timelineError")}</p>
        ) : !data?.punches?.length ? (
          <p className="text-sm text-muted-foreground">{t("attendance.my.noPunches")}</p>
        ) : (
          <ol className="space-y-2">
            {(data.punches as PunchRow[]).map((p, idx, arr) => {
              const isFirst = idx === 0;
              const isLast = idx === arr.length - 1 && arr.length > 1;
              const label = punchLabel(idx, arr.length, t);
              const labelCls = isFirst
                ? "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-200"
                : isLast
                ? "bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200"
                : "bg-muted text-muted-foreground";
              const meta = sourceMeta(p.source, t);
              const Icon = meta.Icon;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-muted-foreground w-20">{fmtPunchTime(p.punch_time)}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${labelCls}`}>
                    {label}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] ${meta.cls}`}>
                    <Icon className="w-3 h-3" /> {meta.label}
                  </span>
                  {p.latitude != null && p.longitude != null && (
                    <span className="text-xs text-muted-foreground">
                      {Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}
                    </span>
                  )}
                  {p.device_identifier && (
                    <span className="text-xs text-muted-foreground" title={t("attendance.my.deviceIdentifier")}>
                      <span className="text-muted-foreground">{t("attendance.my.via")}</span> {p.device_identifier}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </td>
    </tr>
  );
}

function AttendanceDetailModal({
  record: r,
  onClose,
}: {
  record: any;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance-punches", r.id],
    queryFn: () =>
      api.get(`/attendance/records/${r.id}/punches`).then((res) => res.data.data),
    staleTime: 60_000,
  });

  // ESC closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const statusLabel = t(`attendance.my.status.${r.status}`, { defaultValue: (r.status || "").replace(/_/g, " ") });
  const statusCls =
    r.status === "present" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
      : r.status === "checked_in" ? "bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300"
      : r.status === "half_day" ? "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"
      : r.status === "on_leave" ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
      : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-semibold text-foreground">{t("attendance.my.detailsTitle")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {r.date ? new Date(r.date).toLocaleDateString() : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
            aria-label={t("attendance.my.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase text-muted-foreground">{t("attendance.my.colCheckIn")}</p>
              <p className="text-foreground mt-0.5">{r.check_in ? new Date(r.check_in).toLocaleTimeString() : "-"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">{t("attendance.my.colCheckOut")}</p>
              <p className="text-foreground mt-0.5">{r.check_out ? new Date(r.check_out).toLocaleTimeString() : "-"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">{t("attendance.my.colWorked")}</p>
              <p className="text-foreground mt-0.5">
                {r.worked_minutes != null ? `${Math.floor(r.worked_minutes / 60)}h ${r.worked_minutes % 60}m` : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">{t("attendance.my.colLate")}</p>
              <p className="text-foreground mt-0.5">
                {r.late_minutes ? `${Math.floor(r.late_minutes / 60)}h ${r.late_minutes % 60}m` : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">{t("attendance.my.colStatus")}</p>
              <p className="mt-0.5">
                <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${statusCls}`}>{statusLabel}</span>
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-3">{t("attendance.my.punchTimeline")}</p>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> {t("attendance.my.loadingTimeline")}
              </div>
            ) : isError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{t("attendance.my.timelineError")}</p>
            ) : !data?.punches?.length ? (
              <p className="text-sm text-muted-foreground">{t("attendance.my.noPunches")}</p>
            ) : (
              <ol className="space-y-2">
                {(data.punches as PunchRow[]).map((p, idx, arr) => {
                  const isFirst = idx === 0;
                  const isLast = idx === arr.length - 1 && arr.length > 1;
                  const label = punchLabel(idx, arr.length, t);
                  const labelCls = isFirst
                    ? "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-200"
                    : isLast
                    ? "bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200"
                    : "bg-muted text-muted-foreground";
                  const meta = sourceMeta(p.source, t);
                  const Icon = meta.Icon;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-mono text-muted-foreground w-20">{fmtPunchTime(p.punch_time)}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${labelCls}`}>
                        {label}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] ${meta.cls}`}>
                        <Icon className="w-3 h-3" /> {meta.label}
                      </span>
                      {p.latitude != null && p.longitude != null && (
                        <span className="text-xs text-muted-foreground">
                          {Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}
                        </span>
                      )}
                      {p.device_identifier && (
                        <span className="text-xs text-muted-foreground" title={t("attendance.my.deviceIdentifier")}>
                          <span className="text-muted-foreground">{t("attendance.my.via")}</span> {p.device_identifier}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] border border-border rounded-md hover:bg-muted transition-colors"
          >
            {t("attendance.my.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
