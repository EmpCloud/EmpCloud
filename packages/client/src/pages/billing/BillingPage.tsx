import { useState } from "react";
import { useBillingInvoices, useBillingPayments, useBillingOverviewSummary, useSubscriptions, useModules } from "@/api/hooks";
import {
  Receipt,
  CreditCard,
  DollarSign,
  FileText,
  Download,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Calendar,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatINR(amountInPaise: number): string {
  const val = amountInPaise / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(val);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const statusColors: Record<string, string> = {
  paid: "bg-green-50 text-green-700",
  sent: "bg-blue-50 text-blue-700",
  overdue: "bg-red-50 text-red-700",
  draft: "bg-gray-100 text-gray-600",
  void: "bg-gray-100 text-gray-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[status] || "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab constants
// ---------------------------------------------------------------------------

const TABS = [
  { id: "overview", label: "Overview", icon: DollarSign },
  { id: "invoices", label: "Invoices", icon: Receipt },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "subscriptions", label: "Subscription Details", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-gray-500 mt-1">
          Manage invoices, payments, and subscription billing.
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6 -mb-px">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "invoices" && <InvoicesTab />}
      {activeTab === "payments" && <PaymentsTab />}
      {activeTab === "subscriptions" && <SubscriptionDetailsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab() {
  const { data: summary, isLoading } = useBillingOverviewSummary();

  if (isLoading) {
    return <div className="text-gray-400">Loading billing overview...</div>;
  }

  if (!summary) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <AlertCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No billing data available yet.</p>
      </div>
    );
  }

  const paymentStatus =
    (summary.overdueCount ?? 0) > 0
      ? "overdue"
      : (summary.outstandingAmount ?? 0) > 0
        ? "past due"
        : "all paid";

  const paymentStatusColor =
    paymentStatus === "overdue"
      ? "bg-red-50 text-red-700"
      : paymentStatus === "past due"
        ? "bg-yellow-50 text-yellow-700"
        : "bg-green-50 text-green-700";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Outstanding Balance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-red-600" />
          </div>
          <p className="text-sm text-gray-500">Outstanding Balance</p>
        </div>
        <p className="text-3xl font-bold text-gray-900">
          {formatINR(summary.outstandingAmount ?? 0)}
        </p>
      </div>

      {/* Next Invoice Date */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-sm text-gray-500">Next Invoice Date</p>
        </div>
        <p className="text-2xl font-bold text-gray-900">
          {summary.nextInvoiceDate ? formatDate(summary.nextInvoiceDate) : "N/A"}
        </p>
      </div>

      {/* Monthly Recurring Cost */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-brand-600" />
          </div>
          <p className="text-sm text-gray-500">Monthly Recurring</p>
        </div>
        <p className="text-3xl font-bold text-gray-900">
          {formatINR(summary.monthlyRecurring ?? 0)}
        </p>
      </div>

      {/* Payment Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-sm text-gray-500">Payment Status</p>
        </div>
        <span className={`text-sm px-3 py-1 rounded-full font-semibold capitalize ${paymentStatusColor}`}>
          {paymentStatus}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoices Tab
// ---------------------------------------------------------------------------

function InvoicesTab() {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useBillingInvoices({ page, per_page: 10 });

  const invoices = data?.data ?? [];
  const meta = data?.meta;

  if (isLoading) return <div className="text-gray-400">Loading invoices...</div>;

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Receipt className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No invoices yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-8" />
              <th className="text-left px-4 py-3 font-medium text-gray-500">Invoice #</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Due Date</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Amount</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv: any) => {
              const isExpanded = expandedId === inv.id;
              return (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedId(isExpanded ? null : inv.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.total_pages} ({meta.total} invoices)
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= meta.total_pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceRow({
  invoice,
  isExpanded,
  onToggle,
}: {
  invoice: any;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3">
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-600">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-4 py-3 font-medium text-gray-900">{invoice.invoiceNumber}</td>
        <td className="px-4 py-3 text-gray-600">{formatDate(invoice.issueDate)}</td>
        <td className="px-4 py-3 text-gray-600">{formatDate(invoice.dueDate)}</td>
        <td className="px-4 py-3 text-right font-medium text-gray-900">
          {formatINR(invoice.amount)}
        </td>
        <td className="px-4 py-3 text-center">
          <StatusBadge status={invoice.status} />
        </td>
        <td className="px-4 py-3 text-right">
          <button
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
        </td>
      </tr>
      {isExpanded && invoice.items?.length > 0 && (
        <tr>
          <td colSpan={7} className="bg-gray-50 px-8 py-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left pb-2 font-medium">Item</th>
                  <th className="text-right pb-2 font-medium">Qty</th>
                  <th className="text-right pb-2 font-medium">Rate</th>
                  <th className="text-right pb-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item: any, idx: number) => (
                  <tr key={idx} className="border-t border-gray-200">
                    <td className="py-1.5 text-gray-700">{item.name}</td>
                    <td className="py-1.5 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-1.5 text-right text-gray-600">{formatINR(item.rate)}</td>
                    <td className="py-1.5 text-right font-medium text-gray-900">
                      {formatINR(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Payments Tab
// ---------------------------------------------------------------------------

function PaymentsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useBillingPayments({ page, per_page: 10 });

  const payments = data?.data ?? [];
  const meta = data?.meta;

  if (isLoading) return <div className="text-gray-400">Loading payments...</div>;

  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <CreditCard className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No payments recorded yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Method</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Reference</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p: any) => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-600">{formatDate(p.date)}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {formatINR(p.amount)}
                </td>
                <td className="px-4 py-3 text-gray-600 capitalize">{p.method}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.reference}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{p.invoiceId || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.total_pages} ({meta.total} payments)
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= meta.total_pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscription Details Tab
// ---------------------------------------------------------------------------

function SubscriptionDetailsTab() {
  const { data: subscriptions, isLoading } = useSubscriptions();
  const { data: modules } = useModules();

  const moduleMap = new Map(modules?.map((m: any) => [m.id, m]) || []);

  if (isLoading) return <div className="text-gray-400">Loading subscriptions...</div>;

  const activeSubs =
    subscriptions?.filter((s: any) => s.status === "active" || s.status === "trial") || [];

  if (activeSubs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No active subscriptions.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {activeSubs.map((sub: any) => {
        const mod = moduleMap.get(sub.module_id) as any;
        const pricePerSeat = Number(sub.price_per_seat) || 0;
        const monthlyCost = pricePerSeat * sub.total_seats;

        return (
          <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{mod?.name || "Module"}</h3>
                  <p className="text-xs text-gray-400 capitalize">{sub.plan_tier} plan</p>
                </div>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  sub.status === "active"
                    ? "bg-green-50 text-green-700"
                    : "bg-yellow-50 text-yellow-700"
                }`}
              >
                {sub.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <p className="text-xs text-gray-500">Seats (used / total)</p>
                <p className="font-medium text-gray-900">
                  {sub.used_seats} / {sub.total_seats}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Price per Seat</p>
                <p className="font-medium text-gray-900">{formatINR(pricePerSeat)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Monthly Cost</p>
                <p className="font-medium text-gray-900">{formatINR(monthlyCost)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Billing Cycle</p>
                <p className="font-medium text-gray-900 capitalize">{sub.billing_cycle}</p>
              </div>
            </div>

            {sub.current_period_end && (
              <p className="text-xs text-gray-500 mb-4">
                Next renewal: {formatDate(sub.current_period_end)}
              </p>
            )}

            <div className="flex gap-2 border-t border-gray-100 pt-4">
              <button
                disabled
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 cursor-not-allowed"
              >
                Change Plan
              </button>
              <button
                disabled
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-400 cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
