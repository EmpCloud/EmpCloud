import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  Pencil,
  Trash2,
  Search,
} from "lucide-react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

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

// Uses the active i18n locale so column headers match the UI language.
function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

// #1954 — `effective_from` / `effective_to` may arrive from the API as full
// ISO strings ("2026-04-26T00:00:00.000Z"), but `date` is YYYY-MM-DD. Naive
// `date < from` then treats the start day itself as out-of-range (the 'T'
// suffix sorts after ''), so an assignment created for Sunday only rendered
// from Monday onwards. Normalize both sides to the day part before comparing.
function ymd(value: string | null | undefined): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function isDateInRange(date: string, from: string, to: string | null): boolean {
  const f = ymd(from);
  const t = ymd(to);
  if (date < f) return false;
  if (t && date > t) return false;
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
  const { t, i18n } = useTranslation();
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
  const [bulkEmployeeSearch, setBulkEmployeeSearch] = useState("");

  // Quick assign form state
  const [assignShiftId, setAssignShiftId] = useState("");

  // Edit assignment state
  const [editAssignment, setEditAssignment] = useState<{
    id: number;
    shift_id: number;
    effective_from: string;
    effective_to: string | null;
  } | null>(null);

  // Team Schedule grid: client-side search + pagination
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

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
      setBulkEmployeeSearch("");
    },
  });

  // Filter the employee list shown in the bulk-assign modal. Match across
  // first / last name, full name, emp_code, and email so HR can find a
  // person by whatever identifier is in front of them. Selected users
  // that fall outside the filter stay selected — the count chip uses
  // bulkUserIds, not the visible rows.
  const filteredBulkEmployees = useMemo(() => {
    const q = bulkEmployeeSearch.trim().toLowerCase();
    if (!q) return employees;
    return (employees as any[]).filter((emp) => {
      const full = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.toLowerCase();
      return (
        full.includes(q) ||
        (emp.first_name ?? "").toLowerCase().includes(q) ||
        (emp.last_name ?? "").toLowerCase().includes(q) ||
        (emp.emp_code ?? "").toString().toLowerCase().includes(q) ||
        (emp.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [employees, bulkEmployeeSearch]);

  const quickAssign = useMutation({
    mutationFn: (data: any) => api.post("/attendance/shifts/assign", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-schedule"] });
      setShowAssign(null);
      setAssignShiftId("");
    },
  });

  const updateAssignment = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.put(`/attendance/shifts/assignments/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-schedule"] });
      setEditAssignment(null);
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: (id: number) => api.delete(`/attendance/shifts/assignments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-schedule"] });
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

  const handleEditAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAssignment) return;
    updateAssignment.mutate({
      id: editAssignment.id,
      data: {
        shift_id: editAssignment.shift_id,
        effective_from: editAssignment.effective_from,
        effective_to: editAssignment.effective_to || null,
      },
    });
  };

  const toggleBulkUser = (id: number) => {
    setBulkUserIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id],
    );
  };

  const pendingSwapCount = swapRequests.filter((r: any) => r.status === "pending").length;

  // Filtered + paginated schedule for the Team Schedule grid.
  const filteredSchedule = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schedule;
    return schedule.filter((emp: any) => {
      const name = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.toLowerCase();
      const code = String(emp.emp_code ?? "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [schedule, search]);

  const totalEntries = filteredSchedule.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalEntries);
  const pagedSchedule = filteredSchedule.slice(startIdx, endIdx);

  // Reset to first page when the search or page-size changes so the user
  // doesn't get stranded on an out-of-range page after filtering.
  useEffect(() => { setPage(1); }, [search, pageSize]);

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
          <h1 className="text-2xl font-bold text-gray-900">{t('attendance.shiftSchedule.title')}</h1>
          <p className="text-gray-500 mt-1">{t('attendance.shiftSchedule.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowBulkAssign(true)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Users className="h-4 w-4" /> {t('attendance.shiftSchedule.bulkAssign')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([
          { key: "schedule", labelKey: "attendance.shiftSchedule.tabs.schedule", icon: Calendar },
          { key: "my-schedule", labelKey: "attendance.shiftSchedule.tabs.mySchedule", icon: Calendar },
          { key: "swap-requests", labelKey: "attendance.shiftSchedule.tabs.swapRequests", icon: ArrowLeftRight },
        ] as const).map((tab_) => (
          <button
            key={tab_.key}
            onClick={() => setTab(tab_.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              tab === tab_.key
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab_.icon className="h-4 w-4" />
            {t(tab_.labelKey)}
            {tab_.key === "swap-requests" && pendingSwapCount > 0 ? ` (${pendingSwapCount})` : ""}
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
              <h3 className="text-lg font-semibold text-gray-900">{t('attendance.shiftSchedule.bulk.title')}</h3>
              <button type="button" onClick={() => { setShowBulkAssign(false); setBulkEmployeeSearch(""); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.shiftSchedule.bulk.shiftLabel')} *</label>
                <select
                  value={bulkShiftId}
                  onChange={(e) => setBulkShiftId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                >
                  <option value="">{t('attendance.shiftSchedule.bulk.selectShift')}</option>
                  {shifts.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_time} - {s.end_time})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('attendance.shiftSchedule.bulk.employees')} * ({t('attendance.shiftSchedule.bulk.selectedCount', { count: bulkUserIds.length })})
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={bulkEmployeeSearch}
                    onChange={(e) => setBulkEmployeeSearch(e.target.value)}
                    placeholder="Search by name, employee code, or email"
                    className="w-full pl-8 pr-8 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  {bulkEmployeeSearch && (
                    <button
                      type="button"
                      onClick={() => setBulkEmployeeSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {filteredBulkEmployees.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2 py-3 text-center">
                      No employees match &ldquo;{bulkEmployeeSearch}&rdquo;
                    </p>
                  ) : (
                    filteredBulkEmployees.map((emp: any) => (
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
                    ))
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.shiftSchedule.bulk.from')} *</label>
                  <input
                    type="date"
                    value={bulkFrom}
                    onChange={(e) => setBulkFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.shiftSchedule.bulk.toOptional')}</label>
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
              <button type="button" onClick={() => { setShowBulkAssign(false); setBulkEmployeeSearch(""); }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={bulkAssign.isPending}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {bulkAssign.isPending ? t('attendance.shiftSchedule.bulk.assigning') : t('attendance.shiftSchedule.bulk.assignShift')}
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
              <h3 className="text-sm font-semibold text-gray-900">{t('attendance.shiftSchedule.quick.title')}</h3>
              <button type="button" onClick={() => setShowAssign(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">{t('attendance.shiftSchedule.quick.dateLabel')}: {formatDate(showAssign.date, i18n.language)}</p>
            <select
              value={assignShiftId}
              onChange={(e) => setAssignShiftId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2"
              required
            >
              <option value="">{t('attendance.shiftSchedule.bulk.selectShift')}</option>
              {shifts.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start_time} - {s.end_time})
                </option>
              ))}
            </select>
            {/* #1952 — warn when the picked shift doesn't include the chosen
                day-of-week so admins don't silently create "Off" assignments. */}
            {(() => {
              const picked = shifts.find((s: any) => String(s.id) === assignShiftId);
              if (!picked) return null;
              const dow = new Date(showAssign.date + "T00:00:00").getDay();
              const wd = String(picked.working_days ?? "1,2,3,4,5")
                .split(",")
                .filter(Boolean)
                .map((d: string) => Number(d));
              if (wd.length > 0 && !wd.includes(dow)) {
                return (
                  <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    {t('attendance.shiftSchedule.quick.offDayWarning', {
                      defaultValue:
                        'This shift is off on the selected day. The schedule cell will show "Off" until you change the shift\'s working days.',
                    })}
                  </p>
                );
              }
              return null;
            })()}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAssign(null)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg">
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={quickAssign.isPending}
                className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {t('attendance.shiftSchedule.quick.assign')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Assignment Modal */}
      {editAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleEditAssignment} className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">{t('attendance.shiftSchedule.edit.title')}</h3>
              <button type="button" onClick={() => setEditAssignment(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.shiftSchedule.edit.shiftLabel')}</label>
                <select
                  value={editAssignment.shift_id}
                  onChange={(e) => setEditAssignment({ ...editAssignment, shift_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                >
                  {shifts.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_time} - {s.end_time})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.shiftSchedule.edit.from')}</label>
                <input
                  type="date"
                  value={editAssignment.effective_from}
                  onChange={(e) => setEditAssignment({ ...editAssignment, effective_from: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.shiftSchedule.edit.toOptional')}</label>
                <input
                  type="date"
                  value={editAssignment.effective_to || ""}
                  onChange={(e) => setEditAssignment({ ...editAssignment, effective_to: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setEditAssignment(null)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg">
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={updateAssignment.isPending}
                className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {updateAssignment.isPending ? t('attendance.shiftSchedule.edit.saving') : t('attendance.shiftSchedule.edit.save')}
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
              <ChevronLeft className="h-4 w-4" /> {t('attendance.previous')}
            </button>
            <span className="text-sm font-medium text-gray-700">
              {formatDate(week.start, i18n.language)} &mdash; {formatDate(week.end, i18n.language)}
            </span>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 border border-gray-300 rounded-lg"
            >
              {t('attendance.next')} <ChevronRight className="h-4 w-4" />
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

          {/* Search + Page size controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>{t('attendance.shiftSchedule.search.show')}</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                aria-label={t('attendance.shiftSchedule.search.show')}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>{t('attendance.shiftSchedule.search.entries')}</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('attendance.shiftSchedule.search.placeholder')}
                className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm w-64 max-w-full focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                aria-label={t('attendance.shiftSchedule.search.placeholder')}
              />
            </div>
          </div>

          {/* Schedule Grid */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {/* #1963 — sticky employee column needs an explicit z-index
                      and a non-translucent border-right; without those, the
                      scrolling shift badges painted over the employee name
                      when the user scrolled the table horizontally. */}
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 sticky left-0 z-20 bg-gray-50 border-r border-gray-200 min-w-[180px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                    {t('attendance.shiftSchedule.team.employee')}
                  </th>
                  {week.dates.map((date) => (
                    <th key={date} className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 min-w-[120px]">
                      {formatDate(date, i18n.language)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scheduleLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      {t('attendance.shiftSchedule.team.loading')}
                    </td>
                  </tr>
                ) : schedule.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      {t('attendance.shiftSchedule.team.noEmployees')}
                    </td>
                  </tr>
                ) : pagedSchedule.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      {t('attendance.shiftSchedule.search.noResults')}
                    </td>
                  </tr>
                ) : (
                  pagedSchedule.map((emp: any) => (
                    <tr key={emp.user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-r border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
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
                        // #1952 — A shift with working_days="1,2,3,4,5" is OFF on
                        // weekends. Render "Off" on those cells so the schedule
                        // reflects what the shift definition actually says.
                        // dayOfWeek: 0=Sun..6=Sat (matches shift.working_days CSV).
                        const dayOfWeek = new Date(date + "T00:00:00").getDay();
                        const workingDays = (assignment?.working_days ?? "")
                          .toString()
                          .split(",")
                          .filter(Boolean)
                          .map((d: string) => Number(d));
                        const isOffDay =
                          assignment && workingDays.length > 0 && !workingDays.includes(dayOfWeek);
                        return (
                          <td key={date} className="px-2 py-3 text-center">
                            {assignment ? (
                              <div className="group relative inline-flex items-center gap-1">
                                {isOffDay ? (
                                  <span
                                    className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-500"
                                    title={t('attendance.shiftSchedule.team.offTooltip', {
                                      defaultValue: '{{shift}} is off on this day',
                                      shift: assignment.shift_name,
                                    })}
                                  >
                                    {t('attendance.shiftSchedule.team.off', { defaultValue: 'Off' })}
                                  </span>
                                ) : (
                                  <span
                                    className={`text-xs px-2 py-1 rounded-full font-medium ${shiftColors[assignment.shift_id] || "bg-gray-100 text-gray-700"}`}
                                  >
                                    {assignment.shift_name}
                                  </span>
                                )}
                                <span className="hidden group-hover:inline-flex items-center gap-0.5">
                                  <button
                                    onClick={() =>
                                      setEditAssignment({
                                        id: assignment.assignment_id,
                                        shift_id: assignment.shift_id,
                                        effective_from: typeof assignment.effective_from === "string"
                                          ? assignment.effective_from.split("T")[0]
                                          : new Date(assignment.effective_from).toISOString().split("T")[0],
                                        effective_to: assignment.effective_to
                                          ? typeof assignment.effective_to === "string"
                                            ? assignment.effective_to.split("T")[0]
                                            : new Date(assignment.effective_to).toISOString().split("T")[0]
                                          : null,
                                      })
                                    }
                                    className="text-gray-400 hover:text-brand-600 p-0.5"
                                    title={t('attendance.shiftSchedule.team.editTooltip')}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm(t('attendance.shiftSchedule.team.removeConfirm'))) {
                                        deleteAssignment.mutate(assignment.assignment_id);
                                      }
                                    }}
                                    className="text-gray-400 hover:text-red-600 p-0.5"
                                    title={t('attendance.shiftSchedule.team.removeTooltip')}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </span>
                              </div>
                            ) : (
                              <button
                                onClick={() =>
                                  setShowAssign({ userId: emp.user_id, date })
                                }
                                className="text-gray-300 hover:text-brand-500 transition"
                                title={t('attendance.shiftSchedule.team.assignTooltip')}
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

          {/* Pagination footer */}
          {totalEntries > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-3 px-1 text-sm text-gray-600">
              <span>
                {t('attendance.shiftSchedule.search.showingRange', {
                  from: startIdx + 1,
                  to: endIdx,
                  total: totalEntries,
                })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" /> {t('attendance.previous')}
                </button>
                <span className="px-3 py-1.5 text-sm font-medium text-gray-700">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('attendance.next')} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: My Schedule */}
      {tab === "my-schedule" && (
        <div>
          {!mySchedule ? (
            <div className="text-center py-12 text-gray-400">{t('attendance.shiftSchedule.my.loading')}</div>
          ) : mySchedule.assignments.length === 0 ? (
            <div className="text-center py-12 text-gray-400">{t('attendance.shiftSchedule.my.noAssignments')}</div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                {t('attendance.shiftSchedule.my.showingFromTo', { from: formatDate(mySchedule.start_date, i18n.language), to: formatDate(mySchedule.end_date, i18n.language) })}
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
                      {a.is_night_shift ? ` ${t('attendance.shiftSchedule.my.nightSuffix')}` : ""}
                      {a.break_minutes ? ` | ${t('attendance.shiftSchedule.my.breakSuffix', { minutes: a.break_minutes })}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">
                      {t('attendance.shiftSchedule.my.from')}: {new Date(a.effective_from).toLocaleDateString(i18n.language)}
                    </p>
                    {a.effective_to && (
                      <p className="text-xs text-gray-400">
                        {t('attendance.shiftSchedule.my.to')}: {new Date(a.effective_to).toLocaleDateString(i18n.language)}
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
            <div className="text-center py-12 text-gray-400">{t('attendance.shiftSchedule.swaps.loading')}</div>
          ) : swapRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-400">{t('attendance.shiftSchedule.swaps.none')}</div>
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
                        <span className="text-xs text-gray-400">{t('attendance.shiftSchedule.swaps.wantsToSwap')}</span>
                        <span className="text-sm font-medium text-gray-900">
                          {req.target_first_name} {req.target_last_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>
                          {req.requester_shift_name} &harr; {req.target_shift_name}
                        </span>
                        <span>{t('attendance.shiftSchedule.swaps.dateLabel')}: {new Date(req.date).toLocaleDateString(i18n.language)}</span>
                      </div>
                      {req.reason && (
                        <p className="text-xs text-gray-500 mt-1">{t('attendance.shiftSchedule.swaps.reasonLabel')}: {req.reason}</p>
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
                            <Check className="h-3 w-3" /> {t('attendance.shiftSchedule.swaps.approve')}
                          </button>
                          <button
                            onClick={() => rejectSwap.mutate(req.id)}
                            disabled={rejectSwap.isPending}
                            className="flex items-center gap-1 text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-medium hover:bg-red-100"
                          >
                            <X className="h-3 w-3" /> {t('attendance.shiftSchedule.swaps.reject')}
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
                          {req.status === "approved" ? t('attendance.shiftSchedule.swaps.statusApproved') : t('attendance.shiftSchedule.swaps.statusRejected')}
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
