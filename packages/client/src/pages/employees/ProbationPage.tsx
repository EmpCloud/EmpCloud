import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  UserCheck,
  ChevronRight,
  X,
} from "lucide-react";

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDaysColor(days: number): string {
  if (days < 0) return "text-red-600 bg-red-50";
  if (days <= 7) return "text-red-600 bg-red-50";
  if (days <= 15) return "text-orange-600 bg-orange-50";
  if (days <= 30) return "text-yellow-600 bg-yellow-50";
  return "text-green-600 bg-green-50";
}

function getStatusBadge(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case "on_probation":
      return { bg: "bg-blue-100", text: "text-blue-700", label: "On Probation" };
    case "confirmed":
      return { bg: "bg-green-100", text: "text-green-700", label: "Confirmed" };
    case "extended":
      return { bg: "bg-amber-100", text: "text-amber-700", label: "Extended" };
    case "terminated":
      return { bg: "bg-red-100", text: "text-red-700", label: "Terminated" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-700", label: status };
  }
}

export default function ProbationPage() {
  const queryClient = useQueryClient();
  const [confirmModal, setConfirmModal] = useState<any>(null);
  const [extendModal, setExtendModal] = useState<any>(null);
  const [extendDate, setExtendDate] = useState("");
  const [extendReason, setExtendReason] = useState("");

  // Dashboard stats
  const { data: dashboard } = useQuery({
    queryKey: ["probation-dashboard"],
    queryFn: () => api.get("/employees/probation/dashboard").then((r) => r.data.data),
  });

  // On probation list
  const { data: employees, isLoading } = useQuery({
    queryKey: ["probation-list"],
    queryFn: () => api.get("/employees/probation").then((r) => r.data.data),
  });

  // Upcoming confirmations
  const { data: upcoming } = useQuery({
    queryKey: ["probation-upcoming"],
    queryFn: () => api.get("/employees/probation/upcoming?days=30").then((r) => r.data.data),
  });

  // Confirm mutation
  const confirmMut = useMutation({
    mutationFn: (id: number) => api.put(`/employees/${id}/probation/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["probation-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["probation-list"] });
      queryClient.invalidateQueries({ queryKey: ["probation-upcoming"] });
      setConfirmModal(null);
    },
  });

  // Extend mutation
  const extendMut = useMutation({
    mutationFn: ({ id, new_end_date, reason }: { id: number; new_end_date: string; reason: string }) =>
      api.put(`/employees/${id}/probation/extend`, { new_end_date, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["probation-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["probation-list"] });
      queryClient.invalidateQueries({ queryKey: ["probation-upcoming"] });
      setExtendModal(null);
      setExtendDate("");
      setExtendReason("");
    },
  });

  const dashboardCards = [
    {
      label: "On Probation",
      value: dashboard?.on_probation ?? 0,
      icon: Clock,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Upcoming (30 days)",
      value: dashboard?.upcoming_30_days ?? 0,
      icon: CalendarClock,
      color: "bg-amber-50 text-amber-600",
    },
    {
      label: "Confirmed This Month",
      value: dashboard?.confirmed_this_month ?? 0,
      icon: CheckCircle2,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "Overdue",
      value: dashboard?.overdue ?? 0,
      icon: AlertTriangle,
      color: "bg-red-50 text-red-600",
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Probation Tracking</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              Monitor and manage employee probation periods.
            </p>
          </div>
        </div>
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {dashboardCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Upcoming Confirmations */}
      {upcoming && upcoming.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="font-semibold text-amber-900">
              Upcoming Confirmations ({upcoming.length})
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.slice(0, 5).map((emp: any) => (
              <div
                key={emp.id}
                className="inline-flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-amber-200"
              >
                <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-amber-700">
                    {emp.first_name?.[0]}{emp.last_name?.[0]}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {emp.first_name} {emp.last_name}
                  </span>
                  <span className="text-xs text-amber-600 ml-2">
                    {emp.days_remaining}d left
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Employees on Probation
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Employee</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Department</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Join Date</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Probation Ends</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Days Remaining</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(employees || []).map((emp: any) => {
                  const status = getStatusBadge(emp.probation_status);
                  const daysColor = getDaysColor(Number(emp.days_remaining));
                  return (
                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-brand-700">
                              {emp.first_name?.[0]}{emp.last_name?.[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {emp.first_name} {emp.last_name}
                            </p>
                            <p className="text-xs text-gray-400">{emp.designation || emp.emp_code || emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {emp.department_name || "-"}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">
                        {formatDate(emp.date_of_joining)}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">
                        {formatDate(emp.probation_end_date)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${daysColor}`}>
                          {Number(emp.days_remaining) < 0
                            ? `${Math.abs(emp.days_remaining)}d overdue`
                            : `${emp.days_remaining}d`}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setConfirmModal(emp)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Confirm
                          </button>
                          <button
                            onClick={() => {
                              setExtendModal(emp);
                              setExtendDate("");
                              setExtendReason("");
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            Extend
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!employees || employees.length === 0) && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      No employees currently on probation.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Probation</h3>
              <button onClick={() => setConfirmModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to confirm the probation for{" "}
              <strong>{confirmModal.first_name} {confirmModal.last_name}</strong>?
              This will mark them as a confirmed employee.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmMut.mutate(confirmModal.id)}
                disabled={confirmMut.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {confirmMut.isPending ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Modal */}
      {extendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Extend Probation</h3>
              <button
                onClick={() => {
                  setExtendModal(null);
                  setExtendDate("");
                  setExtendReason("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Extend probation for{" "}
              <strong>{extendModal.first_name} {extendModal.last_name}</strong>.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New End Date
                </label>
                <input
                  type="date"
                  value={extendDate}
                  onChange={(e) => setExtendDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <textarea
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  placeholder="Why is the probation being extended?"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setExtendModal(null);
                  setExtendDate("");
                  setExtendReason("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  extendMut.mutate({
                    id: extendModal.id,
                    new_end_date: extendDate,
                    reason: extendReason,
                  })
                }
                disabled={!extendDate || !extendReason || extendMut.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {extendMut.isPending ? "Extending..." : "Extend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
