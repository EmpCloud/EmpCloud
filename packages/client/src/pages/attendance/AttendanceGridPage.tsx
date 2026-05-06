import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

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
  defaultCode: "WO" | "HO" | "";
}

interface EmployeeRow {
  user_id: number;
  first_name: string;
  last_name: string;
  emp_code: string | null;
  days: Record<string, string>;
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
    case "WO":
      return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
    case "HO":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200";
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
      const counts = { P: 0, A: 0, H: 0, L: 0, WO: 0, HO: 0 };
      for (const d of data.days) {
        const c = cellCode(emp.user_id, d.date, emp.days[d.date] || "");
        if (c in counts) counts[c as keyof typeof counts]++;
      }
      return counts;
    },
    [data.days, overrides],
  );

  // Per-DAY column totals -- on date column N, how many employees were
  // P / A / H / L / WO / HO. Rendered as a tfoot block so HR can scan
  // "how many people were absent on May 15?" at a glance.
  const dayTotals = useMemo(() => {
    const out: Record<string, { P: number; A: number; H: number; L: number; WO: number; HO: number }> = {};
    for (const d of data.days) {
      const counts = { P: 0, A: 0, H: 0, L: 0, WO: 0, HO: 0 };
      for (const emp of data.employees) {
        const c = cellCode(emp.user_id, d.date, emp.days[d.date] || "");
        if (c in counts) counts[c as keyof typeof counts]++;
      }
      out[d.date] = counts;
    }
    return out;
  }, [data.days, data.employees, overrides]);

  // Org-wide totals across the whole month (sum of dayTotals) -- shown
  // in the right-hand summary column of the footer rows.
  const monthTotals = useMemo(() => {
    const totals = { P: 0, A: 0, H: 0, L: 0, WO: 0, HO: 0 };
    for (const d of data.days) {
      const c = dayTotals[d.date];
      if (!c) continue;
      totals.P += c.P;
      totals.A += c.A;
      totals.H += c.H;
      totals.L += c.L;
      totals.WO += c.WO;
      totals.HO += c.HO;
    }
    return totals;
  }, [dayTotals, data.days]);

  const FOOTER_ROWS: Array<{ code: keyof typeof monthTotals; label: string; cls: string }> = [
    { code: "P", label: "Present", cls: "text-green-700 dark:text-green-300" },
    { code: "A", label: "Absent", cls: "text-red-700 dark:text-red-300" },
    { code: "H", label: "Half day", cls: "text-amber-700 dark:text-amber-300" },
    { code: "L", label: "On leave", cls: "text-blue-700 dark:text-blue-300" },
    { code: "WO", label: "Week off", cls: "text-gray-500 dark:text-gray-400" },
    { code: "HO", label: "Holiday", cls: "text-purple-700 dark:text-purple-300" },
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
          <LegendDot label="WO" cls={codeStyle("WO")} desc="Week off" />
          <LegendDot label="HO" cls={codeStyle("HO")} desc="Holiday" />
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
              </tr>
            </thead>
            <tbody>
              {data.employees.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.days.length + 5}
                    className="px-4 py-8 text-center text-gray-400 dark:text-gray-500"
                  >
                    No employees in this org.
                  </td>
                </tr>
              ) : (
                data.employees.map((emp) => {
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
                        const code = cellCode(emp.user_id, d.date, emp.days[d.date] || "");
                        const isEditing =
                          editing?.uid === emp.user_id && editing.date === d.date;
                        return (
                          <td
                            key={d.date}
                            className="border-b border-gray-100 p-0.5 text-center dark:border-gray-800"
                          >
                            {isEditing ? (
                              <select
                                autoFocus
                                value={code === "WO" || code === "HO" ? "" : code}
                                onChange={(e) => commitCell(emp.user_id, d.date, e.target.value)}
                                onBlur={() => setEditing(null)}
                                className="h-7 w-12 rounded border border-blue-400 text-center text-xs outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">—</option>
                                <option value="P">P</option>
                                <option value="A">A</option>
                                <option value="H">H</option>
                                <option value="L">L</option>
                              </select>
                            ) : (
                              <div
                                onDoubleClick={() => setEditing({ uid: emp.user_id, date: d.date })}
                                title={`${d.date} — double-click to edit`}
                                className={`mx-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[11px] font-semibold transition hover:ring-2 hover:ring-blue-300 ${codeStyle(code)}`}
                              >
                                {code || "—"}
                              </div>
                            )}
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
                    </tr>
                  );
                })
              )}
            </tbody>
            {data.employees.length > 0 && (
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
                      colSpan={4}
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
        Tip: double-click any cell to mark P / A / H / L. WO and HO are computed automatically
        from the org calendar; pick a value to override or "—" to revert. A `present` row with
        less than 4 hours worked is shown as H automatically.
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
