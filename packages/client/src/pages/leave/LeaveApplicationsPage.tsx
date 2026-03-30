import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { CheckCircle2, XCircle, Clock, Ban, Filter } from "lucide-react";

interface LeaveApplication {
  id: number;
  user_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  days_count: number;
  is_half_day: boolean;
  reason: string;
  status: string;
  created_at: string;
}

interface LeaveType {
  id: number;
  name: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  pending: { bg: "bg-amber-50", text: "text-amber-700", icon: Clock },
  approved: { bg: "bg-green-50", text: "text-green-700", icon: CheckCircle2 },
  rejected: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
  cancelled: { bg: "bg-gray-50", text: "text-gray-500", icon: Ban },
};

const HR_ROLES = ["hr_admin", "org_admin", "super_admin", "manager"];

export default function LeaveApplicationsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canApprove = user ? HR_ROLES.includes(user.role) : false;
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [remarks, setRemarks] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["leave-applications", page, statusFilter],
    queryFn: () =>
      api
        .get("/leave/applications", { params: { page, per_page: 20, status: statusFilter || undefined } })
        .then((r) => r.data),
  });

  const { data: leaveTypes = [] } = useQuery<LeaveType[]>({
    queryKey: ["leave-types"],
    queryFn: () => api.get("/leave/types").then((r) => r.data.data),
  });

  const applications: LeaveApplication[] = data?.data || [];
  const meta = data?.meta;

  const approveMut = useMutation({
    mutationFn: (id: number) =>
      api.put(`/leave/applications/${id}/approve`, { remarks }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-applications"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      setActionId(null);
      setRemarks("");
    },
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) =>
      api.put(`/leave/applications/${id}/reject`, { remarks }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-applications"] });
      setActionId(null);
      setRemarks("");
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) =>
      api.put(`/leave/applications/${id}/cancel`).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-applications"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
    },
  });

  const getTypeName = (id: number) => leaveTypes.find((t) => t.id === id)?.name ?? "-";

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Applications</h1>
          <p className="text-gray-500 mt-1">Review, approve, or reject leave requests.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Dates</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Days</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Reason</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : applications.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No applications found</td></tr>
            ) : (
              applications.map((app) => {
                const style = STATUS_STYLES[app.status] || STATUS_STYLES.pending;
                const Icon = style.icon;
                return (
                  <tr key={app.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {getTypeName(app.leave_type_id)}
                      {app.is_half_day && (
                        <span className="ml-1 text-xs text-gray-400">(Half)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {app.start_date} &mdash; {app.end_date}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                      {Number(app.days_count)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {app.reason}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${style.bg} ${style.text}`}>
                        <Icon className="h-3 w-3" /> {app.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {app.status === "pending" && (
                          <>
                            {canApprove && (
                              <button
                                onClick={() => setActionId(actionId === app.id ? null : app.id)}
                                className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded hover:bg-green-100"
                              >
                                Review
                              </button>
                            )}
                            <button
                              onClick={() => cancelMut.mutate(app.id)}
                              className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded hover:bg-gray-100"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {app.status === "approved" && (
                          <button
                            onClick={() => cancelMut.mutate(app.id)}
                            className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                      {canApprove && actionId === app.id && app.status === "pending" && (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Remarks (optional)"
                            className="px-2 py-1 border border-gray-300 rounded text-xs flex-1"
                          />
                          <button
                            onClick={() => approveMut.mutate(app.id)}
                            disabled={approveMut.isPending}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectMut.mutate(app.id)}
                            disabled={rejectMut.isPending}
                            className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Page {meta.page} of {meta.total_pages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
