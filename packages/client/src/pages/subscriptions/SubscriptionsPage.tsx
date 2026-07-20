import { useSubscriptions, useBillingSummary, useModules, useUpdateSubscription, useCancelSubscription } from "@/api/hooks";
import { CreditCard, TrendingUp, ArrowRight, Pencil, X, Check, Trash2, Users, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
    { value: "basic", label: t("subscriptionsPage.planTier.basic", { defaultValue: "Basic" }) },
    { value: "professional", label: t("subscriptionsPage.planTier.professional", { defaultValue: "Professional" }) },
    { value: "enterprise", label: t("subscriptionsPage.planTier.enterprise", { defaultValue: "Enterprise" }) },
  ];

  const cycles = [
    { value: "monthly", label: t("subscriptionsPage.billingCycle.monthly", { defaultValue: "Monthly" }) },
    { value: "quarterly", label: t("subscriptionsPage.billingCycle.quarterly", { defaultValue: "Quarterly" }) },
    { value: "annual", label: t("subscriptionsPage.billingCycle.annual", { defaultValue: "Annual" }) },
  ];

  const hasChanges = planTier !== subscription.plan_tier || totalSeats !== subscription.total_seats || billingCycle !== subscription.billing_cycle;
  const seatsReduced = totalSeats < subscription.used_seats;

  // Trial-end detection — must match server-side rank logic in
  // EmpCloud/packages/server/src/services/subscription/trial-expiration.service.ts.
  // Seat increase OR tier upgrade OR cycle lengthening ends the trial; pure
  // downgrades / cycle shortening leave the trial intact.
  const TIER_RANK: Record<string, number> = { free: 0, basic: 1, professional: 2, enterprise: 3 };
  const CYCLE_RANK: Record<string, number> = { monthly: 0, quarterly: 1, semi_annual: 2, annual: 3 };
  const isOnTrial = subscription.status === "trial";
  const seatsIncreasing = totalSeats > subscription.total_seats;
  const tierUpgrading = (TIER_RANK[planTier] ?? 0) > (TIER_RANK[subscription.plan_tier] ?? 0);
  const cycleLengthening = (CYCLE_RANK[billingCycle] ?? 0) > (CYCLE_RANK[subscription.billing_cycle] ?? 0);
  const willEndTrial = isOnTrial && (seatsIncreasing || tierUpgrading || cycleLengthening);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t("subscriptionsPage.editModal.title")}</h2>
            <p className="text-[13px] text-gray-500">{moduleName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Plan Tier */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-2 block">{t("subscriptionsPage.editModal.planTierLabel")}</label>
            <div className="grid grid-cols-3 gap-2">
              {plans.map(plan => (
                <button
                  key={plan.value}
                  onClick={() => setPlanTier(plan.value)}
                  className={`py-2 px-3 rounded-md border-2 text-[13px] font-medium transition-all ${
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
            <label className="flex items-center gap-2 text-[13px] font-medium text-gray-700 mb-2">
              <Users className="h-4 w-4" /> {t("subscriptionsPage.editModal.totalSeatsLabel")}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTotalSeats(Math.max(1, totalSeats - 1))}
                className="h-10 w-10 rounded-md border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={10000}
                value={totalSeats}
                onChange={e => setTotalSeats(Math.max(1, Number(e.target.value)))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-center text-lg font-semibold tabular-nums focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
              <button
                onClick={() => setTotalSeats(totalSeats + 1)}
                className="h-10 w-10 rounded-md border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                +
              </button>
            </div>
            <div className="flex justify-between mt-1">
              <p className="text-[11px] text-gray-400">{t("subscriptionsPage.editModal.currentlyUsing", { seats: subscription.used_seats })}</p>
              {seatsReduced && (
                <p className="text-[11px] text-red-500 font-medium">{t("subscriptionsPage.editModal.cannotReduceBelow", { seats: subscription.used_seats })}</p>
              )}
            </div>
          </div>

          {/* Billing Cycle */}
          <div>
            <label className="flex items-center gap-2 text-[13px] font-medium text-gray-700 mb-2">
              <Calendar className="h-4 w-4" /> {t("subscriptionsPage.editModal.billingCycleLabel")}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {cycles.map(cycle => (
                <button
                  key={cycle.value}
                  onClick={() => setBillingCycle(cycle.value)}
                  className={`py-2 px-3 rounded-md border-2 text-[13px] font-medium transition-all ${
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
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[13px]">
              <p className="font-medium text-amber-800 mb-1">{t("subscriptionsPage.editModal.changesHeading")}</p>
              <ul className="text-amber-700 space-y-0.5">
                {planTier !== subscription.plan_tier && (
                  <li>{t("subscriptionsPage.editModal.change.plan", {
                    from: t(`subscriptionsPage.planTier.${subscription.plan_tier}`, { defaultValue: subscription.plan_tier }),
                    to: t(`subscriptionsPage.planTier.${planTier}`, { defaultValue: planTier }),
                  })}</li>
                )}
                {totalSeats !== subscription.total_seats && (
                  <li>{t("subscriptionsPage.editModal.change.seats", { from: subscription.total_seats, to: totalSeats })}</li>
                )}
                {billingCycle !== subscription.billing_cycle && (
                  <li>{t("subscriptionsPage.editModal.change.cycle", {
                    from: t(`subscriptionsPage.billingCycle.${subscription.billing_cycle}`, { defaultValue: subscription.billing_cycle }),
                    to: t(`subscriptionsPage.billingCycle.${billingCycle}`, { defaultValue: billingCycle }),
                  })}</li>
                )}
              </ul>
            </div>
          )}

          {/* Trial-end warning */}
          {willEndTrial && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-[13px]">
              <p className="font-medium text-red-800 mb-1">{t("subscriptionsPage.editModal.trialWarning.title")}</p>
              <p className="text-red-700">
                {seatsIncreasing && t("subscriptionsPage.editModal.trialWarning.reason.seats")}
                {!seatsIncreasing && tierUpgrading && t("subscriptionsPage.editModal.trialWarning.reason.tier")}
                {!seatsIncreasing && !tierUpgrading && cycleLengthening && t("subscriptionsPage.editModal.trialWarning.reason.cycle")}
                {t("subscriptionsPage.editModal.trialWarning.body")}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="text-[13px] text-gray-500 hover:text-gray-700">{t("subscriptionsPage.editModal.cancel")}</button>
          <button
            onClick={() => onSave(subscription.id, { plan_tier: planTier, total_seats: totalSeats, billing_cycle: billingCycle })}
            disabled={isLoading || !hasChanges || seatsReduced}
            className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? t("subscriptionsPage.editModal.saving") : t("subscriptionsPage.editModal.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionsPage() {
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

  const formatCurrency = (amount: number, currency: string = "INR") => {
    const val = amount / 100;
    const locale = currency === "INR" ? "en-IN" : "en-US";
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(val);
  };

  const handleUpdate = async (id: number, data: object) => {
    await updateSub.mutateAsync({ id, data });
    setEditingSub(null);
    setToast(t("subscriptionsPage.toast.updated"));
    setTimeout(() => setToast(null), 4000);
  };

  const handleCancel = async (id: number) => {
    await cancelSub.mutateAsync(id);
    setCancelConfirm(null);
    setToast(t("subscriptionsPage.toast.cancelled"));
    setTimeout(() => setToast(null), 4000);
  };

  if (isLoading) return <div className="text-gray-500">{t("subscriptionsPage.loading")}</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{t("subscriptionsPage.header.title")}</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">{t("subscriptionsPage.header.subtitle")}</p>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-[13px] font-medium flex items-center gap-2">
          <Check className="h-4 w-4" />{toast}
        </div>
      )}

      {editingSub && (
        <EditSubscriptionModal
          subscription={editingSub}
          moduleName={((moduleMap as any).get(editingSub.module_id) as any)?.name || t("subscriptionsPage.moduleFallback")}
          onClose={() => setEditingSub(null)}
          onSave={handleUpdate}
          isLoading={updateSub.isPending}
        />
      )}

      {/* Cancel confirmation */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCancelConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t("subscriptionsPage.cancelModal.title")}</h3>
            <p className="text-[13px] text-gray-500 mb-4">{t("subscriptionsPage.cancelModal.body")}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCancelConfirm(null)} className="px-4 py-2 text-[13px] text-gray-600 hover:text-gray-800">{t("subscriptionsPage.cancelModal.keep")}</button>
              <button
                onClick={() => handleCancel(cancelConfirm)}
                disabled={cancelSub.isPending}
                className="px-4 py-2 text-[13px] bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {cancelSub.isPending ? t("subscriptionsPage.cancelModal.confirming") : t("subscriptionsPage.cancelModal.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Link
        to="/billing"
        className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-lg px-6 py-4 mb-6 hover:bg-brand-100 transition-colors group"
      >
        <p className="text-[13px] font-medium text-brand-700">{t("subscriptionsPage.billing.viewInvoicesLink")}</p>
        <ArrowRight className="h-4 w-4 text-brand-600 group-hover:translate-x-1 transition-transform" />
      </Link>

      {billing && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-gray-900">{t("subscriptionsPage.billing.monthlyCostHeading")}</h2>
          </div>
          <p className="text-3xl font-semibold text-gray-900 tabular-nums">
            {formatCurrency(billing.total_monthly_cost, billing.currency)}
            <span className="text-[13px] font-normal text-gray-500">{t("subscriptionsPage.billing.perMonthSuffix")}</span>
          </p>
        </div>
      )}

      <div className="space-y-4">
        {subscriptions?.map((sub: any) => {
          const mod = moduleMap.get(sub.module_id) as any;
          return (
            <div key={sub.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{mod?.name || t("subscriptionsPage.moduleFallback")}</h3>
                    <p className="text-[11px] text-gray-500">{mod?.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2 py-1 rounded-md font-medium ${
                    sub.status === "active" ? "bg-green-50 text-green-700" :
                    sub.status === "trial" ? "bg-yellow-50 text-yellow-700" :
                    sub.status === "cancelled" ? "bg-gray-100 text-gray-500" :
                    "bg-red-50 text-red-700"
                  }`}>
                    {t(`subscriptionsPage.status.${sub.status}`, { defaultValue: sub.status })}
                  </span>
                  {sub.status !== "cancelled" && (
                    <>
                      <button
                        onClick={() => setEditingSub(sub)}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors"
                        title={t("subscriptionsPage.card.tooltip.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setCancelConfirm(sub.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title={t("subscriptionsPage.card.tooltip.cancel")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Trial countdown / expiry banner */}
              {sub.status === "trial" && sub.trial_ends_at && (() => {
                const trialEnd = new Date(sub.trial_ends_at);
                const msLeft = trialEnd.getTime() - Date.now();
                const daysLeft = Math.ceil(msLeft / 86400000);
                if (daysLeft <= 0) {
                  return (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[11px] text-red-700">
                      {t("subscriptionsPage.trial.expired")}
                    </div>
                  );
                }
                const tone = daysLeft <= 3 ? "amber" : "blue";
                return (
                  <div className={`mt-3 ${tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-blue-50 border-blue-200 text-blue-700"} border rounded-lg px-3 py-2 text-[11px] flex items-center gap-1.5`}>
                    <Calendar className="h-3.5 w-3.5" />
                    {t("subscriptionsPage.trial.endsIn", { count: daysLeft, date: trialEnd.toLocaleDateString() })}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-[11px] text-gray-500">{t("subscriptionsPage.card.field.plan")}</p>
                  <p className="text-[13px] font-medium text-gray-900 capitalize">{t(`subscriptionsPage.planTier.${sub.plan_tier}`, { defaultValue: sub.plan_tier })}</p>
                </div>
                {/* #1448 — Seat tile is now a link to /users?module=<slug> so
                    admins can quickly see which employees have this seat. */}
                <Link
                  to={`/users?module=${mod?.slug || ""}`}
                  className="group"
                >
                  <p className="text-[11px] text-gray-500 group-hover:text-brand-600">{t("subscriptionsPage.card.field.seats")}</p>
                  <p className="text-[13px] font-medium text-gray-900 group-hover:text-brand-700 group-hover:underline tabular-nums">
                    {sub.used_seats}/{sub.total_seats}
                    {sub.used_seats >= sub.total_seats && (
                      <span className="text-[11px] text-red-500 ml-1">{t("subscriptionsPage.card.seatsFull")}</span>
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
                  <p className="text-[11px] text-gray-500">{t("subscriptionsPage.card.field.pricePerSeat")}</p>
                  <p className="text-[13px] font-medium text-gray-900 tabular-nums">
                    {formatCurrency(Number(sub.price_per_seat), sub.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">{t("subscriptionsPage.card.field.billingCycle")}</p>
                  <p className="text-[13px] font-medium text-gray-900 capitalize">{t(`subscriptionsPage.billingCycle.${sub.billing_cycle}`, { defaultValue: sub.billing_cycle })}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
