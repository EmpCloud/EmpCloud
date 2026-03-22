import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { Check, X, Clock, Plus } from "lucide-react";

export default function RegularizationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"pending" | "all" | "my">("pending");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: "", requested_check_in: "", requested_check_out: "", reason: "" });

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ["regularizations", "pending", page],
    queryFn: () => api.get("/attendance/regularizations", { params: { page, status: "pending" } }).then((r) => r.data),
    enabled: tab === "pending",
  });

  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ["regularizations", "all", page],
    queryFn: () => api.get("/attendance/regularizations", { params: { page } }).then((r) => r.data),
    enabled: tab === "all",
  });

  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ["regularizations", "my", page],
    queryFn: () => api.get("/attendance/regularizations/me", { params: { page } }).then((r) => r.data),
    enabled: tab === "my",
  });

  const submitReg = useMutation({
    mutationFn: (data: typeof form) => api.post("/attendance/regularizations", {
      date: data.date,
      requested_check_in: data.requested_check_in || null,
      requested_check_out: data.requested_check_out || null,
      reason: data.reason,
    }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regularizations"] });
      setShowForm(false);
      setForm({ date: "", requested_check_in: "", requested_check_out: "", reason: "" });
    },
  });

  const processReg = useMutation({
    mutationFn: ({ id, status, rejection_reason }: { id: number; status: "approved" | "rejected"; rejection_reason?: string }) =>
      api.put(`/attendance/regularizations/${id}/approve`, { status, rejection_reason }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regularizations"] }),
  });

  const handleApprove = (id: number) => processReg.mutate({ id, status: "approved" });
  const handleReject = (id: number) => {
    const reason = prompt("Rejection reason (optional):");
    processReg.mutate({ id, status: "rejected", rejection_reason: reason || undefined });
  };

  const currentData = tab === "pending" ? pendingData : tab === "all" ? allData : myData;
  const isLoading = tab === "pending" ? pendingLoading : tab === "all" ? allLoading : myLoading;
  const records = currentData?.data || [];
  const meta = currentData?.meta;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitReg.mutate(form);
  };

  const setField = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const tabs = [
    { key: "pending" as const, label: "Pending Requests" },
    { key: "all" as const, label: "All Requests" },
    { key: "my" as const, label: "My Requests" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Regularizations</h1>
          <p className="text-gray-500 mt-1">Manage attendance correction requests.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New Request
        </button>
      </div>

      {/* Submit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Submit Regularization Request</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input type="text" value={form.reason} onChange={(e) => setField("reason", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Reason for regularization" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Requested Check In</label>
              <input type="datetime-local" value={form.requested_check_in} onChange={(e) => setField("requested_check_in", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Requested Check Out</label>
              <input type="datetime-local" value={form.requested_check_out} onChange={(e) => setField("requested_check_out", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={submitReg.isPending} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">Submit</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {tab !== "my" && <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>}
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Date</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Original In/Out</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Requested In/Out</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Reason</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              {tab === "pending" && <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No regularization requests</td></tr>
            ) : (
              records.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  {tab !== "my" && (
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.first_name} {r.last_name}</p>
                        <p className="text-xs text-gray-400">{r.emp_code || r.email}</p>
                      </div>
                    </td>
                  )}
                  <td className="px-6 py-4 text-sm text-gray-900">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    <div>{r.original_check_in ? new Date(r.original_check_in).toLocaleTimeString() : "-"}</div>
                    <div>{r.original_check_out ? new Date(r.original_check_out).toLocaleTimeString() : "-"}</div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600">
                    <div>{r.requested_check_in ? new Date(r.requested_check_in).toLocaleTimeString() : "-"}</div>
                    <div>{r.requested_check_out ? new Date(r.requested_check_out).toLocaleTimeString() : "-"}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] truncate">{r.reason}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                      r.status === "pending" ? "bg-yellow-50 text-yellow-700"
                        : r.status === "approved" ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {r.status === "pending" ? <Clock className="h-3 w-3" /> : r.status === "approved" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {r.status}
                    </span>
                    {r.rejection_reason && <p className="text-xs text-red-500 mt-1">{r.rejection_reason}</p>}
                  </td>
                  {tab === "pending" && (
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(r.id)}
                          disabled={processReg.isPending}
                          className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" /> Approve
                        </button>
                        <button
                          onClick={() => handleReject(r.id)}
                          disabled={processReg.isPending}
                          className="flex items-center gap-1 text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    </td>
                  )}
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
