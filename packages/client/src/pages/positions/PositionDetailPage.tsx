import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, X, Briefcase, AlertTriangle, MapPin, Pencil, Trash2, Save, Loader2, Users, History, CircleGauge } from "lucide-react";
import { useDepartments } from "@/api/hooks";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";

const controlClass =
  "min-h-9 w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const secondaryButtonClass =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground transition-colors duration-150 hover:border-brand-300 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50";
const primaryButtonClass =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export default function PositionDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [assignForm, setAssignForm] = useState({ user_id: "", start_date: "", is_primary: true });
  const [userSearch, setUserSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editForm, setEditForm] = useState({
    title: "",
    department_id: "",
    employment_type: "full_time",
    headcount_budget: "1",
    is_critical: false,
    job_description: "",
    min_salary: "",
    max_salary: "",
    currency: "INR",
  });

  const { data: departments } = useDepartments();

  // Debounce the user search to avoid excessive API calls (especially with full name typing)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(userSearch), 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  const { data, isLoading } = useQuery({
    queryKey: ["position", id],
    queryFn: () => api.get(`/positions/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const { data: usersData } = useQuery({
    queryKey: ["users-search", debouncedSearch],
    queryFn: () => api.get("/users", { params: { search: debouncedSearch || undefined, per_page: 50 } }).then((r) => r.data.data),
    enabled: showAssign,
  });

  // #1549 — surface backend errors. Without this the assign POST silently
  // fails (no toast, no inline message) and the user sees the position drop
  // off the vacancy list (because optimistic invalidation + a stale row from
  // a different code path looks like "vacancy got removed").
  const assignMutation = useMutation({
    mutationFn: (body: object) => api.post(`/positions/${id}/assign`, body).then((r) => r.data.data),
    onSuccess: () => {
      // Assigning a user raises headcount_filled and can flip the position to
      // "filled", removing it from vacancies — refresh those views too, not just
      // this position's detail.
      queryClient.invalidateQueries({ queryKey: ["position", id] });
      queryClient.invalidateQueries({ queryKey: ["position-vacancies"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["position-dashboard"] });
      setShowAssign(false);
      setAssignForm({ user_id: "", start_date: "", is_primary: true });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        t("positionDetail.error.assignFailed");
      showToast("error", msg);
    },
  });

  // Confirm-end dialog state (replaces window.confirm for ending an
  // assignment). Holds the assignment id awaiting confirmation.
  const [endAssignmentId, setEndAssignmentId] = useState<number | null>(null);

  const removeMutation = useMutation({
    mutationFn: (assignmentId: number) => api.delete(`/positions/assignments/${assignmentId}`),
    onSuccess: () => {
      // Ending an assignment lowers headcount_filled and can reopen the position
      // (filled -> active), so refresh the vacancies, list and dashboard views too —
      // not just this position's detail.
      queryClient.invalidateQueries({ queryKey: ["position", id] });
      queryClient.invalidateQueries({ queryKey: ["position-vacancies"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["position-dashboard"] });
      setEndAssignmentId(null);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      api.put(`/positions/${id}`, { status: newStatus }).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position", id] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
    onError: (err: any) => {
      // Without this the inline status <select> silently keeps the value the user
      // picked even when the change was rejected, so it looks like it worked.
      // The query invalidation on settle snaps it back to the true status.
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        "Failed to update position status.";
      showToast("error", msg);
      queryClient.invalidateQueries({ queryKey: ["position", id] });
    },
  });

  // #1544 — surface server-side validation errors. The form was previously
  // failing silently, so users saw "Save Changes" do nothing and assumed
  // the feature was broken. Toast the actual error so they can correct it.
  const updateMutation = useMutation({
    mutationFn: (data: object) =>
      api.put(`/positions/${id}`, data).then((r) => r.data.data),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["position", id] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["position-dashboard"] });
      setShowEdit(false);
      showToast("success", t("positionDetail.editForm.updateSuccess", { title: updated?.title ?? "" }));
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        t("positionDetail.error.saveChangesFailed");
      showToast("error", msg);
    },
  });

  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/positions/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["position-dashboard"] });
      setShowDelete(false);
      setDeleteError(null);
      navigate("/positions/list");
    },
    onError: (err: any) =>
      setDeleteError(err?.response?.data?.error?.message || t("positionDetail.error.deleteFailed")),
  });

  // Deep-link support: opening this page with ?edit=1 (e.g. the pencil on the
  // positions list) prefills and opens the edit form automatically, then
  // strips the param so a refresh/back doesn't re-open it.
  useEffect(() => {
    if (searchParams.get("edit") !== "1" || !data) return;
    setEditForm({
      title: data.title || "",
      department_id: data.department_id ? String(data.department_id) : "",
      employment_type: data.employment_type || "full_time",
      headcount_budget: data.headcount_budget != null ? String(data.headcount_budget) : "1",
      is_critical: data.is_critical || false,
      job_description: data.job_description || "",
      min_salary: data.min_salary ? String(data.min_salary) : "",
      max_salary: data.max_salary ? String(data.max_salary) : "",
      currency: data.currency || "INR",
    });
    setShowEdit(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searchParams]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-3" aria-busy="true" aria-label={t("positionDetail.loading")}>
        <div className="h-16 animate-pulse rounded-lg border border-border bg-card" />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
        <span className="sr-only">{t("positionDetail.loading")}</span>
      </div>
    );
  }

  const pos = data;
  if (!pos) {
    return (
      <Panel className="mx-auto max-w-[1600px]">
        <EmptyState icon={Briefcase} title={t("positionDetail.notFound")} />
      </Panel>
    );
  }

  const activeAssignments = (pos.assignments || []).filter((a: any) => a.status === "active");
  const pastAssignments = (pos.assignments || []).filter((a: any) => a.status === "ended");

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    assignMutation.mutate({
      user_id: Number(assignForm.user_id),
      start_date: assignForm.start_date,
      is_primary: assignForm.is_primary,
    });
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-3">
      <PageHeader
        icon={Briefcase}
        title={
          <span className="flex items-center gap-2">
            <span className="truncate">{pos.title}</span>
            {pos.is_critical && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                {t("positionDetail.editForm.criticalRole")}
              </span>
            )}
          </span>
        }
        description={pos.department_name || t("positionDetail.details.heading")}
        backLink={{ to: "/positions/list", label: t("positionDetail.backToPositions") }}
        meta={
          <>
            {pos.code && <span className="rounded-md bg-muted px-2 py-1 font-mono tabular-nums text-foreground">{pos.code}</span>}
            {pos.location_name && (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {pos.location_name}
              </span>
            )}
            <label className="sr-only" htmlFor="position-status">
              {t("positionDetail.statusLabel", { defaultValue: "Position status" })}
            </label>
            <select
              id="position-status"
              name="position_status"
              value={pos.status}
              onChange={(e) => {
                if (e.target.value !== pos.status) updateStatusMutation.mutate(e.target.value);
              }}
              disabled={updateStatusMutation.isPending}
              className={`min-h-7 cursor-pointer rounded-md border px-2 py-1 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                pos.status === "active"
                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300"
                  : pos.status === "filled"
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
                    : pos.status === "frozen"
                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                      : "border-border bg-muted text-muted-foreground"
              }`}
            >
              <option value="active">{t("positionDetail.status.active")}</option>
              <option value="filled">{t("positionDetail.status.filled")}</option>
              <option value="frozen">{t("positionDetail.status.frozen")}</option>
              <option value="closed">{t("positionDetail.status.closed")}</option>
            </select>
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                setEditForm({
                  title: pos.title || "",
                  department_id: pos.department_id ? String(pos.department_id) : "",
                  employment_type: pos.employment_type || "full_time",
                  headcount_budget: pos.headcount_budget != null ? String(pos.headcount_budget) : "1",
                  is_critical: pos.is_critical || false,
                  job_description: pos.job_description || "",
                  min_salary: pos.min_salary ? String(pos.min_salary) : "",
                  max_salary: pos.max_salary ? String(pos.max_salary) : "",
                  currency: pos.currency || "INR",
                });
                setShowEdit(!showEdit);
              }}
              aria-expanded={showEdit}
              className={secondaryButtonClass}
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
              {t("positionDetail.action.edit")}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDelete(true);
                setDeleteError(null);
              }}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-red-200 bg-card px-3 py-2 text-[13px] font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              {t("positionDetail.action.delete")}
            </button>
            {(pos.status === "active" || pos.status === "filled") && pos.headcount_filled < pos.headcount_budget && (
              <button type="button" onClick={() => setShowAssign(!showAssign)} aria-expanded={showAssign} className={primaryButtonClass}>
                <UserPlus aria-hidden="true" className="h-4 w-4" />
                {t("positionDetail.action.assignEmployee")}
              </button>
            )}
          </>
        }
      />

      {/* Assign Form */}
      {showAssign && (
        <Panel title={t("positionDetail.assignForm.heading")} icon={UserPlus} bodyClassName="p-4">
          <form onSubmit={handleAssign} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="assign-employee-search" className={labelClass}>{t("positionDetail.assignForm.employeeLabel")}</label>
              <input
                id="assign-employee-search"
                name="employee_search"
                type="text"
                autoComplete="off"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  // Clear selection when the user starts a new search so the
                  // UI doesn't keep a stale pick that no longer matches the
                  // filter.
                  if (assignForm.user_id) setAssignForm({ ...assignForm, user_id: "" });
                }}
                placeholder={t("positionDetail.assignForm.searchPlaceholder")}
                className={`${controlClass} mb-2`}
              />
              {/* #1547 — The user list was previously always rendered with every
                  user in the org, making it look like a dropdown "auto-opened".
                  Only render results after the user has typed at least one
                  character — or after a valid selection has been stored (so the
                  picked row stays visible). */}
              {(userSearch.trim().length > 0 || assignForm.user_id) && (
                <div className="max-h-48 overflow-y-auto overscroll-contain rounded-md border border-border bg-card text-[13px]" role="listbox" aria-label={t("positionDetail.assignForm.employeeLabel")}>
                  {(usersData || []).length === 0 ? (
                    <div className="px-3 py-2 text-muted-foreground">{t("positionDetail.assignForm.noUsersMatch")}</div>
                  ) : (
                    (usersData || []).map((u: any) => {
                      const selected = String(u.id) === String(assignForm.user_id);
                      return (
                        <button
                          type="button"
                          key={u.id}
                          role="option"
                          aria-selected={selected}
                          onClick={() => setAssignForm({ ...assignForm, user_id: String(u.id) })}
                          className={`w-full border-b border-border px-3 py-2 text-left transition-colors duration-150 last:border-0 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-brand-950/40 ${
                            selected ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" : "text-foreground"
                          }`}
                        >
                          {u.first_name} {u.last_name}{" "}
                          <span className="text-[11px] text-muted-foreground">({u.email})</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
              {/* Hidden input keeps the `required` semantics for the form */}
              <input type="hidden" value={assignForm.user_id} required readOnly />
            </div>
            <div>
              <label htmlFor="assign-start-date" className={labelClass}>{t("positionDetail.assignForm.startDateLabel")}</label>
              <input
                id="assign-start-date"
                name="start_date"
                type="date"
                value={assignForm.start_date}
                onChange={(e) => setAssignForm({ ...assignForm, start_date: e.target.value })}
                className={controlClass}
                required
              />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] text-foreground hover:bg-muted">
                <input
                  type="checkbox"
                  checked={assignForm.is_primary}
                  onChange={(e) => setAssignForm({ ...assignForm, is_primary: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500"
                />
                {t("positionDetail.assignForm.primaryPosition")}
              </label>
            </div>
            <div className="col-span-full flex gap-3">
              <button type="submit" disabled={assignMutation.isPending} className={primaryButtonClass}>
                {assignMutation.isPending ? t("positionDetail.assignForm.assigning") : t("positionDetail.assignForm.assign")}
              </button>
              <button type="button" onClick={() => setShowAssign(false)} className={secondaryButtonClass}>
                {t("positionDetail.common.cancel")}
              </button>
            </div>
            {assignMutation.isError && (
              <p className="col-span-full text-[13px] text-red-600 dark:text-red-300" role="alert">
                {(assignMutation.error as any)?.response?.data?.error?.message || t("positionDetail.assignForm.assignFailedInline")}
              </p>
            )}
          </form>
        </Panel>
      )}

      {/* Edit Form */}
      {showEdit && (
        <Panel title={t("positionDetail.editForm.heading")} icon={Pencil} bodyClassName="p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const budget = parseInt(editForm.headcount_budget, 10);
              if (!Number.isFinite(budget) || budget < 1) {
                showToast("error", t("positionDetail.editForm.headcountMinError"));
                return;
              }
              updateMutation.mutate({
                title: editForm.title,
                department_id: editForm.department_id ? Number(editForm.department_id) : null,
                employment_type: editForm.employment_type,
                headcount_budget: budget,
                is_critical: editForm.is_critical,
                job_description: editForm.job_description || null,
                min_salary: editForm.min_salary ? Number(editForm.min_salary) : null,
                max_salary: editForm.max_salary ? Number(editForm.max_salary) : null,
                currency: editForm.currency,
              });
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div>
              <label htmlFor="edit-position-title" className={labelClass}>{t("positionDetail.editForm.titleLabel")}</label>
              <input
                id="edit-position-title"
                name="position_title"
                type="text"
                autoComplete="off"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className={controlClass}
                required
              />
            </div>
            <div>
              <label htmlFor="edit-position-department" className={labelClass}>{t("positionDetail.editForm.departmentLabel")}</label>
              <select
                id="edit-position-department"
                name="department_id"
                value={editForm.department_id}
                onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}
                className={controlClass}
              >
                <option value="">{t("positionDetail.editForm.departmentNone")}</option>
                {(departments || []).map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-employment-type" className={labelClass}>{t("positionDetail.editForm.employmentTypeLabel")}</label>
              <select
                id="edit-employment-type"
                name="employment_type"
                value={editForm.employment_type}
                onChange={(e) => setEditForm({ ...editForm, employment_type: e.target.value })}
                className={controlClass}
              >
                <option value="full_time">{t("positionDetail.employmentType.full_time")}</option>
                <option value="part_time">{t("positionDetail.employmentType.part_time")}</option>
                <option value="contract">{t("positionDetail.employmentType.contract")}</option>
                <option value="intern">{t("positionDetail.employmentType.intern")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-headcount-budget" className={labelClass}>{t("positionDetail.editForm.headcountBudgetLabel")}</label>
              <input
                id="edit-headcount-budget"
                name="headcount_budget"
                type="number"
                inputMode="numeric"
                value={editForm.headcount_budget}
                onChange={(e) => setEditForm({ ...editForm, headcount_budget: e.target.value })}
                min={1}
                className={controlClass}
              />
            </div>
            <div>
              <label htmlFor="edit-min-salary" className={labelClass}>{t("positionDetail.editForm.minSalaryLabel")}</label>
              <input
                id="edit-min-salary"
                name="min_salary"
                type="number"
                inputMode="decimal"
                value={editForm.min_salary}
                onChange={(e) => setEditForm({ ...editForm, min_salary: e.target.value })}
                className={controlClass}
              />
            </div>
            <div>
              <label htmlFor="edit-max-salary" className={labelClass}>{t("positionDetail.editForm.maxSalaryLabel")}</label>
              <input
                id="edit-max-salary"
                name="max_salary"
                type="number"
                inputMode="decimal"
                value={editForm.max_salary}
                onChange={(e) => setEditForm({ ...editForm, max_salary: e.target.value })}
                className={controlClass}
              />
            </div>
            <div className="col-span-full">
              <label htmlFor="edit-job-description" className={labelClass}>{t("positionDetail.editForm.jobDescriptionLabel")}</label>
              <textarea
                id="edit-job-description"
                name="job_description"
                value={editForm.job_description}
                onChange={(e) => setEditForm({ ...editForm, job_description: e.target.value })}
                rows={3}
                className={`${controlClass} resize-y`}
              />
            </div>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] text-foreground hover:bg-muted">
              <input type="checkbox" id="edit_is_critical" checked={editForm.is_critical} onChange={(e) => setEditForm({ ...editForm, is_critical: e.target.checked })} className="h-4 w-4 rounded border-border text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500" />
              {t("positionDetail.editForm.criticalRole")}
            </label>
            <div className="col-span-full flex gap-3">
              <button type="submit" disabled={updateMutation.isPending} className={primaryButtonClass}>
                <Save aria-hidden="true" className="h-4 w-4" />
                {updateMutation.isPending ? t("positionDetail.editForm.saving") : t("positionDetail.editForm.saveChanges")}
              </button>
              <button type="button" onClick={() => setShowEdit(false)} className={secondaryButtonClass}>
                {t("positionDetail.common.cancel")}
              </button>
            </div>
            {updateMutation.isError && (
              <p className="col-span-full text-[13px] text-red-600 dark:text-red-300" role="alert">
                {(updateMutation.error as any)?.response?.data?.error?.message || t("positionDetail.editForm.updateFailedInline")}
              </p>
            )}
          </form>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Position Details */}
        <div className="space-y-3 lg:col-span-2">
          {/* Info */}
          <Panel title={t("positionDetail.details.heading")} icon={CircleGauge} bodyClassName="p-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("positionDetail.details.employmentType")}</dt>
                <dd className="mt-1 font-medium capitalize text-foreground">{t(`positionDetail.employmentType.${pos.employment_type}`, { defaultValue: (pos.employment_type || "").replace("_", " ") })}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("positionDetail.details.headcount")}</dt>
                <dd className="mt-1 font-medium tabular-nums text-foreground">{pos.headcount_filled} / {pos.headcount_budget}</dd>
              </div>
              {(pos.min_salary || pos.max_salary) && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("positionDetail.details.salaryRange")}</dt>
                  <dd className="mt-1 font-medium tabular-nums text-foreground">
                    {pos.currency} {pos.min_salary ? (pos.min_salary / 100).toLocaleString() : "0"} - {pos.max_salary ? (pos.max_salary / 100).toLocaleString() : "0"}
                  </dd>
                </div>
              )}
              {pos.reports_to && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("positionDetail.details.reportsTo")}</dt>
                  <dd className="mt-1 font-medium text-foreground">
                    <Link to={`/positions/${pos.reports_to.id}`} className="rounded-sm text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400">
                      {pos.reports_to.title} ({pos.reports_to.code})
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </Panel>

          {/* Job Description */}
          {pos.job_description && (
            <Panel title={t("positionDetail.jobDescription.heading")} icon={Briefcase} bodyClassName="p-4">
              <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-muted-foreground">{pos.job_description}</p>
            </Panel>
          )}

          {/* Requirements */}
          {pos.requirements && (
            <Panel title={t("positionDetail.requirements.heading")} icon={AlertTriangle} bodyClassName="p-4">
              <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-muted-foreground">{pos.requirements}</p>
            </Panel>
          )}
        </div>

        {/* Sidebar — Assignments */}
        <div className="space-y-3">
          {/* Current Assignees */}
          <Panel title={t("positionDetail.assignees.heading", { count: activeAssignments.length })} icon={Users}>
            {activeAssignments.length === 0 ? (
              <EmptyState icon={Users} title={t("positionDetail.assignees.noneAssigned")} className="py-8" />
            ) : (
              <div className="divide-y divide-border">
                {activeAssignments.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
                        {a.first_name?.[0]}{a.last_name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <Link to={`/employees/${a.user_id}`} className="block truncate rounded-sm text-[13px] font-medium text-foreground hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-brand-400">
                          {a.first_name} {a.last_name}
                        </Link>
                        <p className="truncate text-[11px] text-muted-foreground">{t("positionDetail.assignees.since", { date: new Date(a.start_date).toLocaleDateString() })}</p>
                        {!a.is_primary && <span className="text-[11px] text-amber-600 dark:text-amber-300">{t("positionDetail.assignees.actingInterim")}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEndAssignmentId(a.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                      title={t("positionDetail.assignees.endAssignmentTitle")}
                      aria-label={t("positionDetail.assignees.endAssignmentTitle")}
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Past Assignments */}
          {pastAssignments.length > 0 && (
            <Panel title={t("positionDetail.history.heading")} icon={History}>
              <div className="divide-y divide-border">
                {pastAssignments.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 px-4 py-2.5 text-[11px] text-muted-foreground">
                    <Briefcase aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-words tabular-nums">
                      {a.first_name} {a.last_name} ({new Date(a.start_date).toLocaleDateString()} - {a.end_date ? new Date(a.end_date).toLocaleDateString() : t("positionDetail.history.dateRangeNA")})
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !deleteMutation.isPending && setShowDelete(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-position-title"
            aria-describedby="delete-position-description"
            className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-4">
              <div className="flex items-start gap-3">
                <div aria-hidden="true" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 id="delete-position-title" className="text-base font-semibold text-foreground">{t("positionDetail.delete.heading")}</h3>
                  <p id="delete-position-description" className="mt-1 text-[13px] text-muted-foreground">
                    {t("positionDetail.delete.body", { name: pos.title })}
                  </p>
                </div>
              </div>
            </div>
            {deleteError && (
              <div className="mx-4 mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-border bg-muted/40 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                disabled={deleteMutation.isPending}
                className={secondaryButtonClass}
              >
                {t("positionDetail.common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> {t("positionDetail.delete.deleting")}
                  </>
                ) : (
                  t("positionDetail.delete.confirm")
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={endAssignmentId !== null}
        title={t("positionDetail.endAssignment.title")}
        confirmText={t("positionDetail.endAssignment.confirmText")}
        variant="danger"
        loading={removeMutation.isPending}
        onConfirm={() => endAssignmentId !== null && removeMutation.mutate(endAssignmentId)}
        onCancel={() => setEndAssignmentId(null)}
      />
    </div>
  );
}
