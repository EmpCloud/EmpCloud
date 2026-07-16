import { useModules, useSubscriptions, useCreateSubscription, useCancelSubscription } from "@/api/hooks";
import { Package, Check, Plus, ChevronDown, ChevronUp, Building2, X, Users, CreditCard, Calendar, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";

type PublicTier = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  price_per_seat: number | null; // smallest currency unit, null = not priced in this currency
};

type PublicCycle = {
  cycle: string;
  label: string;
  discount_pct: number;
  months_in_cycle: number;
  // If set and the org currency matches, this absolute per-seat amount
  // replaces the (monthlyPerSeat × (1 - discount%) × months) calc.
  override_amount_per_seat: number | null;
};

type PublicPricing = {
  currency: string;
  tiers: PublicTier[];
  cycles: PublicCycle[];
};

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$", GBP: "£", EUR: "€" };

function formatMoney(amount: number, currency: string) {
  const sym = CURRENCY_SYMBOL[currency] || currency;
  const major = amount / 100;
  return `${sym}${major.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const ADMIN_ROLES = ["org_admin", "hr_admin"];

interface SubscribeModalProps {
  module: any;
  onClose: () => void;
  onSubscribe: (data: { module_id: number; plan_tier: string; total_seats: number; billing_cycle: string }) => Promise<void>;
  isLoading: boolean;
}

function SubscribeModal({ module, onClose, onSubscribe, isLoading }: SubscribeModalProps) {
  const [totalSeats, setTotalSeats] = useState(10);

  // Pull every plan / price / cycle from the DB. Currency comes from the
  // org's settings (server resolves it). The query refetches whenever
  // seat count crosses a band boundary so volume-discount tiers show the
  // right price for the current input.
  const pricingQ = useQuery<{ data: PublicPricing }>({
    queryKey: ["public-pricing", totalSeats],
    queryFn: () =>
      api
        .get("/modules/pricing/public", { params: { seats: totalSeats } })
        .then((r) => r.data),
  });
  const pricing = pricingQ.data?.data;
  const tiers = pricing?.tiers ?? [];
  const cycles = pricing?.cycles ?? [];
  const currency = pricing?.currency || "INR";

  // Seed selections from whatever the server returns (first tier with a
  // price, first cycle). useState callbacks would also work but a
  // controlled fallback to the first match on every render keeps the
  // selection stable across band changes.
  const [planTier, setPlanTier] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<string>("");
  const selectedTier =
    tiers.find((t) => t.slug === planTier) ||
    tiers.find((t) => t.price_per_seat != null) ||
    tiers[0];
  const selectedCycle =
    cycles.find((c) => c.cycle === billingCycle) || cycles[0];

  const monthlyPerSeat = selectedTier?.price_per_seat ?? 0;
  const monthsInCycle = selectedCycle?.months_in_cycle ?? 1;
  // Override path: if admin set an absolute per-seat per-cycle amount for
  // this currency, use it directly. Treat 0 as "no override" because a 0
  // would silently zero the total -- if the admin wanted a free cycle
  // they should have picked the free tier.
  const override =
    selectedCycle?.override_amount_per_seat != null &&
    selectedCycle.override_amount_per_seat > 0
      ? selectedCycle.override_amount_per_seat
      : null;
  const perSeatPerCycle =
    override != null
      ? override
      : Math.round(
          monthlyPerSeat * (1 - (Number(selectedCycle?.discount_pct) || 0) / 100) * monthsInCycle,
        );
  const totalAmount = perSeatPerCycle * totalSeats;

  const handleSubmit = async () => {
    if (!selectedTier || !selectedCycle) return;
    await onSubscribe({
      module_id: module.id,
      plan_tier: selectedTier.slug,
      total_seats: totalSeats,
      billing_cycle: selectedCycle.cycle,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-foreground">Subscribe to {module.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">Configure your subscription</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Plan Tier Selection */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
              <CreditCard className="h-4 w-4" /> Select Plan
            </label>
            {pricingQ.isLoading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading plans...
              </div>
            ) : tiers.length === 0 ? (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
                No plans are currently published for this currency. Contact your administrator.
              </div>
            ) : (
              <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${Math.min(tiers.length, 3)}, minmax(0, 1fr))` }}>
                {tiers.map((plan) => {
                  const isSelected = (selectedTier?.slug || "") === plan.slug;
                  return (
                    <button
                      key={plan.slug}
                      onClick={() => setPlanTier(plan.slug)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40 ring-1 ring-brand-200"
                          : "border-border hover:border-brand-300 dark:hover:border-brand-800"
                      }`}
                    >
                      <div className="font-semibold text-sm text-foreground">{plan.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{plan.description}</div>
                      <div className="text-sm font-bold text-brand-600 dark:text-brand-400 mt-2">
                        {plan.price_per_seat != null
                          ? `${formatMoney(plan.price_per_seat, currency)}/seat/mo`
                          : "Not available"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Number of Seats */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
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
                className="bg-card text-foreground w-20 px-3 py-2 border border-border rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Each seat allows one employee to access this module</p>
          </div>

          {/* Billing Cycle */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
              <Calendar className="h-4 w-4" /> Billing Cycle
            </label>
            <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(cycles.length, 4))}, minmax(0, 1fr))` }}>
              {cycles.map((cycle) => {
                const isSelected = (selectedCycle?.cycle || "") === cycle.cycle;
                return (
                  <button
                    key={cycle.cycle}
                    onClick={() => setBillingCycle(cycle.cycle)}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${
                      isSelected
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40 ring-1 ring-brand-200"
                        : "border-border hover:border-brand-300 dark:hover:border-brand-800"
                    }`}
                  >
                    <div className="font-semibold text-sm text-foreground">{cycle.label}</div>
                    {Number(cycle.discount_pct) > 0 && (
                      <div className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">
                        Save {Number(cycle.discount_pct)}%
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price Summary */}
          <div className="bg-muted rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Plan</span>
              <span className="font-medium">{selectedTier?.name || "—"}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Price per seat</span>
              <span>{formatMoney(monthlyPerSeat, currency)}/mo</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Seats</span>
              <span>{totalSeats} users</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Billing cycle</span>
              <span>{selectedCycle?.label || "—"}</span>
            </div>
            {selectedCycle && Number(selectedCycle.discount_pct) > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                <span>Discount</span>
                <span>-{Number(selectedCycle.discount_pct)}%</span>
              </div>
            )}
            <div className="border-t border-border pt-2 mt-2 flex justify-between text-lg font-bold text-foreground">
              <span>Total</span>
              <span>
                {formatMoney(totalAmount, currency)}
                {(selectedCycle?.months_in_cycle ?? 1) === 1
                  ? "/mo"
                  : (selectedCycle?.months_in_cycle ?? 1) === 3
                    ? "/qtr"
                    : (selectedCycle?.months_in_cycle ?? 1) === 12
                      ? "/yr"
                      : `/${selectedCycle?.months_in_cycle}mo`}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-border bg-muted rounded-b-2xl">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex items-center gap-2 bg-brand-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isLoading
              ? "Subscribing..."
              : `Subscribe — ${formatMoney(totalAmount, currency)}`}
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

  if (isLoading) return <div className="text-muted-foreground">{t('modulesPage.loading')}</div>;

  const sortedModules = [...(modules || [])].sort((a: any, b: any) => {
    if (a.slug === "emp-hrms") return -1;
    if (b.slug === "emp-hrms") return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">{t('modulesPage.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('modulesPage.subtitle')}</p>
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
              className={`bg-card rounded-xl border p-6 transition-colors ${
                isHRMS
                  ? "border-brand-300 dark:border-brand-800 bg-brand-50/30 dark:bg-brand-950/20 ring-1 ring-brand-100 dark:ring-brand-900"
                  : "border-border hover:border-brand-300 dark:hover:border-brand-800"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isHRMS ? "bg-brand-100 dark:bg-brand-950/40" : "bg-brand-50 dark:bg-brand-950/40"
                }`}>
                  {isHRMS ? (
                    <Building2 className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                  ) : (
                    <Package className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-foreground text-lg">{displayName}</h3>
                    <span className="text-xs text-muted-foreground">{mod.slug}</span>
                    {isHRMS && (
                      <span className="text-xs bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full font-medium">
                        {t('modulesPage.coreIncludedFree')}
                      </span>
                    )}
                    {!!mod.has_free_tier && !isHRMS && (
                      <span className="text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">{t('modulesPage.freeTier')}</span>
                    )}
                    {!mod.is_active && (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{t('modulesPage.comingSoon')}</span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed">
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
                      className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 hover:underline"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {t('modulesPage.seatsAssigned', { used: activeSub.used_seats, total: activeSub.total_seats })}
                    </Link>
                  )}

                  {hasMore && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                      className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium mt-2 flex items-center gap-0.5"
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
                    <span className="flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400">
                      <Check className="h-4 w-4" /> {t('modulesPage.active')}
                    </span>
                  ) : isSubscribed ? (
                    <div className="flex flex-col items-end gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                        <Check className="h-4 w-4" /> {t('modulesPage.subscribed')}
                      </span>
                      {canManageSubscriptions && (
                        confirmUnsubscribe === mod.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{t('modulesPage.areYouSure')}</span>
                            <button
                              onClick={() => handleUnsubscribe(mod.id)}
                              disabled={cancelSub.isPending}
                              className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {cancelSub.isPending ? t('modulesPage.cancelling') : t('modulesPage.yesCancel')}
                            </button>
                            <button
                              onClick={() => setConfirmUnsubscribe(null)}
                              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
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
                    <span className="text-xs text-muted-foreground">{t('modulesPage.notSubscribed')}</span>
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
