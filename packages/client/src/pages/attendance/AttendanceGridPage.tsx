import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { ChevronLeft, ChevronRight, Loader2, Search, X, CalendarPlus, AlertTriangle } from "lucide-react";

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

const MONTHS = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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
    setOverrides((prev) => ({ ...prev, [cellKey(uid, date)]: newCode }));
    setEditing(null);
    try {
      await api.put("/attendance/cell", {
        user_id: uid,
        date,
        code: newCode,
      });
      qc.invalidateQueries({ queryKey });
      setStatus({ kind: "ok", text: `Saved ${newCode || "—"} for ${date}` });
    } catch (err: any) {
      // Roll the override back on failure.
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[cellKey(uid, date)];
        return next;
      });
      setStatus({
        kind: "err",
        text: err.response?.data?.error?.message || "Failed to save attendance",
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
      const counts = { P: 0, A: 0, H: 0, L: 0, HPL: 0, WO: 0, HO: 0, M: 0 };
      const weekoff = emp.weekoffDays || {};
      for (const d of data.days) {
        const c = cellCode(emp.user_id, d.date, emp.days[d.date] || "");
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
    { code: "P", label: "Present", cls: "text-green-700 dark:text-green-300" },
    { code: "A", label: "Absent", cls: "text-red-700 dark:text-red-300" },
    { code: "H", label: "Half day", cls: "text-amber-700 dark:text-amber-300" },
    { code: "L", label: "On leave", cls: "text-blue-700 dark:text-blue-300" },
    { code: "HPL", label: "½ Present + ½ Leave", cls: "text-teal-700 dark:text-teal-300" },
    { code: "WO", label: "Week off", cls: "text-gray-500 dark:text-gray-400" },
    { code: "HO", label: "Holiday", cls: "text-purple-700 dark:text-purple-300" },
    { code: "M", label: "Missed check-out", cls: "text-orange-700 dark:text-orange-300" },
  ];

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t("nav.attendanceGrid", "Attendance Grid")}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Date-wise attendance for the whole month. Double-click any cell to change the status.
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
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium text-gray-900 dark:text-gray-100">
            {MONTHS[month]} {year}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
          <LegendDot label="P" cls={codeStyle("P")} desc="Present" />
          <LegendDot label="A" cls={codeStyle("A")} desc="Absent" />
          <LegendDot label="H" cls={codeStyle("H")} desc="Half day" />
          <LegendDot label="L" cls={codeStyle("L")} desc="On leave" />
          <LegendDot label="HPL" cls={codeStyle("HPL")} desc="½ Present + ½ Leave" />
          <LegendDot label="WO" cls={codeStyle("WO")} desc="Week off" />
          <LegendDot label="HO" cls={codeStyle("HO")} desc="Holiday" />
          <LegendDot label="WOT" cls={codeStyle("WOT")} desc="Week-off OT (worked)" />
          <LegendDot label="HOT" cls={codeStyle("HOT")} desc="Holiday OT (worked)" />
          <LegendDot label="M" cls={codeStyle("M")} desc="Missed check-out" />
        </div>
      </div>

      {/* Filter bar — search by name / emp_code, narrow by department or
          location. Filters operate client-side over the already-fetched
          rows so changes feel instant. */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Search employee
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or employee code"
              className="w-full rounded-md border border-gray-300 bg-white pl-8 pr-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Department
          </label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All departments</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Location
          </label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All locations</option>
            {locationOptions.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {filteredEmployees.length} of {data.employees.length} employees
          </span>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <X className="h-3 w-3" />
              Clear filters
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
                  Employee
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
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.days.length + 6}
                    className="px-4 py-8 text-center text-gray-400 dark:text-gray-500"
                  >
                    {data.employees.length === 0
                      ? "No employees in this org."
                      : "No employees match the current filters."}
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
                                    text: `Leave applied for ${emp.first_name} on ${d.date}`,
                                  });
                                }}
                              />
                            ) : null}
                            <div className="relative mx-auto h-7 w-7">
                              <div
                                onDoubleClick={() => setEditing({ uid: emp.user_id, date: d.date })}
                                title={cellTitle}
                                className={`flex h-full w-full cursor-pointer items-center justify-center rounded text-[11px] font-semibold transition hover:ring-2 hover:ring-blue-300 ${codeStyle(displayCode)}`}
                              >
                                {displayCode || "—"}
                              </div>
                              {showRibbon && (
                                <span
                                  aria-label="Week off"
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
                      Total {row.code} — {row.label}
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
                      colSpan={5}
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
        Tip: double-click any cell to mark P / A / H / L / HPL / WOT / HOT. WO and HO are computed automatically
        from the org calendar; pick a value to override or "—" to revert. A worker with both
        check-in and check-out in a day is classified by hours worked vs shift length:
        below 25% of shift &rarr; A (Absent), 25–50% &rarr; H (Half day), 50%+ &rarr; P (Present).
        A past day where the worker checked in but never checked out shows as M (Missed
        check-out) so HR can review and override before payroll.
      </p>
    </div>
  );
}

function LegendDot({ label, cls, desc }: { label: string; cls: string; desc: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex h-5 w-6 items-center justify-center rounded text-[10px] font-semibold ${cls}`}>
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
      setError(err?.response?.data?.error?.message || err?.message || "Failed to apply leave");
    } finally {
      setApplyingId(null);
    }
  }

  const STATUS_BUTTONS: Array<{ code: string; label: string; cls: string }> = [
    { code: "P", label: "Present", cls: "bg-green-100 text-green-800 hover:bg-green-200" },
    { code: "A", label: "Absent", cls: "bg-red-100 text-red-800 hover:bg-red-200" },
    { code: "H", label: "Half day", cls: "bg-amber-100 text-amber-800 hover:bg-amber-200" },
    // HPL = "Half Present + Half Leave" -- e.g. worked the morning, took
    // the afternoon as half-day leave. Records the attendance row only;
    // the leave-balance side is intentionally manual for now (HR can use
    // the "Apply leave" section below in half-day mode if they also need
    // to deduct balance).
    { code: "HPL", label: "½P + ½L", cls: "bg-teal-100 text-teal-800 hover:bg-teal-200" },
    // Overtime on a rest day: worked a week-off (WOT) or holiday (HOT).
    // Payroll pays the configured overtime premium per such day.
    {
      code: "WOT",
      label: "Week-off OT",
      cls: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
    },
    { code: "HOT", label: "Holiday OT", cls: "bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-200" },
    { code: "", label: "Reset", cls: "bg-gray-100 text-gray-700 hover:bg-gray-200" },
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
          aria-label="Close"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {existingApplications.length > 0 && (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
          <p className="mb-1 font-semibold">Existing leave on this date</p>
          <ul className="space-y-0.5">
            {existingApplications.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {a.leave_type_name}
                  {a.is_half_day && (
                    <span className="ml-1 text-blue-700/70">
                      ({a.half_day_type === "second_half"
                        ? "½ PM"
                        : a.half_day_type === "first_half"
                          ? "½ AM"
                          : "half day"})
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
          Set status
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_BUTTONS.map((b) => (
            <button
              key={b.code || "reset"}
              type="button"
              onClick={() => onPickStatus(b.code)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${b.cls} ${currentCode === b.code ? "ring-2 ring-blue-400" : ""}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Apply leave
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading types…
          </div>
        ) : leaveTypes.length === 0 ? (
          <p className="py-2 text-xs text-gray-400">No active leave types in the org.</p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {leaveTypes.map((t) => {
              const disabled = t.available_now < 1 || applyingId !== null;
              const isThisOne = applyingId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => applyLeave(t.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded border px-2 py-1.5 text-left text-xs transition ${
                    disabled
                      ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
                      : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                  }`}
                  title={
                    t.available_now < 1
                      ? `No balance left for ${t.name}`
                      : `Apply 1 day of ${t.name}`
                  }
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {isThisOne ? (
                      <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" />
                    ) : (
                      <CalendarPlus className="h-3 w-3 flex-shrink-0" />
                    )}
                    <span className="truncate">{t.name}</span>
                  </span>
                  <span
                    className={`whitespace-nowrap text-[10px] font-semibold ${
                      t.available_now < 1 ? "text-red-500" : "text-gray-500"
                    }`}
                  >
                    {t.available_now} left
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
