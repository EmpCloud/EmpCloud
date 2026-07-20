import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, X, Clock, Moon, Sun } from "lucide-react";
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t('attendance.shifts.title')}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t('attendance.shifts.subtitle')}</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> {t('attendance.shifts.addShift')}
        </button>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form
            onSubmit={handleSubmit}
            className="bg-card rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{editId ? t('attendance.shifts.editShift') : t('attendance.shifts.createShift')}</h3>
                  <p className="text-xs text-muted-foreground">{t('attendance.shifts.modalSubtitle')}</p>
                </div>
              </div>
              <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-muted-foreground p-1">
                <X className="h-5 w-5" />
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
      <div className="bg-card rounded-lg border border-border overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.shifts.table.name')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.shifts.table.timing')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.shifts.table.break')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.shifts.table.workingDays')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.shifts.table.type')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t('attendance.shifts.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t('common.loading')}</td></tr>
            ) : shifts.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t('attendance.shifts.noShifts')}</td></tr>
            ) : (
              shifts.map((s: any) => (
                <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="text-[13px] font-medium text-foreground">{s.name}</span>
                    {s.is_default ? <span className="ml-2 text-[11px] bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-md">{t('attendance.shifts.defaultBadge')}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] tabular-nums text-muted-foreground">{toInputTime(s.start_time)} - {toInputTime(s.end_time)}</td>
                  <td className="px-4 py-2.5 text-[13px] tabular-nums text-muted-foreground">{s.break_minutes}m</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      {DAY_KEYS.map((dayKey, idx) => {
                        const workDays = (s.working_days || "1,2,3,4,5").split(",").filter(Boolean).map(Number);
                        const halfDays = (s.half_days || "").split(",").filter(Boolean).map(Number);
                        const isWorking = workDays.includes(idx);
                        const isHalf = halfDays.includes(idx);
                        const label = t(`attendance.shifts.dayLabels.${dayKey}`);
                        return (
                          <span
                            key={idx}
                            title={isHalf ? t('attendance.shifts.halfDay') : isWorking ? t('attendance.shifts.fullDay') : t('attendance.shifts.dayOff')}
                            className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-medium ${
                              isHalf
                                ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                                : isWorking
                                ? "bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300"
                                : "bg-muted text-muted-foreground/50"
                            }`}
                          >
                            {label.charAt(0)}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${s.is_night_shift ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" : "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"}`}>
                      {s.is_night_shift ? t('attendance.shifts.typeNight') : t('attendance.shifts.typeDay')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(s)} className="p-1.5 rounded-md text-muted-foreground hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:text-brand-600 transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteShiftId(s.id)} className="p-1.5 rounded-md text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
