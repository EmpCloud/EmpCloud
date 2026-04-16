import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useNavigate } from "react-router-dom";
import {
  Heart,
  Zap,
  Moon,
  Dumbbell,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";

const todayISO = () => new Date().toISOString().split("T")[0];

const MOODS = [
  { value: "great", emoji: "😄", label: "Great", color: "border-green-400 bg-green-50 hover:bg-green-100" },
  { value: "good", emoji: "🙂", label: "Good", color: "border-blue-400 bg-blue-50 hover:bg-blue-100" },
  { value: "okay", emoji: "😐", label: "Okay", color: "border-amber-400 bg-amber-50 hover:bg-amber-100" },
  { value: "low", emoji: "😔", label: "Low", color: "border-orange-400 bg-orange-50 hover:bg-orange-100" },
  { value: "stressed", emoji: "😰", label: "Stressed", color: "border-red-400 bg-red-50 hover:bg-red-100" },
];

export default function DailyCheckInPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    mood: "",
    energy_level: 3,
    sleep_hours: "",
    exercise_minutes: "",
    notes: "",
  });

  // #1456 — Detect if the user already checked in today so we can disable the form.
  const today = todayISO();
  const { data: todayCheckInsData, isLoading: loadingToday } = useQuery({
    queryKey: ["wellness-checkins-today", today],
    queryFn: () =>
      api
        .get("/wellness/check-ins", {
          params: { start_date: today, end_date: today, per_page: 1 },
        })
        .then((r) => r.data),
  });
  const todaysCheckIn = (todayCheckInsData?.data || [])[0] || null;
  const alreadyCheckedIn = !!todaysCheckIn;

  const mutation = useMutation({
    mutationFn: (data: any) => api.post("/wellness/check-in", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness-summary"] });
      queryClient.invalidateQueries({ queryKey: ["wellness-checkins"] });
      queryClient.invalidateQueries({ queryKey: ["wellness-checkins-today"] });
      setSubmitted(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.mood) return;

    mutation.mutate({
      mood: form.mood,
      energy_level: form.energy_level,
      sleep_hours: form.sleep_hours ? parseFloat(form.sleep_hours) : null,
      exercise_minutes: form.exercise_minutes ? parseInt(form.exercise_minutes) : 0,
      notes: form.notes || null,
    });
  };

  if (submitted || alreadyCheckedIn) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {submitted ? "Check-in Complete!" : "You've checked in today"}
          </h2>
          <p className="text-gray-500 mb-6">
            {submitted
              ? "Great job taking a moment to check in with yourself today."
              : "You can submit your next check-in tomorrow."}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate("/wellness/my")}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium"
            >
              View My Wellness
            </button>
            <button
              onClick={() => navigate("/wellness")}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
            >
              Explore Programs
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadingToday) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Check-in</h1>
          <p className="text-gray-500 text-sm">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Mood Picker */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="h-5 w-5 text-pink-500" />
            <h3 className="text-lg font-semibold text-gray-900">How are you feeling today?</h3>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setForm({ ...form, mood: m.value })}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  form.mood === m.value
                    ? `${m.color} border-opacity-100 ring-2 ring-offset-2 ring-brand-500`
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="text-3xl">{m.emoji}</span>
                <span className="text-xs font-medium text-gray-600">{m.label}</span>
              </button>
            ))}
          </div>
          {!form.mood && mutation.isError && (
            <p className="text-sm text-red-500 mt-2">Please select your mood</p>
          )}
        </div>

        {/* Energy Level */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900">Energy Level</h3>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 w-8">Low</span>
            <div className="flex-1 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setForm({ ...form, energy_level: level })}
                  className={`flex-1 h-12 rounded-lg flex items-center justify-center text-lg font-bold transition-all ${
                    form.energy_level >= level
                      ? "bg-yellow-400 text-yellow-900"
                      : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <span className="text-sm text-gray-500 w-8">High</span>
          </div>
        </div>

        {/* Sleep & Exercise */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Moon className="h-5 w-5 text-indigo-500" />
                <label className="text-sm font-semibold text-gray-900">Sleep (hours)</label>
              </div>
              <input
                type="number"
                value={form.sleep_hours}
                onChange={(e) => setForm({ ...form, sleep_hours: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="e.g., 7.5"
                step="0.5"
                min="0"
                max="24"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Dumbbell className="h-5 w-5 text-green-500" />
                <label className="text-sm font-semibold text-gray-900">Exercise (minutes)</label>
              </div>
              <input
                type="number"
                value={form.exercise_minutes}
                onChange={(e) => setForm({ ...form, exercise_minutes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="e.g., 30"
                min="0"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            Notes (optional)
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="How was your day? Anything on your mind?"
          />
        </div>

        {/* Error */}
        {mutation.isError && (
          <p className="text-sm text-red-600 text-center">
            {(mutation.error as any)?.response?.data?.error?.message || "Check-in failed. Please try again."}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!form.mood || mutation.isPending}
          className="w-full py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm font-semibold disabled:opacity-50"
        >
          {mutation.isPending ? "Submitting..." : "Submit Check-in"}
        </button>
      </form>
    </div>
  );
}
