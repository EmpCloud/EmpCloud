import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronLeft, ChevronRight, CheckCircle, Clock, FileText, X } from "lucide-react";
import api from "@/api/client";
import { useDepartments } from "@/api/hooks";

export default function HeadcountPlanPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  // #1548 — Detail modal: plans are clickable and open this full-detail view
  // so the notes, budget and all other fields captured at creation time are
  // viewable. Previously the table only surfaced a handful of columns.
  const [viewingPlan, setViewingPlan] = useState<any>(null);

  const { data: departments } = useDepartments();
  const deptList = departments || [];

  const { data, isLoading } = useQuery({
    queryKey: ["headcount-plans", { page, status: statusFilter }],
    queryFn: () =>
      api
        .get("/positions/headcount-plans", {
          params: {
            page,
            per_page: 20,
            ...(statusFilter ? { status: statusFilter } : {}),
          },
        })
        .then((r) => r.data),
  });

  const plans = data?.data || [];
  const meta = data?.meta;

  const currentYear = new Date().getFullYear();
  const fiscalYearOptions = Array.from({ length: 7 }, (_, i) => {
    const start = currentYear - 2 + i;
    return `${start}-${String(start + 1).slice(-2)}`;
  });

  const [form, setForm] = useState({
    title: "",
    fiscal_year: "",
    quarter: "",
    department_id: "",
    planned_headcount: "",
    current_headcount: "",
    budget_amount: "",
    currency: "INR",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post("/positions/headcount-plans", data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headcount-plans"] });
      setShowCreate(false);
      setForm({
        title: "",
        fiscal_year: "",
        quarter: "",
        department_id: "",
        planned_headcount: "",
        current_headcount: "",
        budget_amount: "",
        currency: "INR",
        notes: "",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (planId: number) => api.post(`/positions/headcount-plans/${planId}/approve`).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headcount-plans"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ planId, reason }: { planId: number; reason?: string }) =>
      api.post(`/positions/headcount-plans/${planId}/reject`, { reason }).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headcount-plans"] });
    },
  });

  const submitMutation = useMutation({
    mutationFn: (planId: number) =>
      api.put(`/positions/headcount-plans/${planId}`, { status: "submitted" }).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headcount-plans"] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const planned = parseInt(form.planned_headcount, 10);
    const current = parseInt(form.current_headcount, 10);
    if (!Number.isFinite(planned) || planned < 0) {
      alert("Planned Headcount must be 0 or greater.");
      return;
    }
    if (!Number.isFinite(current) || current < 0) {
      alert("Current Headcount must be 0 or greater.");
      return;
    }
    createMutation.mutate({
      title: form.title,
      fiscal_year: form.fiscal_year,
      quarter: form.quarter || null,
      department_id: form.department_id ? Number(form.department_id) : null,
      planned_headcount: planned,
      current_headcount: current,
      budget_amount: form.budget_amount ? Number(form.budget_amount) : null,
      currency: form.currency,
      notes: form.notes || null,
    });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "approved": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "submitted": return <Clock className="h-4 w-4 text-blue-500" />;
      case "rejected": return <FileText className="h-4 w-4 text-red-500" />;
      default: return <FileText className="h-4 w-4 text-gray-400" />;
    }
  };

  const statusBadge = (status: string) => {
    const classes: Record<string, string> = {
      draft: "bg-gray-100 text-gray-600",
      submitted: "bg-blue-50 text-blue-700",
      approved: "bg-green-50 text-green-700",
      rejected: "bg-red-50 text-red-700",
    };
    return `text-xs px-2 py-1 rounded-full font-medium ${classes[status] || classes.draft}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Headcount Plans</h1>
          <p className="text-gray-500 mt-1">Plan and track workforce growth across departments.</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Plan
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Headcount Plan</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Q2 2026 Engineering Hiring"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year *</label>
              <select
                value={form.fiscal_year}
                onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              >
                <option value="">Select year</option>
                {fiscalYearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quarter</label>
              <select
                value={form.quarter}
                onChange={(e) => setForm({ ...form, quarter: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Annual / None</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Organization-wide</option>
                {deptList.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Planned Headcount</label>
              <input
                type="number"
                value={form.planned_headcount}
                onChange={(e) => setForm({ ...form, planned_headcount: e.target.value })}
                min={0}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Headcount</label>
              <input
                type="number"
                value={form.current_headcount}
                onChange={(e) => setForm({ ...form, current_headcount: e.target.value })}
                min={0}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget (paise/cents)</label>
              <input
                type="number"
                value={form.budget_amount}
                onChange={(e) => setForm({ ...form, budget_amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="col-span-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="col-span-full flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {createMutation.isPending ? "Creating..." : "Create Plan"}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
            {createMutation.isError && (
              <p className="col-span-full text-sm text-red-600">
                {(createMutation.error as any)?.response?.data?.error?.message || "Failed to create plan"}
              </p>
            )}
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Plan</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Fiscal Year</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Department</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Planned</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Approved</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Current</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">No headcount plans found</td></tr>
            ) : (
              plans.map((plan: any) => (
                // #1548 — Row is clickable and opens the details modal. Action
                // buttons stopPropagation so clicking Submit/Approve/Reject
                // doesn't also open the modal.
                <tr
                  key={plan.id}
                  onClick={() => setViewingPlan(plan)}
                  className="hover:bg-gray-50 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setViewingPlan(plan);
                    }
                  }}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {statusIcon(plan.status)}
                      <span className="text-sm font-medium text-gray-900">{plan.title}</span>
                    </div>
                    {plan.quarter && <span className="text-xs text-gray-400 ml-6">{plan.quarter}</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{plan.fiscal_year}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{plan.department_name || "Org-wide"}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{plan.planned_headcount}</td>
                  <td className="px-6 py-4 text-sm font-medium text-green-600">{plan.approved_headcount}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{plan.current_headcount}</td>
                  <td className="px-6 py-4">
                    <span className={statusBadge(plan.status)}>{plan.status}</span>
                  </td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      {plan.status === "draft" && (
                        <button
                          onClick={() => submitMutation.mutate(plan.id)}
                          disabled={submitMutation.isPending}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Submit
                        </button>
                      )}
                      {(plan.status === "submitted" || plan.status === "draft") && (
                        <>
                          <button
                            onClick={() => approveMutation.mutate(plan.id)}
                            disabled={approveMutation.isPending}
                            className="text-xs text-green-600 hover:underline"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const reason = prompt("Rejection reason (optional):");
                              rejectMutation.mutate({ planId: plan.id, reason: reason || undefined });
                            }}
                            disabled={rejectMutation.isPending}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* #1548 — Plan details modal. Opens on row click so admins can see
            every field captured at creation (including notes, budget, dates). */}
        {viewingPlan && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setViewingPlan(null)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  {statusIcon(viewingPlan.status)}
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{viewingPlan.title}</h2>
                    <span className={statusBadge(viewingPlan.status)}>{viewingPlan.status}</span>
                  </div>
                </div>
                <button
                  onClick={() => setViewingPlan(null)}
                  aria-label="Close"
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Fiscal Year</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.fiscal_year || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Quarter</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.quarter || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Department</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.department_name || "Org-wide"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Currency</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.currency || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Planned Headcount</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.planned_headcount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Approved Headcount</p>
                  <p className="text-green-600 font-medium">{viewingPlan.approved_headcount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Current Headcount</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.current_headcount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Budget</p>
                  <p className="text-gray-900 font-medium">
                    {viewingPlan.budget_amount != null
                      ? `${viewingPlan.budget_amount} ${viewingPlan.currency || ""}`.trim()
                      : "\u2014"}
                  </p>
                </div>
                {viewingPlan.created_by_name && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Created By</p>
                    <p className="text-gray-900 font-medium">{viewingPlan.created_by_name}</p>
                  </div>
                )}
                {viewingPlan.created_at && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Created</p>
                    <p className="text-gray-900 font-medium">{new Date(viewingPlan.created_at).toLocaleString()}</p>
                  </div>
                )}
                {viewingPlan.notes && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">Notes</p>
                    <p className="text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">{viewingPlan.notes}</p>
                  </div>
                )}
              </div>
              <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setViewingPlan(null)}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Page {meta.page} of {meta.total_pages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
