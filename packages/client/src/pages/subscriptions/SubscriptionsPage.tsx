import { useSubscriptions, useBillingSummary, useModules, useUpdateSubscription, useCancelSubscription } from "@/api/hooks";
import { CreditCard, TrendingUp, ArrowRight, Pencil, X, Check, Trash2, Users, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";

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

export default function SubscriptionsPage() {
  const { data: subscriptions, isLoading } = useSubscriptions();
  const { data: billing } = useBillingSummary();
  const { data: modules } = useModules();
  const updateSub = useUpdateSubscription();
  const cancelSub = useCancelSubscription();
  const [editingSub, setEditingSub] = useState<any>(null);
  const [cancelConfirm, setCancelConfirm] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const moduleMap = new Map(modules?.map((m: any) => [m.id, m]) || []);

  const formatCurrency = (amount: number, currency: string = "INR") => {
    const val = amount / 100;
    const locale = currency === "INR" ? "en-IN" : "en-US";
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(val);
  };

  const handleUpdate = async (id: number, data: object) => {
    await updateSub.mutateAsync({ id, data });
    setEditingSub(null);
    setToast("Subscription updated successfully");
    setTimeout(() => setToast(null), 4000);
  };

  const handleCancel = async (id: number) => {
    await cancelSub.mutateAsync(id);
    setCancelConfirm(null);
    setToast("Subscription cancelled");
    setTimeout(() => setToast(null), 4000);
  };

  if (isLoading) return <div className="text-gray-500">Loading subscriptions...</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="text-gray-500 mt-1">Manage your module subscriptions and billing.</p>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <Check className="h-4 w-4" />{toast}
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

      <Link
        to="/billing"
        className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-xl px-6 py-4 mb-6 hover:bg-brand-100 transition-colors group"
      >
        <p className="text-sm font-medium text-brand-700">View detailed invoices and payment history</p>
        <ArrowRight className="h-4 w-4 text-brand-600 group-hover:translate-x-1 transition-transform" />
      </Link>

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

      <div className="space-y-4">
        {subscriptions?.map((sub: any) => {
          const mod = moduleMap.get(sub.module_id) as any;
          return (
            <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-brand-600" />
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
                {/* #1448 — Seat tile is now a link to /users?module=<slug> so
                    admins can quickly see which employees have this seat. */}
                <Link
                  to={`/users?module=${mod?.slug || ""}`}
                  className="group"
                >
                  <p className="text-xs text-gray-500 group-hover:text-brand-600">Seats</p>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-brand-700 group-hover:underline">
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
                </Link>
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
    </div>
  );
}
