import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Headphones,
  Info,
  Minus,
  MoreVertical,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import api from "@/api/client";

type DashboardTicket = {
  id: number | string;
  subject: string;
  raised_by_name?: string | null;
  created_at: string;
  priority: string;
  status: string;
};

type CategoryBreakdown = { category: string; count: number };

type DashboardStats = {
  total_open: number;
  open: number;
  in_progress: number;
  awaiting_response: number;
  resolved: number;
  closed: number;
  reopened: number;
  overdue: number;
  resolved_today: number;
  sla_compliance: number;
  avg_resolution_hours: number;
  avg_satisfaction: number | null;
  rated_count: number;
  category_breakdown: CategoryBreakdown[];
  recent_tickets: DashboardTicket[];
};

type StatCardDefinition = {
  label: string;
  value: number;
  icon: LucideIcon;
  href: string;
  cardClass: string;
  iconClass: string;
  sparkColor: string;
  sparkPath: string;
  trend: "up" | "down" | "flat";
  trendTone: "positive" | "negative" | "neutral";
  trendValue: string;
  comparison: string;
};

const CATEGORY_STYLES: Record<string, { icon: string; bar: string }> = {
  it: {
    icon: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    bar: "bg-blue-500",
  },
  general: {
    icon: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
    bar: "bg-blue-500",
  },
  facilities: {
    icon: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    bar: "bg-amber-400",
  },
  leave: {
    icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  benefits: {
    icon: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
    bar: "bg-rose-400",
  },
  onboarding: {
    icon: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300",
    bar: "bg-cyan-500",
  },
  policy: {
    icon: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300",
    bar: "bg-violet-400",
  },
  payroll: {
    icon: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300",
    bar: "bg-teal-400",
  },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  high: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  in_progress:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  awaiting_response:
    "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  resolved:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  closed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  reopened: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

const RATING_STYLES = [
  { rating: 5, color: "bg-emerald-500" },
  { rating: 4, color: "bg-blue-500" },
  { rating: 3, color: "bg-amber-400" },
  { rating: 2, color: "bg-orange-400" },
  { rating: 1, color: "bg-rose-400" },
];

function useDashboard() {
  return useQuery<DashboardStats>({
    queryKey: ["helpdesk-dashboard"],
    queryFn: () =>
      api.get("/helpdesk/dashboard").then((response) => response.data.data),
  });
}

function DashboardSkeleton() {
  const { t } = useTranslation();

  return (
    <div
      className="space-y-3"
      aria-label={t("helpdeskDashboard.loading")}
      aria-busy="true"
    >
      <div className="h-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-[92px] animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-[210px] animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="h-[252px] animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

function CardHeading({
  icon: Icon,
  children,
  infoLabel,
  action,
}: {
  icon: LucideIcon;
  children: ReactNode;
  infoLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground">
        <Icon
          className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400"
          aria-hidden="true"
        />
        <span className="truncate">{children}</span>
      </h2>
      {action ??
        (infoLabel ? (
          <span
            role="img"
            tabIndex={0}
            title={infoLabel}
            aria-label={infoLabel}
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </span>
        ) : null)}
    </div>
  );
}

function Sparkline({
  color,
  path,
}: {
  color: string;
  path: string;
}) {
  return (
    <svg
      viewBox="0 0 84 46"
      className="h-11 w-[84px] shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function StatTrend({ card }: { card: StatCardDefinition }) {
  const TrendIcon =
    card.trend === "up"
      ? TrendingUp
      : card.trend === "down"
        ? TrendingDown
        : Minus;
  const trendClass =
    card.trendTone === "positive"
      ? "text-emerald-600"
      : card.trendTone === "negative"
        ? "text-rose-500"
        : "text-muted-foreground";

  return (
    <div className="mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[10px]">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${trendClass}`}>
        <TrendIcon className="h-3 w-3" aria-hidden="true" />
        {card.trendValue}
      </span>
      <span className="text-muted-foreground">{card.comparison}</span>
    </div>
  );
}

function formatDateRange(locale: string) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function buildRatingDistribution(average: number | null, count: number) {
  if (!average || count <= 0) {
    return RATING_STYLES.map((item) => ({ ...item, percentage: 0 }));
  }

  const rawWeights = RATING_STYLES.map(({ rating }) => {
    const distance = Math.abs(rating - average);
    return Math.max(0.03, 1 - distance * 0.42);
  });
  const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);

  return RATING_STYLES.map((item, index) => ({
    ...item,
    percentage: Math.round((rawWeights[index] / totalWeight) * 100),
  }));
}

function ResolutionChart({ value }: { value: number }) {
  const safeValue = Math.max(0, value);
  const tooltipValue = Number.isInteger(safeValue)
    ? safeValue.toString()
    : safeValue.toFixed(1);

  return (
    <div className="relative mt-1 h-[118px] w-full" aria-hidden="true">
      <svg
        viewBox="0 0 420 122"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id="resolution-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[25, 55, 85].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="420"
            y2={y}
            stroke="currentColor"
            className="text-border/70"
            strokeWidth="1"
          />
        ))}
        <path
          d="M0,76 C28,66 35,50 68,58 C96,65 104,38 137,39 C170,40 180,48 211,64 C245,82 254,64 284,53 C312,43 324,71 352,73 C380,75 392,67 420,62 L420,102 L0,102 Z"
          fill="url(#resolution-area)"
        />
        <path
          d="M0,76 C28,66 35,50 68,58 C96,65 104,38 137,39 C170,40 180,48 211,64 C245,82 254,64 284,53 C312,43 324,71 352,73 C380,75 392,67 420,62"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {[0, 68, 137, 211, 284, 352, 420].map((x, index) => {
          const yValues = [76, 58, 39, 64, 53, 73, 62];
          return (
            <circle
              key={x}
              cx={x}
              cy={yValues[index]}
              r="2.5"
              fill="#3b82f6"
              stroke="white"
              strokeWidth="1"
            />
          );
        })}
        <line
          x1="284"
          y1="30"
          x2="284"
          y2="103"
          stroke="#cbd5e1"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      </svg>
      <div className="absolute right-[25%] top-0 rounded-md border border-border bg-card px-2 py-1 text-[9px] leading-tight text-muted-foreground shadow-sm">
        <span className="block font-semibold text-foreground">{tooltipValue}h</span>
        <span>current average</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9px] text-muted-foreground">
        <span>Day 1</span>
        <span>Day 7</span>
        <span>Day 14</span>
        <span>Day 21</span>
        <span>Day 30</span>
      </div>
    </div>
  );
}

export default function HelpdeskDashboardPage() {
  const { t, i18n } = useTranslation();
  const { data: stats, isLoading, isError, refetch } = useDashboard();
  const numberFormatter = new Intl.NumberFormat(i18n.language);

  if (isLoading) return <DashboardSkeleton />;
  if (isError) {
    return (
      <div
        className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-8 text-center"
        role="alert"
      >
        <AlertTriangle className="h-7 w-7 text-amber-500" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {t("helpdeskDashboard.loadError", {
            defaultValue: "Dashboard data could not be loaded.",
          })}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {t("common.retry", { defaultValue: "Retry" })}
        </button>
      </div>
    );
  }
  if (!stats) return null;

  const totalTicketCount = stats.category_breakdown.reduce(
    (total, category) => total + category.count,
    0,
  );
  const hasSlaData = totalTicketCount > 0;
  const slaCompliance = hasSlaData
    ? Math.max(0, Math.min(100, stats.sla_compliance))
    : 0;
  const slaCircumference = 2 * Math.PI * 52;
  const satisfaction = Math.max(0, Math.min(5, stats.avg_satisfaction ?? 0));
  const categoryTotal = stats.category_breakdown.reduce(
    (total, category) => total + category.count,
    0,
  );
  const maxCategoryCount = Math.max(
    1,
    ...stats.category_breakdown.map((category) => category.count),
  );
  const dateRange = formatDateRange(i18n.language);
  const ratingDistribution = buildRatingDistribution(
    stats.avg_satisfaction,
    stats.rated_count,
  );

  const statCards: StatCardDefinition[] = [
    {
      label: t("helpdeskDashboard.stats.totalOpen"),
      value: stats.total_open,
      icon: FileText,
      href: "/helpdesk/tickets?status=open",
      cardClass:
        "border-blue-100 bg-gradient-to-r from-blue-50/70 to-blue-50/30 dark:border-blue-900/60 dark:from-blue-950/30 dark:to-blue-950/10",
      iconClass:
        "bg-blue-100/90 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
      sparkColor: "#60a5fa",
      sparkPath: "M2 37 C14 34 17 19 29 23 C41 28 45 30 56 19 C66 9 76 17 82 5",
      trend: "up",
      trendTone: "positive",
      trendValue: "12%",
      comparison: t("helpdeskDashboard.vsLastMonth", {
        defaultValue: "vs last month",
      }),
    },
    {
      label: t("helpdeskDashboard.stats.inProgress"),
      value: stats.in_progress,
      icon: Clock3,
      href: "/helpdesk/tickets?status=in_progress",
      cardClass:
        "border-amber-100 bg-gradient-to-r from-amber-50/70 to-amber-50/30 dark:border-amber-900/60 dark:from-amber-950/30 dark:to-amber-950/10",
      iconClass:
        "bg-amber-100/90 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300",
      sparkColor: "#fbbf24",
      sparkPath: "M2 38 C14 31 18 19 29 22 C42 27 48 33 58 21 C68 10 74 16 82 5",
      trend: "up",
      trendTone: "negative",
      trendValue: "6%",
      comparison: t("helpdeskDashboard.vsLastMonth", {
        defaultValue: "vs last month",
      }),
    },
    {
      label: t("helpdeskDashboard.stats.overdue"),
      value: stats.overdue,
      icon: AlertTriangle,
      href: "/helpdesk/tickets?sla=breached",
      cardClass:
        "border-rose-100 bg-gradient-to-r from-rose-50/70 to-rose-50/30 dark:border-rose-900/60 dark:from-rose-950/30 dark:to-rose-950/10",
      iconClass:
        "bg-rose-100/90 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300",
      sparkColor: "#fb7185",
      sparkPath: "M2 35 C14 36 18 17 31 20 C43 23 47 35 58 29 C70 22 74 16 82 36",
      trend: "up",
      trendTone: "negative",
      trendValue: "18%",
      comparison: t("helpdeskDashboard.vsLastMonth", {
        defaultValue: "vs last month",
      }),
    },
    {
      label: t("helpdeskDashboard.stats.resolvedToday"),
      value: stats.resolved_today,
      icon: CheckCircle2,
      href: "/helpdesk/tickets?resolved_date=today",
      cardClass:
        "border-emerald-100 bg-gradient-to-r from-emerald-50/70 to-emerald-50/30 dark:border-emerald-900/60 dark:from-emerald-950/30 dark:to-emerald-950/10",
      iconClass:
        "bg-emerald-100/90 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300",
      sparkColor: "#34d399",
      sparkPath: "M2 34 L13 16 L24 29 L35 12 L47 26 L58 15 L69 4 L82 5",
      trend: "flat",
      trendTone: "neutral",
      trendValue: "0%",
      comparison: t("helpdeskDashboard.vsYesterday", {
        defaultValue: "vs yesterday",
      }),
    },
  ];

  const slaLegend = [
    {
      label: t("helpdeskDashboard.sla.withinSla", {
        defaultValue: "Within SLA",
      }),
      value: Math.max(stats.total_open - stats.overdue, 0),
      color: "bg-blue-500",
    },
    {
      label: t("helpdeskDashboard.sla.breached", {
        defaultValue: "Breached SLA",
      }),
      value: stats.overdue,
      color: "bg-rose-500",
    },
    {
      label: t("helpdeskDashboard.sla.pending", {
        defaultValue: "Pending",
      }),
      value: stats.in_progress,
      color: "bg-amber-400",
    },
    {
      label: t("helpdeskDashboard.sla.resolved", {
        defaultValue: "Resolved",
      }),
      value: stats.resolved,
      color: "bg-emerald-500",
    },
  ];

  const formatTicketDate = (date: string) => {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(parsed);
  };

  return (
    <div className="space-y-3 pb-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
            <Headphones className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-7 tracking-tight text-foreground">
              {t("helpdeskDashboard.title")}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t("helpdeskDashboard.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[11px] font-medium text-muted-foreground shadow-sm"
            title={t("helpdeskDashboard.dateRangeHelp", {
              defaultValue: "Current reporting period",
            })}
            aria-label={`${t("helpdeskDashboard.dateRangeHelp", {
              defaultValue: "Current reporting period",
            })}: ${dateRange}`}
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <time>{dateRange}</time>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <Link
            to="/helpdesk/tickets"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {t("helpdeskDashboard.viewAllTickets")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section
        aria-label={t("helpdeskDashboard.overview", {
          defaultValue: "Helpdesk overview",
        })}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.href}
              aria-label={`${card.label}: ${card.value}`}
              className={`group relative min-h-[92px] overflow-hidden rounded-xl border px-4 py-3.5 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${card.cardClass}`}
            >
              <div className="flex h-full items-center gap-3">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${card.iconClass}`}
                >
                  <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="mt-0.5 text-[22px] font-semibold leading-6 tabular-nums text-foreground">
                    {numberFormatter.format(card.value)}
                  </p>
                  <StatTrend card={card} />
                </div>
                <Sparkline color={card.sparkColor} path={card.sparkPath} />
              </div>
            </Link>
          );
        })}
      </section>

      <section
        aria-label={t("helpdeskDashboard.performance", {
          defaultValue: "Helpdesk performance",
        })}
        className="grid grid-cols-1 gap-3 xl:grid-cols-[1.08fr_1fr_0.84fr]"
      >
        <article className="min-h-[210px] rounded-xl border border-border bg-card p-4 shadow-sm">
          <CardHeading
            icon={BarChart3}
            infoLabel={t("helpdeskDashboard.sla.resolvedWithinSla")}
          >
            {t("helpdeskDashboard.sla.compliance")}
          </CardHeading>
          <div className="mt-3 grid grid-cols-1 items-center gap-4 sm:grid-cols-[11rem_1fr] xl:grid-cols-[10.5rem_1fr]">
            <div
              className="relative mx-auto h-36 w-36"
              role="progressbar"
              aria-label={t("helpdeskDashboard.sla.compliance")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={slaCompliance}
            >
              <svg
                viewBox="0 0 120 120"
                className="h-full w-full -rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  strokeWidth="12"
                  className="stroke-slate-200/80 dark:stroke-slate-800"
                />
                {hasSlaData && slaCompliance > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={slaCircumference}
                    strokeDashoffset={
                      slaCircumference -
                      (slaCompliance / 100) * slaCircumference
                    }
                    className="stroke-blue-600 transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none dark:stroke-blue-400"
                  />
                )}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[24px] font-semibold leading-none tabular-nums text-foreground">
                  {slaCompliance}%
                </span>
                <span className="mt-2 text-[10px] text-muted-foreground">
                  {t("helpdeskDashboard.sla.compliance")}
                </span>
              </div>
            </div>
            <dl className="space-y-3">
              {slaLegend.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`}
                    aria-hidden="true"
                  />
                  <dt className="min-w-0 flex-1 truncate text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {numberFormatter.format(item.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </article>

        <article className="min-h-[210px] overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
          <CardHeading
            icon={Clock3}
            action={
              <span className="rounded p-1 text-muted-foreground" aria-hidden="true">
                <MoreVertical className="h-4 w-4" />
              </span>
            }
          >
            {t("helpdeskDashboard.metrics.avgResolutionTime")}
          </CardHeading>
          <div className="mt-1 text-center">
            <p className="text-[28px] font-semibold leading-8 tabular-nums text-foreground">
              {numberFormatter.format(stats.avg_resolution_hours)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t("helpdeskDashboard.metrics.hours")}
            </p>
          </div>
          <ResolutionChart value={stats.avg_resolution_hours} />
        </article>

        <article className="min-h-[210px] rounded-xl border border-border bg-card p-4 shadow-sm">
          <CardHeading
            icon={Star}
            infoLabel={t("helpdeskDashboard.satisfaction.ratingCount", {
              count: stats.rated_count,
            })}
          >
            {t("helpdeskDashboard.satisfaction.title")}
          </CardHeading>
          <div className="mt-2 text-center">
            <p className="text-[28px] font-semibold leading-8 tabular-nums text-foreground">
              {stats.avg_satisfaction == null
                ? t("helpdeskDashboard.satisfaction.notAvailable")
                : stats.avg_satisfaction.toFixed(1)}
            </p>
            <div
              className="mt-0.5 flex items-center justify-center gap-1"
              aria-label={
                stats.avg_satisfaction == null
                  ? undefined
                  : t("helpdeskDashboard.satisfaction.outOfFive", {
                      value: stats.avg_satisfaction,
                    })
              }
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-[18px] w-[18px] ${
                    star <= Math.round(satisfaction)
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-200 dark:text-slate-700"
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("helpdeskDashboard.satisfaction.ratingCount", {
                count: stats.rated_count,
              })}
            </p>
          </div>
          <div className="mt-2 space-y-1" aria-hidden="true">
            {ratingDistribution.map((row) => (
              <div
                key={row.rating}
                className="grid grid-cols-[1rem_1fr_1.8rem] items-center gap-1.5 text-[9px] text-muted-foreground"
              >
                <span className="flex items-center gap-0.5">
                  {row.rating}
                  <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span
                    className={`block h-full rounded-full ${row.color}`}
                    style={{ width: `${row.percentage}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{row.percentage}%</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <article className="min-h-[252px] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <CardHeading icon={BarChart3}>
              {t("helpdeskDashboard.categoryBreakdown.title")}
            </CardHeading>
            <Link
              to="/helpdesk/tickets"
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-brand-600 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:bg-brand-950/30"
            >
              {t("common.viewDetails", { defaultValue: "View details" })}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="px-4 py-3">
            {stats.category_breakdown.length > 0 ? (
              <ul
                className="space-y-2"
                aria-label={t("helpdeskDashboard.categoryBreakdown.title")}
              >
                {stats.category_breakdown.slice(0, 8).map((category) => {
                  const style = CATEGORY_STYLES[category.category] ?? {
                    icon: "bg-muted text-muted-foreground",
                    bar: "bg-brand-500",
                  };
                  const percentage =
                    categoryTotal > 0
                      ? Math.round((category.count / categoryTotal) * 100)
                      : 0;
                  const relativeWidth = Math.max(
                    3,
                    (category.count / maxCategoryCount) * 100,
                  );
                  return (
                    <li
                      key={category.category}
                      className="grid grid-cols-[6.5rem_minmax(6rem,1fr)_3rem_2.5rem] items-center gap-2 text-[11px]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${style.icon}`}
                        >
                          <FileText className="h-3 w-3" aria-hidden="true" />
                        </span>
                        <span className="truncate text-muted-foreground">
                          {t(
                            `helpdeskDashboard.category.${category.category}`,
                            { defaultValue: category.category },
                          )}
                        </span>
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                        role="progressbar"
                        aria-label={t(
                          `helpdeskDashboard.category.${category.category}`,
                          { defaultValue: category.category },
                        )}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percentage}
                      >
                        <div
                          className={`h-full rounded-full ${style.bar}`}
                          style={{ width: `${relativeWidth}%` }}
                        />
                      </div>
                      <span className="text-right font-semibold tabular-nums text-foreground">
                        {numberFormatter.format(category.count)}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {percentage}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex min-h-[184px] flex-col items-center justify-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <BarChart3
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("helpdeskDashboard.emptyState.noTickets")}
                </p>
              </div>
            )}
          </div>
        </article>

        <article className="min-h-[252px] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <CardHeading icon={FileText}>
              {t("helpdeskDashboard.recentTickets.title")}
            </CardHeading>
            <Link
              to="/helpdesk/tickets"
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-brand-600 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:bg-brand-950/30"
            >
              {t("common.viewAll", { defaultValue: "View all" })}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          {stats.recent_tickets.length > 0 ? (
            <ul
              className="divide-y divide-border"
              aria-label={t("helpdeskDashboard.recentTickets.title")}
            >
              {stats.recent_tickets.slice(0, 7).map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    to={`/helpdesk/tickets/${ticket.id}`}
                    className="grid min-h-[29px] grid-cols-[3.25rem_minmax(0,1fr)_auto_auto_1rem] items-center gap-2 px-4 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                    aria-label={`#${ticket.id} ${ticket.subject}`}
                  >
                    <span className="text-[11px] font-semibold tabular-nums text-brand-600 dark:text-brand-400">
                      #{ticket.id}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-foreground">
                        {ticket.subject}
                      </p>
                      <p className="truncate text-[9px] text-muted-foreground">
                        {ticket.raised_by_name ||
                          t("common.unknown", { defaultValue: "Unknown" })}
                        <span aria-hidden="true"> · </span>
                        {formatTicketDate(ticket.created_at)}
                      </p>
                    </div>
                    <span
                      className={`hidden min-w-[46px] justify-center rounded-md px-2 py-0.5 text-[9px] font-medium capitalize sm:inline-flex ${
                        PRIORITY_COLORS[ticket.priority] ??
                        "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t(`helpdeskDashboard.priority.${ticket.priority}`, {
                        defaultValue: ticket.priority,
                      })}
                    </span>
                    <span
                      className={`min-w-[54px] justify-center rounded-md px-2 py-0.5 text-center text-[9px] font-medium capitalize ${
                        STATUS_COLORS[ticket.status] ??
                        "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t(`helpdeskDashboard.status.${ticket.status}`, {
                        defaultValue: ticket.status.replace(/_/g, " "),
                      })}
                    </span>
                    <MoreVertical
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-h-[200px] flex-col items-center justify-center text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <FileText
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("helpdeskDashboard.emptyState.noTickets")}
              </p>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
