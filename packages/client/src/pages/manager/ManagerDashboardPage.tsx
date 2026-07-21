import type { ReactNode } from "react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  ChevronRight,
} from "lucide-react";

// Compact panel primitive — the enterprise card: 8px radius, hairline border,
// an uppercase section-label header. Shared with the self-service dashboard;
// body has no padding by default so lists/tables sit flush against the header.
function Panel({
  title,
  action,
  bodyClassName = "",
  id,
  children,
}: {
  title: string;
  action?: ReactNode;
  bodyClassName?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="bg-card border border-border rounded-lg overflow-hidden scroll-mt-4">
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
          {title}
        </h2>
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
  const { t } = useTranslation();
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
  const statCards = [
    { key: "teamSize", label: t('manager.stats.teamSize'), value: stats?.team_size ?? "-", icon: Users, color: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300", section: "direct-reports" },
    { key: "presentToday", label: t('manager.stats.presentToday'), value: stats?.present_today ?? "-", icon: UserCheck, color: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300", section: "team-attendance" },
    { key: "absentToday", label: t('manager.stats.absentToday'), value: stats?.absent_today ?? "-", icon: UserX, color: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300", section: "team-attendance" },
    { key: "onLeave", label: t('manager.stats.onLeave'), value: stats?.on_leave_today ?? "-", icon: CalendarDays, color: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300", section: "team-attendance" },
    { key: "lateToday", label: t('manager.stats.lateToday'), value: stats?.late_today ?? "-", icon: AlertTriangle, color: "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300", section: "team-attendance" },
    { key: "pendingLeaves", label: t('manager.stats.pendingLeaves'), value: stats?.pending_leave_requests ?? "-", icon: Clock, color: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300", section: "pending-leaves" },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t('manager.title')}</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          {t('manager.subtitle')}
        </p>
      </div>

      {/* Stat tiles — compact KPI treatment: icon chip, big tabular number,
          uppercase micro-label. Each is a jump-link to its section below. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-6">
        {statCards.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => scrollToSection(s.section)}
            aria-label={`Jump to ${s.label}`}
            className="group bg-card rounded-lg border border-border p-3 text-left transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <div className="flex items-center justify-between">
              <span className={`flex h-8 w-8 items-center justify-center rounded-md ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2.5 text-2xl font-semibold tabular-nums leading-none text-foreground">
              {statsLoading ? "—" : s.value}
            </p>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
              {s.label}
            </p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Team Attendance Today */}
        <Panel id="team-attendance" title={t('manager.teamAttendanceToday')} bodyClassName="divide-y divide-border max-h-80 overflow-y-auto">
            {attendance?.present?.length === 0 && attendance?.absent?.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t('manager.noTeamMembers')}</div>
            ) : (
              <>
                {(attendance?.present || []).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center text-sm font-semibold text-green-700 dark:text-green-300">
                        {r.first_name?.[0]}{r.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{r.first_name} {r.last_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('manager.inPrefix')}: {r.check_in ? new Date(r.check_in).toLocaleTimeString() : "-"}
                          {r.check_out ? ` | ${t('manager.outPrefix')}: ${new Date(r.check_out).toLocaleTimeString()}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 font-medium">
                      {r.status === "half_day" ? t('manager.statusHalfDay') : t('manager.statusPresent')}
                    </span>
                  </div>
                ))}
                {(attendance?.absent || []).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center text-sm font-semibold text-red-700 dark:text-red-300">
                        {m.first_name?.[0]}{m.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.first_name} {m.last_name}</p>
                        <p className="text-xs text-muted-foreground">{m.emp_code || m.email}</p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-medium">
                      {t('manager.statusAbsent')}
                    </span>
                  </div>
                ))}
                {(attendance?.on_leave || []).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center text-sm font-semibold text-purple-700 dark:text-purple-300">
                        {r.first_name?.[0]}{r.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{r.first_name} {r.last_name}</p>
                        <p className="text-xs text-muted-foreground">{r.emp_code || r.email}</p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-medium">
                      {t('manager.statusOnLeave')}
                    </span>
                  </div>
                ))}
              </>
            )}
        </Panel>

        {/* Team Leave Calendar (this week) */}
        <Panel title={t('manager.teamLeaveCalendar')} bodyClassName="divide-y divide-border max-h-80 overflow-y-auto">
            {calendar.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                {t('manager.noApprovedLeaves')}
              </div>
            ) : (
              calendar.map((leave) => (
                <div key={leave.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: leave.leave_type_color || "#6366f1" }}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {leave.first_name} {leave.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {leave.leave_type_name ? leaveTypeLabel(t, { code: leave.leave_type_code, name: leave.leave_type_name }) : t('manager.leaveFallback')} &mdash;{" "}
                        {leave.start_date === leave.end_date
                          ? leave.start_date
                          : `${leave.start_date} \u2013 ${leave.end_date}`}
                        {/* #1609 — guard with Boolean(): MySQL tinyint 0 renders as literal "0". */}
                        {Boolean(leave.is_half_day) && ` (${leave.half_day_type === "first_half" ? t('manager.halfFirst') : t('manager.halfSecond')})`}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{Number(leave.days_count)}d</span>
                </div>
              ))
            )}
        </Panel>
      </div>

      {/* Pending Leave Requests */}
      <Panel
        id="pending-leaves"
        title={t('manager.pendingLeaveRequests')}
        bodyClassName="overflow-x-auto"
        action={
          <span className="text-[11px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
            {t('manager.pendingBadge', { count: pendingLeaves.length })}
          </span>
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
                  {t('manager.noPendingRequests')}
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

      {/* Direct Reports List */}
      <div className="mt-4">
      <Panel id="direct-reports" title={t('manager.directReports')} bodyClassName="divide-y divide-border">
          {teamLoading ? (
            <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t('manager.loadingTeam')}</div>
          ) : team.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              {t('manager.noDirectReports')}
            </div>
          ) : (
            team.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => window.location.href = `/employees/${member.id}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center text-xs font-semibold text-brand-700 dark:text-brand-300">
                    {member.first_name?.[0]}{member.last_name?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {member.first_name} {member.last_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {member.designation || member.role} {member.emp_code ? `| ${member.emp_code}` : ""}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              </div>
            ))
          )}
      </Panel>
      </div>
    </div>
  );
}
