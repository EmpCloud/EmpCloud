import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { BarChart3, ClipboardList, Users, TrendingUp, Clock, CheckCircle, FileEdit } from "lucide-react";
import { Link } from "react-router-dom";

function StatCard({ label, value, icon: Icon, color, to }: { label: string; value: string | number; icon: any; color: string; to: string }) {
  return (
    <Link
      to={to}
      className="block text-left w-full bg-white rounded-xl border border-gray-200 p-6 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </Link>
  );
}

function ENPSGauge({ score }: { score: number | null }) {
  const { t } = useTranslation();
  if (score === null) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">{t("surveyDashboard.enpsScore")}</h3>
        <p className="text-gray-400 text-sm">{t("surveyDashboard.noEnps")}</p>
      </div>
    );
  }

  const color = score >= 50 ? "text-green-600" : score >= 0 ? "text-yellow-600" : "text-red-600";
  const bgColor = score >= 50 ? "bg-green-50" : score >= 0 ? "bg-yellow-50" : "bg-red-50";
  const label =
    score >= 50
      ? t("surveyDashboard.enpsExcellent")
      : score >= 20
        ? t("surveyDashboard.enpsGood")
        : score >= 0
          ? t("surveyDashboard.enpsOkay")
          : t("surveyDashboard.enpsNeedsImprovement");

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{t("surveyDashboard.enpsScore")}</h3>
      <div className={`inline-flex items-center gap-3 px-4 py-3 rounded-lg ${bgColor}`}>
        <span className={`text-4xl font-bold ${color}`}>{score}</span>
        <div>
          <p className={`text-sm font-medium ${color}`}>{label}</p>
          <p className="text-xs text-gray-500">{t("surveyDashboard.enpsRange")}</p>
        </div>
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  closed: "bg-blue-100 text-blue-700",
  archived: "bg-gray-100 text-gray-500",
};

const TYPE_BADGE: Record<string, string> = {
  pulse: "bg-purple-100 text-purple-700",
  enps: "bg-indigo-100 text-indigo-700",
  engagement: "bg-teal-100 text-teal-700",
  custom: "bg-gray-100 text-gray-700",
  onboarding: "bg-orange-100 text-orange-700",
  exit_survey: "bg-red-100 text-red-700",
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
        <div className="text-gray-400">{t("surveyDashboard.loading")}</div>
      </div>
    );
  }

  const d = data || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("surveyDashboard.title")}</h1>
          <p className="text-gray-500 mt-1">{t("surveyDashboard.subtitle")}</p>
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
        <StatCard label={t("surveyDashboard.activeSurveys")} value={d.active_count ?? 0} icon={Clock} color="bg-green-100 text-green-600" to="/surveys/list?status=active" />
        <StatCard label={t("surveyDashboard.totalResponses")} value={d.total_responses ?? 0} icon={Users} color="bg-blue-100 text-blue-600" to="/surveys/list" />
        <StatCard label={t("surveyDashboard.avgResponseRate")} value={`${d.avg_response_rate ?? 0}%`} icon={TrendingUp} color="bg-purple-100 text-purple-600" to="/surveys/list" />
        <StatCard label={t("surveyDashboard.totalSurveys")} value={d.total_count ?? 0} icon={BarChart3} color="bg-gray-100 text-gray-600" to="/surveys/list" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1">
          <ENPSGauge score={d.enps_score} />
        </div>
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{t("surveyDashboard.statusBreakdown")}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileEdit className="h-4 w-4 text-gray-400" /> {t("surveyDashboard.drafts")}
              </div>
              <span className="text-sm font-semibold text-gray-900">{d.draft_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4 text-green-500" /> {t("surveyDashboard.active")}
              </div>
              <span className="text-sm font-semibold text-gray-900">{d.active_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="h-4 w-4 text-blue-500" /> {t("surveyDashboard.closed")}
              </div>
              <span className="text-sm font-semibold text-gray-900">{d.closed_count ?? 0}</span>
            </div>
          </div>
        </div>
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{t("surveyDashboard.organization")}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("surveyDashboard.totalEmployees")}</span>
              <span className="text-sm font-semibold text-gray-900">{d.user_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("surveyDashboard.surveysConducted")}</span>
              <span className="text-sm font-semibold text-gray-900">{d.total_count ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Surveys Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{t("surveyDashboard.recentSurveys")}</h3>
          <Link to="/surveys/list" className="text-xs text-brand-600 hover:underline">
            {t("surveyDashboard.viewAll")}
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveyDashboard.colTitle")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveyDashboard.colType")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveyDashboard.colStatus")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveyDashboard.colResponses")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{t("surveyDashboard.colCreated")}</th>
              </tr>
            </thead>
            <tbody>
              {(d.recent_surveys || []).map((s: any) => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link to={`/surveys/${s.id}/results`} className="text-brand-600 hover:underline font-medium">
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
                  <td className="px-6 py-3 text-gray-600">{s.response_count}</td>
                  <td className="px-6 py-3 text-gray-400">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(!d.recent_surveys || d.recent_surveys.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
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
