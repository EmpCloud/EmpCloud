import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Fingerprint,
  Smartphone,
  Monitor,
} from "lucide-react";
import { useAttendancePolicy } from "@/lib/use-attendance-policy";

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

function sourceMeta(source: string): { label: string; Icon: typeof Fingerprint; cls: string } {
  if (source === "biometric") return { label: "Biometric", Icon: Fingerprint, cls: "bg-purple-50 text-purple-700" };
  if (source === "app") return { label: "Mobile app", Icon: Smartphone, cls: "bg-blue-50 text-blue-700" };
  if (source === "dashboard") return { label: "Web", Icon: Monitor, cls: "bg-emerald-50 text-emerald-700" };
  return { label: source || "Manual", Icon: Monitor, cls: "bg-gray-100 text-gray-700" };
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
    alert(err?.response?.data?.error?.message ?? "Could not record attendance. Please try again.");
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
    },
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
        setRegFormError("Check-out time must be after check-in time.");
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

  const hasCheckedIn = !!todayRecord?.check_in;
  const hasCheckedOut = !!todayRecord?.check_out;
  const { dashboardAllowed } = useAttendancePolicy();

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i).toLocaleString("default", { month: "long" }),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
          <p className="text-gray-500 mt-1">Track your daily attendance and view history.</p>
        </div>
      </div>

      {/* Today's Status + Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Today - {now.toLocaleDateString("default", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</h2>
        <div className="flex flex-wrap items-center gap-4">
          {todayLoading ? (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="h-4 w-24 bg-gray-200 rounded" />
              <div className="h-4 w-24 bg-gray-200 rounded" />
              <div className="h-9 w-28 bg-gray-200 rounded-lg" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                <span>Check In: {todayRecord?.check_in ? new Date(todayRecord.check_in).toLocaleTimeString() : "Not yet"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                <span>Check Out: {todayRecord?.check_out ? new Date(todayRecord.check_out).toLocaleTimeString() : "Not yet"}</span>
              </div>
              {todayRecord?.worked_minutes != null && (
                <div className="text-sm text-gray-600">
                  Worked: {Math.floor(todayRecord.worked_minutes / 60)}h {todayRecord.worked_minutes % 60}m
                </div>
              )}
              {todayRecord?.status && (
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  todayRecord.status === "present" ? "bg-green-50 text-green-700"
                    : todayRecord.status === "checked_in" ? "bg-brand-50 text-brand-700"
                    : todayRecord.status === "half_day" ? "bg-yellow-50 text-yellow-700"
                    : "bg-gray-100 text-gray-700"
                }`}>
                  {todayRecord.status === "checked_in" ? "checked in" : todayRecord.status.replace(/_/g, " ")}
                </span>
              )}
            </>
          )}
          <div className="ml-auto flex gap-2">
            {!dashboardAllowed && !hasCheckedOut ? (
              <span
                className="inline-flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg"
                title="Web check-in is disabled by your administrator. Use the EmpCloud mobile app or a biometric device."
              >
                <Lock className="h-3.5 w-3.5" />
                Web check-in disabled
              </span>
            ) : (
              <>
                {!hasCheckedIn && (
                  <button
                    onClick={() => checkIn.mutate()}
                    disabled={checkIn.isPending}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    <LogIn className="h-4 w-4" /> Check In
                  </button>
                )}
                {hasCheckedIn && !hasCheckedOut && (
                  <button
                    onClick={() => checkOut.mutate()}
                    disabled={checkOut.isPending}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4" /> Check Out
                  </button>
                )}
                {hasCheckedOut && (
                  <span className="text-sm text-gray-500 py-2">Completed for today</span>
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
          className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          {showRegForm ? <AlertCircle className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
          {showRegForm ? "Cancel" : "Request Regularization"}
        </button>
      </div>

      {showRegForm && (
        <form ref={regFormRef} onSubmit={handleRegSubmit} className="bg-white rounded-xl border border-amber-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Request Attendance Regularization
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Submit a request to correct a missed or incorrect check-in/check-out. Pick the full
            date and time for each — for a night shift, set the check-out to the next day.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={regForm.date}
                onChange={(e) => setRegField("date", e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={regForm.reason}
                onChange={(e) => setRegField("reason", e.target.value)}
                placeholder="e.g. Forgot to check in"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Requested Check In
              </label>
              <input
                type="datetime-local"
                value={regForm.requested_check_in}
                onChange={(e) => setRegField("requested_check_in", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Requested Check Out
              </label>
              {/* `min` ties the check-out picker to the current check-in value so users
                  can't even pick an earlier moment from the popover; the handleRegSubmit
                  check above is the authoritative enforcement. */}
              <input
                type="datetime-local"
                value={regForm.requested_check_out}
                min={regForm.requested_check_in || undefined}
                onChange={(e) => setRegField("requested_check_out", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          {regFormError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {regFormError}
            </div>
          )}
          {submitRegularization.isError && !regFormError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mt-4">
              {(submitRegularization.error && typeof submitRegularization.error === "object" && "response" in submitRegularization.error
                ? (submitRegularization.error as any).response?.data?.error?.message
                : null) || "Failed to submit regularization request."}
            </div>
          )}
          <div className="flex justify-end mt-4">
            <button
              type="submit"
              disabled={submitRegularization.isPending}
              className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {submitRegularization.isPending ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      )}

      {/* My Regularization Requests — #1919 */}
      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">My Regularization Requests</h2>
          {myRegRequests.length > 0 && (
            <span className="text-xs text-gray-400">Showing latest {myRegRequests.length}</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Date</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Reason</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3 whitespace-nowrap">Requested Check In</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3 whitespace-nowrap">Requested Check Out</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {regHistLoading ? (
                <tr><td colSpan={5} className="px-6 py-6 text-center text-gray-400">Loading…</td></tr>
              ) : myRegRequests.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-6 text-center text-gray-400">No regularization requests yet.</td></tr>
              ) : (
                myRegRequests.map((r) => {
                  const fmtTime = (v?: string | null) => {
                    if (!v) return "-";
                    const m = String(v).match(/(\d{2}):(\d{2})/);
                    return m ? `${m[1]}:${m[2]}` : String(v);
                  };
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {r.date ? new Date(r.date).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600 max-w-xs truncate" title={r.reason}>
                        {r.reason || "-"}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtTime(r.requested_check_in)}</td>
                      <td className="px-6 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtTime(r.requested_check_out)}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          r.status === "approved" ? "bg-green-50 text-green-700"
                            : r.status === "rejected" ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                        }`}>{r.status}</span>
                        {r.rejection_reason && (
                          <p className="text-xs text-red-500 mt-1" title={r.rejection_reason}>
                            {r.rejection_reason}
                          </p>
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
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 w-10"></th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Date</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Check In</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Check Out</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Worked</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Late</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {histLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-3 py-4"><div className="h-4 w-4 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-12 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded-full" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-10 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-6 bg-gray-200 rounded ml-auto" /></td>
                  </tr>
                ))}
              </>
            ) : records.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">No records for this month</td></tr>
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
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-4 w-10">
                      {canExpand && (
                        <button
                          type="button"
                          onClick={() => setExpandedRowId(expanded ? null : r.id)}
                          className="inline-flex items-center justify-center p-1.5 rounded text-gray-500 hover:bg-gray-100"
                          aria-label={expanded ? "Collapse timeline" : "Expand timeline"}
                          title={expanded ? "Hide timeline" : "Show timeline"}
                          aria-expanded={expanded}
                        >
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{new Date(r.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{r.check_in ? new Date(r.check_in).toLocaleTimeString() : "-"}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{r.check_out ? new Date(r.check_out).toLocaleTimeString() : "-"}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {r.worked_minutes != null ? `${Math.floor(r.worked_minutes / 60)}h ${r.worked_minutes % 60}m` : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        r.status === "present" ? "bg-green-50 text-green-700"
                          : r.status === "checked_in" ? "bg-brand-50 text-brand-700"
                          : r.status === "half_day" ? "bg-yellow-50 text-yellow-700"
                          : r.status === "on_leave" ? "bg-blue-50 text-blue-700"
                          : r.status === "holiday" ? "bg-purple-50 text-purple-700"
                          : r.status === "week_off" ? "bg-gray-100 text-gray-600"
                          : "bg-red-50 text-red-700"
                      }`}>
                        {r.status === "checked_in"
                          ? "checked in"
                          : r.status === "holiday" && r.holiday_name
                            ? r.holiday_name
                            : r.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{r.late_minutes ? `${Math.floor(r.late_minutes / 60)}h ${r.late_minutes % 60}m` : "-"}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openRegularizeFor(r)}
                          className="inline-flex items-center justify-center p-1.5 rounded text-amber-600 hover:bg-amber-50"
                          aria-label="Regularize this day"
                          title="Regularize this day"
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
                            className="inline-flex items-center justify-center p-1.5 rounded text-brand-600 hover:bg-brand-50"
                            aria-label="View attendance details"
                            title="View details"
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
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">Page {meta.page} of {meta.total_pages} ({meta.total} total)</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.total_pages} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50">Next</button>
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
  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance-punches", recordId],
    queryFn: () =>
      api.get(`/attendance/records/${recordId}/punches`).then((res) => res.data.data),
    staleTime: 60_000,
  });
  return (
    <tr className="bg-gray-50">
      <td colSpan={colSpan} className="px-6 py-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading timeline…
          </div>
        ) : isError ? (
          <p className="text-sm text-red-600">Could not load timeline for this record.</p>
        ) : !data?.punches?.length ? (
          <p className="text-sm text-gray-500">No punch history for this day.</p>
        ) : (
          <ol className="space-y-2">
            {(data.punches as PunchRow[]).map((p, idx, arr) => {
              const isFirst = idx === 0;
              const isLast = idx === arr.length - 1 && arr.length > 1;
              const label = isFirst ? "Check in" : isLast ? "Check out" : "Punch";
              const labelCls = isFirst
                ? "bg-green-100 text-green-800"
                : isLast
                ? "bg-rose-100 text-rose-800"
                : "bg-gray-200 text-gray-700";
              const meta = sourceMeta(p.source);
              const Icon = meta.Icon;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-gray-700 w-20">{fmtPunchTime(p.punch_time)}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${labelCls}`}>
                    {label}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${meta.cls}`}>
                    <Icon className="w-3 h-3" /> {meta.label}
                  </span>
                  {p.latitude != null && p.longitude != null && (
                    <span className="text-xs text-gray-400">
                      {Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}
                    </span>
                  )}
                  {p.device_identifier && (
                    <span className="text-xs text-gray-500" title="Device identifier">
                      <span className="text-gray-400">via</span> {p.device_identifier}
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

  const statusLabel = r.status === "checked_in" ? "Checked in" : (r.status || "").replace(/_/g, " ");
  const statusCls =
    r.status === "present" ? "bg-green-50 text-green-700"
      : r.status === "checked_in" ? "bg-brand-50 text-brand-700"
      : r.status === "half_day" ? "bg-yellow-50 text-yellow-700"
      : r.status === "on_leave" ? "bg-blue-50 text-blue-700"
      : "bg-red-50 text-red-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Attendance details</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {r.date ? new Date(r.date).toLocaleDateString() : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase text-gray-400">Check in</p>
              <p className="text-gray-800 mt-0.5">{r.check_in ? new Date(r.check_in).toLocaleTimeString() : "-"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400">Check out</p>
              <p className="text-gray-800 mt-0.5">{r.check_out ? new Date(r.check_out).toLocaleTimeString() : "-"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400">Worked</p>
              <p className="text-gray-800 mt-0.5">
                {r.worked_minutes != null ? `${Math.floor(r.worked_minutes / 60)}h ${r.worked_minutes % 60}m` : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400">Late</p>
              <p className="text-gray-800 mt-0.5">
                {r.late_minutes ? `${Math.floor(r.late_minutes / 60)}h ${r.late_minutes % 60}m` : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400">Status</p>
              <p className="mt-0.5">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusCls}`}>{statusLabel}</span>
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-3">Punch timeline</p>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading timeline…
              </div>
            ) : isError ? (
              <p className="text-sm text-red-600">Could not load timeline for this record.</p>
            ) : !data?.punches?.length ? (
              <p className="text-sm text-gray-500">No punch history for this day.</p>
            ) : (
              <ol className="space-y-2">
                {(data.punches as PunchRow[]).map((p, idx, arr) => {
                  const isFirst = idx === 0;
                  const isLast = idx === arr.length - 1 && arr.length > 1;
                  const label = isFirst ? "Check in" : isLast ? "Check out" : "Punch";
                  const labelCls = isFirst
                    ? "bg-green-100 text-green-800"
                    : isLast
                    ? "bg-rose-100 text-rose-800"
                    : "bg-gray-200 text-gray-700";
                  const meta = sourceMeta(p.source);
                  const Icon = meta.Icon;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-mono text-gray-700 w-20">{fmtPunchTime(p.punch_time)}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${labelCls}`}>
                        {label}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${meta.cls}`}>
                        <Icon className="w-3 h-3" /> {meta.label}
                      </span>
                      {p.latitude != null && p.longitude != null && (
                        <span className="text-xs text-gray-400">
                          {Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}
                        </span>
                      )}
                      {p.device_identifier && (
                        <span className="text-xs text-gray-500" title="Device identifier">
                          <span className="text-gray-400">via</span> {p.device_identifier}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
