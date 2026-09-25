import type { ReactNode } from "react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import api from "@/api/client";
import { leaveTypeLabel } from "@/lib/leave-type-label";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ClipboardList,
  Sun,
} from "lucide-react";

// Compact panel primitive — the enterprise card: 8px radius, hairline border,
// an uppercase section-label header. Shared with the self-service dashboard;
// body has no padding by default so lists/tables sit flush against the header.
function Panel({
  title,
  action,
  icon: Icon,
  bodyClassName = "",
  id,
  children,
}: {
  title: string;
  action?: ReactNode;
  icon?: any;
  bodyClassName?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />}
          <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h2>
        </div>
        {action}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

interface TeamMember {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  emp_code: string | null;
  role: string;
  designation: string | null;
  photo_path: string | null;
}

interface PendingLeave {
  id: number;
  user_id: number;
  start_date: string;
  end_date: string;
  days_count: number;
  is_half_day: boolean;
  reason: string;
  status: string;
  first_name: string;
  last_name: string;
  emp_code: string | null;
  leave_type_name: string | null;
  leave_type_code?: string | null;
  created_at: string;
}

interface CalendarLeave {
  id: number;
  user_id: number;
  start_date: string;
  end_date: string;
  days_count: number;
  is_half_day: boolean;
  half_day_type: string | null;
  first_name: string;
  last_name: string;
  leave_type_name: string | null;
  leave_type_code?: string | null;
  leave_type_color: string | null;
}

export default function ManagerDashboardPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [remarks, setRemarks] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  // Dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["manager-dashboard"],
    queryFn: () => api.get("/manager/dashboard").then((r) => r.data.data),
  });

  // Team list
  const { data: team = [], isLoading: teamLoading } = useQuery<TeamMember[]>({
    queryKey: ["manager-team"],
    queryFn: () => api.get("/manager/team").then((r) => r.data.data),
  });

  // Team attendance today
  const { data: attendance } = useQuery({
    queryKey: ["manager-attendance"],
    queryFn: () => api.get("/manager/attendance").then((r) => r.data.data),
  });

  // Pending leaves
  const { data: pendingLeaves = [] } = useQuery<PendingLeave[]>({
    queryKey: ["manager-leaves-pending"],
    queryFn: () => api.get("/manager/leaves/pending").then((r) => r.data.data),
  });

  // Team leave calendar (this week)
  const { data: calendar = [] } = useQuery<CalendarLeave[]>({
    queryKey: ["manager-leaves-calendar"],
    queryFn: () => api.get("/manager/leaves/calendar").then((r) => r.data.data),
  });

  // Approve / reject leave mutations
  const approveMut = useMutation({
    mutationFn: (id: number) =>
      api.put(`/leave/applications/${id}/approve`, { remarks }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-leaves-pending"] });
      qc.invalidateQueries({ queryKey: ["manager-dashboard"] });
      qc.invalidateQueries({ queryKey: ["manager-leaves-calendar"] });
      setActionId(null);
      setRemarks("");
    },
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) =>
      api.put(`/leave/applications/${id}/reject`, { remarks }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-leaves-pending"] });
      qc.invalidateQueries({ queryKey: ["manager-dashboard"] });
      setActionId(null);
      setRemarks("");
    },
  });

  // #1557 — Each card scrolls to the matching section on this same page.
  // The data is all already present below; the cards just needed a way to
  // act on a click. Team Size → Direct Reports; attendance stats → Team
  // Attendance Today; Pending Leaves → Pending Leave Requests.
  const teamSize = Number(stats?.team_size ?? team.length ?? 0);
  const percentage = (value: unknown) => teamSize > 0 ? Math.round((Number(value ?? 0) / teamSize) * 100) : 0;
  const statCards = [
    { key: "teamSize", label: t('manager.stats.teamSize'), value: stats?.team_size ?? team.length, icon: Users, color: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300", section: "direct-reports", percent: null, percentColor: "" },
    { key: "presentToday", label: t('manager.stats.presentToday'), value: stats?.present_today ?? 0, icon: UserCheck, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300", section: "team-attendance", percent: percentage(stats?.present_today), percentColor: "bg-emerald-50 text-emerald-600" },
    { key: "absentToday", label: t('manager.stats.absentToday'), value: stats?.absent_today ?? 0, icon: UserX, color: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300", section: "team-attendance", percent: percentage(stats?.absent_today), percentColor: "bg-rose-50 text-rose-600" },
    { key: "onLeave", label: t('manager.stats.onLeave'), value: stats?.on_leave_today ?? 0, icon: CalendarDays, color: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300", section: "team-attendance", percent: percentage(stats?.on_leave_today), percentColor: "bg-violet-50 text-violet-600" },
    { key: "lateToday", label: t('manager.stats.lateToday'), value: stats?.late_today ?? 0, icon: AlertTriangle, color: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300", section: "team-attendance", percent: percentage(stats?.late_today), percentColor: "bg-amber-50 text-amber-600" },
    { key: "pendingLeaves", label: t('manager.stats.pendingLeaves'), value: stats?.pending_leave_requests ?? pendingLeaves.length, icon: Clock, color: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300", section: "pending-leaves", percent: percentage(stats?.pending_leave_requests ?? pendingLeaves.length), percentColor: "bg-orange-50 text-orange-600" },
  ];

  const locale = i18n.language === "de" ? "de-DE" : i18n.language === "es" ? "es-ES" : "en-IN";
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return {
      date,
      dateKey,
      count: calendar.filter((leave) => leave.start_date <= dateKey && leave.end_date >= dateKey).length,
      isToday: date.toDateString() === today.toDateString(),
    };
  });
  const attendanceRows = [
    ...(attendance?.present ?? []).map((member: any) => ({ ...member, attendanceType: "present" as const })),
    ...(attendance?.absent ?? []).map((member: any) => ({ ...member, attendanceType: "absent" as const })),
    ...(attendance?.on_leave ?? []).map((member: any) => ({ ...member, attendanceType: "leave" as const })),
  ];
  const attendancePreview = attendanceRows.slice(0, 1);
  const formattedToday = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(today);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("manager.teamManagement", { defaultValue: "Team Management" })}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{t('manager.title')}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{t('manager.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm">
            {formattedToday}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            {t("manager.engagementPrompt", { defaultValue: "Keep your team engaged!" })}
            <Sun aria-hidden="true" className="h-3.5 w-3.5 text-amber-500" />
          </div>
        </div>
      </div>

      {/* Stat tiles — compact KPI treatment: icon chip, big tabular number,
          uppercase micro-label. Each is a jump-link to its section below. */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {statCards.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => scrollToSection(s.section)}
            aria-label={`Jump to ${s.label}`}
            className="group min-h-[100px] rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <div className="flex items-center justify-between">
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.color}`}>
                <s.icon aria-hidden="true" className="h-4 w-4" />
              </span>
              {s.percent !== null && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${s.percentColor}`}>{s.percent}%</span>
              )}
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums leading-none text-foreground">
              {statsLoading ? "—" : s.value}
            </p>
            <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Team Attendance Today */}
        <Panel
          id="team-attendance"
          icon={Users}
          title={t('manager.teamAttendanceToday')}
          bodyClassName="divide-y divide-border"
          action={<Link to="/attendance" className="text-[11px] font-medium text-brand-600 hover:underline">{t("common.viewAll")}</Link>}
        >
            {attendanceRows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t('manager.noTeamMembers')}</div>
            ) : (
              attendancePreview.map((member: any) => {
                const isPresent = member.attendanceType === "present";
                const isAbsent = member.attendanceType === "absent";
                const statusLabel = isPresent
                  ? member.status === "half_day" ? t('manager.statusHalfDay') : t('manager.statusPresent')
                  : isAbsent ? t('manager.statusAbsent') : t('manager.statusOnLeave');
                const statusClasses = isPresent
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : isAbsent
                    ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    : "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300";
                const avatarClasses = isPresent
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : isAbsent
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    : "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300";

                return (
                  <div key={`${member.attendanceType}-${member.id}`} className="flex min-h-[70px] items-center justify-between px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarClasses}`}>
                        {member.first_name?.[0]}{member.last_name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-foreground">{member.first_name} {member.last_name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {isPresent
                            ? `${t('manager.inPrefix')}: ${member.check_in ? new Date(member.check_in).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "-"}`
                            : member.emp_code || member.email}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses}`}>{statusLabel}</span>
                  </div>
                );
              })
            )}
        </Panel>

        {/* Team Leave Calendar (this week) */}
        <Panel
          icon={CalendarDays}
          title={t('manager.teamLeaveCalendar')}
          action={<Link to="/leave" className="text-[11px] font-medium text-brand-600 hover:underline">{t("manager.viewCalendar", { defaultValue: "View calendar" })}</Link>}
        >
          <div className="grid grid-cols-7 gap-1 p-3">
            {weekDays.map((day) => (
              <div
                key={day.dateKey}
                className={`rounded-lg px-1 py-2 text-center ${day.isToday ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300" : "text-muted-foreground"}`}
              >
                <p className="text-[10px] font-semibold uppercase">{new Intl.DateTimeFormat(locale, { weekday: "short" }).format(day.date)}</p>
                <p className="mt-0.5 text-[10px]">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(day.date)}</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-foreground">{day.count}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Pending Leave Requests */}
      <Panel
        id="pending-leaves"
        icon={ClipboardList}
        title={t('manager.pendingLeaveRequests')}
        bodyClassName="overflow-x-auto"
        action={
          <div className="flex items-center gap-2">
            <Link to="/leave" className="text-[11px] font-medium text-brand-600 hover:underline">{t("common.viewAll")}</Link>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              {t('manager.pendingBadge', { count: pendingLeaves.length })}
            </span>
          </div>
        }
      >
        <table className="min-w-full text-[13px]">
          <thead className="bg-muted/60 border-b border-border">
            <tr>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5">{t('manager.table.employee')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5">{t('manager.table.type')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5">{t('manager.table.dates')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5">{t('manager.table.days')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5">{t('manager.table.reason')}</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5">{t('manager.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pendingLeaves.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <ClipboardList aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="mt-2 block text-[13px] font-semibold text-foreground">{t('manager.noPendingRequests')}</span>
                  <span className="mt-0.5 block text-[11px]">{t("manager.pendingUpToDate", { defaultValue: "All leave requests are up to date." })}</span>
                </td>
              </tr>
            ) : (
              pendingLeaves.map((leave) => (
                <tr key={leave.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center text-xs font-semibold text-brand-700 dark:text-brand-300">
                        {leave.first_name?.[0]}{leave.last_name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {leave.first_name} {leave.last_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{leave.emp_code || ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {leave.leave_type_name ? leaveTypeLabel(t, { code: leave.leave_type_code, name: leave.leave_type_name }) : "-"}
                    {/* #1609 — guard with Boolean(): MySQL tinyint 0 renders as literal "0". */}
                    {Boolean(leave.is_half_day) && <span className="ml-1 text-[11px] text-muted-foreground">{t('manager.halfSuffix')}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {leave.start_date} &mdash; {leave.end_date}
                  </td>
                  <td className="px-4 py-2.5 text-foreground font-medium tabular-nums">
                    {Number(leave.days_count)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-muted-foreground max-w-xs truncate cursor-help"
                    title={leave.reason || ""}
                  >
                    {leave.reason}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setActionId(actionId === leave.id ? null : leave.id)}
                          className="text-[11px] font-medium bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-2.5 py-1 rounded-md hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"
                        >
                          {t('manager.review')}
                        </button>
                      </div>
                      {actionId === leave.id && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder={t('manager.remarksPlaceholder')}
                            className="bg-card text-foreground px-2 py-1 border border-border rounded-md text-xs flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                          <button
                            onClick={() => approveMut.mutate(leave.id)}
                            disabled={approveMut.isPending}
                            className="inline-flex items-center gap-1 text-xs font-medium bg-green-600 text-white px-2.5 py-1 rounded-md hover:bg-green-700 disabled:opacity-50 whitespace-nowrap transition-colors"
                          >
                            <CheckCircle2 className="h-3 w-3" />{t('manager.approve')}
                          </button>
                          <button
                            onClick={() => rejectMut.mutate(leave.id)}
                            disabled={rejectMut.isPending}
                            className="inline-flex items-center gap-1 text-xs font-medium bg-red-600 text-white px-2.5 py-1 rounded-md hover:bg-red-700 disabled:opacity-50 whitespace-nowrap transition-colors"
                          >
                            <XCircle className="h-3 w-3" />{t('manager.reject')}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Panel>

      {/* Direct reports use profile cards so names, roles, and employee codes
          remain easy to scan while each profile stays one clear link target. */}
      <section id="direct-reports" className="mt-5 scroll-mt-4" aria-labelledby="direct-reports-title">
        <header className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
            <Users aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="direct-reports-title" className="text-2xl font-bold uppercase leading-7 tracking-wide text-foreground">
              {t('manager.directReports')}
            </h2>
            <p className="text-[15px] leading-5 text-muted-foreground">
              {t('manager.teamMembersReporting', { count: team.length })}
            </p>
          </div>
        </header>

        {teamLoading ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-sm">
            {t('manager.loadingTeam')}
          </div>
        ) : team.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-sm">
            {t('manager.noDirectReports')}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {team.map((member) => (
              <Link
                key={member.id}
                to={`/employees/${member.id}`}
                aria-label={`${t('manager.viewProfile')}: ${member.first_name} ${member.last_name}`}
                className="group flex min-h-[172px] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <div className="flex flex-1 items-center gap-4 p-5">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl font-bold text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
                    {member.first_name?.[0]}{member.last_name?.[0]}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold leading-6 text-foreground">
                      {member.first_name} {member.last_name}
                    </h3>
                    <p className="mt-0.5 truncate text-base leading-5 text-muted-foreground">
                      {member.designation || member.role}
                    </p>
                    <p className="mt-1 truncate text-base leading-5 text-muted-foreground">
                      {member.emp_code || member.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border px-5 py-3">
                  <span className="text-[15px] font-semibold leading-5 text-brand-600 dark:text-brand-300">
                    {t('manager.viewProfile')}
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100 dark:bg-brand-950/40 dark:text-brand-300 dark:group-hover:bg-brand-900/60">
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
