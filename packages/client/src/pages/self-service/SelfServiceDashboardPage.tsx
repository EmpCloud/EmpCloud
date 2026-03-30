import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Clock,
  CalendarDays,
  FileText,
  Megaphone,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Sparkles,
} from "lucide-react";
import { AiBadge } from "@/components/AiBadge";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";

function QuickLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-brand-300 hover:shadow-sm transition-all group"
    >
      <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 group-hover:bg-brand-100">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-sm font-medium text-gray-700 group-hover:text-brand-600">{label}</span>
      <ArrowRight className="h-4 w-4 text-gray-400 ml-auto group-hover:text-brand-500" />
    </Link>
  );
}

export default function SelfServiceDashboardPage() {
  const user = useAuthStore((s) => s.user);

  // Attendance today
  const { data: attendanceData } = useQuery({
    queryKey: ["my-attendance-today"],
    queryFn: () =>
      api
        .get("/attendance/me/today")
        .then((r) => r.data.data)
        .catch(() => null),
  });

  // Leave balance
  const { data: leaveBalance } = useQuery({
    queryKey: ["my-leave-balance"],
    queryFn: () =>
      api
        .get("/leave/balances")
        .then((r) => r.data.data)
        .catch(() => []),
  });

  // My documents
  const { data: documentsData } = useQuery({
    queryKey: ["my-documents-pending"],
    queryFn: () =>
      api
        .get("/documents/my")
        .then((r) => r.data.data)
        .catch(() => []),
  });

  // Recent announcements
  const { data: announcements } = useQuery({
    queryKey: ["recent-announcements"],
    queryFn: () =>
      api
        .get("/announcements", { params: { page: 1, per_page: 5 } })
        .then((r) => r.data.data)
        .catch(() => []),
  });

  // Policies to acknowledge
  const { data: policies } = useQuery({
    queryKey: ["pending-policies"],
    queryFn: () =>
      api
        .get("/policies", { params: { page: 1, per_page: 5 } })
        .then((r) => r.data.data)
        .catch(() => []),
  });

  const todayAttendance = Array.isArray(attendanceData) ? attendanceData[0] : null;
  const leaveBalances = Array.isArray(leaveBalance) ? leaveBalance : [];
  const pendingDocs = Array.isArray(documentsData) ? documentsData : [];
  const announcementList = Array.isArray(announcements) ? announcements : [];
  const policyList = Array.isArray(policies) ? policies : [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.first_name}!
        </h1>
        <p className="text-gray-500 mt-1">Here is your self-service dashboard overview.</p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <QuickLink to="/my-profile" icon={FileText} label="My Profile" />
        <QuickLink to="/leave/applications" icon={CalendarDays} label="Apply Leave" />
        <QuickLink to="/attendance/my" icon={Clock} label="Mark Attendance" />
        <QuickLink to="/helpdesk/my-tickets" icon={FileText} label="Request Update" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Today */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900">My Attendance Today</h2>
          </div>
          {todayAttendance ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">Checked in</p>
                <p className="text-xs text-gray-500">
                  {todayAttendance.check_in_time || "N/A"}
                  {todayAttendance.check_out_time ? ` - ${todayAttendance.check_out_time}` : ""}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-gray-300" />
              <p className="text-sm text-gray-500">Not checked in yet today</p>
            </div>
          )}
        </div>

        {/* Leave Balances */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900">Leave Balance</h2>
          </div>
          {leaveBalances.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {leaveBalances.slice(0, 4).map((lb: any) => (
                <div key={lb.id || lb.leave_type_id} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{lb.leave_type_name || lb.name || "Leave"}</p>
                  <p className="text-lg font-bold text-gray-900">
                    {lb.balance ?? lb.remaining ?? 0}
                  </p>
                  <p className="text-xs text-gray-400">days remaining</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No leave balances available</p>
          )}
        </div>

        {/* Pending Documents */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-brand-600" />
              <h2 className="text-lg font-semibold text-gray-900">Pending Documents</h2>
            </div>
            <Link to="/documents" className="text-xs text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {pendingDocs.length > 0 ? (
            <ul className="space-y-2">
              {pendingDocs.slice(0, 5).map((doc: any) => (
                <li key={doc.id} className="flex items-center gap-2 text-sm text-gray-600">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="truncate">{doc.title || doc.original_name || doc.file_name || doc.category_name || "Document"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No pending documents</p>
          )}
        </div>

        {/* Recent Announcements */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-brand-600" />
              <h2 className="text-lg font-semibold text-gray-900">Announcements</h2>
            </div>
            <Link to="/announcements" className="text-xs text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {announcementList.length > 0 ? (
            <ul className="space-y-3">
              {announcementList.slice(0, 3).map((a: any) => (
                <li key={a.id}>
                  <p className="text-sm font-medium text-gray-900">{a.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {a.content || a.body || ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No recent announcements</p>
          )}
        </div>

        {/* Policies to Acknowledge */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-brand-600" />
              <h2 className="text-lg font-semibold text-gray-900">Policies</h2>
            </div>
            <Link to="/policies" className="text-xs text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {policyList.length > 0 ? (
            <ul className="space-y-2">
              {policyList.slice(0, 5).map((p: any) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between text-sm text-gray-600 border-b border-gray-100 pb-2 last:border-0"
                >
                  <span>{p.title}</span>
                  {p.acknowledged ? (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Acknowledged
                    </span>
                  ) : (
                    <Link
                      to="/policies"
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Review
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No policies to review</p>
          )}
        </div>

        {/* AI Insights */}
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">AI Insights</h2>
            <AiBadge label="Beta" />
          </div>
          <ul className="space-y-3 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-0.5">&#128161;</span>
              <span>You have <strong>15 days</strong> of earned leave remaining. Consider planning time off before Q2 ends.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-0.5">&#128202;</span>
              <span>Your attendance this month: <strong>95%</strong> &mdash; above team average of 91%.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-0.5">&#128203;</span>
              <span>2 company policies updated recently. <Link to="/policies" className="text-purple-600 underline">Review them</Link>.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
