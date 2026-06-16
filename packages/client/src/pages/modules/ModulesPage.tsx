import { useModules, useSubscriptions, useCreateSubscription, useCancelSubscription } from "@/api/hooks";
import { Package, Check, Plus, ChevronDown, ChevronUp, Building2, X, Users, CreditCard, Calendar, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";

const ADMIN_ROLES = ["org_admin", "hr_admin"];

interface SubscribeModalProps {
  module: any;
  onClose: () => void;
  onSubscribe: (data: { module_id: number; plan_tier: string; total_seats: number; billing_cycle: string }) => Promise<void>;
  isLoading: boolean;
}

function SubscribeModal({ module, onClose, onSubscribe, isLoading }: SubscribeModalProps) {
  const [planTier, setPlanTier] = useState("basic");
  const [totalSeats, setTotalSeats] = useState(10);
  const [billingCycle, setBillingCycle] = useState("monthly");

  const plans = [
    { value: "basic", label: "Basic", description: "Essential features for small teams", priceMultiplier: 1 },
    { value: "professional", label: "Professional", description: "Advanced features + priority support", priceMultiplier: 2 },
    { value: "enterprise", label: "Enterprise", description: "Full features + dedicated support + SLA", priceMultiplier: 3.5 },
  ];

  const cycles = [
    { value: "monthly", label: "Monthly", discount: 0 },
    { value: "quarterly", label: "Quarterly", discount: 5 },
    { value: "annual", label: "Annual", discount: 20 },
  ];

  const basePrice = 500; // ₹500 per seat per month
  const selectedPlan = plans.find(p => p.value === planTier)!;
  const selectedCycle = cycles.find(c => c.value === billingCycle)!;
  const monthlyPerSeat = basePrice * selectedPlan.priceMultiplier;
  const discountedPerSeat = monthlyPerSeat * (1 - selectedCycle.discount / 100);
  const monthsInCycle = billingCycle === "monthly" ? 1 : billingCycle === "quarterly" ? 3 : 12;
  const totalAmount = discountedPerSeat * totalSeats * monthsInCycle;

  const handleSubmit = async () => {
    await onSubscribe({
      module_id: module.id,
      plan_tier: planTier,
      total_seats: totalSeats,
      billing_cycle: billingCycle,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Subscribe to {module.name}</h2>
            <p className="text-sm text-gray-500 mt-1">Configure your subscription</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Plan Tier Selection */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <CreditCard className="h-4 w-4" /> Select Plan
            </label>
            <div className="grid grid-cols-3 gap-3">
              {plans.map(plan => (
                <button
                  key={plan.value}
                  onClick={() => setPlanTier(plan.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    planTier === plan.value
                      ? "border-brand-500 bg-brand-50 ring-1 ring-brand-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="font-semibold text-sm text-gray-900">{plan.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{plan.description}</div>
                  <div className="text-sm font-bold text-brand-600 mt-2">
                    ₹{(basePrice * plan.priceMultiplier).toLocaleString("en-IN")}/seat/mo
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Number of Seats */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Users className="h-4 w-4" /> Number of Seats (Licenses)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={500}
                value={totalSeats}
                onChange={e => setTotalSeats(Number(e.target.value))}
                className="flex-1 accent-brand-600"
              />
              <input
                type="number"
                min={1}
                max={10000}
                value={totalSeats}
                onChange={e => setTotalSeats(Math.max(1, Number(e.target.value)))}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Each seat allows one employee to access this module</p>
          </div>

          {/* Billing Cycle */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Calendar className="h-4 w-4" /> Billing Cycle
            </label>
            <div className="grid grid-cols-3 gap-3">
              {cycles.map(cycle => (
                <button
                  key={cycle.value}
                  onClick={() => setBillingCycle(cycle.value)}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${
                    billingCycle === cycle.value
                      ? "border-brand-500 bg-brand-50 ring-1 ring-brand-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="font-semibold text-sm text-gray-900">{cycle.label}</div>
                  {cycle.discount > 0 && (
                    <div className="text-xs text-green-600 font-medium mt-1">Save {cycle.discount}%</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Price Summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Plan</span>
              <span className="font-medium capitalize">{planTier}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Price per seat</span>
              <span>₹{monthlyPerSeat.toLocaleString("en-IN")}/mo</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Seats</span>
              <span>{totalSeats} users</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Billing cycle</span>
              <span className="capitalize">{billingCycle}</span>
            </div>
            {selectedCycle.discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span>-{selectedCycle.discount}%</span>
              </div>
            )}
            <div className="border-t pt-2 mt-2 flex justify-between text-lg font-bold text-gray-900">
              <span>Total</span>
              <span>₹{totalAmount.toLocaleString("en-IN")}{billingCycle === "monthly" ? "/mo" : billingCycle === "quarterly" ? "/qtr" : "/yr"}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex items-center gap-2 bg-brand-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "Subscribing..." : `Subscribe — ₹${totalAmount.toLocaleString("en-IN")}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ModulesPage() {
  const { t } = useTranslation();
  const { data: modules, isLoading } = useModules();
  const { data: subscriptions } = useSubscriptions();
  const createSub = useCreateSubscription();
  const cancelSub = useCancelSubscription();
  const [subscribing, setSubscribing] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [subscribeModule, setSubscribeModule] = useState<any>(null);
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState<number | null>(null);
  const user = useAuthStore((s) => s.user);
  const canManageSubscriptions = user ? ADMIN_ROLES.includes(user.role) : false;

  // #1493 — Client-side name/description override. If a translation at
  // `modules.<slug>.name` or `modules.<slug>.description` exists the UI uses
  // it; otherwise it falls back to the DB-stored value. This lets translators
  // localise module marketing copy without requiring backend changes.
  const translateModuleField = (slug: string, field: "name" | "description", fallback: string) => {
    const key = `modules.${slug}.${field}`;
    const translated = t(key);
    return translated && translated !== key ? translated : fallback;
  };

  const activeSubscriptions = subscriptions?.filter((s: any) => s.status !== "cancelled") || [];
  const subscribedModuleIds = new Set(activeSubscriptions.map((s: any) => s.module_id));
  const subscriptionByModuleId: Record<number, any> = {};
  for (const s of activeSubscriptions) {
    subscriptionByModuleId[s.module_id] = s;
  }

  const handleUnsubscribe = async (moduleId: number) => {
    const sub = subscriptionByModuleId[moduleId];
    if (!sub) return;
    try {
      await cancelSub.mutateAsync(sub.id);
      setToast(t('modulesPage.subscriptionCancelled'));
      setTimeout(() => setToast(null), 5000);
      setConfirmUnsubscribe(null);
    } catch {
      setToast(t('modulesPage.cancelFailed'));
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleSubscribe = async (data: { module_id: number; plan_tier: string; total_seats: number; billing_cycle: string }) => {
    setSubscribing(data.module_id);
    try {
      await createSub.mutateAsync(data);
      setToast(t('modulesPage.subscriptionCreated'));
      setTimeout(() => setToast(null), 5000);
      setSubscribeModule(null);
    } finally {
      setSubscribing(null);
    }
  };

  if (isLoading) return <div className="text-gray-500">{t('modulesPage.loading')}</div>;

  const sortedModules = [...(modules || [])].sort((a: any, b: any) => {
    if (a.slug === "emp-hrms") return -1;
    if (b.slug === "emp-hrms") return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('modulesPage.title')}</h1>
        <p className="text-gray-500 mt-1">{t('modulesPage.subtitle')}</p>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <Check className="h-4 w-4" />
          {toast}
        </div>
      )}

      {subscribeModule && (
        <SubscribeModal
          module={subscribeModule}
          onClose={() => setSubscribeModule(null)}
          onSubscribe={handleSubscribe}
          isLoading={subscribing === subscribeModule.id}
        />
      )}

      {/* EMP AI Banner */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 mb-8 text-white">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{t('modulesPage.aiBannerTitle')}</h2>
            <p className="text-purple-100 text-sm mt-1">
              {t('modulesPage.aiBannerDesc')}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {sortedModules.map((mod: any) => {
          const isSubscribed = subscribedModuleIds.has(mod.id);
          const isExpanded = expandedId === mod.id;
          const isHRMS = mod.slug === "emp-hrms";
          // #1493 — resolve localized name/description (falls back to DB value).
          const displayName = translateModuleField(mod.slug, "name", mod.name);
          const displayDescription = translateModuleField(mod.slug, "description", mod.description || "");
          const descPreview = displayDescription.substring(0, 200);
          const hasMore = displayDescription.length > 200;
          // #1448 — lookup the active subscription so we can show a clickable
          // seat-count tile that navigates to the users list filtered by this
          // module. See the tile below.
          const activeSub = subscriptionByModuleId[mod.id];

          return (
            <div
              key={mod.id}
              className={`bg-white rounded-xl border p-6 transition-colors ${
                isHRMS
                  ? "border-brand-300 bg-brand-50/30 ring-1 ring-brand-100"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isHRMS ? "bg-brand-100" : "bg-brand-50"
                }`}>
                  {isHRMS ? (
                    <Building2 className="h-6 w-6 text-brand-600" />
                  ) : (
                    <Package className="h-6 w-6 text-brand-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-lg">{displayName}</h3>
                    <span className="text-xs text-gray-400">{mod.slug}</span>
                    {isHRMS && (
                      <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                        {t('modulesPage.coreIncludedFree')}
                      </span>
                    )}
                    {!!mod.has_free_tier && !isHRMS && (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{t('modulesPage.freeTier')}</span>
                    )}
                    {!mod.is_active && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t('modulesPage.comingSoon')}</span>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 leading-relaxed">
                    {isExpanded ? displayDescription : descPreview}
                    {!isExpanded && hasMore && "..."}
                  </p>

                  {/* #1448 — Clickable seat-count tile. Shows "N of M seats" for
                      subscribed modules and links to /users?module=<slug> so
                      admins can drill into which employees have a seat. The
                      /users list may not filter by module server-side yet; if
                      not, landing on /users with the query param still gives
                      admins a starting point. */}
                  {isSubscribed && activeSub && (
                    <Link
                      to={`/users?module=${mod.slug}`}
                      className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {t('modulesPage.seatsAssigned', { used: activeSub.used_seats, total: activeSub.total_seats })}
                    </Link>
                  )}

                  {hasMore && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium mt-2 flex items-center gap-0.5"
                    >
                      {isExpanded ? (
                        <>{t('dashboard.showLess')} <ChevronUp className="h-3 w-3" /></>
                      ) : (
                        <>{t('dashboard.readMore')} <ChevronDown className="h-3 w-3" /></>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex-shrink-0 ml-4">
                  {isHRMS ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-brand-600">
                      <Check className="h-4 w-4" /> {t('modulesPage.active')}
                    </span>
                  ) : isSubscribed ? (
                    <div className="flex flex-col items-end gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                        <Check className="h-4 w-4" /> {t('modulesPage.subscribed')}
                      </span>
                      {canManageSubscriptions && (
                        confirmUnsubscribe === mod.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{t('modulesPage.areYouSure')}</span>
                            <button
                              onClick={() => handleUnsubscribe(mod.id)}
                              disabled={cancelSub.isPending}
                              className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {cancelSub.isPending ? t('modulesPage.cancelling') : t('modulesPage.yesCancel')}
                            </button>
                            <button
                              onClick={() => setConfirmUnsubscribe(null)}
                              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                            >
                              {t('common.no')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmUnsubscribe(mod.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            {t('modulesPage.unsubscribe')}
                          </button>
                        )
                      )}
                    </div>
                  ) : canManageSubscriptions ? (
                    <button
                      onClick={() => setSubscribeModule(mod)}
                      disabled={!mod.is_active}
                      className="flex items-center gap-1.5 text-sm font-medium bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      {t('modulesPage.subscribe')}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">{t('modulesPage.notSubscribed')}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
