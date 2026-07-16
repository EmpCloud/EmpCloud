import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { BarChart3, ClipboardList, Users, TrendingUp, Clock, CheckCircle, FileEdit } from "lucide-react";
import { Link } from "react-router-dom";

function StatCard({ label, value, icon: Icon, color, to }: { label: string; value: string | number; icon: any; color: string; to: string }) {
  return (
    <Link
      to={to}
      className="block text-left w-full bg-card rounded-xl border border-border p-6 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </Link>
  );
}

function ENPSGauge({ score }: { score: number | null }) {
  const { t } = useTranslation();
  if (score === null) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-sm font-semibold text-muted-foreground mb-4">{t("surveyDashboard.enpsScore")}</h3>
        <p className="text-muted-foreground text-sm">{t("surveyDashboard.noEnps")}</p>
      </div>
    );
  }

  const color = score >= 50 ? "text-green-600 dark:text-green-400" : score >= 0 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
  const bgColor = score >= 50 ? "bg-green-50 dark:bg-green-950/40" : score >= 0 ? "bg-yellow-50 dark:bg-yellow-950/40" : "bg-red-50 dark:bg-red-950/40";
  const label =
    score >= 50
      ? t("surveyDashboard.enpsExcellent")
      : score >= 20
        ? t("surveyDashboard.enpsGood")
        : score >= 0
          ? t("surveyDashboard.enpsOkay")
          : t("surveyDashboard.enpsNeedsImprovement");

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">{t("surveyDashboard.enpsScore")}</h3>
      <div className={`inline-flex items-center gap-3 px-4 py-3 rounded-lg ${bgColor}`}>
        <span className={`text-4xl font-bold ${color}`}>{score}</span>
        <div>
          <p className={`text-sm font-medium ${color}`}>{label}</p>
          <p className="text-xs text-muted-foreground">{t("surveyDashboard.enpsRange")}</p>
        </div>
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  closed: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  archived: "bg-muted text-muted-foreground",
};

const TYPE_BADGE: Record<string, string> = {
  pulse: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  enps: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300",
  engagement: "bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300",
  custom: "bg-muted text-muted-foreground",
  onboarding: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  exit_survey: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

export default function SurveyDashboardPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["survey-dashboard"],
    queryFn: () => api.get("/surveys/dashboard").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-muted-foreground">{t("surveyDashboard.loading")}</div>
      </div>
    );
  }

  const d = data || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("surveyDashboard.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("surveyDashboard.subtitle")}</p>
        </div>
        <Link
          to="/surveys/builder"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <ClipboardList className="h-4 w-4" /> {t("surveyDashboard.createSurvey")}
        </Link>
      </div>

      {/* Stats Grid */}
      {/* #1532 — Active Surveys deep-links to the list filtered to status=active.
          Total Responses / Avg Response Rate / Total Surveys don't map to any
          single list filter (responses & response-rate aren't filterable fields;
          Total = unfiltered = correct already), so they stay on /surveys/list. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label={t("surveyDashboard.activeSurveys")} value={d.active_count ?? 0} icon={Clock} color="bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400" to="/surveys/list?status=active" />
        <StatCard label={t("surveyDashboard.totalResponses")} value={d.total_responses ?? 0} icon={Users} color="bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" to="/surveys/list" />
        <StatCard label={t("surveyDashboard.avgResponseRate")} value={`${d.avg_response_rate ?? 0}%`} icon={TrendingUp} color="bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400" to="/surveys/list" />
        <StatCard label={t("surveyDashboard.totalSurveys")} value={d.total_count ?? 0} icon={BarChart3} color="bg-muted text-muted-foreground" to="/surveys/list" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1">
          <ENPSGauge score={d.enps_score} />
        </div>
        <div className="lg:col-span-1 bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">{t("surveyDashboard.statusBreakdown")}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileEdit className="h-4 w-4 text-muted-foreground" /> {t("surveyDashboard.drafts")}
              </div>
              <span className="text-sm font-semibold text-foreground">{d.draft_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 text-green-500" /> {t("surveyDashboard.active")}
              </div>
              <span className="text-sm font-semibold text-foreground">{d.active_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-blue-500" /> {t("surveyDashboard.closed")}
              </div>
              <span className="text-sm font-semibold text-foreground">{d.closed_count ?? 0}</span>
            </div>
          </div>
        </div>
        <div className="lg:col-span-1 bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">{t("surveyDashboard.organization")}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("surveyDashboard.totalEmployees")}</span>
              <span className="text-sm font-semibold text-foreground">{d.user_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("surveyDashboard.surveysConducted")}</span>
              <span className="text-sm font-semibold text-foreground">{d.total_count ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Surveys Table */}
      <div className="bg-card rounded-xl border border-border">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{t("surveyDashboard.recentSurveys")}</h3>
          <Link to="/surveys/list" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
            {t("surveyDashboard.viewAll")}
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">{t("surveyDashboard.colTitle")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">{t("surveyDashboard.colType")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">{t("surveyDashboard.colStatus")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">{t("surveyDashboard.colResponses")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">{t("surveyDashboard.colCreated")}</th>
              </tr>
            </thead>
            <tbody>
              {(d.recent_surveys || []).map((s: any) => (
                <tr key={s.id} className="border-b border-border hover:bg-muted">
                  <td className="px-6 py-3">
                    <Link to={`/surveys/${s.id}/results`} className="text-brand-600 dark:text-brand-400 hover:underline font-medium">
                      {s.title}
                    </Link>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE[s.type] || TYPE_BADGE.custom}`}>
                      {t(`surveyDashboard.type.${s.type}`, { defaultValue: s.type })}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] || STATUS_BADGE.draft}`}>
                      {t(`surveyDashboard.status.${s.status}`, { defaultValue: s.status })}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{s.response_count}</td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(!d.recent_surveys || d.recent_surveys.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    {t("surveyDashboard.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
