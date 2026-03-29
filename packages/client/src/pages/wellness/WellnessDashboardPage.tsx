import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

const MOOD_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  great: { label: "Great", color: "text-green-600", icon: Smile },
  good: { label: "Good", color: "text-blue-600", icon: Smile },
  okay: { label: "Okay", color: "text-amber-600", icon: Meh },
  low: { label: "Low", color: "text-orange-600", icon: Frown },
  stressed: { label: "Stressed", color: "text-red-600", icon: Frown },
};

const PROGRAM_TYPES = [
  { value: "fitness", label: "Fitness" },
  { value: "mental_health", label: "Mental Health" },
  { value: "nutrition", label: "Nutrition" },
  { value: "meditation", label: "Meditation" },
  { value: "yoga", label: "Yoga" },
  { value: "team_activity", label: "Team Activity" },
  { value: "health_checkup", label: "Health Checkup" },
  { value: "other", label: "Other" },
];

export default function WellnessDashboardPage() {
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
      alert("End date cannot be before the start date.");
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
        <div className="text-gray-400">Loading wellness dashboard...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Failed to load wellness dashboard. Please try again later.</div>
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
          <h1 className="text-2xl font-bold text-gray-900">Wellness Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Organization-wide wellness metrics and program management
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Create Program
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Heart className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Wellness Score</p>
              <p className="text-2xl font-bold text-gray-900">
                {d.wellness_score !== null ? `${d.wellness_score}/100` : "---"}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Programs</p>
              <p className="text-2xl font-bold text-gray-900">{d.active_programs || 0}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">{d.total_programs || 0} total programs</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Participants</p>
              <p className="text-2xl font-bold text-gray-900">{d.active_participants || 0}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">{d.checkin_count_30d || 0} check-ins (30d)</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Goal Completion</p>
              <p className="text-2xl font-bold text-gray-900">{d.goal_completion_rate || 0}%</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            {d.completed_goals || 0} / {d.total_goals || 0} goals
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mood Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Mood Distribution (30 days)</h3>
          {moodTotal === 0 ? (
            <p className="text-sm text-gray-400">No check-in data yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(MOOD_CONFIG).map(([key, cfg]) => {
                const count = Number(d.mood_distribution?.[key] || 0);
                const pct = moodTotal > 0 ? Math.round((count / moodTotal) * 100) : 0;
                const Icon = cfg.icon;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${cfg.color}`} />
                    <span className="text-sm text-gray-600 w-20">{cfg.label}</span>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-12 text-right">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Avg Stats */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Average Metrics (30 days)</h3>
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Zap className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Avg Energy Level</p>
                <p className="text-xl font-bold text-gray-900">
                  {d.avg_energy_level !== null ? `${d.avg_energy_level} / 5` : "---"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
                <Dumbbell className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Avg Exercise Minutes</p>
                <p className="text-xl font-bold text-gray-900">
                  {d.avg_exercise_minutes !== null ? `${d.avg_exercise_minutes} min` : "---"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Target className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Enrollments</p>
                <p className="text-xl font-bold text-gray-900">{d.total_enrollments || 0}</p>
                <p className="text-xs text-gray-400">{d.completed_enrollments || 0} completed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Programs */}
      {d.top_programs && d.top_programs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Programs by Enrollment</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">Program</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Type</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Enrolled</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Points</th>
                  <th className="text-center py-2 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.top_programs.map((p: any) => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="py-3 font-medium text-gray-900">{p.title}</td>
                    <td className="py-3 text-gray-600 capitalize">{p.program_type.replace("_", " ")}</td>
                    <td className="py-3 text-right text-gray-700">
                      {p.enrolled_count}
                      {p.max_participants ? ` / ${p.max_participants}` : ""}
                    </td>
                    <td className="py-3 text-right text-amber-600 font-medium">
                      {p.points_reward > 0 ? `+${p.points_reward}` : "---"}
                    </td>
                    <td className="py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {p.is_active ? "Active" : "Inactive"}
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
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Create Wellness Program</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g., 30-Day Yoga Challenge"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Program description..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={form.program_type}
                    onChange={(e) => setForm({ ...form, program_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    {PROGRAM_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Participants</label>
                  <input
                    type="number"
                    value={form.max_participants}
                    onChange={(e) => setForm({ ...form, max_participants: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="Unlimited"
                    min="1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    min={form.start_date || undefined}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Points Reward</label>
                <input
                  type="number"
                  value={form.points_reward}
                  onChange={(e) => setForm({ ...form, points_reward: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  min="0"
                />
              </div>
              {createMutation.isError && (
                <p className="text-sm text-red-600">
                  {(createMutation.error as any)?.response?.data?.error?.message || "Failed to create program"}
                </p>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium disabled:opacity-50"
                >
                  {createMutation.isPending ? "Creating..." : "Create Program"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
