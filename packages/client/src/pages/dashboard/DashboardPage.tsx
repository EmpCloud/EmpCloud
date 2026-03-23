import { useOrgStats, useSubscriptions, useModules, useDashboardWidgets, useBillingOverviewSummary } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { Users, Package, ExternalLink, Building2, Shield, Clock, CalendarDays, FileText, Megaphone, BookOpen, ChevronRight, Briefcase, Target, Award, UserMinus, Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import WidgetCard, { Stat } from "@/components/dashboard/WidgetCard";

const hrmsQuickLinks = [
  { path: "/employees", label: "Employee Directory", icon: Users, color: "bg-blue-50 text-blue-600" },
  { path: "/attendance", label: "Attendance", icon: Clock, color: "bg-green-50 text-green-600" },
  { path: "/leave", label: "Leave Management", icon: CalendarDays, color: "bg-purple-50 text-purple-600" },
  { path: "/documents", label: "Documents", icon: FileText, color: "bg-orange-50 text-orange-600" },
  { path: "/announcements", label: "Announcements", icon: Megaphone, color: "bg-pink-50 text-pink-600" },
  { path: "/policies", label: "Policies", icon: BookOpen, color: "bg-teal-50 text-teal-600" },
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: stats } = useOrgStats();
  const { data: subscriptions } = useSubscriptions();
  const { data: modules } = useModules();
  const { data: widgets, isLoading: widgetsLoading } = useDashboardWidgets();
  const { data: billingSummary } = useBillingOverviewSummary();
  const [expandedModule, setExpandedModule] = useState<number | null>(null);

  const activeSubscriptions = subscriptions?.filter(
    (s: any) => s.status === "active" || s.status === "trial"
  ) || [];

  const moduleMap = new Map(modules?.map((m: any) => [m.id, m]) || []);

  // Build lookup sets for widget visibility and module URLs
  const subscribedSlugs = new Set(
    activeSubscriptions.map((s: any) => (moduleMap.get(s.module_id) as any)?.slug).filter(Boolean)
  );
  const moduleBaseUrls = new Map<string, string>(
    modules?.filter((m: any) => m.base_url).map((m: any) => [m.slug, m.base_url]) || []
  );

  // Core HRMS is the platform itself — not a module in the DB
  const hrmsModule = {
    name: "EMP Cloud — Core HRMS",
    description: "Your complete HR management platform. Manage employee profiles, track attendance with shifts and geo-fencing, handle leave applications with multi-level approvals, organize employee documents with expiry tracking, publish company-wide announcements, and manage policies with acknowledgment tracking. All included free with your EMP Cloud subscription.",
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.first_name}
        </h1>
        <p className="text-gray-500 mt-1">Here's what's happening with your organization.</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.total_users ?? "..."}</p>
              <p className="text-sm text-gray-500">Total Users</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-green-50 flex items-center justify-center">
              <Package className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.active_subscriptions ?? "..."}</p>
              <p className="text-sm text-gray-500">Active Modules</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-purple-50 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.total_departments ?? "..."}</p>
              <p className="text-sm text-gray-500">Departments</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-amber-50 flex items-center justify-center">
              <Shield className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">SOC 2</p>
              <p className="text-sm text-gray-500">Compliant</p>
            </div>
          </div>
        </div>
        <Link
          to="/billing"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-brand-300 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Receipt className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {billingSummary
                  ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
                      (billingSummary.monthlyRecurring ?? 0) / 100
                    )
                  : "..."}
              </p>
              <p className="text-sm text-gray-500">
                Billing{billingSummary?.overdueCount ? ` (${billingSummary.overdueCount} overdue)` : ""}
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Core HRMS — Always shown (it IS the platform) */}
      {hrmsModule && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Core HRMS</h2>
          <div className="bg-gradient-to-r from-brand-600 to-brand-700 rounded-xl p-8 text-white">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">
                    Included Free
                  </span>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">
                    Active
                  </span>
                </div>
                <h3 className="text-xl font-bold mb-2">{hrmsModule.name}</h3>
              </div>
              <div className="h-12 w-12 rounded-lg bg-white/10 flex items-center justify-center">
                <Building2 className="h-7 w-7 text-white" />
              </div>
            </div>
            <p className="text-sm text-white/80 leading-relaxed mb-6 max-w-3xl">
              {hrmsModule.description?.substring(0, 300)}...
            </p>

            {/* Quick Links Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {hrmsQuickLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="bg-white/10 hover:bg-white/20 rounded-lg p-3 text-center transition-colors group"
                >
                  <link.icon className="h-5 w-5 mx-auto mb-1.5 text-white/80 group-hover:text-white" />
                  <span className="text-xs font-medium text-white/90">{link.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Module Insights — live data from subscribed module APIs */}
      {activeSubscriptions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Module Insights</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Recruit Widget */}
            {subscribedSlugs.has("emp-recruit") && (
              <WidgetCard
                title="Recruitment"
                icon={Briefcase}
                color="indigo"
                moduleUrl={moduleBaseUrls.get("emp-recruit")}
                isLoading={widgetsLoading}
                isOffline={!widgetsLoading && widgets?.recruit === null}
              >
                <Stat label="Open Jobs" value={widgets?.recruit?.openJobs as number} />
                <Stat label="Candidates" value={widgets?.recruit?.totalCandidates as number} />
                <Stat label="Recent Hires" value={widgets?.recruit?.recentHires as number} />
              </WidgetCard>
            )}

            {/* Performance Widget */}
            {subscribedSlugs.has("emp-performance") && (
              <WidgetCard
                title="Performance"
                icon={Target}
                color="green"
                moduleUrl={moduleBaseUrls.get("emp-performance")}
                isLoading={widgetsLoading}
                isOffline={!widgetsLoading && widgets?.performance === null}
              >
                <Stat label="Active Cycles" value={widgets?.performance?.activeCycles as number} />
                <Stat label="Pending Reviews" value={widgets?.performance?.pendingReviews as number} />
                <Stat label="Goal Completion" value={widgets?.performance?.goalCompletion != null ? `${widgets.performance.goalCompletion}%` : undefined} />
              </WidgetCard>
            )}

            {/* Rewards Widget */}
            {subscribedSlugs.has("emp-rewards") && (
              <WidgetCard
                title="Recognition"
                icon={Award}
                color="amber"
                moduleUrl={moduleBaseUrls.get("emp-rewards")}
                isLoading={widgetsLoading}
                isOffline={!widgetsLoading && widgets?.rewards === null}
              >
                <Stat label="Kudos This Month" value={widgets?.rewards?.totalKudos as number} />
                <Stat label="Points Given" value={widgets?.rewards?.pointsDistributed as number} />
                <Stat label="Badges Earned" value={widgets?.rewards?.badgesAwarded as number} />
              </WidgetCard>
            )}

            {/* Exit Widget */}
            {subscribedSlugs.has("emp-exit") && (
              <WidgetCard
                title="Exit & Attrition"
                icon={UserMinus}
                color="rose"
                moduleUrl={moduleBaseUrls.get("emp-exit")}
                isLoading={widgetsLoading}
                isOffline={!widgetsLoading && widgets?.exit === null}
              >
                <Stat label="Active Exits" value={widgets?.exit?.activeExits as number} />
                <Stat label="Attrition Rate" value={widgets?.exit?.attritionRate != null ? `${widgets.exit.attritionRate}%` : undefined} />
              </WidgetCard>
            )}
          </div>
        </div>
      )}

      {/* Subscribed Modules */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Modules</h2>
      {activeSubscriptions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No paid modules yet. Core HRMS is active above.</p>
          <Link to="/modules" className="text-brand-600 text-sm font-medium hover:text-brand-700 mt-2 inline-block">
            Browse module marketplace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeSubscriptions.map((sub: any) => {
            const mod = moduleMap.get(sub.module_id) as any;
            const isExpanded = expandedModule === sub.id;
            return (
              <div
                key={sub.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:border-brand-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
                      <Package className="h-5 w-5 text-brand-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{mod?.name || "Module"}</h3>
                      <p className="text-xs text-gray-400">{mod?.slug}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    sub.status === "active"
                      ? "bg-green-50 text-green-700"
                      : "bg-yellow-50 text-yellow-700"
                  }`}>
                    {sub.status}
                  </span>
                </div>

                {/* Description - truncated with expand */}
                <p className="text-sm text-gray-500 mb-3 leading-relaxed">
                  {isExpanded
                    ? mod?.description
                    : mod?.description?.substring(0, 150) + (mod?.description?.length > 150 ? "..." : "")
                  }
                </p>
                {mod?.description?.length > 150 && (
                  <button
                    onClick={() => setExpandedModule(isExpanded ? null : sub.id)}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium mb-3 flex items-center gap-0.5"
                  >
                    {isExpanded ? "Show less" : "Read more"}
                    <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>
                )}

                <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                  <span>{sub.used_seats}/{sub.total_seats} seats used</span>
                  <span className="capitalize text-xs bg-gray-100 px-2 py-0.5 rounded-full">{sub.plan_tier}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
                  <div
                    className="bg-brand-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (sub.used_seats / sub.total_seats) * 100)}%` }}
                  />
                </div>

                {mod?.base_url && (
                  <a
                    href={`${mod.base_url}?sso_token=${encodeURIComponent(useAuthStore.getState().accessToken || "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Launch <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
