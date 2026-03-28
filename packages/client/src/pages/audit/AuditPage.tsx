import { useAuditLogs } from "@/api/hooks";
import { useState } from "react";
import { Search, Filter, Calendar, RotateCcw } from "lucide-react";

const AUDIT_ACTIONS = [
  { value: "", label: "All actions" },
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
  { value: "login_failed", label: "Login Failed" },
  { value: "register", label: "Register" },
  { value: "password_change", label: "Password Change" },
  { value: "password_reset", label: "Password Reset" },
  { value: "user_created", label: "User Created" },
  { value: "user_updated", label: "User Updated" },
  { value: "user_deactivated", label: "User Deactivated" },
  { value: "user_invited", label: "User Invited" },
  { value: "org_updated", label: "Org Updated" },
  { value: "subscription_created", label: "Subscription Created" },
  { value: "subscription_updated", label: "Subscription Updated" },
  { value: "subscription_cancelled", label: "Subscription Cancelled" },
  { value: "seat_assigned", label: "Seat Assigned" },
  { value: "seat_revoked", label: "Seat Revoked" },
  { value: "token_issued", label: "Token Issued" },
  { value: "token_revoked", label: "Token Revoked" },
  { value: "oauth_authorize", label: "OAuth Authorize" },
  { value: "oauth_token", label: "OAuth Token" },
  { value: "profile_updated", label: "Profile Updated" },
  { value: "attendance_checkin", label: "Attendance Check-in" },
  { value: "attendance_checkout", label: "Attendance Check-out" },
  { value: "leave_applied", label: "Leave Applied" },
  { value: "leave_approved", label: "Leave Approved" },
  { value: "leave_rejected", label: "Leave Rejected" },
  { value: "leave_cancelled", label: "Leave Cancelled" },
  { value: "document_uploaded", label: "Document Uploaded" },
  { value: "document_verified", label: "Document Verified" },
  { value: "announcement_created", label: "Announcement Created" },
  { value: "policy_created", label: "Policy Created" },
  { value: "policy_acknowledged", label: "Policy Acknowledged" },
];

// Color-code action categories
function getActionStyle(action: string): string {
  if (action.startsWith("login") || action === "logout" || action === "register") return "bg-blue-50 text-blue-700";
  if (action.startsWith("user_") || action === "password_change" || action === "password_reset") return "bg-purple-50 text-purple-700";
  if (action.startsWith("leave_")) return "bg-amber-50 text-amber-700";
  if (action.startsWith("attendance_")) return "bg-green-50 text-green-700";
  if (action.startsWith("subscription_") || action.startsWith("seat_")) return "bg-indigo-50 text-indigo-700";
  if (action.startsWith("oauth_") || action.startsWith("token_")) return "bg-gray-100 text-gray-600";
  if (action.startsWith("document_") || action.startsWith("policy_") || action.startsWith("announcement_")) return "bg-teal-50 text-teal-700";
  return "bg-gray-100 text-gray-700";
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, isLoading } = useAuditLogs({
    page,
    action: action || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  });

  const logs = data?.data || [];
  const meta = data?.meta;

  const hasFilters = action || startDate || endDate;

  const clearFilters = () => {
    setAction("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-gray-500 mt-1">Complete activity trail for SOC 2 compliance.</p>
      </div>

      {/* Filter Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <RotateCcw className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Action Type Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Action Type</label>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {AUDIT_ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> From Date</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              max={endDate || undefined}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> To Date</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              min={startDate || undefined}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      </div>

      {/* Results Summary */}
      {hasFilters && meta && (
        <div className="text-sm text-gray-500 mb-3">
          Showing {logs.length} of {meta.total} filtered results
          {action && <span className="ml-1">for <span className="font-medium text-gray-700">{AUDIT_ACTIONS.find((a) => a.value === action)?.label}</span></span>}
          {startDate && <span className="ml-1">from <span className="font-medium text-gray-700">{startDate}</span></span>}
          {endDate && <span className="ml-1">to <span className="font-medium text-gray-700">{endDate}</span></span>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Time</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Action</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">User</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Resource</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded-full" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                  </tr>
                ))}
              </>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">
                    {hasFilters ? "No audit logs match your filters." : "No audit logs yet."}
                  </p>
                  {hasFilters && (
                    <button onClick={clearFilters} className="text-brand-600 text-sm mt-1 hover:underline">
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="px-6 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-mono font-medium ${getActionStyle(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-700">{log.user_id || "System"}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {log.resource_type ? (
                      <span className="text-xs">
                        {log.resource_type}
                        {log.resource_id && <span className="text-gray-400 ml-1">#{log.resource_id}</span>}
                      </span>
                    ) : (
                      <span className="text-gray-300">--</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-400 font-mono">{log.ip_address || "--"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">Page {meta.page} of {meta.total_pages} ({meta.total} total)</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.total_pages} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
