import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Users, UserCheck, UserX, Clock, AlertTriangle, CalendarDays, Filter, Download, ClipboardCheck, SlidersHorizontal, X, FileSpreadsheet, BarChart3, Loader2 } from "lucide-react";
import { AiBadge } from "@/components/AiBadge";
import { useAuthStore } from "@/lib/auth-store";
import * as XLSX from "xlsx";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

export default function AttendanceDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);

  // Redirect non-HR users to their personal attendance page
  if (!isHR) {
    return <Navigate to="/attendance/my" replace />;
  }
  const [page, setPage] = useState(1);
  const now = new Date();
  const [month, setMonth] = useState(() => now.getMonth() + 1);
  const [year, setYear] = useState(() => now.getFullYear());
  const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Applied date range — only used in the query after clicking Apply
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i).toLocaleString("default", { month: "long" }),
  }));

  // Fetch departments for the dropdown filter
  const { data: departments = [] } = useQuery({
    queryKey: ["org-departments"],
    queryFn: () => api.get("/organizations/me/departments").then((r) => r.data.data),
    staleTime: 60000,
  });

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ["attendance-dashboard"],
    queryFn: () => api.get("/attendance/dashboard").then((r) => r.data.data),
  });

  const { data: recordsData, isLoading: recLoading } = useQuery({
    queryKey: ["attendance-records", page, month, year, departmentId, appliedDateFrom, appliedDateTo],
    queryFn: () => {
      const params: Record<string, any> = {
        page,
        department_id: departmentId || undefined,
      };
      if (appliedDateFrom) {
        params.date_from = appliedDateFrom;
        if (appliedDateTo) params.date_to = appliedDateTo;
      } else {
        params.month = month;
        params.year = year;
      }
      return api.get("/attendance/records", { params }).then((r) => r.data);
    },
  });

  const handleDateRangeApply = () => {
    if (dateFrom) {
      setAppliedDateFrom(dateFrom);
      setAppliedDateTo(dateTo);
      setPage(1);
    }
  };

  const handleClearFilters = () => {
    const n = new Date();
    setMonth(n.getMonth() + 1);
    setYear(n.getFullYear());
    setDepartmentId(undefined);
    setDateFrom("");
    setDateTo("");
    setAppliedDateFrom("");
    setAppliedDateTo("");
    setPage(1);
  };

  const records = recordsData?.data || [];
  const meta = recordsData?.meta;

  // Export modal state
  const [showExport, setShowExport] = useState(false);
  const [exportType, setExportType] = useState<"detailed" | "consolidated">("detailed");
  const [exportMonth, setExportMonth] = useState(month);
  const [exportYear, setExportYear] = useState(year);
  const [exportDept, setExportDept] = useState<string>("");
  const [exportEmployee] = useState<string>("");
  const [exportStatus, setExportStatus] = useState<string>("");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportUseRange, setExportUseRange] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fmtMin = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
  const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString() : "";
  const fmtTime = (v: any) => v ? new Date(v).toLocaleTimeString() : "";

  const downloadExcel = (headers: string[], rows: any[][], filename: string, sheetName = "Report") => {
    const data = rows.map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = headers.map((h) => {
      const maxLen = Math.max(h.length, ...rows.map((r) => String(r[headers.indexOf(h)] ?? "").length));
      return { wch: Math.min(maxLen + 2, 40) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename.replace(/\.csv$/, ".xlsx"));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, any> = {};
      if (exportUseRange && exportDateFrom) {
        params.date_from = exportDateFrom;
        if (exportDateTo) params.date_to = exportDateTo;
      } else {
        params.month = exportMonth;
        params.year = exportYear;
      }
      if (exportDept) params.department_id = exportDept;
      if (exportEmployee) params.employee_id = exportEmployee;
      if (exportStatus && exportType === "detailed") params.status = exportStatus;

      if (exportType === "detailed") {
        const res = await api.get("/attendance/export", { params });
        const data = res.data.data || [];
        const headers = [
          "Employee", "Emp Code", "Email", "Department", "Designation", "Date",
          "Shift", "Shift Start", "Shift End", "Check In", "Check Out",
          "Worked", "Overtime", "Late", "Early Departure", "Status",
        ];
        const rows = data.map((r: any) => [
          `${r.first_name || ""} ${r.last_name || ""}`.trim(),
          r.emp_code || "", r.email || "", r.department_name || "", r.designation || "",
          fmtDate(r.date), r.shift_name || "-", r.shift_start || "", r.shift_end || "",
          fmtTime(r.check_in), fmtTime(r.check_out),
          r.worked_minutes != null ? fmtMin(r.worked_minutes) : "",
          r.overtime_minutes ? fmtMin(r.overtime_minutes) : "0",
          r.late_minutes ? fmtMin(r.late_minutes) : "0",
          r.early_departure_minutes ? fmtMin(r.early_departure_minutes) : "0",
          r.status?.replace(/_/g, " ") || "",
        ]);
        const label = exportUseRange ? `${exportDateFrom}_to_${exportDateTo}` : `${months.find((m) => m.value === exportMonth)?.label}_${exportYear}`;
        downloadExcel(headers, rows, `attendance_detailed_${label}.xlsx`, "Detailed Report");
      } else {
        const res = await api.get("/attendance/export/consolidated", { params });
        const { report = [], total_working_days } = res.data.data || {};
        const headers = [
          "Employee", "Emp Code", "Email", "Department", "Designation",
          "Present Days", "Half Days", "Absent Days", "Leave Days", "Late Count",
          "Total Worked", "Avg Daily Worked", "Total Overtime", "Total Late", "Total Early Departure",
          `Attendance % (of ${total_working_days} days)`,
        ];
        const rows = report.map((r: any) => {
          const present = Number(r.present_days) + Number(r.half_days) * 0.5;
          const pct = total_working_days > 0 ? ((present / total_working_days) * 100).toFixed(1) + "%" : "-";
          return [
            `${r.first_name || ""} ${r.last_name || ""}`.trim(),
            r.emp_code || "", r.email || "", r.department_name || "", r.designation || "",
            r.present_days, r.half_days, r.absent_days, r.leave_days, r.late_count,
            fmtMin(Number(r.total_worked_minutes)),
            r.avg_worked_minutes ? fmtMin(Math.round(Number(r.avg_worked_minutes))) : "-",
            fmtMin(Number(r.total_overtime_minutes)),
            fmtMin(Number(r.total_late_minutes)),
            fmtMin(Number(r.total_early_departure_minutes)),
            pct,
          ];
        });
        downloadExcel(headers, rows, `attendance_consolidated_${months.find((m) => m.value === exportMonth)?.label}_${exportYear}.xlsx`, "Consolidated Report");
      }
      setShowExport(false);
    } catch (err) {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const stats = [
    { label: "Total Employees", value: dashboard?.total_employees ?? "-", icon: Users, color: "bg-blue-50 text-blue-700" },
    { label: "Present Today", value: dashboard?.present ?? "-", icon: UserCheck, color: "bg-green-50 text-green-700" },
    { label: "Absent Today", value: dashboard?.absent ?? "-", icon: UserX, color: "bg-red-50 text-red-700" },
    { label: "Late Today", value: dashboard?.late ?? "-", icon: AlertTriangle, color: "bg-yellow-50 text-yellow-700" },
    { label: "On Leave", value: dashboard?.on_leave ?? "-", icon: Clock, color: "bg-purple-50 text-purple-700" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">Attendance Dashboard <AiBadge label="AI Insights" /></h1>
        <p className="text-gray-500 mt-1">Today's attendance overview for your organization.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{dashLoading ? <span className="inline-block h-7 w-10 bg-gray-200 rounded animate-pulse" /> : s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="flex gap-3 mb-6">
        <Link
          to="/attendance/regularizations"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ClipboardCheck className="h-4 w-4 text-amber-600" />
          Regularization Requests
        </Link>
        <Link
          to="/attendance/shifts"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <SlidersHorizontal className="h-4 w-4 text-brand-600" />
          Shift Management
        </Link>
      </div>

      {/* Date & Department Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Filters</h3>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
            <select
              value={month}
              onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
            <select
              value={departmentId ?? ""}
              onChange={(e) => { setDepartmentId(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All Departments</option>
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="border-l border-gray-200 pl-3 flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <button
              onClick={handleDateRangeApply}
              disabled={!dateFrom}
              className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" /> Apply
            </button>
          </div>
          <button
            onClick={handleClearFilters}
            className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Clear Filters
          </button>
          <button
            onClick={() => { setExportMonth(month); setExportYear(year); setShowExport(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
          >
            <Download className="h-4 w-4" /> Export Report
          </button>
        </div>
      </div>

      {/* Export Modal */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <Download className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Export Attendance Report</h3>
                  <p className="text-xs text-gray-400">Choose report type and filters</p>
                </div>
              </div>
              <button onClick={() => setShowExport(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Report Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportType("detailed")}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition ${exportType === "detailed" ? "border-brand-600 bg-brand-50" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <FileSpreadsheet className={`h-5 w-5 ${exportType === "detailed" ? "text-brand-600" : "text-gray-400"}`} />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Detailed Report</p>
                      <p className="text-xs text-gray-400">Every check-in/out record</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportType("consolidated")}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition ${exportType === "consolidated" ? "border-brand-600 bg-brand-50" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <BarChart3 className={`h-5 w-5 ${exportType === "consolidated" ? "text-brand-600" : "text-gray-400"}`} />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Consolidated</p>
                      <p className="text-xs text-gray-400">Employee-wise monthly summary</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Date Range Toggle */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={!exportUseRange} onChange={() => setExportUseRange(false)} className="text-brand-600" />
                    Month/Year
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={exportUseRange} onChange={() => setExportUseRange(true)} className="text-brand-600" />
                    Custom Date Range
                  </label>
                </div>
                {!exportUseRange ? (
                  <div className="grid grid-cols-2 gap-3">
                    <select value={exportMonth} onChange={(e) => setExportMonth(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <select value={exportYear} onChange={(e) => setExportYear(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">From</label>
                      <input type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">To</label>
                      <input type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                  </div>
                )}
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
                  <select value={exportDept} onChange={(e) => setExportDept(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">All Departments</option>
                    {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                {exportType === "detailed" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                    <select value={exportStatus} onChange={(e) => setExportStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="">All Statuses</option>
                      <option value="present">Present</option>
                      <option value="checked_in">Checked In</option>
                      <option value="half_day">Half Day</option>
                      <option value="absent">Absent</option>
                      <option value="on_leave">On Leave</option>
                    </select>
                  </div>
                )}
              </div>

              {/* What's included */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">This report includes:</p>
                {exportType === "detailed" ? (
                  <p className="text-xs text-gray-400">Employee name, emp code, email, department, designation, date, shift info, check-in/out times, worked hours, overtime, late minutes, early departure, status</p>
                ) : (
                  <p className="text-xs text-gray-400">Employee name, emp code, email, department, designation, present/half/absent/leave days, late count, total worked, avg daily worked, overtime, late, early departure, attendance %</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowExport(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                onClick={handleExport}
                disabled={exporting || (exportUseRange && !exportDateFrom)}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {exporting ? <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</> : <><Download className="h-4 w-4" /> Download Excel</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Records Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Attendance Records &mdash; {months.find((m) => m.value === month)?.label} {year}
            {departmentId ? ` (Filtered)` : ""}
          </h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Department</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Date</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Check In</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Check Out</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Worked</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Late</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recLoading ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 w-28 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
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
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">No attendance records found for the selected filters</td></tr>
            ) : (
              records.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                        {r.first_name?.[0]}{r.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.first_name} {r.last_name}</p>
                        <p className="text-xs text-gray-400">{r.emp_code || r.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {r.department_name || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {r.date ? new Date(r.date).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {r.check_in ? new Date(r.check_in).toLocaleTimeString() : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {r.check_out ? new Date(r.check_out).toLocaleTimeString() : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {r.worked_minutes != null ? `${Math.floor(r.worked_minutes / 60)}h ${r.worked_minutes % 60}m` : "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      r.status === "present" ? "bg-green-50 text-green-700"
                        : r.status === "checked_in" ? "bg-brand-50 text-brand-700"
                        : r.status === "half_day" ? "bg-yellow-50 text-yellow-700"
                        : r.status === "on_leave" ? "bg-blue-50 text-blue-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {r.status === "checked_in" ? "checked in" : r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {r.late_minutes ? `${Math.floor(r.late_minutes / 60)}h ${r.late_minutes % 60}m` : "-"}
                  </td>
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
