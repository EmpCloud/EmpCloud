import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Pencil,
  Trash2,
  Loader2,
  LayoutGrid,
  List,
  Building2,
  Layers3,
  ArrowUpDown,
  ListFilter,
  ChevronDown,
} from "lucide-react";
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
  const [showCreate, setShowCreate] = useState(searchParams.get("create") === "1");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
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

  const positionTypeLabel = (value?: string) => {
    const labels: Record<string, string> = {
      full_time: tx("fullTime") as string,
      part_time: tx("partTime") as string,
      contract: tx("contract") as string,
      intern: tx("intern") as string,
    };
    return labels[value || ""] || (value || "-").replace(/_/g, " ");
  };

  const positionStatusLabel = (value?: string) => {
    if (!value) return "-";
    return tx(`status${value.charAt(0).toUpperCase()}${value.slice(1)}`, {
      defaultValue: value,
    }) as string;
  };

  const statusClasses = (value?: string) => {
    if (value === "active") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
    if (value === "filled") return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
    if (value === "frozen") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
    return "bg-muted text-muted-foreground";
  };

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
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{tx("title")}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{tx("subtitle")}</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-brand-600 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {tx("createPosition")}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-card rounded-lg border border-border overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-border">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tx("newPosition")}</h2>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{tx("titleLabel")} *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{t("common.department")}</label>
              <select
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">{tx("none")}</option>
                {deptList.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{tx("employmentType")}</label>
              <select
                value={form.employment_type}
                onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="full_time">{tx("fullTime")}</option>
                <option value="part_time">{tx("partTime")}</option>
                <option value="contract">{tx("contract")}</option>
                <option value="intern">{tx("intern")}</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{tx("headcountBudget")}</label>
              <input
                type="number"
                value={form.headcount_budget}
                onChange={(e) => setForm({ ...form, headcount_budget: Number(e.target.value) })}
                min={1}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{tx("minSalary")}</label>
              <input
                type="number"
                value={form.min_salary}
                onChange={(e) => setForm({ ...form, min_salary: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{tx("maxSalary")}</label>
              <input
                type="number"
                value={form.max_salary}
                onChange={(e) => setForm({ ...form, max_salary: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="col-span-full">
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">{tx("jobDescription")}</label>
              <textarea
                value={form.job_description}
                onChange={(e) => setForm({ ...form, job_description: e.target.value })}
                rows={3}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_critical"
                checked={form.is_critical}
                onChange={(e) => setForm({ ...form, is_critical: e.target.checked })}
                className="h-4 w-4 text-brand-600 dark:text-brand-400 border-border rounded focus:ring-brand-500"
              />
              <label htmlFor="is_critical" className="text-[13px] text-muted-foreground">{tx("criticalRole")}</label>
            </div>
            <div className="col-span-full flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-brand-600 text-white text-[13px] font-medium rounded-md hover:bg-brand-700 disabled:opacity-50"
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
                className="px-4 py-2 border border-border text-muted-foreground text-[13px] font-medium rounded-md hover:bg-muted"
              >
                {t("common.cancel")}
              </button>
            </div>
            {createMutation.isError && (
              <p className="col-span-full text-[13px] text-red-600 dark:text-red-400">
                {(createMutation.error as any)?.response?.data?.error?.message || tx("failedCreate")}
              </p>
            )}
          </form>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(360px,1fr)_minmax(170px,200px)_minmax(145px,170px)_minmax(135px,160px)_130px]">
        <div className="relative sm:col-span-2 xl:col-span-1">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-[13px] text-foreground outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100" placeholder={tx("searchPlaceholder") as string} />
        </div>
        <div className="relative">
          <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }} className="h-10 w-full appearance-none rounded-lg border border-border bg-background pl-9 pr-9 text-[13px] text-foreground outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
            <option value="">{tx("allDepartments")}</option>
            {deptList.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative">
          <ListFilter aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 w-full appearance-none rounded-lg border border-border bg-background pl-9 pr-9 text-[13px] text-foreground outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
            <option value="">{tx("allStatuses")}</option>
            <option value="active">{tx("statusActive")}</option>
            <option value="filled">{tx("statusFilled")}</option>
            <option value="frozen">{tx("statusFrozen")}</option>
            <option value="closed">{tx("statusClosed")}</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative">
          <Layers3 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select value={employmentType} onChange={(e) => { setEmploymentType(e.target.value); setPage(1); }} className="h-10 w-full appearance-none rounded-lg border border-border bg-background pl-9 pr-9 text-[13px] text-foreground outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
            <option value="">{tx("allTypes")}</option>
            <option value="full_time">{tx("fullTime")}</option>
            <option value="part_time">{tx("partTime")}</option>
            <option value="contract">{tx("contract")}</option>
            <option value="intern">{tx("intern")}</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <label className="flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-background px-3 text-[13px] font-medium text-muted-foreground transition hover:bg-muted/60">
          <input type="checkbox" checked={criticalOnly} onChange={(e) => { setCriticalOnly(e.target.checked); setPage(1); }} className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500" />
          {tx("criticalOnly")}
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm" role="group" aria-label={tx("viewMode", { defaultValue: "View mode" }) as string}>
          <button type="button" onClick={() => setViewMode("grid")} aria-pressed={viewMode === "grid"} className={`inline-flex min-h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors ${viewMode === "grid" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" : "text-muted-foreground hover:bg-muted"}`}>
            <LayoutGrid aria-hidden="true" className="h-4 w-4" />{tx("gridView", { defaultValue: "Grid View" })}
          </button>
          <button type="button" onClick={() => setViewMode("list")} aria-pressed={viewMode === "list"} className={`inline-flex min-h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" : "text-muted-foreground hover:bg-muted"}`}>
            <List aria-hidden="true" className="h-4 w-4" />{tx("listView", { defaultValue: "List View" })}
          </button>
        </div>
        <p role="status" className="text-xs font-medium text-muted-foreground">{tx("positionsCount", { count: meta?.total ?? positions.length, defaultValue: (meta?.total ?? positions.length) === 1 ? "{{count}} position" : "{{count}} positions" })}</p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-[13px] text-muted-foreground">{t("common.loading")}</div>
      ) : positions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-[13px] text-muted-foreground">{tx("noPositions")}</div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {positions.map((pos: any) => (
            <article key={pos.id} className="flex min-h-[180px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tx("colCode")}</p>
                  <p className="mt-0.5 font-mono text-[12px] font-semibold text-brand-600 dark:text-brand-400">{pos.code || "-"}</p>
                </div>
                <div className="flex gap-1.5">
                  <Link to={`/positions/${pos.id}?edit=1`} aria-label={`${tx("editTooltip")} ${pos.title}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600">
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                  <button type="button" onClick={() => { setDeleteTarget({ id: pos.id, title: pos.title }); setDeleteError(null); }} aria-label={`${tx("deleteTooltip")} ${pos.title}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-red-200 hover:bg-red-50 hover:text-red-600">
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <Link to={`/positions/${pos.id}`} className="mt-3 block text-base font-bold leading-snug text-foreground hover:text-brand-600">{pos.title}</Link>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 aria-hidden="true" className="h-4 w-4" />{pos.department_name || tx("unassigned", { defaultValue: "Unassigned" })}</p>
              <div className="mt-auto grid grid-cols-[1.2fr_.95fr_.9fr_.75fr] gap-2 border-t border-border pt-3">
                <div className="min-w-0"><p className="truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{tx("colType")}</p><span className="mt-1 inline-flex max-w-full truncate rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{positionTypeLabel(pos.employment_type)}</span></div>
                <div className="min-w-0"><p className="truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{tx("colHeadcount")}</p><p className="mt-1 text-xs font-bold tabular-nums text-orange-600">{pos.headcount_filled ?? 0}/{pos.headcount_budget ?? 0}</p></div>
                <div className="min-w-0"><p className="truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t("common.status")}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses(pos.status)}`}>{positionStatusLabel(pos.status)}</span></div>
                <div className="min-w-0"><p className="truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{tx("colCritical")}</p><p className={`mt-1 text-[11px] font-semibold ${pos.is_critical ? "text-red-600" : "text-muted-foreground"}`}>{pos.is_critical ? tx("yes", { defaultValue: "Yes" }) : tx("no", { defaultValue: "No" })}</p></div>
              </div>
            </article>
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[1040px] text-xs">
          <thead className="border-b border-border bg-muted/45">
            <tr>
              {[tx("colCode"), tx("colTitle"), t("common.department"), tx("colType"), tx("colHeadcount"), t("common.status"), tx("colCritical")].map((label) => (
                <th key={String(label)} scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"><span className="inline-flex items-center gap-1.5">{label}<ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5 opacity-45" /></span></th>
              ))}
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t("common.loading")}</td>
              </tr>
            ) : positions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-muted-foreground">{tx("noPositions")}</td>
              </tr>
            ) : (
              positions.map((pos: any) => (
                <tr key={pos.id} className="h-12 transition-colors hover:bg-muted/35">
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold tabular-nums text-brand-600">{pos.code || "-"}</td>
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/positions/${pos.id}`}
                      className="text-[13px] font-bold text-foreground transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                    >
                      {pos.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{pos.department_name || "-"}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground capitalize">
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
                  <td className="px-4 py-2.5">
                    <span className={`text-[13px] font-bold tabular-nums ${
                      pos.headcount_filled >= pos.headcount_budget ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
                    }`}>
                      {pos.headcount_filled}/{pos.headcount_budget}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      pos.status === "active" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300" :
                      pos.status === "filled" ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" :
                      pos.status === "frozen" ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {tx(`status${pos.status.charAt(0).toUpperCase()}${pos.status.slice(1)}`, { defaultValue: pos.status })}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {pos.is_critical ? (
                      <AlertTriangle aria-hidden="true" className="h-4 w-4 text-red-500" />
                    ) : (
                      <span className="text-xs text-muted-foreground/60">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        to={`/positions/${pos.id}?edit=1`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                        aria-label={`${tx("editTooltip")} ${pos.title}`}
                      >
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => {
                          setDeleteTarget({ id: pos.id, title: pos.title });
                          setDeleteError(null);
                        }}
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                        aria-label={`${tx("deleteTooltip")} ${pos.title}`}
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

      </div>
      )}

      {meta && meta.total_pages > 1 && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
          <p className="text-[12px] tabular-nums text-muted-foreground">{tx("pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12px] transition hover:bg-muted disabled:opacity-50"><ChevronLeft aria-hidden="true" className="h-4 w-4" />{t("common.previous")}</button>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= meta.total_pages} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12px] transition hover:bg-muted disabled:opacity-50">{t("common.next")}<ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteMutation.isPending && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-foreground">{tx("deleteTitle")}</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {tx("deleteConfirm", { title: deleteTarget.title })}
                  </p>
                </div>
              </div>
            </div>
            {deleteError && (
              <div className="mx-6 mb-4 rounded-md bg-red-50 dark:bg-red-950/40 p-3 text-[13px] text-red-700 dark:text-red-300">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-lg border-t border-border bg-muted px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                className="rounded-md border border-border px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-card disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
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
