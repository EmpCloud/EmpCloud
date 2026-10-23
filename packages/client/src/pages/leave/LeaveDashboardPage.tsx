import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/use-permissions";
import { Link } from "react-router-dom";
import {
  Baby,
  Ban,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChartPie,
  ChevronRight,
  Clock,
  Database,
  Eye,
  Filter,
  Heart,
  Layers3,
  MoreVertical,
  Pencil,
  Plane,
  PlusCircle,
  Settings2,
  Stethoscope,
  Trash2,
  Umbrella,
  Users,
  X as XIcon,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { leaveTypeLabel } from "@/lib/leave-type-label";
import { useStickyLocationFilter } from "@/lib/use-sticky-location";
import { useViewModeStore, hasAnyAdminPermission } from "@/lib/use-view-mode";

// Kept for any legacy callers — page now uses permission-based gates below.
const HR_ROLES = ["hr_admin", "org_admin", "super_admin", "manager"];

interface LeaveBalance {
  id: number;
  leave_type_id: number;
  year: number;
  total_allocated: number;
  extra_allocated?: number;
  total_used: number;
  period_used?: number;
  total_carry_forward: number;
  balance: number;
  // Server-derived period-aware fields (#059):
  available_now?: number;
  period_quota?: number;
  fiscal_year_label?: string;
}

interface LeaveType {
  id: number;
  name: string;
  code: string;
  color: string | null;
  is_paid: boolean;
  is_active: boolean | number;
}

type MetricTone = "blue" | "green" | "amber" | "purple";

const metricToneStyles: Record<MetricTone, { card: string; icon: string }> = {
  blue: {
    card: "border-blue-100 bg-gradient-to-br from-white to-blue-50/80 dark:border-blue-900/50 dark:from-card dark:to-blue-950/20",
    icon: "bg-blue-100 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300",
  },
  green: {
    card: "border-emerald-100 bg-gradient-to-br from-white to-emerald-50/80 dark:border-emerald-900/50 dark:from-card dark:to-emerald-950/20",
    icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-300",
  },
  amber: {
    card: "border-amber-100 bg-gradient-to-br from-white to-amber-50/80 dark:border-amber-900/50 dark:from-card dark:to-amber-950/20",
    icon: "bg-amber-100 text-amber-600 dark:bg-amber-950/70 dark:text-amber-300",
  },
  purple: {
    card: "border-purple-100 bg-gradient-to-br from-white to-purple-50/80 dark:border-purple-900/50 dark:from-card dark:to-purple-950/20",
    icon: "bg-purple-100 text-purple-600 dark:bg-purple-950/70 dark:text-purple-300",
  },
};

function LeaveMetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
  tone: MetricTone;
}) {
  const styles = metricToneStyles[tone];

  return (
    <div
      className={[
        "flex min-h-[92px] min-w-0 items-center gap-3 rounded-xl border p-4 shadow-sm",
        styles.card,
      ].join(" ")}
    >
      <div
        className={[
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          styles.icon,
        ].join(" ")}
      >
        <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase leading-3.5 tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="mt-0.5 text-[10px] leading-3.5 text-muted-foreground">{helper}</p>
      </div>
    </div>
  );
}

function isPaidLeaveType(type: LeaveType) {
  const isUnpaidByName = /\b(unpaid|lwp|without\s*pay|loss\s*of\s*pay)\b/i.test(
    type.name || "",
  );
  return Boolean(type.is_paid) && !isUnpaidByName;
}

function getLeaveTypeIcon(type: LeaveType): LucideIcon {
  const name = (type.name + " " + type.code).toLowerCase();

  if (/maternity|paternity|parent|baby/.test(name)) return Baby;
  if (/sick|medical|health/.test(name)) return Stethoscope;
  if (/casual|annual|vacation|holiday/.test(name)) return Umbrella;
  if (/travel|flight/.test(name)) return Plane;
  if (/earned|privilege|comp|work/.test(name)) return BriefcaseBusiness;
  if (/care|bereavement|wellness/.test(name)) return Heart;
  if (/team|family/.test(name)) return Users;
  return CalendarDays;
}

function parseCalendarDate(value: string | Date) {
  if (value instanceof Date) return value;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }

  return new Date(value);
}

export default function LeaveDashboardPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  // RBAC v1 — admin-side leave UI (settings link, pending approvals queue)
  // shows for users with the corresponding leave permissions, regardless of
  // primary role. A custom role granting leave:approve / view_all /
  // manage_policies / override_balance unlocks the admin sections.
  const { has: hasPerm, permissions } = usePermissions();
  const isAdmin = hasPerm(
    "leave:view_all",
    "leave:view_team",
    "leave:approve",
    "leave:manage_policies",
    "leave:override_balance",
  ) || (user ? HR_ROLES.includes(user.role) : false);

  // Personal sections (own balances, Apply Leave, own applications) belong to
  // the employee/self experience. Mirror the DashboardLayout view-toggle rule:
  // a non-HR user with admin permissions gets the "My view / Admin view"
  // toggle, and when they're in Admin view we hide their personal leave.
  // Everyone else (HR users without a toggle, plain employees) is treated as
  // self view — their behaviour is unchanged.
  const isHRUser = user ? HR_ROLES.includes(user.role) : false;
  const viewMode = useViewModeStore((s) => s.viewMode);
  const hasAdminPerms = hasAnyAdminPermission(permissions);
  const showViewToggle = !isHRUser && hasAdminPerms;
  const isSelfView = !(showViewToggle && viewMode === "admin");
  const [showApply, setShowApply] = useState(false);
  // When set, the apply form is in edit-mode and submits PATCH instead of POST.
  // Cleared whenever the form closes or completes successfully.
  const [editingId, setEditingId] = useState<number | null>(null);
  // ID of the leave application the user is being asked to confirm cancellation
  // for. null = dialog closed.
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  // Transient success banner. Set by mutation onSuccess callbacks; cleared
  // after 3 s by a useEffect.
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!successMsg) return;
    const id = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(id);
  }, [successMsg]);
  // #1578 — form renders below the fold on smaller viewports, so clicks on
  // Apply Leave looked like nothing happened. Scroll the form into view once
  // it mounts so the user sees the apply flow.
  const applyFormRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (showApply) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      applyFormRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [showApply]);

  const {
    data: balances = [],
    isLoading: loadingBalances,
    isError: balancesHasError,
    refetch: refetchBalances,
  } = useQuery<LeaveBalance[]>({
    queryKey: ["leave-balances"],
    queryFn: () => api.get("/leave/balances").then((r) => r.data.data),
  });

  const {
    data: leaveTypes = [],
    isError: leaveTypesHasError,
    refetch: refetchLeaveTypes,
  } = useQuery<LeaveType[]>({
    queryKey: ["leave-types"],
    queryFn: () => api.get("/leave/types").then((r) => r.data.data),
  });

  // Subset of `leaveTypes` whose active policy applies to the current user's
  // gender (server-side filter on `leave_policies.applicable_gender`). Used
  // for the employee balance cards and the apply-leave dropdown so a male
  // employee does not see Maternity, etc. The unfiltered `leaveTypes` is
  // still passed to admin sub-components so they can resolve names for any
  // leave type when reviewing other employees' applications.
  const {
    data: myLeaveTypes = [],
    isLoading: loadingMyLeaveTypes,
    isError: myLeaveTypesHasError,
    refetch: refetchMyLeaveTypes,
  } = useQuery<LeaveType[]>({
    queryKey: ["leave-types-me"],
    queryFn: () => api.get("/leave/types/me").then((r) => r.data.data),
  });

  const loadingOverview = loadingBalances || loadingMyLeaveTypes;
  const overviewHasError = balancesHasError || myLeaveTypesHasError;
  const leaveDataHasError = overviewHasError || leaveTypesHasError;
  const retryLeaveData = () => {
    void refetchBalances();
    void refetchLeaveTypes();
    void refetchMyLeaveTypes();
  };

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }),
    [i18n.language],
  );
  const formatDays = (value: number) =>
    `${numberFormatter.format(value)} ${t(
      value === 1 ? 'leave.dashboard.day' : 'leave.dashboard.days',
    )}`;

  const visibleLeaveTypes = useMemo(
    () =>
      myLeaveTypes
        .filter((type) => Boolean(type.is_active))
        .filter((type, _index, activeTypes) => {
          const sameName = activeTypes.filter((candidate) => candidate.name === type.name);
          if (sameName.length === 1) return true;

          const withAllocation = sameName.find((candidate) => {
            const balance = balances.find((item) => item.leave_type_id === candidate.id);
            return balance && Number(balance.total_allocated) > 0;
          });

          return withAllocation
            ? withAllocation.id === type.id
            : sameName[0].id === type.id;
        }),
    [balances, myLeaveTypes],
  );

  const leaveOverview = useMemo(() => {
    const visibleIds = new Set(visibleLeaveTypes.map((type) => type.id));
    const visibleBalances = balances.filter((balance) => visibleIds.has(balance.leave_type_id));

    return {
      totalTypes: visibleLeaveTypes.length,
      paidTypes: visibleLeaveTypes.filter(isPaidLeaveType).length,
      totalAllocated: visibleBalances.reduce(
        (sum, balance) => sum + Number(balance.total_allocated ?? 0),
        0,
      ),
      totalUsed: visibleBalances.reduce(
        (sum, balance) => sum + Number(balance.total_used ?? 0),
        0,
      ),
    };
  }, [balances, visibleLeaveTypes]);

  const [form, setForm] = useState({
    leave_type_id: 0,
    start_date: "",
    end_date: "",
    days_count: 1,
    is_half_day: false,
    half_day_type: "" as string | null,
    reason: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Always recompute days_count from (start_date, end_date, is_half_day)
  // so the displayed number stays in sync regardless of the order the
  // user fills the dates. Previously the recompute lived only inside
  // each date input's onChange and read stale closure state -- typing
  // the end date before the start date left the field at the initial
  // value of 1.
  //
  // This is INCLUSIVE CALENDAR days. The server further subtracts the
  // applicant's shift week-offs and mandatory holidays at submission
  // time, so this number may be larger than the final debit. The hint
  // below the field tells the user that.
  useEffect(() => {
    if (form.is_half_day) {
      if (form.days_count !== 0.5) setForm((f) => ({ ...f, days_count: 0.5 }));
      return;
    }
    if (!form.start_date || !form.end_date) return;
    const start = new Date(form.start_date);
    const end = new Date(form.end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return;
    const diff = Math.floor(
      (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
        Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
        (1000 * 60 * 60 * 24),
    ) + 1;
    if (diff > 0 && diff !== form.days_count) {
      setForm((f) => ({ ...f, days_count: diff }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.start_date, form.end_date, form.is_half_day]);

  const resetForm = () => {
    setForm({ leave_type_id: 0, start_date: "", end_date: "", days_count: 1, is_half_day: false, half_day_type: "", reason: "" });
    setEditingId(null);
    setFormError(null);
  };

  const invalidateLeaveQueries = () => {
    qc.invalidateQueries({ queryKey: ["leave-balances"] });
    qc.invalidateQueries({ queryKey: ["leave-applications"] });
    qc.invalidateQueries({ queryKey: ["leave-applications-me"] });
    qc.invalidateQueries({ queryKey: ["leave-applications-pending"] });
  };

  const applyLeave = useMutation({
    mutationFn: (data: typeof form) =>
      api.post("/leave/applications", {
        ...data,
        half_day_type: data.half_day_type || null,
      }).then((r) => r.data.data),
    onSuccess: () => {
      invalidateLeaveQueries();
      setShowApply(false);
      resetForm();
      setSuccessMsg(t('leave.dashboard.appliedSuccess'));
    },
  });

  const updateLeave = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof form }) =>
      api.patch(`/leave/applications/${id}`, {
        ...data,
        half_day_type: data.half_day_type || null,
      }).then((r) => r.data.data),
    onSuccess: () => {
      invalidateLeaveQueries();
      setShowApply(false);
      resetForm();
      setSuccessMsg(t('leave.dashboard.updatedSuccess'));
    },
  });

  const cancelLeave = useMutation({
    mutationFn: (id: number) =>
      api.put(`/leave/applications/${id}/cancel`).then((r) => r.data.data),
    onSuccess: () => {
      invalidateLeaveQueries();
      setSuccessMsg(t('leave.dashboard.cancelledSuccess'));
    },
  });

  // Start editing a pending leave. Prefills the apply form, switches it to
  // edit-mode, and scrolls the form into view via the existing showApply effect.
  const startEdit = (app: any) => {
    setForm({
      leave_type_id: Number(app.leave_type_id) || 0,
      start_date: String(app.start_date).slice(0, 10),
      end_date: String(app.end_date).slice(0, 10),
      days_count: Number(app.days_count) || 1,
      is_half_day: Boolean(app.is_half_day),
      half_day_type: app.half_day_type ?? "",
      reason: app.reason ?? "",
    });
    setEditingId(Number(app.id));
    setFormError(null);
    setShowApply(true);
  };

  // #1822 — Bug 25: previously this silently `return`-ed when fields were
  // missing, which made a click on Submit feel like nothing happened. Now
  // we surface a clear inline message and also enforce end_date >=
  // start_date before sending anything to the server. The fields all carry
  // `required` HTML attributes too, so the browser's native bubble fires
  // first; this state is the fallback for cases where the user manages to
  // bypass that (e.g. JS-driven submit, stale form).
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.leave_type_id || form.leave_type_id === 0) {
      setFormError(t("leave.dashboard.selectLeaveTypeError", {
        defaultValue: "Please select a leave type.",
      }));
      return;
    }
    if (!form.start_date) {
      setFormError(t("leave.dashboard.startDateRequired", {
        defaultValue: "Start date is required.",
      }));
      return;
    }
    if (!form.end_date) {
      setFormError(t("leave.dashboard.endDateRequired", {
        defaultValue: "End date is required.",
      }));
      return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      setFormError(t("leave.dashboard.endDateBeforeStart", {
        defaultValue: "End date cannot be before start date.",
      }));
      return;
    }
    if (!form.reason || !form.reason.trim()) {
      setFormError(t("leave.dashboard.reasonRequired", {
        defaultValue: "Please describe the reason for your leave.",
      }));
      return;
    }
    if (editingId !== null) {
      updateLeave.mutate({ id: editingId, data: form });
    } else {
      applyLeave.mutate(form);
    }
  };

  return (
    <div>
      {successMsg && (
        <div
          role="status"
          className="fixed top-4 right-4 z-[60] flex items-start gap-3 max-w-sm rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/40 px-4 py-3 shadow-lg animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none"
        >
          <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
          <div className="flex-1 text-[13px] font-medium text-green-800 dark:text-green-200">{successMsg}</div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            aria-label={t('common.close')}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-green-700 transition-colors hover:bg-green-100 hover:text-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 dark:text-green-300 dark:hover:bg-green-900/50"
          >
            <XIcon aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}

      <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900/60">
            <CalendarDays aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('leave.dashboard.title')}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t('leave.dashboard.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          {isAdmin && (
            <Link
              to="/leave/settings"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:flex-none"
            >
              <Settings2 aria-hidden="true" className="h-4 w-4" />
              {t('leave.dashboard.leaveSettings')}
            </Link>
          )}
          {isSelfView && (
            <button
              type="button"
              onClick={() => setShowApply(true)}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:flex-none"
            >
              <PlusCircle aria-hidden="true" className="h-4 w-4" />
              {t('leave.applyLeave')}
            </button>
          )}
        </div>
      </header>

      {leaveDataHasError && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {t("leave.dashboard.loadErrorTitle", {
                  defaultValue: "Leave data could not be loaded",
                })}
              </p>
              <p className="mt-0.5 text-xs">
                {t("leave.dashboard.loadErrorDescription", {
                  defaultValue:
                    "Check your connection and try loading the leave information again.",
                })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={retryLeaveData}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800 dark:bg-card dark:text-red-200 dark:hover:bg-red-950/60"
          >
            {t("common.retry", { defaultValue: "Retry" })}
          </button>
        </div>
      )}

      {isSelfView && !overviewHasError && (
        <section
          aria-label={t('leave.dashboard.overview')}
          className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <LeaveMetricCard
            icon={Layers3}
            label={t('leave.dashboard.totalLeaveTypes')}
            value={loadingOverview ? "—" : numberFormatter.format(leaveOverview.totalTypes)}
            helper={t('leave.dashboard.availableCategories')}
            tone="blue"
          />
          <LeaveMetricCard
            icon={ChartPie}
            label={t('leave.dashboard.paidLeaveTypes')}
            value={loadingOverview ? "—" : numberFormatter.format(leaveOverview.paidTypes)}
            helper={t('leave.dashboard.activeAndEnabled')}
            tone="green"
          />
          <LeaveMetricCard
            icon={Clock}
            label={t('leave.dashboard.totalAllocated')}
            value={
              loadingOverview
                ? "—"
                : formatDays(leaveOverview.totalAllocated)
            }
            helper={t('leave.dashboard.acrossLeaveTypes')}
            tone="amber"
          />
          <LeaveMetricCard
            icon={Database}
            label={t('leave.dashboard.totalUsed')}
            value={
              loadingOverview
                ? "—"
                : formatDays(leaveOverview.totalUsed)
            }
            helper={t('leave.dashboard.acrossLeaveTypes')}
            tone="purple"
          />
        </section>
      )}

      {/* Balance Cards — #1409: render one card per active leave type so
          employees see all configured types even when a balance row has not
          yet been initialized (missing rows render as zero).
          Hidden in Admin view — own leave balance is personal/self-only. */}
      {isSelfView && !overviewHasError && (
      <section
        aria-label={t('leave.dashboard.balances')}
        className="mb-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {loadingOverview ? (
          <>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="min-h-[140px] animate-pulse rounded-xl border border-border bg-card p-4 shadow-sm motion-reduce:animate-none"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-muted" />
                  <div className="space-y-2">
                    <div className="h-3.5 w-28 rounded bg-muted" />
                    <div className="h-3 w-16 rounded bg-muted" />
                  </div>
                </div>
                <div className="mb-2 h-6 w-20 rounded bg-muted" />
                <div className="h-1.5 w-full rounded-full bg-muted" />
              </div>
            ))}
          </>
        ) : visibleLeaveTypes.length === 0 ? (
          <div className="col-span-full text-center text-muted-foreground py-8">
            {t('leave.noTypes')}
          </div>
        ) : (
          visibleLeaveTypes.map((type) => {
              const bal = balances.find((b) => b.leave_type_id === type.id);
              const typeColor = type.color ?? "#6366f1";
              const allocated = Number(bal?.total_allocated ?? 0);
              const extra = Number(bal?.extra_allocated ?? 0);
              const used = Number(bal?.total_used ?? 0);
              const carry = Number(bal?.total_carry_forward ?? 0);
              // Prefer server-derived `available_now` (period-aware) over the
              // legacy `balance` column. Fall back to `balance` for older
              // payloads so the dashboard never shows blank.
              const balance = Number(bal?.available_now ?? bal?.balance ?? 0);
              const periodQuota = Number(bal?.period_quota ?? 0);
              const periodUsed = Number(bal?.period_used ?? 0);
              const fyLabel = bal?.fiscal_year_label;
              const total = allocated + carry + extra;
              const TypeIcon = getLeaveTypeIcon(type);
              const paid = isPaidLeaveType(type);
              const usePeriod = periodQuota > 0 && periodQuota !== allocated;
              const availableAmount = usePeriod
                ? Math.max(0, periodQuota - periodUsed)
                : Math.max(0, balance);
              const availableTotal = usePeriod ? periodQuota : total;
              const usedAmount = usePeriod ? periodUsed : used;
              const availablePercentage =
                availableTotal > 0
                  ? Math.min(100, Math.max(0, (availableAmount / availableTotal) * 100))
                  : 0;
              const usedPercentage =
                availableTotal > 0
                  ? Math.min(100, Math.max(0, (usedAmount / availableTotal) * 100))
                  : 0;
              return (
                <div
                  key={type.id}
                  className="flex min-h-[140px] min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none dark:hover:border-brand-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"
                        style={{ color: typeColor }}
                      >
                        <TypeIcon aria-hidden="true" className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-[13px] font-bold leading-4 text-foreground">
                          {leaveTypeLabel(t, type)}
                        </h3>
                        <span
                          className={
                            paid
                              ? "mt-0.5 inline-flex rounded-md bg-emerald-50 px-1.5 py-px text-[9px] font-bold uppercase leading-3 tracking-wide text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : "mt-0.5 inline-flex rounded-md bg-muted px-1.5 py-px text-[9px] font-bold uppercase leading-3 tracking-wide text-muted-foreground"
                          }
                        >
                          {paid ? t('leave.dashboard.paid') : t('leave.dashboard.unpaid')}
                        </span>
                      </div>
                    </div>
                    <Link
                      to="/leave/applications"
                      aria-label={`${t('leave.dashboard.viewApplication')}: ${leaveTypeLabel(t, type)}`}
                      title={t('leave.dashboard.viewApplication')}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <MoreVertical aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <p className="min-w-0 text-xl font-bold leading-7 tabular-nums text-foreground">
                      {numberFormatter.format(balance)}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">
                        {t(balance === 1 ? 'leave.dashboard.day' : 'leave.dashboard.days')}
                      </span>
                    </p>
                    <div className="min-w-0 text-right text-[10px] leading-3.5 text-muted-foreground">
                      <p className="tabular-nums">
                        {t('leave.dashboard.usedOfAllocated', {
                          used: numberFormatter.format(used),
                          allocated: numberFormatter.format(allocated),
                        })}
                      </p>
                      <p className="font-medium tabular-nums text-foreground">
                        {numberFormatter.format(Math.max(0, balance))}{" "}
                        {t('leave.dashboard.remaining')}
                      </p>
                    </div>
                  </div>

                  {(extra !== 0 || carry > 0) && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {extra !== 0 && (
                        <span
                          className={
                            extra > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }
                        >
                          {extra > 0 ? "+" : ""}
                          {numberFormatter.format(extra)} extra
                        </span>
                      )}
                      {extra !== 0 && carry > 0 && " · "}
                      {carry > 0 &&
                        t('leave.dashboard.carrySuffix', {
                          carry: numberFormatter.format(carry),
                        })}
                    </p>
                  )}

                  {usePeriod && (
                    <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                      {t('leave.dashboard.thisPeriod')}:{" "}
                      {numberFormatter.format(Math.max(0, periodQuota - periodUsed))} /{" "}
                      {numberFormatter.format(periodQuota)}
                      {fyLabel && ` · FY ${fyLabel}`}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="order-2 shrink-0">
                      <span
                        aria-label={t("leave.dashboard.usedPercentage", {
                          value: Math.round(usedPercentage),
                          defaultValue: "{{value}}% used",
                        })}
                        className="text-[10px] font-medium tabular-nums text-muted-foreground"
                      >
                        {Math.round(usedPercentage)}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={t("leave.dashboard.remainingBalance", {
                        type: leaveTypeLabel(t, type),
                        defaultValue: "{{type}} remaining balance",
                      })}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(availablePercentage)}
                      aria-valuetext={t("leave.dashboard.remainingPercentage", {
                        value: Math.round(availablePercentage),
                        defaultValue: "{{value}}% remaining",
                      })}
                      className="order-1 h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                        style={{
                          width: availablePercentage + "%",
                          backgroundColor: typeColor,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </section>
      )}

      {/* Quick Apply Form — self view only (own leave application). */}
      {isSelfView && showApply && (
        <form
          ref={applyFormRef}
          onSubmit={handleSubmit}
          className="bg-card rounded-lg border border-border p-4 mb-6 scroll-mt-4"
        >
          <h2 className="text-base font-semibold text-foreground mb-3">
            {editingId !== null ? t('leave.dashboard.editTitle') : t('leave.dashboard.applyTitle')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="leave-application-type" className="block text-[13px] font-medium text-muted-foreground mb-1">{t('leave.leaveType')} <span className="text-red-500">*</span></label>
              <select
                id="leave-application-type"
                name="leave_type_id"
                autoComplete="off"
                value={form.leave_type_id}
                onChange={(e) => setForm({ ...form, leave_type_id: Number(e.target.value) })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                required
              >
                <option value={0} disabled>{t('leave.dashboard.selectType')}</option>
                {visibleLeaveTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>{leaveTypeLabel(t, lt)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="leave-start-date" className="block text-[13px] font-medium text-muted-foreground mb-1">{t('leave.startDate')} <span className="text-red-500">*</span></label>
              <input
                id="leave-start-date"
                name="start_date"
                type="date"
                autoComplete="off"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                required
              />
            </div>
            <div>
              <label htmlFor="leave-end-date" className="block text-[13px] font-medium text-muted-foreground mb-1">{t('leave.endDate')} <span className="text-red-500">*</span></label>
              <input
                id="leave-end-date"
                name="end_date"
                type="date"
                autoComplete="off"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                required
              />
            </div>
            <div>
              <label htmlFor="leave-days-count" className="block text-[13px] font-medium text-muted-foreground mb-1">{t('leave.dashboard.numberOfDays')} <span className="text-red-500">*</span></label>
              <input
                id="leave-days-count"
                name="days_count"
                type="number"
                autoComplete="off"
                value={form.days_count}
                readOnly
                tabIndex={-1}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-muted text-muted-foreground cursor-not-allowed"
                title={t("leave.dashboard.daysAutoComputedTitle", {
                  defaultValue:
                    "Auto-computed from the date range. The server adjusts the actual debit to exclude your week-offs and mandatory holidays.",
                })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("leave.dashboard.daysAutoComputedHint", {
                  defaultValue:
                    "Auto-computed from the date range. Week-offs and mandatory holidays in this span will not be debited from your balance.",
                })}
              </p>
            </div>
            <div className="flex items-end gap-4">
              <label htmlFor="leave-half-day" className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  id="leave-half-day"
                  name="is_half_day"
                  type="checkbox"
                  checked={form.is_half_day}
                  onChange={(e) => setForm({ ...form, is_half_day: e.target.checked, half_day_type: e.target.checked ? "first_half" : "" })}
                  className="rounded border-border"
                />
                {t('leave.dashboard.halfDay')}
              </label>
              {form.is_half_day && (
                <div>
                  <label htmlFor="leave-half-day-type" className="sr-only">
                    {t("leave.dashboard.halfDayType", {
                      defaultValue: "Half-day period",
                    })}
                  </label>
                  <select
                    id="leave-half-day-type"
                    name="half_day_type"
                    autoComplete="off"
                    value={form.half_day_type ?? ""}
                    onChange={(e) => setForm({ ...form, half_day_type: e.target.value })}
                    className="bg-card text-foreground px-3 py-2 border border-border rounded-md text-[13px]"
                  >
                    <option value="first_half">{t('leave.dashboard.firstHalf')}</option>
                    <option value="second_half">{t('leave.dashboard.secondHalf')}</option>
                  </select>
                </div>
              )}
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label htmlFor="leave-reason" className="block text-[13px] font-medium text-muted-foreground mb-1">{t('leave.reason')} <span className="text-red-500">*</span></label>
              <textarea
                id="leave-reason"
                name="reason"
                autoComplete="off"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                rows={2}
                required
              />
            </div>
          </div>
          {formError && (
            <div role="alert" className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-[13px] rounded-md px-4 py-3 mt-4">
              {formError}
            </div>
          )}
          {(applyLeave.isError || updateLeave.isError) && (
            <div role="alert" className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-[13px] rounded-md px-4 py-3 mt-4">
              {(() => {
                const err = editingId !== null ? updateLeave.error : applyLeave.error;
                const msg = err && typeof err === "object" && "response" in err
                  ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
                  : null;
                return msg || t('leave.dashboard.submitError');
              })()}
            </div>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowApply(false);
                resetForm();
                applyLeave.reset();
                updateLeave.reset();
              }}
              className="rounded-md border border-border px-4 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={applyLeave.isPending || updateLeave.isPending}
              className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <CalendarDays aria-hidden="true" className="h-4 w-4" />
              {editingId !== null
                ? (updateLeave.isPending ? t('leave.dashboard.saving') : t('leave.dashboard.saveChanges'))
                : (applyLeave.isPending ? t('leave.dashboard.submitting') : t('leave.dashboard.submitApplication'))}
            </button>
          </div>
        </form>
      )}

      {/* Pending Approvals — Admin/Manager View */}
      {isAdmin && <PendingApprovals leaveTypes={leaveTypes} />}

      {/* Recent Applications — the current user's OWN leave applications, so
          only shown in self view (hidden in Admin view). */}
      {isSelfView && (
        <>
          <RecentApplications
            leaveTypes={leaveTypes}
            locale={i18n.language}
            onEdit={startEdit}
            onCancel={(id: number) => setCancelTargetId(id)}
            cancelPending={cancelLeave.isPending}
          />

        </>
      )}

      <ConfirmDialog
        open={cancelTargetId !== null}
        title={t('leave.dashboard.cancelConfirmTitle')}
        description={
          cancelLeave.isError
            ? ((cancelLeave.error as { response?: { data?: { error?: { message?: string } } } })
                ?.response?.data?.error?.message) || t('leave.dashboard.cancelFailed')
            : t('leave.dashboard.cancelConfirm')
        }
        confirmText={t('leave.dashboard.cancelAction')}
        cancelText={t('common.close')}
        variant="danger"
        loading={cancelLeave.isPending}
        onConfirm={() => {
          if (cancelTargetId !== null) {
            cancelLeave.mutate(cancelTargetId, {
              onSuccess: () => {
                setCancelTargetId(null);
                cancelLeave.reset();
              },
              // On error: keep dialog open so the inline message is visible.
            });
          }
        }}
        onCancel={() => {
          setCancelTargetId(null);
          cancelLeave.reset();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Applications sub-component
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  pending: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", icon: Clock },
  approved: { bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-300", icon: CheckCircle2 },
  rejected: { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", icon: XCircle },
  cancelled: { bg: "bg-muted", text: "text-muted-foreground", icon: Ban },
};

function RecentApplications({
  leaveTypes,
  locale,
  onEdit,
  onCancel,
  cancelPending,
}: {
  leaveTypes: LeaveType[];
  locale: string;
  onEdit: (app: any) => void;
  onCancel: (id: number) => void;
  cancelPending: boolean;
}) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<number | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilter =
    !!statusFilter || leaveTypeFilter != null || !!dateFrom || !!dateTo;
  // #1613 — Recent Applications used to fetch only 5 rows, so each new
  // application pushed older ones off the table and there was no way to view
  // history without leaving the dashboard. Fetch a larger window (50) and
  // make the body scroll vertically; also surface a "View all" link to the
  // full Applications page for users who want pagination.
  const {
    data,
    isLoading,
    isError: applicationsHasError,
    refetch: refetchApplications,
  } = useQuery({
    queryKey: ["leave-applications-me", statusFilter, leaveTypeFilter, dateFrom, dateTo],
    queryFn: () =>
      api
        .get("/leave/applications/me", {
          params: {
            page: 1,
            per_page: 50,
            status: statusFilter || undefined,
            leave_type_id: leaveTypeFilter || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
          },
        })
        .then((r) => r.data),
    // Override the global 30s staleTime -- switching status tabs (Pending /
    // Approved / etc.) needs to hit the server every time so HR sees the
    // current state, not a 30-second-stale snapshot.
    staleTime: 0,
    refetchOnMount: "always",
  });

  const applications = data?.data || [];
  const total = Number(data?.meta?.total ?? applications.length);
  const getTypeName = (id: number) => {
    const lt = leaveTypes.find((x) => x.id === id);
    return lt ? leaveTypeLabel(t, lt) : "-";
  };
  const statusLabel = (s: string) => {
    const key = s === "pending" ? "common.pending" : s === "approved" ? "common.approved" : s === "rejected" ? "common.rejected" : s === "cancelled" ? "common.cancelled" : "";
    return key ? t(key) : s;
  };
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const shortDateFormatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
  });

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-300">
              <Clock aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-5 text-foreground">
                {t('leave.dashboard.recentTitle')}
              </h2>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {t('leave.dashboard.recentSubtitle')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              to="/leave/applications"
              className="inline-flex min-h-8 items-center gap-0.5 rounded-md px-2 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-brand-300 dark:hover:bg-brand-950/40"
            >
              {t('common.viewAll')}
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">({total})</span>
            </Link>
            <button
              type="button"
              aria-expanded={showFilters}
              aria-controls="recent-leave-filters"
              onClick={() => setShowFilters((v) => !v)}
              className={
                "inline-flex min-h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 " +
                (hasActiveFilter
                  ? "border-brand-300 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                  : "border-border text-muted-foreground hover:bg-muted")
              }
            >
              <Filter aria-hidden="true" className="h-3.5 w-3.5" />
              {t('leave.dashboard.filters')}
              {hasActiveFilter && <span aria-hidden="true">·</span>}
            </button>
          </div>
        </div>
        {showFilters && (
          <div id="recent-leave-filters" className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="recent-status-filter" className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{t("common.status")}</label>
              <select
                id="recent-status-filter"
                name="recent-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-card text-foreground px-2 py-1.5 border border-border rounded-md text-[11px]"
              >
                <option value="">{t("common.all")}</option>
                <option value="pending">{t("common.pending")}</option>
                <option value="approved">{t("common.approved")}</option>
                <option value="rejected">{t("common.rejected")}</option>
                <option value="cancelled">{t("common.cancelled")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="recent-leave-type-filter" className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{t("leave.leaveType")}</label>
              <select
                id="recent-leave-type-filter"
                name="recent-leave-type-filter"
                value={leaveTypeFilter ?? ""}
                onChange={(e) => setLeaveTypeFilter(e.target.value ? Number(e.target.value) : undefined)}
                className="bg-card text-foreground px-2 py-1.5 border border-border rounded-md text-[11px]"
              >
                <option value="">{t("common.all")}</option>
                {leaveTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>{leaveTypeLabel(t, lt)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="recent-date-from" className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{t("leave.dashboard.from", { defaultValue: "From" })}</label>
              <input
                id="recent-date-from"
                name="recent-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-card text-foreground px-2 py-1.5 border border-border rounded-md text-[11px]"
              />
            </div>
            <div>
              <label htmlFor="recent-date-to" className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{t("leave.dashboard.to", { defaultValue: "To" })}</label>
              <input
                id="recent-date-to"
                name="recent-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-card text-foreground px-2 py-1.5 border border-border rounded-md text-[11px]"
              />
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => { setStatusFilter(""); setLeaveTypeFilter(undefined); setDateFrom(""); setDateTo(""); }}
                className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <XIcon aria-hidden="true" className="h-3 w-3" /> {t("leave.dashboard.clearFilters", { defaultValue: "Clear" })}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="max-h-80 overflow-auto">
      <table className="w-full min-w-[680px]">
        <caption className="sr-only">{t('leave.dashboard.recentTitle')}</caption>
        <thead className="border-b border-border bg-slate-50/80 dark:bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.typeHeader')}</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.datesHeader')}</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.daysHeader')}</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.statusHeader')}</th>
            <th className="w-24 whitespace-nowrap px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.actionsHeader')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <tr key={i} className="animate-pulse motion-reduce:animate-none">
                  <td className="px-3 py-2"><div className="h-4 w-20 rounded bg-muted" /></td>
                  <td className="px-3 py-2"><div className="h-4 w-32 rounded bg-muted" /></td>
                  <td className="px-3 py-2"><div className="h-4 w-8 rounded bg-muted" /></td>
                  <td className="px-3 py-2"><div className="h-4 w-16 rounded-full bg-muted" /></td>
                  <td className="px-3 py-2"><div className="ml-auto h-4 w-12 rounded bg-muted" /></td>
                </tr>
              ))}
            </>
          ) : applicationsHasError ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center">
                <div role="alert" className="mx-auto max-w-md text-xs text-red-700 dark:text-red-300">
                  <p>
                    {t("leave.dashboard.recentLoadError", {
                      defaultValue:
                        "Recent leave applications could not be loaded.",
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchApplications()}
                    className="mt-2 rounded-md border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-900 dark:bg-card dark:text-red-200 dark:hover:bg-red-950/50"
                  >
                    {t("common.retry", { defaultValue: "Retry" })}
                  </button>
                </div>
              </td>
            </tr>
          ) : applications.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">{t('leave.dashboard.noApplications')}</td>
            </tr>
          ) : (
            applications.map((app: any) => {
              const style = STATUS_STYLES[app.status] || STATUS_STYLES.pending;
              const StatusIcon = style.icon;
              const leaveType = leaveTypes.find((type) => type.id === app.leave_type_id);
              const TypeIcon = leaveType ? getLeaveTypeIcon(leaveType) : CalendarDays;
              return (
                <tr key={app.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                        <TypeIcon aria-hidden="true" className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate text-xs font-medium text-foreground">
                        {getTypeName(app.leave_type_id)}
                        {Boolean(app.is_half_day) && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {t('leave.dashboard.halfSuffix')}
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                      <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                      <span>
                        {dateFormatter.format(parseCalendarDate(app.start_date))} &mdash;{" "}
                        {dateFormatter.format(parseCalendarDate(app.end_date))}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs font-medium tabular-nums text-muted-foreground">
                    {Number(app.days_count)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                      <StatusIcon aria-hidden="true" className="h-3 w-3" />
                      {statusLabel(app.status)}
                    </span>
                    {/* Backend joins leave_approvals → approver name + acted_at.
                        Only render the sub-line when the leave has actually
                        been acted on (approved or rejected) AND the join
                        populated both fields. Pending rows have nothing to
                        show; the "CONCAT(NULL, ' ', NULL)" pattern returns
                        the literal string "null null" on some MySQL configs
                        when there's no matching leave_approvals row, so we
                        guard with a real name check, not just truthiness. */}
                    {(app.status === "approved" || app.status === "rejected") &&
                      app.approver_name &&
                      app.approver_name.trim() &&
                      app.approver_name.trim().toLowerCase() !== "null null" && (
                        <div className="mt-1 text-[11px] text-muted-foreground leading-tight">
                          {t(app.status === "approved" ? 'leave.dashboard.approvedBy' : 'leave.dashboard.rejectedBy', { name: app.approver_name.trim() })}
                          {app.approval_date && (
                            <span className="text-muted-foreground">
                              {" · "}
                              {shortDateFormatter.format(new Date(app.approval_date))}
                            </span>
                          )}
                        </div>
                      )}
                  </td>
                  <td className="w-24 whitespace-nowrap px-3 py-2 text-right">
                    {app.status === "pending" ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(app)}
                          aria-label={t('leave.dashboard.editAction')}
                          title={t('leave.dashboard.editAction')}
                          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-brand-950/40"
                        >
                          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onCancel(Number(app.id))}
                          disabled={cancelPending}
                          aria-label={t('leave.dashboard.cancelAction')}
                          title={t('leave.dashboard.cancelAction')}
                          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <Link
                        to="/leave/applications"
                        aria-label={t('leave.dashboard.viewApplication')}
                        title={t('leave.dashboard.viewApplication')}
                        className="inline-flex rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-blue-950/40"
                      >
                        <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pending Approvals sub-component — shows all pending leave requests for admins
// ---------------------------------------------------------------------------

function PendingApprovals({ leaveTypes }: { leaveTypes: LeaveType[] }) {
  const { t, i18n } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const qc = useQueryClient();
  const [remarks, setRemarks] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ type: string; success: number; failed: number; error?: string } | null>(null);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{
    id: number;
    remarks: string;
    employeeName: string;
  } | null>(null);
  // Status tab — admins were losing visibility of a leave once they approved
  // it because this panel only ever showed `status=pending`. Tabs let them
  // see approved/rejected/cancelled or the full list without leaving the
  // dashboard. Defaults to pending to preserve the original primary action.
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "cancelled" | "all">("pending");
  // Extra filters for the manager queue: department / location / leave type
  // / employee name search / date range. Hidden behind a toggle so the
  // panel doesn't dominate the dashboard until the user opts in.
  const [showFilters, setShowFilters] = useState(false);
  const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
  const [locationId, setLocationId] = useStickyLocationFilter();
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);
  const hasExtraFilters =
    departmentId != null || locationId != null || leaveTypeFilter != null ||
    !!appliedSearch || !!dateFrom || !!dateTo;

  const { data: departments = [] } = useQuery({
    queryKey: ["org-departments"],
    queryFn: () => api.get("/organizations/me/departments").then((r) => r.data.data),
    staleTime: 60000,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["org-locations"],
    queryFn: () => api.get("/organizations/me/locations").then((r) => r.data.data),
    staleTime: 60000,
  });

  // #1411 — show server errors instead of silently swallowing them
  const [actionError, setActionError] = useState<string | null>(null);
  const extractErr = (err: any) =>
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    t('leave.dashboard.actionFailed');
  const roleLabel = (role: string) =>
    t(`roles.${role}`, {
      defaultValue: role
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
    });

  const {
    data,
    isLoading,
    isError: applicationsHasError,
    refetch: refetchApplications,
  } = useQuery({
    queryKey: [
      "leave-applications-pending",
      statusFilter,
      departmentId,
      locationId,
      leaveTypeFilter,
      appliedSearch,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      api
        .get("/leave/applications", {
          params: {
            page: 1,
            per_page: 50,
            status: statusFilter === "all" ? undefined : statusFilter,
            department_id: departmentId || undefined,
            location_id: locationId || undefined,
            leave_type_id: leaveTypeFilter || undefined,
            search: appliedSearch || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
          },
        })
        .then((r) => r.data),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const approveMut = useMutation({
    mutationFn: ({ id, remarks: r }: { id: number; remarks: string }) =>
      api.put(`/leave/applications/${id}/approve`, { remarks: r }).then((res) => res.data.data),
    onSuccess: () => {
      // Approving from Pending Approvals must also refresh the dashboard's
      // Recent Applications panel (its own query key) and the admin Employee
      // Leaves view, otherwise the freshly-approved row stays stale until
      // the user manually reloads.
      qc.invalidateQueries({ queryKey: ["leave-applications-pending"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["leave-applications"] });
      qc.invalidateQueries({ queryKey: ["leave-applications-me"] });
      qc.invalidateQueries({ queryKey: ["my-leave-balance"] });
      qc.invalidateQueries({ queryKey: ["admin-employee-leaves"] });
      setActionId(null);
      setRemarks("");
      setActionError(null);
    },
    onError: (err: any) => setActionError(extractErr(err)),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, remarks: r }: { id: number; remarks: string }) =>
      api.put(`/leave/applications/${id}/reject`, { remarks: r }).then((res) => res.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-applications-pending"] });
      qc.invalidateQueries({ queryKey: ["leave-applications"] });
      qc.invalidateQueries({ queryKey: ["leave-applications-me"] });
      qc.invalidateQueries({ queryKey: ["admin-employee-leaves"] });
      setActionId(null);
      setRemarks("");
      setActionError(null);
      setRejectTarget(null);
    },
    onError: (err: any) => setActionError(extractErr(err)),
  });

  const applications = data?.data || [];
  const total = Number(data?.meta?.total ?? applications.length);

  useEffect(() => {
    setSelectedIds(new Set());
    setActionId(null);
    setRejectTarget(null);
    setBulkRejectOpen(false);
  }, [
    statusFilter,
    departmentId,
    locationId,
    leaveTypeFilter,
    appliedSearch,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    const visibleIds = new Set(
      (data?.data || []).map((application: any) => Number(application.id)),
    );
    setSelectedIds((previous) => {
      const next = new Set(
        Array.from(previous).filter((id) => visibleIds.has(id)),
      );
      return next.size === previous.size ? previous : next;
    });
    setActionId((previous) =>
      previous !== null && !visibleIds.has(previous) ? null : previous,
    );
    setRejectTarget((previous) =>
      previous !== null && !visibleIds.has(previous.id) ? null : previous,
    );
  }, [data?.data]);

  useEffect(() => {
    if (selectedIds.size === 0) setBulkRejectOpen(false);
  }, [selectedIds.size]);
  const getTypeName = (id: number) => {
    const lt = leaveTypes.find((x) => x.id === id);
    return lt ? leaveTypeLabel(t, lt) : "-";
  };
  const statusLabel = (status: string) => {
    const key =
      status === "pending"
        ? "common.pending"
        : status === "approved"
          ? "common.approved"
          : status === "rejected"
            ? "common.rejected"
            : status === "cancelled"
              ? "common.cancelled"
              : "";
    return key ? t(key) : status;
  };
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === applications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(applications.map((a: any) => a.id)));
    }
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    setBulkResult(null);
    let success = 0;
    let failed = 0;

    const ids = Array.from(selectedIds);
    // BUG-23: the catch used to swallow the error entirely (`catch {}`), so a
    // failed reject/approve showed only "N failed" with no reason and the row
    // silently stayed pending. Capture the first error message so the result
    // banner can tell the user WHY it failed (e.g. a validation error from the
    // server) instead of failing silently.
    let firstError: string | undefined;
    for (const id of ids) {
      try {
        if (action === "approve") {
          await api.put(`/leave/applications/${id}/approve`, { remarks: "" });
        } else {
          await api.put(`/leave/applications/${id}/reject`, { remarks: "" });
        }
        success++;
      } catch (err: any) {
        failed++;
        if (!firstError) firstError = extractErr(err);
      }
    }

    setBulkProcessing(false);
    setBulkResult({ type: action, success, failed, error: firstError });
    setSelectedIds(new Set());
    if (action === "reject") setBulkRejectOpen(false);
    qc.invalidateQueries({ queryKey: ["leave-applications-pending"] });
    qc.invalidateQueries({ queryKey: ["leave-balances"] });
    qc.invalidateQueries({ queryKey: ["leave-applications"] });
    qc.invalidateQueries({ queryKey: ["leave-applications-me"] });
    qc.invalidateQueries({ queryKey: ["my-leave-balance"] });
    qc.invalidateQueries({ queryKey: ["admin-employee-leaves"] });

    // Auto-clear result after 5 seconds
    setTimeout(() => setBulkResult(null), 5000);
  };

  const allSelected = applications.length > 0 && selectedIds.size === applications.length;

  const tabs: { key: typeof statusFilter; label: string }[] = [
    { key: "pending", label: t('common.pending') },
    { key: "approved", label: t('common.approved') },
    { key: "rejected", label: t('common.rejected') },
    { key: "cancelled", label: t('common.cancelled') },
    { key: "all", label: t('common.all') },
  ];

  return (
    <>
    <section className="mb-4 overflow-hidden rounded-xl border border-amber-200/80 bg-card shadow-sm dark:border-amber-900/60">
      <div className="border-b border-amber-100 bg-amber-50/70 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-600 dark:border-amber-900/70 dark:bg-card dark:text-amber-300">
              <Clock aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-5 text-foreground">
                {t('leave.dashboard.pendingTitle')}{" "}
                <span className="tabular-nums">({total})</span>
              </h2>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {t('leave.dashboard.pendingSubtitle')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
          {selectedIds.size > 0 && statusFilter === "pending" && (
            <>
              <span className="text-xs text-muted-foreground">{t('leave.dashboard.selectedCount', { count: selectedIds.size })}</span>
              <button
                type="button"
                onClick={() => handleBulkAction("approve")}
                disabled={bulkProcessing}
                className="rounded-md bg-green-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 disabled:opacity-50"
              >
                {bulkProcessing ? t('leave.dashboard.processing') : t('leave.dashboard.approveSelected')}
              </button>
              <button
                type="button"
                onClick={() => setBulkRejectOpen(true)}
                disabled={bulkProcessing}
                className="rounded-md bg-red-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
              >
                {bulkProcessing ? t('leave.dashboard.processing') : t('leave.dashboard.rejectSelected')}
              </button>
            </>
          )}
            <Link
              to="/leave/applications"
              className="inline-flex min-h-8 items-center gap-0.5 rounded-md px-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100/70 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:text-amber-300 dark:hover:bg-amber-950/50"
            >
              {t('common.viewAll')}
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label={t('leave.dashboard.statusHeader')}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={statusFilter === tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setSelectedIds(new Set());
                setActionId(null);
                setBulkResult(null);
              }}
              className={
                "inline-flex min-h-7 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 " +
                (statusFilter === tab.key
                  ? "bg-[#14213d] text-white shadow-sm"
                  : "border border-amber-100 bg-white text-muted-foreground hover:bg-amber-50 dark:border-amber-900/60 dark:bg-card dark:hover:bg-amber-950/40")
              }
            >
              {tab.label}
              {tab.key === "pending" && statusFilter === "pending" && total > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 text-[9px] tabular-nums">
                  {total}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={showFilters}
            aria-controls="pending-leave-filters"
            onClick={() => setShowFilters((v) => !v)}
            className={
              "inline-flex min-h-7 items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 " +
              (hasExtraFilters
                ? "border-brand-300 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                : "border-amber-200 bg-white text-muted-foreground hover:bg-amber-50 dark:border-amber-900/60 dark:bg-card dark:hover:bg-amber-950/40")
            }
          >
            <Filter aria-hidden="true" className="h-3 w-3" />
            {t('leave.dashboard.filters')}
            {hasExtraFilters && <span aria-hidden="true">·</span>}
          </button>
        </div>
        {showFilters && (
          <div id="pending-leave-filters" className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="pending-employee-search" className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{t("leave.dashboard.searchEmployee", { defaultValue: "Search employee" })}</label>
              <input
                id="pending-employee-search"
                name="pending-employee-search"
                type="text"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("leave.dashboard.employeeSearchPlaceholder", {
                  defaultValue: "Name, email, or code…",
                })}
                className="bg-card text-foreground px-2 py-1.5 border border-border rounded-md text-[11px] w-52"
              />
            </div>
            <div>
              <label htmlFor="pending-department-filter" className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{t("common.department")}</label>
              <select
                id="pending-department-filter"
                name="pending-department-filter"
                value={departmentId ?? ""}
                onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : undefined)}
                className="bg-card text-foreground px-2 py-1.5 border border-border rounded-md text-[11px]"
              >
                <option value="">{t("common.all")}</option>
                {departments.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pending-location-filter" className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{t("leave.dashboard.location", { defaultValue: "Location" })}</label>
              <select
                id="pending-location-filter"
                name="pending-location-filter"
                value={locationId ?? ""}
                onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : undefined)}
                className="bg-card text-foreground px-2 py-1.5 border border-border rounded-md text-[11px]"
              >
                <option value="">{t("common.all")}</option>
                {locations.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pending-leave-type-filter" className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{t("leave.leaveType")}</label>
              <select
                id="pending-leave-type-filter"
                name="pending-leave-type-filter"
                value={leaveTypeFilter ?? ""}
                onChange={(e) => setLeaveTypeFilter(e.target.value ? Number(e.target.value) : undefined)}
                className="bg-card text-foreground px-2 py-1.5 border border-border rounded-md text-[11px]"
              >
                <option value="">{t("common.all")}</option>
                {leaveTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>{leaveTypeLabel(t, lt)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pending-date-from" className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{t("leave.dashboard.from", { defaultValue: "From" })}</label>
              <input
                id="pending-date-from"
                name="pending-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-card text-foreground px-2 py-1.5 border border-border rounded-md text-[11px]"
              />
            </div>
            <div>
              <label htmlFor="pending-date-to" className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">{t("leave.dashboard.to", { defaultValue: "To" })}</label>
              <input
                id="pending-date-to"
                name="pending-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-card text-foreground px-2 py-1.5 border border-border rounded-md text-[11px]"
              />
            </div>
            {hasExtraFilters && (
              <button
                type="button"
                onClick={() => {
                  setDepartmentId(undefined);
                  setLocationId(undefined);
                  setLeaveTypeFilter(undefined);
                  setSearch("");
                  setAppliedSearch("");
                  setDateFrom("");
                  setDateTo("");
                }}
                className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <XIcon aria-hidden="true" className="h-3 w-3" /> {t("leave.dashboard.clearFilters", { defaultValue: "Clear" })}
              </button>
            )}
          </div>
        )}
      </div>

      {bulkResult && (
        <div
          role={bulkResult.failed > 0 ? "alert" : "status"}
          aria-live="polite"
          className={`px-6 py-3 text-sm font-medium ${
          bulkResult.type === "approve" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
        }`}
        >
          {bulkResult.type === "approve"
            ? t('leave.dashboard.bulkApproved', { count: bulkResult.success })
            : t('leave.dashboard.bulkRejected', { count: bulkResult.success })}
          {bulkResult.failed > 0 && ` ${t('leave.dashboard.bulkFailed', { count: bulkResult.failed })}`}
          {bulkResult.error && (
            <span className="block mt-0.5 font-normal text-red-600 dark:text-red-400">{bulkResult.error}</span>
          )}
        </div>
      )}

      {/* #1411 — surface server errors on approve/reject actions */}
      {actionError && (
        <div role="alert" className="flex items-start justify-between gap-3 px-6 py-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm border-t border-red-200">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="rounded-md px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-100 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            {t('leave.dashboard.dismiss')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
      <table className="w-full min-w-[920px]">
        <caption className="sr-only">{t('leave.dashboard.pendingTitle')}</caption>
        <thead className="border-b border-border bg-slate-50/80 dark:bg-muted/50">
          <tr>
            {statusFilter === "pending" && (
              <th className="w-10 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label={t('leave.dashboard.selectAllApplications')}
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-border text-brand-600 dark:text-brand-400 focus:ring-brand-500"
                />
              </th>
            )}
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.employeeHeader')}</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.typeHeader')}</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.datesHeader')}</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.daysHeader')}</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.reasonHeader')}</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.statusHeader')}</th>
            <th className="w-[132px] px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('leave.dashboard.actionsHeader')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading &&
            [1, 2].map((row) => (
              <tr key={row} className="animate-pulse motion-reduce:animate-none">
                {statusFilter === "pending" && <td className="px-3 py-2"><div className="h-4 w-4 rounded bg-muted" /></td>}
                <td className="px-3 py-2"><div className="h-7 w-32 rounded bg-muted" /></td>
                <td className="px-3 py-2"><div className="h-5 w-20 rounded-full bg-muted" /></td>
                <td className="px-3 py-2"><div className="h-4 w-44 rounded bg-muted" /></td>
                <td className="px-3 py-2"><div className="h-4 w-6 rounded bg-muted" /></td>
                <td className="px-3 py-2"><div className="h-4 w-40 rounded bg-muted" /></td>
                <td className="px-3 py-2"><div className="h-5 w-16 rounded-full bg-muted" /></td>
                <td className="px-3 py-2"><div className="ml-auto h-7 w-20 rounded bg-muted" /></td>
              </tr>
            ))}
          {applicationsHasError && !isLoading && (
            <tr>
              <td
                colSpan={statusFilter === "pending" ? 8 : 7}
                className="px-4 py-6 text-center"
              >
                <div role="alert" className="mx-auto max-w-md text-xs text-red-700 dark:text-red-300">
                  <p>
                    {t("leave.dashboard.pendingLoadError", {
                      defaultValue: "Leave requests could not be loaded.",
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchApplications()}
                    className="mt-2 rounded-md border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-900 dark:bg-card dark:text-red-200 dark:hover:bg-red-950/50"
                  >
                    {t("common.retry", { defaultValue: "Retry" })}
                  </button>
                </div>
              </td>
            </tr>
          )}
          {applications.length === 0 && !isLoading && !applicationsHasError && (
            <tr>
              <td colSpan={statusFilter === "pending" ? 8 : 7} className="px-4 py-6 text-center text-xs text-muted-foreground">
                {t('leave.dashboard.noApplications')}
              </td>
            </tr>
          )}
          {!isLoading && !applicationsHasError && applications.map((app: any) => {
            const employeeName = app.user_first_name
              ? (app.user_first_name + " " + (app.user_last_name || "")).trim()
              : t('leave.dashboard.userFallback', { id: app.user_id });
            const employeeRole =
              (typeof app.user_role === "string" && app.user_role) ||
              (currentUser && Number(app.user_id) === Number(currentUser.id)
                ? currentUser.role
                : "");
            const employeeMeta = employeeRole
              ? roleLabel(employeeRole)
              : app.user_emp_code || app.user_email || "—";
            const displayReason = String(app.reason || "—").replace(
              /\s+\((?:org|hr|super)[ _-]?admin\)(?=\s+via\b)/i,
              "",
            );
            const initials = employeeName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part: string) => part[0])
              .join("")
              .toUpperCase();
            const style = STATUS_STYLES[app.status] || STATUS_STYLES.pending;
            const StatusIcon = style.icon;

            return (
            <tr key={app.id} className={`transition-colors hover:bg-muted/40 ${selectedIds.has(app.id) ? "bg-brand-50/50" : ""}`}>
              {statusFilter === "pending" && (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={t('leave.dashboard.selectApplication', { name: employeeName })}
                    checked={selectedIds.has(app.id)}
                    onChange={() => toggleSelect(app.id)}
                    className="rounded border-border text-brand-600 dark:text-brand-400 focus:ring-brand-500"
                  />
                </td>
              )}
              <td className="px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">{employeeName}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {employeeMeta}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  {getTypeName(app.leave_type_id)}
                  {Boolean(app.is_half_day) && (
                    <span className="ml-1 font-medium text-muted-foreground">
                      {t('leave.dashboard.halfSuffix')}
                    </span>
                  )}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                  <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <span>
                    {dateFormatter.format(parseCalendarDate(app.start_date))} &mdash;{" "}
                    {dateFormatter.format(parseCalendarDate(app.end_date))}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2 text-xs font-medium tabular-nums text-muted-foreground">
                {Number(app.days_count)}
              </td>
              <td
                className="max-w-[180px] cursor-help px-3 py-2 text-left align-middle text-xs text-muted-foreground"
                title={displayReason}
              >
                <span className="block truncate">{displayReason}</span>
              </td>
              <td className="px-3 py-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                  <StatusIcon aria-hidden="true" className="h-3 w-3" />
                  {statusLabel(app.status)}
                </span>
              </td>
              <td className="w-[132px] whitespace-nowrap px-3 py-2 text-right">
                {statusFilter === "pending" ? (
                  actionId === app.id ? (
                  <div className="ml-auto flex min-w-[360px] items-center justify-end gap-1.5">
                    <input
                      type="text"
                      name="approval-remarks"
                      autoComplete="off"
                      aria-label={t('leave.dashboard.remarksPlaceholder')}
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder={t('leave.dashboard.remarksPlaceholder')}
                      className="min-w-[120px] flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => approveMut.mutate({ id: app.id, remarks })}
                      disabled={approveMut.isPending}
                      className="rounded bg-green-600 px-2 py-1 text-xs text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 disabled:opacity-50"
                    >
                      {t('leave.approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        rejectMut.reset();
                        setRejectTarget({
                          id: Number(app.id),
                          remarks,
                          employeeName,
                        });
                      }}
                      disabled={rejectMut.isPending}
                      className="rounded bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
                    >
                      {t('leave.reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActionId(null); setRemarks(""); }}
                      className="rounded px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => { setActionId(app.id); setRemarks(""); }}
                      className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-blue-900/60 dark:bg-card dark:text-blue-300 dark:hover:bg-blue-950/40"
                    >
                      {t('leave.dashboard.review')}
                    </button>
                    <Link
                      to="/leave/applications"
                      aria-label={t('leave.dashboard.viewApplication')}
                      title={t('leave.dashboard.viewApplication')}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <MoreVertical aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </div>
                )
                ) : (
                  <Link
                    to="/leave/applications"
                    aria-label={t('leave.dashboard.viewApplication')}
                    title={t('leave.dashboard.viewApplication')}
                    className="inline-flex rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-blue-950/40"
                  >
                    <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </section>
    <ConfirmDialog
      open={rejectTarget !== null}
      title={t("leave.dashboard.rejectConfirmTitle", {
        defaultValue: "Reject leave request?",
      })}
      description={
        rejectMut.isError
          ? extractErr(rejectMut.error)
          : t("leave.dashboard.rejectConfirmDescription", {
              name: rejectTarget?.employeeName ?? "",
              defaultValue:
                "Reject {{name}}'s leave request? This action cannot be undone.",
            })
      }
      confirmText={t("leave.reject", { defaultValue: "Reject" })}
      cancelText={t("common.cancel", { defaultValue: "Cancel" })}
      variant="danger"
      loading={rejectMut.isPending}
      onConfirm={() => {
        if (rejectTarget) {
          rejectMut.mutate({
            id: rejectTarget.id,
            remarks: rejectTarget.remarks,
          });
        }
      }}
      onCancel={() => {
        if (!rejectMut.isPending) {
          setRejectTarget(null);
          rejectMut.reset();
        }
      }}
    />
    <ConfirmDialog
      open={bulkRejectOpen}
      title={t("leave.dashboard.bulkRejectConfirmTitle", {
        defaultValue: "Reject selected leave requests?",
      })}
      description={t("leave.dashboard.bulkRejectConfirmDescription", {
        count: selectedIds.size,
        defaultValue:
          "Reject {{count}} selected leave request(s)? This action cannot be undone.",
      })}
      confirmText={t("leave.dashboard.rejectSelected", {
        defaultValue: "Reject Selected",
      })}
      cancelText={t("common.cancel", { defaultValue: "Cancel" })}
      variant="danger"
      loading={bulkProcessing}
      onConfirm={() => void handleBulkAction("reject")}
      onCancel={() => {
        if (!bulkProcessing) setBulkRejectOpen(false);
      }}
    />
    </>
  );
}
