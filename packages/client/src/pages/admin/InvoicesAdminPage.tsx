import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  Receipt,
  Search,
  Loader2,
  Send,
  CheckCircle2,
  FileText,
  Plus,
  Building2,
  X,
} from "lucide-react";
import { showToast } from "@/components/ui/Toast";

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
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-cyan-100 text-cyan-700",
  partially_paid: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-500 line-through",
  written_off: "bg-purple-100 text-purple-700",
};

const CURRENCY_SYMBOL: Record<string, string> = {
  INR: "₹",
  USD: "$",
  GBP: "£",
  EUR: "€",
};

function fmtMoney(amount: number, currency: string) {
  const sym = CURRENCY_SYMBOL[currency] || currency;
  return `${sym}${(amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default function InvoicesAdminPage() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  const params: Record<string, any> = { page, limit: 25 };
  if (search.trim()) params.q = search.trim();
  if (status) params.status = status;

  const listQ = useQuery({
    queryKey: ["admin-billing-invoices", params],
    queryFn: () => api.get("/admin/billing/invoices", { params }).then((r) => r.data),
  });

  const rows: Invoice[] = listQ.data?.data?.data ?? [];
  const total = Number(listQ.data?.data?.total ?? 0);
  const totalPages = Number(listQ.data?.data?.totalPages ?? 1);

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
      toast.success("Invoice marked paid");
      setPayTarget(null);
      setPayMethod("manual");
      setPayRef("");
      setPayNotes("");
      qc.invalidateQueries({ queryKey: ["admin-billing-invoices"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Failed"),
  });

  // ---- Send-email ----
  const sendEmail = useMutation({
    mutationFn: (id: string) =>
      api.post(`/admin/billing/invoices/${id}/send`).then((r) => r.data),
    onSuccess: () => {
      toast.success("Invoice email queued");
      qc.invalidateQueries({ queryKey: ["admin-billing-invoices"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || "Failed"),
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
      toast.error("Failed to load invoice PDF");
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
      toast.success("Subscription created; invoice will appear in a moment");
      setSubOpen(false);
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["admin-billing-invoices"] });
      }, 800);
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.error?.message ||
          "Failed to create subscription. Check the org is valid and emp-billing is running.",
      ),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-brand-600" />
            Invoices
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            All invoices across all customer orgs (proxied from emp-billing). Mark paid,
            send by email, view PDF, or create a subscription on behalf of any org.
          </p>
        </div>
        <button
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
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Subscribe on behalf
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-xs font-medium text-gray-600">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Invoice number, org name…"
                className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="partially_paid">Partially paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="void">Void</option>
              <option value="written_off">Written off</option>
            </select>
          </div>
          <div className="ml-auto text-sm text-gray-500">{total} invoice(s)</div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {listQ.isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No invoices match.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left">Invoice</th>
                <th className="px-3 py-2 text-left">Org</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Due</th>
                <th className="px-3 py-2 text-left">Issued</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs">{r.invoice_number}</td>
                  <td className="px-3 py-2">
                    {r.empcloud_organization_name ? (
                      <div>
                        <div className="font-medium flex items-center gap-1 text-gray-900 dark:text-gray-100">
                          <Building2 className="h-3.5 w-3.5 text-gray-400" />
                          {r.empcloud_organization_name}
                        </div>
                        <div className="text-xs text-gray-500">{r.empcloud_organization_email}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 font-mono">
                        {r.client_id ? `${r.client_id.slice(0, 8)}…` : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status] || "bg-gray-100 text-gray-600"}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtMoney(Number(r.total), r.currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtMoney(Number(r.amount_due), r.currency)}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                    {fmtDate(r.issue_date)}
                    {r.due_date && r.due_date !== r.issue_date && (
                      <div className="text-gray-400">due {fmtDate(r.due_date)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {Number(r.amount_due) > 0 && r.status !== "void" && r.status !== "paid" && (
                        <button
                          onClick={() => setPayTarget(r)}
                          className="text-emerald-600 hover:text-emerald-800"
                          title="Mark paid"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => sendEmail.mutate(r.id)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Send email"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openPdf(r.id)}
                        disabled={pdfLoadingId === r.id}
                        className="text-gray-500 hover:text-gray-700 disabled:opacity-40"
                        title="PDF"
                      >
                        {pdfLoadingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-gray-200 px-3 py-1 text-sm disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-gray-200 px-3 py-1 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* Mark Paid Modal */}
      {payTarget && (
        <Modal title="Mark invoice paid" onClose={() => (markPaid.isPending ? null : setPayTarget(null))}>
          <p className="text-sm text-gray-600 mb-3">
            Records a payment for the full outstanding amount{" "}
            <strong>{fmtMoney(Number(payTarget.amount_due), payTarget.currency)}</strong> against{" "}
            <strong>{payTarget.invoice_number}</strong>. emp-billing will flip the status to paid
            and notify the customer (if email is configured).
          </p>
          <Field label="Payment method">
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="input"
            >
              <option value="manual">Manual / Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Reference (txn id, cheque #, etc.)">
            <input
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="input"
              placeholder="e.g. TXN-2026-04-XYZ"
            />
          </Field>
          <Field label="Notes (internal)">
            <textarea
              rows={2}
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              className="input"
              placeholder="Optional"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3">
            <button
              onClick={() => setPayTarget(null)}
              disabled={markPaid.isPending}
              className="btn-outline"
            >
              Cancel
            </button>
            <button
              onClick={() => markPaid.mutate()}
              disabled={markPaid.isPending}
              className="btn-primary"
            >
              {markPaid.isPending ? "Recording…" : "Record payment"}
            </button>
          </div>
        </Modal>
      )}

      {/* Subscribe on behalf Modal */}
      {subOpen && (
        <Modal title="Subscribe an org on behalf" onClose={() => (subscribe.isPending ? null : setSubOpen(false))} wide>
          <p className="text-sm text-gray-600 mb-3">
            Creates the subscription in EmpCloud, which fires the standard webhook to
            emp-billing — client, plan and the first invoice are provisioned automatically.
          </p>
          <Field label="Organization">
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
                    ? "Loading organizations…"
                    : orgs.length
                      ? `Type to search ${orgs.length} organizations…`
                      : "No organizations available"
                }
                className="input"
                autoComplete="off"
              />
              {orgDropdownOpen && (orgsQ.isLoading || filteredOrgs.length > 0 || orgSearch.trim()) && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  {orgsQ.isLoading && (
                    <div className="px-3 py-2 text-sm text-gray-400">Loading…</div>
                  )}
                  {!orgsQ.isLoading && filteredOrgs.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-400">
                      No matching organizations
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
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {o.name}
                        </div>
                        <div className="text-xs text-gray-500">{o.email}</div>
                      </button>
                    ))}
                  {filteredOrgs.length > 50 && (
                    <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400 dark:border-gray-800">
                      {filteredOrgs.length - 50} more — refine search to narrow
                    </div>
                  )}
                </div>
              )}
            </div>
            {subForm.organization_id && (
              <div className="mt-1 text-xs text-emerald-600">
                ✓ Selected (org id {subForm.organization_id})
              </div>
            )}
          </Field>
          <Field label="Module">
            <select
              value={subForm.module_id}
              onChange={(e) => setSubForm({ ...subForm, module_id: e.target.value })}
              className="input"
            >
              <option value="">— Pick a module —</option>
              {modules.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan tier">
              <input
                value={subForm.plan_tier}
                onChange={(e) => setSubForm({ ...subForm, plan_tier: e.target.value })}
                className="input"
                placeholder="basic / professional / enterprise / custom"
              />
            </Field>
            <Field label="Total seats">
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
            <Field label="Billing cycle">
              <select
                value={subForm.billing_cycle}
                onChange={(e) => setSubForm({ ...subForm, billing_cycle: e.target.value })}
                className="input"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </Field>
            <Field label="Trial days (0 = bill immediately)">
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
              Cancel
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
              {subscribe.isPending ? "Creating…" : "Create subscription"}
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
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
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
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} my-8 rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
