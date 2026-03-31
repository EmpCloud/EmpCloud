import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Users, UserCheck, UserX, Clock, AlertTriangle, CalendarDays, Filter, Download } from "lucide-react";
import { AiBadge } from "@/components/AiBadge";
import { useAuthStore } from "@/lib/auth-store";

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

  const handleExportCSV = () => {
    if (!records || records.length === 0) return;
    const headers = ["Employee", "Emp Code", "Date", "Check In", "Check Out", "Worked", "Status", "Late (min)"];
    const rows = records.map((r: any) => [
      `${r.first_name || ""} ${r.last_name || ""}`.trim(),
      r.emp_code || r.email || "",
      r.date ? new Date(r.date).toLocaleDateString() : "",
      r.check_in ? new Date(r.check_in).toLocaleTimeString() : "",
      r.check_out ? new Date(r.check_out).toLocaleTimeString() : "",
      r.worked_minutes != null ? `${Math.floor(r.worked_minutes / 60)}h ${r.worked_minutes % 60}m` : "",
      r.status?.replace(/_/g, " ") || "",
      r.late_minutes || "0",
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map((cell: string) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance_${months.find((m) => m.value === month)?.label}_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
            onClick={handleExportCSV}
            disabled={!records || records.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

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
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-12 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded-full" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-10 bg-gray-200 rounded" /></td>
                  </tr>
                ))}
              </>
            ) : records.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No attendance records found for the selected filters</td></tr>
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
                        : r.status === "half_day" ? "bg-yellow-50 text-yellow-700"
                        : r.status === "on_leave" ? "bg-blue-50 text-blue-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {r.late_minutes ? `${r.late_minutes}m` : "-"}
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
