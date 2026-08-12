import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ChevronLeft, ChevronRight, Loader2, Search, X, CalendarPlus, AlertTriangle, Download } from "lucide-react";
import * as XLSX from "xlsx";

const STORAGE_KEY_LOCATION = "empcloud:filter:grid:location_name";
const STORAGE_KEY_DEPARTMENT = "empcloud:filter:grid:department_name";

const readStored = (key: string): string => {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const writeStored = (key: string, value: string) => {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* private mode / quota — keep in-memory state */
  }
};

// Localized month label for a 1-based month index, in the active UI locale.
const monthLabel = (m: number, year: number): string =>
  new Date(year, m - 1, 1).toLocaleString(undefined, { month: "long" });

interface DayDef {
  day: number;
  date: string;
  // Server no longer emits "WO" as a date-level default -- weekoffs are
  // per-user, shift-driven, and delivered in `EmployeeRow.weekoffDays`.
  // Only HO (holiday) remains a date-level default.
  defaultCode: "HO" | "";
}

interface EmployeeRow {
  user_id: number;
  first_name: string;
  last_name: string;
  emp_code: string | null;
  department: string | null;
  location: string | null;
  days: Record<string, string>;
  // Per-employee set of dates that the shift assignment marks as a
  // weekoff. Rendered as a small "WO" ribbon overlay on the cell so
  // attendance + weekoff status can coexist (e.g. someone who worked on
  // their off day shows "P" with a WO ribbon — overtime / comp-off
  // candidate).
  weekoffDays?: Record<string, boolean>;
  nightShiftDays?: Record<string, boolean>;
  extraDayDays?: Record<string, boolean>;
  nightAllowanceCount?: number;
  extraDayCount?: number;
  // Per-employee approved leaves by date: the leave type code (EL / CL / …)
  // and whether it's a half day. The cell's `days[date]` code is already
  // L (full) or HPL (half + worked) from the server; this drives the small
  // leave-type badge so HR sees WHICH leave it is.
  leaves?: Record<string, { code: string; isHalf: boolean }>;
}

interface GridResponse {
  days: DayDef[];
  employees: EmployeeRow[];
  totalEmployees: number;
  daysInMonth: number;
}

const codeStyle = (code: string): string => {
  switch (code) {
    case "P":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
    case "A":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "H":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "L":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
    case "HPL":
      // Half Present + Half Leave -- distinct teal to read clearly against
      // the green/amber/blue family that already covers P / H / L. Slightly
      // darker text since the code is 3 chars vs the usual single letter.
      return "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200";
    case "WO":
      return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
    case "HO":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200";
    case "WOT":
      // Worked on a week-off (overtime) — indigo so it reads distinctly
      // from plain WO (grey) and P (green).
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200";
    case "HOT":
      // Worked on a holiday (overtime) — fuchsia, in the purple HO family
      // but clearly "worked" rather than a plain holiday.
      return "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-200";
    case "M":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200";
    default:
      return "bg-white text-gray-300 dark:bg-gray-900 dark:text-gray-600";
  }
};

export default function AttendanceGridPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  // Optimistic-update overlay so a saved cell flips colour immediately
  // without waiting for the refetch (the refetch still fires).
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ uid: number; date: string } | null>(null);
  const [pendingLeaveOverride, setPendingLeaveOverride] = useState<{
    uid: number;
    date: string;
    code: string;
    leaveCode: string;
  } | null>(null);
  const [savingLeaveOverride, setSavingLeaveOverride] = useState(false);
  // Client-side filters — the row set is small (one row per active employee
  // in the org) so filtering with useMemo is plenty fast and avoids round-
  // tripping the whole grid on every keystroke.
  const [search, setSearch] = useState("");
  // Department + location persist across reloads so HR doesn't have to reselect
  // their team / branch every time. Cross-tab sync via the `storage` event.
  const [department, setDepartment] = useState<string>(() => readStored(STORAGE_KEY_DEPARTMENT));
  const [location, setLocation] = useState<string>(() => readStored(STORAGE_KEY_LOCATION));

  useEffect(() => {
    writeStored(STORAGE_KEY_DEPARTMENT, department);
  }, [department]);
  useEffect(() => {
    writeStored(STORAGE_KEY_LOCATION, location);
  }, [location]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_DEPARTMENT) setDepartment(e.newValue || "");
      else if (e.key === STORAGE_KEY_LOCATION) setLocation(e.newValue || "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  // Minimal status banner -- EmpCloud doesn't have a toast system wired
  // up (Radix Toast is in package.json but no Toaster mounted), so we
  // surface save status as a top-bar pill that auto-dismisses.
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(id);
  }, [status]);

  const queryKey = ["attendance-grid", month, year];
  const { data: res, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const r = await api.get<{ data: GridResponse } | GridResponse>(
        `/attendance/grid?month=${month}&year=${year}`,
      );
      // EmpCloud responses come back as { success, data } from sendSuccess
      const payload: any = r.data;
      return (payload?.data || payload) as GridResponse;
    },
  });

  // Reset overrides when the period changes -- otherwise an override
  // from May would visually leak into June.
  useEffect(() => {
    setOverrides({});
  }, [month, year]);

  const data = res || ({ days: [], employees: [], totalEmployees: 0, daysInMonth: 0 } as GridResponse);

  // Distinct dept / location dropdown options derived from the current row
  // set — keeps the UI honest (only shows what's actually on the grid).
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of data.employees) if (e.department) set.add(e.department);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data.employees]);

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of data.employees) if (e.location) set.add(e.location);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data.employees]);

  // Self-heal: if a sticky filter no longer matches any row this month
  // (location renamed, dept dissolved, employee moved out), clear it so the
  // user doesn't see an empty grid with no obvious reason.
  useEffect(() => {
    if (data.employees.length === 0) return;
    if (department && !departmentOptions.includes(department)) setDepartment("");
    if (location && !locationOptions.includes(location)) setLocation("");
  }, [data.employees, department, location, departmentOptions, locationOptions]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.employees.filter((e) => {
      if (department && e.department !== department) return false;
      if (location && e.location !== location) return false;
      if (q) {
        const hay = `${e.first_name || ""} ${e.last_name || ""} ${e.emp_code || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.employees, search, department, location]);

  const filtersActive = !!(search || department || location);
  const clearFilters = () => {
    setSearch("");
    setDepartment("");
    setLocation("");
  };

  const cellKey = (uid: number, date: string) => `${uid}|${date}`;
  const cellCode = (uid: number, date: string, fallback: string): string => {
    const o = overrides[cellKey(uid, date)];
    return o !== undefined ? o : fallback;
  };

  async function commitCell(uid: number, date: string, newCode: string) {
    const employee = data.employees.find((item) => item.user_id === uid);
    const approvedLeave = employee?.leaves?.[date];
    if (newCode === "P" && approvedLeave) {
      setEditing(null);
      setPendingLeaveOverride({ uid, date, code: newCode, leaveCode: approvedLeave.code });
      return;
    }
    await saveCell(uid, date, newCode);
  }

  async function saveCell(uid: number, date: string, newCode: string) {
    setOverrides((prev) => ({ ...prev, [cellKey(uid, date)]: newCode }));
    setEditing(null);
    try {
      await api.put("/attendance/cell", {
        user_id: uid,
        date,
        code: newCode,
      });
      qc.invalidateQueries({ queryKey });
      setStatus({ kind: "ok", text: t("attendance.grid.savedToast", { code: newCode || "—", date }) });
    } catch (err: any) {
      // Roll the override back on failure.
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[cellKey(uid, date)];
        return next;
      });
      setStatus({
        kind: "err",
        text: err.response?.data?.error?.message || t("attendance.grid.saveFailed"),
      });
    }
  }

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  const summaryFor = useMemo(
    () => (emp: EmployeeRow) => {
      const counts = { P: 0, A: 0, H: 0, L: 0, HPL: 0, WO: 0, HO: 0, M: 0, NIGHT: 0, ED: 0 };
      const weekoff = emp.weekoffDays || {};
      for (const d of data.days) {
        const c = cellCode(emp.user_id, d.date, emp.days[d.date] || "");
        if (c === "WOT" || c === "HOT" || (c === "M" && emp.extraDayDays?.[d.date])) counts.ED++;
        if (emp.nightShiftDays?.[d.date]) {
          if (c === "H" || c === "HPL") counts.NIGHT += 0.5;
          else if (c === "P" || c === "M" || c === "WOT" || c === "HOT") counts.NIGHT++;
        }
        // WO count comes from the shift-driven weekoff map, NOT from
        // the attendance code -- since attendance + weekoff can coexist
        // on a single cell (worked on off day shows P with a WO ribbon).
        // P/A/H/L/HPL/M still come from the attendance code.
        if (weekoff[d.date]) counts.WO++;
        // A half-day is half present + half absent (same as payroll, where a
        // half-day is 0.5 paid + 0.5 LOP). Reflect both halves in the Present
        // and Absent day-equivalents while still counting the occurrence in H.
        if (c === "H") {
          counts.H++;
          counts.P += 0.5;
          counts.A += 0.5;
        } else if (c && c !== "WO" && c in counts) {
          counts[c as keyof typeof counts]++;
        }
      }
      return counts;
    },
    [data.days, overrides],
  );

  // Export current grid view to XLSX.
  // Pulls from `filteredEmployees` + `data.days` so the file matches exactly
  // what HR sees on screen -- same filters, same month, same applied overrides.
  // Layout: one sheet, first column = employee identity, then one column per
  // day-of-month with the displayed code (P / A / H / L / WO / HO / HOT / WOT /
  // M / HPL), followed by the same per-employee totals shown in the right rail.
  const [exporting, setExporting] = useState(false);
  const exportToExcel = () => {
    if (!filteredEmployees.length || !data.days.length) return;
    setExporting(true);
    try {
      // Build header row: identity + day-of-month columns + totals
      const dayHeaders = data.days.map((d) => String(d.day));
      const headers = [
        "Employee",
        "Emp Code",
        "Department",
        "Location",
        ...dayHeaders,
        "P",
        "A",
        "H",
        "L",
        "HPL",
        "WO",
        "HO",
        "M",
        "Night Allowance",
        "Extra Day",
      ];

      const rows = filteredEmployees.map((emp) => {
        const counts = summaryFor(emp);
        const dayCells = data.days.map((d) => {
          const code = cellCode(emp.user_id, d.date, emp.days[d.date] || "");
          if (code) return code;
          // No attendance code -- show WO if it's the employee's week-off so
          // the export matches the on-screen ribbon, otherwise blank.
          return emp.weekoffDays?.[d.date] ? "WO" : "";
        });
        return [
          `${emp.first_name || ""} ${emp.last_name || ""}`.trim(),
          emp.emp_code || "",
          emp.department || "",
          emp.location || "",
          ...dayCells,
          counts.P,
          counts.A,
          counts.H,
          counts.L,
          counts.HPL,
          counts.WO,
          counts.HO,
          counts.M,
          counts.NIGHT,
          counts.ED,
        ];
      });

      const aoa = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Narrow day columns so 31 of them fit on one screen; wider for identity.
      ws["!cols"] = headers.map((_h, i) => {
        if (i === 0) return { wch: 24 };
        if (i < 4) return { wch: 16 };
        // day columns
        if (i < 4 + dayHeaders.length) return { wch: 4 };
        return { wch: 6 };
      });
      // Freeze the identity columns + header row so scrolling 31 days stays sane.
      ws["!freeze"] = { xSplit: 4, ySplit: 1 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${monthLabel(month, year)} ${year}`);
      const filename = `attendance_grid_${monthLabel(month, year)}_${year}.xlsx`;
      XLSX.writeFile(wb, filename);
    } finally {
      setExporting(false);
    }
  };

  // Per-DAY column totals -- on date column N, how many employees were
  // in each bucket. Rendered as a tfoot block so HR can scan "how many
  // people were absent on May 15?" at a glance. Totals follow the active
  // filters so a department head sees only their team's totals.
  const dayTotals = useMemo(() => {
    const out: Record<
      string,
      { P: number; A: number; H: number; L: number; HPL: number; WO: number; HO: number; M: number }
    > = {};
    for (const d of data.days) {
      const counts = { P: 0, A: 0, H: 0, L: 0, HPL: 0, WO: 0, HO: 0, M: 0 };
      for (const emp of filteredEmployees) {
        const c = cellCode(emp.user_id, d.date, emp.days[d.date] || "");
        // WO is derived from the shift's weekoff map -- counted in
        // parallel to (not instead of) the attendance code so an
        // employee who worked on their off day contributes to BOTH
        // P and WO totals for that date.
        if (emp.weekoffDays?.[d.date]) counts.WO++;
        // A half-day is half present + half absent (same as payroll, where a
        // half-day is 0.5 paid + 0.5 LOP). Reflect both halves in the Present
        // and Absent day-equivalents while still counting the occurrence in H.
        if (c === "H") {
          counts.H++;
          counts.P += 0.5;
          counts.A += 0.5;
        } else if (c && c !== "WO" && c in counts) {
          counts[c as keyof typeof counts]++;
        }
      }
      out[d.date] = counts;
    }
    return out;
  }, [data.days, filteredEmployees, overrides]);

  // Org-wide totals across the whole month (sum of dayTotals) -- shown
  // in the right-hand summary column of the footer rows.
  const monthTotals = useMemo(() => {
    const totals = { P: 0, A: 0, H: 0, L: 0, HPL: 0, WO: 0, HO: 0, M: 0 };
    for (const d of data.days) {
      const c = dayTotals[d.date];
      if (!c) continue;
      totals.P += c.P;
      totals.A += c.A;
      totals.H += c.H;
      totals.L += c.L;
      totals.HPL += c.HPL;
      totals.WO += c.WO;
      totals.HO += c.HO;
      totals.M += c.M;
    }
    return totals;
  }, [dayTotals, data.days]);

  const FOOTER_ROWS: Array<{ code: keyof typeof monthTotals; label: string; cls: string }> = [
    { code: "P", label: t("attendance.grid.legend.present"), cls: "text-green-700 dark:text-green-300" },
    { code: "A", label: t("attendance.grid.legend.absent"), cls: "text-red-700 dark:text-red-300" },
    { code: "H", label: t("attendance.grid.legend.halfDay"), cls: "text-amber-700 dark:text-amber-300" },
    { code: "L", label: t("attendance.grid.legend.onLeave"), cls: "text-blue-700 dark:text-blue-300" },
    { code: "HPL", label: t("attendance.grid.legend.hpl"), cls: "text-teal-700 dark:text-teal-300" },
    { code: "WO", label: t("attendance.grid.legend.weekOff"), cls: "text-gray-500 dark:text-gray-400" },
    { code: "HO", label: t("attendance.grid.legend.holiday"), cls: "text-purple-700 dark:text-purple-300" },
    { code: "M", label: t("attendance.grid.legend.missed"), cls: "text-orange-700 dark:text-orange-300" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("nav.attendanceGrid", "Attendance Grid")}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {t("attendance.grid.subtitle")}
        </p>
      </div>

      {status && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            status.kind === "ok"
              ? "border border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
              : "border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {status.text}
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium text-gray-900 dark:text-gray-100">
            {monthLabel(month, year)} {year}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
          <LegendDot label="P" cls={codeStyle("P")} desc={t("attendance.grid.legend.present")} />
          <LegendDot label="A" cls={codeStyle("A")} desc={t("attendance.grid.legend.absent")} />
          <LegendDot label="H" cls={codeStyle("H")} desc={t("attendance.grid.legend.halfDay")} />
          <LegendDot label="L" cls={codeStyle("L")} desc={t("attendance.grid.legend.onLeave")} />
          <LegendDot label="HPL" cls={codeStyle("HPL")} desc={t("attendance.grid.legend.hpl")} />
          <LegendDot label="WO" cls={codeStyle("WO")} desc={t("attendance.grid.legend.weekOff")} />
          <LegendDot label="HO" cls={codeStyle("HO")} desc={t("attendance.grid.legend.holiday")} />
          <LegendDot label="WOT" cls={codeStyle("WOT")} desc={t("attendance.grid.legend.wot")} />
          <LegendDot label="HOT" cls={codeStyle("HOT")} desc={t("attendance.grid.legend.hot")} />
          <LegendDot label="M" cls={codeStyle("M")} desc={t("attendance.grid.legend.missed")} />
          <button
            type="button"
            onClick={exportToExcel}
            disabled={exporting || isLoading || !filteredEmployees.length}
            title={t("attendance.grid.exportTooltip")}
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exporting ? t("attendance.grid.exporting") : t("attendance.grid.export")}
          </button>
        </div>
      </div>

      {/* Filter bar — search by name / emp_code, narrow by department or
          location. Filters operate client-side over the already-fetched
          rows so changes feel instant. */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("attendance.grid.searchEmployee")}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("attendance.grid.searchPlaceholder")}
              className="w-full rounded-md border border-gray-300 bg-white pl-8 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("attendance.grid.department")}
          </label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">{t("attendance.grid.allDepartments")}</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("attendance.grid.location")}
          </label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">{t("attendance.grid.allLocations")}</option>
            {locationOptions.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {t("attendance.grid.employeeCount", { shown: filteredEmployees.length, total: data.employees.length })}
          </span>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <X className="h-3 w-3" />
              {t("attendance.grid.clearFilters")}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="sticky left-0 z-20 min-w-[180px] border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {t("attendance.grid.employee")}
                </th>
                {data.days.map((d) => (
                  <th
                    key={d.date}
                    className="border-b border-gray-200 px-1 py-2 text-center font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300"
                    title={d.date}
                  >
                    {d.day}
                  </th>
                ))}
                <th className="border-b border-l border-gray-200 px-2 py-2 text-center font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
                  P
                </th>
                <th className="border-b border-gray-200 px-2 py-2 text-center font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
                  A
                </th>
                <th className="border-b border-gray-200 px-2 py-2 text-center font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
                  H
                </th>
                <th className="border-b border-gray-200 px-2 py-2 text-center font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
                  L
                </th>
                <th
                  className="border-b border-gray-200 px-2 py-2 text-center font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200"
                  title="Half Present + Half Leave"
                >
                  HPL
                </th>
                <th
                  className="border-b border-gray-200 px-2 py-2 text-center font-semibold text-violet-700 dark:border-gray-700 dark:text-violet-300"
                  title={t("attendance.grid.nightAllowanceTitle")}
                >
                  {t("attendance.grid.nightAllowance")}
                </th>
                <th
                  className="border-b border-gray-200 px-2 py-2 text-center font-semibold text-indigo-700 dark:border-gray-700 dark:text-indigo-300"
                  title={t("attendance.grid.extraDayTitle")}
                >
                  {t("attendance.grid.extraDay")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.days.length + 8}
                    className="px-4 py-8 text-center text-gray-400 dark:text-gray-500"
                  >
                    {data.employees.length === 0
                      ? t("attendance.grid.noEmployees")
                      : t("attendance.grid.noMatch")}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const summary = summaryFor(emp);
                  return (
                    <tr key={emp.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="sticky left-0 z-10 border-r border-gray-200 bg-white px-3 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
                        <div className="font-medium">
                          {emp.first_name} {emp.last_name}
                        </div>
                        {emp.emp_code && (
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">
                            {emp.emp_code}
                          </div>
                        )}
                      </td>
                      {data.days.map((d) => {
                        const stored = emp.days[d.date] || "";
                        const code = cellCode(emp.user_id, d.date, stored);
                        const isWeekoff = !!emp.weekoffDays?.[d.date];
                        const isEditing =
                          editing?.uid === emp.user_id && editing.date === d.date;
                        // Effective code shown in the cell: when the day
                        // is a shift weekoff AND no attendance is recorded
                        // (or it was explicitly set to ""), render "WO"
                        // outright. When BOTH attendance and weekoff
                        // coexist, render the attendance code as the
                        // primary face and surface the weekoff via a
                        // small "WO" ribbon overlay at the top-right of
                        // the cell -- this is the "worked on off day"
                        // (overtime / comp-off candidate) signal.
                        const showAsWeekoffOnly = isWeekoff && !code;
                        const showRibbon = isWeekoff && !!code;
                        const displayCode = showAsWeekoffOnly ? "WO" : code;
                        // Approved leave on this date — show its type code
                        // (EL/CL/…) as a badge. The cell code is already
                        // L / HPL from the server.
                        const leave = emp.leaves?.[d.date];
                        const cellTitle = leave
                          ? `${d.date} — ${leave.isHalf ? "half-day " : ""}${leave.code} leave${
                              code === "HPL" ? " · ½ present" : ""
                            } (double-click to edit)`
                          : isWeekoff
                            ? `${d.date} — week off${code ? ` · marked ${code}` : ""} (double-click to edit)`
                            : `${d.date} — double-click to edit`;
                        return (
                          <td
                            key={d.date}
                            className="relative border-b border-gray-100 p-0.5 text-center dark:border-gray-800"
                          >
                            {isEditing ? (
                              <CellEditor
                                userId={emp.user_id}
                                userName={`${emp.first_name} ${emp.last_name}`.trim()}
                                date={d.date}
                                currentCode={code}
                                onClose={() => setEditing(null)}
                                onPickStatus={(c) => commitCell(emp.user_id, d.date, c)}
                                onLeaveApplied={() => {
                                  qc.invalidateQueries({ queryKey });
                                  setEditing(null);
                                  setStatus({
                                    kind: "ok",
                                    text: t("attendance.grid.leaveAppliedToast", { name: emp.first_name, date: d.date }),
                                  });
                                }}
                              />
                            ) : null}
                            <div className="relative mx-auto h-7 w-7">
                              <div
                                onDoubleClick={() => setEditing({ uid: emp.user_id, date: d.date })}
                                title={cellTitle}
                                className={`flex h-full w-full cursor-pointer items-center justify-center rounded-md text-[11px] font-semibold transition hover:ring-2 hover:ring-brand-400 ${codeStyle(displayCode)}`}
                              >
                                {displayCode || "—"}
                              </div>
                              {showRibbon && (
                                <span
                                  aria-label={t("attendance.grid.legend.weekOff")}
                                  className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-gray-700 px-1 py-px text-[7px] font-bold leading-none text-white shadow-sm dark:bg-gray-300 dark:text-gray-900"
                                >
                                  WO
                                </span>
                              )}
                              {leave && (
                                <span
                                  aria-label={`${leave.code} leave`}
                                  className="pointer-events-none absolute -bottom-1 -left-1 rounded-full bg-blue-600 px-1 py-px text-[7px] font-bold leading-none text-white shadow-sm"
                                >
                                  {leave.code}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="border-l border-gray-200 px-2 py-2 text-center font-semibold text-green-700 dark:border-gray-700 dark:text-green-300">
                        {summary.P}
                      </td>
                      <td className="px-2 py-2 text-center font-semibold text-red-700 dark:text-red-300">
                        {summary.A}
                      </td>
                      <td className="px-2 py-2 text-center font-semibold text-amber-700 dark:text-amber-300">
                        {summary.H}
                      </td>
                      <td className="px-2 py-2 text-center font-semibold text-blue-700 dark:text-blue-300">
                        {summary.L}
                      </td>
                      <td
                        className="px-2 py-2 text-center font-semibold text-teal-700 dark:text-teal-300"
                        title="Half Present + Half Leave"
                      >
                        {summary.HPL}
                      </td>
                      <td
                        className="px-2 py-2 text-center font-semibold text-violet-700 dark:text-violet-300"
                        title={t("attendance.grid.nightAllowanceTitle")}
                      >
                        {summary.NIGHT}
                      </td>
                      <td
                        className="px-2 py-2 text-center font-semibold text-indigo-700 dark:text-indigo-300"
                        title={t("attendance.grid.extraDayTitle")}
                      >
                        {summary.ED}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredEmployees.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-gray-800/60">
                {FOOTER_ROWS.map((row) => (
                  <tr key={row.code} className="border-t border-gray-200 dark:border-gray-700">
                    <td
                      className={`sticky left-0 z-10 border-r border-gray-200 bg-gray-50 px-3 py-1.5 text-left text-[11px] font-semibold dark:border-gray-700 dark:bg-gray-800/60 ${row.cls}`}
                    >
                      {t("attendance.grid.totalRow", { code: row.code, label: row.label })}
                    </td>
                    {data.days.map((d) => {
                      const v = dayTotals[d.date]?.[row.code] ?? 0;
                      return (
                        <td
                          key={d.date}
                          className={`px-1 py-1.5 text-center text-[11px] font-semibold ${v > 0 ? row.cls : "text-gray-300 dark:text-gray-600"}`}
                        >
                          {v || ""}
                        </td>
                      );
                    })}
                    <td
                      colSpan={7}
                      className={`border-l border-gray-200 px-2 py-1.5 text-center text-[11px] font-bold dark:border-gray-700 ${row.cls}`}
                    >
                      {monthTotals[row.code]}
                    </td>
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t("attendance.grid.tip")}
      </p>

      <ConfirmDialog
        open={pendingLeaveOverride !== null}
        title="Replace approved leave with Present?"
        description={
          pendingLeaveOverride
            ? `This employee has approved ${pendingLeaveOverride.leaveCode} leave on ${pendingLeaveOverride.date}. ` +
              "The leave for this date will be cancelled and the deducted balance will be restored."
            : undefined
        }
        confirmText="Mark Present"
        cancelText="Keep Leave"
        variant="info"
        loading={savingLeaveOverride}
        onCancel={() => {
          if (!savingLeaveOverride) setPendingLeaveOverride(null);
        }}
        onConfirm={async () => {
          if (!pendingLeaveOverride) return;
          setSavingLeaveOverride(true);
          await saveCell(
            pendingLeaveOverride.uid,
            pendingLeaveOverride.date,
            pendingLeaveOverride.code,
          );
          setSavingLeaveOverride(false);
          setPendingLeaveOverride(null);
        }}
      />
    </div>
  );
}

function LegendDot({ label, cls, desc }: { label: string; cls: string; desc: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex h-5 w-6 items-center justify-center rounded-md text-[10px] font-semibold ${cls}`}>
        {label}
      </span>
      <span>{desc}</span>
    </span>
  );
}

// Popover that opens on double-click of an attendance cell. Combines the
// existing P/A/H/— status overrides with a leave-application flow: HR can
// pick from the org leave types (with current balances) and apply directly.
// Existing leave applications for the same date are surfaced at the top.
function CellEditor({
  userId,
  userName,
  date,
  currentCode,
  onClose,
  onPickStatus,
  onLeaveApplied,
}: {
  userId: number;
  userName: string;
  date: string;
  currentCode: string;
  onClose: () => void;
  onPickStatus: (code: string) => void;
  onLeaveApplied: () => void;
}) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: ctxRes, isLoading } = useQuery({
    queryKey: ["grid-leave-context", userId, date],
    queryFn: () =>
      api
        .get("/attendance/grid/leave-context", { params: { user_id: userId, date } })
        .then((r) => r.data?.data ?? r.data),
  });
  const leaveTypes: Array<{
    id: number;
    name: string;
    code: string | null;
    color: string | null;
    available_now: number;
    fiscal_year_label: string | null;
  }> = ctxRes?.leaveTypes ?? [];
  const existingApplications: Array<{
    id: number;
    leave_type_name: string;
    status: string;
    start_date: string;
    end_date: string;
    days_count: number;
    is_half_day: boolean;
    half_day_type: "first_half" | "second_half" | null;
  }> = ctxRes?.existingApplications ?? [];

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function applyLeave(typeId: number) {
    setError(null);
    setApplyingId(typeId);
    try {
      await api.post("/attendance/grid/apply-leave", {
        user_id: userId,
        date,
        leave_type_id: typeId,
      });
      onLeaveApplied();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || t("attendance.grid.applyLeaveFailed"));
    } finally {
      setApplyingId(null);
    }
  }

  const STATUS_BUTTONS: Array<{ code: string; label: string; cls: string }> = [
    { code: "P", label: t("attendance.grid.legend.present"), cls: "bg-green-100 text-green-800 hover:bg-green-200" },
    { code: "A", label: t("attendance.grid.legend.absent"), cls: "bg-red-100 text-red-800 hover:bg-red-200" },
    { code: "H", label: t("attendance.grid.legend.halfDay"), cls: "bg-amber-100 text-amber-800 hover:bg-amber-200" },
    // HPL = "Half Present + Half Leave" -- e.g. worked the morning, took
    // the afternoon as half-day leave. Records the attendance row only;
    // the leave-balance side is intentionally manual for now (HR can use
    // the "Apply leave" section below in half-day mode if they also need
    // to deduct balance).
    { code: "HPL", label: t("attendance.grid.editor.hplShort"), cls: "bg-teal-100 text-teal-800 hover:bg-teal-200" },
    // Overtime on a rest day: worked a week-off (WOT) or holiday (HOT).
    // Payroll pays the configured overtime premium per such day.
    {
      code: "WOT",
      label: t("attendance.grid.editor.weekOffOt"),
      cls: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
    },
    { code: "HOT", label: t("attendance.grid.editor.holidayOt"), cls: "bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-200" },
    { code: "", label: t("attendance.grid.editor.reset"), cls: "bg-gray-100 text-gray-700 hover:bg-gray-200" },
  ];

  return (
    <div
      ref={wrapRef}
      className="absolute left-1/2 top-full z-50 mt-1 w-72 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-xl dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">
            {userName}
          </p>
          <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">{date}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("attendance.grid.editor.close")}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {existingApplications.length > 0 && (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
          <p className="mb-1 font-semibold">{t("attendance.grid.editor.existingLeave")}</p>
          <ul className="space-y-0.5">
            {existingApplications.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {a.leave_type_name}
                  {a.is_half_day && (
                    <span className="ml-1 text-blue-700/70">
                      ({a.half_day_type === "second_half"
                        ? t("attendance.grid.editor.halfPm")
                        : a.half_day_type === "first_half"
                          ? t("attendance.grid.editor.halfAm")
                          : t("attendance.grid.editor.halfDayShort")})
                    </span>
                  )}
                </span>
                <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-medium uppercase">
                  {a.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {t("attendance.grid.editor.setStatus")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_BUTTONS.map((b) => (
            <button
              key={b.code || "reset"}
              type="button"
              onClick={() => onPickStatus(b.code)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${b.cls} ${currentCode === b.code ? "ring-2 ring-brand-400" : ""}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {t("attendance.grid.editor.applyLeave")}
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" /> {t("attendance.grid.editor.loadingTypes")}
          </div>
        ) : leaveTypes.length === 0 ? (
          <p className="py-2 text-xs text-gray-400">{t("attendance.grid.editor.noLeaveTypes")}</p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {leaveTypes.map((lt) => {
              const disabled = lt.available_now < 1 || applyingId !== null;
              const isThisOne = applyingId === lt.id;
              return (
                <button
                  key={lt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => applyLeave(lt.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded border px-2 py-1.5 text-left text-xs transition ${
                    disabled
                      ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
                      : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                  }`}
                  title={
                    lt.available_now < 1
                      ? t("attendance.grid.editor.noBalance", { name: lt.name })
                      : t("attendance.grid.editor.applyOneDay", { name: lt.name })
                  }
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {isThisOne ? (
                      <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" />
                    ) : (
                      <CalendarPlus className="h-3 w-3 flex-shrink-0" />
                    )}
                    <span className="truncate">{lt.name}</span>
                  </span>
                  <span
                    className={`whitespace-nowrap text-[10px] font-semibold ${
                      lt.available_now < 1 ? "text-red-500" : "text-gray-500"
                    }`}
                  >
                    {t("attendance.grid.editor.left", { count: lt.available_now })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
