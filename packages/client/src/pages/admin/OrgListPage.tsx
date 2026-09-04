import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type {
  AdminMoneyAmount,
  AdminOrganizationListItem,
  AdminOrganizationPaymentStatus,
  AdminOrganizationStats,
  AdminOrganizationSubscription,
} from "@empcloud/shared";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
import {
  Building2,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  PlusCircle,
  X,
  Users,
  CalendarClock,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  BadgeDollarSign,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Gauge,
  KeyRound,
  Layers3,
  ShieldCheck,
  Check,
  Loader2,
  Pencil,
} from "lucide-react";

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  GBP: "£",
  EUR: "€",
};

function formatMoney(amount: number, currency: string): string {
  const code = String(currency || "INR").toUpperCase();
  return `${CURRENCY_SYMBOLS[code] || `${code} `}${(Number(amount || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

type SortField = "name" | "created_at" | "user_count" | "subscription_count" | "total_licenses" | "used_licenses";

/** Registration-window presets. "custom" reveals the two date inputs. */
type Period = "all" | "today" | "week" | "month" | "year" | "custom";

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Resolve a preset to a {from,to} date pair (local time, inclusive both ends).
 * Week starts Monday to match the server-side stats (MySQL WEEKDAY()).
 */
function periodRange(p: Period): { from?: string; to?: string } {
  const now = new Date();
  const today = isoDate(now);
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday of this week
      return { from: isoDate(d), to: today };
    }
    case "month":
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: today };
    case "year":
      return { from: `${now.getFullYear()}-01-01`, to: today };
    default:
      return {};
  }
}

/** Shared input/select styling so every filter control matches the table card. */
const FIELD_CLS =
  "bg-card text-foreground rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500";

const TONES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400",
};

const PAYMENT_TONES: Record<AdminOrganizationPaymentStatus, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  unpaid: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  no_invoice: "bg-muted text-muted-foreground",
  not_configured: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
  unavailable: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
};

const SUBSCRIPTION_TONES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  trial: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  past_due: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  suspended: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  deactivated: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function MoneyAmounts({ amounts, empty = "—" }: { amounts: AdminMoneyAmount[]; empty?: string }) {
  if (!amounts.length) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <div className="space-y-0.5">
      {amounts.map((item) => (
        <div key={item.currency} className="whitespace-nowrap font-medium tabular-nums text-foreground">
          {formatMoney(item.amount, item.currency)}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{item.currency}</span>
        </div>
      ))}
    </div>
  );
}

function PaymentBadge({ status }: { status: AdminOrganizationPaymentStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_TONES[status]}`}>
      {humanize(status)}
    </span>
  );
}

function SubscriptionBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SUBSCRIPTION_TONES[status] || "bg-muted text-muted-foreground"}`}>
      {humanize(status)}
    </span>
  );
}

function AccessSwitch({
  label,
  checked,
  stateLabel,
  danger = false,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  stateLabel: string;
  danger?: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${stateLabel}`}
      disabled={disabled}
      onClick={onChange}
      className="group flex w-full min-w-[160px] items-center justify-between gap-3 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60"
    >
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`text-[10px] font-semibold ${
          checked
            ? danger ? "text-red-600 dark:text-red-300" : "text-amber-600 dark:text-amber-300"
            : "text-emerald-600 dark:text-emerald-300"
        }`}>
          {stateLabel}
        </span>
        <span className={`relative h-5 w-9 rounded-full transition-colors ${
          checked
            ? danger ? "bg-red-500" : "bg-amber-500"
            : "bg-slate-300 dark:bg-slate-700"
        }`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`} />
        </span>
      </span>
    </button>
  );
}

function nextRenewal(subscriptions: AdminOrganizationSubscription[]): string | null {
  return subscriptions
    .filter((subscription) =>
      subscription.auto_renew && subscription.status === "active",
    )
    .map((subscription) => subscription.current_period_end)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
}

/**
 * Headline counter. When `onClick` is supplied the card doubles as a filter
 * shortcut (e.g. "Registered Today" applies the today window) and shows a ring
 * while that filter is the active one.
 */
function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value?: number | string;
  tone?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      aria-pressed={clickable ? Boolean(active) : undefined}
      className={`flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors ${
        active ? "border-brand-500 ring-1 ring-brand-500" : "border-border"
      } ${clickable ? "cursor-pointer hover:bg-muted/50" : "cursor-default"}`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONES[tone || "blue"] || TONES.blue}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-foreground">
          {value === undefined || value === null ? "—" : value}
        </p>
      </div>
    </button>
  );
}

export default function OrgListPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  // Filters
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [country, setCountry] = useState("");
  const [hasSub, setHasSub] = useState("");
  const [planTier, setPlanTier] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [expandedOrgId, setExpandedOrgId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    org_name: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    org_country: "IN",
    org_timezone: "Asia/Kolkata",
  });
  const [createError, setCreateError] = useState("");
  const [commentEditor, setCommentEditor] = useState<{
    orgId: number;
    commentId: number | null;
    draft: string;
    original: string;
  } | null>(null);

  const createOrg = useMutation({
    mutationFn: (data: typeof createForm) =>
      api.post("/auth/register", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["admin-org-stats"] });
      setShowCreateModal(false);
      setCreateForm({
        org_name: "",
        email: "",
        first_name: "",
        last_name: "",
        password: "",
        org_country: "IN",
        org_timezone: "Asia/Kolkata",
      });
      setCreateError("");
    },
    onError: (err: any) => {
      setCreateError(
        err?.response?.data?.error?.message || t("orgList.modal.error")
      );
    },
  });

  const saveOrgComment = useMutation({
    mutationFn: ({
      orgId,
      commentId,
      comment,
    }: {
      orgId: number;
      commentId: number | null;
      comment: string;
    }) =>
      commentId == null
        ? api.post(`/admin/organizations/${orgId}/comments`, { comment })
        : api.put(`/admin/organizations/${orgId}/comments/${commentId}`, { comment }),
    onSuccess: (_response, variables) => {
      showToast(
        "success",
        variables.commentId == null
          ? t("orgComments.toast.added", { defaultValue: "Note added" })
          : t("orgComments.toast.updated", { defaultValue: "Note updated" }),
      );
      setCommentEditor(null);
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["admin-org-comments", String(variables.orgId)] });
    },
    onError: (error: any, variables) => {
      showToast(
        "error",
        error?.response?.data?.error?.message
          || (variables.commentId == null
            ? t("orgComments.toast.addFailed", { defaultValue: "Could not add note" })
            : t("orgComments.toast.updateFailed", { defaultValue: "Could not update note" })),
      );
    },
  });

  const updateAccessControls = useMutation({
    mutationFn: ({
      orgId,
      update,
    }: {
      orgId: number;
      update: { login_blocked?: boolean; payment_block_enabled?: boolean };
    }) => api.patch(`/admin/organizations/${orgId}/access-controls`, update),
    onSuccess: (_response, variables) => {
      showToast("success", "Organization access controls updated");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["admin-org-detail", String(variables.orgId)] });
    },
    onError: (error: any) => {
      showToast(
        "error",
        error?.response?.data?.error?.message || "Could not update organization access controls",
      );
    },
  });

  function toggleLoginBlock(org: AdminOrganizationListItem) {
    const nextValue = !org.login_blocked;
    if (
      nextValue
      && !window.confirm(
        `Block every user in ${org.name} from logging in? Existing sessions will be denied on their next request.`,
      )
    ) {
      return;
    }
    updateAccessControls.mutate({
      orgId: org.id,
      update: { login_blocked: nextValue },
    });
  }

  function togglePaymentBlock(org: AdminOrganizationListItem) {
    updateAccessControls.mutate({
      orgId: org.id,
      update: { payment_block_enabled: !org.payment_block_enabled },
    });
  }

  function startCommentEdit(org: AdminOrganizationListItem) {
    if (saveOrgComment.isPending) return;
    const original = org.latest_comment?.comment ?? "";
    setCommentEditor({
      orgId: org.id,
      commentId: org.latest_comment?.id ?? null,
      draft: original,
      original,
    });
  }

  function submitComment() {
    if (!commentEditor || saveOrgComment.isPending) return;
    const comment = commentEditor.draft.trim();
    if (!comment || comment === commentEditor.original.trim()) return;
    saveOrgComment.mutate({
      orgId: commentEditor.orgId,
      commentId: commentEditor.commentId,
      comment,
    });
  }

  // Presets resolve to a date range; "custom" uses the two date inputs.
  const range =
    period === "custom"
      ? { from: customFrom || undefined, to: customTo || undefined }
      : periodRange(period);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "admin-orgs",
      page,
      search,
      sortBy,
      sortOrder,
      status,
      period,
      customFrom,
      customTo,
      country,
      hasSub,
      planTier,
      subscriptionStatus,
      paymentStatus,
    ],
    queryFn: () =>
      api
        .get("/admin/organizations", {
          params: {
            page,
            per_page: 20,
            search: search || undefined,
            sort_by: sortBy,
            sort_order: sortOrder,
            status: status || undefined,
            date_from: range.from,
            date_to: range.to,
            country: country || undefined,
            has_subscription: hasSub || undefined,
            plan_tier: planTier || undefined,
            subscription_status: subscriptionStatus || undefined,
            payment_status: paymentStatus || undefined,
          },
        })
        .then((r) => r.data),
  });

  // Headline counters are platform-wide (not affected by the filters above).
  const { data: statsRes, isError: statsError, refetch: refetchStats } = useQuery({
    queryKey: ["admin-org-stats"],
    queryFn: () => api.get("/admin/organizations/stats").then((r) => r.data),
  });
  const stats = statsRes?.data as AdminOrganizationStats | undefined;
  const paymentCount = (paymentStatusValue: AdminOrganizationPaymentStatus) =>
    (stats?.payment_status_distribution ?? []).find((item) => item.status === paymentStatusValue)
      ?.organization_count ?? 0;

  const orgs = (data?.data || []) as AdminOrganizationListItem[];
  const meta = data?.meta || { page: 1, total_pages: 1, total: 0 };

  const filtersActive = Boolean(
    status ||
      period !== "all" ||
      country ||
      hasSub ||
      planTier ||
      subscriptionStatus ||
      paymentStatus ||
      search,
  );

  /** Every filter change resets to page 1 so you never land on an empty page. */
  function changeFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  function clearFilters() {
    setStatus("");
    setPeriod("all");
    setCustomFrom("");
    setCustomTo("");
    setCountry("");
    setHasSub("");
    setPlanTier("");
    setSubscriptionStatus("");
    setPaymentStatus("");
    setSearch("");
    setSearchInput("");
    setPage(1);
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field)
      return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("orgList.title")}</h1>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {t("orgList.subtitle", { count: meta.total })}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <PlusCircle className="h-4 w-4" /> {t("orgList.createButton")}
          </button>
        </div>
      </div>

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-card rounded-xl shadow-xl w-full max-w-lg mx-4 z-50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{t("orgList.modal.title")}</h2>
              <button
                onClick={() => { setShowCreateModal(false); setCreateError(""); }}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCreateError("");
                createOrg.mutate(createForm);
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.orgName")} *</label>
                <input
                  type="text"
                  value={createForm.org_name}
                  onChange={(e) => setCreateForm({ ...createForm, org_name: e.target.value })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Acme Corp"
                  required
                  minLength={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.firstName")} *</label>
                  <input
                    type="text"
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="John"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.lastName")} *</label>
                  <input
                    type="text"
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.email")} *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="admin@acme.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.password")} *</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder={t("orgList.modal.placeholders.password")}
                  required
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground mt-1">{t("orgList.modal.passwordHint")}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.country")}</label>
                  <input
                    type="text"
                    value={createForm.org_country}
                    onChange={(e) => setCreateForm({ ...createForm, org_country: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="IN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("orgList.modal.fields.timezone")}</label>
                  <input
                    type="text"
                    value={createForm.org_timezone}
                    onChange={(e) => setCreateForm({ ...createForm, org_timezone: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="Asia/Kolkata"
                  />
                </div>
              </div>
              {createError && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300 text-sm rounded-lg px-4 py-3">
                  {createError}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setCreateError(""); }}
                  className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted"
                >
                  {t("orgList.modal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createOrg.isPending}
                  className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4" />
                  {createOrg.isPending ? t("orgList.modal.submitting") : t("orgList.modal.submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(isError || statsError) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <span>Some organization analytics could not be loaded. Existing data may be incomplete.</span>
          <button
            type="button"
            onClick={() => {
              void refetch();
              void refetchStats();
            }}
            className="rounded-lg border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950/60"
          >
            Retry
          </button>
        </div>
      )}

      {/* Platform-wide portfolio counters. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          tone="blue"
          label={t("orgList.stats.total", { defaultValue: "Total Organizations" })}
          value={stats?.total}
          active={!filtersActive}
          onClick={clearFilters}
        />
        <StatCard
          icon={CheckCircle2}
          tone="emerald"
          label={t("orgList.stats.active", { defaultValue: "Active Organizations" })}
          value={stats?.active}
          active={status === "active"}
          onClick={() => changeFilter(() => setStatus(status === "active" ? "" : "active"))}
        />
        <StatCard
          icon={CalendarClock}
          tone="violet"
          label={t("orgList.stats.thisMonth", { defaultValue: "New This Month" })}
          value={stats?.this_month}
          active={period === "month"}
          onClick={() => changeFilter(() => setPeriod(period === "month" ? "all" : "month"))}
        />
        <StatCard
          icon={Layers3}
          tone="amber"
          label={t("orgList.stats.subscribed", { defaultValue: "Subscribed Organizations" })}
          value={stats?.with_subscription}
          active={hasSub === "true"}
          onClick={() => changeFilter(() => setHasSub(hasSub === "true" ? "" : "true"))}
        />
        <StatCard
          icon={Users}
          tone="sky"
          label={t("orgList.stats.totalEmployees", { defaultValue: "Total Employees" })}
          value={stats?.total_users}
        />
        <StatCard
          icon={KeyRound}
          tone="brand"
          label={t("orgList.stats.licenses", { defaultValue: "Licenses Used / Purchased" })}
          value={stats ? `${stats.used_licenses.toLocaleString()} / ${stats.total_licenses.toLocaleString()}` : undefined}
        />
        <StatCard
          icon={ShieldCheck}
          tone="blue"
          label={t("orgList.stats.trials", { defaultValue: "Organizations on Trial" })}
          value={stats?.trial_organizations}
          active={subscriptionStatus === "trial"}
          onClick={() => changeFilter(() => setSubscriptionStatus(subscriptionStatus === "trial" ? "" : "trial"))}
        />
        <StatCard
          icon={AlertTriangle}
          tone="rose"
          label={t("orgList.stats.paymentAttention", { defaultValue: "Payment Attention" })}
          value={stats ? (stats.payment_analytics_available ? stats.payment_attention_organizations : "—") : undefined}
          active={paymentStatus === "attention"}
          onClick={stats?.payment_analytics_available
            ? () => changeFilter(() => setPaymentStatus(paymentStatus === "attention" ? "" : "attention"))
            : undefined}
        />
      </div>

      {/* Portfolio analytics — deliberately currency-safe and lifecycle-aware. */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">License utilization</p>
              <p className="text-xs text-muted-foreground">Across current subscriptions</p>
            </div>
            <Gauge className="h-5 w-5 text-brand-500" />
          </div>
          <div className="mb-2 flex items-end justify-between">
            <span className="text-3xl font-bold text-foreground">{stats?.license_utilization ?? 0}%</span>
            <span className="text-xs text-muted-foreground">
              {(stats?.available_licenses ?? 0).toLocaleString()} available
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${Math.min(100, stats?.license_utilization ?? 0)}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {(stats?.used_licenses ?? 0).toLocaleString()} assigned of {(stats?.total_licenses ?? 0).toLocaleString()} purchased
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Monthly subscription value</p>
              <p className="text-xs text-muted-foreground">Current plans, separated by billing currency</p>
            </div>
            <CircleDollarSign className="h-5 w-5 text-emerald-500" />
          </div>
          <MoneyAmounts amounts={stats?.mrr_by_currency ?? []} empty="No recurring revenue" />
          {stats?.payment_analytics_available ? (
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400">{paymentCount("paid")} paid</span>
              <span className="text-amber-600 dark:text-amber-400">{paymentCount("unpaid")} unpaid</span>
              <span className="text-red-600 dark:text-red-400">{paymentCount("overdue")} overdue</span>
            </div>
          ) : (
            <p className="mt-4 border-t border-border pt-3 text-xs text-purple-600 dark:text-purple-300">
              Payment analytics unavailable
            </p>
          )}
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span>{stats?.free_organizations ?? 0} with free plans</span>
            <span>{stats?.expiring_next_30_days ?? 0} renew within 30 days</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Portfolio mix</p>
              <p className="text-xs text-muted-foreground">Plans and subscription health</p>
            </div>
            <BadgeDollarSign className="h-5 w-5 text-violet-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Plans</p>
              {(stats?.plan_distribution ?? []).slice(0, 5).map((item) => (
                <div key={item.plan_tier} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate capitalize text-foreground">{humanize(item.plan_tier)}</span>
                  <span className="font-semibold tabular-nums text-muted-foreground">{item.organization_count}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</p>
              {(stats?.subscription_status_distribution ?? []).slice(0, 5).map((item) => (
                <div key={item.status} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-foreground">{humanize(item.status)}</span>
                  <span className="font-semibold tabular-nums text-muted-foreground">{item.organization_count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={handleSearch} className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("orgList.filters.search", { defaultValue: "Search" })}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("orgList.search.placeholder")}
                className={`${FIELD_CLS} w-full pl-10`}
              />
            </div>
          </form>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("orgList.filters.registered", { defaultValue: "Registered" })}
            </label>
            <select
              value={period}
              onChange={(e) => changeFilter(() => setPeriod(e.target.value as Period))}
              className={FIELD_CLS}
            >
              <option value="all">{t("orgList.filters.period.all", { defaultValue: "All time" })}</option>
              <option value="today">{t("orgList.filters.period.today", { defaultValue: "Today" })}</option>
              <option value="week">{t("orgList.filters.period.week", { defaultValue: "This week" })}</option>
              <option value="month">{t("orgList.filters.period.month", { defaultValue: "This month" })}</option>
              <option value="year">{t("orgList.filters.period.year", { defaultValue: "This year" })}</option>
              <option value="custom">{t("orgList.filters.period.custom", { defaultValue: "Custom range" })}</option>
            </select>
          </div>

          {period === "custom" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("orgList.filters.from", { defaultValue: "From" })}
                </label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => changeFilter(() => setCustomFrom(e.target.value))}
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("orgList.filters.to", { defaultValue: "To" })}
                </label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => changeFilter(() => setCustomTo(e.target.value))}
                  className={FIELD_CLS}
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("orgList.table.headers.status")}
            </label>
            <select
              value={status}
              onChange={(e) => changeFilter(() => setStatus(e.target.value))}
              className={FIELD_CLS}
            >
              <option value="">{t("orgList.filters.statusAll", { defaultValue: "All statuses" })}</option>
              <option value="active">{t("orgList.status.active")}</option>
              <option value="inactive">{t("orgList.status.inactive")}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("orgList.filters.subscription", { defaultValue: "Subscription" })}
            </label>
            <select
              value={hasSub}
              onChange={(e) => changeFilter(() => setHasSub(e.target.value))}
              className={FIELD_CLS}
            >
              <option value="">{t("orgList.filters.subAll", { defaultValue: "All" })}</option>
              <option value="true">{t("orgList.filters.subWith", { defaultValue: "With subscription" })}</option>
              <option value="false">{t("orgList.filters.subWithout", { defaultValue: "Without subscription" })}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Plan</label>
            <select
              value={planTier}
              onChange={(e) => changeFilter(() => setPlanTier(e.target.value))}
              className={FIELD_CLS}
            >
              <option value="">All plans</option>
              {(stats?.plan_distribution ?? []).map((item) => (
                <option key={item.plan_tier} value={item.plan_tier}>{humanize(item.plan_tier)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Subscription status</label>
            <select
              value={subscriptionStatus}
              onChange={(e) => changeFilter(() => setSubscriptionStatus(e.target.value))}
              className={FIELD_CLS}
            >
              <option value="">All lifecycle states</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="attention">Needs subscription attention</option>
              <option value="past_due">Past due</option>
              <option value="suspended">Suspended</option>
              <option value="deactivated">Deactivated</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Payment status</label>
            <select
              value={paymentStatus}
              onChange={(e) => changeFilter(() => setPaymentStatus(e.target.value))}
              className={FIELD_CLS}
            >
              <option value="">All payment states</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="overdue">Overdue</option>
              <option value="attention">Unpaid or overdue</option>
              <option value="no_invoice">No invoice</option>
              <option value="not_configured">Billing not configured</option>
              <option value="unavailable">Billing unavailable</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("orgList.filters.country", { defaultValue: "Country" })}
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => changeFilter(() => setCountry(e.target.value.toUpperCase().slice(0, 2)))}
              placeholder="IN"
              maxLength={2}
              className={`${FIELD_CLS} w-20`}
            />
          </div>

          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("orgList.filters.clear", { defaultValue: "Clear" })}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 border-2 border-border border-t-gray-500 rounded-full animate-spin" />
              <span className="text-sm">{t("orgList.loading")}</span>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th
                      className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-1.5">
                        {t("orgList.table.headers.organization")}
                        <SortIcon field="name" />
                      </div>
                    </th>
                    <th className="min-w-[280px] px-4 py-3 text-left font-medium text-muted-foreground">
                      {t("orgList.table.headers.comment", { defaultValue: "Comment" })}
                    </th>
                    <th
                      className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("user_count")}
                    >
                      <div className="flex items-center gap-1.5">
                        {t("orgList.table.headers.employees")}
                        <SortIcon field="user_count" />
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("total_licenses")}
                    >
                      <div className="flex items-center gap-1.5">
                        Licenses
                        <SortIcon field="total_licenses" />
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("subscription_count")}
                    >
                      <div className="flex items-center gap-1.5">
                        Plans &amp; Modules
                        <SortIcon field="subscription_count" />
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Monthly Charge</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Payment</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Renewal</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Access &amp; Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org) => {
                    const renewal = nextRenewal(org.subscriptions);
                    const isExpanded = expandedOrgId === org.id;
                    const isEditingComment = commentEditor?.orgId === org.id;
                    const trimmedComment = isEditingComment ? commentEditor.draft.trim() : "";
                    const commentIsUnchanged = isEditingComment
                      ? trimmedComment === commentEditor.original.trim()
                      : true;
                    return (
                      <Fragment key={org.id}>
                        <tr className="border-b border-border align-top transition-colors hover:bg-muted/50">
                          <td className="min-w-[220px] px-4 py-3">
                            <Link
                              to={`/admin/organizations/${org.id}`}
                              className="font-semibold text-foreground transition-colors hover:text-brand-600"
                            >
                              {org.name}
                            </Link>
                            <p className="mt-0.5 max-w-[240px] truncate text-xs text-muted-foreground">
                              {org.email || "No admin email"}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{org.country || "—"}</span>
                              <span>•</span>
                              <span>Joined {new Date(org.created_at).toLocaleDateString()}</span>
                            </div>
                          </td>
                          <td className="min-w-[280px] max-w-[360px] px-4 py-3">
                            {isEditingComment ? (
                              <div className="space-y-2">
                                <textarea
                                  value={commentEditor.draft}
                                  onChange={(event) => setCommentEditor({
                                    ...commentEditor,
                                    draft: event.target.value,
                                  })}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      setCommentEditor(null);
                                    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                                      event.preventDefault();
                                      submitComment();
                                    }
                                  }}
                                  maxLength={5000}
                                  rows={3}
                                  autoFocus
                                  aria-label={t("orgList.table.headers.comment", { defaultValue: "Comment" })}
                                  className="w-full resize-y rounded-lg border border-brand-400 bg-card px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                                />
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setCommentEditor(null)}
                                    disabled={saveOrgComment.isPending}
                                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                    {t("orgComments.cancel", { defaultValue: "Cancel" })}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={submitComment}
                                    disabled={!trimmedComment || commentIsUnchanged || saveOrgComment.isPending}
                                    className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                                  >
                                    {saveOrgComment.isPending ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                    {t("orgComments.save", { defaultValue: "Save" })}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onDoubleClick={() => startCommentEdit(org)}
                                title={org.latest_comment
                                  ? t("orgList.comment.editHint", { defaultValue: "Double-click to edit this comment" })
                                  : t("orgList.comment.addHint", { defaultValue: "Double-click to add a comment" })}
                                className="group flex min-h-12 w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                              >
                                <span className={`min-w-0 flex-1 whitespace-pre-wrap text-xs leading-5 [overflow-wrap:anywhere] ${org.latest_comment ? "line-clamp-3 text-foreground" : "italic text-muted-foreground"}`}>
                                  {org.latest_comment?.comment
                                    || t("orgList.comment.addHint", { defaultValue: "Double-click to add a comment" })}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => startCommentEdit(org)}
                                  aria-label={org.latest_comment
                                    ? `${t("orgComments.editAction", { defaultValue: "Edit" })} ${t("orgList.table.headers.comment", { defaultValue: "comment" })}`
                                    : t("orgComments.add", { defaultValue: "Add note" })}
                                  className="shrink-0 rounded p-1 text-muted-foreground opacity-70 transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 group-hover:opacity-100"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-base font-semibold tabular-nums text-foreground">
                              {org.user_count.toLocaleString()}
                            </span>
                            <p className="text-[11px] text-muted-foreground">employees</p>
                          </td>
                          <td className="min-w-[145px] px-4 py-3">
                            <div className="flex items-baseline gap-1">
                              <span className="font-semibold tabular-nums text-foreground">{org.used_licenses}</span>
                              <span className="text-xs text-muted-foreground">/ {org.total_licenses}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${org.license_utilization > 90 ? "bg-amber-500" : "bg-brand-500"}`}
                                style={{ width: `${Math.min(100, org.license_utilization)}%` }}
                              />
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {org.available_licenses} available • {org.license_utilization}% used
                            </p>
                          </td>
                          <td className="min-w-[180px] px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {org.plans.length ? org.plans.map((plan) => (
                                <span key={plan} className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium capitalize text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                                  {humanize(plan)}
                                </span>
                              )) : <span className="text-xs text-muted-foreground">No plan</span>}
                            </div>
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              {org.active_module_count} current module{org.active_module_count === 1 ? "" : "s"}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {org.subscription_statuses.map((item) => <SubscriptionBadge key={item} status={item} />)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <MoneyAmounts amounts={org.monthly_spend_by_currency} empty="No charge" />
                          </td>
                          <td className="min-w-[145px] px-4 py-3">
                            <PaymentBadge status={org.payment_summary.status} />
                            {org.payment_summary.outstanding_by_currency.length > 0 && (
                              <div className="mt-1.5 text-xs">
                                <MoneyAmounts amounts={org.payment_summary.outstanding_by_currency} />
                                <p className="text-[10px] text-muted-foreground">outstanding</p>
                              </div>
                            )}
                          </td>
                          <td className="min-w-[120px] px-4 py-3 text-xs">
                            {renewal ? (
                              <>
                                <p className="font-medium text-foreground">{new Date(renewal).toLocaleDateString()}</p>
                                <p className="mt-0.5 text-muted-foreground">Next renewal</p>
                              </>
                            ) : (
                              <span className="text-muted-foreground">No renewal</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                  org.status === "active"
                                    ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                                    : "bg-muted text-muted-foreground"
                                }`}>
                                  {humanize(org.status)}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedOrgId(isExpanded ? null : org.id)}
                                    className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${org.name}`}
                                    aria-expanded={isExpanded}
                                  >
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </button>
                                  <Link
                                    to={`/admin/organizations/${org.id}`}
                                    className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/40"
                                    aria-label={`Open ${org.name}`}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Link>
                                </span>
                              </div>
                              <AccessSwitch
                                label="Login"
                                checked={org.login_blocked}
                                stateLabel={org.login_blocked ? "Blocked" : "Allowed"}
                                danger
                                disabled={updateAccessControls.isPending && updateAccessControls.variables?.orgId === org.id}
                                onChange={() => toggleLoginBlock(org)}
                              />
                              <AccessSwitch
                                label="Overdue gate"
                                checked={org.payment_block_enabled}
                                stateLabel={org.payment_block_active ? "Blocking" : org.payment_block_enabled ? "Armed" : "Off"}
                                danger={org.payment_block_active}
                                disabled={updateAccessControls.isPending && updateAccessControls.variables?.orgId === org.id}
                                onChange={() => togglePaymentBlock(org)}
                              />
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="border-b border-border bg-muted/20">
                            <td colSpan={9} className="px-4 py-5">
                              <div className="mb-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                                <div><p className="text-muted-foreground">Contact</p><p className="mt-1 font-medium text-foreground">{org.contact_number || "—"}</p></div>
                                <div><p className="text-muted-foreground">Country</p><p className="mt-1 font-medium text-foreground">{org.country || "—"}</p></div>
                                <div><p className="text-muted-foreground">Timezone</p><p className="mt-1 font-medium text-foreground">{org.timezone || "—"}</p></div>
                                <div><p className="text-muted-foreground">Billing currency</p><p className="mt-1 font-medium text-foreground">{org.currency || "—"}</p></div>
                                <div><p className="text-muted-foreground">Unpaid invoices</p><p className="mt-1 font-medium text-foreground">{org.payment_summary.unpaid_invoice_count}</p></div>
                                <div><p className="text-muted-foreground">Latest invoice</p><p className="mt-1 font-medium text-foreground">{org.payment_summary.latest_invoice?.invoice_number || "—"}</p></div>
                              </div>

                              {org.subscriptions.length > 0 ? (
                                <div className="overflow-x-auto rounded-lg border border-border bg-card">
                                  <table className="w-full text-xs">
                                    <thead className="bg-muted/60 text-muted-foreground">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-medium">Module</th>
                                        <th className="px-3 py-2 text-left font-medium">Plan</th>
                                        <th className="px-3 py-2 text-left font-medium">Licenses</th>
                                        <th className="px-3 py-2 text-left font-medium">Billing</th>
                                        <th className="px-3 py-2 text-left font-medium">Price / seat</th>
                                        <th className="px-3 py-2 text-left font-medium">Monthly charge</th>
                                        <th className="px-3 py-2 text-left font-medium">Subscription</th>
                                        <th className="px-3 py-2 text-left font-medium">Period / renewal</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {org.subscriptions.map((subscription) => (
                                        <tr key={subscription.id} className="border-t border-border">
                                          <td className="px-3 py-3 font-medium text-foreground">{subscription.module_name}</td>
                                          <td className="px-3 py-3 capitalize text-muted-foreground">{humanize(subscription.plan_tier)}</td>
                                          <td className="px-3 py-3 text-muted-foreground">
                                            <span className="font-medium text-foreground">{subscription.used_seats}</span> / {subscription.total_seats}
                                            <span className="ml-1 text-[10px]">({subscription.available_seats} available)</span>
                                          </td>
                                          <td className="px-3 py-3 capitalize text-muted-foreground">{humanize(subscription.billing_cycle)}</td>
                                          <td className="px-3 py-3 text-muted-foreground">{formatMoney(subscription.price_per_seat, subscription.currency)}</td>
                                          <td className="px-3 py-3 font-medium text-foreground">{formatMoney(subscription.monthly_amount, subscription.currency)}</td>
                                          <td className="px-3 py-3"><SubscriptionBadge status={subscription.status} /></td>
                                          <td className="px-3 py-3 text-muted-foreground">
                                            <p>{(subscription.status === "trial" ? subscription.trial_ends_at : subscription.current_period_end)
                                              ? new Date((subscription.status === "trial" ? subscription.trial_ends_at : subscription.current_period_end)!).toLocaleDateString()
                                              : "—"}</p>
                                            <p className="mt-0.5 text-[10px]">
                                              {subscription.status === "trial"
                                                ? "Trial ends"
                                                : subscription.auto_renew ? "Auto-renew on" : "Auto-renew off"}
                                            </p>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-border bg-card py-8 text-center text-sm text-muted-foreground">
                                  This organization has no subscriptions.
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {orgs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted-foreground">
                        {t("orgList.empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta.total_pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  {t("orgList.pagination.summary", {
                    page: meta.page,
                    totalPages: meta.total_pages,
                    total: meta.total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
                    disabled={page >= meta.total_pages}
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
