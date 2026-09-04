import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { AdminOrganizationGroupHeader } from "@/components/admin/AdminOrganizationGroupHeader";
import { AdminTableIconButton } from "@/components/admin/AdminTableIconButton";
import {
  Receipt,
  Search,
  Loader2,
  Send,
  CheckCircle2,
  FileText,
  Plus,
  X,
} from "lucide-react";
import { showToast } from "@/components/ui/Toast";
import { groupOrganizationRows } from "./group-organization-rows";

const toast = {
  success: (m: string) => showToast("success", m),
  error: (m: string) => showToast("error", m),
};

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  issue_date: string;
  due_date: string;
  client_id: string;
  notes?: string;
  empcloud_organization_id: number | null;
  empcloud_organization_name: string | null;
  empcloud_organization_email: string | null;
  empcloud_plans: Array<{
    id: number;
    plan_tier: string;
    status: string;
    module_name: string;
    internal_notes: string | null;
  }>;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  viewed: "bg-cyan-100 text-cyan-700",
  partially_paid: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  paid: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  overdue: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  void: "bg-muted text-muted-foreground line-through",
  written_off: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
};

const SUBSCRIPTION_STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  trial: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  past_due: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  suspended: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  deactivated: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

const moneyFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const ORGANIZATIONS_PER_PAGE = 10;

function fmtMoney(amount: number, currency: string, locale: string) {
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

export default function InvoicesAdminPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  const filters: Record<string, string> = {};
  if (search.trim()) filters.q = search.trim();
  if (status) filters.status = status;

  const listQ = useQuery({
    queryKey: ["admin-billing-invoices", filters],
    queryFn: async () => {
      const firstResponse = await api.get("/admin/billing/invoices", {
        params: { ...filters, page: 1, limit: 200 },
      });
      const firstPage = firstResponse.data?.data ?? {};
      const pageCount = Math.max(1, Number(firstPage.totalPages ?? 1));
      const remainingRows: Invoice[] = [];
      for (let nextPage = 2; nextPage <= pageCount; nextPage += 1) {
        const response = await api.get("/admin/billing/invoices", {
          params: { ...filters, page: nextPage, limit: 200 },
        });
        remainingRows.push(...((response.data?.data?.data ?? []) as Invoice[]));
      }
      return {
        rows: [
          ...((firstPage.data ?? []) as Invoice[]),
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
        key: row.empcloud_organization_id != null
          ? `organization:${row.empcloud_organization_id}`
          : `client:${row.client_id || row.id}`,
        id: row.empcloud_organization_id,
        name: row.empcloud_organization_name,
        email: row.empcloud_organization_email,
      })).map((group) => ({
        ...group,
        clientId: group.rows[0]?.client_id ?? null,
        plans: Array.from(
          new Map(
            group.rows
              .flatMap((invoice) => invoice.empcloud_plans ?? [])
              .map((plan) => [plan.id, plan] as const),
          ).values(),
        ),
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

  // ---- Mark-paid modal ----
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payMethod, setPayMethod] = useState("manual");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const markPaid = useMutation({
    mutationFn: () =>
      api
        .post(`/admin/billing/invoices/${payTarget!.id}/mark-paid`, {
          payment_method: payMethod,
          reference: payRef,
          notes: payNotes,
        })
        .then((r) => r.data),
    onSuccess: () => {
      toast.success(t("invoicesAdmin.toast.markPaidSuccess"));
      setPayTarget(null);
      setPayMethod("manual");
      setPayRef("");
      setPayNotes("");
      qc.invalidateQueries({ queryKey: ["admin-billing-invoices"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error?.message || t("invoicesAdmin.toast.genericError")),
  });

  // ---- Send-email ----
  const sendEmail = useMutation({
    mutationFn: (id: string) =>
      api.post(`/admin/billing/invoices/${id}/send`).then((r) => r.data),
    onSuccess: () => {
      toast.success(t("invoicesAdmin.toast.sendEmailSuccess"));
      qc.invalidateQueries({ queryKey: ["admin-billing-invoices"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error?.message || t("invoicesAdmin.toast.genericError")),
  });

  // ---- View PDF ----
  // The PDF endpoint requires the Bearer token, so a plain <a href> (which the
  // browser fetches without our auth header) 401s. Fetch it through the axios
  // client as a blob, then open the object URL in a new tab.
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const openPdf = async (id: string) => {
    // Open the tab synchronously (inside the click gesture) so popup blockers
    // don't kill it after the await.
    const win = window.open("about:blank", "_blank");
    setPdfLoadingId(id);
    try {
      const res = await api.get(`/admin/billing/invoices/${id}/pdf`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      if (win) win.location.href = url;
      else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (win) win.close();
      toast.error(t("invoicesAdmin.toast.pdfError"));
    } finally {
      setPdfLoadingId(null);
    }
  };

  // ---- Subscribe-on-behalf modal ----
  const [subOpen, setSubOpen] = useState(false);
  const [subForm, setSubForm] = useState({
    organization_id: "",
    module_id: "",
    plan_tier: "basic",
    total_seats: 1,
    billing_cycle: "monthly",
    trial_days: 0,
  });

  // Org + module dropdowns. /admin/organizations uses sendPaginated → orgs
  // sit at top-level `.data` (NOT `.data.data` — that mistake leaves the
  // dropdown empty even when the server returned 200+ orgs).
  const orgsQ = useQuery({
    queryKey: ["admin-org-list-for-subscribe"],
    queryFn: () =>
      api
        .get("/admin/organizations", { params: { per_page: 500 } })
        .then((r) => r.data),
    enabled: subOpen,
  });
  const modulesQ = useQuery({
    queryKey: ["admin-modules-for-subscribe"],
    queryFn: () => api.get("/modules").then((r) => r.data),
    enabled: subOpen,
  });

  const orgs: Array<{ id: number; name: string; email: string }> =
    orgsQ.data?.data ?? [];
  const modules = modulesQ.data?.data ?? [];

  // Typeahead state for the org picker. The select element with 200+
  // options was unusable; this gives a search-as-you-type combobox.
  const [orgSearch, setOrgSearch] = useState("");
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const filteredOrgs = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) =>
        (o.name || "").toLowerCase().includes(q) ||
        (o.email || "").toLowerCase().includes(q),
    );
  }, [orgs, orgSearch]);

  const subscribe = useMutation({
    mutationFn: () =>
      api
        .post(`/admin/billing/subscribe-on-behalf`, {
          organization_id: Number(subForm.organization_id),
          module_id: Number(subForm.module_id),
          plan_tier: subForm.plan_tier,
          total_seats: Number(subForm.total_seats),
          billing_cycle: subForm.billing_cycle,
          trial_days: Number(subForm.trial_days) || 0,
        })
        .then((r) => r.data),
    onSuccess: () => {
      toast.success(t("invoicesAdmin.toast.subscribeSuccess"));
      setSubOpen(false);
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["admin-billing-invoices"] });
      }, 800);
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.error?.message ||
          t("invoicesAdmin.toast.subscribeError"),
      ),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-pretty text-2xl font-bold text-foreground dark:text-gray-100">
            <Receipt className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            {t("invoicesAdmin.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">
            {t("invoicesAdmin.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSubForm({
              organization_id: "",
              module_id: "",
              plan_tier: "basic",
              total_seats: 1,
              billing_cycle: "monthly",
              trial_days: 0,
            });
            setOrgSearch("");
            setOrgDropdownOpen(false);
            setSubOpen(true);
          }}
          className="flex touch-manipulation items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {t("invoicesAdmin.subscribeOnBehalf")}
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="invoice-search" className="mb-1 block text-xs font-medium text-muted-foreground">{t("invoicesAdmin.filters.searchLabel")}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="invoice-search"
                name="invoice_search"
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={t("invoicesAdmin.filters.searchPlaceholder")}
                className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="invoice-status" className="mb-1 block text-xs font-medium text-muted-foreground">{t("invoicesAdmin.filters.statusLabel")}</label>
            <select
              id="invoice-status"
              name="invoice_status"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">{t("invoicesAdmin.status.all")}</option>
              <option value="draft">{t("invoicesAdmin.status.draft")}</option>
              <option value="sent">{t("invoicesAdmin.status.sent")}</option>
              <option value="viewed">{t("invoicesAdmin.status.viewed")}</option>
              <option value="partially_paid">{t("invoicesAdmin.status.partially_paid")}</option>
              <option value="paid">{t("invoicesAdmin.status.paid")}</option>
              <option value="overdue">{t("invoicesAdmin.status.overdue")}</option>
              <option value="void">{t("invoicesAdmin.status.void")}</option>
              <option value="written_off">{t("invoicesAdmin.status.written_off")}</option>
            </select>
          </div>
          <div className="ml-auto rounded-full bg-muted px-3 py-1.5 text-sm font-medium tabular-nums text-muted-foreground">
            {t("invoicesAdmin.invoiceCount", { count: total })}
          </div>
        </div>
      </div>

      {/* Organization groups */}
      <div className="overflow-hidden rounded-xl border border-border bg-card dark:border-gray-700 dark:bg-gray-900">
        {listQ.isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> {t("invoicesAdmin.loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t("invoicesAdmin.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] table-fixed text-sm">
              <caption className="sr-only">{t("invoicesAdmin.title")}</caption>
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[11%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[17%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead className="border-b border-border bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground dark:bg-gray-800/70">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">{t("invoicesAdmin.table.invoice")}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{t("invoicesAdmin.table.status")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t("invoicesAdmin.table.total")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t("invoicesAdmin.table.due")}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{t("invoicesAdmin.table.issued")}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t("invoicesAdmin.table.actions")}</th>
                </tr>
              </thead>
              {organizationGroups.map((group) => {
                const plansWithComments = group.plans.filter((plan) => plan.internal_notes?.trim());

                return (
                  <tbody key={group.key} className="border-t-4 border-muted first:border-t-0 dark:border-gray-800">
                    <tr>
                      <th colSpan={6} scope="rowgroup" className="bg-muted/35 px-4 py-3 text-left font-normal dark:bg-gray-800/45">
                        <AdminOrganizationGroupHeader
                          name={group.name || t("invoicesAdmin.group.unmappedClient")}
                          organizationId={group.id}
                          email={group.email || group.clientId || t("invoicesAdmin.group.noClientDetails")}
                          countLabel={t("invoicesAdmin.invoiceCount", { count: group.rows.length })}
                        />
                      </th>
                    </tr>
                    <tr className="border-t border-border/70 bg-muted/10 dark:border-gray-800">
                      <td colSpan={6} className="px-4 py-2.5">
                        <div className="grid gap-x-6 gap-y-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
                          <div className="min-w-0">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("invoicesAdmin.table.plan")}
                            </p>
                            {group.plans.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {group.plans.map((plan) => (
                                  <span key={plan.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] shadow-sm">
                                    <span className="max-w-52 truncate font-medium text-foreground">{plan.module_name}</span>
                                    <span className="text-border" aria-hidden="true">/</span>
                                    <span className="capitalize text-brand-700 dark:text-brand-300">{plan.plan_tier.replace(/_/g, " ")}</span>
                                    <span className={`rounded px-1.5 py-0.5 font-medium capitalize ${SUBSCRIPTION_STATUS_COLOR[plan.status] || "bg-muted text-muted-foreground"}`}>
                                      {t(`subscriptionsAdmin.status.${plan.status}`, {
                                        defaultValue: plan.status.replace(/_/g, " "),
                                      })}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{t("invoicesAdmin.table.noPlan")}</span>
                            )}
                          </div>
                          <div className="min-w-0 xl:border-l xl:border-border xl:pl-6 dark:xl:border-gray-800">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("invoicesAdmin.table.internalComment")}
                            </p>
                            {plansWithComments.length ? (
                              <div className="grid min-w-0 gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                                {plansWithComments.map((plan) => (
                                  <div key={plan.id} className="min-w-0 rounded-md bg-card px-2 py-1.5 ring-1 ring-inset ring-border">
                                    <p className="text-[10px] font-semibold text-muted-foreground">{plan.module_name}</p>
                                    <p className="max-w-full whitespace-pre-wrap text-xs leading-4 text-foreground [overflow-wrap:anywhere]">
                                      {plan.internal_notes}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{t("invoicesAdmin.table.noInternalComment")}</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {group.rows.map((r) => (
                      <tr key={r.id} className="border-t border-border/70 align-middle transition-colors hover:bg-muted/25 dark:border-gray-800">
                        <td className="px-4 py-2.5 font-mono text-xs font-medium text-foreground">{r.invoice_number}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${STATUS_COLOR[r.status] || "bg-muted text-muted-foreground"}`}>
                            {t(`invoicesAdmin.status.${r.status}`, { defaultValue: r.status })}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                          {fmtMoney(Number(r.total), r.currency, locale)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                          {fmtMoney(Number(r.amount_due), r.currency, locale)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {fmtDate(r.issue_date, locale)}
                          {r.due_date && r.due_date !== r.issue_date ? (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {t("invoicesAdmin.table.dueDatePrefix")} {fmtDate(r.due_date, locale)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <div className="flex justify-end gap-0.5" role="group" aria-label={`${r.invoice_number} ${t("invoicesAdmin.table.actions")}`}>
                            {Number(r.amount_due) > 0 && r.status !== "void" && r.status !== "paid" ? (
                              <AdminTableIconButton
                                label={t("invoicesAdmin.actions.markPaid")}
                                onClick={() => setPayTarget(r)}
                                className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                              >
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                              </AdminTableIconButton>
                            ) : null}
                            <AdminTableIconButton
                              label={t("invoicesAdmin.actions.sendEmail")}
                              onClick={() => sendEmail.mutate(r.id)}
                              className="text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40"
                            >
                              <Send className="h-4 w-4" aria-hidden="true" />
                            </AdminTableIconButton>
                            <AdminTableIconButton
                              label={t("invoicesAdmin.actions.pdf")}
                              onClick={() => openPdf(r.id)}
                              disabled={pdfLoadingId === r.id}
                            >
                              {pdfLoadingId === r.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <FileText className="h-4 w-4" aria-hidden="true" />
                              )}
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
            {t("invoicesAdmin.pagination.prev")}
          </button>
          <span className="text-sm tabular-nums text-muted-foreground">{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="touch-manipulation rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-40"
          >
            {t("invoicesAdmin.pagination.next")}
          </button>
        </div>
      )}

      {/* Mark Paid Modal */}
      {payTarget && (
        <Modal title={t("invoicesAdmin.markPaid.title")} onClose={() => (markPaid.isPending ? null : setPayTarget(null))}>
          <p className="text-sm text-muted-foreground mb-3">
            Records a payment for the full outstanding amount{" "}
            <strong>{fmtMoney(Number(payTarget.amount_due), payTarget.currency, locale)}</strong> against{" "}
            <strong>{payTarget.invoice_number}</strong>. emp-billing will flip the status to paid
            and notify the customer (if email is configured).
          </p>
          <Field label={t("invoicesAdmin.markPaid.methodLabel")}>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="input"
            >
              <option value="manual">{t("invoicesAdmin.markPaid.method.manual")}</option>
              <option value="bank_transfer">{t("invoicesAdmin.markPaid.method.bank_transfer")}</option>
              <option value="cheque">{t("invoicesAdmin.markPaid.method.cheque")}</option>
              <option value="upi">{t("invoicesAdmin.markPaid.method.upi")}</option>
              <option value="card">{t("invoicesAdmin.markPaid.method.card")}</option>
              <option value="other">{t("invoicesAdmin.markPaid.method.other")}</option>
            </select>
          </Field>
          <Field label={t("invoicesAdmin.markPaid.referenceLabel")}>
            <input
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="input"
              placeholder={t("invoicesAdmin.markPaid.referencePlaceholder")}
            />
          </Field>
          <Field label={t("invoicesAdmin.markPaid.notesLabel")}>
            <textarea
              rows={2}
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              className="input"
              placeholder={t("invoicesAdmin.markPaid.notesPlaceholder")}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3">
            <button
              onClick={() => setPayTarget(null)}
              disabled={markPaid.isPending}
              className="btn-outline"
            >
              {t("invoicesAdmin.markPaid.cancel")}
            </button>
            <button
              onClick={() => markPaid.mutate()}
              disabled={markPaid.isPending}
              className="btn-primary"
            >
              {markPaid.isPending ? t("invoicesAdmin.markPaid.recording") : t("invoicesAdmin.markPaid.submit")}
            </button>
          </div>
        </Modal>
      )}

      {/* Subscribe on behalf Modal */}
      {subOpen && (
        <Modal title={t("invoicesAdmin.subscribe.title")} onClose={() => (subscribe.isPending ? null : setSubOpen(false))} wide>
          <p className="text-sm text-muted-foreground mb-3">
            {t("invoicesAdmin.subscribe.description")}
          </p>
          <Field label={t("invoicesAdmin.subscribe.orgLabel")}>
            <div className="relative">
              <input
                type="text"
                value={orgSearch}
                onChange={(e) => {
                  setOrgSearch(e.target.value);
                  setOrgDropdownOpen(true);
                  if (subForm.organization_id) {
                    setSubForm({ ...subForm, organization_id: "" });
                  }
                }}
                onFocus={() => setOrgDropdownOpen(true)}
                onBlur={() => setTimeout(() => setOrgDropdownOpen(false), 150)}
                placeholder={
                  orgsQ.isLoading
                    ? t("invoicesAdmin.subscribe.orgLoadingPlaceholder")
                    : orgs.length
                      ? t("invoicesAdmin.subscribe.orgSearchPlaceholder", { count: orgs.length })
                      : t("invoicesAdmin.subscribe.orgNonePlaceholder")
                }
                className="input"
                autoComplete="off"
              />
              {orgDropdownOpen && (orgsQ.isLoading || filteredOrgs.length > 0 || orgSearch.trim()) && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  {orgsQ.isLoading && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">{t("invoicesAdmin.subscribe.orgDropdownLoading")}</div>
                  )}
                  {!orgsQ.isLoading && filteredOrgs.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {t("invoicesAdmin.subscribe.orgNoMatches")}
                    </div>
                  )}
                  {!orgsQ.isLoading &&
                    filteredOrgs.slice(0, 50).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSubForm({ ...subForm, organization_id: String(o.id) });
                          setOrgSearch(`${o.name} (${o.email})`);
                          setOrgDropdownOpen(false);
                        }}
                        className={`block w-full text-left px-3 py-2 text-sm hover:bg-brand-50 dark:hover:bg-gray-800 ${
                          String(subForm.organization_id) === String(o.id)
                            ? "bg-brand-50 dark:bg-gray-800"
                            : ""
                        }`}
                      >
                        <div className="font-medium text-foreground dark:text-gray-100">
                          {o.name}
                        </div>
                        <div className="text-xs text-muted-foreground">{o.email}</div>
                      </button>
                    ))}
                  {filteredOrgs.length > 50 && (
                    <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground dark:border-gray-800">
                      {t("invoicesAdmin.subscribe.orgMoreResults", { count: filteredOrgs.length - 50 })}
                    </div>
                  )}
                </div>
              )}
            </div>
            {subForm.organization_id && (
              <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                ✓ {t("invoicesAdmin.subscribe.orgSelected", { orgId: subForm.organization_id })}
              </div>
            )}
          </Field>
          <Field label={t("invoicesAdmin.subscribe.moduleLabel")}>
            <select
              value={subForm.module_id}
              onChange={(e) => setSubForm({ ...subForm, module_id: e.target.value })}
              className="input"
            >
              <option value="">{t("invoicesAdmin.subscribe.modulePlaceholder")}</option>
              {modules.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("invoicesAdmin.subscribe.planTierLabel")}>
              <input
                value={subForm.plan_tier}
                onChange={(e) => setSubForm({ ...subForm, plan_tier: e.target.value })}
                className="input"
                placeholder={t("invoicesAdmin.subscribe.planTierPlaceholder")}
              />
            </Field>
            <Field label={t("invoicesAdmin.subscribe.totalSeatsLabel")}>
              <input
                type="number"
                min={1}
                value={subForm.total_seats}
                onChange={(e) => setSubForm({ ...subForm, total_seats: Number(e.target.value) })}
                className="input"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("invoicesAdmin.subscribe.billingCycleLabel")}>
              <select
                value={subForm.billing_cycle}
                onChange={(e) => setSubForm({ ...subForm, billing_cycle: e.target.value })}
                className="input"
              >
                <option value="monthly">{t("invoicesAdmin.subscribe.cycle.monthly")}</option>
                <option value="quarterly">{t("invoicesAdmin.subscribe.cycle.quarterly")}</option>
                <option value="annual">{t("invoicesAdmin.subscribe.cycle.annual")}</option>
              </select>
            </Field>
            <Field label={t("invoicesAdmin.subscribe.trialDaysLabel")}>
              <input
                type="number"
                min={0}
                value={subForm.trial_days}
                onChange={(e) => setSubForm({ ...subForm, trial_days: Number(e.target.value) })}
                className="input"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button onClick={() => setSubOpen(false)} disabled={subscribe.isPending} className="btn-outline">
              {t("invoicesAdmin.subscribe.cancel")}
            </button>
            <button
              onClick={() => subscribe.mutate()}
              disabled={
                subscribe.isPending ||
                !subForm.organization_id ||
                !subForm.module_id ||
                !subForm.plan_tier
              }
              className="btn-primary"
            >
              {subscribe.isPending ? t("invoicesAdmin.subscribe.creating") : t("invoicesAdmin.subscribe.submit")}
            </button>
          </div>
        </Modal>
      )}

      <style>{`
        .input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; font-size: 0.875rem; background: white; }
        .input:focus { outline: none; border-color: #3b82f6; }
        .btn-primary { background: #2563eb; color: white; padding: 0.5rem 0.875rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 500; }
        .btn-primary:hover { background: #1d4ed8; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-outline { background: white; color: #374151; padding: 0.5rem 0.875rem; border-radius: 0.5rem; font-size: 0.875rem; border: 1px solid #e5e7eb; }
        .btn-outline:hover { background: #f9fafb; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} my-8 rounded-xl bg-card p-6 shadow-xl dark:bg-gray-900`}>
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
