import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/lib/auth-store";
import { showToast } from "@/components/ui/Toast";
import api from "@/api/client";
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
  RefreshCw,
} from "lucide-react";

const PAYPAL_ENABLED = import.meta.env.VITE_PAYPAL_ENABLED === "true";

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
  "emp-payroll":     { bg: "bg-emerald-50 dark:bg-emerald-950/40",  text: "text-emerald-600 dark:text-emerald-400" },
  "emp-recruit":     { bg: "bg-blue-50 dark:bg-blue-950/40",     text: "text-blue-600 dark:text-blue-400" },
  "emp-performance": { bg: "bg-orange-50 dark:bg-orange-950/40",   text: "text-orange-600 dark:text-orange-400" },
  "emp-rewards":     { bg: "bg-yellow-50 dark:bg-yellow-950/40",   text: "text-yellow-600 dark:text-yellow-400" },
  "emp-exit":        { bg: "bg-red-50 dark:bg-red-950/40",      text: "text-red-600 dark:text-red-400" },
  "emp-monitor":     { bg: "bg-purple-50 dark:bg-purple-950/40",   text: "text-purple-600 dark:text-purple-400" },
  "emp-field":       { bg: "bg-teal-50 dark:bg-teal-950/40",     text: "text-teal-600 dark:text-teal-400" },
  "emp-biometrics":  { bg: "bg-pink-50 dark:bg-pink-950/40",     text: "text-pink-600 dark:text-pink-400" },
  "emp-projects":    { bg: "bg-indigo-50 dark:bg-indigo-950/40",   text: "text-indigo-600 dark:text-indigo-400" },
  "emp-lms":         { bg: "bg-cyan-50 dark:bg-cyan-950/40",     text: "text-cyan-600 dark:text-cyan-400" },
  "emp-billing":     { bg: "bg-muted",     text: "text-muted-foreground" },
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
  paid: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  sent: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  overdue: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  draft: "bg-muted text-muted-foreground",
  void: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const translatedStatus = t(`common.${status}`);
  const display = translatedStatus !== `common.${status}` ? translatedStatus : status;
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-md font-medium capitalize ${statusColors[status] || "bg-muted text-muted-foreground"}`}
    >
      {display}
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
  const { t } = useTranslation();
  const [planTier, setPlanTier] = useState(subscription.plan_tier);
  const [totalSeats, setTotalSeats] = useState(subscription.total_seats);
  const [billingCycle, setBillingCycle] = useState(subscription.billing_cycle);

  const plans = [
    { value: "basic", label: t('plans.basic') },
    { value: "professional", label: t('plans.premium') },
    { value: "enterprise", label: t('plans.enterprise') },
  ];

  const cycles = [
    { value: "monthly", label: t('billing.cycles.monthly') },
    { value: "quarterly", label: t('billing.cycles.quarterly') },
    { value: "annual", label: t('billing.cycles.annual') },
  ];

  const hasChanges = planTier !== subscription.plan_tier || totalSeats !== subscription.total_seats || billingCycle !== subscription.billing_cycle;
  const seatsReduced = totalSeats < subscription.used_seats;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t('billing.editModal.title')}</h2>
            <p className="text-[13px] text-muted-foreground">{moduleName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Plan Tier */}
          <div>
            <label className="text-[13px] font-medium text-muted-foreground mb-2 block">{t('billing.editModal.planTier')}</label>
            <div className="grid grid-cols-3 gap-2">
              {plans.map(plan => (
                <button
                  key={plan.value}
                  onClick={() => setPlanTier(plan.value)}
                  className={`py-2 px-3 rounded-md border-2 text-[13px] font-medium transition-all ${
                    planTier === plan.value
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  {plan.label}
                </button>
              ))}
            </div>
          </div>

          {/* Total Seats */}
          <div>
            <label className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground mb-2">
              <Users className="h-4 w-4" /> {t('billing.editModal.totalSeats')}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTotalSeats(Math.max(1, totalSeats - 1))}
                className="h-10 w-10 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={10000}
                value={totalSeats}
                onChange={e => setTotalSeats(Math.max(1, Number(e.target.value)))}
                className="bg-card text-foreground flex-1 px-3 py-2 border border-border rounded-md text-center text-lg font-semibold tabular-nums focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
              <button
                onClick={() => setTotalSeats(totalSeats + 1)}
                className="h-10 w-10 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                +
              </button>
            </div>
            <div className="flex justify-between mt-1">
              <p className="text-[11px] text-muted-foreground">{t('billing.editModal.currentlyUsing', { count: subscription.used_seats })}</p>
              {seatsReduced && (
                <p className="text-[11px] text-red-500 font-medium">{t('billing.editModal.cannotReduce', { count: subscription.used_seats })}</p>
              )}
            </div>
          </div>

          {/* Billing Cycle */}
          <div>
            <label className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground mb-2">
              <Calendar className="h-4 w-4" /> {t('billing.editModal.billingCycle')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {cycles.map(cycle => (
                <button
                  key={cycle.value}
                  onClick={() => setBillingCycle(cycle.value)}
                  className={`py-2 px-3 rounded-md border-2 text-[13px] font-medium transition-all ${
                    billingCycle === cycle.value
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  {cycle.label}
                </button>
              ))}
            </div>
          </div>

          {/* Change Summary */}
          {hasChanges && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-md p-3 text-[13px]">
              <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">{t('billing.editModal.changes')}</p>
              <ul className="text-amber-700 dark:text-amber-300 space-y-0.5">
                {planTier !== subscription.plan_tier && (
                  <li>{t('billing.editModal.plan')}: <span className="line-through">{subscription.plan_tier}</span> → <span className="font-medium">{planTier}</span></li>
                )}
                {totalSeats !== subscription.total_seats && (
                  <li>{t('billing.editModal.seats')}: <span className="line-through">{subscription.total_seats}</span> → <span className="font-medium">{totalSeats}</span></li>
                )}
                {billingCycle !== subscription.billing_cycle && (
                  <li>{t('billing.editModal.cycle')}: <span className="line-through">{subscription.billing_cycle}</span> → <span className="font-medium">{billingCycle}</span></li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-border bg-muted rounded-b-2xl">
          <button onClick={onClose} className="text-[13px] text-muted-foreground hover:text-foreground">{t('common.cancel')}</button>
          <button
            onClick={() => onSave(subscription.id, { plan_tier: planTier, total_seats: totalSeats, billing_cycle: billingCycle })}
            disabled={isLoading || !hasChanges || seatsReduced}
            className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? t('billing.editModal.saving') : t('billing.editModal.save')}
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
  { id: "subscriptions", labelKey: "billing.tabs.subscriptions", icon: CreditCard },
  { id: "invoices", labelKey: "billing.tabs.invoices", icon: Receipt },
  { id: "payments", labelKey: "billing.tabs.payments", icon: DollarSign },
  { id: "overview", labelKey: "billing.tabs.overview", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const { t } = useTranslation();
  const paymentRestricted = useAuthStore((state) => Boolean(state.user?.payment_restricted));
  const setPaymentRestriction = useAuthStore((state) => state.setPaymentRestriction);
  const [activeTab, setActiveTab] = useState<TabId>(paymentRestricted ? "invoices" : "subscriptions");
  const [checkingAccess, setCheckingAccess] = useState(false);
  const visibleTabs = paymentRestricted
    ? TABS.filter((tab) => tab.id !== "subscriptions")
    : TABS;

  useEffect(() => {
    if (paymentRestricted && activeTab === "subscriptions") setActiveTab("invoices");
  }, [activeTab, paymentRestricted]);

  async function checkOrganizationAccess() {
    setCheckingAccess(true);
    try {
      const response = await api.get("/auth/access-status");
      const restricted = Boolean(response.data?.data?.payment_restricted);
      setPaymentRestriction(restricted);
      showToast(
        restricted ? "info" : "success",
        restricted
          ? "The overdue payment is still pending."
          : "Payment confirmed. Organization access has been restored.",
      );
    } catch (error: any) {
      showToast("error", error?.response?.data?.error?.message || "Could not check payment status.");
    } finally {
      setCheckingAccess(false);
    }
  }

  // PayPal redirect-return handler. PayPal's hosted checkout is a two-step
  // flow — the buyer "approves" on PayPal, then the order must be "captured"
  // to actually move the funds. PayPal redirects back here with
  // ?payInvoiceId=<id>&payment=success&token=<orderId>&PayerID=<...>; we POST
  // the order id to /billing/verify-payment, which triggers the capture and
  // marks the invoice paid. Without this the invoice stays unpaid even after
  // a successful PayPal approval. Stripe (recorded via webhook) and Razorpay
  // (verified inline) don't need this — they never return with ?token=.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const orderToken = params.get("token");
    const payerId = params.get("PayerID");
    const payInvoiceId = params.get("payInvoiceId");
    if (!orderToken || !payerId || !payInvoiceId) return; // not a PayPal return

    const cleanUrl = window.location.origin + window.location.pathname;
    (async () => {
      try {
        const authToken = useAuthStore.getState().accessToken || null;
        const res = await fetch("/api/v1/billing/verify-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            invoiceId: payInvoiceId,
            gateway: "paypal",
            gatewayOrderId: orderToken,
          }),
        });
        const data = await res.json();
        if (data.success) {
          const accessResponse = await api.get("/auth/access-status");
          const stillRestricted = Boolean(accessResponse.data?.data?.payment_restricted);
          setPaymentRestriction(stillRestricted);
          showToast(
            stillRestricted ? "info" : "success",
            stillRestricted
              ? "Payment recorded, but other overdue invoices still require payment."
              : "Payment confirmed. Organization access has been restored.",
          );
          // Reload to the clean URL so the invoice list reflects the new
          // status — short delay so the success toast is seen before refresh.
          setTimeout(() => window.location.replace(cleanUrl), 1800);
        } else {
          showToast("error", data.error?.message || "PayPal payment could not be confirmed. If you completed the payment, please contact support.");
          // Drop the gateway params without reloading so the error toast stays
          // on screen and a refresh doesn't re-trigger verification.
          window.history.replaceState({}, "", cleanUrl);
        }
      } catch {
        showToast("error", "Could not confirm the PayPal payment. Please contact support.");
        window.history.replaceState({}, "", cleanUrl);
      }
    })();
  }, [setPaymentRestriction]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t('billing.title')}</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          {t('billing.subtitle')}
        </p>
      </div>

      {paymentRestricted && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900 dark:bg-red-950/30">
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Organization access is payment-restricted</p>
            <p className="mt-0.5 text-xs leading-5 text-red-700 dark:text-red-300">
              Review and pay the overdue invoice below. Other EmpCloud pages remain unavailable until payment is confirmed.
            </p>
          </div>
          <button
            type="button"
            onClick={checkOrganizationAccess}
            disabled={checkingAccess}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checkingAccess ? "animate-spin" : ""}`} />
            {checkingAccess ? "Checking…" : "Check payment status"}
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-border mb-6">
        <nav className="flex gap-6 -mb-px">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-1 pb-3 text-[13px] font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-brand-600 text-brand-700 dark:text-brand-300"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(tab.labelKey)}
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
  const { t } = useTranslation();
  const { data: subscriptions, isLoading } = useSubscriptions();
  const { data: billing } = useBillingSummary();
  const { data: modules } = useModules();
  const updateSub = useUpdateSubscription();
  const cancelSub = useCancelSubscription();
  const [editingSub, setEditingSub] = useState<any>(null);
  const [cancelConfirm, setCancelConfirm] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const moduleMap = new Map(modules?.map((m: any) => [m.id, m]) || []);
  const errorPrefix = t('billing.toasts.errorPrefix');
  // #i18n — prefix detection with a localized prefix needs a flag, not a startsWith check
  const isErrorToast = typeof toast === "string" && toast.startsWith(`${errorPrefix}:`);

  const handleUpdate = async (id: number, data: object) => {
    try {
      await updateSub.mutateAsync({ id, data });
      setEditingSub(null);
      setToast(t('billing.toasts.updated'));
      setTimeout(() => setToast(null), 4000);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || t('billing.toasts.updateFailed');
      setToast(null);
      // Show error inline — reuse toast slot with prefix
      setToast(`${errorPrefix}: ${msg}`);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await cancelSub.mutateAsync(id);
      setCancelConfirm(null);
      setToast(t('billing.toasts.cancelled'));
      setTimeout(() => setToast(null), 4000);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || t('billing.toasts.cancelFailed');
      setCancelConfirm(null);
      setToast(`${errorPrefix}: ${msg}`);
      setTimeout(() => setToast(null), 5000);
    }
  };

  if (isLoading) return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-muted rounded-lg" />
            <div>
              <div className="h-4 w-32 bg-muted rounded mb-2" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
          </div>
          <div className="h-3 w-full bg-muted rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 ${isErrorToast ? "bg-red-600" : "bg-green-600"} text-white px-5 py-3 rounded-xl shadow-lg text-[13px] font-medium flex items-center gap-2`}>
          {isErrorToast ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}{toast}
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
          <div className="bg-card rounded-lg shadow-xl p-4 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-2">{t('billing.cancelModal.title')}</h3>
            <p className="text-[13px] text-muted-foreground mb-4">{t('billing.cancelModal.message')}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCancelConfirm(null)} className="px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground">{t('billing.cancelModal.keep')}</button>
              <button
                onClick={() => handleCancel(cancelConfirm)}
                disabled={cancelSub.isPending}
                className="px-4 py-2 text-[13px] bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {cancelSub.isPending ? t('billing.cancelModal.cancelling') : t('billing.cancelModal.yesCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monthly cost summary */}
      {billing && (
        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <h2 className="font-semibold text-foreground">{t('billing.monthlyCost')}</h2>
          </div>
          <p className="text-3xl font-semibold tabular-nums text-foreground">
            {formatCurrency(billing.total_monthly_cost, billing.currency)}
            <span className="text-[13px] font-normal text-muted-foreground"> {t('billing.perMonth')}</span>
          </p>
        </div>
      )}

      {/* Subscription cards */}
      {(!subscriptions || subscriptions.length === 0) ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <CreditCard className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">{t('billing.noSubscriptions')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((sub: any) => {
            const mod = moduleMap.get(sub.module_id) as any;
            return (
              <div key={sub.id} className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${moduleColors[mod?.slug]?.bg || "bg-brand-50 dark:bg-brand-950/40"}`}>
                      {(() => { const Icon = moduleIcons[mod?.slug] || Package; const color = moduleColors[mod?.slug]?.text || "text-brand-600 dark:text-brand-400"; return <Icon className={`h-5 w-5 ${color}`} />; })()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{mod?.name || "Module"}</h3>
                      <p className="text-[11px] text-muted-foreground">{mod?.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2 py-1 rounded-md font-medium ${
                      sub.status === "active" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300" :
                      sub.status === "trial" ? "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300" :
                      sub.status === "cancelled" ? "bg-muted text-muted-foreground" :
                      "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                    }`}>
                      {(() => { const k = `common.${sub.status}`; const tr = t(k); return tr !== k ? tr : sub.status; })()}
                    </span>
                    {sub.status !== "cancelled" && (
                      <>
                        <button
                          onClick={() => setEditingSub(sub)}
                          className="p-1.5 text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 rounded-md transition-colors"
                          title={t('billing.editTooltip')}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setCancelConfirm(sub.id)}
                          className="p-1.5 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors"
                          title={t('billing.cancelTooltip')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('billing.labels.plan')}</p>
                    <p className="text-[13px] font-medium text-foreground capitalize">{(() => { const k = `plans.${sub.plan_tier?.toLowerCase?.() ?? ""}`; const tr = t(k); return tr !== k ? tr : sub.plan_tier; })()}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('billing.labels.seats')}</p>
                    <p className="text-[13px] font-medium text-foreground">
                      {sub.used_seats}/{sub.total_seats}
                      {sub.used_seats >= sub.total_seats && (
                        <span className="text-[11px] text-red-500 ml-1">{t('billing.full')}</span>
                      )}
                    </p>
                    {/* Seat usage bar */}
                    <div className="w-full bg-muted rounded-full h-1 mt-1">
                      <div
                        className={`h-1 rounded-full ${sub.used_seats >= sub.total_seats ? "bg-red-500" : "bg-brand-500"}`}
                        style={{ width: `${Math.min(100, (sub.used_seats / sub.total_seats) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('billing.labels.pricePerSeat')}</p>
                    <p className="text-[13px] font-medium text-foreground">
                      {formatCurrency(Number(sub.price_per_seat), sub.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('billing.labels.billingCycle')}</p>
                    <p className="text-[13px] font-medium text-foreground capitalize">{(() => { const k = `billing.cycles.${sub.billing_cycle}`; const tr = t(k); return tr !== k ? tr : sub.billing_cycle; })()}</p>
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
  const { t } = useTranslation();
  const { data: summary, isLoading } = useBillingOverviewSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-5 animate-pulse">
            <div className="h-3 w-20 bg-muted rounded mb-3" />
            <div className="h-7 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-card rounded-lg border border-border p-12 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-muted-foreground">{t('billing.overview.noData')}</p>
      </div>
    );
  }

  const paymentStatusKey =
    (summary.overdueCount ?? 0) > 0
      ? "overdue"
      : (summary.outstandingAmount ?? 0) > 0
        ? "pastDue"
        : "allPaid";

  const paymentStatusColor =
    paymentStatusKey === "overdue"
      ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
      : paymentStatusKey === "pastDue"
        ? "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"
        : "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Outstanding Balance */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-[13px] text-muted-foreground">{t('billing.overview.outstandingBalance')}</p>
        </div>
        <p className="text-3xl font-semibold tabular-nums text-foreground">
          {formatCurrency(summary.outstandingAmount ?? 0, summary.currency)}
        </p>
      </div>

      {/* Next Invoice Date */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-[13px] text-muted-foreground">{t('billing.overview.nextInvoiceDate')}</p>
        </div>
        <p className="text-2xl font-semibold tabular-nums text-foreground">
          {summary.nextInvoiceDate ? formatDate(summary.nextInvoiceDate) : "N/A"}
        </p>
      </div>

      {/* Monthly Recurring Cost */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </div>
          <p className="text-[13px] text-muted-foreground">{t('billing.overview.monthlyRecurring')}</p>
        </div>
        <p className="text-3xl font-semibold tabular-nums text-foreground">
          {formatCurrency(summary.monthlyRecurring ?? 0, summary.currency)}
        </p>
      </div>

      {/* Payment Status */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-green-50 dark:bg-green-950/40 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-[13px] text-muted-foreground">{t('billing.overview.paymentStatus')}</p>
        </div>
        <span className={`text-[13px] px-3 py-1 rounded-md font-semibold capitalize ${paymentStatusColor}`}>
          {t(`billing.overview.${paymentStatusKey}`)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoices Tab
// ---------------------------------------------------------------------------

function InvoicesTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: rawData, isLoading } = useBillingInvoices({ page, per_page: 10 });

  const invoiceData = rawData?.data ?? rawData ?? {};
  const invoices = invoiceData?.invoices ?? invoiceData?.data ?? [];
  const meta = { page: invoiceData?.page ?? 1, totalPages: invoiceData?.totalPages ?? 1, total: invoiceData?.total ?? 0 };

  if (isLoading) return <div className="text-muted-foreground">{t('billing.invoices.loading')}</div>;

  if (invoices.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-12 text-center">
        <Receipt className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-muted-foreground">{t('billing.invoices.none')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-card rounded-lg border border-border overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-8" />
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('billing.invoices.number')}</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('billing.invoices.date')}</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('billing.invoices.dueDate')}</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('billing.invoices.amount')}</th>
              <th className="text-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('billing.invoices.status')}</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" />
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
          <p className="text-[13px] text-muted-foreground tabular-nums">
            {t('billing.invoices.pagination', { page: meta.page, totalPages: meta.totalPages, total: meta.total })}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-[13px] rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              {t('billing.invoices.previous')}
            </button>
            <button
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-[13px] rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              {t('billing.invoices.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PayNowButton({ invoiceId }: { invoiceId: string }) {
  const { t } = useTranslation();
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

  // Razorpay's inline checkout needs their CDN script. Loaded on demand
  // so first BillingPage paint isn't held up by a third-party fetch.
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") return resolve(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).Razorpay) return resolve(true);
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  };

  const handlePay = async (gateway: string) => {
    setLoading(true);
    try {
      const token = useAuthStore.getState().accessToken || null;
      // Return URL the gateway redirects to after success/cancel — keeps the
      // user on app.empcloud.com instead of the billing portal. The invoice
      // id is baked in as `payInvoiceId` so that when a hosted gateway
      // (PayPal) redirects back, the return handler in BillingPage knows
      // which invoice to capture and confirm — PayPal appends ?token= and
      // &PayerID= on return, but not the invoice id.
      const returnUrl = typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}?payInvoiceId=${invoiceId}`
        : undefined;
      const res = await fetch("/api/v1/billing/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ invoiceId, gateway, returnUrl }),
      });
      const data = await res.json();

      if (!data.success) {
        showToast("error", data.error?.message || "Could not create payment session");
        return;
      }

      // Stripe (and PayPal) — hosted checkout page; just navigate there.
      // Open in same tab so the success_url redirect lands us back
      // inside the EmpCloud SPA, not a stranded popup.
      if (data.data?.checkoutUrl) {
        window.location.href = data.data.checkoutUrl;
        return;
      }

      // Razorpay — no checkoutUrl; the gateway returns an order id +
      // public key and we open the Razorpay JS modal inline. On the
      // success callback we POST the order/payment/signature trio to
      // /billing/verify-payment so the backend can mark the invoice
      // paid (signature-verified, not trusting the browser).
      const meta = (data.data?.metadata || {}) as Record<string, unknown>;
      const keyId = typeof meta.keyId === "string" ? meta.keyId : "";
      const orderId = typeof meta.orderId === "string" ? meta.orderId : (data.data?.gatewayOrderId as string | undefined);
      if (gateway === "razorpay" && keyId && orderId) {
        const loaded = await loadRazorpayScript();
        if (!loaded) {
          showToast("error", "Could not load Razorpay. Check your network and try again.");
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rzp = new (window as any).Razorpay({
          key: keyId,
          order_id: orderId,
          amount: meta.amount,
          currency: meta.currency,
          name: "EmpCloud",
          description: `Invoice payment`,
          handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              const verifyRes = await fetch("/api/v1/billing/verify-payment", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                  invoiceId,
                  gateway: "razorpay",
                  gatewayOrderId: response.razorpay_order_id,
                  gatewayPaymentId: response.razorpay_payment_id,
                  gatewaySignature: response.razorpay_signature,
                }),
              });
              const verifyData = await verifyRes.json();
              if (verifyData.success) {
                showToast("success", "Payment successful — the invoice has been marked paid.");
                // Brief delay so the toast is seen before the page reloads
                // with the updated invoice list.
                setTimeout(() => {
                  window.location.href = `${returnUrl ?? "/billing"}${(returnUrl ?? "").includes("?") ? "&" : "?"}payment=success`;
                }, 1800);
              } else {
                showToast("error", verifyData.error?.message || "Payment verification failed");
              }
            } catch {
              showToast("error", "Could not verify payment. Please contact support.");
            }
          },
          modal: {
            ondismiss: () => {
              // User closed without paying — nothing to do; the invoice
              // stays unpaid and the Pay Now button is still there.
            },
          },
        });
        rzp.open();
        return;
      }

      // Unknown / unconfigured gateway — surface a useful error.
      showToast("error", "This payment method isn't configured yet. Try a different gateway.");
    } catch {
      showToast("error", "Payment service unavailable");
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
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
      >
        <CreditCard className="h-3.5 w-3.5" />
        {loading ? t('billing.invoices.processing') : t('billing.invoices.payNow')}
      </button>
      {showGateways && (
        <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg z-10 min-w-[160px]">
          <button onClick={(e) => { e.stopPropagation(); handlePay("stripe"); }} className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-muted rounded-t-md font-medium text-muted-foreground">
            Stripe (Card)
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handlePay("razorpay"); }}
            className={`w-full text-left px-4 py-2.5 text-[13px] hover:bg-muted font-medium text-muted-foreground ${PAYPAL_ENABLED ? "" : "rounded-b-md"}`}
          >
            Razorpay (UPI/Card)
          </button>
          {PAYPAL_ENABLED && (
            <button onClick={(e) => { e.stopPropagation(); handlePay("paypal"); }} className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-muted rounded-b-md font-medium text-muted-foreground">
              PayPal
            </button>
          )}
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
  const { t } = useTranslation();
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
      const pdfBlob = new Blob([blob], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber || "invoice"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
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
        className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <span className="text-muted-foreground">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        </td>
        <td className="px-4 py-2.5 font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">{invoice.invoiceNumber}</td>
        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{formatDate(invoice.issueDate)}</td>
        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{formatDate(invoice.dueDate)}</td>
        <td className="px-4 py-2.5 text-right font-medium text-foreground tabular-nums">
          {formatCurrency(invoiceTotal, invoice.currency)}
        </td>
        <td className="px-4 py-2.5 text-center">
          <StatusBadge status={invoice.status} />
        </td>
        <td className="px-4 py-2.5 text-right">
          <button
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1 text-[11px] text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-medium"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-muted px-4 py-4 border-b border-border">
            {/* Invoice Detail View */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Invoice Number</p>
                <p className="text-[13px] font-semibold text-foreground tabular-nums">{invoice.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Issue Date</p>
                <p className="text-[13px] text-foreground tabular-nums">{formatDate(invoice.issueDate)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Due Date</p>
                <p className="text-[13px] text-foreground tabular-nums">{formatDate(invoice.dueDate)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Status</p>
                <StatusBadge status={invoice.status} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Currency</p>
                <p className="text-[13px] text-foreground">{invoice.currency || "USD"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Reference</p>
                <p className="text-[13px] text-foreground">{invoice.referenceNumber || "—"}</p>
              </div>
            </div>

            {/* Line Items */}
            {invoice.items?.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Line Items</p>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left pb-2 font-medium">Description</th>
                      <th className="text-right pb-2 font-medium">Qty</th>
                      <th className="text-right pb-2 font-medium">Rate</th>
                      <th className="text-right pb-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item: any, idx: number) => (
                      <tr key={idx} className="border-t border-border">
                        <td className="py-2 text-muted-foreground">{item.name || item.description}</td>
                        <td className="py-2 text-right text-muted-foreground tabular-nums">{item.quantity}</td>
                        <td className="py-2 text-right text-muted-foreground tabular-nums">{formatCurrency(item.rate || item.unitPrice || 0, invoice.currency)}</td>
                        <td className="py-2 text-right font-medium text-foreground tabular-nums">
                          {formatCurrency(item.amount || (item.quantity * (item.rate || item.unitPrice || 0)), invoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="border-t border-border pt-3 space-y-1">
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground tabular-nums">{formatCurrency(invoice.subtotal ?? invoiceTotal, invoice.currency)}</span>
              </div>
              {invoice.discountAmount > 0 && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-green-600 dark:text-green-400 tabular-nums">-{formatCurrency(invoice.discountAmount, invoice.currency)}</span>
                </div>
              )}
              {invoice.taxAmount > 0 && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="text-foreground tabular-nums">{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-[13px] font-semibold border-t border-border pt-2">
                <span className="text-foreground">Total</span>
                <span className="text-foreground tabular-nums">{formatCurrency(invoiceTotal, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-green-600 dark:text-green-400 tabular-nums">{formatCurrency(amountPaid, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-[13px] font-semibold">
                <span className="text-muted-foreground">Amount Due</span>
                <span className={`tabular-nums ${amountDue > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>{formatCurrency(amountDue, invoice.currency)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-4 pt-3 border-t border-border">
              <button
                onClick={(e) => { e.stopPropagation(); handleDownloadPdf(e); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-brand-600 text-white rounded-md hover:bg-brand-700"
              >
                <Download className="h-3.5 w-3.5" /> {t('billing.invoices.downloadPdf')}
              </button>
              {amountDue > 0 && (
                <PayNowButton invoiceId={invoice.id} />
              )}
              {invoice.notes && (
                <div className="text-[11px] text-muted-foreground italic">Note: {invoice.notes}</div>
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
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data: rawData, isLoading } = useBillingPayments({ page, per_page: 10 });

  const paymentData = rawData?.data ?? rawData ?? {};
  const payments = paymentData?.payments ?? paymentData?.data ?? [];
  const meta = { page: paymentData?.page ?? 1, totalPages: paymentData?.totalPages ?? 1, total: paymentData?.total ?? 0 };

  if (isLoading) return <div className="text-muted-foreground">{t('billing.payments.loading')}</div>;

  if (payments.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-12 text-center">
        <CreditCard className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-muted-foreground">{t('billing.payments.none')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-card rounded-lg border border-border overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('billing.payments.date')}</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('billing.payments.amount')}</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('billing.payments.method')}</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('billing.payments.reference')}</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('billing.payments.invoice')}</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p: any) => (
              <tr key={p.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{formatDate(p.date)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-foreground tabular-nums">
                  {formatCurrency(p.amount, p.currency)}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground capitalize">{p.method}</td>
                <td className="px-4 py-2.5 text-muted-foreground font-mono text-[11px] tabular-nums">{p.reference}</td>
                <td className="px-4 py-2.5 text-muted-foreground text-[11px]">{p.invoiceId || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-[13px] text-muted-foreground tabular-nums">
            {t('billing.payments.pagination', { page: meta.page, totalPages: meta.totalPages, total: meta.total })}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-[13px] rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              {t('billing.invoices.previous')}
            </button>
            <button
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-[13px] rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              {t('billing.invoices.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
