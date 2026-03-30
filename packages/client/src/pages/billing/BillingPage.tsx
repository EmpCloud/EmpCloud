import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/lib/auth-store";
import {
  useBillingInvoices,
  useBillingPayments,
  useBillingOverviewSummary,
  useSubscriptions,
  useBillingSummary,
  useModules,
  useUpdateSubscription,
  useCancelSubscription,
} from "@/api/hooks";
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
  Pencil,
  Trash2,
  X,
  Check,
  Users,
  TrendingUp,
  Wallet,
  UserPlus,
  Target,
  Award,
  UserMinus,
  Monitor,
  MapPin,
  Fingerprint,
  FolderKanban,
  GraduationCap,
  Package,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Module icon & color mapping
// ---------------------------------------------------------------------------

const moduleIcons: Record<string, any> = {
  "emp-payroll": Wallet,
  "emp-recruit": UserPlus,
  "emp-performance": Target,
  "emp-rewards": Award,
  "emp-exit": UserMinus,
  "emp-monitor": Monitor,
  "emp-field": MapPin,
  "emp-biometrics": Fingerprint,
  "emp-projects": FolderKanban,
  "emp-lms": GraduationCap,
  "emp-billing": Receipt,
};

const moduleColors: Record<string, { bg: string; text: string }> = {
  "emp-payroll":     { bg: "bg-emerald-50",  text: "text-emerald-600" },
  "emp-recruit":     { bg: "bg-blue-50",     text: "text-blue-600" },
  "emp-performance": { bg: "bg-orange-50",   text: "text-orange-600" },
  "emp-rewards":     { bg: "bg-yellow-50",   text: "text-yellow-600" },
  "emp-exit":        { bg: "bg-red-50",      text: "text-red-600" },
  "emp-monitor":     { bg: "bg-purple-50",   text: "text-purple-600" },
  "emp-field":       { bg: "bg-teal-50",     text: "text-teal-600" },
  "emp-biometrics":  { bg: "bg-pink-50",     text: "text-pink-600" },
  "emp-projects":    { bg: "bg-indigo-50",   text: "text-indigo-600" },
  "emp-lms":         { bg: "bg-cyan-50",     text: "text-cyan-600" },
  "emp-billing":     { bg: "bg-gray-50",     text: "text-gray-600" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number, currency: string = "INR"): string {
  const val = amount / 100;
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(val);
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
// Edit Subscription Modal
// ---------------------------------------------------------------------------

interface EditModalProps {
  subscription: any;
  moduleName: string;
  onClose: () => void;
  onSave: (id: number, data: object) => Promise<void>;
  isLoading: boolean;
}

function EditSubscriptionModal({ subscription, moduleName, onClose, onSave, isLoading }: EditModalProps) {
  const [planTier, setPlanTier] = useState(subscription.plan_tier);
  const [totalSeats, setTotalSeats] = useState(subscription.total_seats);
  const [billingCycle, setBillingCycle] = useState(subscription.billing_cycle);

  const plans = [
    { value: "basic", label: "Basic" },
    { value: "professional", label: "Professional" },
    { value: "enterprise", label: "Enterprise" },
  ];

  const cycles = [
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "annual", label: "Annual" },
  ];

  const hasChanges = planTier !== subscription.plan_tier || totalSeats !== subscription.total_seats || billingCycle !== subscription.billing_cycle;
  const seatsReduced = totalSeats < subscription.used_seats;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Subscription</h2>
            <p className="text-sm text-gray-500">{moduleName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Plan Tier */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Plan Tier</label>
            <div className="grid grid-cols-3 gap-2">
              {plans.map(plan => (
                <button
                  key={plan.value}
                  onClick={() => setPlanTier(plan.value)}
                  className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    planTier === plan.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {plan.label}
                </button>
              ))}
            </div>
          </div>

          {/* Total Seats */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Users className="h-4 w-4" /> Total Seats
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTotalSeats(Math.max(1, totalSeats - 1))}
                className="h-10 w-10 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={10000}
                value={totalSeats}
                onChange={e => setTotalSeats(Math.max(1, Number(e.target.value)))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-semibold focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
              <button
                onClick={() => setTotalSeats(totalSeats + 1)}
                className="h-10 w-10 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                +
              </button>
            </div>
            <div className="flex justify-between mt-1">
              <p className="text-xs text-gray-400">Currently using {subscription.used_seats} seats</p>
              {seatsReduced && (
                <p className="text-xs text-red-500 font-medium">Cannot reduce below {subscription.used_seats} (in use)</p>
              )}
            </div>
          </div>

          {/* Billing Cycle */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Calendar className="h-4 w-4" /> Billing Cycle
            </label>
            <div className="grid grid-cols-3 gap-2">
              {cycles.map(cycle => (
                <button
                  key={cycle.value}
                  onClick={() => setBillingCycle(cycle.value)}
                  className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    billingCycle === cycle.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {cycle.label}
                </button>
              ))}
            </div>
          </div>

          {/* Change Summary */}
          {hasChanges && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-amber-800 mb-1">Changes:</p>
              <ul className="text-amber-700 space-y-0.5">
                {planTier !== subscription.plan_tier && (
                  <li>Plan: <span className="line-through">{subscription.plan_tier}</span> → <span className="font-medium">{planTier}</span></li>
                )}
                {totalSeats !== subscription.total_seats && (
                  <li>Seats: <span className="line-through">{subscription.total_seats}</span> → <span className="font-medium">{totalSeats}</span></li>
                )}
                {billingCycle !== subscription.billing_cycle && (
                  <li>Cycle: <span className="line-through">{subscription.billing_cycle}</span> → <span className="font-medium">{billingCycle}</span></li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            onClick={() => onSave(subscription.id, { plan_tier: planTier, total_seats: totalSeats, billing_cycle: billingCycle })}
            disabled={isLoading || !hasChanges || seatsReduced}
            className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab constants
// ---------------------------------------------------------------------------

const TABS = [
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { id: "invoices", label: "Invoices", icon: Receipt },
  { id: "payments", label: "Payments", icon: DollarSign },
  { id: "overview", label: "Overview", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<TabId>("subscriptions");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-gray-500 mt-1">
          Manage subscriptions, invoices, payments, and billing overview.
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
      {activeTab === "subscriptions" && <SubscriptionsTab />}
      {activeTab === "invoices" && <InvoicesTab />}
      {activeTab === "payments" && <PaymentsTab />}
      {activeTab === "overview" && <OverviewTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscriptions Tab (merged from SubscriptionsPage)
// ---------------------------------------------------------------------------

function SubscriptionsTab() {
  const { data: subscriptions, isLoading } = useSubscriptions();
  const { data: billing } = useBillingSummary();
  const { data: modules } = useModules();
  const updateSub = useUpdateSubscription();
  const cancelSub = useCancelSubscription();
  const [editingSub, setEditingSub] = useState<any>(null);
  const [cancelConfirm, setCancelConfirm] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const moduleMap = new Map(modules?.map((m: any) => [m.id, m]) || []);

  const handleUpdate = async (id: number, data: object) => {
    try {
      await updateSub.mutateAsync({ id, data });
      setEditingSub(null);
      setToast("Subscription updated successfully");
      setTimeout(() => setToast(null), 4000);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || "Failed to update subscription";
      setToast(null);
      // Show error inline — reuse toast slot with prefix
      setToast(`Error: ${msg}`);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await cancelSub.mutateAsync(id);
      setCancelConfirm(null);
      setToast("Subscription cancelled");
      setTimeout(() => setToast(null), 4000);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || "Failed to cancel subscription";
      setCancelConfirm(null);
      setToast(`Error: ${msg}`);
      setTimeout(() => setToast(null), 5000);
    }
  };

  if (isLoading) return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-gray-200 rounded-lg" />
            <div>
              <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-20 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="h-3 w-full bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 ${toast.startsWith("Error:") ? "bg-red-600" : "bg-green-600"} text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2`}>
          {toast.startsWith("Error:") ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}{toast}
        </div>
      )}

      {editingSub && (
        <EditSubscriptionModal
          subscription={editingSub}
          moduleName={((moduleMap as any).get(editingSub.module_id) as any)?.name || "Module"}
          onClose={() => setEditingSub(null)}
          onSave={handleUpdate}
          isLoading={updateSub.isPending}
        />
      )}

      {/* Cancel confirmation */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCancelConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Subscription?</h3>
            <p className="text-sm text-gray-500 mb-4">This will cancel the subscription and revoke access for all assigned seats. This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCancelConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Keep</button>
              <button
                onClick={() => handleCancel(cancelConfirm)}
                disabled={cancelSub.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {cancelSub.isPending ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monthly cost summary */}
      {billing && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-gray-900">Monthly Cost</h2>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {formatCurrency(billing.total_monthly_cost, billing.currency)}
            <span className="text-sm font-normal text-gray-500"> /month</span>
          </p>
        </div>
      )}

      {/* Subscription cards */}
      {(!subscriptions || subscriptions.length === 0) ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CreditCard className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No subscriptions yet. Subscribe to modules from the Modules page.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((sub: any) => {
            const mod = moduleMap.get(sub.module_id) as any;
            return (
              <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${moduleColors[mod?.slug]?.bg || "bg-brand-50"}`}>
                      {(() => { const Icon = moduleIcons[mod?.slug] || Package; const color = moduleColors[mod?.slug]?.text || "text-brand-600"; return <Icon className={`h-5 w-5 ${color}`} />; })()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{mod?.name || "Module"}</h3>
                      <p className="text-xs text-gray-500">{mod?.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      sub.status === "active" ? "bg-green-50 text-green-700" :
                      sub.status === "trial" ? "bg-yellow-50 text-yellow-700" :
                      sub.status === "cancelled" ? "bg-gray-100 text-gray-500" :
                      "bg-red-50 text-red-700"
                    }`}>
                      {sub.status}
                    </span>
                    {sub.status !== "cancelled" && (
                      <>
                        <button
                          onClick={() => setEditingSub(sub)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          title="Edit subscription"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setCancelConfirm(sub.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Cancel subscription"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">Plan</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">{sub.plan_tier}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Seats</p>
                    <p className="text-sm font-medium text-gray-900">
                      {sub.used_seats}/{sub.total_seats}
                      {sub.used_seats >= sub.total_seats && (
                        <span className="text-xs text-red-500 ml-1">(full)</span>
                      )}
                    </p>
                    {/* Seat usage bar */}
                    <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                      <div
                        className={`h-1 rounded-full ${sub.used_seats >= sub.total_seats ? "bg-red-500" : "bg-brand-500"}`}
                        style={{ width: `${Math.min(100, (sub.used_seats / sub.total_seats) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Price/Seat</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(Number(sub.price_per_seat), sub.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Billing Cycle</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">{sub.billing_cycle}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab() {
  const { data: summary, isLoading } = useBillingOverviewSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
            <div className="h-7 w-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
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
          {formatCurrency(summary.outstandingAmount ?? 0, summary.currency)}
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
          {formatCurrency(summary.monthlyRecurring ?? 0, summary.currency)}
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
  const { data: rawData, isLoading } = useBillingInvoices({ page, per_page: 10 });

  const invoiceData = rawData?.data ?? rawData ?? {};
  const invoices = invoiceData?.invoices ?? invoiceData?.data ?? [];
  const meta = { page: invoiceData?.page ?? 1, totalPages: invoiceData?.totalPages ?? 1, total: invoiceData?.total ?? 0 };

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
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full text-sm">
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
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.totalPages} ({meta.total} invoices)
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
              disabled={page >= meta.totalPages}
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

function PayNowButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  const [showGateways, setShowGateways] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showGateways) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowGateways(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showGateways]);

  const handlePay = async (gateway: string) => {
    setLoading(true);
    try {
      const token = useAuthStore.getState().accessToken || null;
      const res = await fetch("/api/v1/billing/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ invoiceId, gateway }),
      });
      const data = await res.json();
      if (data.success && data.data?.checkoutUrl) {
        window.open(data.data.checkoutUrl, "_blank");
      } else {
        alert(data.error?.message || "Could not create payment session");
      }
    } catch {
      alert("Payment service unavailable");
    } finally {
      setLoading(false);
      setShowGateways(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setShowGateways(!showGateways); }}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
      >
        <CreditCard className="h-3.5 w-3.5" />
        {loading ? "Processing..." : "Pay Now"}
      </button>
      {showGateways && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[160px]">
          <button onClick={(e) => { e.stopPropagation(); handlePay("stripe"); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 rounded-t-lg font-medium text-gray-700">
            Stripe (Card)
          </button>
          <button onClick={(e) => { e.stopPropagation(); handlePay("razorpay"); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 font-medium text-gray-700">
            Razorpay (UPI/Card)
          </button>
          <button onClick={(e) => { e.stopPropagation(); handlePay("paypal"); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 rounded-b-lg font-medium text-gray-700">
            PayPal
          </button>
        </div>
      )}
    </div>
  );
}

/** Fallback: render a printable invoice in a popup window when PDF service is unavailable */
function printInvoiceFallback(invoice: any) {
  const total = invoice.total ?? invoice.amount ?? 0;
  const amountDue = invoice.amountDue ?? invoice.amount_due ?? total;
  const amountPaid = invoice.amountPaid ?? invoice.amount_paid ?? 0;
  const items = invoice.items || invoice.lineItems || [];
  const html = `<!DOCTYPE html><html><head><title>Invoice ${invoice.invoiceNumber || ""}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#333}h1{color:#4f46e5;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}
th{background:#f5f5f5}
.right{text-align:right}.meta{display:flex;gap:40px;margin:16px 0}.meta div{font-size:14px}
.total-section{margin-top:20px;text-align:right}.total-section p{margin:4px 0;font-size:14px}
.total-section .grand{font-size:18px;font-weight:bold}
@media print{body{margin:20px}}</style></head><body>
<h1>Invoice</h1><p style="color:#666;margin-top:0">${invoice.invoiceNumber || "N/A"}</p>
<div class="meta">
<div><strong>Issue Date:</strong> ${invoice.issueDate || "-"}</div>
<div><strong>Due Date:</strong> ${invoice.dueDate || "-"}</div>
<div><strong>Status:</strong> ${(invoice.status || "unknown").toUpperCase()}</div>
</div>
${items.length > 0 ? `<table><thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead><tbody>
${items.map((it: Record<string, any>) => `<tr><td>${it.description || it.name || "-"}</td><td class="right">${it.quantity ?? 1}</td><td class="right">${it.rate ?? it.unitPrice ?? "-"}</td><td class="right">${it.amount ?? it.total ?? "-"}</td></tr>`).join("")}
</tbody></table>` : ""}
<div class="total-section">
<p>Subtotal: ${total}</p><p>Paid: ${amountPaid}</p>
<p class="grand">Amount Due: ${amountDue}</p>
</div>
${invoice.notes ? `<p style="margin-top:20px;font-size:13px;color:#666"><em>Note: ${invoice.notes}</em></p>` : ""}
<script>window.onload=function(){window.print()}</script></body></html>`;
  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
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
  const handleDownloadPdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const token = useAuthStore.getState().accessToken || null;
      const res = await fetch(`/api/v1/billing/invoices/${invoice.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        // Fallback: open a printable invoice in a new window
        printInvoiceFallback(invoice);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber || "invoice"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback on network error as well
      printInvoiceFallback(invoice);
    }
  };

  const invoiceTotal = invoice.total ?? invoice.amount ?? 0;
  const amountDue = invoice.amountDue ?? invoice.amount_due ?? invoiceTotal;
  const amountPaid = invoice.amountPaid ?? invoice.amount_paid ?? 0;

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <span className="text-gray-400">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        </td>
        <td className="px-4 py-3 font-medium text-brand-600 hover:text-brand-700">{invoice.invoiceNumber}</td>
        <td className="px-4 py-3 text-gray-600">{formatDate(invoice.issueDate)}</td>
        <td className="px-4 py-3 text-gray-600">{formatDate(invoice.dueDate)}</td>
        <td className="px-4 py-3 text-right font-medium text-gray-900">
          {formatCurrency(invoiceTotal, invoice.currency)}
        </td>
        <td className="px-4 py-3 text-center">
          <StatusBadge status={invoice.status} />
        </td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-gray-50 px-6 py-5 border-b border-gray-200">
            {/* Invoice Detail View */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Invoice Number</p>
                <p className="text-sm font-semibold text-gray-900">{invoice.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Issue Date</p>
                <p className="text-sm text-gray-900">{formatDate(invoice.issueDate)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Due Date</p>
                <p className="text-sm text-gray-900">{formatDate(invoice.dueDate)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Status</p>
                <StatusBadge status={invoice.status} />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Currency</p>
                <p className="text-sm text-gray-900">{invoice.currency || "USD"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Reference</p>
                <p className="text-sm text-gray-900">{invoice.referenceNumber || "—"}</p>
              </div>
            </div>

            {/* Line Items */}
            {invoice.items?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase">Line Items</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-200">
                      <th className="text-left pb-2 font-medium">Description</th>
                      <th className="text-right pb-2 font-medium">Qty</th>
                      <th className="text-right pb-2 font-medium">Rate</th>
                      <th className="text-right pb-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item: any, idx: number) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="py-2 text-gray-700">{item.name || item.description}</td>
                        <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                        <td className="py-2 text-right text-gray-600">{formatCurrency(item.rate || item.unitPrice || 0, invoice.currency)}</td>
                        <td className="py-2 text-right font-medium text-gray-900">
                          {formatCurrency(item.amount || (item.quantity * (item.rate || item.unitPrice || 0)), invoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="border-t border-gray-200 pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-900">{formatCurrency(invoice.subtotal ?? invoiceTotal, invoice.currency)}</span>
              </div>
              {invoice.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Discount</span>
                  <span className="text-green-600">-{formatCurrency(invoice.discountAmount, invoice.currency)}</span>
                </div>
              )}
              {invoice.taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tax</span>
                  <span className="text-gray-900">{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t border-gray-300 pt-2">
                <span className="text-gray-900">Total</span>
                <span className="text-gray-900">{formatCurrency(invoiceTotal, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Paid</span>
                <span className="text-green-600">{formatCurrency(amountPaid, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-gray-700">Amount Due</span>
                <span className={amountDue > 0 ? "text-red-600" : "text-green-600"}>{formatCurrency(amountDue, invoice.currency)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-4 pt-3 border-t border-gray-200">
              <button
                onClick={(e) => { e.stopPropagation(); handleDownloadPdf(e); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"
              >
                <Download className="h-3.5 w-3.5" /> Download PDF
              </button>
              {amountDue > 0 && (
                <PayNowButton invoiceId={invoice.id} />
              )}
              {invoice.notes && (
                <div className="text-xs text-gray-500 italic">Note: {invoice.notes}</div>
              )}
            </div>
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
  const { data: rawData, isLoading } = useBillingPayments({ page, per_page: 10 });

  const paymentData = rawData?.data ?? rawData ?? {};
  const payments = paymentData?.payments ?? paymentData?.data ?? [];
  const meta = { page: paymentData?.page ?? 1, totalPages: paymentData?.totalPages ?? 1, total: paymentData?.total ?? 0 };

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
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full text-sm">
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
                  {formatCurrency(p.amount, p.currency)}
                </td>
                <td className="px-4 py-3 text-gray-600 capitalize">{p.method}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.reference}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{p.invoiceId || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.totalPages} ({meta.total} payments)
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
              disabled={page >= meta.totalPages}
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
