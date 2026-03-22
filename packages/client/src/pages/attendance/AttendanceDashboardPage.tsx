import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { Users, UserCheck, UserX, Clock, AlertTriangle } from "lucide-react";

export default function AttendanceDashboardPage() {
  const [page, setPage] = useState(1);

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ["attendance-dashboard"],
    queryFn: () => api.get("/attendance/dashboard").then((r) => r.data.data),
  });

  const { data: recordsData, isLoading: recLoading } = useQuery({
    queryKey: ["attendance-records", page],
    queryFn: () => api.get("/attendance/records", { params: { page } }).then((r) => r.data),
  });

  const records = recordsData?.data || [];
  const meta = recordsData?.meta;

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
        <h1 className="text-2xl font-bold text-gray-900">Attendance Dashboard</h1>
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
                <p className="text-2xl font-bold text-gray-900">{dashLoading ? "..." : s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Today's Records Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Today's Attendance</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Check In</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Check Out</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Worked</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Late</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recLoading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No attendance records today</td></tr>
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
