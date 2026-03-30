import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import api from "@/api/client";
import {
  Calendar,
  Users,
  ArrowLeftRight,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";

// --- Helpers ---

function getWeekDates(offset: number): { start: string; end: string; dates: string[] } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay() + offset * 7);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return {
    start: dates[0],
    end: dates[6],
    dates,
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isDateInRange(date: string, from: string, to: string | null): boolean {
  if (date < from) return false;
  if (to && date > to) return false;
  return true;
}

// --- Hooks ---

function useShifts() {
  return useQuery({
    queryKey: ["shifts"],
    queryFn: () => api.get("/attendance/shifts").then((r) => r.data.data),
  });
}

function useSchedule(start: string, end: string) {
  return useQuery({
    queryKey: ["shift-schedule", start, end],
    queryFn: () =>
      api
        .get("/attendance/shifts/schedule", { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: !!start && !!end,
  });
}

function useMySchedule() {
  return useQuery({
    queryKey: ["my-shift-schedule"],
    queryFn: () => api.get("/attendance/shifts/my-schedule").then((r) => r.data.data),
  });
}

function useSwapRequests(status?: string) {
  return useQuery({
    queryKey: ["swap-requests", status],
    queryFn: () =>
      api
        .get("/attendance/shifts/swap-requests", { params: status ? { status } : {} })
        .then((r) => r.data.data),
  });
}

function useEmployees() {
  return useQuery({
    queryKey: ["employees-list"],
    queryFn: () => api.get("/employees", { params: { per_page: 100 } }).then((r) => r.data.data),
  });
}

// --- Component ---

type Tab = "schedule" | "my-schedule" | "swap-requests";

export default function ShiftSchedulePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("schedule");
  const [weekOffset, setWeekOffset] = useState(0);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [showAssign, setShowAssign] = useState<{ userId: number; date: string } | null>(null);

  // Bulk assign form state
  const [bulkShiftId, setBulkShiftId] = useState("");
  const [bulkUserIds, setBulkUserIds] = useState<number[]>([]);
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");

  // Quick assign form state
  const [assignShiftId, setAssignShiftId] = useState("");

  const week = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const { data: shifts = [] } = useShifts();
  const { data: schedule = [], isLoading: scheduleLoading } = useSchedule(week.start, week.end);
  const { data: mySchedule } = useMySchedule();
  const { data: swapRequests = [], isLoading: swapsLoading } = useSwapRequests();
  const { data: employees = [] } = useEmployees();

  const bulkAssign = useMutation({
    mutationFn: (data: any) => api.post("/attendance/shifts/bulk-assign", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-schedule"] });
      setShowBulkAssign(false);
      setBulkShiftId("");
      setBulkUserIds([]);
      setBulkFrom("");
      setBulkTo("");
    },
  });

  const quickAssign = useMutation({
    mutationFn: (data: any) => api.post("/attendance/shifts/assign", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-schedule"] });
      setShowAssign(null);
      setAssignShiftId("");
    },
  });

  const approveSwap = useMutation({
    mutationFn: (id: number) => api.post(`/attendance/shifts/swap-requests/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["swap-requests"] });
      qc.invalidateQueries({ queryKey: ["shift-schedule"] });
    },
  });

  const rejectSwap = useMutation({
    mutationFn: (id: number) => api.post(`/attendance/shifts/swap-requests/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["swap-requests"] }),
  });

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkShiftId || bulkUserIds.length === 0 || !bulkFrom) return;
    bulkAssign.mutate({
      shift_id: Number(bulkShiftId),
      user_ids: bulkUserIds,
      effective_from: bulkFrom,
      effective_to: bulkTo || null,
    });
  };

  const handleQuickAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAssign || !assignShiftId) return;
    quickAssign.mutate({
      user_id: showAssign.userId,
      shift_id: Number(assignShiftId),
      effective_from: showAssign.date,
    });
  };

  const toggleBulkUser = (id: number) => {
    setBulkUserIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id],
    );
  };

  const pendingSwapCount = swapRequests.filter((r: any) => r.status === "pending").length;

  // Shift color map
  const shiftColors: Record<number, string> = {};
  const colorPalette = [
    "bg-blue-100 text-blue-800",
    "bg-green-100 text-green-800",
    "bg-purple-100 text-purple-800",
    "bg-orange-100 text-orange-800",
    "bg-pink-100 text-pink-800",
    "bg-teal-100 text-teal-800",
    "bg-indigo-100 text-indigo-800",
    "bg-yellow-100 text-yellow-800",
  ];
  shifts.forEach((s: any, i: number) => {
    shiftColors[s.id] = colorPalette[i % colorPalette.length];
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shift Schedule</h1>
          <p className="text-gray-500 mt-1">View and manage shift assignments across your team.</p>
        </div>
        <button
          onClick={() => setShowBulkAssign(true)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Users className="h-4 w-4" /> Bulk Assign
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([
          { key: "schedule", label: "Team Schedule", icon: Calendar },
          { key: "my-schedule", label: "My Schedule", icon: Calendar },
          { key: "swap-requests", label: `Swap Requests${pendingSwapCount > 0 ? ` (${pendingSwapCount})` : ""}`, icon: ArrowLeftRight },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.key
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Bulk Assign Modal */}
      {showBulkAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form
            onSubmit={handleBulkSubmit}
            className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 mx-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Bulk Assign Shift</h3>
              <button type="button" onClick={() => setShowBulkAssign(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shift *</label>
                <select
                  value={bulkShiftId}
                  onChange={(e) => setBulkShiftId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                >
                  <option value="">Select shift</option>
                  {shifts.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_time} - {s.end_time})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employees * ({bulkUserIds.length} selected)
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {employees.map((emp: any) => (
                    <label key={emp.id} className="flex items-center gap-2 text-sm px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkUserIds.includes(emp.id)}
                        onChange={() => toggleBulkUser(emp.id)}
                        className="rounded border-gray-300"
                      />
                      {emp.first_name} {emp.last_name}
                      {emp.emp_code && <span className="text-gray-400">({emp.emp_code})</span>}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From *</label>
                  <input
                    type="date"
                    value={bulkFrom}
                    onChange={(e) => setBulkFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To (optional)</label>
                  <input
                    type="date"
                    value={bulkTo}
                    onChange={(e) => setBulkTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowBulkAssign(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">
                Cancel
              </button>
              <button
                type="submit"
                disabled={bulkAssign.isPending}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {bulkAssign.isPending ? "Assigning..." : "Assign Shift"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Assign Modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleQuickAssign} className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Assign Shift</h3>
              <button type="button" onClick={() => setShowAssign(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Date: {formatDate(showAssign.date)}</p>
            <select
              value={assignShiftId}
              onChange={(e) => setAssignShiftId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
              required
            >
              <option value="">Select shift</option>
              {shifts.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start_time} - {s.end_time})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAssign(null)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg">
                Cancel
              </button>
              <button
                type="submit"
                disabled={quickAssign.isPending}
                className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab Content: Team Schedule */}
      {tab === "schedule" && (
        <div>
          {/* Week navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 border border-gray-300 rounded-lg"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <span className="text-sm font-medium text-gray-700">
              {formatDate(week.start)} &mdash; {formatDate(week.end)}
            </span>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 border border-gray-300 rounded-lg"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Shift Legend */}
          {shifts.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {shifts.map((s: any) => (
                <span key={s.id} className={`text-xs px-2 py-1 rounded-full font-medium ${shiftColors[s.id]}`}>
                  {s.name} ({s.start_time}-{s.end_time})
                </span>
              ))}
            </div>
          )}

          {/* Schedule Grid */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 sticky left-0 bg-gray-50 min-w-[180px]">
                    Employee
                  </th>
                  {week.dates.map((date) => (
                    <th key={date} className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 min-w-[120px]">
                      {formatDate(date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scheduleLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      Loading schedule...
                    </td>
                  </tr>
                ) : schedule.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      No employees found
                    </td>
                  </tr>
                ) : (
                  schedule.map((emp: any) => (
                    <tr key={emp.user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 sticky left-0 bg-white">
                        <div className="text-sm font-medium text-gray-900">
                          {emp.first_name} {emp.last_name}
                        </div>
                        {emp.emp_code && (
                          <div className="text-xs text-gray-400">{emp.emp_code}</div>
                        )}
                      </td>
                      {week.dates.map((date) => {
                        const assignment = emp.assignments.find((a: any) =>
                          isDateInRange(date, a.effective_from, a.effective_to),
                        );
                        return (
                          <td key={date} className="px-2 py-3 text-center">
                            {assignment ? (
                              <span
                                className={`text-xs px-2 py-1 rounded-full font-medium ${shiftColors[assignment.shift_id] || "bg-gray-100 text-gray-700"}`}
                              >
                                {assignment.shift_name}
                              </span>
                            ) : (
                              <button
                                onClick={() =>
                                  setShowAssign({ userId: emp.user_id, date })
                                }
                                className="text-gray-300 hover:text-brand-500 transition"
                                title="Assign shift"
                              >
                                <Plus className="h-4 w-4 mx-auto" />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: My Schedule */}
      {tab === "my-schedule" && (
        <div>
          {!mySchedule ? (
            <div className="text-center py-12 text-gray-400">Loading your schedule...</div>
          ) : mySchedule.assignments.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No shift assignments found for the current period.</div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                Showing your shifts from {formatDate(mySchedule.start_date)} to {formatDate(mySchedule.end_date)}
              </p>
              {mySchedule.assignments.map((a: any) => (
                <div
                  key={a.assignment_id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.shift_name}</p>
                    <p className="text-xs text-gray-500">
                      {a.start_time} - {a.end_time}
                      {a.is_night_shift ? " (Night)" : ""}
                      {a.break_minutes ? ` | ${a.break_minutes}min break` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">
                      From: {new Date(a.effective_from).toLocaleDateString()}
                    </p>
                    {a.effective_to && (
                      <p className="text-xs text-gray-400">
                        To: {new Date(a.effective_to).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Swap Requests */}
      {tab === "swap-requests" && (
        <div>
          {swapsLoading ? (
            <div className="text-center py-12 text-gray-400">Loading swap requests...</div>
          ) : swapRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No shift swap requests.</div>
          ) : (
            <div className="space-y-3">
              {swapRequests.map((req: any) => (
                <div
                  key={req.id}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowLeftRight className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">
                          {req.requester_first_name} {req.requester_last_name}
                        </span>
                        <span className="text-xs text-gray-400">wants to swap with</span>
                        <span className="text-sm font-medium text-gray-900">
                          {req.target_first_name} {req.target_last_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>
                          {req.requester_shift_name} &harr; {req.target_shift_name}
                        </span>
                        <span>Date: {new Date(req.date).toLocaleDateString()}</span>
                      </div>
                      {req.reason && (
                        <p className="text-xs text-gray-500 mt-1">Reason: {req.reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {req.status === "pending" ? (
                        <>
                          <button
                            onClick={() => approveSwap.mutate(req.id)}
                            disabled={approveSwap.isPending}
                            className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg font-medium hover:bg-green-100"
                          >
                            <Check className="h-3 w-3" /> Approve
                          </button>
                          <button
                            onClick={() => rejectSwap.mutate(req.id)}
                            disabled={rejectSwap.isPending}
                            className="flex items-center gap-1 text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-medium hover:bg-red-100"
                          >
                            <X className="h-3 w-3" /> Reject
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            req.status === "approved"
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
