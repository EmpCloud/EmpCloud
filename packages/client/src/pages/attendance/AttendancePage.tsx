import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useState, useEffect } from "react";
import { LogIn, LogOut, Clock, AlertCircle, PlusCircle } from "lucide-react";

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

  const checkIn = useMutation({
    mutationFn: () => api.post("/attendance/check-in", { source: "manual" }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
    },
  });

  const checkOut = useMutation({
    mutationFn: () => api.post("/attendance/check-out", { source: "manual" }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
    },
  });

  const [showRegForm, setShowRegForm] = useState(false);
  const [regForm, setRegForm] = useState({
    date: "",
    check_in: "",
    check_out: "",
    reason: "",
  });

  const submitRegularization = useMutation({
    mutationFn: (data: typeof regForm) =>
      api.post("/attendance/regularizations", {
        date: data.date,
        requested_check_in: `${data.date}T${data.check_in}:00`,
        requested_check_out: `${data.date}T${data.check_out}:00`,
        reason: data.reason,
      }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
      setShowRegForm(false);
      setRegForm({ date: "", check_in: "", check_out: "", reason: "" });
    },
  });

  const handleRegSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.date || !regForm.check_in || !regForm.check_out || !regForm.reason) return;
    submitRegularization.mutate(regForm);
  };

  const records = historyData?.data || [];
  const meta = historyData?.meta;

  const hasCheckedIn = !!todayRecord?.check_in;
  const hasCheckedOut = !!todayRecord?.check_out;

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
                    : todayRecord.status === "half_day" ? "bg-yellow-50 text-yellow-700"
                    : "bg-gray-100 text-gray-700"
                }`}>
                  {todayRecord.status.replace(/_/g, " ")}
                </span>
              )}
            </>
          )}
          <div className="ml-auto flex gap-2">
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
        <form onSubmit={handleRegSubmit} className="bg-white rounded-xl border border-amber-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Request Attendance Regularization
          </h2>
          <p className="text-sm text-gray-500 mb-4">Submit a request to correct a missed or incorrect check-in/check-out.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={regForm.date}
                onChange={(e) => setRegForm({ ...regForm, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check In Time</label>
              <input
                type="time"
                value={regForm.check_in}
                onChange={(e) => setRegForm({ ...regForm, check_in: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check Out Time</label>
              <input
                type="time"
                value={regForm.check_out}
                onChange={(e) => setRegForm({ ...regForm, check_out: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input
                type="text"
                value={regForm.reason}
                onChange={(e) => setRegForm({ ...regForm, reason: e.target.value })}
                placeholder="e.g. Forgot to check in"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
          </div>
          {submitRegularization.isError && (
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
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Date</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Check In</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Check Out</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Worked</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Late</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {histLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-12 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded-full" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-10 bg-gray-200 rounded" /></td>
                  </tr>
                ))}
              </>
            ) : records.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No records for this month</td></tr>
            ) : (
              records.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{r.check_in ? new Date(r.check_in).toLocaleTimeString() : "-"}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{r.check_out ? new Date(r.check_out).toLocaleTimeString() : "-"}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {r.worked_minutes != null ? `${Math.floor(r.worked_minutes / 60)}h ${r.worked_minutes % 60}m` : "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      r.status === "present" ? "bg-green-50 text-green-700"
                        : r.status === "half_day" ? "bg-yellow-50 text-yellow-700"
                        : r.status === "on_leave" ? "bg-blue-50 text-blue-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{r.late_minutes ? `${r.late_minutes}m` : "-"}</td>
                </tr>
              ))
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
    </div>
  );
}
