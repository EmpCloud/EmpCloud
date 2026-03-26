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

const MOOD_EMOJI: Record<string, string> = {
  great: "😄",
  good: "🙂",
  okay: "😐",
  low: "😔",
  stressed: "😰",
};

const MOOD_COLOR: Record<string, string> = {
  great: "bg-green-100 text-green-700 border-green-200",
  good: "bg-blue-100 text-blue-700 border-blue-200",
  okay: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-orange-100 text-orange-700 border-orange-200",
  stressed: "bg-red-100 text-red-700 border-red-200",
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
  const queryClient = useQueryClient();
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: "",
    goal_type: "exercise",
    target_value: "",
    unit: "minutes",
    frequency: "daily",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
  });

  const { data: summary, isLoading } = useQuery({
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
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.put(`/wellness/goals/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness-goals"] });
      queryClient.invalidateQueries({ queryKey: ["wellness-summary"] });
    },
  });

  const completeProgramMutation = useMutation({
    mutationFn: (programId: number) =>
      api.post(`/wellness/programs/${programId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness-summary"] });
    },
  });

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (goalForm.start_date && goalForm.end_date && goalForm.end_date < goalForm.start_date) {
      alert("End date cannot be before the start date.");
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
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Wellness</h1>
          <p className="text-gray-500 mt-1">Track your health journey and personal goals</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 text-center animate-pulse">
              <div className="h-6 w-6 bg-gray-200 rounded mx-auto mb-2" />
              <div className="h-7 w-10 bg-gray-200 rounded mx-auto mb-1" />
              <div className="h-3 w-16 bg-gray-200 rounded mx-auto" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
          <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
          <div className="h-4 w-full bg-gray-200 rounded mb-2" />
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const s = summary || {};
  const goals = goalsData || [];
  const checkIns = checkInsData?.data || [];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Wellness</h1>
          <p className="text-gray-500 mt-1">Track your health journey and personal goals</p>
        </div>
        <Link
          to="/wellness/check-in"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          Daily Check-in
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <Flame className="h-6 w-6 text-orange-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{s.checkin_streak || 0}</p>
          <p className="text-xs text-gray-500">Day Streak</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <Heart className="h-6 w-6 text-red-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{s.total_checkins || 0}</p>
          <p className="text-xs text-gray-500">Total Check-ins</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <Zap className="h-6 w-6 text-yellow-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{s.avg_energy_level || "---"}</p>
          <p className="text-xs text-gray-500">Avg Energy</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <Trophy className="h-6 w-6 text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{s.completed_goals_count || 0}</p>
          <p className="text-xs text-gray-500">Goals Done</p>
        </div>
      </div>

      {/* Mood Trend */}
      {s.mood_trend && s.mood_trend.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Mood Trend (Last 14 Days)</h3>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[...s.mood_trend].reverse().map((day: any, idx: number) => (
              <div
                key={idx}
                className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-lg border ${
                  MOOD_COLOR[day.mood] || "bg-gray-50"
                }`}
                style={{ minWidth: "64px" }}
              >
                <span className="text-2xl">{MOOD_EMOJI[day.mood] || "?"}</span>
                <span className="text-xs font-medium capitalize">{day.mood}</span>
                <span className="text-xs text-gray-500">
                  {new Date(day.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Zap className="h-3 w-3" /> {day.energy_level}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Goals */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">My Goals</h3>
          <button
            onClick={() => setShowGoalForm(true)}
            className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            <Plus className="h-4 w-4" /> Add Goal
          </button>
        </div>

        {goals.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No goals yet. Create your first wellness goal!
          </p>
        ) : (
          <div className="space-y-4">
            {goals.map((goal: any) => {
              const progress =
                goal.target_value > 0
                  ? Math.min(Math.round((goal.current_value / goal.target_value) * 100), 100)
                  : 0;
              return (
                <div key={goal.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-brand-500" />
                      <span className="font-medium text-gray-900">{goal.title}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          goal.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : goal.status === "abandoned"
                            ? "bg-gray-100 text-gray-500"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {goal.status}
                      </span>
                    </div>
                    {goal.status === "active" && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            const increment = prompt(
                              `Add progress (current: ${goal.current_value} ${goal.unit}):`
                            );
                            if (increment) {
                              const newVal = goal.current_value + parseInt(increment);
                              updateGoalMutation.mutate({
                                id: goal.id,
                                data: { current_value: newVal },
                              });
                            }
                          }}
                          className="text-xs px-2 py-1 bg-brand-50 text-brand-600 rounded hover:bg-brand-100"
                        >
                          <ArrowUpRight className="h-3 w-3 inline mr-1" />
                          Update
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          goal.status === "completed" ? "bg-green-500" : "bg-brand-500"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-600 w-32 text-right">
                      {goal.current_value} / {goal.target_value} {goal.unit}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span className="capitalize">{goal.frequency}</span>
                    <span>{goal.goal_type.replace("_", " ")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Enrolled Programs */}
      {s.enrolled_programs && s.enrolled_programs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">My Programs</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {s.enrolled_programs.map((ep: any) => (
              <div key={ep.enrollment_id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-medium text-gray-900">{ep.title}</h4>
                    <p className="text-xs text-gray-500 capitalize">
                      {ep.program_type.replace("_", " ")}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      ep.enrollment_status === "completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {ep.enrollment_status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full"
                      style={{ width: `${ep.progress_percentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{ep.progress_percentage}%</span>
                </div>
                {ep.enrollment_status !== "completed" && (
                  <button
                    onClick={() => completeProgramMutation.mutate(ep.program_id)}
                    disabled={completeProgramMutation.isPending}
                    className="mt-3 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    <CheckCircle className="h-3 w-3" /> Mark Complete
                  </button>
                )}
                {ep.points_reward > 0 && (
                  <p className="text-xs text-amber-600 mt-1">+{ep.points_reward} points on completion</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Check-ins */}
      {checkIns.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Check-ins</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                  <th className="text-center py-2 text-gray-500 font-medium">Mood</th>
                  <th className="text-center py-2 text-gray-500 font-medium">Energy</th>
                  <th className="text-center py-2 text-gray-500 font-medium">Sleep</th>
                  <th className="text-center py-2 text-gray-500 font-medium">Exercise</th>
                </tr>
              </thead>
              <tbody>
                {checkIns.map((ci: any) => (
                  <tr key={ci.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">
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
                              n <= ci.energy_level ? "text-yellow-500" : "text-gray-200"
                            }`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-center text-gray-600">
                      {ci.sleep_hours ? (
                        <span className="flex items-center justify-center gap-1">
                          <Moon className="h-3 w-3" /> {ci.sleep_hours}h
                        </span>
                      ) : (
                        "---"
                      )}
                    </td>
                    <td className="py-2 text-center text-gray-600">
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
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Create Wellness Goal</h2>
              <button onClick={() => setShowGoalForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={goalForm.title}
                  onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g., Walk 10,000 steps daily"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Goal Type</label>
                  <select
                    value={goalForm.goal_type}
                    onChange={(e) => {
                      const t = GOAL_TYPES.find((g) => g.value === e.target.value);
                      setGoalForm({
                        ...goalForm,
                        goal_type: e.target.value,
                        unit: t?.unit || goalForm.unit,
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    {GOAL_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                  <select
                    value={goalForm.frequency}
                    onChange={(e) => setGoalForm({ ...goalForm, frequency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Value *</label>
                  <input
                    type="number"
                    value={goalForm.target_value}
                    onChange={(e) => setGoalForm({ ...goalForm, target_value: e.target.value })}
                    required
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="e.g., 10000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                  <input
                    type="text"
                    value={goalForm.unit}
                    onChange={(e) => setGoalForm({ ...goalForm, unit: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="e.g., steps, minutes"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    value={goalForm.start_date}
                    onChange={(e) => setGoalForm({ ...goalForm, start_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={goalForm.end_date}
                    onChange={(e) => setGoalForm({ ...goalForm, end_date: e.target.value })}
                    min={goalForm.start_date || undefined}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              {createGoalMutation.isError && (
                <p className="text-sm text-red-600">
                  {(createGoalMutation.error as any)?.response?.data?.error?.message || "Failed to create goal"}
                </p>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGoalForm(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createGoalMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium disabled:opacity-50"
                >
                  {createGoalMutation.isPending ? "Creating..." : "Create Goal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
