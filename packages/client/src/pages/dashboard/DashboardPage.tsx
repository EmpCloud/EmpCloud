import { useOrgStats, useSubscriptions, useModules, useDashboardWidgets, useBillingOverviewSummary } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/use-permissions";
import { useTranslation } from "react-i18next";
import { AlertCircle, Award, BookOpen, Briefcase, Building2, CalendarDays, CheckCircle2, ChevronRight, Clock, ExternalLink, FileText, Fingerprint, FolderKanban, GraduationCap, MapPin, Megaphone, MonitorPlay, Package, Receipt, Shield, Target, UserMinus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback } from "react";
import WidgetCard, { Stat } from "@/components/dashboard/WidgetCard";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import axios from "axios";

interface Subscription {
  id: number;
  module_id: number;
  status: string;
  plan_tier: string;
  used_seats: number;
  total_seats: number;
}

interface Module {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  base_url: string | null;
}

function StatCardSkeleton() {
  return (
    <div className="min-h-[88px] animate-pulse rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 h-3 w-20 rounded bg-muted" />
          <div className="h-7 w-16 rounded bg-muted" />
        </div>
        <div className="h-10 w-10 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

function MiniBars({ color }: { color: "emerald" | "violet" }) {
  const colorClass = color === "emerald" ? "bg-emerald-400" : "bg-violet-400";
  return (
    <span className="flex h-6 items-end gap-1 opacity-75">
      {[9, 14, 19, 24].map((height, index) => (
        <span key={height} className={`${colorClass} w-1.5 rounded-t-sm`} style={{ height: `${height - index}px` }} />
      ))}
    </span>
  );
}

function PeopleCluster({ count }: { count: number }) {
  return (
    <span className="flex items-center -space-x-1.5">
      {["bg-blue-200", "bg-violet-200", "bg-amber-200"].map((color) => (
        <span key={color} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-card ${color}`}>
          <Users className="h-3 w-3 text-slate-600" />
        </span>
      ))}
      <span className="relative flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-card bg-muted px-1.5 text-[9px] font-semibold text-muted-foreground">
        +{Math.max(0, count - 3)}
      </span>
    </span>
  );
}

const hrmsQuickLinkKeys = [
  { path: "/employees", labelKey: "dashboard.quickLinks.employees", icon: Users, color: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" },
  { path: "/attendance", labelKey: "dashboard.quickLinks.attendance", icon: Clock, color: "bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400" },
  { path: "/leave", labelKey: "dashboard.quickLinks.leave", icon: CalendarDays, color: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400" },
  { path: "/documents", labelKey: "dashboard.quickLinks.documents", icon: FileText, color: "bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400" },
  { path: "/announcements", labelKey: "dashboard.quickLinks.announcements", icon: Megaphone, color: "bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400" },
  { path: "/policies", labelKey: "dashboard.quickLinks.policies", icon: BookOpen, color: "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400" },
];

const moduleIconMap = {
  "emp-recruit": Briefcase,
  "emp-performance": Target,
  "emp-rewards": Award,
  "emp-exit": UserMinus,
  "emp-lms": GraduationCap,
  "emp-monitor": MonitorPlay,
  "emp-projects": FolderKanban,
  "emp-field": MapPin,
  "emp-biometrics": Fingerprint,
  "emp-payroll": Receipt,
} as const;

const dashboardModuleOrder = [
  "emp-biometrics",
  "emp-lms",
  "emp-recruit",
  "emp-performance",
  "emp-field",
  "emp-exit",
] as const;

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { hasAll } = usePermissions();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useOrgStats();
  const { data: subscriptions } = useSubscriptions();
  const { data: modules } = useModules();
  const { data: widgets, isLoading: widgetsLoading } = useDashboardWidgets();
  const { data: billingSummary, isLoading: billingLoading } = useBillingOverviewSummary();
  const activeSubscriptions: Subscription[] = subscriptions?.filter(
    (s: Subscription) => s.status === "active" || s.status === "trial"
  ) || [];

  const moduleMap = new Map<number, Module>(modules?.map((m: Module) => [m.id, m]) || []);
  const moduleOrderIndex = new Map<string, number>(dashboardModuleOrder.map((slug, index) => [slug, index]));
  const orderedActiveSubscriptions = [...activeSubscriptions].sort((first, second) => {
    const firstOrder = moduleOrderIndex.get(moduleMap.get(first.module_id)?.slug ?? "") ?? dashboardModuleOrder.length;
    const secondOrder = moduleOrderIndex.get(moduleMap.get(second.module_id)?.slug ?? "") ?? dashboardModuleOrder.length;
    return firstOrder - secondOrder;
  });

  // Build lookup sets for widget visibility and module URLs
  const subscribedSlugs = new Set(
    activeSubscriptions.map((s) => moduleMap.get(s.module_id)?.slug).filter(Boolean)
  );
  const moduleBaseUrls = new Map<string, string>(
    modules?.filter((m: Module) => m.base_url).map((m: Module) => [m.slug, m.base_url!]) || []
  );

  // Show a dedicated SSO entry to EMP Monitor as Admin when:
  //   1. the user holds every monitor:* permission, AND
  //   2. the org actually has an active emp-monitor subscription.
  // Previously this only checked permissions, so a super_admin in an org
  // that hadn't subscribed to Monitor still saw the "Login as Admin" banner
  // -- clicking it would land them on a SSO target the customer is not
  // entitled to.
  const hasMonitorPerms = hasAll(
    "monitor:view_own",
    "monitor:view_team",
    "monitor:view_all",
    "monitor:manage_settings",
  );
  const isMonitorAdmin = hasMonitorPerms && subscribedSlugs.has("emp-monitor");

  // Launch a module with a fresh SSO token. Attempts to refresh the EmpCloud
  // access token first so the SSO exchange on the target module always succeeds.
  const launchModule = useCallback(async (baseUrl: string) => {
    let token = useAuthStore.getState().accessToken || "";

    // Try to refresh so we pass a non-expired token to the module SSO
    const refreshToken = useAuthStore.getState().refreshToken;
    if (refreshToken) {
      try {
        const { data } = await axios.post("/oauth/token", {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: "empcloud-dashboard",
        });
        if (data.access_token) {
          useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
          token = data.access_token;
        }
      } catch {
        // Refresh failed — use the existing token (backend has a 1-hour grace period)
      }
    }

    const returnUrl = encodeURIComponent(`${window.location.origin}/dashboard`);
    const ssoUrl = `${baseUrl}?sso_token=${encodeURIComponent(token)}&return_url=${returnUrl}`;
    window.open(ssoUrl, "_blank", "noopener,noreferrer");
  }, []);

  // Core HRMS is the platform itself — not a module in the DB
  const hrmsModule = {
    name: t('dashboard.coreHRMSName'),
    description: t('dashboard.coreHRMSDescription'),
  };
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const formattedToday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
  const formattedBilling = billingSummary
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency: billingSummary.currency || "INR",
        maximumFractionDigits: 0,
      }).format((billingSummary.monthlyRecurring ?? 0) / 100)
    : "--";

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-pretty text-xl font-bold leading-6 tracking-tight text-foreground">
            <span aria-hidden="true" className="me-2">👋</span>
            {t('common.welcome')}, {user?.first_name}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <div className="inline-flex items-center gap-2.5 self-start rounded-xl border border-border bg-card px-3 py-1.5 shadow-sm">
          <CalendarDays aria-hidden="true" className="h-4 w-4 text-brand-500" />
          <div>
            <time className="block text-xs font-semibold text-foreground" dateTime={new Date().toISOString().slice(0, 10)}>{formattedToday}</time>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{t("dashboard.productiveDay")}</p>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : statsError ? (
          <div className="rounded-2xl border border-red-200 bg-card p-6 text-center sm:col-span-2 xl:col-span-5 dark:border-red-900/40">
            <AlertCircle aria-hidden="true" className="mx-auto mb-2 h-8 w-8 text-red-400" />
            <p className="text-sm text-red-600 dark:text-red-400">{t("dashboard.statsError")}</p>
          </div>
        ) : (
          <>
            <DashboardMetricCard
              to="/users"
              label={t("dashboard.totalUsers")}
              value={stats?.total_users ?? 0}
              icon={Users}
              tone="blue"
              decoration={<PeopleCluster count={stats?.total_users ?? 0} />}
            />
            <DashboardMetricCard
              to="/modules"
              label={t("dashboard.activeModules")}
              value={stats?.active_subscriptions ?? 0}
              icon={Package}
              tone="emerald"
              decoration={<MiniBars color="emerald" />}
            />
            <DashboardMetricCard
              to="/settings"
              label={t("dashboard.departments")}
              value={stats?.total_departments ?? 0}
              icon={Building2}
              tone="violet"
              decoration={<MiniBars color="violet" />}
            />
            <DashboardMetricCard
              label={t("dashboard.compliant")}
              value="SOC 2"
              icon={Shield}
              tone="amber"
              supporting={
                <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("dashboard.certified")}
                </span>
              }
            />
            <DashboardMetricCard
              to="/billing"
              label={t("nav.billing")}
              value={billingLoading ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-muted" /> : formattedBilling}
              icon={Receipt}
              tone="cyan"
              supporting={billingSummary?.overdueCount ? `${billingSummary.overdueCount} ${t("dashboard.overdue")}` : t("dashboard.billingUpToDate")}
            />
          </>
        )}
      </div>

      {/* Core HRMS — Always shown (it IS the platform) */}
      <section aria-labelledby="core-hrms-heading" className="mb-3">
        <div className="relative overflow-hidden rounded-2xl border border-[#b9dcff] bg-gradient-to-br from-[#e5f3ff] via-[#edf7ff] to-[#ddf2ff] p-3 shadow-sm dark:border-brand-900/70 dark:from-brand-950/50 dark:via-card dark:to-cyan-950/30">
          <div aria-hidden="true" className="absolute -end-24 -top-24 h-64 w-64 rounded-full bg-brand-200/55 blur-3xl dark:bg-brand-800/20" />
          <div aria-hidden="true" className="absolute bottom-0 start-1/3 h-28 w-72 rounded-full bg-cyan-200/50 blur-3xl dark:bg-cyan-900/20" />
          <div aria-hidden="true" className="absolute inset-y-0 end-0 w-2/5 bg-[linear-gradient(135deg,transparent_15%,rgba(255,255,255,0.52)_15%,rgba(255,255,255,0.18)_62%,transparent_62%)] dark:opacity-10" />

          <div className="relative grid min-h-[128px] items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.55fr)_minmax(145px,0.35fr)]">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-600 px-3 py-1 text-[10px] font-semibold text-white">
                  {t("dashboard.includedFree")}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {t("common.active")}
                </span>
              </div>
              <h2 id="core-hrms-heading" className="text-pretty text-2xl font-bold tracking-tight text-foreground">
                {hrmsModule.name}
              </h2>
              <p className="mt-1.5 max-w-3xl text-[11px] leading-[1.55] text-muted-foreground">
                {hrmsModule.description}
              </p>
            </div>

            <div className="relative hidden lg:block">
              <div className="-rotate-2 rounded-xl border border-white/80 bg-card/90 p-2 shadow-xl shadow-brand-900/10 backdrop-blur dark:border-border">
                <div className="mb-1 flex items-center justify-between border-b border-border pb-1">
                  <div className="flex items-center gap-2">
                    <img src="/empcloud-icon.png" alt="" width="20" height="20" className="h-5 w-5" />
                    <span className="text-xs font-semibold text-foreground">EMP Cloud</span>
                  </div>
                  <span className="h-2 w-16 rounded-full bg-muted" />
                </div>
                <div className="space-y-1">
                  {hrmsQuickLinkKeys.slice(0, 4).map((link) => (
                    <div key={link.path} className="flex items-center gap-2 rounded-md bg-background/80 px-2 py-0.5">
                      <span className={`flex h-4 w-4 items-center justify-center rounded ${link.color}`}>
                        <link.icon aria-hidden="true" className="h-2.5 w-2.5" />
                      </span>
                      <span className="text-[10px] font-medium leading-4 text-foreground">{t(link.labelKey)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {[CalendarDays, FileText, Users].map((FloatingIcon, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  className={`absolute flex h-9 w-9 items-center justify-center rounded-lg border border-white/80 bg-card shadow-lg ${index === 0 ? "-start-5 top-5 text-brand-600" : index === 1 ? "-start-2 bottom-0 text-orange-500" : "-end-4 top-9 text-cyan-600"}`}
                >
                  <FloatingIcon className="h-4 w-4" />
                </span>
              ))}
            </div>

            <div className="relative hidden pt-3 text-center lg:block">
              <p className="text-[9px] font-medium text-muted-foreground">{t("dashboard.trustedByModernTeams")}</p>
              <p className="mt-0.5 text-sm font-bold leading-4 text-foreground">{t("dashboard.simplerHR")}</p>
              <p className="mt-4 -rotate-6 text-balance text-sm font-semibold italic leading-5 text-brand-700/75 dark:text-brand-300/80">
                {t("dashboard.heroTagline")}
              </p>
            </div>
          </div>

          <nav aria-label={t("dashboard.coreHRMS")} className="relative mt-2 grid grid-cols-2 gap-2 border-t border-brand-200/70 pt-2 sm:grid-cols-3 xl:grid-cols-6 dark:border-brand-900/60">
            {hrmsQuickLinkKeys.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="group flex min-h-9 items-center gap-2 rounded-xl border border-white/80 bg-card/80 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-border"
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${link.color}`}>
                  <link.icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate">{t(link.labelKey)}</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* Module Insights — live data from subscribed module APIs */}
      {activeSubscriptions.length > 0 && (
        <section aria-labelledby="module-insights-heading" className="mb-4">
          <div className="mb-1 flex items-start justify-between gap-4">
            <div>
              <h2 id="module-insights-heading" className="text-base font-semibold text-foreground">{t("dashboard.moduleInsights")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("dashboard.moduleInsightsDescription")}</p>
            </div>
            <span className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm sm:inline-flex">
              <CalendarDays aria-hidden="true" className="h-4 w-4" />
              {t("dashboard.last30Days")}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {/* Recruit Widget */}
            {subscribedSlugs.has("emp-recruit") && (
              <WidgetCard
                title={t('widgets.recruit.title')}
                icon={Briefcase}
                color="indigo"
                moduleUrl={moduleBaseUrls.get("emp-recruit")}
                isLoading={widgetsLoading}
                isOffline={!widgetsLoading && widgets?.recruit === null}
              >
                <Stat label={t('widgets.recruit.openJobs')} value={widgets?.recruit?.openJobs as number} />
                <Stat label={t('widgets.recruit.candidates')} value={widgets?.recruit?.totalCandidates as number} />
                <Stat label={t('widgets.recruit.recentHires')} value={widgets?.recruit?.recentHires as number} />
              </WidgetCard>
            )}

            {/* Performance Widget */}
            {subscribedSlugs.has("emp-performance") && (
              <WidgetCard
                title={t('widgets.performance.title')}
                icon={Target}
                color="green"
                moduleUrl={moduleBaseUrls.get("emp-performance")}
                isLoading={widgetsLoading}
                isOffline={!widgetsLoading && widgets?.performance === null}
              >
                <Stat label={t('widgets.performance.activeCycles')} value={widgets?.performance?.activeCycles as number} />
                <Stat label={t('widgets.performance.pendingReviews')} value={widgets?.performance?.pendingReviews as number} />
                <Stat label={t('widgets.performance.goalCompletion')} value={widgets?.performance?.goalCompletion != null ? `${widgets.performance.goalCompletion}%` : undefined} />
              </WidgetCard>
            )}

            {/* Rewards Widget */}
            {subscribedSlugs.has("emp-rewards") && (
              <WidgetCard
                title={t('widgets.rewards.title')}
                icon={Award}
                color="amber"
                moduleUrl={moduleBaseUrls.get("emp-rewards")}
                isLoading={widgetsLoading}
                isOffline={!widgetsLoading && widgets?.rewards === null}
              >
                <Stat label={t('widgets.rewards.kudosThisMonth')} value={widgets?.rewards?.totalKudos as number} />
                <Stat label={t('widgets.rewards.pointsGiven')} value={widgets?.rewards?.pointsDistributed as number} />
                <Stat label={t('widgets.rewards.badgesEarned')} value={widgets?.rewards?.badgesAwarded as number} />
              </WidgetCard>
            )}

            {/* Exit Widget */}
            {subscribedSlugs.has("emp-exit") && (
              <WidgetCard
                title={t('widgets.exit.title')}
                icon={UserMinus}
                color="rose"
                moduleUrl={moduleBaseUrls.get("emp-exit")}
                isLoading={widgetsLoading}
                isOffline={!widgetsLoading && widgets?.exit === null}
              >
                <Stat label={t('widgets.exit.activeExits')} value={widgets?.exit?.activeExits as number} />
                <Stat label={t('widgets.exit.attritionRate')} value={widgets?.exit?.attritionRate != null ? `${widgets.exit.attritionRate}%` : undefined} />
              </WidgetCard>
            )}

          </div>
        </section>
      )}

      {/* Monitor Admin SSO -- visible only when the user holds every monitor:* permission. */}
      {isMonitorAdmin && moduleBaseUrls.get("emp-monitor") && (
        <section aria-labelledby="monitor-admin-heading" className="relative mb-4 overflow-hidden rounded-xl bg-gradient-to-r from-[#07132f] via-[#102860] to-[#2161dc] p-3 text-white shadow-lg shadow-blue-950/10">
          <svg
            aria-hidden="true"
            viewBox="0 0 1200 96"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-35"
          >
            <defs>
              <linearGradient id="monitor-wave" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0" />
                <stop offset="55%" stopColor="#60a5fa" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.72" />
              </linearGradient>
            </defs>
            <path d="M400 74C540 64 582 20 724 24C866 28 934 84 1200 47" fill="none" stroke="url(#monitor-wave)" strokeWidth="1.4" />
            <path d="M458 88C601 69 645 36 757 38C911 41 979 78 1200 31" fill="none" stroke="url(#monitor-wave)" strokeWidth="1" />
            <path d="M590 93C703 66 731 53 845 54C996 55 1062 65 1200 19" fill="none" stroke="url(#monitor-wave)" strokeWidth="0.8" />
          </svg>
          <div aria-hidden="true" className="absolute inset-y-0 end-0 w-1/3 bg-[radial-gradient(circle_at_center,rgba(96,165,250,0.2),transparent_68%)]" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 shadow-inner shadow-white/5">
                <MonitorPlay aria-hidden="true" className="h-5 w-5 text-blue-200" />
              </div>
              <div>
                <h2 id="monitor-admin-heading" className="text-xs font-semibold tracking-[0.01em]">{t("dashboard.monitorAdminTitle")}</h2>
                <p className="mt-0.5 text-[10px] leading-4 text-blue-100/75">
                  {t("dashboard.monitorAdminDescription")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => launchModule(moduleBaseUrls.get("emp-monitor")!)}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950"
            >
              {t("dashboard.loginAsAdmin")}
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* Subscribed Modules */}
      <section aria-labelledby="your-modules-heading">
      <div className="mb-2">
        <div>
          <h2 id="your-modules-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-foreground">{t("dashboard.yourModules")}</h2>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t("dashboard.yourModulesDescription")}</p>
        </div>
      </div>
      {activeSubscriptions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Package aria-hidden="true" className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">{t('dashboard.noModulesYet')}</p>
          <Link to="/modules" className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400">
            {t('dashboard.browseModules')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orderedActiveSubscriptions.map((sub) => {
            const mod = moduleMap.get(sub.module_id);
            const ModuleIcon = moduleIconMap[mod?.slug as keyof typeof moduleIconMap] || Package;
            const hasBaseUrl = !!mod?.base_url;
            // i18n lookup with DB fallback. t() returns the key itself when no translation exists.
            const nameKey = `modules.${mod?.slug}.name`;
            const descKey = `modules.${mod?.slug}.description`;
            const translatedName = t(nameKey);
            const translatedDesc = t(descKey);
            const displayName = translatedName === nameKey ? (mod?.name || "Module") : translatedName;
            const displayDesc = translatedDesc === descKey ? (mod?.description ?? "") : translatedDesc;
            const statusKey = `common.${sub.status}`;
            const translatedStatus = t(statusKey);
            const displayStatus = translatedStatus === statusKey ? sub.status : translatedStatus;
            const planKey = `plans.${sub.plan_tier?.toLowerCase?.() ?? ""}`;
            const translatedPlan = t(planKey);
            const displayPlan = translatedPlan === planKey ? sub.plan_tier : translatedPlan;
            return (
              <div
                key={sub.id}
                className="flex min-h-[142px] flex-col rounded-lg border border-border bg-card p-3 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                      <ModuleIcon aria-hidden="true" className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0">
                      {hasBaseUrl ? (
                        <button
                          type="button"
                          onClick={() => launchModule(mod!.base_url!)}
                          className="block max-w-full truncate text-start text-xs font-semibold text-foreground transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-brand-400"
                        >
                          {displayName}
                        </button>
                      ) : (
                        <h3 className="truncate text-xs font-semibold text-foreground">{displayName}</h3>
                      )}
                      <p className="mt-0.5 truncate text-[10px] leading-3 text-muted-foreground">{mod?.slug}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    sub.status === "active"
                      ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                      : "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"
                  }`}>
                    {displayStatus}
                  </span>
                </div>

                <p className="mb-2 truncate text-[11px] leading-4 text-muted-foreground" title={displayDesc}>
                  {displayDesc}
                </p>

                <div className="mt-auto mb-1.5 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                  <span className="tabular-nums">{sub.used_seats}/{sub.total_seats} {t('dashboard.seatsUsed')}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] capitalize">{displayPlan}</span>
                </div>

                {/* Progress bar */}
                <div
                  role="progressbar"
                  aria-label={`${displayName}: ${sub.used_seats}/${sub.total_seats} ${t("dashboard.seatsUsed")}`}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(sub.total_seats, sub.used_seats, 1)}
                  aria-valuenow={sub.used_seats}
                  className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-1 rounded-full bg-brand-500 transition-[width]"
                    style={{ width: `${sub.total_seats ? Math.min(100, (sub.used_seats / sub.total_seats) * 100) : 0}%` }}
                  />
                </div>

                {hasBaseUrl && (
                  <button
                    type="button"
                    // ACCEPTED RISK: The JWT is intentionally passed as a query parameter for SSO.
                    // All EMP ecosystem modules use this pattern to establish a session on the target
                    // module. The token is short-lived, transmitted over HTTPS, and the target module
                    // exchanges it for a server-side session immediately on load.
                    onClick={() => launchModule(mod!.base_url!)}
                    className="inline-flex min-h-7 items-center gap-1 self-start rounded-md px-0.5 text-[11px] font-semibold text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400"
                  >
                    {t('dashboard.launch')} <ExternalLink aria-hidden="true" className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      </section>
    </div>
  );
}
