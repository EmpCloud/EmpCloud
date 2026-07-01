import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, ChevronLeft, ChevronRight, CheckCircle, Clock, FileText, X, Search } from "lucide-react";
import api from "@/api/client";
import { useDepartments } from "@/api/hooks";
import { showToast } from "@/components/ui/Toast";

export default function HeadcountPlanPage() {
  const { t } = useTranslation();
  const tx = (k: string, opts?: Record<string, unknown>) =>
    t(`positions.headcountPlans.${k}`, opts ?? {});
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [fiscalYearFilter, setFiscalYearFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  // #1548 — Detail modal: plans are clickable and open this full-detail view
  // so the notes, budget and all other fields captured at creation time are
  // viewable. Previously the table only surfaced a handful of columns.
  const [viewingPlan, setViewingPlan] = useState<any>(null);
  // Reject modal — replaces the native window.prompt() used to collect the
  // rejection reason. `rejectTarget` holds the plan id being rejected;
  // `rejectReason` is the textarea value.
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: departments } = useDepartments();
  const deptList = departments || [];

  const { data, isLoading } = useQuery({
    queryKey: [
      "headcount-plans",
      { page, status: statusFilter, search, department_id: departmentFilter, fiscal_year: fiscalYearFilter },
    ],
    queryFn: () =>
      api
        .get("/positions/headcount-plans", {
          params: {
            page,
            per_page: 10,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(search ? { search } : {}),
            ...(departmentFilter ? { department_id: departmentFilter } : {}),
            ...(fiscalYearFilter ? { fiscal_year: fiscalYearFilter } : {}),
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
    onError: (err: any) => {
      showToast("error", err?.response?.data?.error?.message || (tx("failedApprove") as string));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ planId, reason }: { planId: number; reason?: string }) =>
      api.post(`/positions/headcount-plans/${planId}/reject`, { reason }).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headcount-plans"] });
      setRejectTarget(null);
      setRejectReason("");
    },
    onError: (err: any) => {
      showToast("error", err?.response?.data?.error?.message || (tx("failedReject") as string));
    },
  });

  const confirmReject = () => {
    if (rejectTarget == null) return;
    rejectMutation.mutate({ planId: rejectTarget, reason: rejectReason.trim() || undefined });
  };

  const submitMutation = useMutation({
    mutationFn: (planId: number) =>
      api.put(`/positions/headcount-plans/${planId}`, { status: "submitted" }).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headcount-plans"] });
    },
    onError: (err: any) => {
      showToast("error", err?.response?.data?.error?.message || (tx("failedSubmit") as string));
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    // Blank headcount fields are optional — the server defaults them to 0. Treat an
    // empty input as 0 rather than parsing "" to NaN and rejecting it.
    const planned = form.planned_headcount.trim() === "" ? 0 : parseInt(form.planned_headcount, 10);
    const current = form.current_headcount.trim() === "" ? 0 : parseInt(form.current_headcount, 10);
    if (!Number.isFinite(planned) || planned < 0) {
      showToast("error", tx("alertPlannedInvalid") as string);
      return;
    }
    if (!Number.isFinite(current) || current < 0) {
      showToast("error", tx("alertCurrentInvalid") as string);
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
          <h1 className="text-2xl font-bold text-gray-900">{tx("title")}</h1>
          <p className="text-gray-500 mt-1">{tx("subtitle")}</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {tx("newPlan")}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{tx("createTitle")}</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("planTitleLabel")} *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={tx("planTitlePlaceholder") as string}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("fiscalYear")} *</label>
              <select
                value={form.fiscal_year}
                onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              >
                <option value="">{tx("selectYear")}</option>
                {fiscalYearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("quarter")}</label>
              <select
                value={form.quarter}
                onChange={(e) => setForm({ ...form, quarter: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">{tx("annualOrNone")}</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("department")}</label>
              <select
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">{tx("orgWide")}</option>
                {deptList.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("plannedHeadcount")}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("currentHeadcount")}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("budgetForm")}</label>
              <input
                type="number"
                value={form.budget_amount}
                onChange={(e) => setForm({ ...form, budget_amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="col-span-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("notes")}</label>
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
                {createMutation.isPending ? tx("creating") : tx("create")}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
                {tx("cancel")}
              </button>
            </div>
            {createMutation.isError && (
              <p className="col-span-full text-sm text-red-600">
                {(createMutation.error as any)?.response?.data?.error?.message || tx("failedCreate")}
              </p>
            )}
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder={tx("searchPlaceholder") as string}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">{tx("allStatuses")}</option>
          <option value="draft">{tx("statusDraft")}</option>
          <option value="submitted">{tx("statusSubmitted")}</option>
          <option value="approved">{tx("statusApproved")}</option>
          <option value="rejected">{tx("statusRejected")}</option>
        </select>
        <select
          value={departmentFilter}
          onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">{tx("allDepartments")}</option>
          {deptList.map((d: any) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={fiscalYearFilter}
          onChange={(e) => { setFiscalYearFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">{tx("allYears")}</option>
          {fiscalYearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colPlan")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("fiscalYear")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("department")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colPlanned")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colApproved")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colCurrent")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colStatus")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">{tx("loading")}</td></tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">{tx("noPlans")}</td></tr>
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
                  <td className="px-6 py-4 text-sm text-gray-500">{plan.department_name || tx("orgWideShort")}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{plan.planned_headcount}</td>
                  <td className="px-6 py-4 text-sm font-medium text-green-600">{plan.approved_headcount}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{plan.current_headcount}</td>
                  <td className="px-6 py-4">
                    <span className={statusBadge(plan.status)}>
                      {tx(`status${plan.status.charAt(0).toUpperCase()}${plan.status.slice(1)}`, { defaultValue: plan.status })}
                    </span>
                  </td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      {plan.status === "draft" && (
                        <button
                          onClick={() => submitMutation.mutate(plan.id)}
                          disabled={submitMutation.isPending}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {tx("actionSubmit")}
                        </button>
                      )}
                      {(plan.status === "submitted" || plan.status === "draft") && (
                        <>
                          <button
                            onClick={() => approveMutation.mutate(plan.id)}
                            disabled={approveMutation.isPending}
                            className="text-xs text-green-600 hover:underline"
                          >
                            {tx("actionApprove")}
                          </button>
                          <button
                            onClick={() => { setRejectReason(""); setRejectTarget(plan.id); }}
                            disabled={rejectMutation.isPending}
                            className="text-xs text-red-600 hover:underline"
                          >
                            {tx("actionReject")}
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
                    <span className={statusBadge(viewingPlan.status)}>
                      {tx(`status${viewingPlan.status.charAt(0).toUpperCase()}${viewingPlan.status.slice(1)}`, { defaultValue: viewingPlan.status })}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setViewingPlan(null)}
                  aria-label={tx("close") as string}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-1">{tx("fiscalYear")}</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.fiscal_year || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">{tx("quarter")}</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.quarter || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">{tx("department")}</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.department_name || tx("orgWideShort")}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">{tx("currency")}</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.currency || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">{tx("plannedHeadcount")}</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.planned_headcount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">{tx("approvedHeadcount")}</p>
                  <p className="text-green-600 font-medium">{viewingPlan.approved_headcount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">{tx("currentHeadcount")}</p>
                  <p className="text-gray-900 font-medium">{viewingPlan.current_headcount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">{tx("budget")}</p>
                  <p className="text-gray-900 font-medium">
                    {viewingPlan.budget_amount != null
                      ? `${viewingPlan.budget_amount} ${viewingPlan.currency || ""}`.trim()
                      : "\u2014"}
                  </p>
                </div>
                {viewingPlan.created_by_name && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{tx("createdBy")}</p>
                    <p className="text-gray-900 font-medium">{viewingPlan.created_by_name}</p>
                  </div>
                )}
                {viewingPlan.created_at && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{tx("createdAt")}</p>
                    <p className="text-gray-900 font-medium">{new Date(viewingPlan.created_at).toLocaleString()}</p>
                  </div>
                )}
                {viewingPlan.notes && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">{tx("notes")}</p>
                    <p className="text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">{viewingPlan.notes}</p>
                  </div>
                )}
              </div>
              <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setViewingPlan(null)}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  {tx("close")}
                </button>
              </div>
            </div>
          </div>
        )}

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              {tx("pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" /> {tx("previous")}
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                {tx("next")} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject modal — replaces the native window.prompt() for collecting the
          rejection reason. Styled to match the rest of the UI, with a textarea,
          a Cancel, and a Confirm that fires the rejection. The reason is
          optional. */}
      {rejectTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <X className="h-5 w-5 text-red-600" />
              {tx("actionReject")}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {tx("rejectPrompt")}
            </p>
            <textarea
              autoFocus
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRejectTarget(null); setRejectReason(""); }}
                disabled={rejectMutation.isPending}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {tx("cancel")}
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={rejectMutation.isPending}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? tx("loading") : tx("actionReject")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
