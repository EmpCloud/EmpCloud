import { useSubscriptions, useBillingSummary, useModules } from "@/api/hooks";
import { CreditCard, TrendingUp } from "lucide-react";

export default function SubscriptionsPage() {
  const { data: subscriptions, isLoading } = useSubscriptions();
  const { data: billing } = useBillingSummary();
  const { data: modules } = useModules();

  const moduleMap = new Map(modules?.map((m: any) => [m.id, m]) || []);

  const formatCurrency = (amount: number, currency: string) => {
    const val = amount / 100; // smallest unit to major
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(val);
  };

  if (isLoading) return <div className="text-gray-500">Loading subscriptions...</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="text-gray-500 mt-1">Manage your module subscriptions and billing.</p>
      </div>

      {/* Billing summary */}
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

      {/* Subscriptions list */}
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
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  sub.status === "active" ? "bg-green-50 text-green-700" :
                  sub.status === "trial" ? "bg-yellow-50 text-yellow-700" :
                  "bg-red-50 text-red-700"
                }`}>
                  {sub.status}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-500">Plan</p>
                  <p className="text-sm font-medium text-gray-900 capitalize">{sub.plan_tier}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Seats</p>
                  <p className="text-sm font-medium text-gray-900">{sub.used_seats}/{sub.total_seats}</p>
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
    </div>
  );
}
