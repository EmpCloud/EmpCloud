import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Link } from "react-router-dom";
import { Users, UserCheck, UserX, Clock, AlertTriangle, CalendarDays, Filter, Download, ClipboardCheck, SlidersHorizontal, X, FileSpreadsheet, BarChart3, Loader2 } from "lucide-react";
import { AiBadge } from "@/components/AiBadge";
import { useAuthStore } from "@/lib/auth-store";
import * as XLSX from "xlsx";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

export default function AttendanceDashboardPage() {
  const { t, i18n } = useTranslation();
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

  // Month names use the active i18n locale so the dropdown follows the UI language.
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i).toLocaleString(i18n.language, { month: "long" }),
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
      alert(t('attendance.export.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  type BreakdownCategory = "total" | "present" | "absent" | "on_leave" | "late";
  const [breakdownOpen, setBreakdownOpen] = useState<BreakdownCategory | null>(null);

  const { data: breakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ["attendance-dashboard-breakdown"],
    queryFn: () => api.get("/attendance/dashboard/breakdown").then((r) => r.data.data),
    enabled: breakdownOpen !== null,
  });

  const stats: {
    label: string;
    value: number | string;
    icon: any;
    color: string;
    category: BreakdownCategory | null;
  }[] = [
    { label: t('attendance.totalEmployees'), value: dashboard?.total_employees ?? "-", icon: Users, color: "bg-blue-50 text-blue-700", category: "total" },
    { label: t('attendance.presentToday'), value: dashboard?.present ?? "-", icon: UserCheck, color: "bg-green-50 text-green-700", category: "present" },
    { label: t('attendance.absentToday'), value: dashboard?.absent ?? "-", icon: UserX, color: "bg-red-50 text-red-700", category: "absent" },
    { label: t('attendance.lateToday'), value: dashboard?.late ?? "-", icon: AlertTriangle, color: "bg-yellow-50 text-yellow-700", category: "late" },
    { label: t('attendance.onLeave'), value: dashboard?.on_leave ?? "-", icon: Clock, color: "bg-purple-50 text-purple-700", category: "on_leave" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">{t('attendance.dashboardTitle')} <AiBadge label={t('attendance.aiInsights')} /></h1>
        <p className="text-gray-500 mt-1">{t('attendance.dashboardSubtitle')}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s) => {
          const isClickable = s.category !== null;
          const content = (
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{dashLoading ? <span className="inline-block h-7 w-10 bg-gray-200 rounded animate-pulse" /> : s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          );
          return isClickable ? (
            <button
              key={s.label}
              type="button"
              onClick={() => setBreakdownOpen(s.category)}
              className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-brand-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
              aria-label={s.label}
            >
              {content}
            </button>
          ) : (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
              {content}
            </div>
          );
        })}
      </div>

      {/* Breakdown Modal */}
      {breakdownOpen !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setBreakdownOpen(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{t('attendance.breakdown.title', { date: breakdown?.date ?? t('attendance.breakdown.todayFallback') })}</h3>
              <button
                type="button"
                onClick={() => setBreakdownOpen(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label={t('attendance.breakdown.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 pt-4 border-b border-gray-200">
              <div className="flex gap-1 flex-wrap">
                {(
                  [
                    { key: "total", label: t('attendance.breakdown.tabAll'), color: "text-blue-700 border-blue-600" },
                    { key: "present", label: t('attendance.present'), color: "text-green-700 border-green-600" },
                    { key: "absent", label: t('attendance.absent'), color: "text-red-700 border-red-600" },
                    { key: "on_leave", label: t('attendance.onLeave'), color: "text-purple-700 border-purple-600" },
                    { key: "late", label: t('attendance.late'), color: "text-yellow-700 border-yellow-600" },
                  ] as const
                ).map((tab) => {
                  const count = tab.key === "total"
                    ? (breakdown?.present?.length ?? 0) + (breakdown?.absent?.length ?? 0) + (breakdown?.on_leave?.length ?? 0)
                    : breakdown?.[tab.key]?.length ?? 0;
                  const active = breakdownOpen === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setBreakdownOpen(tab.key)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                        active ? tab.color : "text-gray-500 border-transparent hover:text-gray-700"
                      }`}
                    >
                      {tab.label} ({breakdownLoading ? "…" : count})
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {breakdownLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : (() => {
                const list = breakdownOpen === "total"
                  ? [
                      ...(breakdown?.present ?? []),
                      ...(breakdown?.absent ?? []),
                      ...(breakdown?.on_leave ?? []),
                    ]
                  : breakdown?.[breakdownOpen] ?? [];
                if (list.length === 0) {
                  return <p className="text-center text-sm text-gray-500 py-12">{t('attendance.breakdown.noEmployeesInCategory')}</p>;
                }
                const statusLabel = (emp: any) => {
                  const s = emp.attendance_status;
                  if (s === "present" || s === "checked_in") return { label: t('attendance.present'), color: "bg-green-50 text-green-700" };
                  if (s === "half_day") return { label: t('attendance.statusHalfDay'), color: "bg-green-50 text-green-700" };
                  if (s === "on_leave") return { label: t('attendance.onLeave'), color: "bg-purple-50 text-purple-700" };
                  return { label: t('attendance.absent'), color: "bg-red-50 text-red-700" };
                };
                return (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                        <th className="py-2 font-medium">{t('common.name')}</th>
                        <th className="py-2 font-medium">{t('attendance.department')}</th>
                        <th className="py-2 font-medium">{t('attendance.checkIn')}</th>
                        {breakdownOpen === "total" && <th className="py-2 font-medium">{t('common.status')}</th>}
                        {breakdownOpen === "late" && <th className="py-2 font-medium">{t('attendance.breakdown.lateBy')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((emp: any) => {
                        const s = breakdownOpen === "total" ? statusLabel(emp) : null;
                        return (
                          <tr key={emp.id} className="border-b border-gray-100 last:border-0">
                            <td className="py-3">
                              <div className="font-medium text-gray-900">{emp.first_name} {emp.last_name}</div>
                              <div className="text-xs text-gray-500">{emp.email}</div>
                            </td>
                            <td className="py-3 text-gray-700">{emp.department || "—"}</td>
                            <td className="py-3 text-gray-700">{emp.check_in_time ? new Date(emp.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                            {breakdownOpen === "total" && s && (
                              <td className="py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>{s.label}</span>
                              </td>
                            )}
                            {breakdownOpen === "late" && (
                              <td className="py-3 text-yellow-700 font-medium">{emp.late_minutes} {t('attendance.breakdown.minSuffix')}</td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="flex gap-3 mb-6">
        <Link
          to="/attendance/regularizations"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ClipboardCheck className="h-4 w-4 text-amber-600" />
          {t('attendance.regularizationRequests')}
        </Link>
        <Link
          to="/attendance/shifts"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <SlidersHorizontal className="h-4 w-4 text-brand-600" />
          {t('attendance.shiftManagement')}
        </Link>
      </div>

      {/* Date & Department Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">{t('attendance.filters')}</h3>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('attendance.month')}</label>
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
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('attendance.year')}</label>
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
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('attendance.department')}</label>
            <select
              value={departmentId ?? ""}
              onChange={(e) => { setDepartmentId(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">{t('attendance.allDepartments')}</option>
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="border-l border-gray-200 pl-3 flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('attendance.dateFrom')}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('attendance.dateTo')}</label>
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
              <CalendarDays className="h-4 w-4" /> {t('attendance.apply')}
            </button>
          </div>
          <button
            onClick={handleClearFilters}
            className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('attendance.clearFilters')}
          </button>
          <button
            onClick={() => { setExportMonth(month); setExportYear(year); setShowExport(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
          >
            <Download className="h-4 w-4" /> {t('attendance.exportReport')}
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
                  <h3 className="text-lg font-semibold text-gray-900">{t('attendance.export.title')}</h3>
                  <p className="text-xs text-gray-400">{t('attendance.export.subtitle')}</p>
                </div>
              </div>
              <button onClick={() => setShowExport(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Report Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('attendance.export.reportType')}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportType("detailed")}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition ${exportType === "detailed" ? "border-brand-600 bg-brand-50" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <FileSpreadsheet className={`h-5 w-5 ${exportType === "detailed" ? "text-brand-600" : "text-gray-400"}`} />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{t('attendance.export.detailed')}</p>
                      <p className="text-xs text-gray-400">{t('attendance.export.detailedDesc')}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportType("consolidated")}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition ${exportType === "consolidated" ? "border-brand-600 bg-brand-50" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <BarChart3 className={`h-5 w-5 ${exportType === "consolidated" ? "text-brand-600" : "text-gray-400"}`} />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{t('attendance.export.consolidated')}</p>
                      <p className="text-xs text-gray-400">{t('attendance.export.consolidatedDesc')}</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Date Range Toggle */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={!exportUseRange} onChange={() => setExportUseRange(false)} className="text-brand-600" />
                    {t('attendance.export.monthYear')}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={exportUseRange} onChange={() => setExportUseRange(true)} className="text-brand-600" />
                    {t('attendance.export.customRange')}
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
                      <label className="block text-xs text-gray-500 mb-1">{t('attendance.export.from')}</label>
                      <input type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t('attendance.export.to')}</label>
                      <input type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                  </div>
                )}
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('attendance.department')}</label>
                  <select value={exportDept} onChange={(e) => setExportDept(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">{t('attendance.allDepartments')}</option>
                    {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                {exportType === "detailed" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.status')}</label>
                    <select value={exportStatus} onChange={(e) => setExportStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="">{t('attendance.export.allStatuses')}</option>
                      <option value="present">{t('attendance.present')}</option>
                      <option value="checked_in">{t('attendance.statusCheckedIn')}</option>
                      <option value="half_day">{t('attendance.statusHalfDay')}</option>
                      <option value="absent">{t('attendance.absent')}</option>
                      <option value="on_leave">{t('attendance.onLeave')}</option>
                    </select>
                  </div>
                )}
              </div>

              {/* What's included */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">{t('attendance.export.includes')}</p>
                {exportType === "detailed" ? (
                  <p className="text-xs text-gray-400">{t('attendance.export.includesDetailed')}</p>
                ) : (
                  <p className="text-xs text-gray-400">{t('attendance.export.includesConsolidated')}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowExport(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">{t('attendance.export.cancel')}</button>
              <button
                onClick={handleExport}
                disabled={exporting || (exportUseRange && !exportDateFrom)}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {exporting ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('attendance.export.exporting')}</> : <><Download className="h-4 w-4" /> {t('attendance.export.downloadExcel')}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Records Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('attendance.recordsTitle', { month: months.find((m) => m.value === month)?.label, year })}
            {departmentId ? ` ${t('attendance.filteredSuffix')}` : ""}
          </h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('common.name')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.department')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('common.date')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.checkIn')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.checkOut')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.tableWorked')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('common.status')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.late')}</th>
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
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">{t('attendance.noRecords')}</td></tr>
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
                      {(() => {
                        if (r.status === "checked_in") return t('attendance.statusCheckedIn');
                        if (r.status === "half_day") return t('attendance.statusHalfDay');
                        const k = `attendance.${r.status}`;
                        const tr = t(k);
                        return tr !== k ? tr : r.status.replace(/_/g, " ");
                      })()}
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
            <p className="text-sm text-gray-500">{t('attendance.pagination', { page: meta.page, totalPages: meta.total_pages, total: meta.total })}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50">{t('attendance.previous')}</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.total_pages} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50">{t('attendance.next')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
