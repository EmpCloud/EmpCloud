import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { PlusCircle, Clock, CheckCircle2, XCircle, CalendarDays } from "lucide-react";

interface CompOffRequest {
  id: number;
  user_id: number;
  worked_date: string;
  expires_on: string;
  reason: string;
  days: number;
  status: string;
  approved_by: number | null;
  rejection_reason: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  pending: { bg: "bg-amber-50", text: "text-amber-700", icon: Clock },
  approved: { bg: "bg-green-50", text: "text-green-700", icon: CheckCircle2 },
  rejected: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
};

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

export default function CompOffPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"my" | "pending">("my");
  const [rejectReason, setRejectReason] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  const [form, setForm] = useState({
    worked_date: "",
    expires_on: "",
    reason: "",
    days: 1,
  });

  // My comp-off requests
  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ["comp-off-my"],
    queryFn: () => api.get("/leave/comp-off/my").then((r) => r.data),
  });
  const myRequests: CompOffRequest[] = myData?.data || [];

  // Pending comp-off requests (HR/manager view)
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ["comp-off-pending"],
    queryFn: () => api.get("/leave/comp-off/pending").then((r) => r.data),
    enabled: !!isHR,
  });
  const pendingRequests: CompOffRequest[] = pendingData?.data || [];

  // Comp-off balance
  const { data: balanceData } = useQuery({
    queryKey: ["comp-off-balance"],
    queryFn: () => api.get("/leave/comp-off/balance").then((r) => r.data.data),
  });

  // Submit comp-off request
  const submitMut = useMutation({
    mutationFn: (data: typeof form) =>
      api.post("/leave/comp-off/request", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comp-off-my"] });
      qc.invalidateQueries({ queryKey: ["comp-off-balance"] });
      setShowForm(false);
      setForm({ worked_date: "", expires_on: "", reason: "", days: 1 });
    },
  });

  // Approve
  const approveMut = useMutation({
    mutationFn: (id: number) =>
      api.put(`/leave/comp-off/${id}/approve`).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comp-off-pending"] });
      qc.invalidateQueries({ queryKey: ["comp-off-my"] });
      qc.invalidateQueries({ queryKey: ["comp-off-balance"] });
      setActionId(null);
    },
  });

  // Reject
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.put(`/leave/comp-off/${id}/reject`, { reason }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comp-off-pending"] });
      qc.invalidateQueries({ queryKey: ["comp-off-my"] });
      setActionId(null);
      setRejectReason("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMut.mutate(form);
  };

  // Auto-set expiry to 30 days from worked date
  const handleWorkedDateChange = (date: string) => {
    const expiryDate = new Date(date);
    expiryDate.setDate(expiryDate.getDate() + 30);
    setForm({
      ...form,
      worked_date: date,
      expires_on: expiryDate.toISOString().slice(0, 10),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compensatory Off</h1>
          <p className="text-gray-500 mt-1">
            Request comp-off for working on holidays or weekends.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <PlusCircle className="h-4 w-4" /> Request Comp-Off
        </button>
      </div>

      {/* Balance Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-700">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {balanceData?.balance ?? 0}
              </p>
              <p className="text-xs text-gray-500">Comp-Off Balance</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            {balanceData?.total_used ?? 0} used of {balanceData?.total_allocated ?? 0} allocated
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-amber-50 text-amber-700">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {myRequests.filter((r) => r.status === "pending").length}
              </p>
              <p className="text-xs text-gray-500">Pending Requests</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-green-50 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {myRequests.filter((r) => r.status === "approved").length}
              </p>
              <p className="text-xs text-gray-500">Approved Requests</p>
            </div>
          </div>
        </div>
      </div>

      {/* Request Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Compensatory Off</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Worked</label>
              <input
                type="date"
                value={form.worked_date}
                onChange={(e) => handleWorkedDateChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires On</label>
              <input
                type="date"
                value={form.expires_on}
                onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Auto-set to 30 days from worked date</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Days</label>
              <select
                value={form.days}
                onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value={0.5}>Half Day (0.5)</option>
                <option value={1}>Full Day (1)</option>
                <option value={1.5}>1.5 Days</option>
                <option value={2}>2 Days</option>
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                rows={2}
                placeholder="Describe why you worked on this day (e.g., holiday shift, weekend deployment)"
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitMut.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              Submit Request
            </button>
          </div>
          {submitMut.isError && (
            <p className="text-sm text-red-600 mt-2">
              {(submitMut.error as any)?.response?.data?.error?.message || "Failed to submit request"}
            </p>
          )}
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("my")}
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            tab === "my"
              ? "bg-brand-50 text-brand-700"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          My Requests
        </button>
        {isHR && (
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${
              tab === "pending"
                ? "bg-brand-50 text-brand-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Pending Approvals
            {pendingRequests.length > 0 && (
              <span className="ml-2 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* My Requests Table */}
      {tab === "my" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Worked Date</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Days</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Expires On</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Reason</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {myLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">Loading...</td>
                </tr>
              ) : myRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    No comp-off requests yet
                  </td>
                </tr>
              ) : (
                myRequests.map((req) => {
                  const style = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
                  const Icon = style.icon;
                  return (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{req.worked_date}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{Number(req.days)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{req.expires_on}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{req.reason}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${style.bg} ${style.text}`}>
                          <Icon className="h-3 w-3" /> {req.status}
                        </span>
                        {req.rejection_reason && (
                          <p className="text-xs text-red-500 mt-1">{req.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending Approvals Table (HR View) */}
      {tab === "pending" && isHR && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Worked Date</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Days</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Reason</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendingLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">Loading...</td>
                </tr>
              ) : pendingRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    No pending comp-off requests
                  </td>
                </tr>
              ) : (
                pendingRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      User #{req.user_id}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{req.worked_date}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{Number(req.days)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{req.reason}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => approveMut.mutate(req.id)}
                            disabled={approveMut.isPending}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3 inline mr-1" />Approve
                          </button>
                          <button
                            onClick={() => setActionId(actionId === req.id ? null : req.id)}
                            className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded hover:bg-red-100"
                          >
                            <XCircle className="h-3 w-3 inline mr-1" />Reject
                          </button>
                        </div>
                        {actionId === req.id && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Rejection reason"
                              className="px-2 py-1 border border-gray-300 rounded text-xs flex-1"
                            />
                            <button
                              onClick={() => rejectMut.mutate({ id: req.id, reason: rejectReason })}
                              disabled={rejectMut.isPending}
                              className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                            >
                              Confirm Reject
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
      )}
    </div>
  );
}
