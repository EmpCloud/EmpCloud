import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { CalendarDays, PlusCircle, Clock, CheckCircle2, XCircle, Ban } from "lucide-react";

interface LeaveBalance {
  id: number;
  leave_type_id: number;
  year: number;
  total_allocated: number;
  total_used: number;
  total_carry_forward: number;
  balance: number;
}

interface LeaveType {
  id: number;
  name: string;
  code: string;
  color: string | null;
  is_paid: boolean;
}

export default function LeaveDashboardPage() {
  const qc = useQueryClient();
  const [showApply, setShowApply] = useState(false);

  const { data: balances = [], isLoading: loadingBalances } = useQuery<LeaveBalance[]>({
    queryKey: ["leave-balances"],
    queryFn: () => api.get("/leave/balances").then((r) => r.data.data),
  });

  const { data: leaveTypes = [] } = useQuery<LeaveType[]>({
    queryKey: ["leave-types"],
    queryFn: () => api.get("/leave/types").then((r) => r.data.data),
  });

  const [form, setForm] = useState({
    leave_type_id: 0,
    start_date: "",
    end_date: "",
    days_count: 1,
    is_half_day: false,
    half_day_type: "" as string | null,
    reason: "",
  });

  const applyLeave = useMutation({
    mutationFn: (data: typeof form) =>
      api.post("/leave/applications", {
        ...data,
        half_day_type: data.half_day_type || null,
      }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["leave-applications"] });
      setShowApply(false);
      setForm({ leave_type_id: 0, start_date: "", end_date: "", days_count: 1, is_half_day: false, half_day_type: "", reason: "" });
    },
  });

  const getTypeName = (typeId: number) =>
    leaveTypes.find((t) => t.id === typeId)?.name ?? "Unknown";

  const getTypeColor = (typeId: number) =>
    leaveTypes.find((t) => t.id === typeId)?.color ?? "#6366f1";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyLeave.mutate(form);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Dashboard</h1>
          <p className="text-gray-500 mt-1">View your leave balances and apply for leave.</p>
        </div>
        <button
          onClick={() => setShowApply(!showApply)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <PlusCircle className="h-4 w-4" /> Apply Leave
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loadingBalances ? (
          <div className="col-span-full text-center text-gray-400 py-8">Loading balances...</div>
        ) : balances.length === 0 ? (
          <div className="col-span-full text-center text-gray-400 py-8">
            No leave balances found. Ask HR to initialize balances.
          </div>
        ) : (
          balances.map((bal) => (
            <div
              key={bal.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: getTypeColor(bal.leave_type_id) }}
                />
                <h3 className="text-sm font-semibold text-gray-700">
                  {getTypeName(bal.leave_type_id)}
                </h3>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {Number(bal.balance)}
              </div>
              <p className="text-xs text-gray-500">
                {Number(bal.total_used)} used of {Number(bal.total_allocated)} allocated
                {Number(bal.total_carry_forward) > 0 && ` (+${Number(bal.total_carry_forward)} carry forward)`}
              </p>
              <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, (Number(bal.total_used) / (Number(bal.total_allocated) + Number(bal.total_carry_forward))) * 100)}%`,
                    backgroundColor: getTypeColor(bal.leave_type_id),
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Apply Form */}
      {showApply && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Apply for Leave</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
              <select
                value={form.leave_type_id}
                onChange={(e) => setForm({ ...form, leave_type_id: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              >
                <option value={0} disabled>Select type</option>
                {leaveTypes
                  .filter((t: any) => t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Days</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={form.days_count}
                onChange={(e) => setForm({ ...form, days_count: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_half_day}
                  onChange={(e) => setForm({ ...form, is_half_day: e.target.checked, half_day_type: e.target.checked ? "first_half" : "" })}
                  className="rounded border-gray-300"
                />
                Half Day
              </label>
              {form.is_half_day && (
                <select
                  value={form.half_day_type ?? ""}
                  onChange={(e) => setForm({ ...form, half_day_type: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="first_half">First Half</option>
                  <option value="second_half">Second Half</option>
                </select>
              )}
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                rows={2}
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => setShowApply(false)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={applyLeave.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" /> Submit Application
            </button>
          </div>
        </form>
      )}

      {/* Recent Applications */}
      <RecentApplications leaveTypes={leaveTypes} />

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-gray-500 mt-6">
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-amber-500" /> Pending</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Approved</span>
        <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-red-500" /> Rejected</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Applications sub-component
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  pending: { bg: "bg-amber-50", text: "text-amber-700", icon: Clock },
  approved: { bg: "bg-green-50", text: "text-green-700", icon: CheckCircle2 },
  rejected: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
  cancelled: { bg: "bg-gray-50", text: "text-gray-500", icon: Ban },
};

function RecentApplications({ leaveTypes }: { leaveTypes: LeaveType[] }) {
  const { data, isLoading } = useQuery({
    queryKey: ["leave-applications-me"],
    queryFn: () =>
      api
        .get("/leave/applications/me", { params: { page: 1, per_page: 5 } })
        .then((r) => r.data),
  });

  const applications = data?.data || [];
  const getTypeName = (id: number) => leaveTypes.find((t) => t.id === id)?.name ?? "-";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Recent Applications</h2>
      </div>
      <table className="min-w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Type</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Dates</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Days</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {isLoading ? (
            <tr>
              <td colSpan={4} className="px-6 py-8 text-center text-gray-400">Loading...</td>
            </tr>
          ) : applications.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-8 text-center text-gray-400">No applications yet.</td>
            </tr>
          ) : (
            applications.map((app: any) => {
              const style = STATUS_STYLES[app.status] || STATUS_STYLES.pending;
              const Icon = style.icon;
              return (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {getTypeName(app.leave_type_id)}
                    {app.is_half_day && <span className="ml-1 text-xs text-gray-400">(Half)</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {app.start_date} &mdash; {app.end_date}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                    {Number(app.days_count)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${style.bg} ${style.text}`}>
                      <Icon className="h-3 w-3" /> {app.status}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
