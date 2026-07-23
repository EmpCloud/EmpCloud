import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  Heart,
  TrendingUp,
  Users,
  Trophy,
  Smile,
  Meh,
  Frown,
  Zap,
  Dumbbell,
  Target,
  Plus,
  X,
} from "lucide-react";
import { showToast } from "@/components/ui/Toast";

const MOOD_CONFIG: Record<string, { color: string; icon: any }> = {
  great: { color: "text-green-600 dark:text-green-400", icon: Smile },
  good: { color: "text-blue-600 dark:text-blue-400", icon: Smile },
  okay: { color: "text-amber-600 dark:text-amber-400", icon: Meh },
  low: { color: "text-orange-600 dark:text-orange-400", icon: Frown },
  stressed: { color: "text-red-600 dark:text-red-400", icon: Frown },
};

const PROGRAM_TYPES = [
  "fitness",
  "mental_health",
  "nutrition",
  "meditation",
  "yoga",
  "team_activity",
  "health_checkup",
  "other",
];

export default function WellnessDashboardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    program_type: "fitness",
    start_date: "",
    end_date: "",
    max_participants: "",
    points_reward: "0",
  });

  const { data: dashboard, isLoading, isError } = useQuery({
    queryKey: ["wellness-dashboard"],
    queryFn: () => api.get("/wellness/dashboard").then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/wellness/programs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness-dashboard"] });
      setShowCreate(false);
      setForm({
        title: "",
        description: "",
        program_type: "fitness",
        start_date: "",
        end_date: "",
        max_participants: "",
        points_reward: "0",
      });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      showToast("error", t("wellnessDashboard.toast.endBeforeStart"));
      return;
    }
    createMutation.mutate({
      title: form.title,
      description: form.description || null,
      program_type: form.program_type,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      max_participants: form.max_participants ? parseInt(form.max_participants) : null,
      points_reward: parseInt(form.points_reward) || 0,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t("wellnessDashboard.loading")}</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t("wellnessDashboard.error.load")}</div>
      </div>
    );
  }

  const d = dashboard || {};

  // Calculate mood bar widths
  const moodTotal = Object.values(d.mood_distribution || {}).reduce(
    (s: number, v: any) => s + Number(v),
    0
  ) as number;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("wellnessDashboard.header.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("wellnessDashboard.header.subtitle")}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> {t("wellnessDashboard.header.createProgram")}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/wellness" className="block text-left w-full bg-card rounded-lg border border-border p-5 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-md bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
              <Heart className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("wellnessDashboard.kpi.wellnessScore")}</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {d.wellness_score !== null
                  ? t("wellnessDashboard.kpi.wellnessScoreValue", { score: d.wellness_score })
                  : t("wellnessDashboard.kpi.valueEmpty")}
              </p>
            </div>
          </div>
        </Link>
        <Link to="/wellness" className="block text-left w-full bg-card rounded-lg border border-border p-5 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-md bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("wellnessDashboard.kpi.activePrograms")}</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{d.active_programs || 0}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("wellnessDashboard.kpi.totalPrograms", { count: d.total_programs || 0 })}</p>
        </Link>
        <Link to="/wellness" className="block text-left w-full bg-card rounded-lg border border-border p-5 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-md bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center">
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("wellnessDashboard.kpi.activeParticipants")}</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{d.active_participants || 0}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("wellnessDashboard.kpi.checkins30d", { count: d.checkin_count_30d || 0 })}</p>
        </Link>
        <Link to="/wellness" className="block text-left w-full bg-card rounded-lg border border-border p-5 transition-colors duration-150 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-md bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("wellnessDashboard.kpi.goalCompletion")}</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{t("wellnessDashboard.kpi.goalCompletionValue", { rate: d.goal_completion_rate || 0 })}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("wellnessDashboard.kpi.goalsProgress", { completed: d.completed_goals || 0, total: d.total_goals || 0 })}
          </p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mood Distribution */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-base font-semibold text-foreground mb-4">{t("wellnessDashboard.mood.title")}</h3>
          {moodTotal === 0 ? (
            <p className="text-sm text-muted-foreground">{t("wellnessDashboard.mood.noData")}</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(MOOD_CONFIG).map(([key, cfg]) => {
                const count = Number(d.mood_distribution?.[key] || 0);
                const pct = moodTotal > 0 ? Math.round((count / moodTotal) * 100) : 0;
                const Icon = cfg.icon;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${cfg.color}`} />
                    <span className="text-sm text-muted-foreground w-20">{t(`wellnessDashboard.mood.${key}`, { defaultValue: key })}</span>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground w-12 text-right">
                      {t("wellnessDashboard.mood.percent", { pct })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Avg Stats */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-base font-semibold text-foreground mb-4">{t("wellnessDashboard.metrics.title")}</h3>
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-md bg-yellow-100 dark:bg-yellow-950/40 flex items-center justify-center">
                <Zap className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("wellnessDashboard.metrics.avgEnergyLevel")}</p>
                <p className="text-xl font-semibold tabular-nums text-foreground">
                  {d.avg_energy_level !== null
                    ? t("wellnessDashboard.metrics.avgEnergyLevelValue", { value: d.avg_energy_level })
                    : t("wellnessDashboard.kpi.valueEmpty")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-md bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
                <Dumbbell className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("wellnessDashboard.metrics.avgExerciseMinutes")}</p>
                <p className="text-xl font-semibold tabular-nums text-foreground">
                  {d.avg_exercise_minutes !== null
                    ? t("wellnessDashboard.metrics.avgExerciseMinutesValue", { value: d.avg_exercise_minutes })
                    : t("wellnessDashboard.kpi.valueEmpty")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-md bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center">
                <Target className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("wellnessDashboard.metrics.totalEnrollments")}</p>
                <p className="text-xl font-semibold tabular-nums text-foreground">{d.total_enrollments || 0}</p>
                <p className="text-xs text-muted-foreground">{t("wellnessDashboard.metrics.completedEnrollments", { count: d.completed_enrollments || 0 })}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Programs */}
      {d.top_programs && d.top_programs.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t("wellnessDashboard.topPrograms.title")}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("wellnessDashboard.topPrograms.colProgram")}</th>
                  <th className="text-left py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("wellnessDashboard.topPrograms.colType")}</th>
                  <th className="text-right py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("wellnessDashboard.topPrograms.colEnrolled")}</th>
                  <th className="text-right py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("wellnessDashboard.topPrograms.colPoints")}</th>
                  <th className="text-center py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("wellnessDashboard.topPrograms.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {d.top_programs.map((p: any) => (
                  <tr key={p.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="py-2.5 font-medium text-foreground">
                      <Link to="/wellness" className="text-brand-600 dark:text-brand-400 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500 rounded">
                        {p.title}
                      </Link>
                    </td>
                    <td className="py-2.5 text-muted-foreground">{t(`wellnessDashboard.programType.${p.program_type}`, { defaultValue: p.program_type })}</td>
                    <td className="py-2.5 text-right text-muted-foreground">
                      {p.max_participants
                        ? t("wellnessDashboard.topPrograms.enrolledOfMax", { enrolled: p.enrolled_count, max: p.max_participants })
                        : p.enrolled_count}
                    </td>
                    <td className="py-2.5 text-right text-amber-600 dark:text-amber-400 font-medium">
                      {p.points_reward > 0
                        ? t("wellnessDashboard.topPrograms.pointsReward", { points: p.points_reward })
                        : t("wellnessDashboard.topPrograms.pointsEmpty")}
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                          p.is_active
                            ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.is_active ? t("wellnessDashboard.status.active") : t("wellnessDashboard.status.inactive")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Program Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreate(false)} />
          <div className="relative bg-card rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{t("wellnessDashboard.modal.title")}</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("wellnessDashboard.modal.fieldTitle")}</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                  placeholder={t("wellnessDashboard.modal.titlePlaceholder")}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("wellnessDashboard.modal.fieldDescription")}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                  placeholder={t("wellnessDashboard.modal.descriptionPlaceholder")}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("wellnessDashboard.modal.fieldType")}</label>
                  <select
                    value={form.program_type}
                    onChange={(e) => setForm({ ...form, program_type: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-card"
                  >
                    {PROGRAM_TYPES.map((pt) => (
                      <option key={pt} value={pt}>
                        {t(`wellnessDashboard.programType.${pt}`, { defaultValue: pt })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("wellnessDashboard.modal.fieldMaxParticipants")}</label>
                  <input
                    type="number"
                    value={form.max_participants}
                    onChange={(e) => setForm({ ...form, max_participants: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                    placeholder={t("wellnessDashboard.modal.maxParticipantsPlaceholder")}
                    min="1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("wellnessDashboard.modal.fieldStartDate")}</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("wellnessDashboard.modal.fieldEndDate")}</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    min={form.start_date || undefined}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("wellnessDashboard.modal.fieldPointsReward")}</label>
                <input
                  type="number"
                  value={form.points_reward}
                  onChange={(e) => setForm({ ...form, points_reward: e.target.value })}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                  min="0"
                />
              </div>
              {createMutation.isError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {(createMutation.error as any)?.response?.data?.error?.message || t("wellnessDashboard.error.createProgram")}
                </p>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-md text-[13px]"
                >
                  {t("wellnessDashboard.modal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium disabled:opacity-50"
                >
                  {createMutation.isPending ? t("wellnessDashboard.modal.submitting") : t("wellnessDashboard.modal.submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
