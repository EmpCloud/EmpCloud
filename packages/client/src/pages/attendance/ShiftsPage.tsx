import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Copy,
  Filter,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sun,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { showToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// #1930 — Pull a human-readable message off any axios error so the form
// surfaces it instead of silently spinning. The validator returns Zod
// issues at .error.details, the service layer returns a string at
// .error.message; fall back to a generic line if neither is present.
function shiftErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data?.error;
  if (data?.message) return data.message;
  const details = data?.details;
  if (Array.isArray(details) && details.length > 0) {
    return details.map((d: any) => d?.message || String(d)).join(" · ");
  }
  return fallback;
}

interface ShiftForm {
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_minutes_late: number;
  grace_minutes_early: number;
  max_overtime_minutes: number;
  is_night_shift: boolean;
  is_default: boolean;
  working_days: string;
  half_days: string;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const ROW_ACCENTS = ["bg-brand-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500"];

const emptyForm: ShiftForm = {
  name: "",
  start_time: "09:00",
  end_time: "18:00",
  break_minutes: 60,
  grace_minutes_late: 15,
  grace_minutes_early: 15,
  max_overtime_minutes: 0,
  is_night_shift: false,
  is_default: false,
  working_days: "1,2,3,4,5",
  half_days: "",
};

export default function ShiftsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ShiftForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "day" | "night">("all");
  const [appliedFilters, setAppliedFilters] = useState({ search: "", type: "all" });
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  // Confirm-delete dialog state (replaces window.confirm for deactivating a shift).
  const [deleteShiftId, setDeleteShiftId] = useState<number | null>(null);

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => api.get("/attendance/shifts").then((r) => r.data.data),
  });

  const createShift = useMutation({
    mutationFn: (data: ShiftForm) => api.post("/attendance/shifts", data).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shifts"] }); resetForm(); },
    // #1930 — Without an onError, a failed POST silently spins forever
    // and only logs to the browser console. Surface the API's error so
    // HR sees what went wrong (validator rejection, name regex, etc.).
    onError: (err: any) => {
      showToast("error", shiftErrorMessage(err, "Could not create shift."));
    },
  });

  const updateShift = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ShiftForm> }) =>
      api.put(`/attendance/shifts/${id}`, data).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shifts"] }); resetForm(); },
    onError: (err: any) => {
      showToast("error", shiftErrorMessage(err, "Could not update shift."));
    },
  });

  const deleteShift = useMutation({
    mutationFn: (id: number) => api.delete(`/attendance/shifts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      setDeleteShiftId(null);
    },
    onError: (err: any) => {
      showToast("error", shiftErrorMessage(err, "Could not delete shift."));
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
  };

  // #1818 — MySQL TIME columns return "HH:MM:SS"; <input type="time"> only
  // accepts "HH:MM" and renders blank for any longer value (so 00:00:00
  // appeared unsettable). Slice every loaded value to HH:MM defensively.
  const toInputTime = (v: unknown): string =>
    typeof v === "string" ? v.slice(0, 5) : "";

  const handleEdit = (shift: any) => {
    setEditId(shift.id);
    setForm({
      name: shift.name,
      start_time: toInputTime(shift.start_time),
      end_time: toInputTime(shift.end_time),
      break_minutes: shift.break_minutes,
      grace_minutes_late: shift.grace_minutes_late,
      grace_minutes_early: shift.grace_minutes_early,
      max_overtime_minutes: shift.max_overtime_minutes ?? 0,
      is_night_shift: !!shift.is_night_shift,
      is_default: !!shift.is_default,
      working_days: shift.working_days || "1,2,3,4,5",
      half_days: shift.half_days || "",
    });
    setShowForm(true);
  };

  const cycleDayState = (day: number) => {
    const workDays = form.working_days.split(",").filter(Boolean).map(Number);
    const halfDays = form.half_days.split(",").filter(Boolean).map(Number);
    const isWorking = workDays.includes(day);
    const isHalf = halfDays.includes(day);

    if (!isWorking && !isHalf) {
      set("working_days", [...workDays, day].sort((a, b) => a - b).join(","));
    } else if (isWorking && !isHalf) {
      set("half_days", [...halfDays, day].sort((a, b) => a - b).join(","));
    } else {
      set("working_days", workDays.filter((d) => d !== day).join(","));
      set("half_days", halfDays.filter((d) => d !== day).join(","));
    }
  };

  const getDayState = (day: number): "off" | "full" | "half" => {
    const workDays = form.working_days.split(",").filter(Boolean).map(Number);
    const halfDays = form.half_days.split(",").filter(Boolean).map(Number);
    if (!workDays.includes(day)) return "off";
    if (halfDays.includes(day)) return "half";
    return "full";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // #1817 — Browser `required` accepts whitespace-only strings; explicitly
    // reject so the server-side Zod check isn't the only line of defense.
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      set("name", "");
      return;
    }
    const payload = { ...form, name: trimmedName };
    if (editId) {
      updateShift.mutate({ id: editId, data: payload });
    } else {
      createShift.mutate(payload);
    }
  };

  const set = (key: keyof ShiftForm, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const isPending = createShift.isPending || updateShift.isPending;

  const managedShifts = useMemo(
    () => (shifts as any[]).filter((shift) => !shift.is_weekoff),
    [shifts],
  );

  const summary = useMemo(() => {
    const now = new Date();
    const createdThisMonth = managedShifts.filter((shift) => {
      if (!shift.created_at) return false;
      const created = new Date(shift.created_at);
      return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
    }).length;
    const active = managedShifts.filter((shift) => shift.is_active !== false).length;
    const night = managedShifts.filter((shift) => !!shift.is_night_shift).length;
    return {
      total: managedShifts.length,
      active,
      day: managedShifts.length - night,
      night,
      createdThisMonth,
    };
  }, [managedShifts]);

  const filteredShifts = useMemo(() => {
    const query = appliedFilters.search.trim().toLowerCase();
    return managedShifts.filter((shift) => {
      if (query && !String(shift.name ?? "").toLowerCase().includes(query)) return false;
      if (appliedFilters.type === "day" && shift.is_night_shift) return false;
      if (appliedFilters.type === "night" && !shift.is_night_shift) return false;
      return true;
    });
  }, [managedShifts, appliedFilters]);

  const totalPages = Math.max(1, Math.ceil(filteredShifts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedShifts = filteredShifts.slice(startIndex, startIndex + pageSize);

  const applyFilters = () => {
    setAppliedFilters({ search: search.trim(), type: typeFilter });
    setPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setAppliedFilters({ search: "", type: "all" });
    setPage(1);
  };

  const handleDuplicate = (shift: any) => {
    setEditId(null);
    setForm({
      name: `${shift.name} Copy`,
      start_time: toInputTime(shift.start_time),
      end_time: toInputTime(shift.end_time),
      break_minutes: shift.break_minutes,
      grace_minutes_late: shift.grace_minutes_late,
      grace_minutes_early: shift.grace_minutes_early,
      max_overtime_minutes: shift.max_overtime_minutes ?? 0,
      is_night_shift: !!shift.is_night_shift,
      is_default: false,
      working_days: shift.working_days || "1,2,3,4,5",
      half_days: shift.half_days || "",
    });
    setShowForm(true);
  };

  return (
    <div className="space-y-4 px-2">
      <div className="flex -translate-y-2 flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
            <CalendarDays aria-hidden="true" className="h-9 w-9" />
          </span>
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">{t('attendance.shifts.title')}</h1>
            <p className="mt-1 text-[14px] text-muted-foreground">{t('attendance.shifts.subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-600 px-6 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
        >
          <Plus aria-hidden="true" className="h-5 w-5" /> {t('attendance.shifts.addShift')}
        </button>
      </div>

      <div className="!mt-1.5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total Shifts",
            value: summary.total,
            detail: summary.createdThisMonth > 0 ? `↑ ${summary.createdThisMonth} this month` : "All configured shifts",
            icon: Users,
            card: "border-blue-200/80 dark:border-blue-900/50",
            iconBox: "bg-blue-100 text-brand-600 dark:bg-brand-950/50 dark:text-brand-300",
            blob: "bg-blue-100/80 dark:bg-brand-950/30",
            detailClass: summary.createdThisMonth > 0 ? "text-emerald-600" : "text-muted-foreground",
          },
          {
            label: "Active Shifts",
            value: summary.active,
            detail: `${summary.total ? Math.round((summary.active / summary.total) * 100) : 0}% of total`,
            icon: Clock,
            card: "border-emerald-200/80 dark:border-emerald-900/50",
            iconBox: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300",
            blob: "bg-emerald-100/80 dark:bg-emerald-950/30",
            detailClass: "text-muted-foreground",
          },
          {
            label: "Day Shifts",
            value: summary.day,
            detail: `${summary.total ? Math.round((summary.day / summary.total) * 100) : 0}% of total`,
            icon: CalendarDays,
            card: "border-blue-200/80 dark:border-blue-900/50",
            iconBox: "bg-blue-100 text-brand-600 dark:bg-brand-950/50 dark:text-brand-300",
            blob: "bg-blue-100/80 dark:bg-brand-950/30",
            detailClass: "text-muted-foreground",
          },
          {
            label: "Night Shifts",
            value: summary.night,
            detail: `${summary.total ? Math.round((summary.night / summary.total) * 100) : 0}% of total`,
            icon: Moon,
            card: "border-violet-200/80 dark:border-violet-900/50",
            iconBox: "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300",
            blob: "bg-violet-100/80 dark:bg-violet-950/30",
            detailClass: "text-muted-foreground",
          },
        ].map(({ label, value, detail, icon: Icon, card, iconBox, blob, detailClass }) => (
          <section key={label} className={`relative h-[106px] overflow-hidden rounded-xl border bg-card p-5 shadow-sm ${card}`}>
            <span aria-hidden="true" className={`absolute -bottom-12 -right-5 h-24 w-36 -rotate-12 rounded-[50%] ${blob}`} />
            <div className="relative z-10 flex items-center gap-5">
              <span className={`inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl ${iconBox}`}>
                <Icon aria-hidden="true" className="h-8 w-8" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{label}</p>
                <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-foreground">{value}</p>
                <p className={`mt-1.5 text-[12px] font-medium ${detailClass}`}>{detail}</p>
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(320px,2fr)_minmax(170px,.65fr)_116px_162px]">
        <label className="relative block">
          <span className="sr-only">Search by shift name</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") applyFilters(); }}
            placeholder="Search by shift name..."
            className="h-11 w-full rounded-lg border border-border bg-card pl-11 pr-3 text-[14px] text-foreground outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="relative block min-w-0">
          <span className="absolute -top-2 left-3 z-10 bg-background px-1 text-[11px] font-medium text-muted-foreground">Shift Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20">
            <option value="all">All Types</option>
            <option value="day">Day Shift</option>
            <option value="night">Night Shift</option>
          </select>
        </label>
        <button type="button" onClick={resetFilters} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-brand-500 bg-card px-4 text-[13px] font-semibold text-brand-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:hover:bg-brand-950/40">
          <RotateCcw aria-hidden="true" className="h-4 w-4" /> Reset
        </button>
        <button type="button" onClick={applyFilters} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30">
          <Filter aria-hidden="true" className="h-4 w-4" /> Apply Filters
        </button>
      </section>

      {/* Modal */}
      {showForm && (
        <div role="dialog" aria-modal="true" aria-labelledby="shift-form-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                </div>
                <div>
                  <h3 id="shift-form-title" className="text-base font-semibold text-foreground">{editId ? t('attendance.shifts.editShift') : t('attendance.shifts.createShift')}</h3>
                  <p className="text-xs text-muted-foreground">{t('attendance.shifts.modalSubtitle')}</p>
                </div>
              </div>
              <button type="button" onClick={resetForm} aria-label="Close shift form" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30">
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Shift Name */}
              <div>
                <label className="block text-[13px] font-medium text-muted-foreground mb-1">
                  {t('attendance.shifts.shiftName')} <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={t('attendance.shifts.shiftNamePlaceholder')}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  required
                  aria-required="true"
                />
              </div>

              {/* Timing Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t('attendance.shifts.startTime')}</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => set("start_time", e.target.value)}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t('attendance.shifts.endTime')}</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => set("end_time", e.target.value)}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    required
                  />
                </div>
              </div>

              {/* Break & Grace */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t('attendance.shifts.breakLabel')}</label>
                  <input
                    type="number"
                    value={form.break_minutes}
                    onChange={(e) => set("break_minutes", Number(e.target.value))}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t('attendance.shifts.graceLate')}</label>
                  <input
                    type="number"
                    value={form.grace_minutes_late}
                    onChange={(e) => set("grace_minutes_late", Number(e.target.value))}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t('attendance.shifts.graceEarly')}</label>
                  <input
                    type="number"
                    value={form.grace_minutes_early}
                    onChange={(e) => set("grace_minutes_early", Number(e.target.value))}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    min={0}
                  />
                </div>
              </div>

              {/* Overtime cap — minutes past shift end after which an open
                  attendance row is no longer considered "active". Higher
                  values let users with legitimate OT still close the right
                  record on check-out the next day. 0 = use the system
                  default (12h fallback). */}
              <div>
                <label className="block text-[13px] font-medium text-muted-foreground mb-1">
                  Max overtime (minutes)
                </label>
                <input
                  type="number"
                  value={form.max_overtime_minutes}
                  onChange={(e) => set("max_overtime_minutes", Number(e.target.value))}
                  className="bg-card text-foreground w-full md:w-1/3 px-3 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  min={0}
                  max={1440}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How long past the shift end an open check-in is still
                  treated as active (so a forgotten checkout or genuine OT
                  the next morning rolls over correctly). Set 0 for the
                  system default (12 hours).
                </p>
              </div>

              {/* Shift Options — #1957: night and default are mutually
                  exclusive. The "default" shift is the org's standard day
                  shift; tagging a night shift as default would override
                  it on every new employee. Ticking one auto-clears the
                  other. */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2.5 px-4 py-2.5 border border-border rounded-md cursor-pointer hover:bg-muted transition-colors">
                  <input
                    type="checkbox"
                    checked={form.is_night_shift}
                    onChange={(e) => {
                      const next = e.target.checked;
                      set("is_night_shift", next);
                      if (next) set("is_default", false);
                    }}
                    className="rounded border-border text-brand-600 dark:text-brand-400 focus:ring-brand-500"
                  />
                  <Moon className="h-4 w-4 text-indigo-500" />
                  <span className="text-[13px] text-muted-foreground">{t('attendance.shifts.nightShift')}</span>
                </label>
                <label className="flex items-center gap-2.5 px-4 py-2.5 border border-border rounded-md cursor-pointer hover:bg-muted transition-colors">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => {
                      const next = e.target.checked;
                      set("is_default", next);
                      if (next) set("is_night_shift", false);
                    }}
                    className="rounded border-border text-brand-600 dark:text-brand-400 focus:ring-brand-500"
                  />
                  <Sun className="h-4 w-4 text-amber-500" />
                  <span className="text-[13px] text-muted-foreground">{t('attendance.shifts.defaultShift')}</span>
                </label>
              </div>

              {/* Working Days */}
              <div className="bg-muted rounded-lg p-4">
                <label className="block text-[13px] font-medium text-muted-foreground mb-3">{t('attendance.shifts.workingDays')}</label>
                <div className="flex gap-2 justify-between">
                  {DAY_KEYS.map((dayKey, idx) => {
                    const state = getDayState(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => cycleDayState(idx)}
                        className={`flex-1 py-3 rounded-md text-xs font-medium border-2 transition flex flex-col items-center gap-1 ${
                          state === "full"
                            ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                            : state === "half"
                            ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300"
                            : "bg-card text-muted-foreground border-border hover:border-border"
                        }`}
                      >
                        <span className="font-semibold text-sm">{t(`attendance.shifts.dayLabels.${dayKey}`)}</span>
                        <span className="text-[10px] opacity-80">
                          {state === "full" ? t('attendance.shifts.stateFull') : state === "half" ? t('attendance.shifts.stateHalf') : t('attendance.shifts.stateOff')}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">{t('attendance.shifts.cycleHint')}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted rounded-b-lg">
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2 text-[13px] font-medium text-muted-foreground border border-border rounded-md hover:bg-muted transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-5 py-2 text-[13px] font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? t('attendance.shifts.saving') : editId ? t('attendance.shifts.updateShift') : t('attendance.shifts.createShift')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Shifts Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-2.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
              <CalendarDays aria-hidden="true" className="h-5 w-5" />
            </span>
            <h2 className="text-[18px] font-bold text-foreground">Shift List ({filteredShifts.length})</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
            <label className="flex items-center gap-2">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
                className="h-9 rounded-lg border border-border bg-card px-3 text-[13px] text-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              >
                {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <span>per page</span>
            </label>
            <span aria-hidden="true" className="h-6 w-px bg-border" />
            <span className="min-w-[72px] text-center tabular-nums">
              {filteredShifts.length ? `${startIndex + 1}-${Math.min(startIndex + pageSize, filteredShifts.length)} of ${filteredShifts.length}` : "0 of 0"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
                aria-label="Previous page"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage >= totalPages}
                aria-label="Next page"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full">
            <caption className="sr-only">Shift list</caption>
            <thead className="border-b border-border bg-slate-50/90 dark:bg-slate-900/50">
              <tr>
                <th scope="col" className="w-14 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                {[
                  { label: "Shift Name", sortable: true },
                  { label: t('attendance.shifts.table.timing'), sortable: true },
                  { label: t('attendance.shifts.table.break'), sortable: true },
                  { label: t('attendance.shifts.table.workingDays'), sortable: true },
                  { label: t('attendance.shifts.table.type'), sortable: true },
                  { label: "Status", sortable: true },
                  { label: t('attendance.shifts.table.actions'), sortable: false },
                ].map((heading) => (
                  <th key={heading.label} scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">{heading.label}{heading.sortable && <ArrowUpDown aria-hidden="true" className="h-3 w-3 text-slate-400" />}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-[13px] text-muted-foreground">{t('common.loading')}</td></tr>
              ) : pagedShifts.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-[13px] text-muted-foreground">{t('attendance.shifts.noShifts')}</td></tr>
              ) : (
                pagedShifts.map((s: any, index: number) => (
                  <tr key={s.id} className="relative h-[58px] transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                    <td className="relative px-5 py-2.5 text-[13px] tabular-nums text-muted-foreground">
                      <span aria-hidden="true" className={`absolute bottom-2 left-0 top-2 w-1 rounded-full ${ROW_ACCENTS[(startIndex + index) % ROW_ACCENTS.length]}`} />
                      {startIndex + index + 1}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[13px] font-semibold text-foreground">{s.name}</span>
                      {s.is_default ? <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">{t('attendance.shifts.defaultBadge')}</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2 text-[13px] tabular-nums text-slate-600 dark:text-slate-300"><Clock aria-hidden="true" className="h-4 w-4 text-brand-600" />{toInputTime(s.start_time)} - {toInputTime(s.end_time)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2 text-[13px] tabular-nums text-slate-600 dark:text-slate-300"><Coffee aria-hidden="true" className="h-4 w-4" />{s.break_minutes}m</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        {DAY_KEYS.map((dayKey, dayIndex) => {
                          const workDays = (s.working_days || "1,2,3,4,5").split(",").filter(Boolean).map(Number);
                          const halfDays = (s.half_days || "").split(",").filter(Boolean).map(Number);
                          const isWorking = workDays.includes(dayIndex);
                          const isHalf = halfDays.includes(dayIndex);
                          const label = t(`attendance.shifts.dayLabels.${dayKey}`);
                          return (
                            <span
                              key={dayKey}
                              title={isHalf ? t('attendance.shifts.halfDay') : isWorking ? t('attendance.shifts.fullDay') : t('attendance.shifts.dayOff')}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-semibold ${
                                isHalf
                                  ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                                  : isWorking
                                  ? "bg-blue-100 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300"
                                  : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                              }`}
                            >
                              {label.charAt(0)}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${s.is_night_shift ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>
                        {s.is_night_shift ? <Moon aria-hidden="true" className="h-3.5 w-3.5" /> : <Sun aria-hidden="true" className="h-3.5 w-3.5" />}
                        {s.is_night_shift ? t('attendance.shifts.typeNight') : t('attendance.shifts.typeDay')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setDeleteShiftId(s.id)}
                        aria-label={`Deactivate ${s.name}`}
                        className="inline-flex items-center gap-2 rounded-full bg-emerald-50 py-1 pl-1 pr-3 text-[12px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        <span aria-hidden="true" className="relative h-5 w-9 rounded-full bg-emerald-500"><span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm" /></span>
                        Active
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleEdit(s)} aria-label={`Edit ${s.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-brand-200 hover:bg-blue-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:hover:bg-brand-950/40"><Pencil aria-hidden="true" className="h-4 w-4" /></button>
                        <button type="button" onClick={() => handleDuplicate(s)} aria-label={`Duplicate ${s.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-brand-200 hover:bg-blue-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:hover:bg-brand-950/40"><Copy aria-hidden="true" className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setDeleteShiftId(s.id)} aria-label={`Deactivate ${s.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={deleteShiftId !== null}
        title={t('attendance.shifts.deactivateConfirm')}
        confirmText={t('common.deactivate', 'Deactivate')}
        variant="danger"
        loading={deleteShift.isPending}
        onConfirm={() => deleteShiftId !== null && deleteShift.mutate(deleteShiftId)}
        onCancel={() => setDeleteShiftId(null)}
      />
    </div>
  );
}
