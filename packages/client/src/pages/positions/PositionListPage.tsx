import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Plus, ChevronLeft, ChevronRight, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import api from "@/api/client";
import { useDepartments } from "@/api/hooks";
import { showToast } from "@/components/ui/Toast";

export default function PositionListPage() {
  const { t } = useTranslation();
  const tx = (k: string, opts?: Record<string, unknown>) =>
    t(`positions.list.${k}`, opts ?? {});
  const queryClient = useQueryClient();
  // #1553 — Seed the status filter from ?status= so deep-links from the
  // Position Dashboard top cards land on the matching filtered list.
  // Whitelisted against known values so a bad URL doesn't wedge the dropdown.
  const [searchParams] = useSearchParams();
  const initialStatus = (() => {
    const raw = searchParams.get("status") || "";
    return ["active", "filled", "frozen", "closed"].includes(raw) ? raw : "";
  })();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [status, setStatus] = useState<string>(initialStatus);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [employmentType, setEmploymentType] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: departments } = useDepartments();

  // #1545 / #1551 — Delete reported as "says deleted but doesn't disappear".
  // The backend soft-closes the position (status="closed") rather than hard-
  // deleting, so when the list refetches the same row comes back under the
  // current filter. Two fixes layered here:
  //  1. Optimistically strip the row from every cached `positions` query so
  //     the user sees immediate feedback.
  //  2. After the server confirms, invalidate so any background changes
  //     (e.g. status counts on the dashboard) sync up.
  const deleteMutation = useMutation({
    mutationFn: (positionId: number) => api.delete(`/positions/${positionId}`).then((r) => r.data),
    onMutate: async (positionId: number) => {
      await queryClient.cancelQueries({ queryKey: ["positions"] });
      const snapshots: { key: unknown; value: any }[] = [];
      queryClient.getQueryCache().findAll({ queryKey: ["positions"] }).forEach((q) => {
        snapshots.push({ key: q.queryKey, value: q.state.data });
        const data = q.state.data as any;
        if (data?.data) {
          queryClient.setQueryData(q.queryKey, {
            ...data,
            data: data.data.filter((p: any) => p.id !== positionId),
            meta: data.meta ? { ...data.meta, total: Math.max(0, (data.meta.total || 1) - 1) } : data.meta,
          });
        }
      });
      return { snapshots };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["position-dashboard"] });
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: (err: any, _positionId, context) => {
      // Roll the optimistic removal back so the row reappears if the server
      // rejected the delete.
      context?.snapshots?.forEach(({ key, value }) => queryClient.setQueryData(key as any, value));
      setDeleteError(err?.response?.data?.error?.message || (tx("failedDelete") as string));
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: [
      "positions",
      {
        page,
        search,
        department_id: departmentId,
        status,
        is_critical: criticalOnly,
        employment_type: employmentType,
      },
    ],
    queryFn: () =>
      api
        .get("/positions", {
          params: {
            page,
            per_page: 20,
            ...(search ? { search } : {}),
            ...(departmentId ? { department_id: departmentId } : {}),
            ...(status ? { status } : {}),
            ...(criticalOnly ? { is_critical: true } : {}),
            ...(employmentType ? { employment_type: employmentType } : {}),
          },
        })
        .then((r) => r.data),
  });

  const positions = data?.data || [];
  const meta = data?.meta;
  const deptList = departments || [];

  // Create form state
  const [form, setForm] = useState({
    title: "",
    department_id: "",
    employment_type: "full_time",
    headcount_budget: 1,
    is_critical: false,
    job_description: "",
    min_salary: "",
    max_salary: "",
    currency: "INR",
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post("/positions", data).then((r) => r.data.data),
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["position-dashboard"] });
      setShowCreate(false);
      setForm({
        title: "",
        department_id: "",
        employment_type: "full_time",
        headcount_budget: 1,
        is_critical: false,
        job_description: "",
        min_salary: "",
        max_salary: "",
        currency: "INR",
      });
      showToast("success", tx("createSuccess", { title: created?.title ?? "" }) as string);
    },
    // Create errors are already surfaced inline under the form (see the
    // createMutation.isError block in the JSX), so we don't also toast.
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title: form.title,
      department_id: form.department_id ? Number(form.department_id) : null,
      employment_type: form.employment_type,
      headcount_budget: Number(form.headcount_budget),
      is_critical: form.is_critical,
      job_description: form.job_description || null,
      min_salary: form.min_salary ? Number(form.min_salary) : null,
      max_salary: form.max_salary ? Number(form.max_salary) : null,
      currency: form.currency,
    });
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
          {tx("createPosition")}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{tx("newPosition")}</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("titleLabel")} *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("common.department")}</label>
              <select
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">{tx("none")}</option>
                {deptList.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("employmentType")}</label>
              <select
                value={form.employment_type}
                onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="full_time">{tx("fullTime")}</option>
                <option value="part_time">{tx("partTime")}</option>
                <option value="contract">{tx("contract")}</option>
                <option value="intern">{tx("intern")}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("headcountBudget")}</label>
              <input
                type="number"
                value={form.headcount_budget}
                onChange={(e) => setForm({ ...form, headcount_budget: Number(e.target.value) })}
                min={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("minSalary")}</label>
              <input
                type="number"
                value={form.min_salary}
                onChange={(e) => setForm({ ...form, min_salary: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("maxSalary")}</label>
              <input
                type="number"
                value={form.max_salary}
                onChange={(e) => setForm({ ...form, max_salary: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="col-span-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">{tx("jobDescription")}</label>
              <textarea
                value={form.job_description}
                onChange={(e) => setForm({ ...form, job_description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_critical"
                checked={form.is_critical}
                onChange={(e) => setForm({ ...form, is_critical: e.target.checked })}
                className="h-4 w-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
              />
              <label htmlFor="is_critical" className="text-sm text-gray-700">{tx("criticalRole")}</label>
            </div>
            <div className="col-span-full flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {createMutation.isPending ? tx("creating") : tx("createPosition")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setForm({
                    title: "",
                    department_id: "",
                    employment_type: "full_time",
                    headcount_budget: 1,
                    is_critical: false,
                    job_description: "",
                    min_salary: "",
                    max_salary: "",
                    currency: "INR",
                  });
                  createMutation.reset();
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                {t("common.cancel")}
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
          value={departmentId}
          onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">{tx("allDepartments")}</option>
          {deptList.map((d: any) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">{tx("allStatuses")}</option>
          <option value="active">{tx("statusActive")}</option>
          <option value="filled">{tx("statusFilled")}</option>
          <option value="frozen">{tx("statusFrozen")}</option>
          <option value="closed">{tx("statusClosed")}</option>
        </select>
        <select
          value={employmentType}
          onChange={(e) => { setEmploymentType(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">{tx("allTypes")}</option>
          <option value="full_time">{tx("fullTime")}</option>
          <option value="part_time">{tx("partTime")}</option>
          <option value="contract">{tx("contract")}</option>
          <option value="intern">{tx("intern")}</option>
        </select>
        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={criticalOnly}
            onChange={(e) => { setCriticalOnly(e.target.checked); setPage(1); }}
            className="h-4 w-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
          />
          {tx("criticalOnly")}
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colCode")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colTitle")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t("common.department")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colType")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colHeadcount")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t("common.status")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colCritical")}</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-400">{t("common.loading")}</td>
              </tr>
            ) : positions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-400">{tx("noPositions")}</td>
              </tr>
            ) : (
              positions.map((pos: any) => (
                <tr key={pos.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{pos.code || "-"}</td>
                  <td className="px-6 py-4">
                    <Link
                      to={`/positions/${pos.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-brand-600"
                    >
                      {pos.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{pos.department_name || "-"}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 capitalize">
                      {(() => {
                        // Map server enum → localized label; fall back to the
                        // raw word with underscores stripped.
                        const map: Record<string, string> = {
                          full_time: tx("fullTime") as string,
                          part_time: tx("partTime") as string,
                          contract: tx("contract") as string,
                          intern: tx("intern") as string,
                        };
                        return map[pos.employment_type] || (pos.employment_type || "").replace("_", " ");
                      })()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-medium ${
                      pos.headcount_filled >= pos.headcount_budget ? "text-green-600" : "text-amber-600"
                    }`}>
                      {pos.headcount_filled}/{pos.headcount_budget}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      pos.status === "active" ? "bg-green-50 text-green-700" :
                      pos.status === "filled" ? "bg-blue-50 text-blue-700" :
                      pos.status === "frozen" ? "bg-amber-50 text-amber-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {tx(`status${pos.status.charAt(0).toUpperCase()}${pos.status.slice(1)}`, { defaultValue: pos.status })}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {pos.is_critical ? (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => {
                        setDeleteTarget({ id: pos.id, title: pos.title });
                        setDeleteError(null);
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title={tx("deleteTooltip") as string}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

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
                <ChevronLeft className="h-4 w-4" /> {t("common.previous")}
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                {t("common.next")} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteMutation.isPending && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{tx("deleteTitle")}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {tx("deleteConfirm", { title: deleteTarget.title })}
                  </p>
                </div>
              </div>
            </div>
            {deleteError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {tx("deleting")}
                  </>
                ) : (
                  t("common.delete")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
