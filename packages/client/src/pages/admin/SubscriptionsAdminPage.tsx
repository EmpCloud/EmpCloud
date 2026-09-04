import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
import { AdminOrganizationGroupHeader } from "@/components/admin/AdminOrganizationGroupHeader";
import { AdminTableIconButton } from "@/components/admin/AdminTableIconButton";
const toast = { success: (m: string) => showToast("success", m), error: (m: string) => showToast("error", m) };
import {
  Pencil,
  Pause,
  Play,
  XCircle,
  Gift,
  Receipt,
  Search,
  Loader2,
  X,
  CreditCard,
} from "lucide-react";
import { groupOrganizationRows } from "./group-organization-rows";

// Subscriptions Admin
// -------------------
// Super-admin-only page that lists every org_subscription and gives the
// admin full edit power on each row:
//   - Change tier, status, currency, seats, billing cycle
//   - Edit start/end dates, trial end, auto-renew
//   - Set price_per_seat manually (any field edit marks manually_overridden)
//   - Mark a subscription as Free / comped (records reason)
//   - Suspend / Activate / Cancel with one click
//   - Record a manual invoice intent (note for the billing engine)

type Subscription = {
  id: number;
  organization_id: number;
  organization_name: string;
  organization_email: string;
  organization_country: string | null;
  module_id: number;
  module_slug: string;
  module_name: string;
  plan_tier: string;
  status: string;
  total_seats: number;
  used_seats: number;
  billing_cycle: string;
  price_per_seat: number;
  currency: string;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  cancelled_at: string | null;
  auto_renew: boolean | number;
  is_free: boolean | number;
  free_reason: string | null;
  manually_overridden: boolean | number;
  internal_notes: string | null;
  dunning_stage: string | null;
  created_at: string;
  updated_at: string;
};

const STATUSES = ["trial", "active", "past_due", "suspended", "cancelled", "expired"] as const;
const BILLING_CYCLES = ["monthly", "quarterly", "annual"] as const;
const CURRENCIES = ["INR", "USD", "GBP", "EUR"] as const;

const STATUS_COLOR: Record<string, string> = {
  trial: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  active: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  past_due: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  suspended: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

const moneyFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const ORGANIZATIONS_PER_PAGE = 10;

function fmtPrice(amount: number, currency: string, locale: string) {
  const key = `${locale}:${currency}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(key, formatter);
  }
  return formatter.format(amount / 100);
}

function fmtDate(d: string | null | undefined, locale: string) {
  if (!d) return "—";
  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale);
    dateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(d));
}

export default function SubscriptionsAdminPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [page, setPage] = useState(1);

  const filters: Record<string, string> = {};
  if (search.trim()) filters.q = search.trim();
  if (status) filters.status = status;
  if (currency) filters.currency = currency;

  const listQ = useQuery({
    queryKey: ["admin-subs-list", filters],
    queryFn: async () => {
      const firstResponse = await api.get("/admin/subscriptions/list", {
        params: { ...filters, page: 1, limit: 200 },
      });
      const firstPage = firstResponse.data?.data ?? {};
      const pageCount = Math.max(1, Number(firstPage.totalPages ?? 1));
      const remainingRows: Subscription[] = [];
      for (let nextPage = 2; nextPage <= pageCount; nextPage += 1) {
        const response = await api.get("/admin/subscriptions/list", {
          params: { ...filters, page: nextPage, limit: 200 },
        });
        remainingRows.push(...((response.data?.data?.data ?? []) as Subscription[]));
      }
      return {
        rows: [
          ...((firstPage.data ?? []) as Subscription[]),
          ...remainingRows,
        ],
        total: Number(firstPage.total ?? 0),
      };
    },
  });

  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const allOrganizationGroups = useMemo(
    () =>
      groupOrganizationRows(rows, (row) => ({
        key: `organization:${row.organization_id}`,
        id: row.organization_id,
        name: row.organization_name,
        email: row.organization_email,
      })),
    [rows],
  );
  const totalPages = Math.max(1, Math.ceil(allOrganizationGroups.length / ORGANIZATIONS_PER_PAGE));
  const organizationGroups = useMemo(
    () => allOrganizationGroups.slice(
      (page - 1) * ORGANIZATIONS_PER_PAGE,
      page * ORGANIZATIONS_PER_PAGE,
    ),
    [allOrganizationGroups, page],
  );

  // -------- Edit modal --------
  const [editRow, setEditRow] = useState<Subscription | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  function openEdit(r: Subscription) {
    setEditRow(r);
    setEditForm({
      plan_tier: r.plan_tier,
      status: r.status,
      total_seats: r.total_seats,
      billing_cycle: r.billing_cycle,
      price_per_seat_major: String(r.price_per_seat / 100),
      currency: r.currency,
      trial_ends_at: r.trial_ends_at ? r.trial_ends_at.slice(0, 10) : "",
      current_period_start: r.current_period_start ? r.current_period_start.slice(0, 10) : "",
      current_period_end: r.current_period_end ? r.current_period_end.slice(0, 10) : "",
      auto_renew: !!r.auto_renew,
      is_free: !!r.is_free,
      free_reason: r.free_reason || "",
      internal_notes: r.internal_notes || "",
    });
  }

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editRow) return null;
      const body: any = {
        plan_tier: editForm.plan_tier,
        status: editForm.status,
        total_seats: Number(editForm.total_seats),
        billing_cycle: editForm.billing_cycle,
        price_per_seat: Math.round(Number(editForm.price_per_seat_major) * 100),
        currency: editForm.currency,
        trial_ends_at: editForm.trial_ends_at || null,
        current_period_start: editForm.current_period_start || undefined,
        current_period_end: editForm.current_period_end || undefined,
        auto_renew: !!editForm.auto_renew,
        is_free: !!editForm.is_free,
        free_reason: editForm.is_free ? (editForm.free_reason || "") : null,
        internal_notes: editForm.internal_notes || null,
      };
      return api
        .put(`/admin/subscriptions/detail/${editRow.id}`, body)
        .then((r) => r.data);
    },
    onSuccess: () => {
      toast.success(t("subscriptionsAdmin.toast.updated"));
      setEditRow(null);
      qc.invalidateQueries({ queryKey: ["admin-subs-list"] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || err?.message || t("subscriptionsAdmin.toast.failed")),
  });

  // -------- Quick actions --------
  function postAction(id: number, action: string, body?: any) {
    return api
      .post(`/admin/subscriptions/detail/${id}/${action}`, body || {})
      .then((r) => r.data);
  }

  const suspend = useMutation({
    mutationFn: (id: number) => postAction(id, "suspend"),
    onSuccess: () => {
      toast.success(t("subscriptionsAdmin.toast.suspended"));
      qc.invalidateQueries({ queryKey: ["admin-subs-list"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("subscriptionsAdmin.toast.failed")),
  });
  const activate = useMutation({
    mutationFn: (id: number) => postAction(id, "activate"),
    onSuccess: () => {
      toast.success(t("subscriptionsAdmin.toast.activated"));
      qc.invalidateQueries({ queryKey: ["admin-subs-list"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("subscriptionsAdmin.toast.failed")),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => postAction(id, "cancel"),
    onSuccess: () => {
      toast.success(t("subscriptionsAdmin.toast.cancelled"));
      qc.invalidateQueries({ queryKey: ["admin-subs-list"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("subscriptionsAdmin.toast.failed")),
  });

  // -------- Free / comp modal --------
  const [freeRow, setFreeRow] = useState<Subscription | null>(null);
  const [freeReason, setFreeReason] = useState("");
  const makeFree = useMutation({
    mutationFn: () => postAction(freeRow!.id, "free", { reason: freeReason }),
    onSuccess: () => {
      toast.success(t("subscriptionsAdmin.toast.markedFree"));
      setFreeRow(null);
      setFreeReason("");
      qc.invalidateQueries({ queryKey: ["admin-subs-list"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("subscriptionsAdmin.toast.failed")),
  });
  const unmakeFree = useMutation({
    mutationFn: (id: number) => postAction(id, "unfree"),
    onSuccess: () => {
      toast.success(t("subscriptionsAdmin.toast.unmarkedFree"));
      qc.invalidateQueries({ queryKey: ["admin-subs-list"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("subscriptionsAdmin.toast.failed")),
  });

  // -------- Manual invoice modal --------
  const [invRow, setInvRow] = useState<Subscription | null>(null);
  const [invForm, setInvForm] = useState({ amount: "", description: "", due_date: "" });
  const recordInvoice = useMutation({
    mutationFn: () =>
      postAction(invRow!.id, "manual-invoice", {
        amount: Math.round(Number(invForm.amount) * 100),
        description: invForm.description,
        due_date: invForm.due_date || undefined,
      }),
    onSuccess: () => {
      toast.success(t("subscriptionsAdmin.toast.manualInvoiceRecorded"));
      setInvRow(null);
      setInvForm({ amount: "", description: "", due_date: "" });
      qc.invalidateQueries({ queryKey: ["admin-subs-list"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("subscriptionsAdmin.toast.failed")),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-pretty text-2xl font-bold text-foreground dark:text-gray-100">{t("subscriptionsAdmin.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">
          {t("subscriptionsAdmin.subtitle")}
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="subscription-org-search" className="mb-1 block text-xs font-medium text-muted-foreground">{t("subscriptionsAdmin.filters.searchOrg.label")}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="subscription-org-search"
                name="subscription_org_search"
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t("subscriptionsAdmin.filters.searchOrg.placeholder")}
                className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="subscription-status" className="mb-1 block text-xs font-medium text-muted-foreground">{t("subscriptionsAdmin.filters.status.label")}</label>
            <select
              id="subscription-status"
              name="subscription_status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">{t("subscriptionsAdmin.filters.all")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`subscriptionsAdmin.status.${s}`, { defaultValue: s })}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="subscription-currency" className="mb-1 block text-xs font-medium text-muted-foreground">{t("subscriptionsAdmin.filters.currency.label")}</label>
            <select
              id="subscription-currency"
              name="subscription_currency"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">{t("subscriptionsAdmin.filters.all")}</option>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="ml-auto rounded-full bg-muted px-3 py-1.5 text-sm font-medium tabular-nums text-muted-foreground">
            {t("subscriptionsAdmin.count.subscriptions", { count: total })}
          </div>
        </div>
      </div>

      {/* Organization groups */}
      <div className="overflow-hidden rounded-xl border border-border bg-card dark:border-gray-700 dark:bg-gray-900">
        {listQ.isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> {t("subscriptionsAdmin.loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t("subscriptionsAdmin.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] table-fixed text-sm">
              <caption className="sr-only">{t("subscriptionsAdmin.title")}</caption>
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
                <col className="w-[7%]" />
                <col className="w-[12%]" />
                <col className="w-[19%]" />
                <col className="w-[8%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead className="border-b border-border bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground dark:bg-gray-800/70">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">{t("subscriptionsAdmin.table.columns.module")}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{t("subscriptionsAdmin.table.columns.tier")}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{t("subscriptionsAdmin.table.columns.status")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t("subscriptionsAdmin.table.columns.seats")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t("subscriptionsAdmin.table.columns.pricePerSeat")}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{t("subscriptionsAdmin.table.columns.period")}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{t("subscriptionsAdmin.table.columns.flags")}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t("subscriptionsAdmin.table.columns.actions")}</th>
                </tr>
              </thead>
              {organizationGroups.map((group) => {
                const country = group.rows[0]?.organization_country;

                return (
                  <tbody key={group.key} className="border-t-4 border-muted first:border-t-0 dark:border-gray-800">
                    <tr>
                      <th colSpan={8} scope="rowgroup" className="bg-muted/35 px-4 py-3 text-left font-normal dark:bg-gray-800/45">
                        <AdminOrganizationGroupHeader
                          name={group.name || ""}
                          organizationId={group.id}
                          email={group.email}
                          meta={country}
                          countLabel={t("subscriptionsAdmin.count.subscriptions", { count: group.rows.length })}
                        />
                      </th>
                    </tr>
                    {group.rows.map((r) => (
                      <tr key={r.id} className="border-t border-border/70 align-middle transition-colors hover:bg-muted/25 dark:border-gray-800">
                        <td className="px-4 py-2.5 font-medium text-foreground">{r.module_name}</td>
                        <td className="px-3 py-2.5 capitalize text-muted-foreground">{r.plan_tier.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${STATUS_COLOR[r.status] || "bg-muted text-muted-foreground"}`}>
                            {t(`subscriptionsAdmin.status.${r.status}`, { defaultValue: r.status })}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                          {r.used_seats}/{r.total_seats}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                          {fmtPrice(r.price_per_seat, r.currency, locale)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          <div className="whitespace-nowrap">{fmtDate(r.current_period_start, locale)} → {fmtDate(r.current_period_end, locale)}</div>
                          {r.trial_ends_at ? (
                            <div className="mt-0.5 text-blue-600 dark:text-blue-400">
                              {t("subscriptionsAdmin.period.trialEnds", { date: fmtDate(r.trial_ends_at, locale) })}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex flex-wrap justify-center gap-1">
                            {Number(r.is_free) ? (
                              <span className="rounded-md bg-pink-100 px-1.5 py-0.5 text-[10px] font-medium text-pink-700 dark:bg-pink-950/40 dark:text-pink-300" title={r.free_reason || ""}>{t("subscriptionsAdmin.badges.free")}</span>
                            ) : null}
                            {Number(r.manually_overridden) ? (
                              <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">{t("subscriptionsAdmin.badges.manual")}</span>
                            ) : null}
                            {Number(r.auto_renew) ? null : (
                              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t("subscriptionsAdmin.badges.noRenew")}</span>
                            )}
                            {!Number(r.is_free) && !Number(r.manually_overridden) && Number(r.auto_renew) ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <div className="flex justify-end gap-0.5" role="group" aria-label={`${r.module_name} ${t("subscriptionsAdmin.table.columns.actions")}`}>
                            <AdminTableIconButton label={t("subscriptionsAdmin.actions.edit")} onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </AdminTableIconButton>
                            {r.status === "active" || r.status === "trial" ? (
                              <AdminTableIconButton
                                label={t("subscriptionsAdmin.actions.suspend")}
                                onClick={() => {
                                  if (window.confirm(t("subscriptionsAdmin.confirm.suspend", { org: r.organization_name, module: r.module_name })))
                                    suspend.mutate(r.id);
                                }}
                                className="text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-950/40"
                              >
                                <Pause className="h-4 w-4" aria-hidden="true" />
                              </AdminTableIconButton>
                            ) : (
                              <AdminTableIconButton
                                label={t("subscriptionsAdmin.actions.activate")}
                                onClick={() => activate.mutate(r.id)}
                                className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
                              >
                                <Play className="h-4 w-4" aria-hidden="true" />
                              </AdminTableIconButton>
                            )}
                            <AdminTableIconButton
                              label={t("subscriptionsAdmin.actions.cancel")}
                              onClick={() => {
                                if (window.confirm(t("subscriptionsAdmin.confirm.cancel", { org: r.organization_name, module: r.module_name })))
                                  cancel.mutate(r.id);
                              }}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                            >
                              <XCircle className="h-4 w-4" aria-hidden="true" />
                            </AdminTableIconButton>
                            {Number(r.is_free) ? (
                              <AdminTableIconButton
                                label={t("subscriptionsAdmin.actions.removeFreeFlag")}
                                onClick={() => {
                                  if (window.confirm(t("subscriptionsAdmin.confirm.removeFree")))
                                    unmakeFree.mutate(r.id);
                                }}
                                className="text-pink-600 hover:bg-pink-50 hover:text-pink-700 dark:hover:bg-pink-950/40"
                              >
                                <Gift className="h-4 w-4" aria-hidden="true" />
                              </AdminTableIconButton>
                            ) : (
                              <AdminTableIconButton
                                label={t("subscriptionsAdmin.actions.markFree")}
                                onClick={() => {
                                  setFreeRow(r);
                                  setFreeReason("");
                                }}
                                className="hover:bg-pink-50 hover:text-pink-700 dark:hover:bg-pink-950/40"
                              >
                                <Gift className="h-4 w-4" aria-hidden="true" />
                              </AdminTableIconButton>
                            )}
                            <AdminTableIconButton
                              label={t("subscriptionsAdmin.actions.recordManualInvoice")}
                              onClick={() => {
                                setInvRow(r);
                                setInvForm({ amount: "", description: "", due_date: "" });
                              }}
                              className="hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/40"
                            >
                              <Receipt className="h-4 w-4" aria-hidden="true" />
                            </AdminTableIconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="touch-manipulation rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-40"
          >
            {t("subscriptionsAdmin.pagination.prev")}
          </button>
          <span className="text-sm tabular-nums text-muted-foreground">{t("subscriptionsAdmin.pagination.pageOf", { page, totalPages })}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="touch-manipulation rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-40"
          >
            {t("subscriptionsAdmin.pagination.next")}
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editRow && (
        <BigModal
          title={t("subscriptionsAdmin.editModal.title", { org: editRow.organization_name, module: editRow.module_name })}
          onClose={() => (saveEdit.isPending ? null : setEditRow(null))}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("subscriptionsAdmin.editModal.fields.planTier")}>
              <input
                value={editForm.plan_tier}
                onChange={(e) => setEditForm({ ...editForm, plan_tier: e.target.value })}
                className="input"
              />
            </Field>
            <Field label={t("subscriptionsAdmin.editModal.fields.status")}>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="input"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{t(`subscriptionsAdmin.status.${s}`, { defaultValue: s })}</option>)}
              </select>
            </Field>
            <Field label={t("subscriptionsAdmin.editModal.fields.totalSeats")}>
              <input
                type="number"
                min={0}
                value={editForm.total_seats}
                onChange={(e) => setEditForm({ ...editForm, total_seats: Number(e.target.value) })}
                className="input"
              />
            </Field>
            <Field label={t("subscriptionsAdmin.editModal.fields.billingCycle")}>
              <select
                value={editForm.billing_cycle}
                onChange={(e) => setEditForm({ ...editForm, billing_cycle: e.target.value })}
                className="input"
              >
                {BILLING_CYCLES.map((c) => <option key={c} value={c}>{t(`subscriptionsAdmin.billingCycle.${c}`, { defaultValue: c })}</option>)}
              </select>
            </Field>
            <Field label={t("subscriptionsAdmin.editModal.fields.pricePerSeat")}>
              <input
                type="number"
                step="0.01"
                min={0}
                value={editForm.price_per_seat_major}
                onChange={(e) => setEditForm({ ...editForm, price_per_seat_major: e.target.value })}
                className="input font-mono"
              />
            </Field>
            <Field label={t("subscriptionsAdmin.editModal.fields.currency")}>
              <select
                value={editForm.currency}
                onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                className="input"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={t("subscriptionsAdmin.editModal.fields.periodStart")}>
              <input
                type="date"
                value={editForm.current_period_start}
                onChange={(e) => setEditForm({ ...editForm, current_period_start: e.target.value })}
                className="input"
              />
            </Field>
            <Field label={t("subscriptionsAdmin.editModal.fields.periodEnd")}>
              <input
                type="date"
                value={editForm.current_period_end}
                onChange={(e) => setEditForm({ ...editForm, current_period_end: e.target.value })}
                className="input"
              />
            </Field>
            <Field label={t("subscriptionsAdmin.editModal.fields.trialEnds")}>
              <input
                type="date"
                value={editForm.trial_ends_at}
                onChange={(e) => setEditForm({ ...editForm, trial_ends_at: e.target.value })}
                className="input"
              />
            </Field>
            <Field label={t("subscriptionsAdmin.editModal.fields.autoRenew")}>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!editForm.auto_renew}
                  onChange={(e) => setEditForm({ ...editForm, auto_renew: e.target.checked })}
                />
                {t("subscriptionsAdmin.editModal.autoRenewYes")}
              </label>
            </Field>
            <Field label={t("subscriptionsAdmin.editModal.fields.freeComp")}>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!editForm.is_free}
                  onChange={(e) => setEditForm({ ...editForm, is_free: e.target.checked })}
                />
                {t("subscriptionsAdmin.editModal.compedLabel")}
              </label>
            </Field>
            {editForm.is_free && (
              <Field label={t("subscriptionsAdmin.editModal.fields.freeReason")} full>
                <input
                  value={editForm.free_reason}
                  onChange={(e) => setEditForm({ ...editForm, free_reason: e.target.value })}
                  placeholder={t("subscriptionsAdmin.editModal.freeReasonPlaceholder")}
                  className="input"
                />
              </Field>
            )}
            <Field label={t("subscriptionsAdmin.editModal.fields.internalNotes")} full>
              <textarea
                rows={3}
                value={editForm.internal_notes}
                onChange={(e) => setEditForm({ ...editForm, internal_notes: e.target.value })}
                placeholder={t("subscriptionsAdmin.editModal.internalNotesPlaceholder")}
                className="input"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={() => setEditRow(null)} disabled={saveEdit.isPending} className="btn-outline">
              {t("subscriptionsAdmin.editModal.cancel")}
            </button>
            <button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending} className="btn-primary">
              {saveEdit.isPending ? t("subscriptionsAdmin.editModal.saving") : t("subscriptionsAdmin.editModal.save")}
            </button>
          </div>
        </BigModal>
      )}

      {/* Free modal */}
      {freeRow && (
        <BigModal
          title={t("subscriptionsAdmin.freeModal.title", { org: freeRow.organization_name, module: freeRow.module_name })}
          onClose={() => (makeFree.isPending ? null : setFreeRow(null))}
          small
        >
          <p className="text-sm text-muted-foreground mb-3">
            {t("subscriptionsAdmin.freeModal.description")}
          </p>
          <input
            value={freeReason}
            onChange={(e) => setFreeReason(e.target.value)}
            placeholder={t("subscriptionsAdmin.freeModal.reasonPlaceholder")}
            className="input mb-3"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setFreeRow(null)} disabled={makeFree.isPending} className="btn-outline">{t("subscriptionsAdmin.freeModal.cancel")}</button>
            <button
              onClick={() => makeFree.mutate()}
              disabled={makeFree.isPending || !freeReason.trim()}
              className="btn-primary"
            >
              {makeFree.isPending ? t("subscriptionsAdmin.freeModal.saving") : t("subscriptionsAdmin.freeModal.confirm")}
            </button>
          </div>
        </BigModal>
      )}

      {/* Manual invoice modal */}
      {invRow && (
        <BigModal
          title={t("subscriptionsAdmin.invoiceModal.title", { org: invRow.organization_name, module: invRow.module_name })}
          onClose={() => (recordInvoice.isPending ? null : setInvRow(null))}
          small
        >
          <p className="text-sm text-muted-foreground mb-3 flex items-start gap-2">
            <CreditCard className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              {t("subscriptionsAdmin.invoiceModal.description")}
            </span>
          </p>
          <Field label={t("subscriptionsAdmin.invoiceModal.amountLabel", { currency: invRow.currency })}>
            <input
              type="number"
              step="0.01"
              value={invForm.amount}
              onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })}
              className="input font-mono"
            />
          </Field>
          <Field label={t("subscriptionsAdmin.invoiceModal.descriptionLabel")}>
            <input
              value={invForm.description}
              onChange={(e) => setInvForm({ ...invForm, description: e.target.value })}
              placeholder={t("subscriptionsAdmin.invoiceModal.descriptionPlaceholder")}
              className="input"
            />
          </Field>
          <Field label={t("subscriptionsAdmin.invoiceModal.dueDateLabel")}>
            <input
              type="date"
              value={invForm.due_date}
              onChange={(e) => setInvForm({ ...invForm, due_date: e.target.value })}
              className="input"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3">
            <button onClick={() => setInvRow(null)} disabled={recordInvoice.isPending} className="btn-outline">{t("subscriptionsAdmin.invoiceModal.cancel")}</button>
            <button
              onClick={() => recordInvoice.mutate()}
              disabled={recordInvoice.isPending || !invForm.amount}
              className="btn-primary"
            >
              {recordInvoice.isPending ? t("subscriptionsAdmin.invoiceModal.saving") : t("subscriptionsAdmin.invoiceModal.confirm")}
            </button>
          </div>
        </BigModal>
      )}

      {/* Inline styles for repeated form classes */}
      <style>{`
        .input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; font-size: 0.875rem; background: white; }
        .input:focus { outline: none; border-color: #3b82f6; }
        .btn-primary { background: #2563eb; color: white; padding: 0.5rem 0.875rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 500; }
        .btn-primary:hover { background: #1d4ed8; }
        .btn-primary:disabled { opacity: 0.5; }
        .btn-outline { background: white; color: #374151; padding: 0.5rem 0.875rem; border-radius: 0.5rem; font-size: 0.875rem; border: 1px solid #e5e7eb; }
        .btn-outline:hover { background: #f9fafb; }
      `}</style>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function BigModal({
  title,
  onClose,
  children,
  small,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className={`w-full ${small ? "max-w-md" : "max-w-3xl"} my-8 rounded-xl bg-card p-6 shadow-xl dark:bg-gray-900`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
