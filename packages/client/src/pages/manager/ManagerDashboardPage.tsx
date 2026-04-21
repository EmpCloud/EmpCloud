import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";

interface TeamMember {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  emp_code: string | null;
  role: string;
  designation: string | null;
  photo_path: string | null;
}

interface PendingLeave {
  id: number;
  user_id: number;
  start_date: string;
  end_date: string;
  days_count: number;
  is_half_day: boolean;
  reason: string;
  status: string;
  first_name: string;
  last_name: string;
  emp_code: string | null;
  leave_type_name: string | null;
  created_at: string;
}

interface CalendarLeave {
  id: number;
  user_id: number;
  start_date: string;
  end_date: string;
  days_count: number;
  is_half_day: boolean;
  half_day_type: string | null;
  first_name: string;
  last_name: string;
  leave_type_name: string | null;
  leave_type_color: string | null;
}

export default function ManagerDashboardPage() {
  const qc = useQueryClient();
  const [remarks, setRemarks] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  // Dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["manager-dashboard"],
    queryFn: () => api.get("/manager/dashboard").then((r) => r.data.data),
  });

  // Team list
  const { data: team = [], isLoading: teamLoading } = useQuery<TeamMember[]>({
    queryKey: ["manager-team"],
    queryFn: () => api.get("/manager/team").then((r) => r.data.data),
  });

  // Team attendance today
  const { data: attendance } = useQuery({
    queryKey: ["manager-attendance"],
    queryFn: () => api.get("/manager/attendance").then((r) => r.data.data),
  });

  // Pending leaves
  const { data: pendingLeaves = [] } = useQuery<PendingLeave[]>({
    queryKey: ["manager-leaves-pending"],
    queryFn: () => api.get("/manager/leaves/pending").then((r) => r.data.data),
  });

  // Team leave calendar (this week)
  const { data: calendar = [] } = useQuery<CalendarLeave[]>({
    queryKey: ["manager-leaves-calendar"],
    queryFn: () => api.get("/manager/leaves/calendar").then((r) => r.data.data),
  });

  // Approve / reject leave mutations
  const approveMut = useMutation({
    mutationFn: (id: number) =>
      api.put(`/leave/applications/${id}/approve`, { remarks }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-leaves-pending"] });
      qc.invalidateQueries({ queryKey: ["manager-dashboard"] });
      qc.invalidateQueries({ queryKey: ["manager-leaves-calendar"] });
      setActionId(null);
      setRemarks("");
    },
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) =>
      api.put(`/leave/applications/${id}/reject`, { remarks }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-leaves-pending"] });
      qc.invalidateQueries({ queryKey: ["manager-dashboard"] });
      setActionId(null);
      setRemarks("");
    },
  });

  // #1557 — Each card scrolls to the matching section on this same page.
  // The data is all already present below; the cards just needed a way to
  // act on a click. Team Size → Direct Reports; attendance stats → Team
  // Attendance Today; Pending Leaves → Pending Leave Requests.
  const statCards = [
    { label: "Team Size", value: stats?.team_size ?? "-", icon: Users, color: "bg-blue-50 text-blue-700", section: "direct-reports" },
    { label: "Present Today", value: stats?.present_today ?? "-", icon: UserCheck, color: "bg-green-50 text-green-700", section: "team-attendance" },
    { label: "Absent Today", value: stats?.absent_today ?? "-", icon: UserX, color: "bg-red-50 text-red-700", section: "team-attendance" },
    { label: "On Leave", value: stats?.on_leave_today ?? "-", icon: CalendarDays, color: "bg-purple-50 text-purple-700", section: "team-attendance" },
    { label: "Late Today", value: stats?.late_today ?? "-", icon: AlertTriangle, color: "bg-yellow-50 text-yellow-700", section: "team-attendance" },
    { label: "Pending Leaves", value: stats?.pending_leave_requests ?? "-", icon: Clock, color: "bg-amber-50 text-amber-700", section: "pending-leaves" },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Team</h1>
        <p className="text-gray-500 mt-1">
          Manager dashboard -- overview of your direct reports.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => scrollToSection(s.section)}
            aria-label={`Jump to ${s.label}`}
            className="bg-white rounded-xl border border-gray-200 p-5 text-left transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {statsLoading ? "..." : s.value}
                </p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Team Attendance Today */}
        <div id="team-attendance" className="bg-white rounded-xl border border-gray-200 overflow-hidden scroll-mt-4">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Team Attendance Today</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {attendance?.present?.length === 0 && attendance?.absent?.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400">No team members found</div>
            ) : (
              <>
                {(attendance?.present || []).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-sm font-semibold text-green-700">
                        {r.first_name?.[0]}{r.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.first_name} {r.last_name}</p>
                        <p className="text-xs text-gray-400">
                          In: {r.check_in ? new Date(r.check_in).toLocaleTimeString() : "-"}
                          {r.check_out ? ` | Out: ${new Date(r.check_out).toLocaleTimeString()}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 font-medium">
                      {r.status === "half_day" ? "Half Day" : "Present"}
                    </span>
                  </div>
                ))}
                {(attendance?.absent || []).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-sm font-semibold text-red-700">
                        {m.first_name?.[0]}{m.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.first_name} {m.last_name}</p>
                        <p className="text-xs text-gray-400">{m.emp_code || m.email}</p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-700 font-medium">
                      Absent
                    </span>
                  </div>
                ))}
                {(attendance?.on_leave || []).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-sm font-semibold text-purple-700">
                        {r.first_name?.[0]}{r.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.first_name} {r.last_name}</p>
                        <p className="text-xs text-gray-400">{r.emp_code || r.email}</p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-700 font-medium">
                      On Leave
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Team Leave Calendar (this week) */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Team Leave Calendar (This Week)</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {calendar.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400">
                No approved leaves this week
              </div>
            ) : (
              calendar.map((leave) => (
                <div key={leave.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: leave.leave_type_color || "#6366f1" }}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {leave.first_name} {leave.last_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {leave.leave_type_name || "Leave"} --{" "}
                        {leave.start_date === leave.end_date
                          ? leave.start_date
                          : `${leave.start_date} to ${leave.end_date}`}
                        {leave.is_half_day && ` (${leave.half_day_type === "first_half" ? "1st half" : "2nd half"})`}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{Number(leave.days_count)}d</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Pending Leave Requests */}
      <div id="pending-leaves" className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8 scroll-mt-4">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Pending Leave Requests</h2>
          <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full font-medium">
            {pendingLeaves.length} pending
          </span>
        </div>
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Dates</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Days</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Reason</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pendingLeaves.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  No pending leave requests
                </td>
              </tr>
            ) : (
              pendingLeaves.map((leave) => (
                <tr key={leave.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                        {leave.first_name?.[0]}{leave.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {leave.first_name} {leave.last_name}
                        </p>
                        <p className="text-xs text-gray-400">{leave.emp_code || ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {leave.leave_type_name || "-"}
                    {leave.is_half_day && <span className="ml-1 text-xs text-gray-400">(Half)</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {leave.start_date} &mdash; {leave.end_date}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                    {Number(leave.days_count)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {leave.reason}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setActionId(actionId === leave.id ? null : leave.id)}
                          className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded hover:bg-green-100"
                        >
                          Review
                        </button>
                      </div>
                      {actionId === leave.id && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Remarks (optional)"
                            className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-0"
                          />
                          <button
                            onClick={() => approveMut.mutate(leave.id)}
                            disabled={approveMut.isPending}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            <CheckCircle2 className="h-3 w-3 inline mr-1" />Approve
                          </button>
                          <button
                            onClick={() => rejectMut.mutate(leave.id)}
                            disabled={rejectMut.isPending}
                            className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            <XCircle className="h-3 w-3 inline mr-1" />Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Direct Reports List */}
      <div id="direct-reports" className="bg-white rounded-xl border border-gray-200 overflow-hidden scroll-mt-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Direct Reports</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {teamLoading ? (
            <div className="px-6 py-8 text-center text-gray-400">Loading team...</div>
          ) : team.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400">
              No direct reports found. You will see team members here once employees are assigned to you as their reporting manager.
            </div>
          ) : (
            team.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => window.location.href = `/employees/${member.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                    {member.first_name?.[0]}{member.last_name?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {member.first_name} {member.last_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {member.designation || member.role} {member.emp_code ? `| ${member.emp_code}` : ""}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
