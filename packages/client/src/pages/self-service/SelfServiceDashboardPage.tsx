import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Clock,
  CalendarDays,
  FileText,
  Megaphone,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Pencil,
  LogIn,
  LogOut,
  Loader2,
  Lock,
} from "lucide-react";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/use-permissions";
import { leaveTypeLabel } from "@/lib/leave-type-label";
import { useAttendancePolicy } from "@/lib/use-attendance-policy";
import { showToast } from "@/components/ui/Toast";
import { richTextToPlainText } from "@/components/ui/RichTextEditor";
import { CompanyFeedWidget } from "@/features/feed/widgets/CompanyFeedWidget";
import { ProfileCompletionCard } from "./ProfileCompletionCard";

function QuickLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2.5 px-3 py-2.5 bg-card border border-border rounded-md hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-950/20 transition-colors duration-150"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/50 transition-colors">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[13px] font-medium text-foreground truncate">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 ml-auto shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-500" />
    </Link>
  );
}

// Compact panel primitive — the enterprise card: 8px radius, tight padding,
// hairline border, an uppercase section-label header with a small accent icon.
// Replaces the old rounded-xl / p-6 / text-lg heading style with the denser,
// more scannable Workday-style module.
function Panel({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: any;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-lg">
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
            {title}
          </h2>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function SelfServiceDashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { dashboardAllowed } = useAttendancePolicy();
  const { has } = usePermissions();
  const canViewAnnouncements = has(
    "announcements:view",
    "announcements:create",
    "announcements:manage",
  );

  // Attendance today
  const { data: attendanceData } = useQuery({
    queryKey: ["my-attendance-today"],
    queryFn: () =>
      api
        .get("/attendance/me/today")
        .then((r) => r.data.data)
        .catch(() => null),
  });

  // Check-in / check-out mutations. Invalidated keys match /attendance/my so
  // that page refreshes too if the user navigates there after clocking in
  // from the dashboard.
  const onAttendanceError = (err: any) =>
    showToast(
      "error",
      err?.response?.data?.error?.message ?? "Could not record attendance. Please try again.",
    );
  // Shared success handler: refresh the attendance caches and confirm the
  // action with a success toast that includes the recorded time so the
  // employee sees exactly when they were clocked in / out.
  const refreshAttendance = () => {
    qc.invalidateQueries({ queryKey: ["my-attendance-today"] });
    qc.invalidateQueries({ queryKey: ["attendance-today"] });
    qc.invalidateQueries({ queryKey: ["attendance-history"] });
    qc.invalidateQueries({ queryKey: ["attendance-me-policy"] });
  };
  const punchTime = (rec: any, field: "check_in" | "check_out") => {
    const iso = rec?.[field] ?? rec?.[`${field}_time`];
    return iso
      ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
      : new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  };
  const checkIn = useMutation({
    mutationFn: () => api.post("/attendance/check-in", { source: "manual" }).then((r) => r.data.data),
    onSuccess: (rec) => {
      refreshAttendance();
      showToast(
        "success",
        t("attendance.checkInSuccess", {
          defaultValue: "Successfully checked in at {{time}}",
          time: punchTime(rec, "check_in"),
        }),
      );
    },
    onError: onAttendanceError,
  });
  const checkOut = useMutation({
    mutationFn: () => api.post("/attendance/check-out", { source: "manual" }).then((r) => r.data.data),
    onSuccess: (rec) => {
      refreshAttendance();
      showToast(
        "success",
        t("attendance.checkOutSuccess", {
          defaultValue: "Successfully checked out at {{time}}",
          time: punchTime(rec, "check_out"),
        }),
      );
    },
    onError: onAttendanceError,
  });

  // Leave balance
  const { data: leaveBalance } = useQuery({
    queryKey: ["my-leave-balance"],
    queryFn: () =>
      api
        .get("/leave/balances")
        .then((r) => r.data.data)
        .catch(() => []),
  });

  // #1414 — fetch leave types so we can render a card per type even before
  // balances are initialized. Uses /leave/types/me which filters out policies
  // whose `applicable_gender` does not match the current user's gender, so
  // e.g. Maternity does not appear for male employees.
  const { data: leaveTypes } = useQuery({
    queryKey: ["leave-types-me"],
    queryFn: () =>
      api
        .get("/leave/types/me")
        .then((r) => r.data.data)
        .catch(() => []),
  });

  // My documents
  const { data: documentsData } = useQuery({
    queryKey: ["my-documents-pending"],
    queryFn: () =>
      api
        .get("/documents/my")
        .then((r) => r.data.data)
        .catch(() => []),
  });

  // Recent announcements
  const { data: announcements } = useQuery({
    queryKey: ["recent-announcements"],
    queryFn: () =>
      api
        .get("/announcements", { params: { page: 1, per_page: 5 } })
        .then((r) => r.data.data)
        .catch(() => []),
    enabled: canViewAnnouncements,
  });

  // Policies to acknowledge
  const { data: policies } = useQuery({
    queryKey: ["pending-policies"],
    queryFn: () =>
      api
        .get("/policies", { params: { page: 1, per_page: 5 } })
        .then((r) => r.data.data)
        .catch(() => []),
  });

  const todayAttendance = attendanceData ?? null;
  const leaveBalances = Array.isArray(leaveBalance) ? leaveBalance : [];
  // #1414 — render one card per active leave type, overlaying the balance row
  // when present so every configured leave type is visible.
  const leaveTypeList: any[] = Array.isArray(leaveTypes) ? leaveTypes : [];
  const leaveCards = leaveTypeList
    .filter((t: any) => Boolean(t.is_active))
    // #1612 — dedupe by display name (keep the row with an allocated balance
    // when duplicates exist) so users don't see two "Sick Leave" cards with
    // conflicting balances on the home dashboard.
    .filter((lt: any, _i: number, arr: any[]) => {
      const sameName = arr.filter((x: any) => x.name === lt.name);
      if (sameName.length === 1) return true;
      const withAllocation = sameName.find((x: any) => {
        const b = leaveBalances.find((bb: any) => bb.leave_type_id === x.id);
        return b && Number(b.total_allocated ?? 0) > 0;
      });
      return withAllocation ? withAllocation.id === lt.id : sameName[0].id === lt.id;
    })
    .map((t: any) => {
      const bal = leaveBalances.find((b: any) => b.leave_type_id === t.id);
      return {
        id: t.id,
        name: t.name,
        code: t.code,
        balance: Number(bal?.balance ?? bal?.remaining ?? 0),
      };
    });
  const pendingDocs = Array.isArray(documentsData) ? documentsData : [];
  const announcementList = Array.isArray(announcements) ? announcements : [];
  const policyList = Array.isArray(policies) ? policies : [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t('selfService.welcomeBack', { name: user?.first_name })}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t('selfService.overviewDesc')}</p>
        </div>
        {/* Primary Check In / Check Out action — always visible in the page
            header so it doesn't require scrolling or navigating to
            /attendance/my to clock in for the day. */}
        <AttendanceHeaderAction
          todayRecord={todayAttendance}
          onCheckIn={() => checkIn.mutate()}
          onCheckOut={() => checkOut.mutate()}
          checkInPending={checkIn.isPending}
          checkOutPending={checkOut.isPending}
          dashboardAllowed={dashboardAllowed}
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-6">
        <QuickLink to="/my-profile" icon={FileText} label={t('nav.myProfile')} />
        <QuickLink to={`/employees/${user?.id}`} icon={Pencil} label={t('selfService.editMyDetails')} />
        <QuickLink to="/leave" icon={CalendarDays} label={t('leave.applyLeave')} />
        <QuickLink to="/attendance/my" icon={Clock} label={t('nav.attendance')} />
        <QuickLink to="/helpdesk/my-tickets" icon={FileText} label={t('selfService.requestUpdate')} />
      </div>

      {/*
        Two-column layout — Company Feed on the left as the focal point,
        the existing self-service cards stacked on the right. The grid uses
        a 3/5 + 2/5 split on lg+ so the feed gets enough width for avatars,
        media and replies; on smaller screens it collapses to a single column
        with the feed first.
      */}
      {/* #1530 — the right column (self-service cards) was previously a grid
          cell that forced the grid row to match its height. When the feed on
          the left had few items the row grew to match the card stack, leaving
          a large empty gap below the feed and an outer scrollbar past the
          content. Fix: take the right column out of document flow on `lg+`
          via absolute positioning, keep sticky + internal scroll intact, and
          have the left column reserve its gutter. Mobile still stacks in
          natural flow. */}
      <div className="lg:relative">
        {/* Left column — Company Feed. Reserves 2/5 width + gap on the right
            for the absolutely positioned card stack. */}
        <div className="lg:pr-[calc(40%+1.5rem)]">
          <CompanyFeedWidget />
        </div>

        {/* Right column — stacked dashboard cards. Absolute on lg+ so the
            page height is driven by the feed column only. Inner wrapper is
            sticky + internally scrollable so tall card stacks remain
            accessible. */}
        <div className="mt-6 lg:mt-0 lg:absolute lg:right-0 lg:top-0 lg:w-2/5">
          <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
        {/* Profile completion nudge — hides itself once the profile is done */}
        <ProfileCompletionCard userId={user?.id} />

        {/* Attendance Today */}
        <Panel icon={Clock} title={t('attendance.myAttendanceToday')}>
          {todayAttendance ? (() => {
            // #1383 — API returns check_in / check_out as ISO timestamps,
            // not check_in_time / check_out_time strings
            const ci = todayAttendance.check_in || todayAttendance.check_in_time;
            const co = todayAttendance.check_out || todayAttendance.check_out_time;
            const fmt = (v: string | null | undefined) =>
              v
                ? new Date(v).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })
                : null;
            const ciText = fmt(ci);
            const coText = fmt(co);

            // Total worked duration when both times exist
            let workedText: string | null = null;
            if (ci && co) {
              const mins = Math.max(
                0,
                Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 60000),
              );
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              workedText = h > 0 ? `${h}h ${m}m` : `${m}m`;
            }

            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Check In */}
                  <div className="rounded-lg border border-green-100 dark:border-green-900 bg-green-50 dark:bg-green-950/40 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('attendance.checkIn')}
                    </div>
                    <p className="mt-1 text-base font-semibold text-foreground">
                      {ciText || "—"}
                    </p>
                  </div>

                  {/* Check Out */}
                  <div
                    className={`rounded-lg border p-3 ${
                      co
                        ? "border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40"
                        : "border-border bg-muted"
                    }`}
                  >
                    <div
                      className={`flex items-center gap-1.5 text-xs font-medium ${
                        co ? "text-indigo-700" : "text-muted-foreground"
                      }`}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      {t('attendance.checkOut')}
                    </div>
                    <p
                      className={`mt-1 text-base font-semibold ${
                        co ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {coText || t('attendance.notYet')}
                    </p>
                  </div>
                </div>

                {/* Total worked */}
                {workedText && (
                  <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{t('attendance.totalWorkedToday')}</span>
                    <span className="font-semibold text-foreground">{workedText}</span>
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="flex items-center gap-2.5">
              <XCircle className="h-4 w-4 text-muted-foreground/50" />
              <p className="text-[13px] text-muted-foreground">{t('attendance.notCheckedInYet')}</p>
            </div>
          )}
        </Panel>

        {/* Recent Announcements — prioritized near the top so company-wide
            notices are seen; only renders when there are items */}
        {canViewAnnouncements && announcementList.length > 0 && (
          <Panel
            icon={Megaphone}
            title={t('announcements.title')}
            action={
              <Link to="/announcements" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                {t('common.viewAll')}
              </Link>
            }
          >
            <ul className="-my-1 divide-y divide-border">
              {announcementList.slice(0, 3).map((a: any) => (
                <li key={a.id} className="py-2.5">
                  <p className="text-[13px] font-medium text-foreground">{a.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {richTextToPlainText(a.content) || a.body || ""}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* Leave Balances */}
        <Panel icon={CalendarDays} title={t('leave.leaveBalance')}>
          {leaveCards.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {leaveCards.map((c) => (
                <div key={c.id} className="rounded-md border border-border bg-muted/50 px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{leaveTypeLabel(t, c)}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums leading-none text-foreground">{c.balance}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t('leave.daysRemaining')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t('leave.noTypes')}</p>
          )}
        </Panel>

        {/* Pending Documents */}
        <Panel
          icon={FileText}
          title={t('documents.pending')}
          action={
            <Link to="/documents" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
              {t('common.viewAll')}
            </Link>
          }
        >
          {pendingDocs.length > 0 ? (
            <ul className="-my-1 divide-y divide-border">
              {pendingDocs.slice(0, 5).map((doc: any) => (
                <li key={doc.id} className="flex items-center gap-2 py-2 text-[13px]">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate text-foreground">{doc.title || doc.original_name || doc.file_name || doc.category_name || t('documents.fallbackName')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t('documents.noPending')}</p>
          )}
        </Panel>

        {/* Policies to Acknowledge — only render when there are items */}
        {policyList.length > 0 && (
          <Panel
            icon={BookOpen}
            title={t('policies.title')}
            action={
              <Link to="/policies" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                {t('common.viewAll')}
              </Link>
            }
          >
            <ul className="-my-1 divide-y divide-border">
              {policyList.slice(0, 5).map((p: any) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2 text-[13px]"
                >
                  <span className="truncate text-foreground">{p.title}</span>
                  {p.acknowledged ? (
                    <span className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="h-3 w-3" /> {t('policies.acknowledged')}
                    </span>
                  ) : (
                    <Link
                      to="/policies"
                      className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                    >
                      {t('policies.review')}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact header action — a single button that flips between Check In,
// Check Out and a "Completed" pill based on the current day's attendance.
// Placed in the top-right of the welcome header so the action is always
// one click away, independent of scroll position.
// ---------------------------------------------------------------------------

function AttendanceHeaderAction({
  todayRecord,
  onCheckIn,
  onCheckOut,
  checkInPending,
  checkOutPending,
  dashboardAllowed,
}: {
  todayRecord: any;
  onCheckIn: () => void;
  onCheckOut: () => void;
  checkInPending: boolean;
  checkOutPending: boolean;
  dashboardAllowed: boolean;
}) {
  const { t } = useTranslation();
  // The attendance API returns check_in / check_out as ISO timestamps; older
  // code read *_time fallbacks (see #1383). Keep both for safety.
  const ci = todayRecord?.check_in || todayRecord?.check_in_time || null;
  const co = todayRecord?.check_out || todayRecord?.check_out_time || null;
  const hasCheckedIn = !!ci;
  const hasCheckedOut = !!co;

  // Web check-in disabled by org / override — show a small explanation
  // pill instead of an actionable button. The user can still check out via
  // a biometric device or the mobile app if those channels are enabled.
  if (!dashboardAllowed) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-md bg-muted border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground"
        title="Use the EmpCloud mobile app or a biometric device to check in / out."
      >
        <Lock className="h-4 w-4" />
        Web check-in disabled
      </div>
    );
  }

  if (!hasCheckedIn) {
    return (
      <button
        type="button"
        onClick={onCheckIn}
        disabled={checkInPending}
        className="inline-flex items-center gap-2 rounded-md bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 hover:shadow transition-all disabled:opacity-50"
      >
        {checkInPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogIn className="h-4 w-4" />
        )}
        {t('attendance.checkIn')}
      </button>
    );
  }

  // Checked in — always keep an actionable Check Out button visible, even
  // AFTER a check-out. Check-in is naturally one-time (it's the first punch
  // of the day and stays locked), but check-out is the LATEST punch and rolls
  // forward on every tap (see attendance.service.ts). Keeping the button live
  // lets an employee who checked out early / by mistake re-check-out at the
  // correct time instead of being stuck with the wrong time. Once they've
  // checked out at least once we relabel to "Update check-out" and show the
  // recorded time so the second click clearly overwrites rather than looks
  // like a fresh action.
  const coText = co
    ? new Date(co).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    : null;
  return (
    <div className="flex items-center gap-2.5">
      {hasCheckedOut && coText && (
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          {t('attendance.checkedOutAt', { defaultValue: 'Checked out {{time}}', time: coText })}
        </span>
      )}
      <button
        type="button"
        onClick={onCheckOut}
        disabled={checkOutPending}
        title={hasCheckedOut ? t('attendance.updateCheckOutHint', { defaultValue: 'Check out again to correct the time' }) : undefined}
        className="inline-flex items-center gap-2 rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 hover:shadow transition-all disabled:opacity-50"
      >
        {checkOutPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogOut className="h-4 w-4" />
        )}
        {t('attendance.checkOut')}
      </button>
    </div>
  );
}
