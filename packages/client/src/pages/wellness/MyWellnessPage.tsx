import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { Link } from "react-router-dom";
import {
  Heart,
  Flame,
  Zap,
  Moon,
  Dumbbell,
  Target,
  Trophy,
  Plus,
  X,
  CheckCircle,
  ArrowUpRight,
} from "lucide-react";
import { showToast } from "@/components/ui/Toast";
import { useTranslation } from "react-i18next";

const MOOD_EMOJI: Record<string, string> = {
  great: "😄",
  good: "🙂",
  okay: "😐",
  low: "😔",
  stressed: "😰",
};

const MOOD_COLOR: Record<string, string> = {
  great: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900/50",
  good: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50",
  okay: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50",
  low: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900/50",
  stressed: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50",
};

const GOAL_TYPES = [
  { value: "steps", label: "Steps", unit: "steps" },
  { value: "exercise", label: "Exercise", unit: "minutes" },
  { value: "meditation", label: "Meditation", unit: "minutes" },
  { value: "water", label: "Water Intake", unit: "glasses" },
  { value: "sleep", label: "Sleep", unit: "hours" },
  { value: "custom", label: "Custom", unit: "" },
];

export default function MyWellnessPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showGoalForm, setShowGoalForm] = useState(false);
  // #1458 — filter tab for enrolled programs: active (default) vs completed.
  const [programsTab, setProgramsTab] = useState<"active" | "completed">("active");
  // Update-progress modal — replaces the native window.prompt() that was used
  // to collect the increment to add to a goal. `progressTarget` holds the goal
  // being updated; `progressInput` is the textbox value.
  const [progressTarget, setProgressTarget] = useState<{ id: number; current_value: number; unit: string } | null>(null);
  const [progressInput, setProgressInput] = useState("");
  const [goalForm, setGoalForm] = useState({
    title: "",
    goal_type: "exercise",
    target_value: "",
    unit: "minutes",
    frequency: "daily",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
  });

  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ["wellness-summary"],
    queryFn: () => api.get("/wellness/summary").then((r) => r.data.data),
  });

  const { data: goalsData } = useQuery({
    queryKey: ["wellness-goals"],
    queryFn: () => api.get("/wellness/goals").then((r) => r.data.data),
  });

  const { data: checkInsData } = useQuery({
    queryKey: ["wellness-checkins"],
    queryFn: () => api.get("/wellness/check-ins", { params: { per_page: 14 } }).then((r) => r.data),
  });

  const createGoalMutation = useMutation({
    mutationFn: (data: any) => api.post("/wellness/goals", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness-goals"] });
      queryClient.invalidateQueries({ queryKey: ["wellness-summary"] });
      setShowGoalForm(false);
      setGoalForm({
        title: "",
        goal_type: "exercise",
        target_value: "",
        unit: "minutes",
        frequency: "daily",
        start_date: new Date().toISOString().split("T")[0],
        end_date: "",
      });
      showToast("success", t("myWellness.goalModal.createSuccess"));
    },
    onError: (err: any) => {
      showToast(
        "error",
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          t("myWellness.goalModal.errorCreateFailed"),
      );
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.put(`/wellness/goals/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness-goals"] });
      queryClient.invalidateQueries({ queryKey: ["wellness-summary"] });
      setProgressTarget(null);
      setProgressInput("");
    },
  });

  const completeProgramMutation = useMutation({
    mutationFn: (programId: number) =>
      api.post(`/wellness/programs/${programId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness-summary"] });
    },
  });

  const confirmProgress = () => {
    if (!progressTarget) return;
    const increment = parseInt(progressInput);
    if (isNaN(increment)) return;
    updateGoalMutation.mutate({
      id: progressTarget.id,
      data: { current_value: progressTarget.current_value + increment },
    });
  };

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (goalForm.start_date && goalForm.end_date && goalForm.end_date < goalForm.start_date) {
      showToast("error", t("myWellness.goalModal.errorEndBeforeStart"));
      return;
    }
    createGoalMutation.mutate({
      title: goalForm.title,
      goal_type: goalForm.goal_type,
      target_value: parseInt(goalForm.target_value),
      unit: goalForm.unit,
      frequency: goalForm.frequency,
      start_date: goalForm.start_date,
      end_date: goalForm.end_date || null,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("myWellness.header.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("myWellness.header.subtitle")}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4 text-center animate-pulse">
              <div className="h-6 w-6 bg-muted rounded mx-auto mb-2" />
              <div className="h-7 w-10 bg-muted rounded mx-auto mb-1" />
              <div className="h-3 w-16 bg-muted rounded mx-auto" />
            </div>
          ))}
        </div>
        <div className="bg-card rounded-lg border border-border p-4 animate-pulse">
          <div className="h-5 w-32 bg-muted rounded mb-4" />
          <div className="h-4 w-full bg-muted rounded mb-2" />
          <div className="h-4 w-3/4 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("myWellness.header.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("myWellness.header.subtitle")}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <p className="text-muted-foreground">{t("myWellness.error.loadFailed")}</p>
        </div>
      </div>
    );
  }

  const s = summary || {};
  const goals = goalsData || [];
  const checkIns = checkInsData?.data || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("myWellness.header.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("myWellness.header.subtitle")}</p>
        </div>
        <Link
          to="/wellness/check-in"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          {t("myWellness.header.dailyCheckIn")}
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <Flame className="h-6 w-6 text-orange-500 mx-auto mb-1" />
          <p className="text-2xl font-semibold tabular-nums text-foreground">{s.checkin_streak || 0}</p>
          <p className="text-xs text-muted-foreground">{t("myWellness.stats.dayStreak")}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <Heart className="h-6 w-6 text-red-500 mx-auto mb-1" />
          <p className="text-2xl font-semibold tabular-nums text-foreground">{s.total_checkins || 0}</p>
          <p className="text-xs text-muted-foreground">{t("myWellness.stats.totalCheckIns")}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <Zap className="h-6 w-6 text-yellow-500 mx-auto mb-1" />
          <p className="text-2xl font-semibold tabular-nums text-foreground">{s.avg_energy_level || "---"}</p>
          <p className="text-xs text-muted-foreground">{t("myWellness.stats.avgEnergy")}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <Trophy className="h-6 w-6 text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-semibold tabular-nums text-foreground">{s.completed_goals_count || 0}</p>
          <p className="text-xs text-muted-foreground">{t("myWellness.stats.goalsDone")}</p>
        </div>
      </div>

      {/* Mood Trend */}
      {s.mood_trend && s.mood_trend.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-base font-semibold text-foreground mb-4">{t("myWellness.moodTrend.title")}</h3>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[...s.mood_trend].reverse().map((day: any, idx: number) => (
              <div
                key={idx}
                className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-lg border ${
                  MOOD_COLOR[day.mood] || "bg-muted"
                }`}
                style={{ minWidth: "64px" }}
              >
                <span className="text-2xl">{MOOD_EMOJI[day.mood] || "?"}</span>
                <span className="text-xs font-medium capitalize">{t(`myWellness.mood.${day.mood}`, { defaultValue: day.mood })}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(day.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Zap className="h-3 w-3" /> {day.energy_level}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Goals */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("myWellness.goals.title")}</h3>
          <button
            onClick={() => setShowGoalForm(true)}
            className="flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium"
          >
            <Plus className="h-4 w-4" /> {t("myWellness.goals.addGoal")}
          </button>
        </div>

        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("myWellness.goals.empty")}
          </p>
        ) : (
          <div className="space-y-4">
            {goals.map((goal: any) => {
              const progress =
                goal.target_value > 0
                  ? Math.min(Math.round((goal.current_value / goal.target_value) * 100), 100)
                  : 0;
              return (
                <div key={goal.id} className="border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-brand-500" />
                      <span className="font-medium text-foreground">{goal.title}</span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md ${
                          goal.status === "completed"
                            ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                            : goal.status === "abandoned"
                            ? "bg-muted text-muted-foreground"
                            : "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                        }`}
                      >
                        {t(`myWellness.goalStatus.${goal.status}`, { defaultValue: goal.status })}
                      </span>
                    </div>
                    {goal.status === "active" && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setProgressInput("");
                            setProgressTarget({ id: goal.id, current_value: goal.current_value, unit: goal.unit });
                          }}
                          className="text-xs px-2 py-1 bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 rounded hover:bg-brand-100 dark:hover:bg-brand-950/40"
                        >
                          <ArrowUpRight className="h-3 w-3 inline mr-1" />
                          {t("myWellness.goals.update")}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          goal.status === "completed" ? "bg-green-500" : "bg-brand-500"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground w-32 text-right">
                      {goal.current_value} / {goal.target_value} {goal.unit}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="capitalize">{t(`myWellness.goalFrequency.${goal.frequency}`, { defaultValue: goal.frequency })}</span>
                    <span>{t(`myWellness.goalType.${goal.goal_type}`, { defaultValue: goal.goal_type.replace("_", " ") })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Enrolled Programs */}
      {s.enrolled_programs && s.enrolled_programs.length > 0 && (() => {
        // #1458 — split programs into active vs completed and render a tab to
        // flip between them. Active is the default so this stays backward
        // compatible with the previous single-list view.
        const enrolled: any[] = s.enrolled_programs;
        const completedCount = enrolled.filter((ep) => ep.enrollment_status === "completed").length;
        const activeCount = enrolled.length - completedCount;
        const visiblePrograms = enrolled.filter((ep) =>
          programsTab === "completed"
            ? ep.enrollment_status === "completed"
            : ep.enrollment_status !== "completed"
        );
        return (
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("myWellness.programs.title")}</h3>
            <div className="flex gap-1 bg-muted rounded-md p-1">
              <button
                onClick={() => setProgramsTab("active")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  programsTab === "active"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("myWellness.programs.tabActive", { count: activeCount })}
              </button>
              <button
                onClick={() => setProgramsTab("completed")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  programsTab === "completed"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("myWellness.programs.tabCompleted", { count: completedCount })}
              </button>
            </div>
          </div>
          {visiblePrograms.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {programsTab === "completed"
                ? t("myWellness.programs.emptyCompleted")
                : t("myWellness.programs.emptyActive")}
            </p>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visiblePrograms.map((ep: any) => (
              <div key={ep.enrollment_id} className="border border-border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-medium text-foreground">{ep.title}</h4>
                    <p className="text-xs text-muted-foreground capitalize">
                      {t(`wellnessDashboard.programType.${ep.program_type}`, {
                        defaultValue: ep.program_type.replace("_", " "),
                      })}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-md ${
                      ep.enrollment_status === "completed"
                        ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                        : "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                    }`}
                  >
                    {t(`myWellness.programStatus.${ep.enrollment_status}`, { defaultValue: ep.enrollment_status })}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full"
                      style={{ width: `${ep.progress_percentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{ep.progress_percentage}%</span>
                </div>
                {ep.enrollment_status !== "completed" && (
                  <button
                    onClick={() => completeProgramMutation.mutate(ep.program_id)}
                    disabled={completeProgramMutation.isPending}
                    className="mt-3 flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 font-medium"
                  >
                    <CheckCircle className="h-3 w-3" /> {t("myWellness.programs.markComplete")}
                  </button>
                )}
                {ep.points_reward > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{t("myWellness.programs.pointsReward", { points: ep.points_reward })}</p>
                )}
              </div>
            ))}
          </div>
          )}
        </div>
        );
      })()}

      {/* Recent Check-ins */}
      {checkIns.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t("myWellness.checkIns.title")}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("myWellness.checkIns.colDate")}</th>
                  <th className="text-center py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("myWellness.checkIns.colMood")}</th>
                  <th className="text-center py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("myWellness.checkIns.colEnergy")}</th>
                  <th className="text-center py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("myWellness.checkIns.colSleep")}</th>
                  <th className="text-center py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("myWellness.checkIns.colExercise")}</th>
                </tr>
              </thead>
              <tbody>
                {checkIns.map((ci: any) => (
                  <tr key={ci.id} className="border-b border-border">
                    <td className="py-2 text-muted-foreground">
                      {new Date(ci.check_in_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-2 text-center">
                      <span className="text-lg">{MOOD_EMOJI[ci.mood]}</span>
                    </td>
                    <td className="py-2 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Zap
                            key={n}
                            className={`h-3 w-3 ${
                              n <= ci.energy_level ? "text-yellow-500" : "text-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-center text-muted-foreground">
                      {ci.sleep_hours ? (
                        <span className="flex items-center justify-center gap-1">
                          <Moon className="h-3 w-3" /> {ci.sleep_hours}h
                        </span>
                      ) : (
                        "---"
                      )}
                    </td>
                    <td className="py-2 text-center text-muted-foreground">
                      {ci.exercise_minutes > 0 ? (
                        <span className="flex items-center justify-center gap-1">
                          <Dumbbell className="h-3 w-3" /> {ci.exercise_minutes}m
                        </span>
                      ) : (
                        "---"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Goal Modal */}
      {showGoalForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowGoalForm(false)} />
          <div className="relative bg-card rounded-lg shadow-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{t("myWellness.goalModal.title")}</h2>
              <button onClick={() => setShowGoalForm(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("myWellness.goalModal.labelTitle")}</label>
                <input
                  type="text"
                  value={goalForm.title}
                  onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                  required
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                  placeholder={t("myWellness.goalModal.placeholderTitle")}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("myWellness.goalModal.labelGoalType")}</label>
                  <select
                    value={goalForm.goal_type}
                    onChange={(e) => {
                      const gt = GOAL_TYPES.find((g) => g.value === e.target.value);
                      setGoalForm({
                        ...goalForm,
                        goal_type: e.target.value,
                        unit: gt?.unit || goalForm.unit,
                      });
                    }}
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-card"
                  >
                    {GOAL_TYPES.map((gt) => (
                      <option key={gt.value} value={gt.value}>
                        {t(`myWellness.goalType.${gt.value}`, { defaultValue: gt.label })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("myWellness.goalModal.labelFrequency")}</label>
                  <select
                    value={goalForm.frequency}
                    onChange={(e) => setGoalForm({ ...goalForm, frequency: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-card"
                  >
                    <option value="daily">{t("myWellness.goalFrequency.daily")}</option>
                    <option value="weekly">{t("myWellness.goalFrequency.weekly")}</option>
                    <option value="monthly">{t("myWellness.goalFrequency.monthly")}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("myWellness.goalModal.labelTargetValue")}</label>
                  <input
                    type="number"
                    value={goalForm.target_value}
                    onChange={(e) => setGoalForm({ ...goalForm, target_value: e.target.value })}
                    required
                    min="1"
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                    placeholder={t("myWellness.goalModal.placeholderTargetValue")}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("myWellness.goalModal.labelUnit")}</label>
                  <input
                    type="text"
                    value={goalForm.unit}
                    onChange={(e) => setGoalForm({ ...goalForm, unit: e.target.value })}
                    required
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                    placeholder={t("myWellness.goalModal.placeholderUnit")}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("myWellness.goalModal.labelStartDate")}</label>
                  <input
                    type="date"
                    value={goalForm.start_date}
                    onChange={(e) => setGoalForm({ ...goalForm, start_date: e.target.value })}
                    required
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("myWellness.goalModal.labelEndDate")}</label>
                  <input
                    type="date"
                    value={goalForm.end_date}
                    onChange={(e) => setGoalForm({ ...goalForm, end_date: e.target.value })}
                    min={goalForm.start_date || undefined}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-md text-[13px]"
                  />
                </div>
              </div>
              {createGoalMutation.isError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {(createGoalMutation.error as any)?.response?.data?.error?.message || t("myWellness.goalModal.errorCreateFailed")}
                </p>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGoalForm(false)}
                  className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-md text-[13px]"
                >
                  {t("myWellness.goalModal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createGoalMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium disabled:opacity-50"
                >
                  {createGoalMutation.isPending ? t("myWellness.goalModal.creating") : t("myWellness.goalModal.submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update-progress modal — replaces the native window.prompt() for
          collecting the increment to add to a goal. Styled to match the rest
          of the UI, with a number input, a Cancel, and a Confirm that fires
          the update. */}
      {progressTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              {t("myWellness.progressModal.title")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("myWellness.progressModal.prompt", { current: progressTarget.current_value, unit: progressTarget.unit })}
            </p>
            <input
              autoFocus
              type="number"
              value={progressInput}
              onChange={(e) => setProgressInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmProgress(); }}
              placeholder={t("myWellness.progressModal.placeholder", { unit: progressTarget.unit })}
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-card text-foreground"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setProgressTarget(null); setProgressInput(""); }}
                disabled={updateGoalMutation.isPending}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                {t("myWellness.progressModal.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmProgress}
                disabled={updateGoalMutation.isPending || !progressInput.trim()}
                className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {updateGoalMutation.isPending ? t("myWellness.progressModal.saving") : t("myWellness.progressModal.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
