import { useModules, useSubscriptions, useCreateSubscription } from "@/api/hooks";
import { Package, Check, Plus, ChevronDown, ChevronUp, Building2 } from "lucide-react";
import { useState } from "react";

export default function ModulesPage() {
  const { data: modules, isLoading } = useModules();
  const { data: subscriptions } = useSubscriptions();
  const createSub = useCreateSubscription();
  const [subscribing, setSubscribing] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const subscribedModuleIds = new Set(
    subscriptions?.filter((s: any) => s.status !== "cancelled").map((s: any) => s.module_id) || []
  );

  const handleSubscribe = async (moduleId: number) => {
    setSubscribing(moduleId);
    try {
      await createSub.mutateAsync({
        module_id: moduleId,
        plan_tier: "basic",
        total_seats: 10,
        billing_cycle: "monthly",
      });
    } finally {
      setSubscribing(null);
    }
  };

  if (isLoading) return <div className="text-gray-500">Loading modules...</div>;

  // Sort: emp-hrms first, then alphabetical
  const sortedModules = [...(modules || [])].sort((a: any, b: any) => {
    if (a.slug === "emp-hrms") return -1;
    if (b.slug === "emp-hrms") return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Module Marketplace</h1>
        <p className="text-gray-500 mt-1">Browse and subscribe to EMP modules for your organization.</p>
      </div>

      <div className="space-y-4">
        {sortedModules.map((mod: any) => {
          const isSubscribed = subscribedModuleIds.has(mod.id);
          const isExpanded = expandedId === mod.id;
          const isHRMS = mod.slug === "emp-hrms";
          const descPreview = mod.description?.substring(0, 200);
          const hasMore = mod.description?.length > 200;

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
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 text-lg">{mod.name}</h3>
                    <span className="text-xs text-gray-400">{mod.slug}</span>
                    {isHRMS && (
                      <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                        Core — Included Free
                      </span>
                    )}
                    {mod.has_free_tier && !isHRMS && (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Free tier</span>
                    )}
                    {!mod.is_active && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Coming soon</span>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 leading-relaxed">
                    {isExpanded ? mod.description : descPreview}
                    {!isExpanded && hasMore && "..."}
                  </p>

                  {hasMore && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium mt-2 flex items-center gap-0.5"
                    >
                      {isExpanded ? (
                        <>Show less <ChevronUp className="h-3 w-3" /></>
                      ) : (
                        <>Read more <ChevronDown className="h-3 w-3" /></>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex-shrink-0 ml-4">
                  {isHRMS ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-brand-600">
                      <Check className="h-4 w-4" /> Active
                    </span>
                  ) : isSubscribed ? (
                    <button disabled className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                      <Check className="h-4 w-4" /> Subscribed
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(mod.id)}
                      disabled={subscribing === mod.id || !mod.is_active}
                      className="flex items-center gap-1.5 text-sm font-medium bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      {subscribing === mod.id ? "..." : "Subscribe"}
                    </button>
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
