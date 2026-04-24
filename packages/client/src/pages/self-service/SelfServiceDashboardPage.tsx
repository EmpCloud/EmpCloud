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
} from "lucide-react";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { leaveTypeLabel } from "@/lib/leave-type-label";
import { CompanyFeedWidget } from "@/features/feed/widgets/CompanyFeedWidget";

function QuickLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-brand-300 hover:shadow-sm transition-all group"
    >
      <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 group-hover:bg-brand-100">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-sm font-medium text-gray-700 group-hover:text-brand-600">{label}</span>
      <ArrowRight className="h-4 w-4 text-gray-400 ml-auto group-hover:text-brand-500" />
    </Link>
  );
}

export default function SelfServiceDashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

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
  const checkIn = useMutation({
    mutationFn: () => api.post("/attendance/check-in", { source: "manual" }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
    },
  });
  const checkOut = useMutation({
    mutationFn: () => api.post("/attendance/check-out", { source: "manual" }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
    },
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

  // #1414 — fetch all active leave types so we can render a card per type
  // even before balances are initialized (missing balances render as 0).
  const { data: leaveTypes } = useQuery({
    queryKey: ["leave-types"],
    queryFn: () =>
      api
        .get("/leave/types")
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
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('selfService.welcomeBack', { name: user?.first_name })}
          </h1>
          <p className="text-gray-500 mt-1">{t('selfService.overviewDesc')}</p>
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
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
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
          <div className="space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
        {/* Attendance Today */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('attendance.myAttendanceToday')}</h2>
          </div>
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
                  <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('attendance.checkIn')}
                    </div>
                    <p className="mt-1 text-base font-semibold text-gray-900">
                      {ciText || "—"}
                    </p>
                  </div>

                  {/* Check Out */}
                  <div
                    className={`rounded-lg border p-3 ${
                      co
                        ? "border-indigo-100 bg-indigo-50"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div
                      className={`flex items-center gap-1.5 text-xs font-medium ${
                        co ? "text-indigo-700" : "text-gray-500"
                      }`}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      {t('attendance.checkOut')}
                    </div>
                    <p
                      className={`mt-1 text-base font-semibold ${
                        co ? "text-gray-900" : "text-gray-400"
                      }`}
                    >
                      {coText || t('attendance.notYet')}
                    </p>
                  </div>
                </div>

                {/* Total worked */}
                {workedText && (
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                    <span className="text-gray-500">{t('attendance.totalWorkedToday')}</span>
                    <span className="font-semibold text-gray-900">{workedText}</span>
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-gray-300" />
              <p className="text-sm text-gray-500">{t('attendance.notCheckedInYet')}</p>
            </div>
          )}
        </div>

        {/* Leave Balances */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('leave.leaveBalance')}</h2>
          </div>
          {leaveCards.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {leaveCards.map((c) => (
                <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{leaveTypeLabel(t, c)}</p>
                  <p className="text-lg font-bold text-gray-900">{c.balance}</p>
                  <p className="text-xs text-gray-400">{t('leave.daysRemaining')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{t('leave.noTypes')}</p>
          )}
        </div>

        {/* Pending Documents */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-brand-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('documents.pending')}</h2>
            </div>
            <Link to="/documents" className="text-xs text-brand-600 hover:underline">
              {t('common.viewAll')}
            </Link>
          </div>
          {pendingDocs.length > 0 ? (
            <ul className="space-y-2">
              {pendingDocs.slice(0, 5).map((doc: any) => (
                <li key={doc.id} className="flex items-center gap-2 text-sm text-gray-600">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="truncate">{doc.title || doc.original_name || doc.file_name || doc.category_name || t('documents.fallbackName')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">{t('documents.noPending')}</p>
          )}
        </div>

        {/* Recent Announcements — only render when there are items */}
        {announcementList.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-brand-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('announcements.title')}</h2>
              </div>
              <Link to="/announcements" className="text-xs text-brand-600 hover:underline">
                {t('common.viewAll')}
              </Link>
            </div>
            <ul className="space-y-3">
              {announcementList.slice(0, 3).map((a: any) => (
                <li key={a.id}>
                  <p className="text-sm font-medium text-gray-900">{a.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {a.content || a.body || ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Policies to Acknowledge — only render when there are items */}
        {policyList.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-brand-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('policies.title')}</h2>
              </div>
              <Link to="/policies" className="text-xs text-brand-600 hover:underline">
                {t('common.viewAll')}
              </Link>
            </div>
            <ul className="space-y-2">
              {policyList.slice(0, 5).map((p: any) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between text-sm text-gray-600 border-b border-gray-100 pb-2 last:border-0"
                >
                  <span>{p.title}</span>
                  {p.acknowledged ? (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {t('policies.acknowledged')}
                    </span>
                  ) : (
                    <Link
                      to="/policies"
                      className="text-xs text-brand-600 hover:underline"
                    >
                      {t('policies.review')}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
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
}: {
  todayRecord: any;
  onCheckIn: () => void;
  onCheckOut: () => void;
  checkInPending: boolean;
  checkOutPending: boolean;
}) {
  const { t } = useTranslation();
  // The attendance API returns check_in / check_out as ISO timestamps; older
  // code read *_time fallbacks (see #1383). Keep both for safety.
  const ci = todayRecord?.check_in || todayRecord?.check_in_time || null;
  const co = todayRecord?.check_out || todayRecord?.check_out_time || null;
  const hasCheckedIn = !!ci;
  const hasCheckedOut = !!co;

  if (hasCheckedOut) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-2.5 text-sm font-medium text-green-700">
        <CheckCircle2 className="h-4 w-4" />
        {t('attendance.attendanceComplete')}
      </div>
    );
  }

  if (!hasCheckedIn) {
    return (
      <button
        type="button"
        onClick={onCheckIn}
        disabled={checkInPending}
        className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 hover:shadow transition-all disabled:opacity-50"
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

  return (
    <button
      type="button"
      onClick={onCheckOut}
      disabled={checkOutPending}
      className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 hover:shadow transition-all disabled:opacity-50"
    >
      {checkOutPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      {t('attendance.checkOut')}
    </button>
  );
}
