import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { useStickyLocationFilter } from "@/lib/use-sticky-location";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "org_admin", label: "Org Admin" },
];
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

// Whole-month view: every calendar day of the month `offset` months from
// the current one becomes a column, so an employee's full month of shifts
// reads in a single row (navigate by month, not week).
function getMonthDates(offset: number): {
  start: string;
  end: string;
  dates: string[];
  year: number;
  month: number; // 0-11
} {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  }
  return { start: dates[0], end: dates[dates.length - 1], dates, year, month };
}

// Uses the active i18n locale so labels match the UI language.
function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

function formatMonthLabel(year: number, month: number, locale: string): string {
  return new Date(year, month, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

// Compact per-day column header for the month grid: weekday initial + day
// number stacked, so ~31 columns stay narrow.
function dayHeaderParts(dateStr: string, locale: string): { weekday: string; day: number } {
  const d = new Date(dateStr + "T00:00:00");
  return {
    weekday: d.toLocaleDateString(locale, { weekday: "short" }),
    day: d.getDate(),
  };
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
    // Fetch up to the validator ceiling (paginationSchema max=500). The team
    // schedule grid cross-references this list to filter by department /
    // location / role; capping at 100 silently dropped any org bigger than
    // that and made the filters miss rows whose user_id wasn't in page 1.
    queryFn: () => api.get("/employees", { params: { per_page: 500 } }).then((r) => r.data.data),
  });
}

// --- Component ---

type Tab = "schedule" | "my-schedule" | "swap-requests";

export default function ShiftSchedulePage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("schedule");
  const [monthOffset, setMonthOffset] = useState(0);
  // Confirm-delete dialog state (replaces window.confirm for removing a shift assignment).
  const [removeAssignmentId, setRemoveAssignmentId] = useState<number | null>(null);
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
  // #67 — Week-off toggle for the Edit Assignment modal. Decoupled from
  // the shift dropdown so HR can flip "this day is off" without scrolling
  // a dropdown to find a sentinel entry. The actual shift_id sent to the
  // server is the org's weekoff sentinel when this is on; otherwise it's
  // whatever the dropdown is showing.
  const [editIsWeekoff, setEditIsWeekoff] = useState(false);

  // Team Schedule grid: client-side search + pagination + filters.
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  // Department / Role / Location filters mirror the other admin pages so HR
  // can narrow the team-schedule view to one office, one team, or one role.
  // Location is sticky across pages via the shared hook.
  const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
  const [locationId, setLocationId] = useStickyLocationFilter();
  const [roleFilter, setRoleFilter] = useState<string>("");

  const month = useMemo(() => getMonthDates(monthOffset), [monthOffset]);

  const { data: shifts = [] } = useShifts();

  // #67 — Split shifts into "real" working shifts and the weekoff sentinel.
  // The dropdown only shows working shifts now (the sentinel is exposed
  // via the toggle below). `weekoffShiftId` is the id we substitute into
  // the request payload when the toggle is on.
  const workingShifts = useMemo(
    () => (shifts as any[]).filter((s: any) => !s.is_weekoff),
    [shifts],
  );
  const weekoffShiftId = useMemo(() => {
    const found = (shifts as any[]).find((s: any) => s.is_weekoff);
    return found ? (found.id as number) : null;
  }, [shifts]);
  const { data: schedule = [], isLoading: scheduleLoading } = useSchedule(month.start, month.end);
  const { data: mySchedule } = useMySchedule();
  const { data: swapRequests = [], isLoading: swapsLoading } = useSwapRequests();
  const { data: employees = [] } = useEmployees();
  const { data: departments = [] } = useQuery({
    queryKey: ["org-departments"],
    queryFn: () => api.get("/organizations/me/departments").then((r) => r.data.data),
    staleTime: 60000,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["org-locations"],
    queryFn: () => api.get("/organizations/me/locations").then((r) => r.data.data),
    staleTime: 60000,
  });

  // The /attendance/shifts/schedule response only carries the columns the
  // grid needs to render (name, emp_code, assignments). To filter by
  // department / location / role we cross-reference with the directory
  // pulled by useEmployees() — same data the bulk-assign modal uses.
  const employeeMetaById = useMemo(() => {
    const m = new Map<number, { department_id?: number | null; location_id?: number | null; role?: string; email?: string }>();
    for (const e of employees as any[]) {
      m.set(e.id, {
        department_id: e.department_id ?? null,
        location_id: e.location_id ?? null,
        role: e.role,
        email: e.email,
      });
    }
    return m;
  }, [employees]);

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
      setRemoveAssignmentId(null);
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
    // #67 — Substitute the weekoff sentinel id when the toggle is on, so
    // the existing sub-range split logic in updateShiftAssignment carves
    // out the weekoff days and preserves the surrounding shift.
    const submitShiftId =
      editIsWeekoff && weekoffShiftId != null ? weekoffShiftId : editAssignment.shift_id;
    updateAssignment.mutate({
      id: editAssignment.id,
      data: {
        shift_id: submitShiftId,
        effective_from: editAssignment.effective_from,
        effective_to: editAssignment.effective_to || null,
      },
    });
  };

  // #67 — Sync the toggle when the modal opens: if the user pencil-clicked
  // a cell that's already a weekoff assignment, start the modal with the
  // toggle on AND repoint the dropdown to a real working shift so the
  // user has something sensible to fall back to if they flip the toggle
  // off. The original shift_id from the assignment row is the weekoff
  // sentinel id, which we deliberately hide from the dropdown.
  useEffect(() => {
    if (!editAssignment) {
      setEditIsWeekoff(false);
      return;
    }
    const isCurrentlyWeekoff =
      weekoffShiftId != null && editAssignment.shift_id === weekoffShiftId;
    setEditIsWeekoff(isCurrentlyWeekoff);
    if (isCurrentlyWeekoff) {
      // Repoint the dropdown silently. The submit handler ignores
      // editAssignment.shift_id when editIsWeekoff is true, so this
      // doesn't affect what gets sent -- it just keeps the disabled
      // dropdown showing a real shift name for clarity.
      const fallback = workingShifts[0]?.id as number | undefined;
      if (fallback && editAssignment.shift_id !== fallback) {
        setEditAssignment((prev) => (prev ? { ...prev, shift_id: fallback } : prev));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAssignment?.id]);

  const toggleBulkUser = (id: number) => {
    setBulkUserIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id],
    );
  };

  const pendingSwapCount = swapRequests.filter((r: any) => r.status === "pending").length;

  // Filtered + paginated schedule for the Team Schedule grid.
  const filteredSchedule = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (schedule as any[]).filter((emp: any) => {
      // Cross-reference metadata for non-name filters. If the directory
      // hasn't loaded yet (or the schedule row references an employee
      // outside the org for some reason) the row is hidden when any
      // metadata filter is active, so HR doesn't see "leaked" rows.
      const meta = employeeMetaById.get(emp.user_id);
      if (departmentId != null) {
        if (!meta || meta.department_id !== departmentId) return false;
      }
      if (locationId != null) {
        if (!meta || meta.location_id !== locationId) return false;
      }
      if (roleFilter) {
        if (!meta || meta.role !== roleFilter) return false;
      }
      if (q) {
        const name = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.toLowerCase();
        const code = String(emp.emp_code ?? "").toLowerCase();
        const email = String(meta?.email ?? "").toLowerCase();
        if (!name.includes(q) && !code.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [schedule, search, departmentId, locationId, roleFilter, employeeMetaById]);

  const totalEntries = filteredSchedule.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalEntries);
  const pagedSchedule = filteredSchedule.slice(startIdx, endIdx);

  // Reset to first page when the search or page-size changes so the user
  // doesn't get stranded on an out-of-range page after filtering.
  useEffect(() => { setPage(1); }, [search, pageSize, departmentId, locationId, roleFilter]);

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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {t('attendance.shiftSchedule.bulk.employees')} * ({t('attendance.shiftSchedule.bulk.selectedCount', { count: bulkUserIds.length })})
                  </label>
                  {bulkUserIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBulkUserIds([])}
                      className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Clear selection
                    </button>
                  )}
                </div>
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
                  {(() => {
                    const visibleIds: number[] = filteredBulkEmployees.map((emp: any) => emp.id as number);
                    const visibleSelectedCount = visibleIds.filter((id: number) => bulkUserIds.includes(id)).length;
                    const allVisibleSelected =
                      visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
                    const someVisibleSelected =
                      visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length;
                    const handleSelectAllVisible = () => {
                      if (visibleIds.length === 0) return;
                      if (allVisibleSelected) {
                        // Unselect only visible employees, preserve out-of-view selections.
                        setBulkUserIds((prev) => prev.filter((id: number) => !visibleIds.includes(id)));
                      } else {
                        // Additive: add any visible employees not already selected.
                        setBulkUserIds((prev) => {
                          const merged = new Set<number>(prev);
                          visibleIds.forEach((id: number) => merged.add(id));
                          return Array.from(merged);
                        });
                      }
                    };
                    return (
                      <label
                        className={`sticky top-0 -mx-2 -mt-2 mb-1 px-2 py-1 flex items-center gap-2 text-sm font-medium bg-gray-50 border-b border-gray-200 rounded-t-lg ${
                          filteredBulkEmployees.length === 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-gray-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          ref={(el) => {
                            if (el) el.indeterminate = someVisibleSelected;
                          }}
                          checked={allVisibleSelected}
                          disabled={filteredBulkEmployees.length === 0}
                          onChange={handleSelectAllVisible}
                          className="rounded border-gray-300"
                        />
                        <span className="text-gray-700">
                          Select all ({filteredBulkEmployees.length} visible)
                        </span>
                      </label>
                    );
                  })()}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('attendance.shiftSchedule.edit.shiftLabel')}
                </label>
                {/*
                  Shift dropdown stays enabled even when "Mark as Week-off"
                  is on. The week-off override is intended for cases like
                  "one extra weekoff this month on top of the existing
                  shift" -- HR needs to see which shift is in effect for
                  the surrounding range. The submit handler picks the
                  weekoff sentinel id when the toggle is on, otherwise
                  uses the dropdown value, so the two controls are
                  decoupled: the dropdown is the "what shift applies on
                  non-weekoff days" reference.
                */}
                <select
                  value={editAssignment.shift_id}
                  onChange={(e) =>
                    setEditAssignment({ ...editAssignment, shift_id: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                >
                  {workingShifts.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_time} - {s.end_time})
                    </option>
                  ))}
                </select>
                {editIsWeekoff && (
                  <p className="mt-1 text-xs text-amber-700">
                    {t('attendance.shiftSchedule.edit.weekoffOverrideHint', {
                      defaultValue:
                        'Selected date range will be saved as Week-off. The shift above stays in effect for the surrounding dates.',
                    })}
                  </p>
                )}
              </div>

              {/*
                #67 — Week-off toggle. Sits below the shift dropdown so the
                primary action (pick a shift) stays the visual default, with
                "mark this day as off" as a single-click override that
                disables the shift selector and submits the org's weekoff
                sentinel instead.

                Implementation note: this is a plain button with role=switch
                (not a hidden checkbox + peer-checked Tailwind trick).
                The peer-checked approach was unreliable in the form
                context — clicks on the visible track were getting lost
                somewhere between label, sr-only input, and form. An
                explicit onClick eliminates the ambiguity entirely.
              */}
              <button
                type="button"
                role="switch"
                aria-checked={editIsWeekoff}
                aria-disabled={weekoffShiftId == null || undefined}
                onClick={() => {
                  if (weekoffShiftId == null) return;
                  setEditIsWeekoff((v) => !v);
                }}
                className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                  weekoffShiftId == null
                    ? 'cursor-not-allowed opacity-60 border-gray-200 bg-white'
                    : editIsWeekoff
                      ? 'cursor-pointer border-amber-300 bg-amber-50'
                      : 'cursor-pointer border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {t('attendance.shiftSchedule.edit.weekoffToggle', {
                      defaultValue: 'Mark as Week-off',
                    })}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('attendance.shiftSchedule.edit.weekoffHint', {
                      defaultValue:
                        'Carves out the selected date range as off. Surrounding shift dates are preserved.',
                    })}
                  </p>
                </div>
                {/* Track */}
                <span
                  aria-hidden
                  className={`relative inline-block h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                    editIsWeekoff ? 'bg-brand-600' : 'bg-gray-300'
                  }`}
                >
                  {/* Thumb */}
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      editIsWeekoff ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
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
          {/* Month navigation — the whole month shows in one row, so this
              steps a full month at a time instead of week by week. */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setMonthOffset((m) => m - 1)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 border border-gray-300 rounded-lg"
            >
              <ChevronLeft className="h-4 w-4" /> {t('attendance.previous')}
            </button>
            <span className="text-sm font-semibold text-gray-700">
              {formatMonthLabel(month.year, month.month, i18n.language)}
            </span>
            <div className="flex items-center gap-2">
              {monthOffset !== 0 && (
                <button
                  onClick={() => setMonthOffset(0)}
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 border border-gray-300 rounded-lg"
                >
                  {t('attendance.shiftSchedule.thisMonth', { defaultValue: 'This month' })}
                </button>
              )}
              <button
                onClick={() => setMonthOffset((m) => m + 1)}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 border border-gray-300 rounded-lg"
              >
                {t('attendance.next')} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
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

          {/* Filters (search + department / location / role) */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 mb-3 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Search employee</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, employee code, or email"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  aria-label="Search employee"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
              <select
                value={departmentId ?? ""}
                onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : undefined)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All departments</option>
                {(departments as any[]).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
              <select
                value={locationId ?? ""}
                onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : undefined)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All locations</option>
                {(locations as any[]).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            {(search || departmentId || locationId || roleFilter) && (
              <button
                type="button"
                onClick={() => { setSearch(""); setDepartmentId(undefined); setLocationId(undefined); setRoleFilter(""); }}
                className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>

          {/* Page size + visible-row stats */}
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
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
                  {month.dates.map((date) => {
                    const { weekday, day } = dayHeaderParts(date, i18n.language);
                    const dow = new Date(date + "T00:00:00").getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <th
                        key={date}
                        className={`text-center text-xs font-medium uppercase px-1.5 py-2 min-w-[64px] ${
                          isWeekend ? "text-gray-400 bg-gray-100/60" : "text-gray-500"
                        }`}
                      >
                        <div className="text-[10px] leading-tight">{weekday}</div>
                        <div className="text-sm font-semibold leading-tight">{day}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scheduleLoading ? (
                  <tr>
                    <td colSpan={month.dates.length + 1} className="px-4 py-8 text-center text-gray-400">
                      {t('attendance.shiftSchedule.team.loading')}
                    </td>
                  </tr>
                ) : schedule.length === 0 ? (
                  <tr>
                    <td colSpan={month.dates.length + 1} className="px-4 py-8 text-center text-gray-400">
                      {t('attendance.shiftSchedule.team.noEmployees')}
                    </td>
                  </tr>
                ) : pagedSchedule.length === 0 ? (
                  <tr>
                    <td colSpan={month.dates.length + 1} className="px-4 py-8 text-center text-gray-400">
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
                      {month.dates.map((date) => {
                        const assignment = emp.assignments.find((a: any) =>
                          isDateInRange(date, a.effective_from, a.effective_to),
                        );
                        // #1952 — A shift with working_days="1,2,3,4,5" is OFF on
                        // weekends. Render "Off" on those cells so the schedule
                        // reflects what the shift definition actually says.
                        // dayOfWeek: 0=Sun..6=Sat (matches shift.working_days CSV).
                        //
                        // #67 — `assignment.is_weekoff` is the explicit
                        // per-assignment override added by the "Week-off"
                        // option in the Edit Assignment modal. When set,
                        // every day in the assignment's date range renders
                        // as Off regardless of working_days, since the
                        // entire sub-range was intentionally carved out as
                        // a weekoff (e.g. swapping Tuesday off for a long
                        // weekend).
                        const dayOfWeek = new Date(date + "T00:00:00").getDay();
                        const workingDays = (assignment?.working_days ?? "")
                          .toString()
                          .split(",")
                          .filter(Boolean)
                          .map((d: string) => Number(d));
                        const isOffDay =
                          assignment && (
                            !!assignment.is_weekoff ||
                            (workingDays.length > 0 && !workingDays.includes(dayOfWeek))
                          );
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
                                      // Pre-fill the modal with the day the
                                      // user clicked, not the full assignment
                                      // range. Clicking the pencil on a single
                                      // cell almost always means "override this
                                      // one day" — pre-selecting the assignment's
                                      // whole range forced the user to manually
                                      // shrink both dates every time. The
                                      // backend's sub-range split logic
                                      // (shift.service.ts:updateShiftAssignment)
                                      // handles preserving the surrounding range.
                                      setEditAssignment({
                                        id: assignment.assignment_id,
                                        shift_id: assignment.shift_id,
                                        effective_from: date,
                                        effective_to: date,
                                      })
                                    }
                                    className="text-gray-400 hover:text-brand-600 p-0.5"
                                    title={t('attendance.shiftSchedule.team.editTooltip')}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => setRemoveAssignmentId(assignment.assignment_id)}
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

      <ConfirmDialog
        open={removeAssignmentId !== null}
        title={t('attendance.shiftSchedule.team.removeConfirm')}
        confirmText={t('common.remove', 'Remove')}
        variant="danger"
        loading={deleteAssignment.isPending}
        onConfirm={() => removeAssignmentId !== null && deleteAssignment.mutate(removeAssignmentId)}
        onCancel={() => setRemoveAssignmentId(null)}
      />
    </div>
  );
}
