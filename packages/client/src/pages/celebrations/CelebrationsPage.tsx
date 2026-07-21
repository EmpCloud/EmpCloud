import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PartyPopper, Gift, Award, Sparkles, CalendarDays } from "lucide-react";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { useBirthdays, useAnniversaries, useDepartments } from "@/api/hooks";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type RawPerson = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  photo_path?: string | null;
  department_id?: number | null;
  date_of_birth?: string | null;
  date_of_joining?: string | null;
};

type Kind = "birthday" | "anniversary";

interface Celebration {
  id: number;
  firstName: string;
  lastName: string;
  photoPath?: string | null;
  departmentId?: number | null;
  kind: Kind;
  /** The source date (birth date or joining date). */
  sourceDate: Date;
  /** The month/day this year's (or next year's) occurrence falls on. */
  nextDate: Date;
  /** Whole days until the next occurrence (0 = today). */
  daysUntil: number;
  /** For anniversaries: completed years of service on the next occurrence. */
  years?: number;
}

const MS_DAY = 24 * 60 * 60 * 1000;

/** Midnight-normalised "today" so day math is stable regardless of time. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Given a person's source date, compute the next upcoming occurrence of its
 * month/day (this year, or next year if it has already passed), the whole
 * days until it, and — for anniversaries — the years of service reached.
 */
function toCelebration(p: RawPerson, kind: Kind): Celebration | null {
  const raw = kind === "birthday" ? p.date_of_birth : p.date_of_joining;
  if (!raw) return null;
  const src = new Date(raw);
  if (isNaN(src.getTime())) return null;

  const today = startOfToday();
  let next = new Date(today.getFullYear(), src.getMonth(), src.getDate());
  next.setHours(0, 0, 0, 0);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, src.getMonth(), src.getDate());
    next.setHours(0, 0, 0, 0);
  }
  const daysUntil = Math.round((next.getTime() - today.getTime()) / MS_DAY);

  const years =
    kind === "anniversary" ? Math.max(0, next.getFullYear() - src.getFullYear()) : undefined;

  return {
    id: p.id,
    firstName: p.first_name ?? "",
    lastName: p.last_name ?? "",
    photoPath: p.photo_path,
    departmentId: p.department_id,
    kind,
    sourceDate: src,
    nextDate: next,
    daysUntil,
    years,
  };
}

function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// ---------------------------------------------------------------------------
// Confetti accent (pure CSS, self-contained — no external assets)
// ---------------------------------------------------------------------------

// Brand-harmonious confetti: light blues / indigo / sky plus a soft accent,
// so it reads as celebratory sparkle over the brand-blue hero (and light
// tinted cards) without clashing with the app's palette.
const CONFETTI = [
  { left: "6%", delay: "0s", color: "#93c5fd" },
  { left: "18%", delay: "1.1s", color: "#c7d2fe" },
  { left: "31%", delay: "0.4s", color: "#bae6fd" },
  { left: "44%", delay: "1.6s", color: "#a5b4fc" },
  { left: "57%", delay: "0.8s", color: "#93c5fd" },
  { left: "69%", delay: "1.9s", color: "#bfdbfe" },
  { left: "82%", delay: "0.2s", color: "#c7d2fe" },
  { left: "93%", delay: "1.3s", color: "#bae6fd" },
];

function ConfettiLayer() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="absolute -top-3 h-2.5 w-1.5 rounded-[1px] opacity-70 animate-[celeb-fall_3.5s_linear_infinite]"
          style={{ left: c.left, backgroundColor: c.color, animationDelay: c.delay }}
        />
      ))}
      <style>{`
        @keyframes celeb-fall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity: 0; }
          10%  { opacity: 0.8; }
          100% { transform: translateY(120px) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kind styling
// ---------------------------------------------------------------------------

// Restrained, enterprise palette: birthdays use a muted amber, anniversaries
// the brand blue — distinguishable but professional and cohesive with the rest
// of EMP Cloud (no bright pinks).
const KIND_STYLE: Record<
  Kind,
  { Icon: typeof Gift; ring: string; chip: string; softGrad: string; accent: string; bar: string }
> = {
  birthday: {
    Icon: Gift,
    ring: "ring-amber-100 dark:ring-amber-900/40",
    chip: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
    softGrad: "from-amber-50 to-white dark:from-amber-950/40 dark:to-gray-900",
    accent: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-400",
  },
  anniversary: {
    Icon: Award,
    ring: "ring-brand-100 dark:ring-brand-900/40",
    chip: "bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300",
    softGrad: "from-brand-50 to-white dark:from-brand-950/40 dark:to-gray-900",
    accent: "text-brand-600 dark:text-brand-400",
    bar: "bg-brand-500",
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Filter = "all" | "birthday" | "anniversary";

export default function CelebrationsPage() {
  const { t } = useTranslation();
  const { data: birthdaysRaw = [], isLoading: bLoading } = useBirthdays();
  const { data: anniversariesRaw = [], isLoading: aLoading } = useAnniversaries();
  const { data: departments = [] } = useDepartments();
  const [filter, setFilter] = useState<Filter>("all");

  const isLoading = bLoading || aLoading;

  const deptName = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of departments as any[]) map.set(d.id, d.name);
    return (id?: number | null) => (id != null ? map.get(id) ?? "" : "");
  }, [departments]);

  const all = useMemo<Celebration[]>(() => {
    const list: Celebration[] = [];
    for (const p of birthdaysRaw as RawPerson[]) {
      const c = toCelebration(p, "birthday");
      if (c) list.push(c);
    }
    for (const p of anniversariesRaw as RawPerson[]) {
      const c = toCelebration(p, "anniversary");
      // Skip a "0 years" anniversary — that's the join date itself, not a milestone.
      if (c && (c.kind !== "anniversary" || (c.years ?? 0) >= 1)) list.push(c);
    }
    // Sort by soonest, then by name for stable ordering.
    list.sort(
      (x, y) =>
        x.daysUntil - y.daysUntil ||
        `${x.firstName}${x.lastName}`.localeCompare(`${y.firstName}${y.lastName}`),
    );
    return list;
  }, [birthdaysRaw, anniversariesRaw]);

  const filtered = useMemo(
    () => (filter === "all" ? all : all.filter((c) => c.kind === filter)),
    [all, filter],
  );

  const today = filtered.filter((c) => c.daysUntil === 0);
  const upcoming = filtered.filter((c) => c.daysUntil > 0);

  return (
    <div className="space-y-6 pb-10">
      {/* ── Header — clean & light, matching the app's other page headers ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400">
            <PartyPopper className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("celebrations.title")}</h1>
            <p className="text-[13px] text-muted-foreground">{t("celebrations.subtitle")}</p>
          </div>
        </div>

        {/* Compact stat pills */}
        {!isLoading && (
          <div className="flex flex-wrap gap-2">
            <HeroStat icon={Gift} label={t("celebrations.birthdays")} value={all.filter((c) => c.kind === "birthday").length} accent="text-amber-600 dark:text-amber-400" />
            <HeroStat icon={Award} label={t("celebrations.anniversaries")} value={all.filter((c) => c.kind === "anniversary").length} accent="text-brand-600 dark:text-brand-400" />
            <HeroStat icon={Sparkles} label={t("celebrations.today")} value={all.filter((c) => c.daysUntil === 0).length} accent="text-amber-500" />
          </div>
        )}
      </div>

      {/* ── Filter toggle — extra top spacing to separate it clearly from
             the header above (a thin divider + generous gap). ──────────── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6 mt-2">
        <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
          {t("celebrations.filterAll")}
        </FilterTab>
        <FilterTab active={filter === "birthday"} onClick={() => setFilter("birthday")}>
          <Gift className="h-4 w-4" /> {t("celebrations.birthdays")}
        </FilterTab>
        <FilterTab active={filter === "anniversary"} onClick={() => setFilter("anniversary")}>
          <Award className="h-4 w-4" /> {t("celebrations.anniversaries")}
        </FilterTab>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : all.length === 0 ? (
        <EmptyState
          title={t("celebrations.emptyTitle")}
          hint={t("celebrations.emptyHint")}
        />
      ) : (
        <>
          {/* ── Today ─────────────────────────────────────────────────── */}
          {today.length > 0 ? (
            <section>
              <SectionHeading emoji="🎉" title={t("celebrations.todaysCelebrations")} count={today.length} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {today.map((c) => (
                  <TodayCard key={`${c.kind}-${c.id}`} c={c} deptName={deptName(c.departmentId)} t={t} />
                ))}
              </div>
            </section>
          ) : (
            // No one celebrating today — a warm anchor instead of a bare list.
            <div className="flex items-center gap-3 rounded-lg border border-border bg-gradient-to-r from-brand-50 to-white dark:from-brand-950/40 dark:to-gray-900 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-card text-brand-600 dark:text-brand-400 shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{t("celebrations.noneToday")}</p>
                <p className="text-xs text-muted-foreground">{t("celebrations.noneTodayHint")}</p>
              </div>
            </div>
          )}

          {/* ── Upcoming (next 30 days) ──────────────────────────────────
              This is a rolling 30-day lookahead from the server, so it
              deliberately spills into the next calendar month (e.g. an early-
              August birthday shows in mid-July). Labelled "Upcoming" with a
              "Next 30 days" caption rather than "This Month" so those
              next-month entries don't read as a bug. */}
          <section>
            <SectionHeading
              emoji="🗓️"
              title={t("celebrations.upcoming")}
              hint={t("celebrations.upcomingRange")}
              count={upcoming.length}
            />
            {upcoming.length === 0 ? (
              <EmptyState
                title={t("celebrations.noUpcomingTitle")}
                hint={t("celebrations.noUpcomingHint")}
                compact
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {upcoming.map((c) => (
                  <UpcomingRow key={`${c.kind}-${c.id}`} c={c} deptName={deptName(c.departmentId)} t={t} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HeroStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Gift;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
      <Icon className={`h-4 w-4 ${accent}`} />
      <span className="text-sm font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "border border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function SectionHeading({
  emoji,
  title,
  count,
  hint,
}: {
  emoji: string;
  title: string;
  count: number;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-lg" aria-hidden>
        {emoji}
      </span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
        {count}
      </span>
      {hint ? <span className="ml-1 text-xs font-medium text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function TodayCard({ c, deptName, t }: { c: Celebration; deptName: string; t: TFn }) {
  const s = KIND_STYLE[c.kind];
  const Icon = s.Icon;
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${s.softGrad} p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <ConfettiLayer />
      <div className="relative flex flex-col items-center text-center">
        <EmployeeAvatar
          userId={c.id}
          hasPhoto={!!c.photoPath}
          firstName={c.firstName}
          lastName={c.lastName}
          size="xl"
          ring={`ring-4 ${s.ring}`}
        />
        <p className="mt-3 text-base font-bold text-foreground">
          {c.firstName} {c.lastName}
        </p>
        {deptName && <p className="text-xs text-muted-foreground">{deptName}</p>}
        <span
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${s.chip}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {c.kind === "birthday"
            ? t("celebrations.happyBirthday")
            : t("celebrations.yearsToday", { count: c.years ?? 0 })}
        </span>
      </div>
    </div>
  );
}

function UpcomingRow({ c, deptName, t }: { c: Celebration; deptName: string; t: TFn }) {
  const s = KIND_STYLE[c.kind];
  const Icon = s.Icon;
  const soon = c.daysUntil <= 1; // today/tomorrow → subtle emphasis

  return (
    <div
      className={`group relative flex items-center gap-3 overflow-hidden rounded-lg border bg-card p-3.5 pl-4 hover:border-brand-400 transition-colors duration-150 ${
        soon ? "border-border" : "border-border"
      }`}
    >
      {/* Colored left accent bar — type at a glance */}
      <span className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} aria-hidden />

      <EmployeeAvatar
        userId={c.id}
        hasPhoto={!!c.photoPath}
        firstName={c.firstName}
        lastName={c.lastName}
        size="lg"
        ring={`ring-2 ${s.ring}`}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {c.firstName} {c.lastName}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${s.chip}`}>
            <Icon className="h-3 w-3" />
            {c.kind === "birthday"
              ? t("celebrations.birthday")
              : t("celebrations.yearsAnniversary", { years: ordinal(c.years ?? 0) })}
          </span>
          {deptName && <span className="truncate text-xs text-muted-foreground">{deptName}</span>}
        </div>
      </div>

      {/* Date badge — soft pill so the "when" reads clearly */}
      <div
        className={`shrink-0 rounded-md px-2.5 py-1.5 text-center ${
          soon ? s.chip : "bg-muted text-muted-foreground"
        }`}
      >
        <p className="flex items-center justify-center gap-1 text-sm font-bold tabular-nums leading-none">
          <CalendarDays className="h-3.5 w-3.5 opacity-70" />
          {fmtMonthDay(c.nextDate)}
        </p>
        <p className="mt-1 text-[11px] font-medium tabular-nums leading-none opacity-80">
          {c.daysUntil === 1
            ? t("celebrations.tomorrow")
            : t("celebrations.inDays", { count: c.daysUntil })}
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-border bg-card p-5">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted" />
          <div className="mx-auto mt-3 h-4 w-28 rounded bg-muted" />
          <div className="mx-auto mt-2 h-3 w-20 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  hint,
  compact = false,
}: {
  title: string;
  hint: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card text-center ${
        compact ? "py-10" : "py-16"
      }`}
    >
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <PartyPopper className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-semibold text-muted-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
