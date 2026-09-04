import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { cn } from "@/lib/utils";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleAlert,
  CreditCard,
  Layers3,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TierDistribution = {
  plan_tier: string;
  count: number;
  total_seats: number;
  used_seats: number;
  utilization: number;
};

type StatusDistribution = {
  status: string;
  count: number;
};

type CycleDistribution = {
  billing_cycle: string;
  count: number;
};

type SubscriptionMetrics = {
  tier_distribution: TierDistribution[];
  status_distribution: StatusDistribution[];
  cycle_distribution: CycleDistribution[];
  total_seats: number;
  used_seats: number;
  overall_utilization: number;
};

type GrowthMetrics = {
  churn: Array<{ month: string; count: number }>;
};

const TIER_COLORS: Record<string, string> = {
  free: "#64748b",
  basic: "#2563eb",
  professional: "#7c3aed",
  enterprise: "#d97706",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#059669",
  trial: "#2563eb",
  past_due: "#d97706",
  pending: "#7c3aed",
  suspended: "#ea580c",
  cancelled: "#dc2626",
  expired: "#64748b",
  deactivated: "#475569",
};

const CYCLE_COLORS: Record<string, string> = {
  monthly: "#2563eb",
  quarterly: "#7c3aed",
  annual: "#059669",
  yearly: "#059669",
};

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.75rem",
  color: "hsl(var(--foreground))",
  boxShadow: "0 8px 24px rgb(15 23 42 / 0.12)",
};

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

type MetricCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: string;
};

function MetricCard({ icon, label, value, detail, tone }: MetricCardProps) {
  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", tone)}>
          {icon}
        </span>
      </div>
    </article>
  );
}

type PanelHeadingProps = {
  title: string;
  description: string;
  trailing?: ReactNode;
};

function PanelHeading({ title, description, trailing }: PanelHeadingProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {trailing}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading subscription analytics</span>
      <div className="h-16 max-w-xl animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="h-[430px] animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-[430px] animate-pulse rounded-xl border border-border bg-card" />
      </div>
    </div>
  );
}

export default function SubscriptionMetricsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }),
    [locale],
  );

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery<SubscriptionMetrics>({
    queryKey: ["admin-subscriptions"],
    queryFn: () => api.get("/admin/subscriptions").then((response) => response.data.data),
  });

  const {
    data: growth,
    isError: isGrowthError,
    isFetching: isGrowthFetching,
    refetch: refetchGrowth,
  } = useQuery<GrowthMetrics>({
    queryKey: ["admin-growth"],
    queryFn: () => api.get("/admin/growth").then((response) => response.data.data),
  });

  const tierDistribution = data?.tier_distribution ?? [];
  const statusDistribution = data?.status_distribution ?? [];
  const cycleDistribution = data?.cycle_distribution ?? [];
  const totalSubscriptions = statusDistribution.reduce((sum, item) => sum + item.count, 0);
  const currentSubscriptions = tierDistribution.reduce((sum, item) => sum + item.count, 0);
  const countByStatus = useMemo(
    () => new Map(statusDistribution.map((item) => [item.status, item.count])),
    [statusDistribution],
  );
  const activeCount = countByStatus.get("active") ?? 0;
  const trialCount = countByStatus.get("trial") ?? 0;
  const attentionCount = ["past_due", "pending", "suspended"]
    .reduce((sum, status) => sum + (countByStatus.get(status) ?? 0), 0);
  const healthyCount = activeCount + trialCount;
  const availableSeats = Math.max(0, (data?.total_seats ?? 0) - (data?.used_seats ?? 0));
  const churnCount = growth?.churn?.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const churnData = useMemo(
    () => (growth?.churn ?? []).map((item) => ({
      ...item,
      label: monthFormatter.format(new Date(`${item.month}-01T00:00:00`)),
    })),
    [growth?.churn, monthFormatter],
  );

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="p-6">
        <div className="mx-auto flex min-h-64 max-w-xl flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center">
          <CircleAlert className="h-10 w-10 text-red-500" aria-hidden="true" />
          <h1 className="mt-4 text-lg font-semibold text-foreground">
            {t("subscriptionMetrics.error.title", { defaultValue: "Subscription analytics could not be loaded" })}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("subscriptionMetrics.error.description", { defaultValue: "Check the server connection and try again." })}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-5 inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("subscriptionMetrics.actions.retry", { defaultValue: "Try again" })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-300">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-pretty text-2xl font-bold tracking-tight text-foreground">
              {t("subscriptionMetrics.title")}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t("subscriptionMetrics.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void refetch();
              void refetchGrowth();
            }}
            disabled={isFetching || isGrowthFetching}
            className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", (isFetching || isGrowthFetching) && "animate-spin")} aria-hidden="true" />
            {t("subscriptionMetrics.actions.refresh", { defaultValue: "Refresh" })}
          </button>
          <Link
            to="/admin/subscriptions-manage"
            className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {t("subscriptionMetrics.actions.manage", { defaultValue: "Manage subscriptions" })}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section aria-label={t("subscriptionMetrics.overview", { defaultValue: "Subscription overview" })} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Layers3 className="h-5 w-5" aria-hidden="true" />}
          label={t("subscriptionMetrics.stats.totalSubscriptions", { defaultValue: "Total subscriptions" })}
          value={numberFormatter.format(totalSubscriptions)}
          detail={t("subscriptionMetrics.stats.currentSubscriptions", {
            defaultValue: "{{count}} currently active or trial",
            count: currentSubscriptions,
          })}
          tone="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        />
        <MetricCard
          icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
          label={t("subscriptionMetrics.stats.subscriptionHealth", { defaultValue: "Subscription health" })}
          value={`${percentage(healthyCount, totalSubscriptions)}%`}
          detail={t("subscriptionMetrics.stats.activeTrial", {
            defaultValue: "{{active}} active · {{trial}} trial",
            active: numberFormatter.format(activeCount),
            trial: numberFormatter.format(trialCount),
          })}
          tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        />
        <MetricCard
          icon={<UsersRound className="h-5 w-5" aria-hidden="true" />}
          label={t("subscriptionMetrics.stats.seatUtilization")}
          value={`${data.overall_utilization}%`}
          detail={t("subscriptionMetrics.stats.seatUsage", {
            defaultValue: "{{used}} used · {{available}} available",
            used: numberFormatter.format(data.used_seats),
            available: numberFormatter.format(availableSeats),
          })}
          tone="bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
        />
        <MetricCard
          icon={<CircleAlert className="h-5 w-5" aria-hidden="true" />}
          label={t("subscriptionMetrics.stats.needsAttention", { defaultValue: "Needs attention" })}
          value={numberFormatter.format(attentionCount)}
          detail={attentionCount > 0
            ? t("subscriptionMetrics.stats.attentionHint", { defaultValue: "Past due, pending, or suspended" })
            : t("subscriptionMetrics.stats.noAttention", { defaultValue: "No current subscription issues" })}
          tone={attentionCount > 0
            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"}
        />
      </section>

      <section
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4",
          attentionCount > 0
            ? "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30"
            : "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30",
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {attentionCount > 0 ? (
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          ) : (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
          )}
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {attentionCount > 0
                ? t("subscriptionMetrics.insight.attentionTitle", { defaultValue: "Subscription follow-up required" })
                : t("subscriptionMetrics.insight.healthyTitle", { defaultValue: "Subscription portfolio is healthy" })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {attentionCount > 0
                ? t("subscriptionMetrics.insight.attentionBody", {
                    defaultValue: "{{count}} subscriptions require review. Open management to resolve their status.",
                    count: attentionCount,
                  })
                : t("subscriptionMetrics.insight.healthyBody", {
                    defaultValue: "All current subscriptions are active or in trial. {{count}} cancellations were recorded in the last 12 months.",
                    count: churnCount,
                  })}
            </p>
          </div>
        </div>
        <Link
          to="/admin/subscriptions-manage"
          className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {t("subscriptionMetrics.actions.review", { defaultValue: "Review subscriptions" })}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <PanelHeading
            title={t("subscriptionMetrics.charts.subscriptionStatus")}
            description={t("subscriptionMetrics.charts.statusDescription", { defaultValue: "Current portfolio health across every subscription status." })}
            trailing={(
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground">
                {t("subscriptionMetrics.subscriptionCount", {
                  defaultValue: "{{count}} subscriptions",
                  count: totalSubscriptions,
                })}
              </span>
            )}
          />

          {statusDistribution.length > 0 ? (
            <div className="mt-5 grid items-center gap-5 sm:grid-cols-[minmax(220px,0.9fr)_minmax(180px,1.1fr)]">
              <div
                className="relative h-64 min-w-0"
                role="img"
                aria-label={t("subscriptionMetrics.charts.statusAria", {
                  defaultValue: "Subscription status distribution for {{count}} subscriptions",
                  count: totalSubscriptions,
                })}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart accessibilityLayer>
                    <Pie
                      data={statusDistribution}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={66}
                      outerRadius={96}
                      paddingAngle={2}
                      stroke="hsl(var(--card))"
                      strokeWidth={3}
                    >
                      {statusDistribution.map((item) => (
                        <Cell key={item.status} fill={STATUS_COLORS[item.status] || "#64748b"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: any, _name: any, item: any) => [
                        numberFormatter.format(Number(value)),
                        humanize(item?.payload?.status || "subscription"),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold tabular-nums text-foreground">{numberFormatter.format(totalSubscriptions)}</span>
                  <span className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("subscriptionMetrics.total", { defaultValue: "Total" })}
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5" aria-label={t("subscriptionMetrics.charts.subscriptionStatus")}>
                {statusDistribution.map((item) => (
                  <li key={item.status} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.status] || "#64748b" }} aria-hidden="true" />
                      <span className="truncate text-sm font-medium text-foreground">
                        {t(`subscriptionsAdmin.status.${item.status}`, { defaultValue: humanize(item.status) })}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-sm font-semibold tabular-nums text-foreground">{numberFormatter.format(item.count)}</span>
                      <span className="block text-[11px] tabular-nums text-muted-foreground">{percentage(item.count, totalSubscriptions)}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              {t("subscriptionMetrics.empty.noData")}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <PanelHeading
            title={t("subscriptionMetrics.charts.planCapacity", { defaultValue: "Plan mix and seat capacity" })}
            description={t("subscriptionMetrics.charts.planCapacityDescription", { defaultValue: "Compare adoption and licensed-seat usage across active plan tiers." })}
            trailing={(
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground">
                {numberFormatter.format(currentSubscriptions)} {t("subscriptionMetrics.current", { defaultValue: "current" })}
              </span>
            )}
          />

          {tierDistribution.length > 0 ? (
            <div className="mt-5 space-y-3">
              {tierDistribution.map((tier) => {
                const tierColor = TIER_COLORS[tier.plan_tier] || "#475569";
                const tierShare = percentage(tier.count, currentSubscriptions);
                const available = Math.max(0, tier.total_seats - tier.used_seats);
                const progressStyle = { "--progress-color": tierColor } as CSSProperties;

                return (
                  <article key={tier.plan_tier} className="rounded-lg border border-border/80 p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: tierColor }} aria-hidden="true" />
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">{humanize(tier.plan_tier)}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("subscriptionMetrics.planShare", {
                              defaultValue: "{{count}} subscriptions · {{share}}% of current",
                              count: numberFormatter.format(tier.count),
                              share: tierShare,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-foreground">{tier.utilization}%</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("subscriptionMetrics.utilized", { defaultValue: "utilized" })}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div
                        className="h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label={t("subscriptionMetrics.tierUtilizationAria", {
                          defaultValue: "{{tier}} seat utilization",
                          tier: humanize(tier.plan_tier),
                        })}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.min(100, tier.utilization)}
                      >
                        <div
                          className="h-full rounded-full bg-[var(--progress-color)]"
                          style={{ ...progressStyle, width: `${Math.min(100, tier.utilization)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                        <span>{t("subscriptionMetrics.seats", {
                          count: tier.total_seats,
                          used: numberFormatter.format(tier.used_seats),
                          total: numberFormatter.format(tier.total_seats),
                        })}</span>
                        <span>{t("subscriptionMetrics.availableSeats", {
                          defaultValue: "{{count}} available",
                          count: numberFormatter.format(available),
                        })}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              {t("subscriptionMetrics.empty.noTierData")}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <PanelHeading
            title={t("subscriptionMetrics.charts.billingCycle")}
            description={t("subscriptionMetrics.charts.billingCycleDescription", { defaultValue: "Renewal cadence across active and trial subscriptions." })}
          />

          {cycleDistribution.length > 0 ? (
            <div className="mt-5 space-y-3">
              {cycleDistribution.map((cycle) => {
                const share = percentage(cycle.count, currentSubscriptions);
                const cycleColor = CYCLE_COLORS[cycle.billing_cycle] || "#475569";
                const progressStyle = { "--progress-color": cycleColor } as CSSProperties;
                return (
                  <article key={cycle.billing_cycle} className="rounded-lg border border-border/80 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className="text-sm font-semibold text-foreground">
                          {t(`subscriptionsAdmin.billingCycle.${cycle.billing_cycle}`, { defaultValue: humanize(cycle.billing_cycle) })}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold tabular-nums text-foreground">{numberFormatter.format(cycle.count)}</span>
                        <span className="ml-2 text-xs tabular-nums text-muted-foreground">{share}%</span>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-[var(--progress-color)]" style={{ ...progressStyle, width: `${share}%` }} />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              {t("subscriptionMetrics.empty.noData")}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <PanelHeading
            title={t("subscriptionMetrics.charts.subscriptionChurn")}
            description={t("subscriptionMetrics.charts.churnDescription", { defaultValue: "Cancelled subscriptions recorded during the last 12 months." })}
            trailing={(
              <div className="flex items-center gap-2 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                {t("subscriptionMetrics.churn.total", {
                  defaultValue: "{{count}} cancelled",
                  count: numberFormatter.format(churnCount),
                })}
              </div>
            )}
          />

          {isGrowthError ? (
            <div className="mt-5 flex h-64 flex-col items-center justify-center rounded-lg bg-muted/40 px-4 text-center">
              <CircleAlert className="h-7 w-7 text-amber-600" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-foreground">
                {t("subscriptionMetrics.churn.error", { defaultValue: "Churn history is temporarily unavailable" })}
              </p>
              <button
                type="button"
                onClick={() => void refetchGrowth()}
                className="mt-3 min-h-11 touch-manipulation rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300 dark:hover:bg-brand-950/40"
              >
                {t("subscriptionMetrics.actions.retry", { defaultValue: "Try again" })}
              </button>
            </div>
          ) : churnData.length > 0 ? (
            <div className="mt-5 h-72 min-w-0" role="img" aria-label={t("subscriptionMetrics.charts.churnAria", { defaultValue: "Cancelled subscriptions by month" })}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={churnData} margin={{ top: 8, right: 8, bottom: 4, left: -18 }} accessibilityLayer>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: any) => [numberFormatter.format(Number(value)), t("subscriptionMetrics.churn.cancelledSeries")]}
                  />
                  <Bar dataKey="count" name={t("subscriptionMetrics.churn.cancelledSeries")} fill="#dc2626" radius={[6, 6, 0, 0]} maxBarSize={52} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-5 flex h-64 flex-col items-center justify-center rounded-lg bg-emerald-50/60 px-4 text-center dark:bg-emerald-950/20">
              <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-foreground">
                {t("subscriptionMetrics.churn.emptyTitle", { defaultValue: "No subscription churn" })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("subscriptionMetrics.churn.emptyDescription", { defaultValue: "No cancellations were recorded during the last 12 months." })}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
